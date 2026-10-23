'use strict';
/* Criptografia AES-256-GCM para CPF e RG.
 * Formato gravado: v1:<iv base64>:<tag base64>:<conteúdo base64> */
const crypto = require('crypto');

const chave = Buffer.from(process.env.CRYPTO_KEY || '', 'hex');
if (chave.length !== 32) {
  throw new Error('CRYPTO_KEY ausente ou inválida no .env (precisa de 64 caracteres hexadecimais)');
}

function cifrar(texto) {
  if (texto === undefined || texto === null || texto === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', chave, iv);
  const conteudo = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), conteudo.toString('base64')].join(':');
}

function decifrar(valor) {
  if (!valor) return null;
  const partes = String(valor).split(':');
  if (partes.length !== 4 || partes[0] !== 'v1') return null;
  try {
    const [, iv, tag, conteudo] = partes;
    const decipher = crypto.createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(conteudo, 'base64')), decipher.final()]).toString('utf8');
  } catch (e) {
    return null; // dado adulterado ou chave errada
  }
}

module.exports = { cifrar, decifrar };
