'use strict';
/* =====================================================================
 *  /api/seguranca — log de segurança do colégio atual   [somente admin]
 *
 *  GET /log?tipo=login_falha&pagina=1&limite=50
 *
 *  Não existe rota para apagar o log: registro de auditoria não deve
 *  poder ser limpo por quem é auditado.
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm } = require('../db');
const { assincrono } = require('../middleware/erros');
const v = require('../utils/validar');

const TIPOS = ['login_ok', 'login_falha', 'logout', 'timeout', 'cadastro', 'admin', 'privacidade'];

router.get('/log', assincrono(async (req, res) => {
  const tipo = v.umDe(req.query.tipo || null, TIPOS, 'Tipo', { obrigatorio: false });
  const limite = v.inteiro(req.query.limite, 'Limite', { min: 1, max: 200 }) || 50;
  const pagina = v.inteiro(req.query.pagina, 'Página', { min: 1, max: 100000 }) || 1;

  const filtro = tipo ? ' AND l.tipo = ?' : '';
  const params = tipo ? [req.colegioId, tipo] : [req.colegioId];

  const total = (await queryUm(`SELECT COUNT(*) AS n FROM log_seguranca l WHERE l.colegio_id = ?${filtro}`, params)).n;
  const itens = await query(
    `SELECT l.id, l.tipo, l.email, l.detalhes, l.ip, l.dispositivo, l.criado_em, u.nome
       FROM log_seguranca l
       LEFT JOIN usuarios u ON u.id = l.usuario_id
      WHERE l.colegio_id = ?${filtro}
      ORDER BY l.id DESC
      LIMIT ? OFFSET ?`,
    [...params, limite, (pagina - 1) * limite]
  );

  res.json({
    total,
    pagina,
    limite,
    itens: itens.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      usuario: l.nome,
      email: l.email,
      detalhes: l.detalhes,
      ip: l.ip,
      dispositivo: l.dispositivo,
      data: l.criado_em
    }))
  });
}));

module.exports = router;
