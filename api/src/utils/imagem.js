'use strict';
/* =====================================================================
 *  Imagens JPEG (logotipo do colégio)
 *
 *  O navegador converte o arquivo escolhido (PNG, JPG, WEBP) em JPEG
 *  antes de enviar; aqui só conferimos que é mesmo um JPEG e lemos
 *  largura, altura e nº de componentes de cor — o PDF usa o JPEG como
 *  está (filtro DCTDecode), sem precisar decodificar a imagem.
 * ===================================================================== */

const MAX_BYTES = 400 * 1024;

/** @returns {{ largura, altura, componentes }|null} */
function lerJpeg(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let i = 2;
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xFF) return null;
    const marca = buf[i + 1];
    if (marca === 0xFF) { i++; continue; }                                   // bytes de preenchimento
    if (marca === 0x01 || (marca >= 0xD0 && marca <= 0xD8)) { i += 2; continue; } // marcadores sem tamanho
    if (marca === 0xD9 || marca === 0xDA) return null;                       // fim/dados antes do SOF
    const tam = buf.readUInt16BE(i + 2);
    if (tam < 2) return null;
    if (marca >= 0xC0 && marca <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marca)) {
      if (i + 9 >= buf.length) return null;
      const altura = buf.readUInt16BE(i + 5);
      const largura = buf.readUInt16BE(i + 7);
      const componentes = buf[i + 9];
      if (!largura || !altura || ![1, 3, 4].includes(componentes)) return null;
      return { largura, altura, componentes };
    }
    i += 2 + tam;
  }
  return null;
}

/** "data:image/jpeg;base64,..." → Buffer (ou null). */
function deDataUrl(s) {
  const m = String(s || '').match(/^data:image\/jpe?g;base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;
  return Buffer.from(m[1].replace(/\s/g, ''), 'base64');
}

const paraDataUrl = (buf) => `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;

/** Tamanho para caber em (maxL × maxA) mantendo a proporção. */
function caber(img, maxL, maxA) {
  const k = Math.min(maxL / img.largura, maxA / img.altura);
  return { w: img.largura * k, h: img.altura * k };
}

module.exports = { MAX_BYTES, lerJpeg, deDataUrl, paraDataUrl, caber };
