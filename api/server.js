'use strict';
/* =====================================================================
 *  EduGest API — Reis Tecnologia
 *  Express + MySQL + Firebase Auth
 * ===================================================================== */
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Valida a chave de criptografia logo na partida (falha cedo se faltar)
require('./src/utils/crypto');

const { verificarConexao } = require('./src/db');
const { tratarErros, naoEncontrado } = require('./src/middleware/erros');
const {
  autenticar, carregarUsuario, exigirUsuario, exigirColegio, exigirPerfil
} = require('./src/middleware/auth');
const { ipCliente } = require('./src/utils/ip');

const app = express();
const PORT = Number(process.env.PORT || 3001);

// Atrás do Nginx (que está atrás da Cloudflare)
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet());

const origens = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // Sem Origin = chamada do próprio servidor (curl, health check)
    if (!origin || origens.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Colegio-Id'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  maxAge: 600
}));

// Limite geral por IP. Alto o bastante para uma escola inteira atrás do mesmo IP.
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1500,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: ipCliente,
  validate: false,
  message: { erro: 'Muitas requisições. Aguarde alguns minutos.' }
}));

app.use(express.json({ limit: '2mb' }));

// ---------- Rotas ----------
app.use('/api/health', require('./src/routes/health'));
app.use('/api/me', autenticar, carregarUsuario, require('./src/routes/me'));
app.use('/api/conta', require('./src/routes/conta')); // autenticação definida rota a rota
app.use('/api/colegios', autenticar, carregarUsuario, exigirUsuario, require('./src/routes/colegios'));
app.use('/api/usuarios', autenticar, carregarUsuario, exigirColegio, exigirPerfil('admin'), require('./src/routes/usuarios'));
app.use('/api/seguranca', autenticar, carregarUsuario, exigirColegio, exigirPerfil('admin'), require('./src/routes/seguranca'));

// Pedagógico — só equipe; cada rota confere o módulo
const equipe = [autenticar, carregarUsuario, exigirColegio, exigirPerfil('admin', 'professor', 'financeiro')];
app.use('/api/turmas', equipe, require('./src/routes/turmas'));
app.use('/api/alunos', equipe, require('./src/routes/alunos'));
app.use('/api/professores', equipe, require('./src/routes/professores'));
app.use('/api/pedagogico', equipe, require('./src/routes/pedagogico'));
app.use('/api/diario', equipe, require('./src/routes/diario'));
app.use('/api/notas', equipe, require('./src/routes/notas'));
app.use('/api/boletim', equipe, require('./src/routes/boletim'));

// Financeiro — cada rota confere o módulo
app.use('/api/mensalidades', equipe, require('./src/routes/mensalidades'));
app.use('/api/bolsas', equipe, require('./src/routes/bolsas'));
app.use('/api/contas', equipe, require('./src/routes/contas'));
app.use('/api/fluxo', equipe, require('./src/routes/fluxo'));
app.use('/api/financeiro', equipe, require('./src/routes/financeiro'));

app.use(naoEncontrado);
app.use(tratarErros);

// ---------- Partida ----------
(async () => {
  try {
    await verificarConexao();
    console.log('[EduGest] MySQL conectado');
  } catch (e) {
    console.error('[EduGest] Falha ao conectar no MySQL:', e.message);
  }
  // Escuta só localmente: o acesso externo passa pelo Nginx
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[EduGest] API ouvindo em 127.0.0.1:${PORT}`);
  });
})();
