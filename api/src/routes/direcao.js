'use strict';
/* =====================================================================
 *  /api/direcao — Painel da Direção   [alta direção do colégio ou proprietário]
 *
 *  GET /painel           indicadores e séries do ano letivo (60 s em cache)
 *  GET /painel?atualizar=1   ignora o cache (botão "Atualizar agora")
 *
 *  Alta direção = administrador marcado em Sistema › Usuários.
 * ===================================================================== */
const router = require('express').Router();
const { HttpErro, assincrono } = require('../middleware/erros');
const { podeVerDirecao, painelDirecao } = require('../services/direcao');

router.use(assincrono(async (req, res, next) => {
  if (!(await podeVerDirecao(req))) throw new HttpErro(403, 'O Painel da Direção é exclusivo da alta direção do colégio', 'direcao');
  next();
}));

router.get('/painel', assincrono(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await painelDirecao(req.colegioId, { atualizar: req.query.atualizar === '1' }));
}));

module.exports = router;
