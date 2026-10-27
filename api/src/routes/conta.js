'use strict';
/* =====================================================================
 *  /api/conta — cadastro e eventos de login
 *
 *  POST /registrar              equipe: entra pelo código do colégio (pendente).
 *                               Colégio novo só o proprietário do sistema cria.
 *  POST /entrar-colegio         quem já tem cadastro e ficou sem colégio pede
 *                               acesso com o código do colégio (pendente)
 *  POST /registrar-responsavel  responsável pelo código PAI do aluno (pendente)
 *  POST /falha-login            público: registra senha errada no log
 *  POST /evento                 login_ok | logout | timeout | senha_redefinida no log
 *
 *  Fluxo no front: createUserWithEmailAndPassword → POST /registrar.
 *  Se o código for inválido, nada é gravado no MySQL e o usuário pode
 *  tentar de novo com a mesma conta do Firebase.
 * ===================================================================== */
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { queryUm, transacao } = require('../db');
const { autenticar, carregarUsuario } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { seguranca } = require('../utils/auditoria');
const { ipCliente } = require('../utils/ip');
const { criarColegio } = require('../services/colegios');
const { situacaoProprietario } = require('../utils/proprietario');

const limite = (max, minutos = 15) => rateLimit({
  windowMs: minutos * 60 * 1000,
  limit: max,
  keyGenerator: ipCliente,
  validate: false,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { erro: `Muitas tentativas. Aguarde ${minutos} minutos.`, codigo: 'limite' }
});

// Cadastro: poucas tentativas por IP (protege contra adivinhar códigos)
const limiteCadastro = limite(10);
const limiteFalha = limite(30);

/* ---------------- Equipe ---------------- */
router.post('/registrar', limiteCadastro, autenticar, carregarUsuario, assincrono(async (req, res) => {
  if (req.usuario) throw new HttpErro(409, 'Você já possui cadastro no EduGest. Faça login.', 'ja_cadastrado');
  if (!req.firebase.email) throw new HttpErro(400, 'Conta sem e-mail', 'sem_email');

  const nome = v.texto(req.body.nome, 'Nome', { max: 100, min: 3, obrigatorio: true });
  const convite = v.texto(req.body.codigoConvite, 'Código do colégio', { max: 20 });
  const colegioNome = convite ? null : v.texto(req.body.colegioNome, 'Nome do colégio', { max: 120, min: 3 });
  if (!convite && !colegioNome) {
    throw new HttpErro(400, 'Informe o código do colégio. Peça o código ao administrador do seu colégio.', 'validacao');
  }
  // Colégio novo: exclusivo do proprietário do sistema
  if (colegioNome) {
    const s = situacaoProprietario(req.firebase);
    if (s === 'verificar') {
      throw new HttpErro(403, 'Confirme o seu e-mail (link enviado na criação da conta) e tente de novo para cadastrar o colégio.', 'email_nao_verificado');
    }
    if (s !== 'ativo') {
      await seguranca(req, {
        tipo: 'cadastro', email: req.firebase.email,
        detalhes: 'Tentou cadastrar colégio novo sem ser o proprietário do sistema (bloqueado)'
      });
      throw new HttpErro(403, 'O cadastro de colégios novos é feito somente pela Reis Tecnologia. Peça o código ao administrador do seu colégio.', 'proprietario');
    }
  }

  const r = await transacao(async (conn) => {
    const [u] = await conn.query(
      'INSERT INTO usuarios (firebase_uid, nome, email) VALUES (?, ?, ?)',
      [req.firebase.uid, nome, req.firebase.email]
    );
    const usuarioId = u.insertId;

    if (convite) {
      const [[col]] = await conn.query(
        'SELECT id, nome, whatsapp_notif, telefone FROM colegios WHERE codigo_convite = ? AND ativo = 1',
        [convite.toUpperCase()]
      );
      if (!col) throw new HttpErro(404, 'Código do colégio não encontrado', 'convite_invalido');

      await conn.query(
        `INSERT INTO usuario_colegio (usuario_id, colegio_id, perfil, status)
         VALUES (?, ?, 'professor', 'pendente')`,
        [usuarioId, col.id]
      );
      await conn.query('UPDATE usuarios SET colegio_atual_id = ? WHERE id = ?', [col.id, usuarioId]);
      return {
        usuarioId,
        colegio: { id: col.id, nome: col.nome },
        perfil: 'professor',
        status: 'pendente',
        whatsappAdmin: col.whatsapp_notif || col.telefone || null
      };
    }

    const colegioId = await criarColegio(conn, { nome: colegioNome, usuarioId });
    return { usuarioId, colegio: { id: colegioId, nome: colegioNome }, perfil: 'admin', status: 'ativo' };
  });

  await seguranca(req, {
    tipo: 'cadastro',
    colegioId: r.colegio.id,
    usuarioId: r.usuarioId,
    email: req.firebase.email,
    detalhes: r.status === 'pendente' ? 'Cadastro pelo código do colégio — aguardando aprovação' : 'Criou o colégio como administrador'
  });

  res.status(201).json(r);
}));

/* ---------------- Já cadastrado, sem colégio ----------------
 * Ex.: o acesso foi removido/recusado ou o colégio foi desativado. Pede
 * acesso a um colégio pelo código, como no cadastro (fica pendente). */
router.post('/entrar-colegio', limiteCadastro, autenticar, carregarUsuario, assincrono(async (req, res) => {
  if (!req.usuario) throw new HttpErro(403, 'Cadastro não encontrado no EduGest', 'sem_cadastro');
  const convite = v.texto(req.body.codigoConvite, 'Código do colégio', { max: 20, obrigatorio: true }).toUpperCase();

  const col = await queryUm(
    'SELECT id, nome, whatsapp_notif, telefone FROM colegios WHERE codigo_convite = ? AND ativo = 1',
    [convite]
  );
  if (!col) throw new HttpErro(404, 'Código do colégio não encontrado', 'convite_invalido');

  const vinculo = await queryUm(
    'SELECT perfil, status FROM usuario_colegio WHERE usuario_id = ? AND colegio_id = ?',
    [req.usuario.id, col.id]
  );
  if (vinculo) {
    const sit = vinculo.status === 'pendente' ? 'aguarda aprovação' : vinculo.status === 'bloqueado' ? 'está bloqueado' : 'já está ativo';
    throw new HttpErro(409, `Você já tem cadastro neste colégio (${sit}).`, 'ja_vinculado');
  }

  await transacao(async (conn) => {
    await conn.query(
      `INSERT INTO usuario_colegio (usuario_id, colegio_id, perfil, status)
       VALUES (?, ?, 'professor', 'pendente')`,
      [req.usuario.id, col.id]
    );
    await conn.query('UPDATE usuarios SET colegio_atual_id = ? WHERE id = ?', [col.id, req.usuario.id]);
  });

  await seguranca(req, {
    tipo: 'cadastro', colegioId: col.id, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: 'Pediu acesso pelo código do colégio — aguardando aprovação'
  });

  res.status(201).json({
    colegio: { id: col.id, nome: col.nome },
    perfil: 'professor',
    status: 'pendente',
    whatsappAdmin: col.whatsapp_notif || col.telefone || null
  });
}));

/* ---------------- Responsável ---------------- */
router.post('/registrar-responsavel', limiteCadastro, autenticar, carregarUsuario, assincrono(async (req, res) => {
  if (!req.firebase.email) throw new HttpErro(400, 'Conta sem e-mail', 'sem_email');

  const nome = v.texto(req.body.nome, 'Nome', { max: 100, min: 3, obrigatorio: !req.usuario });
  const parentesco = v.texto(req.body.parentesco, 'Parentesco', { max: 20 });
  const codigo = String(req.body.codigoAcesso || '').trim().toUpperCase();
  if (!/^PAI[A-Z0-9]{6}$/.test(codigo)) {
    throw new HttpErro(400, 'Código de acesso inválido. Formato: PAI + 6 caracteres.', 'codigo_invalido');
  }

  const aluno = await queryUm(
    "SELECT id, colegio_id, nome FROM alunos WHERE codigo_acesso = ? AND status = 'ativo'",
    [codigo]
  );
  if (!aluno) {
    await seguranca(req, {
      tipo: 'cadastro',
      usuarioId: req.usuario ? req.usuario.id : null,
      email: req.firebase.email,
      detalhes: 'Código de acesso de aluno não encontrado'
    });
    throw new HttpErro(404, 'Código de acesso não encontrado. Confira com a secretaria do colégio.', 'codigo_nao_encontrado');
  }

  const r = await transacao(async (conn) => {
    let usuarioId = req.usuario ? req.usuario.id : null;
    if (!usuarioId) {
      const [u] = await conn.query(
        'INSERT INTO usuarios (firebase_uid, nome, email, colegio_atual_id) VALUES (?, ?, ?, ?)',
        [req.firebase.uid, nome, req.firebase.email, aluno.colegio_id]
      );
      usuarioId = u.insertId;
    }

    const [[vinculo]] = await conn.query(
      'SELECT perfil, status FROM usuario_colegio WHERE usuario_id = ? AND colegio_id = ?',
      [usuarioId, aluno.colegio_id]
    );
    if (vinculo && vinculo.perfil !== 'responsavel') {
      throw new HttpErro(409, 'Este e-mail já pertence à equipe deste colégio. Use outro e-mail para o acesso de responsável.', 'perfil_conflito');
    }
    if (!vinculo) {
      await conn.query(
        `INSERT INTO usuario_colegio (usuario_id, colegio_id, perfil, status)
         VALUES (?, ?, 'responsavel', 'pendente')`,
        [usuarioId, aluno.colegio_id]
      );
    }
    await conn.query(
      'INSERT IGNORE INTO responsavel_aluno (usuario_id, aluno_id, colegio_id, parentesco) VALUES (?, ?, ?, ?)',
      [usuarioId, aluno.id, aluno.colegio_id, parentesco]
    );

    const [[col]] = await conn.query('SELECT nome, whatsapp_notif, telefone FROM colegios WHERE id = ?', [aluno.colegio_id]);
    return {
      usuarioId,
      colegio: { id: aluno.colegio_id, nome: col.nome },
      aluno: { id: aluno.id, nome: aluno.nome },
      perfil: 'responsavel',
      status: vinculo ? vinculo.status : 'pendente',
      whatsappAdmin: col.whatsapp_notif || col.telefone || null
    };
  });

  await seguranca(req, {
    tipo: 'cadastro',
    colegioId: r.colegio.id,
    usuarioId: r.usuarioId,
    email: req.firebase.email,
    detalhes: `Responsável cadastrado para o aluno ${aluno.nome}`
  });

  res.status(201).json(r);
}));

/* ---------------- Log de login ---------------- */

// Público (o usuário ainda não entrou). Sempre responde 204 para não
// revelar se o e-mail existe.
router.post('/falha-login', limiteFalha, assincrono(async (req, res) => {
  let email = null;
  try { email = v.email(req.body.email); } catch (e) { email = null; }
  if (email) {
    const u = await queryUm('SELECT id, colegio_atual_id FROM usuarios WHERE email = ?', [email]);
    await seguranca(req, {
      tipo: 'login_falha',
      colegioId: u ? u.colegio_atual_id : null,
      usuarioId: u ? u.id : null,
      email,
      detalhes: 'Senha incorreta ou conta inexistente'
    });
  }
  res.status(204).end();
}));

const DETALHE_EVENTO = {
  login_ok: 'Login',
  logout: 'Logout manual',
  timeout: 'Sessão encerrada por inatividade',
  // Página conta.html: depois de criar a senha nova pelo link do e-mail, a
  // pessoa entra com ela e só então o registro é feito (sempre autenticado)
  senha_redefinida: 'Senha redefinida pelo link enviado ao e-mail'
};

router.post('/evento', autenticar, carregarUsuario, assincrono(async (req, res) => {
  const tipo = v.umDe(req.body.tipo, Object.keys(DETALHE_EVENTO), 'Tipo de evento');
  if (req.usuario) {
    await seguranca(req, {
      tipo,
      colegioId: req.usuario.colegio_atual_id,
      usuarioId: req.usuario.id,
      email: req.usuario.email,
      detalhes: DETALHE_EVENTO[tipo]
    });
  }
  res.status(204).end();
}));

module.exports = router;
