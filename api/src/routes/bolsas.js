'use strict';
/* =====================================================================
 *  /api/bolsas — Descontos e bolsas   [módulo bolsas]
 *
 *  GET    /         lista + resumo
 *  POST   /         cria
 *  PUT    /:id      edita (o aluno não muda)
 *  DELETE /:id      exclui
 *
 *  Toda alteração recalcula as mensalidades PENDENTES do aluno.
 *  Pagas e canceladas não mudam.
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm, transacao } = require('../db');
const { exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade } = require('../utils/auditoria');
const { hojeSP, dataValida } = require('../utils/datas');
const f = require('../services/financeiro');

router.use(exigirModulo('bolsas'));

function lerBolsa(b) {
  const ini = b.vigenciaInicio ? String(b.vigenciaInicio) : null;
  const fim = b.vigenciaFim ? String(b.vigenciaFim) : null;
  if (ini && !dataValida(ini)) throw new HttpErro(400, 'Início da vigência inválido', 'validacao');
  if (fim && !dataValida(fim)) throw new HttpErro(400, 'Fim da vigência inválido', 'validacao');
  if (ini && fim && fim < ini) throw new HttpErro(400, 'O fim da vigência não pode ser antes do início', 'validacao');
  return {
    tipo: v.texto(b.tipo, 'Tipo', { max: 40, obrigatorio: true }),
    percentual: v.decimal(b.percentual, 'Percentual', { min: 0.01, max: 100, obrigatorio: true }),
    vigencia_inicio: ini,
    vigencia_fim: fim,
    motivo: v.texto(b.motivo, 'Motivo', { max: 500 }),
    ativo: b.ativo === undefined ? 1 : (b.ativo ? 1 : 0)
  };
}

function situacao(bolsa, hoje) {
  if (!bolsa.ativo) return 'inativa';
  if (bolsa.vigencia_inicio && bolsa.vigencia_inicio > hoje) return 'futura';
  if (bolsa.vigencia_fim && bolsa.vigencia_fim < hoje) return 'encerrada';
  return 'vigente';
}

/* ---------------- Listar ---------------- */
router.get('/', assincrono(async (req, res) => {
  const [linhas, cfg] = await Promise.all([
    query(
      `SELECT b.*, a.nome AS aluno, a.ra, a.status AS aluno_status, t.nome AS turma
         FROM bolsas b JOIN alunos a ON a.id = b.aluno_id LEFT JOIN turmas t ON t.id = a.turma_id
        WHERE b.colegio_id = ?
        ORDER BY a.nome, b.vigencia_inicio`,
      [req.colegioId]
    ),
    queryUm('SELECT valor_mensalidade FROM config_colegio WHERE colegio_id = ?', [req.colegioId])
  ]);
  const hoje = hojeSP();
  const valorBase = cfg ? Number(cfg.valor_mensalidade) : 0;

  // Por aluno vale a maior bolsa vigente
  const maiorPorAluno = new Map();
  const itens = linhas.map((b) => {
    const sit = situacao(b, hoje);
    if (sit === 'vigente' && b.aluno_status === 'ativo') {
      maiorPorAluno.set(b.aluno_id, Math.max(maiorPorAluno.get(b.aluno_id) || 0, Number(b.percentual)));
    }
    return {
      id: b.id,
      alunoId: b.aluno_id,
      aluno: b.aluno,
      ra: b.ra,
      alunoStatus: b.aluno_status,
      turma: b.turma,
      tipo: b.tipo,
      percentual: b.percentual,
      vigenciaInicio: b.vigencia_inicio,
      vigenciaFim: b.vigencia_fim,
      motivo: b.motivo,
      ativo: !!b.ativo,
      situacao: sit
    };
  });
  const pcts = [...maiorPorAluno.values()];
  res.json({
    resumo: {
      bolsistas: pcts.length,
      descontoMedio: pcts.length ? Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 10) / 10 : 0,
      impactoMensal: pcts.reduce((s, p) => s + f.calcularValores(valorBase, p).desconto, 0),
      integrais: pcts.filter((p) => p >= 100).length,
      valorMensalidade: valorBase
    },
    itens
  });
}));

/* ---------------- Criar ---------------- */
router.post('/', assincrono(async (req, res) => {
  const alunoId = v.inteiro(req.body.alunoId, 'Aluno', { min: 1, obrigatorio: true });
  const b = lerBolsa(req.body);
  const aluno = await queryUm('SELECT id, nome FROM alunos WHERE id = ? AND colegio_id = ?', [alunoId, req.colegioId]);
  if (!aluno) throw new HttpErro(400, 'Aluno inválido', 'validacao');

  const r = await transacao(async (conn) => {
    const [ins] = await conn.query(
      `INSERT INTO bolsas (colegio_id, aluno_id, tipo, percentual, vigencia_inicio, vigencia_fim, motivo, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.colegioId, alunoId, b.tipo, b.percentual, b.vigencia_inicio, b.vigencia_fim, b.motivo, b.ativo]
    );
    const atualizadas = await f.recalcularPendentes(conn, req.colegioId, alunoId);
    return { id: ins.insertId, atualizadas };
  });
  await atividade(req.colegioId, req.usuario.id, `Bolsa cadastrada: ${aluno.nome} · ${b.tipo} ${String(b.percentual).replace('.', ',')}%`);
  res.status(201).json({ id: r.id, mensalidadesAtualizadas: r.atualizadas });
}));

/* ---------------- Editar ---------------- */
router.put('/:id', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const b = lerBolsa(req.body);
  const r = await transacao(async (conn) => {
    const [[atual]] = await conn.query(
      'SELECT b.aluno_id, a.nome FROM bolsas b JOIN alunos a ON a.id = b.aluno_id WHERE b.id = ? AND b.colegio_id = ? FOR UPDATE',
      [id, req.colegioId]
    );
    if (!atual) throw new HttpErro(404, 'Bolsa não encontrada', 'nao_encontrado');
    await conn.query(
      'UPDATE bolsas SET tipo = ?, percentual = ?, vigencia_inicio = ?, vigencia_fim = ?, motivo = ?, ativo = ? WHERE id = ?',
      [b.tipo, b.percentual, b.vigencia_inicio, b.vigencia_fim, b.motivo, b.ativo, id]
    );
    const atualizadas = await f.recalcularPendentes(conn, req.colegioId, atual.aluno_id);
    return { nome: atual.nome, atualizadas };
  });
  await atividade(req.colegioId, req.usuario.id, `Bolsa alterada: ${r.nome} · ${b.tipo} ${String(b.percentual).replace('.', ',')}%`);
  res.json({ id, mensalidadesAtualizadas: r.atualizadas });
}));

/* ---------------- Excluir ---------------- */
router.delete('/:id', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const r = await transacao(async (conn) => {
    const [[atual]] = await conn.query(
      'SELECT b.aluno_id, b.tipo, a.nome FROM bolsas b JOIN alunos a ON a.id = b.aluno_id WHERE b.id = ? AND b.colegio_id = ? FOR UPDATE',
      [id, req.colegioId]
    );
    if (!atual) throw new HttpErro(404, 'Bolsa não encontrada', 'nao_encontrado');
    await conn.query('DELETE FROM bolsas WHERE id = ?', [id]);
    const atualizadas = await f.recalcularPendentes(conn, req.colegioId, atual.aluno_id);
    return { ...atual, atualizadas };
  });
  await atividade(req.colegioId, req.usuario.id, `Bolsa excluída: ${r.nome} · ${r.tipo}`);
  res.json({ mensalidadesAtualizadas: r.atualizadas });
}));

module.exports = router;
