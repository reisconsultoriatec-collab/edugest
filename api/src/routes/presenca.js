'use strict';
/* =====================================================================
 *  /api/presenca — usuários online
 *
 *  POST /sinal                 { aba, ativo } a cada minuto, de cada aba aberta
 *                              → { encerrada, online? (só administrador) }
 *  POST /saida                 { aba } fechou a aba ou saiu
 *  GET  /online                [admin] equipe online, responsáveis (só número)
 *                              e quem está fora com "visto por último"
 *  POST /encerrar/:usuarioId   [admin] encerra a sessão da pessoa neste colégio
 *                              (outro administrador: só o proprietário)
 *
 *  Sinal e saída não contam no limite de requisições por IP (server.js).
 * ===================================================================== */
const router = require('express').Router();
const { assincrono } = require('../middleware/erros');
const { exigirPerfil } = require('../middleware/auth');
const v = require('../utils/validar');
const { agoraSP } = require('../utils/datas');
const { seguranca } = require('../utils/auditoria');
const { ehProprietario } = require('../utils/proprietario');
const p = require('../services/presenca');

router.post('/sinal', assincrono(async (req, res) => {
  const b = req.body || {};
  const agora = agoraSP();
  const r = await p.sinal({
    aba: b.aba, usuarioId: req.usuario.id, colegioId: req.colegioId, perfil: req.perfil,
    ativo: b.ativo !== false, ua: req.headers['user-agent'], agora
  });
  if (!r.encerrada && req.perfil === 'admin') r.online = await p.contar(req.colegioId, agora);
  res.set('Cache-Control', 'no-store');
  res.json({ ...r, intervaloSeg: p.INTERVALO_SEG });
}));

router.post('/saida', assincrono(async (req, res) => {
  await p.saida({ aba: (req.body || {}).aba, usuarioId: req.usuario.id });
  res.status(204).end();
}));

router.get('/online', exigirPerfil('admin'), assincrono(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await p.listar(req.colegioId, { agora: agoraSP(), euId: req.usuario.id, proprietario: ehProprietario(req.firebase) }));
}));

router.post('/encerrar/:usuarioId', exigirPerfil('admin'), assincrono(async (req, res) => {
  const alvo = v.id(req.params.usuarioId);
  const r = await p.encerrar(req.colegioId, alvo, { agora: agoraSP(), euId: req.usuario.id, proprietario: ehProprietario(req.firebase) });
  await seguranca(req, {
    tipo: 'admin', colegioId: req.colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: `Encerrou a sessão de ${r.nome}${r.abas > 1 ? ` (${r.abas} abas)` : ''}`
  });
  res.json(r);
}));

module.exports = router;
