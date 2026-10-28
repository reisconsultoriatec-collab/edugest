'use strict';
/* =====================================================================
 *  /api/lgpd — Privacidade (LGPD)   [administrador do colégio]
 *
 *  GET  /                      encarregado, aceites dos termos, pedidos e captação antiga
 *  PUT  /encarregado           { nome, email, telefone } — contato de privacidade do colégio
 *  PUT  /solicitacoes/:id      { status, resposta } — responde um pedido do titular
 *  GET  /solicitacoes/:id/exportar  cópia dos dados de quem fez o pedido (responsável e filhos)
 *  GET  /alunos/:id/exportar   cópia de tudo o que o sistema guarda sobre o aluno (JSON)
 *  POST /captacao/limpar       { confirmacao: 'APAGAR' } — apaga interessados perdidos há mais de 1 ano
 * ===================================================================== */
const router = require('express').Router();
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const lgpd = require('../services/lgpd');
const { atividade, seguranca } = require('../utils/auditoria');

const log = (req, detalhes) => seguranca(req, { tipo: 'privacidade', colegioId: req.colegioId, usuarioId: req.usuario.id, email: req.usuario.email, detalhes });

router.get('/', assincrono(async (req, res) => {
  const [encarregado, aceites, solicitacoes, contagem, captacao] = await Promise.all([
    lgpd.encarregado(req.colegioId), lgpd.resumoAceites(req.colegioId), lgpd.listarSolicitacoes(req.colegioId),
    lgpd.contarAbertas(req.colegioId), lgpd.captacaoAntiga(req.colegioId)
  ]);
  res.json({ encarregado, aceites, solicitacoes, contagem, captacao, tipos: lgpd.TIPOS, status: lgpd.STATUS, prazoDias: lgpd.PRAZO_DIAS });
}));

router.put('/encarregado', assincrono(async (req, res) => {
  const b = req.body || {};
  const dados = {
    nome: v.texto(b.nome, 'Nome do encarregado', { max: 100, min: 3, obrigatorio: true }),
    email: v.email(b.email, 'E-mail do encarregado', true),
    telefone: v.telefone(b.telefone, 'Telefone do encarregado')
  };
  const r = await lgpd.salvarEncarregado(req.colegioId, dados);
  await atividade(req.colegioId, req.usuario.id, `Encarregado de dados (LGPD) definido: ${dados.nome}`);
  await log(req, `Definiu o encarregado de dados: ${dados.nome} <${dados.email}>`);
  res.json(r);
}));

router.put('/solicitacoes/:id', assincrono(async (req, res) => {
  const b = req.body || {};
  const s = await lgpd.responderSolicitacao(req.colegioId, v.id(req.params.id), req.usuario.id, { status: b.status, resposta: b.resposta });
  await atividade(req.colegioId, req.usuario.id, `Pedido de privacidade nº ${s.id} (${s.solicitante}): ${s.statusRotulo.toLowerCase()}`);
  await log(req, `Pedido de privacidade nº ${s.id} de ${s.solicitante}: ${s.statusRotulo}`);
  res.json(s);
}));

router.get('/solicitacoes/:id/exportar', assincrono(async (req, res) => {
  const r = await lgpd.exportarSolicitante(req.colegioId, v.id(req.params.id));
  await log(req, `Exportou os dados de ${r.solicitante} para atender o pedido de privacidade nº ${r.pedido}`);
  res.set('Cache-Control', 'no-store');
  res.json(r.dados);
}));

router.get('/alunos/:id/exportar', assincrono(async (req, res) => {
  const dados = await lgpd.exportarAluno(req.colegioId, v.id(req.params.id));
  await log(req, `Exportou os dados pessoais do aluno ${dados.aluno.nome} (LGPD)`);
  res.set('Cache-Control', 'no-store');
  res.json({ sobre: 'Cópia dos dados pessoais do aluno guardados no EduGest (art. 18 da LGPD).', ...dados });
}));

router.post('/captacao/limpar', assincrono(async (req, res) => {
  if (String((req.body && req.body.confirmacao) || '').trim().toUpperCase() !== 'APAGAR') {
    throw new HttpErro(400, 'Digite APAGAR para confirmar', 'validacao');
  }
  const r = await lgpd.limparCaptacao(req.colegioId);
  if (r.apagados) {
    await atividade(req.colegioId, req.usuario.id, `Captação: ${r.apagados} interessado${r.apagados === 1 ? '' : 's'} perdido${r.apagados === 1 ? '' : 's'} há mais de 1 ano apagado${r.apagados === 1 ? '' : 's'} (LGPD)`);
    await log(req, `Apagou ${r.apagados} interessado(s) da captação perdidos há mais de 1 ano`);
  }
  res.json(r);
}));

module.exports = router;
