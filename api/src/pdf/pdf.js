'use strict';
/* =====================================================================
 *  Gerador de PDF mínimo, sem dependências (só zlib do Node).
 *  Página A4, fontes padrão Helvetica / Helvetica-Bold (WinAnsi, com
 *  acentos do português), texto, parágrafos com quebra, linhas,
 *  retângulos (com cantos arredondados) e QR Code vetorial.
 *
 *  Coordenadas em pontos (1 pt = 1/72"), com origem no CANTO SUPERIOR
 *  ESQUERDO; o "y" do texto é a linha de base.
 * ===================================================================== */
const zlib = require('zlib');
const METRICAS = require('./metricas');

const A4 = { larg: 595.28, alt: 841.89 };

// Unicode → WinAnsi para os caracteres fora do Latin-1
const ESPECIAIS = {
  0x20AC: 128, 0x201A: 130, 0x0192: 131, 0x201E: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x02C6: 136,
  0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140, 0x017D: 142, 0x2018: 145, 0x2019: 146, 0x201C: 147,
  0x201D: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x02DC: 152, 0x2122: 153, 0x0161: 154, 0x203A: 155,
  0x0153: 156, 0x017E: 158, 0x0178: 159, 0x2212: 45
};

function winAnsi(texto) {
  const bytes = [];
  for (const ch of String(texto ?? '').normalize('NFC')) {
    const c = ch.codePointAt(0);
    if (c === 9 || c === 10 || c === 13) bytes.push(32);
    else if (c >= 32 && c < 127) bytes.push(c);
    else if (c >= 160 && c <= 255) bytes.push(c);
    else if (ESPECIAIS[c]) bytes.push(ESPECIAIS[c]);
    else if (c >= 32) bytes.push(63); // "?"
  }
  return bytes;
}

const num = (n) => {
  const s = (Math.round(n * 100) / 100).toFixed(2);
  return s.replace(/\.?0+$/, '') || '0';
};

function cor(hex) {
  const h = String(hex || '#000').replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => num(parseInt(v.slice(i, i + 2), 16) / 255)).join(' ');
}

function textoPdf(s) {
  // Texto de metadados em UTF-16BE com BOM (aceita qualquer acento)
  return '<FEFF' + Buffer.from(String(s), 'utf16le').swap16().toString('hex').toUpperCase() + '>';
}

class Documento {
  constructor({ titulo = 'Documento', autor = 'EduGest' } = {}) {
    this.titulo = titulo;
    this.autor = autor;
    this.paginas = [];
    this.ops = null;
  }

  pagina() {
    this.ops = [];
    this.paginas.push(this.ops);
    return this;
  }

  /* ---------- Medidas ---------- */
  largura(texto, tam = 10, negrito = false) {
    const t = negrito ? METRICAS.negrito : METRICAS.normal;
    return winAnsi(texto).reduce((s, b) => s + (t[b - 32] || 0), 0) * tam / 1000;
  }

  /** Quebra o texto em linhas que caibam em "larg". Palavras maiores que a
   *  linha (ex.: PIX copia e cola) são cortadas por caractere. */
  quebrar(texto, tam, larg, negrito = false) {
    const linhas = [];
    String(texto ?? '').split('\n').forEach((paragrafo) => {
      let atual = '';
      paragrafo.split(/ +/).forEach((palavra) => {
        const tentativa = atual ? `${atual} ${palavra}` : palavra;
        if (this.largura(tentativa, tam, negrito) <= larg) { atual = tentativa; return; }
        if (atual) linhas.push(atual);
        atual = '';
        let resto = palavra;
        while (this.largura(resto, tam, negrito) > larg) {
          let n = resto.length;
          while (n > 1 && this.largura(resto.slice(0, n), tam, negrito) > larg) n--;
          linhas.push(resto.slice(0, n));
          resto = resto.slice(n);
        }
        atual = resto;
      });
      linhas.push(atual);
    });
    return linhas;
  }

  /** Corta o texto com "..." para caber em uma linha. */
  cortar(texto, tam, larg, negrito = false) {
    let s = String(texto ?? '');
    if (this.largura(s, tam, negrito) <= larg) return s;
    while (s.length > 1 && this.largura(s + '...', tam, negrito) > larg) s = s.slice(0, -1);
    return s.trimEnd() + '...';
  }

  /* ---------- Desenho ---------- */
  texto(x, y, texto, { tam = 10, negrito = false, cor: c = '#1f2937', alinhar = 'left' } = {}) {
    const s = String(texto ?? '');
    if (!s) return this;
    let px = x;
    if (alinhar !== 'left') {
      const w = this.largura(s, tam, negrito);
      px = alinhar === 'right' ? x - w : x - w / 2;
    }
    const hex = Buffer.from(winAnsi(s)).toString('hex').toUpperCase();
    this.ops.push(`BT ${cor(c)} rg /${negrito ? 'F2' : 'F1'} ${num(tam)} Tf 1 0 0 1 ${num(px)} ${num(A4.alt - y)} Tm <${hex}> Tj ET`);
    return this;
  }

  /** Escreve um parágrafo com quebra automática. Devolve o "y" da próxima linha. */
  paragrafo(x, y, texto, { tam = 10, larg = 400, entrelinha = 1.35, maxLinhas = Infinity, ...resto } = {}) {
    let linhas = this.quebrar(texto, tam, larg, resto.negrito);
    if (linhas.length > maxLinhas) {
      linhas = linhas.slice(0, maxLinhas);
      linhas[maxLinhas - 1] = this.cortar(linhas[maxLinhas - 1] + '...', tam, larg, resto.negrito);
    }
    linhas.forEach((l, i) => this.texto(x, y + i * tam * entrelinha, l, { tam, ...resto }));
    return y + linhas.length * tam * entrelinha;
  }

  linha(x1, y1, x2, y2, { cor: c = '#cbd5e1', esp = 0.6, tracejado = null } = {}) {
    this.ops.push(`q ${cor(c)} RG ${num(esp)} w ${tracejado ? `[${tracejado.join(' ')}] 0 d` : ''} `
      + `${num(x1)} ${num(A4.alt - y1)} m ${num(x2)} ${num(A4.alt - y2)} l S Q`);
    return this;
  }

  ret(x, y, w, h, { preencher = null, contorno = null, esp = 0.6, raio = 0, tracejado = null } = {}) {
    if (!preencher && !contorno) return this;
    const y0 = A4.alt - y - h;
    let caminho;
    if (raio > 0) {
      const r = Math.min(raio, w / 2, h / 2);
      const k = r * 0.5523;
      const x1 = x + w; const y1 = y0 + h;
      caminho = `${num(x + r)} ${num(y0)} m ${num(x1 - r)} ${num(y0)} l `
        + `${num(x1 - r + k)} ${num(y0)} ${num(x1)} ${num(y0 + r - k)} ${num(x1)} ${num(y0 + r)} c `
        + `${num(x1)} ${num(y1 - r)} l ${num(x1)} ${num(y1 - r + k)} ${num(x1 - r + k)} ${num(y1)} ${num(x1 - r)} ${num(y1)} c `
        + `${num(x + r)} ${num(y1)} l ${num(x + r - k)} ${num(y1)} ${num(x)} ${num(y1 - r + k)} ${num(x)} ${num(y1 - r)} c `
        + `${num(x)} ${num(y0 + r)} l ${num(x)} ${num(y0 + r - k)} ${num(x + r - k)} ${num(y0)} ${num(x + r)} ${num(y0)} c h`;
    } else {
      caminho = `${num(x)} ${num(y0)} ${num(w)} ${num(h)} re`;
    }
    const estilo = [];
    if (preencher) estilo.push(`${cor(preencher)} rg`);
    if (contorno) estilo.push(`${cor(contorno)} RG ${num(esp)} w`);
    if (tracejado) estilo.push(`[${tracejado.join(' ')}] 0 d`);
    const op = preencher && contorno ? 'B' : preencher ? 'f' : 'S';
    this.ops.push(`q ${estilo.join(' ')} ${caminho} ${op} Q`);
    return this;
  }

  /** QR Code vetorial (módulos escuros agrupados por linha). */
  qr(x, y, lado, { tamanho, modulos }, { cor: c = '#000000' } = {}) {
    const m = lado / tamanho;
    const partes = [];
    for (let i = 0; i < tamanho; i++) {
      let j = 0;
      while (j < tamanho) {
        if (!modulos[i][j]) { j++; continue; }
        let k = j;
        while (k < tamanho && modulos[i][k]) k++;
        // pequena sobreposição evita frestas brancas entre módulos em alguns visualizadores
        partes.push(`${num(x + j * m)} ${num(A4.alt - y - (i + 1) * m)} ${num((k - j) * m + 0.05)} ${num(m + 0.05)} re`);
        j = k;
      }
    }
    this.ops.push(`q ${cor(c)} rg ${partes.join(' ')} f Q`);
    return this;
  }

  /* ---------- Saída ---------- */
  gerar() {
    if (!this.paginas.length) this.pagina();
    const objetos = []; // índice 0 = objeto 1
    const add = (conteudo) => { objetos.push(conteudo); return objetos.length; };

    const catalogo = add(null);
    const paginasObj = add(null);
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const agora = new Date();
    const d = (n) => String(n).padStart(2, '0');
    const dataPdf = `D:${agora.getUTCFullYear()}${d(agora.getUTCMonth() + 1)}${d(agora.getUTCDate())}${d(agora.getUTCHours())}${d(agora.getUTCMinutes())}${d(agora.getUTCSeconds())}Z`;
    const info = add(`<< /Title ${textoPdf(this.titulo)} /Author ${textoPdf(this.autor)} /Producer (EduGest - Reis Tecnologia) /CreationDate (${dataPdf}) >>`);

    const kids = [];
    this.paginas.forEach((ops) => {
      const dados = zlib.deflateSync(Buffer.from(ops.join('\n'), 'latin1'));
      const conteudo = add({ dict: `<< /Length ${dados.length} /Filter /FlateDecode >>`, stream: dados });
      kids.push(add(`<< /Type /Page /Parent ${paginasObj} 0 R /MediaBox [0 0 ${A4.larg} ${A4.alt}] `
        + `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${conteudo} 0 R >>`));
    });
    objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${paginasObj} 0 R >>`;
    objetos[paginasObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

    const partes = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
    let pos = partes[0].length;
    const offsets = [];
    objetos.forEach((o, i) => {
      offsets.push(pos);
      const b = typeof o === 'string'
        ? Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1')
        : Buffer.concat([Buffer.from(`${i + 1} 0 obj\n${o.dict}\nstream\n`, 'latin1'), o.stream, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
      partes.push(b);
      pos += b.length;
    });
    const xref = [`xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`]
      .concat(offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)).join('');
    partes.push(Buffer.from(`${xref}trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
    return Buffer.concat(partes);
  }
}

module.exports = { Documento, A4, winAnsi };
