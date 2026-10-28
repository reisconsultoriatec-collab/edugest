'use strict';
/* GET /api/health — verificação pública de que API e banco estão no ar.
 * Usada pelo monitor de disponibilidade (UptimeRobot), pelo script de
 * atualização e pelo indicador de conexão do topo. Fora do limite de
 * requisições e sem cache (Cloudflare e navegador sempre perguntam). */
const router = require('express').Router();
const { verificarConexao } = require('../db');
const { agoraSP } = require('../utils/datas');
const { version } = require('../../package.json');

const LIMITE_MS = 4000; // banco travado conta como fora do ar, sem deixar o monitor esperando

router.get('/', async (req, res) => {
  let banco = 'ok';
  let espera;
  try {
    await Promise.race([
      verificarConexao(),
      new Promise((_, falha) => { espera = setTimeout(() => falha(new Error('tempo esgotado')), LIMITE_MS); })
    ]);
  } catch (e) {
    banco = 'indisponivel';
  } finally {
    clearTimeout(espera);
  }
  res.set('Cache-Control', 'no-store');
  res.status(banco === 'ok' ? 200 : 503).json({
    status: banco === 'ok' ? 'ok' : 'erro',
    sistema: 'EduGest API',
    versao: version,
    banco,
    hora: agoraSP()
  });
});

module.exports = router;
