'use strict';
/* IP real do cliente. Com a Cloudflare na frente, o IP verdadeiro vem
 * no header CF-Connecting-IP; sem ela, usa o IP repassado pelo Nginx. */
function ipCliente(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.length <= 45) return cf;
  return req.ip || '';
}

module.exports = { ipCliente };
