'use strict';
/* =====================================================================
 *  /api/direcao — Painel da Direção   [alta direção do colégio ou proprietário]
 *
 *  GET /painel           indicadores e séries do ano letivo (60 s em cache)
 *  GET /painel?atualizar=1   ignora o cache (botão "Atualizar agora")
 *  PUT /config           { alertaPresenca: 1–100 } — % de presença em sala abaixo do qual a turma fica em alerta
 *
 *  Alta direção = administrador marcado em Sistema › Usuários.
 * ===================================================================== */
const router = require('express').Router();
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { seguranca } = require('../utils/auditoria');
const { podeVerDirecao, painelDirecao, salvarAlertaPresenca } = require('../services/direcao');

router.use(assincrono(async (req, res, next) => {
  if (!(await podeVerDirecao(req))) throw new HttpErro(403, 'O Painel da Direção é exclusivo da alta direção do colégio', 'direcao');
  next();
}));

router.get('/painel', assincrono(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await painelDirecao(req.colegioId, { atualizar: req.query.atualizar === '1' }));
}));

router.put('/config', assincrono(async (req, res) => {
  const b = req.body || {};
  const alerta = v.inteiro(b.alertaPresenca, 'Alerta de presença', { min: 1, max: 100, obrigatorio: true });
  const r = await salvarAlertaPresenca(req.colegioId, alerta);
  if (r.antes !== alerta) {
    await seguranca(req, {
      tipo: 'admin', colegioId: req.colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
      detalhes: `Painel da Direção: alerta de presença em sala ${r.antes}% → ${alerta}%`
    });
  }
  res.json({ alertaPresenca: alerta });
}));

module.exports = router;
