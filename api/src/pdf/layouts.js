'use strict';
/* =====================================================================
 *  Layouts dos documentos financeiros (funções puras: dados → PDF).
 *
 *  pdfCobrancas  carnê / lote / cobrança avulsa — 3 parcelas por folha A4,
 *                com canhoto, QR Code PIX e "copia e cola"
 *  pdfRecibo     recibo de mensalidade paga
 *  pdfDeclaracao declaração anual de pagamentos (Imposto de Renda)
 * ===================================================================== */
const { Documento, A4 } = require('./pdf');
const { gerarQR } = require('./qr');
const { payloadPix } = require('../utils/pix');
const { valorPorExtenso, dataPorExtenso } = require('../utils/extenso');
const { caber: caberImagem } = require('../utils/imagem');

const C = {
  tinta: '#1A2744',
  texto: '#1f2937',
  suave: '#64748b',
  linha: '#cbd5e1',
  fundo: '#f1f5f9',
  destaque: '#d97706'
};
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const moeda = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const data = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const nomeRef = (ref) => `${MESES[Number(ref.slice(5, 7)) - 1]}/${ref.slice(0, 4)}`;
const pct = (n) => `${String(Number(n)).replace('.', ',')}%`;
const fmtCpf = (c) => { const d = String(c || '').replace(/\D/g, ''); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : ''; };

function linhaEscola(e) {
  return [e.cnpj ? `CNPJ ${e.cnpj}` : '', e.telefone, e.email].filter(Boolean).join('  ·  ');
}

function rodape(doc, emitidoEm) {
  doc.linha(48, 806, A4.larg - 48, 806, { cor: '#e2e8f0' });
  doc.texto(48, 818, `Documento emitido eletronicamente pelo EduGest em ${emitidoEm}.`, { tam: 7, cor: C.suave });
  doc.texto(A4.larg - 48, 818, 'EduGest · Reis Tecnologia', { tam: 7, cor: C.suave, alinhar: 'right' });
}

/** Cabeçalho de página inteira (recibo e declaração). Devolve o y livre. */
function cabecalho(doc, escola, titulo, subtitulo) {
  let x = 48; const dir = A4.larg - 48;
  doc.ret(0, 0, A4.larg, 6, { preencher: C.tinta });
  let larg = 300;
  if (escola.logo) {
    const { w, h } = caberImagem(escola.logo, 90, 48);
    doc.imagem(x, 34 + (48 - h) / 2, w, h, escola.logo);
    x += w + 12; larg -= w + 12;
  }
  doc.texto(x, 50, doc.cortar(escola.nome, 15, larg, true), { tam: 15, negrito: true, cor: C.tinta });
  let y = 64;
  const l1 = linhaEscola(escola);
  if (l1) { doc.texto(x, y, doc.cortar(l1, 8, larg + 20), { tam: 8, cor: C.suave }); y += 11; }
  if (escola.endereco) { doc.texto(x, y, doc.cortar(escola.endereco, 8, larg + 20), { tam: 8, cor: C.suave }); }
  doc.texto(dir, 50, titulo, { tam: 17, negrito: true, cor: C.tinta, alinhar: 'right' });
  if (subtitulo) doc.texto(dir, 64, subtitulo, { tam: 8.5, cor: C.suave, alinhar: 'right' });
  doc.linha(x, 92, dir, 92, { cor: C.linha, esp: 0.8 });
  return 92;
}

/* =====================================================================
 *  Cobranças (carnê / lote / avulsa)
 * ===================================================================== */
const ALTURA_PARCELA = 262;
const TOPO = 22;

/** Reduz a fonte (até "min") para o texto caber; se ainda não couber, corta. */
function caber(doc, texto, tam, min, larg, negrito) {
  let t = tam;
  while (t > min && doc.largura(texto, t, negrito) > larg) t -= 0.5;
  return { t, s: doc.cortar(texto, t, larg, negrito) };
}

function rotulo(doc, x, y, t) { doc.texto(x, y, t.toUpperCase(), { tam: 5.8, negrito: true, cor: C.suave }); }

function desenharParcela(doc, y0, { escola, cobranca, item, colegioId }) {
  const xs = 28; const ws = 136;       // canhoto
  const xm = 182; const dir = A4.larg - 28; // parte principal
  const wm = dir - xm;

  doc.ret(xs - 4, y0, A4.larg - 2 * (xs - 4), ALTURA_PARCELA, { contorno: C.linha, raio: 6, esp: 0.7 });
  doc.linha(xm - 8, y0 + 8, xm - 8, y0 + ALTURA_PARCELA - 8, { cor: C.linha, tracejado: [3, 2.5] });

  /* ----- Canhoto (fica com o colégio) ----- */
  const sx = xs + 6; const sw = ws - 10;
  doc.texto(sx, y0 + 18, doc.cortar(escola.nome, 7.5, sw, true), { tam: 7.5, negrito: true, cor: C.tinta });
  doc.texto(sx, y0 + 28, `Canhoto · Nº ${String(item.id).padStart(6, '0')}`, { tam: 6.3, cor: C.suave });
  rotulo(doc, sx, y0 + 46, 'Aluno(a)');
  doc.paragrafo(sx, y0 + 56, item.aluno, { tam: 8.3, larg: sw, negrito: true, maxLinhas: 2, entrelinha: 1.2 });
  rotulo(doc, sx, y0 + 84, 'Referência');
  doc.texto(sx, y0 + 94, nomeRef(item.referencia), { tam: 8.5 });
  rotulo(doc, sx, y0 + 110, 'Vencimento');
  doc.texto(sx, y0 + 120, data(item.vencimento), { tam: 8.5 });
  rotulo(doc, sx, y0 + 136, 'Valor');
  doc.texto(sx, y0 + 149, moeda(item.valor), { tam: 11, negrito: true, cor: C.tinta });
  rotulo(doc, sx, y0 + 174, 'Pago em');
  doc.texto(sx, y0 + 192, '____/____/________', { tam: 8.5, cor: C.suave });
  rotulo(doc, sx, y0 + 212, 'Visto');
  doc.linha(sx, y0 + 232, sx + sw - 6, y0 + 232, { cor: C.suave, esp: 0.5 });

  /* ----- Parte do responsável ----- */
  let xn = xm;
  if (escola.logo) {
    const { w, h } = caberImagem(escola.logo, 56, 26);
    doc.imagem(xm, y0 + 8 + (26 - h) / 2, w, h, escola.logo);
    xn += w + 8;
  }
  doc.texto(xn, y0 + 19, doc.cortar(escola.nome, 10.5, wm - 130 - (xn - xm), true), { tam: 10.5, negrito: true, cor: C.tinta });
  const l1 = linhaEscola(escola);
  if (l1) doc.texto(xn, y0 + 30, doc.cortar(l1, 6.8, wm - 130 - (xn - xm)), { tam: 6.8, cor: C.suave });
  doc.texto(dir, y0 + 17, 'MENSALIDADE', { tam: 6.3, negrito: true, cor: C.suave, alinhar: 'right' });
  doc.texto(dir, y0 + 31, nomeRef(item.referencia), { tam: 12, negrito: true, cor: C.tinta, alinhar: 'right' });
  doc.linha(xm, y0 + 39, dir, y0 + 39, { cor: '#e2e8f0' });

  const wc = 214; // coluna de dados
  rotulo(doc, xm, y0 + 54, 'Aluno(a)');
  const nm = caber(doc, item.aluno, 10, 8, wc, true);
  doc.texto(xm, y0 + 66, nm.s, { tam: nm.t, negrito: true });
  doc.texto(xm, y0 + 77, doc.cortar([item.ra ? `RA ${item.ra}` : '', item.turma].filter(Boolean).join('  ·  '), 7.5, wc), { tam: 7.5, cor: C.suave });
  rotulo(doc, xm, y0 + 94, 'Responsável');
  doc.texto(xm, y0 + 105, doc.cortar(item.resp || '—', 9, wc), { tam: 9 });

  const yb = y0 + 115;
  doc.ret(xm, yb, 98, 40, { preencher: C.fundo, raio: 4 });
  rotulo(doc, xm + 8, yb + 12, 'Vencimento');
  doc.texto(xm + 8, yb + 30, data(item.vencimento), { tam: 11.5, negrito: true });
  doc.ret(xm + 104, yb, wc - 104, 40, { preencher: C.fundo, raio: 4 });
  rotulo(doc, xm + 112, yb + 12, 'Valor a pagar');
  doc.texto(xm + 112, yb + 30, moeda(item.valor), { tam: 13, negrito: true, cor: C.tinta });

  let yi = yb + 52;
  if (Number(item.desconto) > 0) {
    const bolsa = item.bolsaTipo ? `${item.bolsaTipo} ${pct(item.bolsaPct)}` : 'Desconto';
    yi = doc.paragrafo(xm, yi, `Valor ${moeda(item.valorBruto)}  −  ${bolsa}: ${moeda(item.desconto)}`, { tam: 7, larg: wc, cor: C.suave, maxLinhas: 2 });
    yi += 2;
  }
  if (cobranca.instrucoes) {
    const cabem = Math.max(1, Math.floor((y0 + 210 - yi) / (6.8 * 1.3)));
    doc.paragrafo(xm, yi, cobranca.instrucoes, { tam: 6.8, larg: wc, cor: C.texto, maxLinhas: cabem, entrelinha: 1.3 });
  }

  // QR Code
  const xq = xm + wc + 12; const wq = dir - xq;
  const lado = 118;
  const qx = xq + (wq - lado) / 2; const qy = y0 + 48;
  let codigo = null;
  if (cobranca.pix && Number(item.valor) > 0) {
    codigo = payloadPix({
      chave: cobranca.pix.chave,
      nome: cobranca.pix.beneficiario || escola.nome,
      cidade: cobranca.pix.cidade,
      valor: Number(item.valor),
      txid: item.txid || `EG${colegioId}M${item.id}`,
      descricao: `Mensalidade ${item.referencia.slice(5, 7)}/${item.referencia.slice(0, 4)}`
    });
    doc.qr(qx, qy, lado, gerarQR(codigo, 'M'));
    doc.texto(xq + wq / 2, qy + lado + 13, 'Pague com PIX', { tam: 8.5, negrito: true, cor: C.tinta, alinhar: 'center' });
    doc.texto(xq + wq / 2, qy + lado + 23, 'Abra o app do seu banco e', { tam: 6.5, cor: C.suave, alinhar: 'center' });
    doc.texto(xq + wq / 2, qy + lado + 31, 'escaneie o QR Code', { tam: 6.5, cor: C.suave, alinhar: 'center' });
  } else {
    doc.ret(qx, qy, lado, lado, { contorno: C.linha, raio: 6, tracejado: [3, 2.5] });
    doc.paragrafo(qx + lado / 2, qy + 52, 'Pagamento na secretaria do colégio', { tam: 8, larg: lado - 24, cor: C.suave, alinhar: 'center' });
  }

  // PIX copia e cola
  const yc = y0 + 214;
  doc.linha(xm, yc, dir, yc, { cor: '#e2e8f0' });
  if (codigo) {
    rotulo(doc, xm, yc + 11, 'PIX copia e cola');
    doc.texto(dir, yc + 11, `Identificador ${item.txid || `EG${colegioId}M${item.id}`}`, { tam: 5.8, cor: C.suave, alinhar: 'right' });
    doc.paragrafo(xm, yc + 21, codigo, { tam: 6.2, larg: wm, cor: C.texto, maxLinhas: 3, entrelinha: 1.25 });
  } else {
    doc.paragrafo(xm, yc + 13, 'Este documento não tem QR Code PIX. Combine a forma de pagamento com o colégio.', { tam: 7, larg: wm, cor: C.suave });
  }
}

/**
 * @param {object} p
 * @param {object} p.escola    { nome, cnpj, telefone, email, endereco }
 * @param {object} p.cobranca  { pix: {chave, beneficiario, cidade} | null, instrucoes }
 * @param {Array}  p.itens     mensalidades
 */
function pdfCobrancas({ escola, cobranca, itens, colegioId, titulo }) {
  const doc = new Documento({ titulo: titulo || 'Mensalidades' });
  itens.forEach((item, i) => {
    const pos = i % 3;
    if (pos === 0) doc.pagina();
    const y0 = TOPO + pos * (ALTURA_PARCELA + 10);
    desenharParcela(doc, y0, { escola, cobranca, item, colegioId });
    if (pos < 2 && i < itens.length - 1) {
      const yc = y0 + ALTURA_PARCELA + 5;
      doc.linha(10, yc, A4.larg - 10, yc, { cor: '#94a3b8', esp: 0.5, tracejado: [4, 3] });
    }
  });
  return doc.gerar();
}

/* =====================================================================
 *  Recibo
 * ===================================================================== */
function pdfRecibo({ escola, cobranca, item, emitidoEm }) {
  const doc = new Documento({ titulo: `Recibo - ${item.aluno} - ${nomeRef(item.referencia)}` });
  doc.pagina();
  const x = 48; const dir = A4.larg - 48; const w = dir - x;
  let y = cabecalho(doc, escola, 'RECIBO', `Nº ${String(item.id).padStart(6, '0')}`);

  const recebido = Number(item.valorPago ?? item.valor);
  y += 22;
  doc.ret(x, y, w, 54, { preencher: C.fundo, raio: 6 });
  rotulo(doc, x + 14, y + 17, 'Aluno(a)');
  const nm = caber(doc, item.aluno, 12, 9.5, w - 200, true);
  doc.texto(x + 14, y + 32, nm.s, { tam: nm.t, negrito: true });
  doc.texto(x + 14, y + 44, doc.cortar([item.ra ? `RA ${item.ra}` : '', item.turma].filter(Boolean).join('  ·  '), 8, w - 200), { tam: 8, cor: C.suave });
  rotulo(doc, dir - 14 - 150, y + 17, 'Valor recebido');
  doc.texto(dir - 14, y + 38, moeda(recebido), { tam: 18, negrito: true, cor: C.tinta, alinhar: 'right' });

  y += 84;
  const pagador = item.resp ? `Recebemos de ${item.resp}` : 'Recebemos';
  const texto = `${pagador} a importância de ${moeda(recebido)} (${valorPorExtenso(recebido)}), `
    + `referente à mensalidade escolar de ${nomeRef(item.referencia).replace('/', ' de ').toLowerCase()} `
    + `do(a) aluno(a) ${item.aluno}${item.ra ? `, RA ${item.ra}` : ''}${item.turma ? `, turma ${item.turma}` : ''}.`;
  y = doc.paragrafo(x, y, texto, { tam: 11, larg: w, entrelinha: 1.55 });

  y += 18;
  const linhas = [
    ['Referência', nomeRef(item.referencia)],
    ['Vencimento', data(item.vencimento)],
    ['Data do pagamento', data(item.dataPagamento)],
    ['Forma de pagamento', item.formaPagamento || '—']
  ];
  if (Number(item.desconto) > 0) {
    linhas.push(['Valor da mensalidade', moeda(item.valorBruto)]);
    linhas.push([item.bolsaTipo ? `${item.bolsaTipo} (${pct(item.bolsaPct)})` : 'Desconto', `− ${moeda(item.desconto)}`]);
  }
  linhas.push(['Valor da parcela', moeda(item.valor)]);
  if (recebido !== Number(item.valor)) linhas.push(['Valor recebido', moeda(recebido)]);
  if (item.obsPagamento) linhas.push(['Observação', item.obsPagamento]);
  linhas.forEach(([k, val], i) => {
    const yy = y + i * 20;
    doc.linha(x, yy + 6, dir, yy + 6, { cor: '#e2e8f0' });
    doc.texto(x, yy, k, { tam: 9, cor: C.suave });
    doc.texto(dir, yy, doc.cortar(val, 9.5, w - 160, k === 'Valor recebido' || k === 'Valor da parcela'), { tam: 9.5, negrito: k === 'Valor recebido' || k === 'Valor da parcela', alinhar: 'right' });
  });
  y += linhas.length * 20 + 24;

  doc.texto(x, y, 'Para maior clareza, firmamos o presente recibo.', { tam: 10 });
  y += 26;
  const local = cobranca.cidade ? `${cobranca.cidade}, ` : '';
  doc.texto(x, y, `${local}${dataPorExtenso(item.dataPagamento)}.`, { tam: 10 });

  y += 70;
  doc.linha(A4.larg / 2 - 120, y, A4.larg / 2 + 120, y, { cor: C.texto, esp: 0.6 });
  doc.texto(A4.larg / 2, y + 14, escola.nome, { tam: 9.5, negrito: true, alinhar: 'center' });
  doc.texto(A4.larg / 2, y + 26, escola.cnpj ? `CNPJ ${escola.cnpj} · Financeiro` : 'Financeiro', { tam: 8.5, cor: C.suave, alinhar: 'center' });

  rodape(doc, emitidoEm);
  return doc.gerar();
}

/* =====================================================================
 *  Declaração anual de pagamentos (IR)
 * ===================================================================== */
function pdfDeclaracao({ escola, cobranca, aluno, ano, pagamentos, quitado, emitidoEm, hoje }) {
  const doc = new Documento({ titulo: `Declaração de pagamentos ${ano} - ${aluno.nome}` });
  doc.pagina();
  const x = 48; const dir = A4.larg - 48; const w = dir - x;
  let y = cabecalho(doc, escola, `IRPF ${ano}`, 'Declaração de pagamentos');

  y += 36;
  doc.texto(A4.larg / 2, y, 'DECLARAÇÃO DE PAGAMENTOS', { tam: 14, negrito: true, cor: C.tinta, alinhar: 'center' });
  doc.texto(A4.larg / 2, y + 15, `Ano-calendário ${ano} · para fins de Imposto de Renda (despesas com instrução)`, { tam: 8.5, cor: C.suave, alinhar: 'center' });

  y += 44;
  const cpfResp = fmtCpf(aluno.respCpf);
  const cpfAluno = fmtCpf(aluno.cpf);
  const quem = aluno.resp ? `${aluno.resp}${cpfResp ? `, CPF ${cpfResp},` : ''} pagou` : 'foram pagos';
  const texto = `Declaramos, para fins de comprovação junto à Receita Federal do Brasil, que ${quem} a esta instituição de ensino, `
    + `no ano de ${ano}, os valores relacionados abaixo, referentes aos serviços educacionais prestados ao(à) aluno(a) `
    + `${aluno.nome}${cpfAluno ? `, CPF ${cpfAluno}` : ''}${aluno.ra ? `, RA ${aluno.ra}` : ''}${aluno.turma ? `, turma ${aluno.turma}` : ''}.`;
  y = doc.paragrafo(x, y, texto, { tam: 10.5, larg: w, entrelinha: 1.55 });

  // Tabela
  const cols = [
    { t: 'Referência', x: x + 8 },
    { t: 'Vencimento', x: x + 130 },
    { t: 'Pagamento', x: x + 215 },
    { t: 'Forma', x: x + 300 },
    { t: 'Valor pago', x: dir - 8, dir: true }
  ];
  const cabTabela = (yy) => {
    doc.ret(x, yy, w, 22, { preencher: C.fundo, raio: 3 });
    cols.forEach((c) => doc.texto(c.x, yy + 14.5, c.t.toUpperCase(), { tam: 6.8, negrito: true, cor: C.suave, alinhar: c.dir ? 'right' : 'left' }));
    return yy + 22;
  };
  y = cabTabela(y + 16);
  let total = 0;
  pagamentos.forEach((p) => {
    if (y > 730) { rodape(doc, emitidoEm); doc.pagina(); y = cabTabela(60); }
    const v = Number(p.valorPago ?? p.valor);
    total += Math.round(v * 100);
    doc.texto(cols[0].x, y + 14, nomeRef(p.referencia), { tam: 9 });
    doc.texto(cols[1].x, y + 14, data(p.vencimento), { tam: 9 });
    doc.texto(cols[2].x, y + 14, data(p.dataPagamento), { tam: 9 });
    doc.texto(cols[3].x, y + 14, doc.cortar(p.formaPagamento || '—', 9, 110), { tam: 9 });
    doc.texto(cols[4].x, y + 14, moeda(v), { tam: 9, alinhar: 'right' });
    doc.linha(x, y + 20, dir, y + 20, { cor: '#e2e8f0' });
    y += 20;
  });
  total /= 100;
  if (y > 700) { rodape(doc, emitidoEm); doc.pagina(); y = 60; }
  doc.texto(cols[0].x, y + 16, `Total pago em ${ano}`, { tam: 9.5, negrito: true });
  doc.texto(cols[4].x, y + 16, moeda(total), { tam: 10.5, negrito: true, cor: C.tinta, alinhar: 'right' });
  doc.linha(x, y + 24, dir, y + 24, { cor: C.linha, esp: 0.8 });
  y += 46;

  y = doc.paragrafo(x, y, `Valor total pago no ano: ${moeda(total)} (${valorPorExtenso(total)}).`, { tam: 10, larg: w, entrelinha: 1.5 });
  if (quitado) {
    y = doc.paragrafo(x, y + 6, `Declaramos, ainda, que não constam débitos de mensalidades vencidas do ano de ${ano} em nome do(a) aluno(a) até a data desta declaração.`, { tam: 10, larg: w, entrelinha: 1.5 });
  }
  y += 18;
  const local = cobranca.cidade ? `${cobranca.cidade}, ` : '';
  doc.texto(x, y, `${local}${dataPorExtenso(hoje)}.`, { tam: 10 });

  y = Math.min(y + 70, 770);
  doc.linha(A4.larg / 2 - 120, y, A4.larg / 2 + 120, y, { cor: C.texto, esp: 0.6 });
  doc.texto(A4.larg / 2, y + 14, escola.nome, { tam: 9.5, negrito: true, alinhar: 'center' });
  if (escola.cnpj) doc.texto(A4.larg / 2, y + 26, `CNPJ ${escola.cnpj}`, { tam: 8.5, cor: C.suave, alinhar: 'center' });

  rodape(doc, emitidoEm);
  return doc.gerar();
}

module.exports = { pdfCobrancas, pdfRecibo, pdfDeclaracao, nomeRef, moeda };
