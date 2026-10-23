'use strict';
/* Valores e datas por extenso, em português do Brasil. */

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** 0 a 999 */
function ate999(n) {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10); const u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(' e ');
}

/** Inteiro de 0 a 999.999.999.999 por extenso. */
function inteiro(n) {
  if (n === 0) return 'zero';
  const grupos = [];
  let x = n;
  while (x > 0) { grupos.push(x % 1000); x = Math.floor(x / 1000); }
  const nomes = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
  const partes = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    let t;
    if (i === 1 && g === 1) t = 'mil';
    else t = ate999(g) + (i ? ` ${nomes[i][g === 1 ? 0 : 1]}` : '');
    partes.push({ t, g });
  }
  // "e" antes do último grupo quando ele é menor que 100 ou centena redonda
  return partes.map((p, i) => {
    if (i === 0) return p.t;
    const ultimo = i === partes.length - 1;
    return (ultimo && (p.g < 100 || p.g % 100 === 0) ? ' e ' : ', ') + p.t;
  }).join('');
}

/** 1234.5 → "mil, duzentos e trinta e quatro reais e cinquenta centavos" */
function valorPorExtenso(valor) {
  const centavosTotal = Math.round(Number(valor) * 100);
  const reais = Math.floor(centavosTotal / 100);
  const cent = centavosTotal % 100;
  const partes = [];
  if (reais) {
    const milhaoRedondo = reais >= 1e6 && reais % 1e6 === 0;
    partes.push(`${inteiro(reais)}${milhaoRedondo ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (cent) partes.push(`${inteiro(cent)} ${cent === 1 ? 'centavo' : 'centavos'}`);
  return partes.length ? partes.join(' e ') : 'zero real';
}

/** '2026-10-23' → "23 de outubro de 2026" */
function dataPorExtenso(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

module.exports = { valorPorExtenso, dataPorExtenso, inteiro };
