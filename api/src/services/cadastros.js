'use strict';
/* =====================================================================
 *  Cadastros pendentes num colégio — a mesma regra para o admin do
 *  colégio (Sistema › Usuários, /api/usuarios) e para o proprietário do
 *  sistema (Gestão de Colégios, /api/proprietario).
 *
 *  Rodam dentro de transação (conn).
 * ===================================================================== */
const { HttpErro } = require('../middleware/erros');
const v = require('../utils/validar');
const { MODULOS } = require('../utils/modulos');

const PERFIS_EQUIPE = ['admin', 'professor', 'financeiro'];

/** Valida lista de módulos; null = usar o padrão do perfil. */
function lerModulos(valor) {
  if (valor === undefined || valor === null) return null;
  if (!Array.isArray(valor)) throw new HttpErro(400, 'Módulos inválidos', 'validacao');
  const lista = [...new Set(valor.filter((m) => MODULOS.includes(m)))];
  if (!lista.length) throw new HttpErro(400, 'Selecione pelo menos um módulo', 'validacao');
  return lista;
}

async function buscarVinculo(conn, usuarioId, colegioId) {
  const [[vinc]] = await conn.query(
    `SELECT uc.perfil, uc.status, uc.direcao, u.nome, u.email
       FROM usuario_colegio uc JOIN usuarios u ON u.id = uc.usuario_id
      WHERE uc.usuario_id = ? AND uc.colegio_id = ?
      FOR UPDATE`,
    [usuarioId, colegioId]
  );
  if (!vinc) throw new HttpErro(404, 'Usuário não encontrado neste colégio', 'nao_encontrado');
  return vinc;
}

/**
 * Aprova um cadastro pendente. Responsável continua responsável; a equipe
 * pode receber o perfil (e os módulos, fora do admin) na aprovação.
 * @returns {Promise<{nome, email, perfil, status}>}
 */
async function aprovarPendente(conn, { colegioId, usuarioId, perfil: perfilPedido, modulos: modulosBrutos, aprovadoPor }) {
  const vinc = await buscarVinculo(conn, usuarioId, colegioId);
  if (vinc.status !== 'pendente') throw new HttpErro(409, 'Este cadastro não está pendente', 'nao_pendente');

  let perfil = vinc.perfil;
  let modulos = null;
  if (perfil !== 'responsavel') {
    if (perfilPedido !== undefined) perfil = v.umDe(perfilPedido, PERFIS_EQUIPE, 'Perfil');
    if (perfil !== 'admin') modulos = lerModulos(modulosBrutos);
  }

  await conn.query(
    `UPDATE usuario_colegio
        SET status = 'ativo', perfil = ?, modulos = ?, aprovado_por = ?, aprovado_em = NOW()
      WHERE usuario_id = ? AND colegio_id = ?`,
    [perfil, modulos ? JSON.stringify(modulos) : null, aprovadoPor, usuarioId, colegioId]
  );
  return { ...vinc, perfil };
}

/** Recusa um cadastro pendente: some o vínculo (e os alunos, se responsável). */
async function rejeitarPendente(conn, { colegioId, usuarioId }) {
  const vinc = await buscarVinculo(conn, usuarioId, colegioId);
  if (vinc.status !== 'pendente') throw new HttpErro(409, 'Este cadastro não está pendente', 'nao_pendente');
  await conn.query('DELETE FROM responsavel_aluno WHERE usuario_id = ? AND colegio_id = ?', [usuarioId, colegioId]);
  await conn.query('DELETE FROM usuario_colegio WHERE usuario_id = ? AND colegio_id = ?', [usuarioId, colegioId]);
  await conn.query('UPDATE usuarios SET colegio_atual_id = NULL WHERE id = ? AND colegio_atual_id = ?', [usuarioId, colegioId]);
  return vinc;
}

module.exports = { PERFIS_EQUIPE, lerModulos, buscarVinculo, aprovarPendente, rejeitarPendente };
