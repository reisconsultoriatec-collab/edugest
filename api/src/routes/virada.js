'use strict';
/* =====================================================================
 *  /api/virada — virada do ano letivo (rematrícula)   [somente admin]
 *
 *  GET  /previa?ano=AAAA        turmas, alunos com situação e sugestão,
 *                               turmas que já existem no ano novo,
 *                               alunos sem turma e as viradas já feitas
 *  POST /                       executa (tudo ou nada)
 *  POST /:id/desfazer           desfaz a última virada, se o ano novo
 *                               ainda não teve movimento
 * ===================================================================== */
const router = require('express').Router();
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade } = require('../utils/auditoria');
const V = require('../services/virada');

router.get('/previa', assincrono(async (req, res) => {
  const ano = req.query.ano ? v.inteiro(req.query.ano, 'Ano', { min: 2000, max: 2100 }) : null;
  res.json(await V.previa(req.colegioId, ano));
}));

function lerPedido(b) {
  const anoDe = v.inteiro(b.anoDe, 'Ano que termina', { min: 2000, max: 2100, obrigatorio: true });
  if (!Array.isArray(b.turmas) || !Array.isArray(b.alunos)) throw new HttpErro(400, 'Envie as turmas e os alunos da virada', 'validacao');
  if (b.alunos.length > 5000 || b.turmas.length > 300) throw new HttpErro(400, 'Virada grande demais para uma vez só', 'validacao');
  const turmas = b.turmas.map((t) => ({
    origemId: v.inteiro(t.origemId, 'Turma de origem', { min: 1, obrigatorio: true }),
    acao: v.umDe(t.acao, ['criar', 'existente', 'concluir'], 'O que fazer com a turma'),
    nome: v.texto(t.nome, 'Nome da turma', { max: 50 }),
    serie: v.texto(t.serie, 'Série', { max: 30 }),
    periodo: t.periodo ? String(t.periodo) : null,
    capacidade: t.capacidade ? v.inteiro(t.capacidade, 'Capacidade', { min: 1, max: 200 }) : null,
    destinoId: t.destinoId ? v.inteiro(t.destinoId, 'Turma de destino', { min: 1 }) : null,
    copiarProfessores: !!t.copiarProfessores
  }));
  const alunos = b.alunos.map((a) => ({
    id: v.inteiro(a.id, 'Aluno', { min: 1, obrigatorio: true }),
    acao: String(a.acao || ''),
    destino: a.destino === undefined || a.destino === null ? null : String(a.destino).slice(0, 20)
  }));
  const m = b.mensalidades || {};
  const mensalidades = m.gerar ? {
    gerar: true,
    valor: v.decimal(m.valor, 'Valor da mensalidade', { min: 0.01, max: 99999, obrigatorio: true }),
    mesInicial: v.inteiro(m.mesInicial, 'Mês inicial', { min: 1, max: 12, obrigatorio: true }),
    mesFinal: v.inteiro(m.mesFinal, 'Mês final', { min: 1, max: 12, obrigatorio: true }),
    diaVencimento: v.inteiro(m.diaVencimento, 'Dia de vencimento', { min: 1, max: 28, obrigatorio: true })
  } : { gerar: false };
  const novoValorPadrao = b.novoValorPadrao === undefined || b.novoValorPadrao === null || b.novoValorPadrao === ''
    ? null : v.decimal(b.novoValorPadrao, 'Novo valor padrão', { min: 0, max: 99999 });
  return { anoDe, turmas, alunos, mensalidades, novoValorPadrao };
}

router.post('/', assincrono(async (req, res) => {
  const p = lerPedido(req.body || {});
  const r = await V.executar(req.colegioId, req.usuario.id, p);
  const s = r.resumo;
  const partes = [
    s.promovidos && `${s.promovidos} promovido(s)`, s.retidos && `${s.retidos} retido(s)`, s.concluidos && `${s.concluidos} concluiu(íram)`,
    s.sairam && `${s.sairam} saiu(íram)`, s.enturmados && `${s.enturmados} enturmado(s)`, s.turmasCriadas && `${s.turmasCriadas} turma(s) criada(s)`,
    s.mensalidades && `${s.mensalidades} mensalidade(s)`
  ].filter(Boolean).join(', ');
  await atividade(req.colegioId, req.usuario.id, `Virada do ano letivo ${r.anoDe} → ${r.anoPara}${r.modo === 'complemento' ? ' (complemento)' : ''}: ${partes || 'sem alterações'}`);
  res.status(201).json(r);
}));

router.post('/:id/desfazer', assincrono(async (req, res) => {
  const r = await V.desfazer(req.colegioId, req.usuario.id, v.id(req.params.id));
  await atividade(req.colegioId, req.usuario.id, `Virada do ano letivo desfeita: ${r.alunos} aluno(s) de volta, ${r.turmas} turma(s) e ${r.mensalidades} mensalidade(s) apagadas`);
  res.json(r);
}));

module.exports = router;
