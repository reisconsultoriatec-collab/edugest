'use strict';
/* =====================================================================
 *  Links seguros para os PDFs (enviados por WhatsApp ou abertos na tela).
 *
 *  O link carrega os dados do documento + data de validade, assinados com
 *  HMAC-SHA256 (chave derivada da CRYPTO_KEY). Não há tabela: o servidor
 *  só confere a assinatura e a validade. Sem a chave, ninguém consegue
 *  criar ou alterar um link — trocar um número no link invalida a assinatura.
 * ===================================================================== */
const crypto = require('crypto');

const CHAVE = crypto.createHmac('sha256', Buffer.from(process.env.CRYPTO_KEY || '', 'hex'))
  .update('edugest:links-documentos:v1')
  .digest();

const assinatura = (parte) => crypto.createHmac('sha256', CHAVE).update(parte).digest().subarray(0, 16);

/**
 * @param {object} dados   conteúdo do link (chaves curtas)
 * @param {number} segundos validade
 * @returns {{ token: string, expira: Date }}
 */
function assinar(dados, segundos) {
  const corpo = { ...dados, e: Math.floor(Date.now() / 1000) + Math.floor(segundos) };
  const parte = Buffer.from(JSON.stringify(corpo)).toString('base64url');
  return { token: `${parte}.${assinatura(parte).toString('base64url')}`, expira: new Date(corpo.e * 1000) };
}

/**
 * @returns {object|null} os dados; { expirado: true, ...dados } se venceu; null se inválido
 */
function verificar(token) {
  const [parte, sig, sobra] = String(token || '').split('.');
  if (!parte || !sig || sobra !== undefined || parte.length > 600) return null;
  const recebida = Buffer.from(sig, 'base64url');
  const esperada = assinatura(parte);
  if (recebida.length !== esperada.length || !crypto.timingSafeEqual(recebida, esperada)) return null;
  let dados;
  try { dados = JSON.parse(Buffer.from(parte, 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!dados || typeof dados.e !== 'number' || typeof dados.k !== 'string') return null;
  if (dados.e * 1000 < Date.now()) return { ...dados, expirado: true };
  return dados;
}

module.exports = { assinar, verificar };
