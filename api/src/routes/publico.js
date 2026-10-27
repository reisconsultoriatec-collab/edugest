'use strict';
/* =====================================================================
 *  /api/publico — acesso SEM login, só com link assinado.
 *
 *  GET /doc/:token   devolve o PDF (cobrança, recibo, carnê, lote,
 *                    declaração). O link vale até a data gravada nele e o
 *                    documento sempre reflete a situação ATUAL no banco
 *                    (ex.: mensalidade paga depois do envio → abre o recibo).
 *  GET /validar/:codigo  situação de um documento escolar (página
 *                    validar.html, aberta pelo QR Code do documento)
 *  GET /funil/:token     dados do formulário de interesse do colégio
 *  POST /funil/:token    interessado preenche o formulário (página
 *                    interesse.html) e entra no funil de matrículas
 * ===================================================================== */
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { ipCliente } = require('../utils/ip');
const { verificar } = require('../utils/links');
const { TIPOS, DocErro, carregarEscola } = require('../services/documentos');
const { validarCodigo } = require('../services/secretaria');
const { query, queryUm } = require('../db');
const F = require('../services/funil');
const v = require('../utils/validar');
const { HttpErro } = require('../middleware/erros');
const { agoraSP, hojeSP, dataValida } = require('../utils/datas');
const { logoDoColegio } = require('../services/logo');
const { paraDataUrl } = require('../utils/imagem');

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

// Validação: limite mais baixo (dificulta tentar códigos ao acaso)
const limiteValidacao = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  keyGenerator: ipCliente,
  validate: false,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { erro: 'Muitas consultas. Aguarde alguns minutos e tente de novo.', codigo: 'limite' }
});

router.get('/validar/:codigo', limiteValidacao, async (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  try {
    const r = await validarCodigo(req.params.codigo);
    if (!r) return res.status(404).json({ erro: 'Nenhum documento encontrado com este código.', codigo: 'nao_encontrado' });
    return res.json(r);
  } catch (e) {
    console.error('[ERRO] validar documento', e);
    return res.status(500).json({ erro: 'Não foi possível consultar agora. Tente de novo em instantes.' });
  }
});

/* ---------------- Formulário de interesse (funil) ---------------- */
async function formularioAtivo(token) {
  const t = String(token || '');
  if (!/^[A-Za-z0-9_-]{16}$/.test(t)) return null;
  return queryUm(
    `SELECT f.colegio_id, f.titulo, f.mensagem, c.nome, cfg.ano_letivo
       FROM funil_config f JOIN colegios c ON c.id = f.colegio_id AND c.ativo = 1
       LEFT JOIN config_colegio cfg ON cfg.colegio_id = f.colegio_id
      WHERE f.token = ? AND f.ativo = 1`,
    [t]
  );
}

const anosDoForm = (f) => { const a = Number(f.ano_letivo) || Number(hojeSP().slice(0, 4)); return [a, a + 1]; };

router.get('/funil/:token', async (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  try {
    const f = await formularioAtivo(req.params.token);
    if (!f) return res.status(404).json({ erro: 'Este formulário não está disponível. Fale diretamente com o colégio.', codigo: 'indisponivel' });
    const [turmas, logo] = await Promise.all([
      query('SELECT DISTINCT serie FROM turmas WHERE colegio_id = ? AND ativo = 1', [f.colegio_id]),
      logoDoColegio(f.colegio_id)
    ]);
    const doColegio = turmas.map((t) => t.serie).filter(Boolean);
    const series = [...F.SERIES.filter((s) => doColegio.includes(s)), ...doColegio.filter((s) => !F.SERIES.includes(s))];
    return res.json({
      colegio: f.nome, logo: logo ? paraDataUrl(logo.dados) : null,
      titulo: f.titulo || `Quero conhecer o ${f.nome}`,
      mensagem: f.mensagem || 'Preencha seus dados e a nossa equipe entra em contato para apresentar a escola e agendar uma visita.',
      series: series.length ? series : F.SERIES, anos: anosDoForm(f), turnos: F.TURNOS, origens: F.ORIGENS
    });
  } catch (e) {
    console.error('[ERRO] formulário de interesse', e);
    return res.status(500).json({ erro: 'Não foi possível abrir o formulário agora. Tente de novo em instantes.' });
  }
});

// Envio: poucas tentativas por IP (evita robôs e cadastros em massa)
const limiteEnvio = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  keyGenerator: ipCliente,
  validate: false,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { erro: 'Muitos envios seguidos. Aguarde alguns minutos e tente de novo.', codigo: 'limite' }
});

router.post('/funil/:token', limiteEnvio, async (req, res) => {
  res.set({ 'Cache-Control': 'no-store' });
  try {
    const f = await formularioAtivo(req.params.token);
    if (!f) return res.status(404).json({ erro: 'Este formulário não está disponível. Fale diretamente com o colégio.', codigo: 'indisponivel' });
    const b = req.body || {};
    // Campo isca: invisível para pessoas; robôs costumam preencher. Fingimos sucesso e não gravamos.
    if (b.site) return res.status(201).json({ ok: true });
    if (b.consentimento !== true) throw new HttpErro(400, 'Para enviar, autorize o colégio a entrar em contato', 'validacao');
    const nascimento = b.nascimento ? String(b.nascimento).slice(0, 10) : null;
    if (nascimento && (!dataValida(nascimento) || nascimento > hojeSP())) throw new HttpErro(400, 'Data de nascimento inválida', 'validacao');
    const anos = anosDoForm(f);
    const d = {
      nome: v.texto(b.nomeAluno, 'Nome do(a) aluno(a)', { max: 100, min: 3, obrigatorio: true }),
      nascimento,
      serie: v.texto(b.serie, 'Série', { max: 40 }),
      ano: b.ano ? v.umDe(Number(b.ano), anos, 'Ano letivo') : null,
      turno: v.umDe(b.turno || null, Object.keys(F.TURNOS), 'Turno', { obrigatorio: false }),
      responsavel: v.texto(b.responsavel, 'Nome do responsável', { max: 100, min: 3, obrigatorio: true }),
      telefone: v.telefone(b.telefone, 'Telefone'),
      email: v.email(b.email, 'E-mail'),
      origem: b.origem ? v.umDe(b.origem, F.ORIGENS, 'Como conheceu o colégio') : null,
      mensagem: v.texto(b.mensagem, 'Mensagem', { max: 500 })
    };
    if (!d.telefone) throw new HttpErro(400, 'Informe um telefone ou WhatsApp para contato', 'validacao');
    const agora = agoraSP();
    // Mesmo telefone + mesmo aluno nos últimos 30 dias, ainda em andamento: junta no cadastro existente
    const recentes = await query(
      `SELECT id, nome_aluno, telefone FROM leads
        WHERE colegio_id = ? AND etapa IN ('lead','visita','proposta') AND criado_em >= ?`,
      [f.colegio_id, `${new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)} 00:00:00`]
    );
    const igual = recentes.find((l) => F.digitos(l.telefone) === F.digitos(d.telefone) && F.semAcento(l.nome_aluno) === F.semAcento(d.nome));
    if (igual) {
      await query('UPDATE leads SET visto_em = NULL WHERE id = ?', [igual.id]);
      await F.anotar(null, f.colegio_id, igual.id, 'sistema', `Novo envio pelo formulário de interesse${d.mensagem ? `: ${d.mensagem}` : ''}`, null);
      return res.status(201).json({ ok: true });
    }
    const r = await query(
      `INSERT INTO leads (colegio_id, nome_aluno, nascimento, serie_pretendida, ano_pretendido, turno_pretendido, responsavel, telefone, email,
                          origem, obs, etapa, etapa_em, via_formulario, consentimento_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'lead', ?, 1, ?)`,
      [f.colegio_id, d.nome, d.nascimento, d.serie, d.ano, d.turno, d.responsavel, d.telefone, d.email, d.origem, d.mensagem, agora, agora]
    );
    await F.anotar(null, f.colegio_id, r.insertId, 'sistema', 'Cadastro pelo formulário de interesse (contato autorizado pelo responsável)', null);
    return res.status(201).json({ ok: true });
  } catch (e) {
    if (e instanceof HttpErro || e.status === 400) return res.status(400).json({ erro: e.message, codigo: 'validacao' });
    console.error('[ERRO] envio do formulário de interesse', e);
    return res.status(500).json({ erro: 'Não foi possível enviar agora. Tente de novo em instantes.' });
  }
});

module.exports = router;
