'use strict';
/* Geração de códigos aleatórios seguros (crypto), sem caracteres
 * que se confundem ao ler/digitar (0/O, 1/I/L). */
const crypto = require('crypto');

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function aleatorio(tamanho) {
  let s = '';
  for (let i = 0; i < tamanho; i++) s += ALFABETO[crypto.randomInt(ALFABETO.length)];
  return s;
}

/** Código de acesso do responsável: PAI + 6 caracteres. */
const codigoAcessoAluno = () => 'PAI' + aleatorio(6);

/** Código de convite do colégio para a equipe: 10 caracteres. */
const codigoConvite = () => aleatorio(10);

module.exports = { aleatorio, codigoAcessoAluno, codigoConvite };
