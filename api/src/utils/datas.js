'use strict';
/* Datas sempre no horário de São Paulo — nunca toISOString(),
 * que usa UTC e "vira o dia" às 21h. */

const FUSO = 'America/Sao_Paulo';

const fmtData = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit'
});

const fmtDataHora = new Intl.DateTimeFormat('sv-SE', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
});

/** 'AAAA-MM-DD' de hoje em São Paulo. */
function hojeSP() {
  return fmtData.format(new Date());
}

/** 'AAAA-MM-DD HH:MM:SS' de agora em São Paulo (formato DATETIME do MySQL). */
function agoraSP() {
  return fmtDataHora.format(new Date());
}

/** Valida 'AAAA-MM-DD'. */
function dataValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

module.exports = { FUSO, hojeSP, agoraSP, dataValida };
