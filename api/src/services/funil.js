'use strict';
/* =====================================================================
 *  Funil de matrículas — etapas, listas fixas, formatação e indicadores
 *
 *  Etapas: lead (Interessado) → visita (Visita agendada) → proposta →
 *  matriculado | perdido. "Matriculado" só pela matrícula (cria ou vincula
 *  o aluno); "perdido" pede o motivo.
 * ===================================================================== */
const crypto = require('crypto');
const { query } = require('../db');
const { agoraSP, hojeSP } = require('../utils/datas');

const ETAPAS = { lead: 'Interessado', visita: 'Visita agendada', proposta: 'Proposta', matriculado: 'Matriculado', perdido: 'Perdido' };
const ATIVAS = ['lead', 'visita', 'proposta'];
const ORIGENS = ['Indicação', 'Instagram', 'Facebook', 'Google', 'Site do colégio', 'WhatsApp', 'Passou em frente', 'Panfleto ou faixa',
  'Evento', 'Irmão já estuda aqui', 'Outro'];
const MOTIVOS = ['Preço', 'Distância ou transporte', 'Escolheu outra escola', 'Sem vaga na série ou turno', 'Não respondeu mais',
  'Mudou de cidade', 'Desistiu ou adiou', 'Outro'];
const TURNOS = { matutino: 'Matutino', vespertino: 'Vespertino', integral: 'Integral', noturno: 'Noturno' };
const SERIES = ['Berçário', 'Maternal I', 'Maternal II', 'Infantil I', 'Infantil II', 'Infantil III',
  '1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano', '6º Ano', '7º Ano', '8º Ano', '9º Ano',
  '1ª Série EM', '2ª Série EM', '3ª Série EM', 'EJA'];

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const digitos = (s) => String(s || '').replace(/\D/g, '');
const novoToken = () => crypto.randomBytes(12).toString('base64url');

function diasEntre(a, b) {
  if (!a || !b) return null;
  return Math.round((Date.parse(`${String(b).slice(0, 10)}T12:00:00Z`) - Date.parse(`${String(a).slice(0, 10)}T12:00:00Z`)) / 86400000);
}

function formatar(l, hoje = hojeSP()) {
  const ativo = ATIVAS.includes(l.etapa);
  let contato = null;
  if (ativo && l.proximo_contato) {
    const d = String(l.proximo_contato).slice(0, 10);
    contato = d < hoje ? 'atrasado' : d === hoje ? 'hoje' : 'futuro';
  }
  return {
    id: l.id, nomeAluno: l.nome_aluno, nascimento: l.nascimento, serie: l.serie_pretendida, ano: l.ano_pretendido,
    turno: l.turno_pretendido, responsavel: l.responsavel, telefone: l.telefone, email: l.email, origem: l.origem,
    etapa: l.etapa, obs: l.obs, proximoContato: l.proximo_contato, visitaEm: l.visita_em, motivoPerda: l.motivo_perda,
    alunoId: l.aluno_id, aluno: l.aluno_nome || null, viaFormulario: !!Number(l.via_formulario), novo: ativo && !l.visto_em,
    diasNaEtapa: diasEntre(l.etapa_em || l.criado_em, hoje), criadoEm: l.criado_em, etapaEm: l.etapa_em, contato
  };
}

/** Anota no histórico do interessado (dentro ou fora de transação). */
async function anotar(executar, colegioId, leadId, tipo, texto, usuario) {
  const sql = `INSERT INTO lead_interacoes (colegio_id, lead_id, tipo, texto, usuario_id, usuario_nome, criado_em)
               VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const p = [colegioId, leadId, tipo, String(texto).slice(0, 600), usuario ? usuario.id : null, usuario ? usuario.nome || null : null, agoraSP()];
  return executar === null ? query(sql, p) : executar(sql, p);
}

/**
 * Indicadores da captação a partir das linhas de leads.
 * Conversão = matriculados ÷ (matriculados + perdidos): só conta quem já terminou.
 */
function indicadores(linhas, hoje = hojeSP()) {
  const porEtapa = Object.fromEntries(Object.keys(ETAPAS).map((k) => [k, 0]));
  const grupo = () => new Map();
  const origens = grupo(); const series = grupo(); const motivos = new Map();
  const meses = new Map();
  let diasSoma = 0; let diasN = 0;
  const ini12 = (() => { const [a, m] = hoje.slice(0, 7).split('-').map(Number); const d = new Date(Date.UTC(a, m - 12, 1)); return d.toISOString().slice(0, 7); })();
  const somar = (mapa, chave, l) => {
    const k = chave || 'Não informado';
    if (!mapa.has(k)) mapa.set(k, { nome: k, total: 0, matriculados: 0, perdidos: 0, andamento: 0 });
    const x = mapa.get(k);
    x.total++;
    if (l.etapa === 'matriculado') x.matriculados++;
    else if (l.etapa === 'perdido') x.perdidos++;
    else x.andamento++;
  };
  linhas.forEach((l) => {
    porEtapa[l.etapa] = (porEtapa[l.etapa] || 0) + 1;
    somar(origens, l.origem, l);
    somar(series, l.serie_pretendida, l);
    if (l.etapa === 'perdido') motivos.set(l.motivo_perda || 'Não informado', (motivos.get(l.motivo_perda || 'Não informado') || 0) + 1);
    const mc = String(l.criado_em).slice(0, 7);
    if (mc >= ini12) { if (!meses.has(mc)) meses.set(mc, { novos: 0, matriculas: 0 }); meses.get(mc).novos++; }
    if (l.etapa === 'matriculado') {
      const me = String(l.etapa_em || l.atualizado_em).slice(0, 7);
      if (me >= ini12) { if (!meses.has(me)) meses.set(me, { novos: 0, matriculas: 0 }); meses.get(me).matriculas++; }
      const d = diasEntre(l.criado_em, l.etapa_em);
      if (d !== null && d >= 0) { diasSoma += d; diasN++; }
    }
  });
  const conv = (x) => (x.matriculados + x.perdidos ? Math.round((x.matriculados / (x.matriculados + x.perdidos)) * 1000) / 10 : null);
  const lista = (m) => [...m.values()].map((x) => ({ ...x, conversao: conv(x) })).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
  const fechados = porEtapa.matriculado + porEtapa.perdido;
  const mesesLista = [];
  for (let i = 11; i >= 0; i--) {
    const [a, m] = hoje.slice(0, 7).split('-').map(Number);
    const ref = new Date(Date.UTC(a, m - 1 - i, 1)).toISOString().slice(0, 7);
    mesesLista.push({ mes: ref, ...(meses.get(ref) || { novos: 0, matriculas: 0 }) });
  }
  return {
    total: linhas.length,
    porEtapa,
    emAndamento: ATIVAS.reduce((s, k) => s + porEtapa[k], 0),
    conversao: fechados ? Math.round((porEtapa.matriculado / fechados) * 1000) / 10 : null,
    diasAteMatricula: diasN ? Math.round(diasSoma / diasN) : null,
    origens: lista(origens),
    series: lista(series),
    motivos: [...motivos.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
    meses: mesesLista
  };
}

module.exports = { ETAPAS, ATIVAS, ORIGENS, MOTIVOS, TURNOS, SERIES, semAcento, digitos, novoToken, diasEntre, formatar, anotar, indicadores };
