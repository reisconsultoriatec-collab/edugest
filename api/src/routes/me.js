'use strict';
/* =====================================================================
 *  /api/me — dados do usuário logado
 *
 *  GET /api/me         → cadastro + colégios em que tem vínculo
 *  GET /api/me/acesso  → perfil e módulos no colégio do header X-Colegio-Id
 *  PUT /api/me/colegio-atual, /nome, /tour
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm } = require('../db');
const { HttpErro, assincrono } = require('../middleware/erros');
const { exigirColegio, exigirUsuario } = require('../middleware/auth');
const v = require('../utils/validar');
const { modulosEfetivos } = require('../utils/modulos');
const { agoraSP } = require('../utils/datas');
const { ipCliente } = require('../utils/ip');

router.get('/', assincrono(async (req, res) => {
  if (!req.usuario) {
    return res.json({
      cadastrado: false,
      email: req.firebase.email,
      emailVerificado: req.firebase.emailVerificado
    });
  }

  const u = req.usuario;
  const colegios = await query(
    `SELECT c.id, c.nome, uc.perfil, uc.status, uc.modulos
       FROM usuario_colegio uc
       JOIN colegios c ON c.id = uc.colegio_id AND c.ativo = 1
      WHERE uc.usuario_id = ?
      ORDER BY c.nome`,
    [u.id]
  );

  await query('UPDATE usuarios SET ultimo_acesso = ?, ultimo_ip = ? WHERE id = ?', [agoraSP(), ipCliente(req), u.id]);

  return res.json({
    cadastrado: true,
    emailVerificado: req.firebase.emailVerificado,
    usuario: {
      id: u.id,
      nome: u.nome,
      email: u.email,
      colegioAtualId: u.colegio_atual_id,
      tourConcluido: !!u.tour_concluido
    },
    colegios: colegios.map((c) => ({
      id: c.id,
      nome: c.nome,
      perfil: c.perfil,
      status: c.status,
      modulos: c.status === 'ativo' ? modulosEfetivos(c.perfil, c.modulos) : []
    }))
  });
}));

router.get('/acesso', exigirColegio, (req, res) => {
  res.json({ colegioId: req.colegioId, perfil: req.perfil, modulos: req.modulos });
});

/* PUT /api/me/colegio-atual { colegioId } — troca de colégio no seletor */
router.put('/colegio-atual', exigirUsuario, assincrono(async (req, res) => {
  const colegioId = v.inteiro(req.body.colegioId, 'Colégio', { min: 1, obrigatorio: true });
  const vinc = await queryUm(
    `SELECT uc.perfil, uc.status, uc.modulos, c.nome
       FROM usuario_colegio uc JOIN colegios c ON c.id = uc.colegio_id AND c.ativo = 1
      WHERE uc.usuario_id = ? AND uc.colegio_id = ?`,
    [req.usuario.id, colegioId]
  );
  if (!vinc) throw new HttpErro(403, 'Você não tem acesso a este colégio', 'sem_vinculo');
  await query('UPDATE usuarios SET colegio_atual_id = ? WHERE id = ?', [colegioId, req.usuario.id]);
  res.json({
    colegioId,
    nome: vinc.nome,
    perfil: vinc.perfil,
    status: vinc.status,
    modulos: vinc.status === 'ativo' ? modulosEfetivos(vinc.perfil, vinc.modulos) : []
  });
}));

/* PUT /api/me/nome { nome } */
router.put('/nome', exigirUsuario, assincrono(async (req, res) => {
  const nome = v.texto(req.body.nome, 'Nome', { max: 100, min: 3, obrigatorio: true });
  await query('UPDATE usuarios SET nome = ? WHERE id = ?', [nome, req.usuario.id]);
  res.json({ nome });
}));

/* PUT /api/me/tour — marca o tour guiado como concluído */
router.put('/tour', exigirUsuario, assincrono(async (req, res) => {
  await query('UPDATE usuarios SET tour_concluido = 1 WHERE id = ?', [req.usuario.id]);
  res.status(204).end();
}));

module.exports = router;
