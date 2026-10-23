'use strict';
/* =====================================================================
 *  PIX "copia e cola" estático (BR Code / EMV-MPM do Banco Central).
 *  Não depende de banco nem de API: qualquer app de banco lê o QR,
 *  mostra o beneficiário cadastrado na chave e o valor já preenchido.
 *  O pagamento NÃO é confirmado automaticamente ao sistema.
 * ===================================================================== */

const TIPOS_CHAVE = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  celular: 'Celular',
  email: 'E-mail',
  aleatoria: 'Chave aleatória'
};

/** Remove acentos e caracteres fora do ASCII básico. */
function ascii(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .,\-/@]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normaliza a chave conforme o tipo. Devolve null se for inválida. */
function normalizarChave(tipo, chave) {
  const s = String(chave ?? '').trim();
  const dig = s.replace(/\D/g, '');
  switch (tipo) {
    case 'cpf': return dig.length === 11 ? dig : null;
    case 'cnpj': {
      // aceita o CNPJ alfanumérico (Receita Federal, a partir de jul/2026)
      const c = s.toUpperCase().replace(/[^0-9A-Z]/g, '');
      return c.length === 14 ? c : null;
    }
    case 'celular': {
      const d = dig.startsWith('55') && dig.length >= 12 ? dig.slice(2) : dig;
      return d.length === 10 || d.length === 11 ? `+55${d}` : null;
    }
    case 'email': {
      const e = s.toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 77 ? e : null;
    }
    case 'aleatoria': {
      const e = s.toLowerCase();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(e) ? e : null;
    }
    default: return null;
  }
}

const campo = (id, valor) => {
  const v = String(valor);
  if (v.length > 99) throw new Error(`Campo PIX ${id} longo demais`);
  return id + String(v.length).padStart(2, '0') + v;
};

/** CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF), em hexadecimal maiúsculo. */
function crc16(texto) {
  let crc = 0xFFFF;
  for (const b of Buffer.from(texto, 'utf8')) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Monta o código PIX copia e cola.
 * @param {object} p
 * @param {string} p.chave       chave já normalizada
 * @param {string} p.nome        beneficiário (até 25 caracteres, sem acento)
 * @param {string} p.cidade      cidade (até 15 caracteres, sem acento)
 * @param {number} [p.valor]     valor em reais (omitido = pagador digita)
 * @param {string} [p.txid]      identificador (até 25 letras/números)
 * @param {string} [p.descricao] mensagem exibida ao pagador (cabendo no campo)
 */
function payloadPix({ chave, nome, cidade, valor, txid, descricao }) {
  if (!chave) throw new Error('Chave PIX não informada');
  const nomeA = ascii(nome).slice(0, 25) || 'BENEFICIARIO';
  const cidadeA = ascii(cidade).slice(0, 15) || 'BRASIL';
  const id = String(txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';

  let conta = campo('00', 'br.gov.bcb.pix') + campo('01', chave);
  const desc = ascii(descricao);
  const espaco = 99 - conta.length - 4;
  if (desc && espaco > 0) conta += campo('02', desc.slice(0, espaco));

  let p = campo('00', '01')
    + campo('26', conta)
    + campo('52', '0000')
    + campo('53', '986')
    + (valor > 0 ? campo('54', Number(valor).toFixed(2)) : '')
    + campo('58', 'BR')
    + campo('59', nomeA)
    + campo('60', cidadeA)
    + campo('62', campo('05', id))
    + '6304';
  return p + crc16(p);
}

module.exports = { TIPOS_CHAVE, normalizarChave, payloadPix, crc16, ascii };
