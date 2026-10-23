'use strict';
/* =====================================================================
 *  Validação de entrada — tudo que vem do navegador passa por aqui.
 *  Cada função devolve o valor limpo (ou null) ou lança HttpErro 400.
 * ===================================================================== */
const { HttpErro } = require('../middleware/erros');

function erro(msg) {
  return new HttpErro(400, msg, 'validacao');
}

/** Texto aparado. Vazio vira null (ou erro, se obrigatório). */
function texto(valor, campo, { max = 255, min = 0, obrigatorio = false } = {}) {
  if (valor === undefined || valor === null) valor = '';
  if (typeof valor !== 'string' && typeof valor !== 'number') throw erro(`${campo} inválido`);
  const s = String(valor).trim();
  if (!s) {
    if (obrigatorio) throw erro(`${campo} é obrigatório`);
    return null;
  }
  if (s.length > max) throw erro(`${campo}: máximo de ${max} caracteres`);
  if (s.length < min) throw erro(`${campo}: mínimo de ${min} caracteres`);
  return s;
}

function email(valor, campo = 'E-mail', obrigatorio = false) {
  const s = texto(valor, campo, { max: 160, obrigatorio });
  if (s === null) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw erro(`${campo} inválido`);
  return s.toLowerCase();
}

const digitos = (s) => String(s || '').replace(/\D/g, '');

function validaCPF(c) {
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += Number(c[i]) * (10 - i);
  let d1 = 11 - (s % 11); if (d1 >= 10) d1 = 0;
  s = 0;
  for (let i = 0; i < 10; i++) s += Number(c[i]) * (11 - i);
  let d2 = 11 - (s % 11); if (d2 >= 10) d2 = 0;
  return Number(c[9]) === d1 && Number(c[10]) === d2;
}

function cpf(valor, campo = 'CPF') {
  const s = texto(valor, campo, { max: 14 });
  if (s === null) return null;
  const c = digitos(s);
  if (!validaCPF(c)) throw erro(`${campo} inválido`);
  return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/* CNPJ numérico ou alfanumérico (Receita Federal, a partir de jul/2026):
 * 12 caracteres [0-9A-Z] + 2 dígitos verificadores. Cada caractere vale
 * (código ASCII − 48), o que mantém o cálculo antigo para os números. */
function validaCNPJ(c) {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const val = (ch) => ch.charCodeAt(0) - 48;
  const dv = (base) => {
    let soma = 0;
    let peso = 2;
    for (let i = base.length - 1; i >= 0; i--) {
      soma += val(base[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(c.slice(0, 12));
  const d2 = dv(c.slice(0, 12) + d1);
  return Number(c[12]) === d1 && Number(c[13]) === d2;
}

function cnpj(valor, campo = 'CNPJ') {
  const s = texto(valor, campo, { max: 18 });
  if (s === null) return null;
  const c = s.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!validaCNPJ(c)) throw erro(`${campo} inválido`);
  return c.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
}

function telefone(valor, campo = 'Telefone') {
  const s = texto(valor, campo, { max: 20 });
  if (s === null) return null;
  let d = digitos(s);
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) throw erro(`${campo} inválido — use DDD + número`);
  return d.length === 11
    ? d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
    : d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
}

function inteiro(valor, campo, { min = -Infinity, max = Infinity, obrigatorio = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obrigatorio) throw erro(`${campo} é obrigatório`);
    return null;
  }
  const n = Number(valor);
  if (!Number.isInteger(n)) throw erro(`${campo} deve ser um número inteiro`);
  if (n < min || n > max) throw erro(`${campo} deve estar entre ${min} e ${max}`);
  return n;
}

function decimal(valor, campo, { min = -Infinity, max = Infinity, obrigatorio = false, casas = 2 } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obrigatorio) throw erro(`${campo} é obrigatório`);
    return null;
  }
  const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : Number(valor);
  if (!Number.isFinite(n)) throw erro(`${campo} inválido`);
  if (n < min || n > max) throw erro(`${campo} deve estar entre ${min} e ${max}`);
  return Number(n.toFixed(casas));
}

function umDe(valor, opcoes, campo, { obrigatorio = true } = {}) {
  if ((valor === undefined || valor === null || valor === '') && !obrigatorio) return null;
  if (!opcoes.includes(valor)) throw erro(`${campo} inválido`);
  return valor;
}

/** id numérico vindo da URL; inválido vira 404 para não vazar informação. */
function id(valor) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new HttpErro(404, 'Registro não encontrado', 'nao_encontrado');
  return n;
}

module.exports = {
  texto, email, cpf, cnpj, telefone, inteiro, decimal, umDe, id,
  digitos, validaCPF, validaCNPJ
};
