'use strict';
/* Logotipo do colégio: usado no cabeçalho de todos os PDFs. */
const { queryUm } = require('../db');

/** @returns {Promise<{dados: Buffer, largura, altura, componentes}|null>} */
async function logoDoColegio(colegioId) {
  const l = await queryUm('SELECT imagem, largura, altura, componentes FROM colegio_logos WHERE colegio_id = ?', [colegioId]);
  if (!l || !l.imagem) return null;
  return { dados: Buffer.from(l.imagem), largura: Number(l.largura), altura: Number(l.altura), componentes: Number(l.componentes) || 3 };
}

module.exports = { logoDoColegio };
