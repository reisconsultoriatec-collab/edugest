'use strict';
/* =====================================================================
 *  Calendário escolar — feriados nacionais, dias letivos e público
 *
 *  Dias letivos de um bimestre = dias de segunda a sexta entre o início
 *  e o fim do bimestre, menos os feriados/recessos do colégio todo, mais
 *  os "dias letivos extras" (ex.: sábado letivo) do colégio todo.
 *  Público dos eventos: as mesmas regras dos comunicados (colégio todo,
 *  segmentos pela série da turma, ou turmas escolhidas).
 * ===================================================================== */
const { query } = require('../db');
const { noPublico, descreverPublico, listaSegmentos, segmentoDaSerie } = require('./comunicados');

const TIPOS = {
  evento: 'Evento',
  prova: 'Prova',
  reuniao: 'Reunião',
  conselho: 'Conselho de classe',
  feriado: 'Feriado',
  recesso: 'Recesso',
  letivo: 'Dia letivo extra',
  bimestre: 'Bimestre' // só para dados antigos; os bimestres agora ficam em periodos_letivos
};
const TIPOS_FORM = ['evento', 'prova', 'reuniao', 'conselho', 'feriado', 'recesso', 'letivo'];
const TIPOS_PROFESSOR = ['evento', 'prova', 'reuniao'];
const NAO_LETIVOS = ['feriado', 'recesso'];
const META_DIAS_LETIVOS = 200; // LDB, art. 24

/* ---------- Datas 'AAAA-MM-DD' (sem fuso: tudo em UTC) ---------- */
const iso = (a, m, d) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const paraData = (s) => new Date(`${s}T12:00:00Z`);
const deData = (dt) => dt.toISOString().slice(0, 10);
function somarDias(s, n) { const dt = paraData(s); dt.setUTCDate(dt.getUTCDate() + n); return deData(dt); }
const diaSemana = (s) => paraData(s).getUTCDay(); // 0 = domingo
const diasEntre = (a, b) => Math.round((paraData(b) - paraData(a)) / 86400000);

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(ano, mes, dia);
}

/**
 * Feriados nacionais do ano (Leis 662/1949, 6.802/1980 e 14.759/2023) e os
 * pontos facultativos que as escolas costumam seguir (Carnaval, Corpus Christi).
 */
function feriadosNacionais(ano) {
  const p = pascoa(ano);
  return [
    { data: iso(ano, 1, 1), titulo: 'Confraternização Universal' },
    { data: somarDias(p, -48), dataFim: somarDias(p, -47), titulo: 'Carnaval', facultativo: true },
    { data: somarDias(p, -2), titulo: 'Sexta-feira Santa' },
    { data: iso(ano, 4, 21), titulo: 'Tiradentes' },
    { data: iso(ano, 5, 1), titulo: 'Dia do Trabalho' },
    { data: somarDias(p, 60), titulo: 'Corpus Christi', facultativo: true },
    { data: iso(ano, 9, 7), titulo: 'Independência do Brasil' },
    { data: iso(ano, 10, 12), titulo: 'Nossa Senhora Aparecida' },
    { data: iso(ano, 11, 2), titulo: 'Finados' },
    { data: iso(ano, 11, 15), titulo: 'Proclamação da República' },
    { data: iso(ano, 11, 20), titulo: 'Dia Nacional de Zumbi e da Consciência Negra' },
    { data: iso(ano, 12, 25), titulo: 'Natal' }
  ].map((f) => ({ ...f, dataFim: f.dataFim || null, facultativo: !!f.facultativo }));
}

/**
 * Dias letivos de cada bimestre.
 * @param periodos [{ bimestre, inicio, fim }]
 * @param eventos  linhas de eventos (tipo, alcance, data, data_fim) — só "colégio todo" conta
 */
function calcularDiasLetivos(periodos, eventos) {
  const nao = new Map(); // data → título do feriado/recesso
  const extra = new Set();
  eventos.forEach((e) => {
    if (e.alcance !== 'todos' || !(NAO_LETIVOS.includes(e.tipo) || e.tipo === 'letivo')) return;
    const fim = e.data_fim || e.data;
    for (let d = e.data, n = 0; d <= fim && n < 400; d = somarDias(d, 1), n++) {
      if (e.tipo === 'letivo') extra.add(d);
      else if (!nao.has(d)) nao.set(d, e.titulo);
    }
  });
  const bimestres = [...periodos].sort((a, b) => a.bimestre - b.bimestre).map((p) => {
    let dias = 0, descontados = 0, extras = 0;
    for (let d = p.inicio, n = 0; d <= p.fim && n < 400; d = somarDias(d, 1), n++) {
      const util = diaSemana(d) >= 1 && diaSemana(d) <= 5;
      if (nao.has(d)) { if (util) descontados++; continue; }
      if (util) dias++;
      else if (extra.has(d)) { dias++; extras++; }
    }
    return { bimestre: p.bimestre, inicio: p.inicio, fim: p.fim, diasLetivos: dias, descontados, extras };
  });
  return { bimestres, total: bimestres.reduce((s, b) => s + b.diasLetivos, 0), meta: META_DIAS_LETIVOS };
}

/**
 * Bimestre de uma data pelos períodos: dentro de um bimestre → ele; antes
 * do 1º → 1; nas férias entre dois → o que acabou de terminar; depois → o último.
 */
function bimestreDaData(periodos, data) {
  const ps = [...periodos].sort((a, b) => a.bimestre - b.bimestre);
  if (!ps.length) return null;
  const dentro = ps.find((p) => p.inicio <= data && data <= p.fim);
  if (dentro) return dentro.bimestre;
  const passados = ps.filter((p) => p.fim < data);
  return passados.length ? passados[passados.length - 1].bimestre : ps[0].bimestre;
}

/** Turmas do colégio (com segmento) e turmas de cada evento. */
async function contexto(colegioId) {
  const [turmas, evTurmas] = await Promise.all([
    query('SELECT id, nome, serie, ativo FROM turmas WHERE colegio_id = ?', [colegioId]),
    query(
      `SELECT et.evento_id, et.turma_id FROM evento_turmas et
         JOIN eventos e ON e.id = et.evento_id WHERE e.colegio_id = ?`,
      [colegioId]
    )
  ]);
  const mapaTurmas = new Map(turmas.map((t) => [t.id, { id: t.id, nome: t.nome, serie: t.serie, ativo: !!t.ativo, segmento: segmentoDaSerie(t.serie) }]));
  const turmasDe = new Map();
  evTurmas.forEach((x) => {
    if (!turmasDe.has(x.evento_id)) turmasDe.set(x.evento_id, []);
    turmasDe.get(x.evento_id).push(x.turma_id);
  });
  return { turmas: mapaTurmas, turmasDe };
}

/** Eventos que tocam o intervalo [inicio, fim] (inclusive os de vários dias). */
function eventosNoIntervalo(colegioId, inicio, fim, extra = '', params = []) {
  return query(
    `SELECT e.*, u.nome AS autor FROM eventos e LEFT JOIN usuarios u ON u.id = e.criado_por
      WHERE e.colegio_id = ? AND e.data <= ? AND COALESCE(e.data_fim, e.data) >= ?${extra}
      ORDER BY e.data, e.hora_inicio, e.titulo`,
    [colegioId, fim, inicio, ...params]
  );
}

const hhmm = (t) => (t ? String(t).slice(0, 5) : null);

/** Evento para a tela (equipe). */
function formatar(e, ctx, podeEditar) {
  return {
    id: e.id,
    titulo: e.titulo,
    tipo: e.tipo,
    data: e.data,
    dataFim: e.data_fim && e.data_fim !== e.data ? e.data_fim : null,
    horaInicio: hhmm(e.hora_inicio),
    horaFim: hhmm(e.hora_fim),
    lugar: e.lugar,
    descricao: e.descricao,
    alcance: e.alcance,
    segmentos: listaSegmentos(e.segmentos),
    turmas: (ctx.turmasDe.get(e.id) || []).map((id) => ctx.turmas.get(id)).filter(Boolean).map((t) => ({ id: t.id, nome: t.nome })),
    publico: descreverPublico(e, ctx),
    visivelFamilias: !!e.visivel_familias,
    naoLetivo: NAO_LETIVOS.includes(e.tipo) && e.alcance === 'todos',
    autor: e.autor || null,
    criadoEm: e.criado_em,
    podeEditar
  };
}

/**
 * Eventos que a família vê no intervalo: marcados como visíveis e com
 * algum filho ATIVO no público. "para" = nomes desses filhos.
 */
async function eventosDaFamilia(colegioId, filhos, inicio, fim) {
  const ativos = filhos.filter((a) => a.status === 'ativo');
  if (!ativos.length) return [];
  const [eventos, ctx] = await Promise.all([
    eventosNoIntervalo(colegioId, inicio, fim, " AND e.visivel_familias = 1 AND e.tipo <> 'bimestre'"),
    contexto(colegioId)
  ]);
  return eventos
    .map((e) => ({ e, para: ativos.filter((a) => noPublico(e, a.turma_id, ctx)) }))
    .filter((x) => x.para.length)
    .map(({ e, para }) => ({
      id: e.id,
      titulo: e.titulo,
      tipo: e.tipo,
      data: e.data,
      dataFim: e.data_fim && e.data_fim !== e.data ? e.data_fim : null,
      horaInicio: hhmm(e.hora_inicio),
      horaFim: hhmm(e.hora_fim),
      lugar: e.lugar,
      descricao: e.descricao,
      naoLetivo: NAO_LETIVOS.includes(e.tipo) && e.alcance === 'todos',
      para: e.alcance === 'todos' ? [] : para.map((a) => a.nome) // colégio todo: não precisa repetir os nomes
    }));
}

module.exports = {
  TIPOS, TIPOS_FORM, TIPOS_PROFESSOR, NAO_LETIVOS, META_DIAS_LETIVOS,
  iso, somarDias, diaSemana, diasEntre, pascoa, feriadosNacionais, calcularDiasLetivos, bimestreDaData,
  contexto, eventosNoIntervalo, formatar, eventosDaFamilia, hhmm
};
