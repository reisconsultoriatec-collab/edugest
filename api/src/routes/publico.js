'use strict';
/* =====================================================================
 *  /api/publico — acesso SEM login, só com link assinado.
 *
 *  GET /doc/:token   devolve o PDF (cobrança, recibo, carnê, lote,
 *                    declaração). O link vale até a data gravada nele e o
 *                    documento sempre reflete a situação ATUAL no banco
 *                    (ex.: mensalidade paga depois do envio → abre o recibo).
 * ===================================================================== */
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { ipCliente } = require('../utils/ip');
const { verificar } = require('../utils/links');
const { TIPOS, DocErro, carregarEscola } = require('../services/documentos');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Página simples para link inválido, expirado ou documento indisponível. */
function pagina(res, status, titulo, texto, escola) {
  res.status(status).set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }).type('html').send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)} · EduGest</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2937;padding:16px;box-sizing:border-box}
  .c{background:#fff;border:1px solid #e2e8f0;border-radius:14px;max-width:420px;width:100%;padding:28px 24px;text-align:center}
  .m{font-size:13px;color:#64748b;margin-bottom:18px} h1{font-size:19px;margin:0 0 10px;color:#1A2744}
  p{font-size:15px;line-height:1.5;margin:0} .r{margin-top:22px;font-size:12px;color:#94a3b8}
  .b{display:inline-block;width:44px;height:44px;border-radius:50%;background:#fef3c7;color:#b45309;font-size:22px;line-height:44px;margin-bottom:12px}
</style></head><body><div class="c">
  <div class="b">!</div>
  ${escola ? `<div class="m">${esc(escola)}</div>` : ''}
  <h1>${esc(titulo)}</h1><p>${esc(texto)}</p>
  <div class="r">EduGest · Reis Tecnologia</div>
</div></body></html>`);
}

router.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  keyGenerator: ipCliente,
  validate: false,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => pagina(res, 429, 'Muitos acessos', 'Aguarde alguns minutos e tente abrir o documento de novo.')
}));

async function nomeEscola(colegioId) {
  try { return (await carregarEscola(colegioId)).escola.nome; } catch (e) { return null; }
}

router.get('/doc/:token', async (req, res) => {
  const d = verificar(req.params.token);
  if (!d || !TIPOS[d.k]) {
    return pagina(res, 404, 'Link inválido', 'Confira se o link foi copiado por completo ou peça um novo ao colégio.');
  }
  if (d.expirado) {
    return pagina(res, 410, 'Link expirado', 'Por segurança, os links de documentos valem por tempo limitado. Peça um novo link ao colégio.', await nomeEscola(d.c));
  }
  try {
    const tipo = TIPOS[d.k];
    const { pdf, nome } = tipo.gerar(await tipo.carregar(d));
    // A política de conteúdo do Helmet é para páginas HTML; no PDF ela atrapalha alguns visualizadores
    res.removeHeader('Content-Security-Policy');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nome}"`,
      'Content-Length': pdf.length,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow'
    });
    return res.end(pdf);
  } catch (e) {
    if (e instanceof DocErro) return pagina(res, e.status, 'Documento indisponível', e.message, await nomeEscola(d.c));
    console.error('[ERRO] documento', d.k, e);
    return pagina(res, 500, 'Não foi possível gerar o documento', 'Tente novamente em alguns instantes.');
  }
});

module.exports = router;
