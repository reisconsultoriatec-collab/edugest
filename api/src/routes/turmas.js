'use strict';
/* =====================================================================
 *  /api/turmas — turmas do colégio atual (equipe)
 *
 *  GET    /?ano=2026            lista com nº de alunos ativos
 *  POST   /                     cria                         [módulo turmas]
 *  PUT    /:id                  edita / ativa / desativa      [módulo turmas]
 *  DELETE /:id?forcar=1         exclui                        [módulo turmas]
 *  GET    /:id/atribuicoes      professor de cada disciplina  [módulo turmas]
 *  PUT    /:id/atribuicoes      grava a atribuição de aulas   [módulo turmas]
 *
 *  Exclusão: turma com notas ou diário não pode ser excluída (desative).
 *  Com alunos, pede confirmação (forcar=1) e os alunos ficam sem turma.
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm, transacao } = require('../db');
const { exigirModulo, exigirAlgumModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade } = require('../utils/auditoria');

const PERIODOS = ['matutino', 'vespertino', 'integral', 'noturno'];
// Módulos que precisam enxergar a lista de turmas
const LEITORES = ['turmas', 'alunos', 'diario', 'notas', 'boletim', 'grade', 'documentos', 'mensalidades', 'bolsas', 'relatorios'];

function lerTurma(b, anoPadrao) {
  return {
    nome: v.texto(b.nome, 'Nome da turma', { max: 50, obrigatorio: true }),
    serie: v.texto(b.serie, 'Série', { max: 30, obrigatorio: true }),
    periodo: v.umDe(b.periodo || 'matutino', PERIODOS, 'Período'),
    capacidade: v.inteiro(b.capacidade, 'Capacidade', { min: 1, max: 200 }) || 35,
    sala: v.texto(b.sala, 'Sala', { max: 30 }),
    ano_letivo: v.inteiro(b.anoLetivo, 'Ano letivo', { min: 2000, max: 2100 }) || anoPadrao
  };
}

async function anoAtual(colegioId) {
  const c = await queryUm('SELECT ano_letivo FROM config_colegio WHERE colegio_id = ?', [colegioId]);
  return c ? c.ano_letivo : new Date().getFullYear();
}

function formatar(t) {
  return {
    id: t.id,
    nome: t.nome,
    serie: t.serie,
    periodo: t.periodo,
    capacidade: t.capacidade,
    sala: t.sala,
    anoLetivo: t.ano_letivo,
    ativo: !!t.ativo,
    alunos: Number(t.alunos || 0),
    atribuicoes: Number(t.atribuicoes || 0)
  };
}

router.get('/', exigirAlgumModulo(LEITORES), assincrono(async (req, res) => {
  const ano = v.inteiro(req.query.ano, 'Ano', { min: 2000, max: 2100 });
  const params = [req.colegioId];
  let filtro = '';
  if (ano) { filtro = ' AND t.ano_letivo = ?'; params.push(ano); }
  const linhas = await query(
    `SELECT t.*, (SELECT COUNT(*) FROM alunos a WHERE a.turma_id = t.id AND a.status = 'ativo') AS alunos,
            (SELECT COUNT(*) FROM atribuicoes at WHERE at.turma_id = t.id) AS atribuicoes
       FROM turmas t
      WHERE t.colegio_id = ?${filtro}
      ORDER BY t.ativo DESC, t.ano_letivo DESC, t.serie, t.nome`,
    params
  );
  res.json(linhas.map(formatar));
}));

router.post('/', exigirModulo('turmas'), assincrono(async (req, res) => {
  const t = lerTurma(req.body, await anoAtual(req.colegioId));
  const r = await query(
    `INSERT INTO turmas (colegio_id, ano_letivo, nome, serie, periodo, capacidade, sala)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.colegioId, t.ano_letivo, t.nome, t.serie, t.periodo, t.capacidade, t.sala]
  ).catch((e) => {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpErro(409, `Já existe a turma ${t.nome} em ${t.ano_letivo}`, 'duplicado');
    throw e;
  });
  await atividade(req.colegioId, req.usuario.id, `Turma criada: ${t.nome} (${t.ano_letivo})`);
  res.status(201).json(formatar({ id: r.insertId, ...t, ativo: 1, alunos: 0 }));
}));

router.put('/:id', exigirModulo('turmas'), assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const atual = await queryUm('SELECT * FROM turmas WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  if (!atual) throw new HttpErro(404, 'Turma não encontrada', 'nao_encontrado');

  // Permite só ativar/desativar sem reenviar o resto
  const somenteAtivo = Object.keys(req.body).length === 1 && req.body.ativo !== undefined;
  const t = somenteAtivo ? { ...atual } : lerTurma({ ...req.body, anoLetivo: req.body.anoLetivo || atual.ano_letivo }, atual.ano_letivo);
  const ativo = req.body.ativo !== undefined ? (req.body.ativo ? 1 : 0) : atual.ativo;

  await query(
    `UPDATE turmas SET ano_letivo = ?, nome = ?, serie = ?, periodo = ?, capacidade = ?, sala = ?, ativo = ?
      WHERE id = ? AND colegio_id = ?`,
    [t.ano_letivo, t.nome, t.serie, t.periodo, t.capacidade, t.sala, ativo, id, req.colegioId]
  ).catch((e) => {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpErro(409, `Já existe a turma ${t.nome} em ${t.ano_letivo}`, 'duplicado');
    throw e;
  });
  await atividade(req.colegioId, req.usuario.id,
    somenteAtivo ? `Turma ${atual.nome} ${ativo ? 'reativada' : 'desativada'}` : `Turma atualizada: ${t.nome}`);
  const n = await queryUm("SELECT COUNT(*) AS n FROM alunos WHERE turma_id = ? AND status = 'ativo'", [id]);
  res.json(formatar({ id, ...t, ativo, alunos: n.n }));
}));

/* ---------------- Atribuição de aulas (professor de cada disciplina) ---------------- */
router.get('/:id/atribuicoes', exigirModulo('turmas'), assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const t = await queryUm('SELECT id, nome FROM turmas WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  if (!t) throw new HttpErro(404, 'Turma não encontrada', 'nao_encontrado');

  const [atuais, disciplinas, professores] = await Promise.all([
    query('SELECT disciplina_id, professor_id FROM atribuicoes WHERE turma_id = ?', [id]),
    query('SELECT id, nome, ativo FROM disciplinas WHERE colegio_id = ? ORDER BY ordem, nome', [req.colegioId]),
    query(
      `SELECT p.id, p.nome, p.status,
              (SELECT GROUP_CONCAT(pd.disciplina_id) FROM professor_disciplina pd WHERE pd.professor_id = p.id) AS disc
         FROM professores p WHERE p.colegio_id = ? ORDER BY p.nome`,
      [req.colegioId]
    )
  ]);
  const porDisc = new Map(atuais.map((a) => [a.disciplina_id, a.professor_id]));
  const usados = new Set(atuais.map((a) => a.professor_id));

  res.json({
    turma: { id: t.id, nome: t.nome },
    disciplinas: disciplinas
      .filter((d) => d.ativo || porDisc.has(d.id))
      .map((d) => ({ id: d.id, nome: d.nome, professorId: porDisc.get(d.id) || null })),
    professores: professores
      .filter((p) => p.status === 'ativo' || usados.has(p.id))
      .map((p) => ({ id: p.id, nome: p.nome, disciplinas: p.disc ? String(p.disc).split(',').map(Number) : [] }))
  });
}));

router.put('/:id/atribuicoes', exigirModulo('turmas'), assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const t = await queryUm('SELECT id, nome FROM turmas WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  if (!t) throw new HttpErro(404, 'Turma não encontrada', 'nao_encontrado');
  if (!Array.isArray(req.body.atribuicoes)) throw new HttpErro(400, 'Atribuições inválidas', 'validacao');

  const lista = req.body.atribuicoes
    .map((a) => ({
      disciplinaId: v.inteiro(a.disciplinaId, 'Disciplina', { min: 1, obrigatorio: true }),
      professorId: a.professorId ? v.inteiro(a.professorId, 'Professor', { min: 1 }) : null
    }))
    .filter((a) => a.professorId);
  if (new Set(lista.map((a) => a.disciplinaId)).size !== lista.length) throw new HttpErro(400, 'Disciplina repetida', 'validacao');

  await transacao(async (conn) => {
    if (lista.length) {
      const [[d]] = await conn.query('SELECT COUNT(*) AS n FROM disciplinas WHERE colegio_id = ? AND id IN (?)',
        [req.colegioId, lista.map((a) => a.disciplinaId)]);
      const profIds = [...new Set(lista.map((a) => a.professorId))];
      const [[p]] = await conn.query('SELECT COUNT(*) AS n FROM professores WHERE colegio_id = ? AND id IN (?)', [req.colegioId, profIds]);
      if (d.n !== lista.length || p.n !== profIds.length) throw new HttpErro(400, 'Disciplina ou professor inválido', 'validacao');
    }
    await conn.query('DELETE FROM atribuicoes WHERE turma_id = ? AND colegio_id = ?', [id, req.colegioId]);
    if (lista.length) {
      await conn.query(
        'INSERT INTO atribuicoes (colegio_id, turma_id, disciplina_id, professor_id) VALUES ?',
        [lista.map((a) => [req.colegioId, id, a.disciplinaId, a.professorId])]
      );
    }
  });
  await atividade(req.colegioId, req.usuario.id, `Professores da turma ${t.nome} atualizados (${lista.length} disciplina(s))`);
  res.json({ atribuicoes: lista.length });
}));

router.delete('/:id', exigirModulo('turmas'), assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const t = await queryUm('SELECT nome FROM turmas WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  if (!t) throw new HttpErro(404, 'Turma não encontrada', 'nao_encontrado');

  const uso = await queryUm(
    `SELECT (SELECT COUNT(*) FROM notas WHERE turma_id = ?) AS notas,
            (SELECT COUNT(*) FROM diarios WHERE turma_id = ?) AS diarios,
            (SELECT COUNT(*) FROM alunos WHERE turma_id = ?) AS alunos`,
    [id, id, id]
  );
  if (uso.notas > 0 || uso.diarios > 0) {
    throw new HttpErro(409, `A turma ${t.nome} tem notas ou registros de diário. Desative-a em vez de excluir, para preservar o histórico.`, 'em_uso');
  }
  if (uso.alunos > 0 && req.query.forcar !== '1') {
    throw new HttpErro(409, `A turma ${t.nome} tem ${uso.alunos} aluno(s). Se excluir, eles ficarão sem turma.`, 'tem_vinculos');
  }
  await query('DELETE FROM turmas WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  await atividade(req.colegioId, req.usuario.id, `Turma excluída: ${t.nome}`);
  res.status(204).end();
}));

module.exports = router;
