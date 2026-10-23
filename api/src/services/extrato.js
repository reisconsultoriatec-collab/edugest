'use strict';
/* =====================================================================
 *  Leitura de extratos bancários: OFX (1.x SGML e 2.x XML) e CSV.
 *
 *  lerExtrato(buffer, nomeArquivo) →
 *    { formato, itens: [{ data, descricao, tipo, valor, chave }],
 *      periodo: { inicio, fim }, saldo: { valor, data } | null }
 *
 *  - Codificação: tenta UTF-8; se não for válido, usa Windows-1252
 *    (padrão dos OFX de bancos brasileiros).
 *  - chave: identifica o lançamento para não importar duas vezes
 *    (FITID do OFX; no CSV, data+valor+descrição). Linhas idênticas no
 *    mesmo arquivo recebem um número de ocorrência.
 * ===================================================================== */
const crypto = require('crypto');

class ExtratoErro extends Error {}

function decodificar(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch (e) {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

const limparTexto = (s) => String(s || '')
  .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
  .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

function dataValida(a, m, d) {
  const dt = new Date(Date.UTC(a, m - 1, d));
  return a >= 1990 && a <= 2100 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Número em formato brasileiro ou americano: "1.234,56", "-1234.56", "(12,00)", "12,00 D", "R$ 5,00". */
function lerNumero(txt) {
  let s = String(txt ?? '').trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/\s*D$/i.test(s)) { neg = true; s = s.replace(/\s*D$/i, ''); }
  s = s.replace(/\s*C$/i, '');
  s = s.replace(/R\$|\s/g, '');
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); } else if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s)) return null;
  const ultVirg = s.lastIndexOf(','); const ultPonto = s.lastIndexOf('.');
  if (ultVirg > -1 && ultPonto > -1) {
    s = ultVirg > ultPonto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (ultVirg > -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (ultPonto > -1 && (s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, ''); // 1.234.567
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}

/** "23/10/2026", "23/10/26", "2026-10-23", "20261023" → "2026-10-23" */
function lerData(txt) {
  const s = String(txt || '').trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let a = Number(m[3]); if (a < 100) a += 2000;
    const mes = Number(m[2]); const d = Number(m[1]);
    return dataValida(a, mes, d) ? `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  }
  m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (m && dataValida(Number(m[1]), Number(m[2]), Number(m[3]))) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/* ---------------- OFX ---------------- */
function lerOFX(texto) {
  const tag = (bloco, nome) => {
    const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'));
    return m ? limparTexto(m[1]) : '';
  };
  const blocos = texto.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  const itens = [];
  blocos.forEach((b) => {
    const data = lerData(tag(b, 'DTPOSTED'));
    const valor = lerNumero(tag(b, 'TRNAMT'));
    if (!data || valor === null || valor === 0) return;
    const memo = tag(b, 'MEMO'); const nome = tag(b, 'NAME');
    // Alguns bancos repetem o tipo no MEMO e o pagador no NAME: junta sem repetir
    let descricao = memo && nome && !memo.toUpperCase().includes(nome.toUpperCase()) ? `${memo} ${nome}` : (memo || nome);
    if (tag(b, 'CHECKNUM') && !descricao) descricao = `Documento ${tag(b, 'CHECKNUM')}`;
    itens.push({ data, descricao: descricao || 'Sem descrição', valor, fitid: tag(b, 'FITID') });
  });
  const saldoTxt = (texto.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]+)/i) || [])[1];
  const saldoData = (texto.match(/<LEDGERBAL>[\s\S]*?<DTASOF>([^<\r\n]+)/i) || [])[1];
  const saldo = saldoTxt !== undefined && lerNumero(saldoTxt) !== null
    ? { valor: lerNumero(saldoTxt), data: lerData(saldoData) } : null;
  return { itens, saldo };
}

/* ---------------- CSV ---------------- */
function dividirLinha(linha, sep) {
  const out = []; let atual = ''; let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas;
    } else if (c === sep && !aspas) { out.push(atual); atual = ''; } else atual += c;
  }
  out.push(atual);
  return out.map((x) => x.trim());
}

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function lerCSV(texto) {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return { itens: [], saldo: null };
  // Separador: o que aparece mais nas primeiras linhas, fora de aspas
  const amostra = linhas.slice(0, 10).map((l) => l.replace(/"[^"]*"/g, ''));
  const sep = [';', '\t', ','].map((s) => [s, amostra.reduce((n, l) => n + l.split(s).length - 1, 0)])
    .sort((a, b) => b[1] - a[1])[0][0];
  const tabela = linhas.map((l) => dividirLinha(l, sep));

  // Cabeçalho: a primeira linha (entre as 10 primeiras) que nomeia a coluna de data
  let col = null; let inicio = 0;
  for (let i = 0; i < Math.min(10, tabela.length); i++) {
    const nomes = tabela[i].map(semAcento);
    const achar = (re) => nomes.findIndex((n) => re.test(n));
    const data = achar(/^(data|dt|date)\b|data (do )?(lanc|mov)/);
    if (data > -1 && tabela[i].every((c) => !lerData(c) || semAcento(c).includes('data'))) {
      col = {
        data,
        desc: achar(/descri|histor|lancamento|memo|detalhe|transacao|estabelecimento/),
        valor: achar(/^valor|^value|^amount|valor \(r\$\)/),
        credito: achar(/credito|entrada|^cr$/),
        debito: achar(/debito|saida|^db$|^dr$/),
        tipo: achar(/^(tipo|d\/c|c\/d|natureza)$/),
        doc: achar(/documento|^doc|^n[o.°º]? ?doc/)
      };
      inicio = i + 1;
      break;
    }
  }
  if (!col) col = { data: 0, desc: 1, valor: 2, credito: -1, debito: -1, tipo: -1, doc: -1 }; // Data;Descrição;Valor

  const itens = [];
  for (let i = inicio; i < tabela.length; i++) {
    const r = tabela[i];
    const data = lerData(r[col.data]);
    if (!data) continue;
    let descricao = limparTexto(col.desc > -1 ? r[col.desc] : r.filter((_, k) => k !== col.data && k !== col.valor).join(' '));
    if (/^saldo\b|^s a l d o|saldo (anterior|do dia|final|disponivel)/.test(semAcento(descricao))) continue;
    let valor = null;
    if (col.valor > -1 && r[col.valor] !== undefined && String(r[col.valor]).trim()) valor = lerNumero(r[col.valor]);
    if (valor === null && (col.credito > -1 || col.debito > -1)) {
      const cr = col.credito > -1 ? lerNumero(r[col.credito]) : null;
      const db = col.debito > -1 ? lerNumero(r[col.debito]) : null;
      if (cr) valor = Math.abs(cr); else if (db) valor = -Math.abs(db);
    }
    if (valor === null || valor === 0) continue;
    if (col.tipo > -1) {
      const t = semAcento(r[col.tipo]);
      if (/^d|debito|saida/.test(t)) valor = -Math.abs(valor);
      else if (/^c|credito|entrada/.test(t)) valor = Math.abs(valor);
    }
    if (col.doc > -1 && r[col.doc] && !descricao.includes(r[col.doc])) descricao = `${descricao} ${r[col.doc]}`.trim();
    itens.push({ data, descricao: descricao || 'Sem descrição', valor });
  }
  return { itens, saldo: null };
}

/* ---------------- Entrada principal ---------------- */
function lerExtrato(buf, nomeArquivo) {
  const texto = decodificar(buf);
  const ofx = /<OFX>|OFXHEADER|<STMTTRN>/i.test(texto.slice(0, 5000)) || /\.ofx$/i.test(nomeArquivo || '');
  const lido = ofx ? lerOFX(texto) : lerCSV(texto);
  if (!lido.itens.length) {
    throw new ExtratoErro(ofx
      ? 'Nenhum lançamento encontrado no arquivo OFX.'
      : 'Nenhum lançamento encontrado. O CSV precisa ter as colunas de data, descrição e valor (ou crédito e débito).');
  }
  if (lido.itens.length > 5000) throw new ExtratoErro('O arquivo tem mais de 5.000 lançamentos. Importe um período menor.');

  const vistos = new Map();
  const itens = lido.itens.map((x) => {
    const valor = Math.abs(x.valor);
    const tipo = x.valor < 0 ? 'debito' : 'credito';
    const descricao = x.descricao.slice(0, 200);
    const base = ofx && x.fitid
      ? `ofx|${x.fitid}|${x.data}|${x.valor.toFixed(2)}`
      : `lin|${x.data}|${x.valor.toFixed(2)}|${descricao.toUpperCase()}`;
    const n = (vistos.get(base) || 0) + 1;
    vistos.set(base, n);
    const chave = crypto.createHash('sha256').update(`${base}|${n}`).digest('hex').slice(0, 40);
    return { data: x.data, descricao, tipo, valor, chave };
  }).sort((a, b) => a.data.localeCompare(b.data));

  return {
    formato: ofx ? 'ofx' : 'csv',
    itens,
    periodo: { inicio: itens[0].data, fim: itens[itens.length - 1].data },
    saldo: lido.saldo
  };
}

module.exports = { lerExtrato, lerNumero, lerData, ExtratoErro };
