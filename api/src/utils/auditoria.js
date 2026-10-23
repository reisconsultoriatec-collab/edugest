'use strict';
/* =====================================================================
 *  Auditoria
 *   atividade() → "Atividade recente" do dashboard (o que foi feito)
 *   seguranca() → log de segurança (logins, falhas, ações de admin)
 *  Falha ao registrar nunca derruba a operação principal.
 * ===================================================================== */
const { query } = require('../db');
const { ipCliente } = require('./ip');

function dispositivo(ua) {
  ua = String(ua || '');
  let nav = 'Navegador';
  if (ua.includes('Edg/')) nav = 'Edge';
  else if (ua.includes('Chrome/')) nav = 'Chrome';
  else if (ua.includes('Firefox/')) nav = 'Firefox';
  else if (ua.includes('Safari/')) nav = 'Safari';
  else if (ua.includes('curl/')) nav = 'curl';
  let so = 'SO';
  if (ua.includes('Windows')) so = 'Windows';
  else if (ua.includes('Android')) so = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) so = 'iOS';
  else if (ua.includes('Mac OS')) so = 'macOS';
  else if (ua.includes('Linux')) so = 'Linux';
  return `${nav} / ${so}`;
}

/**
 * @param {number} colegioId
 * @param {number|null} usuarioId
 * @param {string} acao   texto puro (o front escapa ao exibir)
 * @param {object} [conn] conexão de transação, se houver
 */
async function atividade(colegioId, usuarioId, acao, conn) {
  try {
    const sql = 'INSERT INTO atividades (colegio_id, usuario_id, acao) VALUES (?, ?, ?)';
    const params = [colegioId, usuarioId || null, String(acao).slice(0, 255)];
    if (conn) await conn.query(sql, params);
    else await query(sql, params);
  } catch (e) {
    console.error('[auditoria] atividade:', e.message);
  }
}

/**
 * @param {object} req
 * @param {{tipo:string, colegioId?:number, usuarioId?:number, email?:string, detalhes?:string}} dados
 */
async function seguranca(req, { tipo, colegioId = null, usuarioId = null, email = null, detalhes = null }) {
  try {
    await query(
      `INSERT INTO log_seguranca (colegio_id, usuario_id, email, tipo, detalhes, ip, dispositivo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        colegioId,
        usuarioId,
        email ? String(email).slice(0, 160) : null,
        tipo,
        detalhes ? String(detalhes).slice(0, 255) : null,
        ipCliente(req).slice(0, 45),
        dispositivo(req.headers['user-agent'])
      ]
    );
  } catch (e) {
    console.error('[auditoria] seguranca:', e.message);
  }
}

module.exports = { atividade, seguranca, dispositivo };
