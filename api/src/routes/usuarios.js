'use strict';
/* =====================================================================
 *  /api/usuarios — gestão dos usuários do colégio atual   [somente admin]
 *
 *  GET    /                lista equipe e responsáveis (pendentes primeiro)
 *  POST   /vincular        vincula conta existente por e-mail (já ativo)
 *  POST   /:id/aprovar     aprova cadastro pendente (pode definir perfil/módulos)
 *  POST   /:id/rejeitar    recusa cadastro pendente
 *  PUT    /:id             muda perfil, módulos, alta direção (só admin) ou bloqueia/desbloqueia
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
const { modulosEfetivos } = require('../utils/modulos');
const { PERFIS_EQUIPE, lerModulos, buscarVinculo, aprovarPendente, rejeitarPendente } = require('../services/cadastros');

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

/**
 * Vincula o login ao cadastro de professor (o que libera as turmas
 * atribuídas no Diário e nas Notas).
 *   valor undefined → não altera · null/'' → desfaz o vínculo
 *   número → vincula ao cadastro existente · 'novo' → cria o cadastro
 * Retorna o texto para o log, ou null se nada mudou.
 */
async function vincularProfessor(conn, colegioId, usuario, perfil, valor) {
  if (valor === undefined) return null;
  if (valor !== null && valor !== '' && !['admin', 'professor'].includes(perfil)) {
    throw new HttpErro(400, 'Só professores e administradores podem ser vinculados a um cadastro de professor', 'validacao');
  }
  const [[atual]] = await conn.query(
    'SELECT id, nome FROM professores WHERE colegio_id = ? AND usuario_id = ? LIMIT 1 FOR UPDATE',
    [colegioId, usuario.id]
  );

  if (valor === null || valor === '') {
    if (!atual) return null;
    await conn.query('UPDATE professores SET usuario_id = NULL WHERE colegio_id = ? AND usuario_id = ?', [colegioId, usuario.id]);
    return `desvinculado do cadastro de professor ${atual.nome}`;
  }

  if (valor === 'novo') {
    if (atual) throw new HttpErro(409, `Este login já está vinculado ao cadastro de ${atual.nome}`, 'duplicado');
    await conn.query(
      "INSERT INTO professores (colegio_id, usuario_id, nome, email, status) VALUES (?, ?, ?, ?, 'ativo')",
      [colegioId, usuario.id, usuario.nome, usuario.email]
    );
    return 'cadastro de professor criado e vinculado';
  }

  const id = v.inteiro(valor, 'Cadastro de professor', { min: 1, obrigatorio: true });
  if (atual && atual.id === id) return null;
  const [[p]] = await conn.query('SELECT id, nome, usuario_id FROM professores WHERE id = ? AND colegio_id = ? FOR UPDATE', [id, colegioId]);
  if (!p) throw new HttpErro(400, 'Cadastro de professor inválido', 'validacao');
  if (p.usuario_id && p.usuario_id !== usuario.id) {
    const [[outro]] = await conn.query('SELECT nome FROM usuarios WHERE id = ?', [p.usuario_id]);
    throw new HttpErro(409, `O cadastro de ${p.nome} já está vinculado ao login de ${outro ? outro.nome : 'outro usuário'}`, 'duplicado');
  }
  if (atual) await conn.query('UPDATE professores SET usuario_id = NULL WHERE id = ?', [atual.id]);
  await conn.query('UPDATE professores SET usuario_id = ? WHERE id = ?', [usuario.id, id]);
  return `vinculado ao cadastro de professor ${p.nome}`;
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
            uc.perfil, uc.status, uc.modulos, uc.direcao, uc.criado_em, uc.aprovado_em,
            (SELECT GROUP_CONCAT(a.nome ORDER BY a.nome SEPARATOR '|')
               FROM responsavel_aluno ra JOIN alunos a ON a.id = ra.aluno_id
              WHERE ra.usuario_id = u.id AND ra.colegio_id = uc.colegio_id) AS alunos,
            (SELECT p.id FROM professores p WHERE p.colegio_id = uc.colegio_id AND p.usuario_id = u.id LIMIT 1) AS professor_id,
            (SELECT p.nome FROM professores p WHERE p.colegio_id = uc.colegio_id AND p.usuario_id = u.id LIMIT 1) AS professor_nome
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
    direcao: l.perfil === 'admin' && !!l.direcao,
    alunos: l.alunos ? l.alunos.split('|') : [],
    professor: l.professor_id ? { id: l.professor_id, nome: l.professor_nome } : null,
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
    // Responsável continua responsável; equipe pode ter o perfil definido na aprovação
    const ap = await aprovarPendente(conn, {
      colegioId: req.colegioId, usuarioId, perfil: req.body.perfil, modulos: req.body.modulos, aprovadoPor: req.usuario.id
    });
    const professor = ap.perfil === 'responsavel' ? null
      : await vincularProfessor(conn, req.colegioId, { id: usuarioId, nome: ap.nome, email: ap.email }, ap.perfil, req.body.professorId);
    return { ...ap, professor };
  });

  await seguranca(req, {
    tipo: 'admin', colegioId: req.colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: `Aprovou ${r.nome} (${r.email}) como ${r.perfil}${r.professor ? ' · ' + r.professor : ''}`
  });
  await atividade(req.colegioId, req.usuario.id, `Usuário ${r.nome} aprovado`);
  res.json({ id: usuarioId, perfil: r.perfil, status: 'ativo' });
}));

/* ---------------- Rejeitar ---------------- */
router.post('/:id/rejeitar', assincrono(async (req, res) => {
  const usuarioId = v.id(req.params.id);

  const r = await transacao((conn) => rejeitarPendente(conn, { colegioId: req.colegioId, usuarioId }));

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
    // Alta direção (Painel da Direção): só administradores; quem deixa de ser admin perde
    if (req.body.direcao !== undefined && typeof req.body.direcao !== 'boolean') throw new HttpErro(400, 'Alta direção inválida', 'validacao');
    if (req.body.direcao === true && perfil !== 'admin') throw new HttpErro(400, 'Só administradores podem ver o Painel da Direção', 'validacao');
    const direcao = perfil === 'admin' && (req.body.direcao !== undefined ? req.body.direcao : !!vinc.direcao);

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
      'UPDATE usuario_colegio SET perfil = ?, status = ?, modulos = ?, direcao = ? WHERE usuario_id = ? AND colegio_id = ?',
      [perfil, status, modulosSql, direcao ? 1 : 0, usuarioId, req.colegioId]
    );
    const professor = perfil === 'responsavel' ? null
      : await vincularProfessor(conn, req.colegioId, { id: usuarioId, nome: vinc.nome, email: vinc.email }, perfil, req.body.professorId);
    return { ...vinc, perfilNovo: perfil, statusNovo: status, direcaoNova: direcao, professor };
  });

  const mudancas = [];
  if (r.perfil !== r.perfilNovo) mudancas.push(`perfil ${r.perfil} → ${r.perfilNovo}`);
  if (r.status !== r.statusNovo) mudancas.push(r.statusNovo === 'bloqueado' ? 'bloqueado' : 'desbloqueado');
  if (!!r.direcao !== r.direcaoNova) mudancas.push(r.direcaoNova ? 'Painel da Direção liberado' : 'Painel da Direção retirado');
  if (r.professor) mudancas.push(r.professor);
  if (!mudancas.length) mudancas.push('módulos atualizados');
  await seguranca(req, {
    tipo: 'admin', colegioId: req.colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: `Alterou ${r.nome}: ${mudancas.join(', ')}`
  });
  res.json({ id: usuarioId, perfil: r.perfilNovo, status: r.statusNovo, direcao: r.direcaoNova });
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
