'use strict';
/* =====================================================================
 *  /api/usuarios — gestão dos usuários do colégio atual   [somente admin]
 *
 *  GET    /                lista equipe e responsáveis (pendentes primeiro)
 *  POST   /vincular        vincula conta existente por e-mail (já ativo)
 *  POST   /:id/aprovar     aprova cadastro pendente (pode definir perfil/módulos)
 *  POST   /:id/rejeitar    recusa cadastro pendente
 *  PUT    /:id             muda perfil, módulos ou bloqueia/desbloqueia
 *  DELETE /:id             remove o acesso ao colégio
 *
 *  :id = usuarios.id. Tudo é restrito ao colégio atual: um admin nunca
 *  enxerga ou altera usuários de outro colégio.
 * ===================================================================== */
const router = require('express').Router();
const { query, transacao } = require('../db');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { seguranca, atividade } = require('../utils/auditoria');
const { MODULOS, modulosEfetivos } = require('../utils/modulos');

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
    `SELECT uc.perfil, uc.status, u.nome, u.email
       FROM usuario_colegio uc JOIN usuarios u ON u.id = uc.usuario_id
      WHERE uc.usuario_id = ? AND uc.colegio_id = ?
      FOR UPDATE`,
    [usuarioId, colegioId]
  );
  if (!vinc) throw new HttpErro(404, 'Usuário não encontrado neste colégio', 'nao_encontrado');
  return vinc;
}

/** Impede que o colégio fique sem nenhum admin ativo. */
async function garantirOutroAdmin(conn, colegioId, usuarioId) {
  const [[r]] = await conn.query(
    `SELECT COUNT(*) AS n FROM usuario_colegio
      WHERE colegio_id = ? AND perfil = 'admin' AND status = 'ativo' AND usuario_id <> ?
      FOR UPDATE`,
    [colegioId, usuarioId]
  );
  if (r.n === 0) throw new HttpErro(409, 'O colégio precisa ter pelo menos um administrador ativo', 'ultimo_admin');
}

function naoPodeSerVoce(req, usuarioId) {
  if (usuarioId === req.usuario.id) {
    throw new HttpErro(400, 'Você não pode alterar o seu próprio acesso. Peça a outro administrador.', 'proprio_usuario');
  }
}

/* ---------------- Listar ---------------- */
router.get('/', assincrono(async (req, res) => {
  const linhas = await query(
    `SELECT u.id, u.nome, u.email, u.ultimo_acesso,
            uc.perfil, uc.status, uc.modulos, uc.criado_em, uc.aprovado_em,
            (SELECT GROUP_CONCAT(a.nome ORDER BY a.nome SEPARATOR '|')
               FROM responsavel_aluno ra JOIN alunos a ON a.id = ra.aluno_id
              WHERE ra.usuario_id = u.id AND ra.colegio_id = uc.colegio_id) AS alunos
       FROM usuario_colegio uc
       JOIN usuarios u ON u.id = uc.usuario_id
      WHERE uc.colegio_id = ?
      ORDER BY (uc.status = 'pendente') DESC, u.nome`,
    [req.colegioId]
  );
  res.json(linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    email: l.email,
    perfil: l.perfil,
    status: l.status,
    modulos: modulosEfetivos(l.perfil, l.modulos),
    modulosPersonalizados: l.modulos !== null && l.perfil !== 'admin' && l.perfil !== 'responsavel',
    alunos: l.alunos ? l.alunos.split('|') : [],
    desde: l.criado_em,
    aprovadoEm: l.aprovado_em,
    ultimoAcesso: l.ultimo_acesso,
    voce: l.id === req.usuario.id
  })));
}));

/* ---------------- Vincular por e-mail ---------------- */
router.post('/vincular', assincrono(async (req, res) => {
  const email = v.email(req.body.email, 'E-mail', true);
  const perfil = v.umDe(req.body.perfil, PERFIS_EQUIPE, 'Perfil');
  const modulos = perfil === 'admin' ? null : lerModulos(req.body.modulos);

  const r = await transacao(async (conn) => {
    const [[u]] = await conn.query('SELECT id, nome FROM usuarios WHERE email = ?', [email]);
    if (!u) {
      throw new HttpErro(404, 'Nenhuma conta com este e-mail. A pessoa precisa criar a conta no EduGest primeiro.', 'sem_conta');
    }
    const [[existe]] = await conn.query(
      'SELECT status FROM usuario_colegio WHERE usuario_id = ? AND colegio_id = ?',
      [u.id, req.colegioId]
    );
    if (existe) throw new HttpErro(409, 'Este usuário já está vinculado a este colégio', 'ja_vinculado');

    await conn.query(
      `INSERT INTO usuario_colegio (usuario_id, colegio_id, perfil, status, modulos, aprovado_por, aprovado_em)
       VALUES (?, ?, ?, 'ativo', ?, ?, NOW())`,
      [u.id, req.colegioId, perfil, modulos ? JSON.stringify(modulos) : null, req.usuario.id]
    );
    return u;
  });

  await seguranca(req, {
    tipo: 'admin', colegioId: req.colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: `Vinculou ${r.nome} (${email}) como ${perfil}`
  });
  await atividade(req.colegioId, req.usuario.id, `Usuário ${r.nome} vinculado como ${perfil}`);
  res.status(201).json({ id: r.id, nome: r.nome, perfil });
}));

/* ---------------- Aprovar ---------------- */
router.post('/:id/aprovar', assincrono(async (req, res) => {
  const usuarioId = v.id(req.params.id);

  const r = await transacao(async (conn) => {
    const vinc = await buscarVinculo(conn, usuarioId, req.colegioId);
    if (vinc.status !== 'pendente') throw new HttpErro(409, 'Este cadastro não está pendente', 'nao_pendente');

    // Responsável continua responsável; equipe pode ter o perfil definido na aprovação
    let perfil = vinc.perfil;
    let modulos = null;
    if (perfil !== 'responsavel') {
      if (req.body.perfil !== undefined) perfil = v.umDe(req.body.perfil, PERFIS_EQUIPE, 'Perfil');
      if (perfil !== 'admin') modulos = lerModulos(req.body.modulos);
    }

    await conn.query(
      `UPDATE usuario_colegio
          SET status = 'ativo', perfil = ?, modulos = ?, aprovado_por = ?, aprovado_em = NOW()
        WHERE usuario_id = ? AND colegio_id = ?`,
      [perfil, modulos ? JSON.stringify(modulos) : null, req.usuario.id, usuarioId, req.colegioId]
    );
    return { ...vinc, perfil };
  });

  await seguranca(req, {
    tipo: 'admin', colegioId: req.colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: `Aprovou ${r.nome} (${r.email}) como ${r.perfil}`
  });
  await atividade(req.colegioId, req.usuario.id, `Usuário ${r.nome} aprovado`);
  res.json({ id: usuarioId, perfil: r.perfil, status: 'ativo' });
}));

/* ---------------- Rejeitar ---------------- */
router.post('/:id/rejeitar', assincrono(async (req, res) => {
  const usuarioId = v.id(req.params.id);

  const r = await transacao(async (conn) => {
    const vinc = await buscarVinculo(conn, usuarioId, req.colegioId);
    if (vinc.status !== 'pendente') throw new HttpErro(409, 'Este cadastro não está pendente', 'nao_pendente');
    await conn.query('DELETE FROM responsavel_aluno WHERE usuario_id = ? AND colegio_id = ?', [usuarioId, req.colegioId]);
    await conn.query('DELETE FROM usuario_colegio WHERE usuario_id = ? AND colegio_id = ?', [usuarioId, req.colegioId]);
    await conn.query('UPDATE usuarios SET colegio_atual_id = NULL WHERE id = ? AND colegio_atual_id = ?', [usuarioId, req.colegioId]);
    return vinc;
  });

  await seguranca(req, {
    tipo: 'admin', colegioId: req.colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: `Rejeitou o cadastro de ${r.nome} (${r.email})`
  });
  res.status(204).end();
}));

/* ---------------- Alterar perfil / módulos / status ---------------- */
router.put('/:id', assincrono(async (req, res) => {
  const usuarioId = v.id(req.params.id);
  naoPodeSerVoce(req, usuarioId);

  const r = await transacao(async (conn) => {
    const vinc = await buscarVinculo(conn, usuarioId, req.colegioId);
    if (vinc.status === 'pendente') throw new HttpErro(409, 'Aprove ou rejeite o cadastro primeiro', 'pendente');

    let perfil = vinc.perfil;
    if (req.body.perfil !== undefined) {
      if (vinc.perfil === 'responsavel') throw new HttpErro(400, 'O perfil de responsável não pode ser alterado', 'validacao');
      perfil = v.umDe(req.body.perfil, PERFIS_EQUIPE, 'Perfil');
    }
    const status = req.body.status !== undefined ? v.umDe(req.body.status, ['ativo', 'bloqueado'], 'Status') : vinc.status;

    // Tirar alguém da condição de admin ativo exige que reste outro
    const deixaDeSerAdminAtivo = vinc.perfil === 'admin' && vinc.status === 'ativo' && (perfil !== 'admin' || status !== 'ativo');
    if (deixaDeSerAdminAtivo) await garantirOutroAdmin(conn, req.colegioId, usuarioId);

    let modulosSql = null;
    if (perfil !== 'admin' && perfil !== 'responsavel') {
      const m = req.body.modulos !== undefined ? lerModulos(req.body.modulos) : undefined;
      if (m !== undefined) {
        modulosSql = m ? JSON.stringify(m) : null;
      } else if (perfil === vinc.perfil) {
        // Mantém a personalização atual se o perfil não mudou
        const [[atual]] = await conn.query(
          'SELECT modulos FROM usuario_colegio WHERE usuario_id = ? AND colegio_id = ?',
          [usuarioId, req.colegioId]
        );
        modulosSql = atual.modulos === null ? null
          : (typeof atual.modulos === 'string' ? atual.modulos : JSON.stringify(atual.modulos));
      }
    }

    await conn.query(
      'UPDATE usuario_colegio SET perfil = ?, status = ?, modulos = ? WHERE usuario_id = ? AND colegio_id = ?',
      [perfil, status, modulosSql, usuarioId, req.colegioId]
    );
    return { ...vinc, perfilNovo: perfil, statusNovo: status };
  });

  const mudancas = [];
  if (r.perfil !== r.perfilNovo) mudancas.push(`perfil ${r.perfil} → ${r.perfilNovo}`);
  if (r.status !== r.statusNovo) mudancas.push(r.statusNovo === 'bloqueado' ? 'bloqueado' : 'desbloqueado');
  if (!mudancas.length) mudancas.push('módulos atualizados');
  await seguranca(req, {
    tipo: 'admin', colegioId: req.colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: `Alterou ${r.nome}: ${mudancas.join(', ')}`
  });
  res.json({ id: usuarioId, perfil: r.perfilNovo, status: r.statusNovo });
}));

/* ---------------- Remover do colégio ---------------- */
router.delete('/:id', assincrono(async (req, res) => {
  const usuarioId = v.id(req.params.id);
  naoPodeSerVoce(req, usuarioId);

  const r = await transacao(async (conn) => {
    const vinc = await buscarVinculo(conn, usuarioId, req.colegioId);
    if (vinc.perfil === 'admin' && vinc.status === 'ativo') await garantirOutroAdmin(conn, req.colegioId, usuarioId);
    await conn.query('DELETE FROM responsavel_aluno WHERE usuario_id = ? AND colegio_id = ?', [usuarioId, req.colegioId]);
    await conn.query('DELETE FROM usuario_colegio WHERE usuario_id = ? AND colegio_id = ?', [usuarioId, req.colegioId]);
    await conn.query('UPDATE professores SET usuario_id = NULL WHERE usuario_id = ? AND colegio_id = ?', [usuarioId, req.colegioId]);
    await conn.query('UPDATE usuarios SET colegio_atual_id = NULL WHERE id = ? AND colegio_atual_id = ?', [usuarioId, req.colegioId]);
    return vinc;
  });

  await seguranca(req, {
    tipo: 'admin', colegioId: req.colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: `Removeu o acesso de ${r.nome} (${r.email})`
  });
  await atividade(req.colegioId, req.usuario.id, `Usuário ${r.nome} removido do colégio`);
  res.status(204).end();
}));

module.exports = router;
