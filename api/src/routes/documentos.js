'use strict';
/* =====================================================================
 *  /api/documentos   [módulo mensalidades]
 *
 *  POST /link   gera o link assinado de um PDF
 *    { tipo: 'mensalidade', id }                    cobrança (em aberto) ou recibo (paga)
 *    { tipo: 'carne', alunoId, ano }                mensalidades em aberto do ano
 *    { tipo: 'lote', referencia, turmaId? }         mensalidades em aberto do mês (imprimir)
 *    { tipo: 'declaracao', alunoId, ano }           pagamentos do ano (IR)
 *    { tipo: 'teste' }                              teste da chave PIX (R$ 1,00)
 *    enviar: true → validade da configuração (WhatsApp); senão 30 minutos (abrir na tela)
 *
 *  O PDF em si é servido por /api/publico/doc/:token (sem login).
 * ===================================================================== */
const router = require('express').Router();
const { exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { assinar } = require('../utils/links');
const { TIPOS, DocErro } = require('../services/documentos');

router.use(exigirModulo('mensalidades'));

const MAPA = { mensalidade: 'm', carne: 'c', lote: 'l', declaracao: 'd', teste: 'x' };
const REF = /^\d{4}-(0[1-9]|1[0-2])$/;
const centavos = (v) => Math.round(Number(v || 0) * 100);

router.post('/link', assincrono(async (req, res) => {
  const b = req.body;
  const tipo = v.umDe(b.tipo, Object.keys(MAPA), 'Tipo de documento');
  const k = MAPA[tipo];
  const enviar = !!b.enviar;
  if (enviar && (k === 'l' || k === 'x')) throw new HttpErro(400, 'Este documento é só para abrir e imprimir', 'validacao');

  const dados = { k, c: req.colegioId };
  if (k === 'm') dados.i = v.inteiro(b.id, 'Mensalidade', { min: 1, obrigatorio: true });
  if (k === 'c' || k === 'd') {
    dados.i = v.inteiro(b.alunoId, 'Aluno', { min: 1, obrigatorio: true });
    dados.a = v.inteiro(b.ano, 'Ano', { min: 2000, max: 2100, obrigatorio: true });
  }
  if (k === 'l') {
    if (!REF.test(String(b.referencia || ''))) throw new HttpErro(400, 'Escolha o mês de referência', 'validacao');
    dados.r = b.referencia;
    const t = v.inteiro(b.turmaId, 'Turma', { min: 1 });
    if (t) dados.t = t;
  }

  let d;
  try {
    d = await TIPOS[k].carregar(dados);
  } catch (e) {
    if (e instanceof DocErro) throw new HttpErro(409, e.message, 'documento');
    throw e;
  }

  const dias = d.cobranca.validadeDias;
  const { token, expira } = assinar(dados, enviar ? dias * 86400 : 30 * 60);

  // Resumo para montar a mensagem do WhatsApp
  let resumo = {};
  if (k === 'm') resumo = { situacao: d.item.status === 'pago' ? 'paga' : 'aberta' };
  if (k === 'c' || k === 'l') resumo = { parcelas: d.itens.length, total: d.itens.reduce((s, x) => s + centavos(x.valor), 0) / 100 };
  if (k === 'd') resumo = { pagamentos: d.pagamentos.length, total: d.pagamentos.reduce((s, x) => s + centavos(x.valorPago ?? x.valor), 0) / 100 };

  res.json({
    url: `/api/publico/doc/${token}`,
    expira,
    validadeDias: enviar ? dias : null,
    pixConfigurado: !!d.cobranca.pix,
    resumo
  });
}));

module.exports = router;
