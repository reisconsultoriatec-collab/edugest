'use strict';
/* =====================================================================
 *  Documentos escolares em PDF (funções puras: conteúdo gravado → PDF)
 *
 *  pdfDeclaracaoEscolar  declarações (matrícula, frequência, transferência,
 *                        conclusão e modelos do colégio)
 *  pdfHistoricoEscolar   histórico escolar (disciplinas × anos)
 *
 *  Todas as páginas trazem no rodapé o número do documento, o código de
 *  validação e o QR Code que abre a página pública de validação.
 * ===================================================================== */
const { Documento, A4 } = require('./pdf');
const { gerarQR } = require('./qr');
const { caber } = require('../utils/imagem');

const C = {
  tinta: '#1A2744', texto: '#1f2937', suave: '#64748b', linha: '#cbd5e1', claro: '#e2e8f0',
  fundo: '#f1f5f9', perigo: '#b91c1c', perigoFundo: '#fee2e2'
};
const ML = 60;
const MR = A4.larg - 60;
const LARG = MR - ML;
const LIMITE = 712;   // abaixo disso começa o rodapé de validação

const capitalizar = (s) => String(s || '').toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

function enderecoCompleto(e) {
  const cidade = [e.cidade, e.uf].filter(Boolean).join('/');
  if (!e.endereco) return cidade;
  if (!cidade || String(e.endereco).toLowerCase().includes(String(e.cidade || '').toLowerCase())) return e.endereco;
  return `${e.endereco} – ${cidade}`;
}

function cabecalho(doc, c, logo) {
  const e = c.escola;
  doc.ret(0, 0, A4.larg, 5, { preencher: C.tinta });
  if (c.numero) doc.texto(MR, 20, `Nº ${c.numero}`, { tam: 7.5, cor: C.suave, alinhar: 'right' });
  let x = ML; let larg = LARG;
  const topo = 28; const altLogo = 58;
  if (logo) {
    const { w, h } = caber(logo, 86, altLogo);
    doc.imagem(ML, topo + (altLogo - h) / 2, w, h, logo);
    x += w + 14; larg -= w + 14;
  }
  let tn = 14;
  while (tn > 10.5 && doc.largura(e.nome, tn, true) > larg) tn -= 0.5;
  doc.texto(x, topo + 14, doc.cortar(e.nome, tn, larg, true), { tam: tn, negrito: true, cor: C.tinta });
  let y = topo + 26;
  [
    [e.cnpj ? `CNPJ ${e.cnpj}` : '', e.inep ? `INEP ${e.inep}` : ''].filter(Boolean).join('  ·  '),
    e.ato || '',
    enderecoCompleto(e),
    [e.telefone, e.email].filter(Boolean).join('  ·  ')
  ].filter(Boolean).forEach((l) => { y = doc.paragrafo(x, y, l, { tam: 7.6, larg, cor: C.suave, maxLinhas: 2, entrelinha: 1.3 }); });
  const fim = Math.max(y - 2, topo + altLogo) + 8;
  doc.linha(ML, fim, MR, fim, { cor: C.linha, esp: 0.8 });
  return fim;
}

function faixaCancelado(doc, y, canc) {
  const txt = `DOCUMENTO CANCELADO em ${canc.data}${canc.motivo ? ` — ${canc.motivo}` : ''}. Este documento não tem validade.`;
  const linhas = doc.quebrar(txt, 9, LARG - 24, true).length;
  const h = 16 + linhas * 12;
  doc.ret(ML, y + 10, LARG, h, { preencher: C.perigoFundo, contorno: C.perigo, raio: 4 });
  doc.paragrafo(ML + 12, y + 24, txt, { tam: 9, larg: LARG - 24, negrito: true, cor: C.perigo, entrelinha: 1.3 });
  return y + 10 + h;
}

/** Rodapé de validação (todas as páginas). */
function rodape(doc, c, pagina, total) {
  const v = c.validacao || {};
  const y = 736;
  doc.linha(ML, y - 8, MR, y - 8, { cor: C.claro });
  if (v.url) doc.qr(ML, y, 52, gerarQR(v.url, 'M'));
  const x = ML + 64;
  doc.texto(x, y + 10, `Documento nº ${c.numero || '—'} · emitido em ${c.emitidoEm || '—'}${c.emitidoPor ? ` por ${c.emitidoPor}` : ''}`, { tam: 7.6, cor: C.texto });
  doc.texto(x, y + 23, `Código de validação: ${v.codigo || '—'}`, { tam: 9, negrito: true, cor: C.tinta });
  doc.texto(x, y + 36, `Confira a autenticidade em ${v.endereco || 'edugest.reisconsultoriatec.com/validar.html'} ou pelo QR Code.`, { tam: 7.4, cor: C.suave });
  doc.texto(x, y + 48, 'EduGest · Reis Tecnologia', { tam: 6.8, cor: C.suave });
  if (total > 1) doc.texto(MR, y + 48, `Página ${pagina} de ${total}`, { tam: 6.8, cor: C.suave, alinhar: 'right' });
}

/** Assinaturas em linhas de duas (contrato: contratante, contratada e duas testemunhas). */
function assinaturas(doc, y, lista, entreLinhas = 62) {
  const w = 200;
  const todas = lista || [];
  for (let i = 0; i < todas.length; i += 2) {
    const par = todas.slice(i, i + 2);
    const centros = par.length === 1 ? [A4.larg / 2] : [A4.larg / 2 - 120, A4.larg / 2 + 120];
    const yl = y + (i / 2) * entreLinhas;
    par.forEach((s, j) => {
      const cx = centros[j];
      doc.linha(cx - w / 2, yl, cx + w / 2, yl, { cor: C.texto, esp: 0.6 });
      let yy = yl + 13;
      if (s.nome) { doc.texto(cx, yy, doc.cortar(s.nome, 9.5, w, true), { tam: 9.5, negrito: true, alinhar: 'center' }); yy += 12; }
      doc.texto(cx, yy, s.cargo, { tam: 8.5, cor: C.suave, alinhar: 'center' }); yy += 11;
      if (s.registro) doc.texto(cx, yy, doc.cortar(s.registro, 8, w), { tam: 8, cor: C.suave, alinhar: 'center' });
    });
  }
  return y + Math.ceil(todas.length / 2) * entreLinhas;
}

/** Local, data e assinaturas; muda de página só se não couber (até a linha do rodapé). */
function fechamento(doc, c, y, novaPagina, espaco = 72) {
  const linhasAss = Math.ceil((c.assinaturas || []).length / 2);
  if (y + espaco + 44 + (linhasAss - 1) * 62 > LIMITE + 12) y = novaPagina();
  doc.texto(MR, y, `${c.local ? `${c.local}, ` : ''}${c.data}.`, { tam: c.tipo === 'contrato' ? 10 : 11, alinhar: 'right' });
  return assinaturas(doc, y + espaco, c.assinaturas);
}

/** Numera as páginas e põe o rodapé em todas (depois de tudo desenhado). */
function finalizar(doc, c) {
  const total = doc.paginas.length;
  const atual = doc.ops;
  doc.paginas.forEach((ops, i) => { doc.ops = ops; rodape(doc, c, i + 1, total); });
  doc.ops = atual;
  return doc.gerar();
}

/* =====================================================================
 *  Declarações
 * ===================================================================== */
function pdfDeclaracaoEscolar(c, { logo = null, cancelamento = null } = {}) {
  const doc = new Documento({ titulo: `${capitalizar(c.titulo)} - ${c.aluno.nome}` });
  const novaPagina = () => { doc.pagina(); return cabecalho(doc, c, logo) + 36; };
  doc.pagina();
  let y = cabecalho(doc, c, logo);
  if (cancelamento) y = faixaCancelado(doc, y, cancelamento);
  // Contrato: texto longo, letra menor e mais junto
  const contrato = c.tipo === 'contrato';
  y += contrato ? 34 : 56;
  doc.texto(A4.larg / 2, y, c.titulo, { tam: contrato ? 13 : 15, negrito: true, cor: C.tinta, alinhar: 'center' });
  y += contrato ? 30 : 46;
  (c.paragrafos || []).forEach((p) => {
    y = doc.paragrafoRico(ML, y, p, { tam: contrato ? 10 : 11.5, larg: LARG, entrelinha: contrato ? 1.5 : 1.75, justificar: true, limite: LIMITE - 20, novaPagina });
    y += contrato ? 5 : 9;
  });
  fechamento(doc, c, y + (contrato ? 10 : 20), novaPagina, contrato ? 56 : 72);
  return finalizar(doc, c);
}

/* =====================================================================
 *  Histórico escolar
 * ===================================================================== */
const POR_TABELA = 8;
const ALT = 15;

function identificacao(doc, y, itens) {
  const mapa = Object.fromEntries(itens);
  const linhas = [
    [['Aluno(a)', mapa['Aluno(a)']]],
    [['RA', mapa.RA], ['Data de nascimento', mapa['Data de nascimento']]],
    [['Naturalidade', mapa.Naturalidade], ['Nacionalidade', mapa.Nacionalidade]],
    [['CPF', mapa.CPF], ['RG', mapa.RG]],
    [['Filiação', mapa['Filiação']]]
  ];
  const h = linhas.length * 22 + 8;
  doc.ret(ML, y, LARG, h, { preencher: C.fundo, raio: 5 });
  linhas.forEach((l, i) => {
    const yy = y + 16 + i * 22;
    const meia = LARG / 2;
    l.forEach(([rot, val], j) => {
      const x = ML + 12 + j * meia;
      const w = (l.length === 1 ? LARG : meia) - 24;
      doc.texto(x, yy - 5, rot.toUpperCase(), { tam: 5.8, negrito: true, cor: C.suave });
      doc.texto(x, yy + 6, doc.cortar(val || '—', 9.3, w, rot === 'Aluno(a)'), { tam: 9.3, negrito: rot === 'Aluno(a)', cor: val ? C.texto : C.suave });
    });
  });
  return y + h;
}

function tabelaNotas(doc, y, matriz, ini, fim, novaPagina) {
  const cols = matriz.colunas.slice(ini, fim);
  const n = cols.length;
  const w0 = 158;
  const wc = (LARG - w0) / n;
  const cx = (j) => ML + w0 + j * wc + wc / 2;

  const cab = (yy) => {
    doc.ret(ML, yy, LARG, 30, { preencher: C.tinta });
    doc.texto(ML + 8, yy + 18, 'COMPONENTES CURRICULARES', { tam: 6.8, negrito: true, cor: '#ffffff' });
    cols.forEach((c, j) => {
      let t = 7.2; const s = String(c.serie || '');
      while (t > 5.4 && doc.largura(s, t, true) > wc - 4) t -= 0.3;
      doc.texto(cx(j), yy + 13, doc.cortar(s, t, wc - 4, true), { tam: t, negrito: true, cor: '#ffffff', alinhar: 'center' });
      doc.texto(cx(j), yy + 24, String(c.ano), { tam: 7, cor: '#cbd5e1', alinhar: 'center' });
    });
    return yy + 30;
  };
  y = cab(y);
  const linha = (rotulo, valores, { negrito = false, fundo = null, alt = ALT, quebra = false } = {}) => {
    if (y + alt > LIMITE - 10) { y = cab(novaPagina()); }
    if (fundo) doc.ret(ML, y, LARG, alt, { preencher: fundo });
    doc.texto(ML + 8, y + alt / 2 + 3, doc.cortar(rotulo, 8.3, w0 - 14, negrito), { tam: 8.3, negrito, cor: C.texto });
    valores.forEach((v, j) => {
      const s = v === null || v === undefined || v === '' ? '—' : String(v);
      if (quebra) {
        const ls = doc.quebrar(s, 6.6, wc - 6).length;
        doc.paragrafo(cx(j), y + alt / 2 + 2.5 - (Math.min(ls, 2) - 1) * 4, s, { tam: 6.6, larg: wc - 6, alinhar: 'center', maxLinhas: 2, entrelinha: 1.2, negrito });
      } else {
        doc.texto(cx(j), y + alt / 2 + 3, doc.cortar(s, 8.3, wc - 4, negrito), { tam: 8.3, negrito, alinhar: 'center', cor: s === '—' ? C.suave : C.texto });
      }
    });
    doc.linha(ML, y + alt, MR, y + alt, { cor: C.claro });
    for (let j = 0; j <= n; j++) doc.linha(ML + w0 + j * wc, y, ML + w0 + j * wc, y + alt, { cor: C.claro });
    y += alt;
  };
  matriz.linhas.forEach((l, i) => linha(l.disciplina, l.notas.slice(ini, fim), { fundo: i % 2 ? '#f8fafc' : null }));
  if (!matriz.linhas.length) linha('Sem notas registradas', cols.map(() => ''));
  linha('Carga horária anual (h)', cols.map((c) => c.cargaHoraria), { negrito: true, fundo: C.fundo });
  linha('Dias letivos', cols.map((c) => c.diasLetivos), { negrito: true, fundo: C.fundo });
  linha('Frequência', cols.map((c) => c.frequencia), { negrito: true, fundo: C.fundo });
  linha('Resultado', cols.map((c) => c.resultado), { negrito: true, fundo: C.fundo, alt: 22, quebra: true });
  return y;
}

function tabelaEstudos(doc, y, estudos, novaPagina) {
  const cols = [{ t: 'Ano', w: 44 }, { t: 'Série', w: 96 }, { t: 'Estabelecimento de ensino', w: LARG - 44 - 96 - 118 }, { t: 'Cidade/UF', w: 118 }];
  const cab = (yy) => {
    doc.texto(ML, yy, 'ESTUDOS REALIZADOS', { tam: 8, negrito: true, cor: C.tinta });
    yy += 6;
    doc.ret(ML, yy, LARG, 18, { preencher: C.fundo });
    let x = ML;
    cols.forEach((c) => { doc.texto(x + 6, yy + 12, c.t.toUpperCase(), { tam: 6.4, negrito: true, cor: C.suave }); x += c.w; });
    return yy + 18;
  };
  if (y + 60 > LIMITE) y = novaPagina();
  y = cab(y);
  estudos.forEach((e) => {
    if (y + ALT > LIMITE - 10) y = cab(novaPagina());
    let x = ML;
    [String(e.ano), e.serie, e.escola, e.cidade].forEach((v, i) => {
      doc.texto(x + 6, y + 10.5, doc.cortar(v || '—', 8.3, cols[i].w - 10), { tam: 8.3, cor: v ? C.texto : C.suave });
      x += cols[i].w;
    });
    doc.linha(ML, y + ALT, MR, y + ALT, { cor: C.claro });
    y += ALT;
  });
  return y;
}

function pdfHistoricoEscolar(c, { logo = null, cancelamento = null } = {}) {
  const doc = new Documento({ titulo: `Histórico Escolar - ${c.aluno.nome}` });
  const novaPagina = () => { doc.pagina(); return cabecalho(doc, c, logo) + 24; };
  doc.pagina();
  let y = cabecalho(doc, c, logo);
  if (cancelamento) y = faixaCancelado(doc, y, cancelamento);
  y += 30;
  doc.texto(A4.larg / 2, y, c.titulo, { tam: 14, negrito: true, cor: C.tinta, alinhar: 'center' });
  if (c.subtitulo) { y += 14; doc.texto(A4.larg / 2, y, c.subtitulo, { tam: 9, cor: C.suave, alinhar: 'center' }); }
  y = identificacao(doc, y + 16, c.identificacao || []) + 16;

  const m = c.matriz || { colunas: [], linhas: [] };
  if (!m.colunas.length) {
    doc.paragrafo(ML, y + 10, 'Nenhum ano letivo registrado para este aluno.', { tam: 10, larg: LARG, cor: C.suave });
    y += 30;
  }
  for (let i = 0; i < m.colunas.length; i += POR_TABELA) {
    if (y + 120 > LIMITE) y = novaPagina();
    y = tabelaNotas(doc, y, m, i, Math.min(i + POR_TABELA, m.colunas.length), novaPagina) + 14;
  }
  if ((c.estudos || []).length) y = tabelaEstudos(doc, y + 6, c.estudos, novaPagina) + 16;

  const obs = c.observacoes || [];
  if (obs.length) {
    if (y + 40 > LIMITE) y = novaPagina();
    doc.texto(ML, y, 'OBSERVAÇÕES', { tam: 8, negrito: true, cor: C.tinta });
    y += 14;
    obs.forEach((o) => { y = doc.paragrafoRico(ML, y, o, { tam: 9, larg: LARG, entrelinha: 1.45, justificar: true, limite: LIMITE - 20, novaPagina }) + 3; });
  }
  fechamento(doc, c, y + 18, novaPagina, 58);
  return finalizar(doc, c);
}

module.exports = { pdfDeclaracaoEscolar, pdfHistoricoEscolar };
