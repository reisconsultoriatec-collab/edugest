'use strict';
/* =====================================================================
 *  /api/colegios  (usuário logado e cadastrado)
 *
 *  POST   /                          cria um novo colégio (vira admin dele)
 *  GET    /atual                     dados, configuração e disciplinas
 *  PUT    /atual                     dados cadastrais            [admin]
 *  PUT    /atual/config              configuração                [admin]
 *  POST   /atual/convite/regenerar   novo código de convite      [admin]
 *  POST   /atual/disciplinas         cria disciplina             [admin]
 *  PUT    /atual/disciplinas/:id     edita / ativa / desativa    [admin]
 *  DELETE /atual/disciplinas/:id     exclui se não tiver notas   [admin]
 *  GET    /atual/resumo              indicadores do dashboard    [módulo dashboard]
 *  GET    /atual/atividades          atividade recente           [módulo dashboard]
 *
 *  "atual" = colégio do header X-Colegio-Id (ou o último selecionado).
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm, transacao } = require('../db');
const { exigirColegio, exigirPerfil, exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade, seguranca } = require('../utils/auditoria');
const { codigoConvite } = require('../utils/codigos');
const { criarColegio } = require('../services/colegios');
const { hojeSP } = require('../utils/datas');

const soAdmin = [exigirColegio, exigirPerfil('admin')];

/** Cadastros aguardando aprovação no colégio (só o admin aprova). */
async function contarPendentes(colegioId) {
  const r = await queryUm(
    `SELECT COUNT(*) AS total, COALESCE(SUM(perfil = 'responsavel'), 0) AS responsaveis
       FROM usuario_colegio WHERE colegio_id = ? AND status = 'pendente'`,
    [colegioId]
  );
  const total = Number(r.total || 0);
  const responsaveis = Number(r.responsaveis || 0);
  return { total, responsaveis, equipe: total - responsaveis };
}
const soEquipe = [exigirColegio, exigirPerfil('admin', 'professor', 'financeiro')];

/* ---------------- Criar colégio ---------------- */
router.post('/', assincrono(async (req, res) => {
  const nome = v.texto(req.body.nome, 'Nome do colégio', { max: 120, min: 3, obrigatorio: true });
  const cnpj = v.cnpj(req.body.cnpj);
  const telefone = v.telefone(req.body.telefone);
  const endereco = v.texto(req.body.endereco, 'Endereço', { max: 200 });

  const colegioId = await transacao((conn) =>
    criarColegio(conn, { nome, usuarioId: req.usuario.id, cnpj, telefone, endereco }));

  await atividade(colegioId, req.usuario.id, `Colégio criado: ${nome}`);
  await seguranca(req, {
    tipo: 'admin', colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: `Criou o colégio ${nome}`
  });
  res.status(201).json({ id: colegioId, nome, perfil: 'admin' });
}));

/* ---------------- Ler colégio atual ---------------- */
router.get('/atual', exigirColegio, assincrono(async (req, res) => {
  const c = await queryUm(
    `SELECT c.id, c.nome, c.cnpj, c.telefone, c.email, c.endereco, c.codigo_convite, c.whatsapp_notif,
            cfg.ano_letivo, cfg.valor_mensalidade, cfg.dia_vencimento, cfg.media_aprovacao,
            cfg.frequencia_minima, cfg.timeout_sessao_min
       FROM colegios c
       LEFT JOIN config_colegio cfg ON cfg.colegio_id = c.id
      WHERE c.id = ?`,
    [req.colegioId]
  );
  if (!c) throw new HttpErro(404, 'Colégio não encontrado', 'nao_encontrado');

  const disciplinas = req.perfil === 'responsavel'
    ? []
    : await query(
      'SELECT id, nome, ordem, ativo FROM disciplinas WHERE colegio_id = ? ORDER BY ordem, nome',
      [req.colegioId]
    );

  const admin = req.perfil === 'admin';
  res.json({
    id: c.id,
    nome: c.nome,
    cnpj: c.cnpj,
    telefone: c.telefone,
    email: c.email,
    endereco: c.endereco,
    // Dados internos só para o admin
    codigoConvite: admin ? c.codigo_convite : undefined,
    whatsappNotif: admin ? c.whatsapp_notif : undefined,
    config: {
      anoLetivo: c.ano_letivo,
      valorMensalidade: c.valor_mensalidade,
      diaVencimento: c.dia_vencimento,
      mediaAprovacao: c.media_aprovacao,
      frequenciaMinima: c.frequencia_minima,
      timeoutSessaoMin: c.timeout_sessao_min
    },
    disciplinas: disciplinas.map((d) => ({ id: d.id, nome: d.nome, ordem: d.ordem, ativo: !!d.ativo })),
    pendentes: admin ? await contarPendentes(req.colegioId) : undefined,
    perfil: req.perfil,
    modulos: req.modulos
  });
}));

/* ---------------- Editar dados ---------------- */
router.put('/atual', soAdmin, assincrono(async (req, res) => {
  const dados = {
    nome: v.texto(req.body.nome, 'Nome do colégio', { max: 120, min: 3, obrigatorio: true }),
    cnpj: v.cnpj(req.body.cnpj),
    telefone: v.telefone(req.body.telefone),
    email: v.email(req.body.email),
    endereco: v.texto(req.body.endereco, 'Endereço', { max: 200 }),
    whatsapp_notif: v.telefone(req.body.whatsappNotif, 'WhatsApp para notificações')
  };
  await query(
    `UPDATE colegios SET nome = ?, cnpj = ?, telefone = ?, email = ?, endereco = ?, whatsapp_notif = ?
      WHERE id = ?`,
    [dados.nome, dados.cnpj, dados.telefone, dados.email, dados.endereco, dados.whatsapp_notif, req.colegioId]
  );
  await atividade(req.colegioId, req.usuario.id, 'Dados do colégio atualizados');
  res.json({ ok: true });
}));

/* ---------------- Configuração ---------------- */
router.put('/atual/config', soAdmin, assincrono(async (req, res) => {
  const b = req.body;
  const cfg = [
    v.inteiro(b.anoLetivo, 'Ano letivo', { min: 2000, max: 2100, obrigatorio: true }),
    v.decimal(b.valorMensalidade, 'Valor da mensalidade', { min: 0, max: 99999999, obrigatorio: true }),
    v.inteiro(b.diaVencimento, 'Dia de vencimento', { min: 1, max: 28, obrigatorio: true }),
    v.decimal(b.mediaAprovacao, 'Média de aprovação', { min: 0, max: 10, obrigatorio: true }),
    v.inteiro(b.frequenciaMinima, 'Frequência mínima', { min: 0, max: 100, obrigatorio: true }),
    // 0 = desativado (corrige o bug do "Desativado" virar 15 min)
    v.inteiro(b.timeoutSessaoMin, 'Timeout de sessão', { min: 0, max: 240, obrigatorio: true })
  ];
  await query(
    `INSERT INTO config_colegio
       (colegio_id, ano_letivo, valor_mensalidade, dia_vencimento, media_aprovacao, frequencia_minima, timeout_sessao_min)
     VALUES (?, ?, ?, ?, ?, ?, ?) AS novo
     ON DUPLICATE KEY UPDATE
       ano_letivo = novo.ano_letivo, valor_mensalidade = novo.valor_mensalidade,
       dia_vencimento = novo.dia_vencimento, media_aprovacao = novo.media_aprovacao,
       frequencia_minima = novo.frequencia_minima, timeout_sessao_min = novo.timeout_sessao_min`,
    [req.colegioId, ...cfg]
  );
  await atividade(req.colegioId, req.usuario.id, 'Configurações do colégio atualizadas');
  res.json({ ok: true });
}));

/* ---------------- Código de convite ---------------- */
router.post('/atual/convite/regenerar', soAdmin, assincrono(async (req, res) => {
  let codigo = null;
  for (let t = 0; t < 5 && !codigo; t++) {
    const novo = codigoConvite();
    try {
      await query('UPDATE colegios SET codigo_convite = ? WHERE id = ?', [novo, req.colegioId]);
      codigo = novo;
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY' || t === 4) throw e;
    }
  }
  await seguranca(req, {
    tipo: 'admin', colegioId: req.colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: 'Gerou novo código de convite (o anterior deixou de funcionar)'
  });
  res.json({ codigoConvite: codigo });
}));

/* ---------------- Disciplinas ---------------- */
router.post('/atual/disciplinas', soAdmin, assincrono(async (req, res) => {
  const nome = v.texto(req.body.nome, 'Disciplina', { max: 60, obrigatorio: true });
  const ordem = v.inteiro(req.body.ordem, 'Ordem', { min: 0, max: 999 });
  const prox = ordem !== null ? ordem : ((await queryUm(
    'SELECT COALESCE(MAX(ordem), 0) + 1 AS prox FROM disciplinas WHERE colegio_id = ?', [req.colegioId]
  )).prox);
  const r = await query(
    'INSERT INTO disciplinas (colegio_id, nome, ordem) VALUES (?, ?, ?)',
    [req.colegioId, nome, prox]
  );
  await atividade(req.colegioId, req.usuario.id, `Disciplina criada: ${nome}`);
  res.status(201).json({ id: r.insertId, nome, ordem: prox, ativo: true });
}));

router.put('/atual/disciplinas/:id', soAdmin, assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const atual = await queryUm('SELECT id, nome, ordem, ativo FROM disciplinas WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  if (!atual) throw new HttpErro(404, 'Disciplina não encontrada', 'nao_encontrado');

  const nome = req.body.nome !== undefined ? v.texto(req.body.nome, 'Disciplina', { max: 60, obrigatorio: true }) : atual.nome;
  const ordem = req.body.ordem !== undefined ? v.inteiro(req.body.ordem, 'Ordem', { min: 0, max: 999, obrigatorio: true }) : atual.ordem;
  const ativo = req.body.ativo !== undefined ? (req.body.ativo ? 1 : 0) : atual.ativo;

  await query('UPDATE disciplinas SET nome = ?, ordem = ?, ativo = ? WHERE id = ? AND colegio_id = ?',
    [nome, ordem, ativo, id, req.colegioId]);
  res.json({ id, nome, ordem, ativo: !!ativo });
}));

router.delete('/atual/disciplinas/:id', soAdmin, assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const d = await queryUm('SELECT nome FROM disciplinas WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  if (!d) throw new HttpErro(404, 'Disciplina não encontrada', 'nao_encontrado');

  const uso = await queryUm(
    `SELECT (SELECT COUNT(*) FROM notas WHERE disciplina_id = ? AND colegio_id = ?) AS notas,
            (SELECT COUNT(*) FROM diarios WHERE disciplina_id = ? AND colegio_id = ?) AS diarios`,
    [id, req.colegioId, id, req.colegioId]
  );
  if (uso.notas > 0 || uso.diarios > 0) {
    const partes = [];
    if (uso.notas) partes.push(`${uso.notas} nota(s) lançada(s)`);
    if (uso.diarios) partes.push(`${uso.diarios} registro(s) no diário`);
    throw new HttpErro(409, `A disciplina ${d.nome} tem ${partes.join(' e ')}. Desative em vez de excluir.`, 'em_uso');
  }
  await query('DELETE FROM disciplinas WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  await atividade(req.colegioId, req.usuario.id, `Disciplina excluída: ${d.nome}`);
  res.status(204).end();
}));

/* ---------------- Indicadores do Dashboard ---------------- */
router.get('/atual/resumo', soEquipe, exigirModulo('dashboard'), assincrono(async (req, res) => {
  const cfg = await queryUm('SELECT ano_letivo FROM config_colegio WHERE colegio_id = ?', [req.colegioId]);
  const ano = cfg ? cfg.ano_letivo : Number(hojeSP().slice(0, 4));
  const r = await queryUm(
    `SELECT
       (SELECT COUNT(*) FROM alunos WHERE colegio_id = ? AND status = 'ativo') AS alunos,
       (SELECT COUNT(*) FROM alunos WHERE colegio_id = ? AND status = 'ativo' AND turma_id IS NULL) AS alunos_sem_turma,
       (SELECT COUNT(*) FROM professores WHERE colegio_id = ? AND status = 'ativo') AS professores,
       (SELECT COUNT(*) FROM turmas WHERE colegio_id = ? AND ativo = 1 AND ano_letivo = ?) AS turmas,
       (SELECT COUNT(DISTINCT aluno_id) FROM mensalidades
         WHERE colegio_id = ? AND status = 'pendente' AND vencimento < ?) AS inadimplentes`,
    [req.colegioId, req.colegioId, req.colegioId, req.colegioId, ano, req.colegioId, hojeSP()]
  );
  res.json({
    anoLetivo: ano,
    alunos: Number(r.alunos),
    alunosSemTurma: Number(r.alunos_sem_turma),
    professores: Number(r.professores),
    turmas: Number(r.turmas),
    inadimplentes: Number(r.inadimplentes),
    pendentes: req.perfil === 'admin' ? await contarPendentes(req.colegioId) : undefined
  });
}));

/* ---------------- Atividade recente ---------------- */
// Exige o módulo Dashboard (o admin sempre tem)
router.get('/atual/atividades', soEquipe, exigirModulo('dashboard'), assincrono(async (req, res) => {
  const limite = v.inteiro(req.query.limite, 'Limite', { min: 1, max: 100 }) || 20;
  const itens = await query(
    `SELECT a.id, a.acao, a.criado_em, u.nome AS autor
       FROM atividades a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.colegio_id = ?
      ORDER BY a.id DESC
      LIMIT ?`,
    [req.colegioId, limite]
  );
  res.json(itens.map((a) => ({ id: a.id, acao: a.acao, autor: a.autor, data: a.criado_em })));
}));

module.exports = router;
