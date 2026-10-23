'use strict';
/* GET /api/health — verificação pública de que API e banco estão no ar. */
const router = require('express').Router();
const { verificarConexao } = require('../db');
const { agoraSP } = require('../utils/datas');
const { version } = require('../../package.json');

router.get('/', async (req, res) => {
  let banco = 'ok';
  try {
    await verificarConexao();
  } catch (e) {
    banco = 'indisponivel';
  }
  res.status(banco === 'ok' ? 200 : 503).json({
    status: banco === 'ok' ? 'ok' : 'erro',
    sistema: 'EduGest API',
    versao: version,
    banco,
    hora: agoraSP()
  });
});

module.exports = router;
