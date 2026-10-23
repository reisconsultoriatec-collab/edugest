'use strict';
/* =====================================================================
 *  Autenticação e isolamento por colégio
 *
 *  autenticar      → valida o token do Firebase (header Authorization)
 *  carregarUsuario → busca o usuário no MySQL (req.usuario ou null)
 *  exigirUsuario   → 403 se ainda não tem cadastro no EduGest
 *  exigirColegio   → confere vínculo ATIVO com o colégio do header
 *                    X-Colegio-Id e preenche req.colegioId / req.perfil / req.modulos
 *  exigirPerfil(...perfis) e exigirModulo(modulo) → controle de acesso
 * ===================================================================== */
const admin = require('../firebase');
const { queryUm } = require('../db');
const { HttpErro } = require('./erros');
const { modulosEfetivos } = require('../utils/modulos');

async function autenticar(req, res, next) {
  const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return next(new HttpErro(401, 'Não autenticado', 'sem_token'));
  try {
    const dec = await admin.auth().verifyIdToken(m[1]);
    req.firebase = {
      uid: dec.uid,
      email: String(dec.email || '').toLowerCase(),
      emailVerificado: !!dec.email_verified,
      nome: dec.name || ''
    };
    return next();
  } catch (e) {
    return next(new HttpErro(401, 'Sessão inválida ou expirada. Faça login novamente.', 'token_invalido'));
  }
}

async function carregarUsuario(req, res, next) {
  try {
    req.usuario = await queryUm(
      'SELECT id, firebase_uid, nome, email, colegio_atual_id, tour_concluido FROM usuarios WHERE firebase_uid = ?',
      [req.firebase.uid]
    );
    return next();
  } catch (e) {
    return next(e);
  }
}

function exigirUsuario(req, res, next) {
  if (!req.usuario) return next(new HttpErro(403, 'Cadastro não encontrado no EduGest', 'sem_cadastro'));
  return next();
}

async function exigirColegio(req, res, next) {
  try {
    if (!req.usuario) throw new HttpErro(403, 'Cadastro não encontrado no EduGest', 'sem_cadastro');

    const bruto = req.headers['x-colegio-id'] || req.usuario.colegio_atual_id;
    const colegioId = Number(bruto);
    if (!Number.isInteger(colegioId) || colegioId <= 0) {
      throw new HttpErro(400, 'Colégio não informado', 'sem_colegio');
    }

    const vinculo = await queryUm(
      `SELECT uc.perfil, uc.status, uc.modulos
         FROM usuario_colegio uc
         JOIN colegios c ON c.id = uc.colegio_id AND c.ativo = 1
        WHERE uc.usuario_id = ? AND uc.colegio_id = ?`,
      [req.usuario.id, colegioId]
    );

    if (!vinculo) throw new HttpErro(403, 'Você não tem acesso a este colégio', 'sem_vinculo');
    if (vinculo.status === 'pendente') throw new HttpErro(403, 'Seu acesso aguarda aprovação do administrador', 'pendente');
    if (vinculo.status !== 'ativo') throw new HttpErro(403, 'Seu acesso a este colégio está bloqueado', 'bloqueado');

    req.colegioId = colegioId;
    req.perfil = vinculo.perfil;
    req.modulos = modulosEfetivos(vinculo.perfil, vinculo.modulos);
    return next();
  } catch (e) {
    return next(e);
  }
}

function exigirPerfil(...perfis) {
  return (req, res, next) => {
    if (!perfis.includes(req.perfil)) return next(new HttpErro(403, 'Acesso restrito ao seu perfil', 'perfil'));
    return next();
  };
}

function exigirModulo(modulo) {
  return (req, res, next) => {
    if (req.perfil === 'admin' || (req.modulos || []).includes(modulo)) return next();
    return next(new HttpErro(403, 'Você não tem acesso a este módulo', 'modulo'));
  };
}

module.exports = {
  autenticar,
  carregarUsuario,
  exigirUsuario,
  exigirColegio,
  exigirPerfil,
  exigirModulo
};
