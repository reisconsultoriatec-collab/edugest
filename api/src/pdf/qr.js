'use strict';
/* =====================================================================
 *  Gerador de QR Code (ISO/IEC 18004) sem dependências.
 *  Modo byte (UTF-8), versões 1 a 40, correção de erro L/M/Q/H,
 *  escolha automática da máscara pela pontuação de penalidade.
 *
 *  gerarQR('texto', 'M') → { tamanho, modulos: boolean[][] }  (modulos[y][x])
 * ===================================================================== */

const NIVEIS = { L: 0, M: 1, Q: 2, H: 3 };
const BITS_FORMATO = [1, 0, 3, 2]; // L, M, Q, H

// Codewords de correção por bloco e número de blocos [nível][versão]
const ECC_POR_BLOCO = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
];
const NUM_BLOCOS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
];

const bit = (x, i) => ((x >>> i) & 1) !== 0;

function modulosBrutos(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}

const codewordsDados = (ver, n) => Math.floor(modulosBrutos(ver) / 8) - ECC_POR_BLOCO[n][ver] * NUM_BLOCOS[n][ver];

/* ---------- Reed-Solomon em GF(2^8), polinômio 0x11D ---------- */
function mult(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11D);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function divisorRS(grau) {
  const r = new Array(grau).fill(0);
  r[grau - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = mult(r[j], raiz);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    raiz = mult(raiz, 0x02);
  }
  return r;
}

function restoRS(dados, divisor) {
  const r = divisor.map(() => 0);
  for (const b of dados) {
    const fator = b ^ r.shift();
    r.push(0);
    divisor.forEach((c, i) => { r[i] ^= mult(c, fator); });
  }
  return r;
}

/* ---------- Codificação dos dados ---------- */
function codificar(bytes, n) {
  let ver = 1;
  for (; ver <= 40; ver++) {
    const bitsContagem = ver <= 9 ? 8 : 16;
    if (4 + bitsContagem + bytes.length * 8 <= codewordsDados(ver, n) * 8) break;
  }
  if (ver > 40) throw new Error('Texto longo demais para um QR Code');

  const bits = [];
  const anexar = (valor, qtd) => { for (let i = qtd - 1; i >= 0; i--) bits.push((valor >>> i) & 1); };
  anexar(0x4, 4); // modo byte
  anexar(bytes.length, ver <= 9 ? 8 : 16);
  bytes.forEach((b) => anexar(b, 8));

  const capacidade = codewordsDados(ver, n) * 8;
  anexar(0, Math.min(4, capacidade - bits.length));
  anexar(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xEC; bits.length < capacidade; pad ^= 0xEC ^ 0x11) anexar(pad, 8);

  const dados = [];
  for (let i = 0; i < bits.length; i += 8) dados.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  return { ver, dados };
}

function intercalar(dados, ver, n) {
  const blocos = NUM_BLOCOS[n][ver];
  const eccLen = ECC_POR_BLOCO[n][ver];
  const brutos = Math.floor(modulosBrutos(ver) / 8);
  const curtos = blocos - (brutos % blocos);
  const tamCurto = Math.floor(brutos / blocos);
  const div = divisorRS(eccLen);

  const lista = [];
  for (let i = 0, k = 0; i < blocos; i++) {
    const d = dados.slice(k, k + tamCurto - eccLen + (i < curtos ? 0 : 1));
    k += d.length;
    const ecc = restoRS(d, div);
    if (i < curtos) d.push(0);
    lista.push(d.concat(ecc));
  }
  const r = [];
  for (let i = 0; i < lista[0].length; i++) {
    lista.forEach((b, j) => { if (i !== tamCurto - eccLen || j >= curtos) r.push(b[i]); });
  }
  return r;
}

/* ---------- Matriz ---------- */
function gerarQR(texto, nivel = 'M') {
  const n = NIVEIS[nivel];
  if (n === undefined) throw new Error('Nível de correção inválido');
  const { ver, dados } = codificar([...Buffer.from(String(texto), 'utf8')], n);
  const codewords = intercalar(dados, ver, n);
  const tam = ver * 4 + 17;
  const mod = Array.from({ length: tam }, () => new Array(tam).fill(false));
  const fixo = Array.from({ length: tam }, () => new Array(tam).fill(false));
  const pintar = (x, y, escuro) => { mod[y][x] = escuro; fixo[y][x] = true; };

  // Padrões de temporização
  for (let i = 0; i < tam; i++) { pintar(6, i, i % 2 === 0); pintar(i, 6, i % 2 === 0); }

  // Localizadores (3 cantos)
  const localizador = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx; const y = cy + dy;
        if (x >= 0 && x < tam && y >= 0 && y < tam) pintar(x, y, d !== 2 && d !== 4);
      }
    }
  };
  localizador(3, 3); localizador(tam - 4, 3); localizador(3, tam - 4);

  // Alinhamento
  const pos = [];
  if (ver > 1) {
    const num = Math.floor(ver / 7) + 2;
    const passo = Math.floor((ver * 8 + num * 3 + 5) / (num * 4 - 4)) * 2;
    for (let p = tam - 7; pos.length < num - 1; p -= passo) pos.unshift(p);
    pos.unshift(6);
  }
  pos.forEach((py, i) => pos.forEach((px, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) pintar(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }));

  const formato = (mascara) => {
    const d = (BITS_FORMATO[n] << 3) | mascara;
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((d << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) pintar(8, i, bit(bits, i));
    pintar(8, 7, bit(bits, 6));
    pintar(8, 8, bit(bits, 7));
    pintar(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) pintar(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) pintar(tam - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) pintar(8, tam - 15 + i, bit(bits, i));
    pintar(8, tam - 8, true); // módulo escuro fixo
  };
  formato(0); // reserva as áreas

  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = tam - 11 + (i % 3); const b = Math.floor(i / 3);
      pintar(a, b, bit(bits, i)); pintar(b, a, bit(bits, i));
    }
  }

  // Dados em zigue-zague
  let i = 0;
  for (let dir = tam - 1; dir >= 1; dir -= 2) {
    if (dir === 6) dir = 5;
    for (let v = 0; v < tam; v++) {
      for (let j = 0; j < 2; j++) {
        const x = dir - j;
        const subindo = ((dir + 1) & 2) === 0;
        const y = subindo ? tam - 1 - v : v;
        if (!fixo[y][x] && i < codewords.length * 8) {
          mod[y][x] = bit(codewords[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }

  const aplicarMascara = (m) => {
    for (let y = 0; y < tam; y++) {
      for (let x = 0; x < tam; x++) {
        let inv;
        switch (m) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        if (!fixo[y][x] && inv) mod[y][x] = !mod[y][x];
      }
    }
  };

  let melhor = 0;
  let menor = Infinity;
  for (let m = 0; m < 8; m++) {
    aplicarMascara(m);
    formato(m);
    const p = penalidade(mod, tam);
    if (p < menor) { menor = p; melhor = m; }
    aplicarMascara(m); // desfaz (XOR)
  }
  aplicarMascara(melhor);
  formato(melhor);
  return { tamanho: tam, versao: ver, mascara: melhor, modulos: mod };
}

/* ---------- Penalidade (escolha da máscara) ---------- */
function penalidade(mod, tam) {
  let r = 0;
  const contarPadroes = (h) => {
    const n = h[1];
    const nucleo = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
    return (nucleo && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (nucleo && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
  };
  const addHist = (len, h) => { if (h[0] === 0) len += tam; h.pop(); h.unshift(len); };
  const linha = (ler) => {
    let cor = false; let corrida = 0; const h = [0, 0, 0, 0, 0, 0, 0];
    for (let k = 0; k < tam; k++) {
      if (ler(k) === cor) {
        corrida++;
        if (corrida === 5) r += 3; else if (corrida > 5) r++;
      } else {
        addHist(corrida, h);
        if (!cor) r += contarPadroes(h) * 40;
        cor = ler(k); corrida = 1;
      }
    }
    if (cor) { addHist(corrida, h); corrida = 0; }
    corrida += tam;
    addHist(corrida, h);
    r += contarPadroes(h) * 40;
  };
  for (let y = 0; y < tam; y++) linha((x) => mod[y][x]);
  for (let x = 0; x < tam; x++) linha((y) => mod[y][x]);
  let escuros = 0;
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      if (mod[y][x]) escuros++;
      if (y < tam - 1 && x < tam - 1) {
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) r += 3;
      }
    }
  }
  const total = tam * tam;
  r += (Math.ceil(Math.abs(escuros * 20 - total * 10) / total) - 1) * 10;
  return r;
}

module.exports = { gerarQR };
