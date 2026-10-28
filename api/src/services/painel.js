'use strict';
/* =====================================================================
 *  Painel (Dashboard): o que pede atenção hoje
 *   · financeiro()  — mensalidades do mês (recebido × previsto), atraso
 *                     e contas a pagar dos próximos 7 dias
 *   · pedagogico()  — aulas sem chamada (últimos 7 dias) e notas que
 *                     faltam no bimestre que terminou ou está terminando
 *   · atencao()     — alunos com frequência abaixo do mínimo ou média
 *                     abaixo da média de aprovação
 *  Professor: só as turmas/disciplinas dele (services/escopo).
 *  As regras de média e frequência são as do boletim.
 * ===================================================================== */
const { query, queryUm } = require('../db');
const { hojeSP, agoraSP } = require('../utils/datas');
const { arred1, mediaBimestre } = require('./escopo');
const { somarDias, diaSemana, bimestreDaData, NAO_LETIVOS } = require('./calendario');
const { hhmm } = require('./grade');

const DIAS_CHAMADA = 7;        // olha a chamada dos últimos 7 dias
const AVISO_NOTAS_DIAS = 14;   // avisa das notas nas 2 últimas semanas do bimestre
const MIN_AULAS_FREQ = 10;     // frequência só conta com pelo menos 10 aulas registradas
// Sem grade horária, a "chamada do dia" de hoje só fica pendente depois do fim do turno
const FIM_TURNO = { matutino: '12:00', vespertino: '18:00', integral: '17:00', noturno: '22:30' };

const mesDe = (d) => d.slice(0, 7);
const proximoMes = (m) => { const [a, mm] = m.split('-').map(Number); return mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, '0')}`; };
const num = (x) => Number(x || 0);

/* ---------------- Financeiro ---------------- */
async function financeiro(colegioId, { mensalidades, contas }) {
  const hoje = hojeSP();
  const mes = mesDe(hoje);
  const ini = `${mes}-01`;
  const fimExcl = `${proximoMes(mes)}-01`;
  const r = { mes, hoje };
  if (mensalidades) {
    const [m, atraso, caixa] = await Promise.all([
      queryUm(
        `SELECT COUNT(*) AS qtd, COALESCE(SUM(valor), 0) AS previsto,
                COALESCE(SUM(CASE WHEN status = 'pago' THEN COALESCE(valor_pago, valor) ELSE 0 END), 0) AS recebido,
                COALESCE(SUM(status = 'pago'), 0) AS pagas,
                COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END), 0) AS falta
           FROM mensalidades
          WHERE colegio_id = ? AND status <> 'cancelado' AND valor > 0 AND vencimento >= ? AND vencimento < ?`,
        [colegioId, ini, fimExcl]
      ),
      queryUm(
        `SELECT COUNT(*) AS qtd, COUNT(DISTINCT aluno_id) AS alunos, COALESCE(SUM(valor), 0) AS valor
           FROM mensalidades WHERE colegio_id = ? AND status = 'pendente' AND valor > 0 AND vencimento < ?`,
        [colegioId, hoje]
      ),
      queryUm(
        `SELECT COALESCE(SUM(COALESCE(valor_pago, valor)), 0) AS valor FROM mensalidades
          WHERE colegio_id = ? AND status = 'pago' AND data_pagamento >= ? AND data_pagamento < ?`,
        [colegioId, ini, fimExcl]
      )
    ]);
    r.mensalidades = {
      quantidade: num(m.qtd), pagas: num(m.pagas), previsto: num(m.previsto), recebido: num(m.recebido), falta: num(m.falta),
      percentual: num(m.previsto) ? Math.round((num(m.recebido) / num(m.previsto)) * 100) : null,
      entradasNoMes: num(caixa.valor),
      atraso: { valor: num(atraso.valor), mensalidades: num(atraso.qtd), alunos: num(atraso.alunos) }
    };
  }
  if (contas) {
    const ate = somarDias(hoje, DIAS_CHAMADA);
    const [proximas, vencidas] = await Promise.all([
      query(
        `SELECT id, descricao, fornecedor, valor, vencimento FROM contas_pagar
          WHERE colegio_id = ? AND status = 'pendente' AND vencimento >= ? AND vencimento <= ?
          ORDER BY vencimento, valor DESC`,
        [colegioId, hoje, ate]
      ),
      queryUm(
        `SELECT COUNT(*) AS qtd, COALESCE(SUM(valor), 0) AS valor FROM contas_pagar
          WHERE colegio_id = ? AND status = 'pendente' AND vencimento < ?`,
        [colegioId, hoje]
      )
    ]);
    r.contas = {
      ate,
      proximas: { quantidade: proximas.length, valor: arred2(proximas.reduce((s, c) => s + num(c.valor), 0)),
        itens: proximas.slice(0, 5).map((c) => ({ id: c.id, descricao: c.descricao, fornecedor: c.fornecedor, valor: num(c.valor), vencimento: c.vencimento })) },
      vencidas: { quantidade: num(vencidas.qtd), valor: num(vencidas.valor) }
    };
  }
  return r;
}
const arred2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

/* ---------------- Pedagógico ---------------- */
/** Bimestres do ano: os do calendário ou, sem eles, a divisão padrão (a mesma do front). */
function periodosDoAno(periodos, ano) {
  if (periodos.length) return periodos.map((p) => ({ bimestre: Number(p.bimestre), inicio: p.inicio, fim: p.fim }));
  return [
    { bimestre: 1, inicio: `${ano}-02-01`, fim: `${ano}-04-30` }, { bimestre: 2, inicio: `${ano}-05-01`, fim: `${ano}-07-31` },
    { bimestre: 3, inicio: `${ano}-08-01`, fim: `${ano}-09-30` }, { bimestre: 4, inicio: `${ano}-10-01`, fim: `${ano}-12-20` }
  ];
}

/**
 * Dias letivos de [inicio, fim]: segunda a sexta dentro de um bimestre, menos feriados e
 * recessos do colégio todo, mais os dias letivos extras. Sem regra de banco: testável.
 */
function diasLetivos(inicio, fim, periodos, eventos) {
  const nao = new Set(); const extra = new Set();
  eventos.forEach((e) => {
    if (e.alcance !== 'todos' || !(NAO_LETIVOS.includes(e.tipo) || e.tipo === 'letivo')) return;
    for (let d = e.data, n = 0; d <= (e.data_fim || e.data) && n < 400; d = somarDias(d, 1), n++) (e.tipo === 'letivo' ? extra : nao).add(d);
  });
  const dentro = (d) => periodos.some((p) => p.inicio <= d && d <= p.fim);
  const dias = [];
  for (let d = inicio, n = 0; d <= fim && n < 60; d = somarDias(d, 1), n++) {
    const ds = diaSemana(d);
    if (!dentro(d) || nao.has(d)) continue;
    if ((ds >= 1 && ds <= 5) || extra.has(d)) dias.push(d);
  }
  return dias;
}

/**
 * Aulas sem chamada. Com grade: cada aula da grade nos dias letivos (hoje, só as que já
 * começaram) sem registro da disciplina nem "chamada do dia". Sem grade: o dia sem nenhum
 * registro (hoje, só depois do fim do turno).
 */
function chamadasPendentes({ turmas, grade, diarios, dias, hoje, agora, permitido }) {
  const feitos = new Set(diarios.map((d) => `${d.turma_id}|${d.data}|${d.disciplina_id || 'dia'}`));
  const porTurma = new Map();
  turmas.forEach((t) => {
    const criada = String(t.criado_em || '').slice(0, 10);
    const aulasT = grade.filter((g) => g.turma_id === t.id && permitido(t.id, g.disciplina_id));
    const temGrade = grade.some((g) => g.turma_id === t.id);
    const pend = [];
    dias.forEach((d) => {
      if (criada && d < criada) return;
      if (Number(d.slice(0, 4)) !== Number(t.ano_letivo)) return;
      if (feitos.has(`${t.id}|${d}|dia`)) return; // chamada do dia vale para todas as aulas
      if (temGrade) {
        aulasT.filter((g) => Number(g.dia_semana) === diaSemana(d)).forEach((g) => {
          if (d === hoje && hhmm(g.inicio) > agora) return;
          if (g.disciplina_id && feitos.has(`${t.id}|${d}|${g.disciplina_id}`)) return;
          pend.push({ data: d, inicio: hhmm(g.inicio), disciplinaId: g.disciplina_id || null, disciplina: g.disciplina || null, professor: g.professor || null });
        });
      } else if (permitido(t.id, null)) {
        if (d === hoje && agora < (FIM_TURNO[t.periodo] || '18:00')) return;
        if (diarios.some((x) => x.turma_id === t.id && x.data === d)) return;
        pend.push({ data: d, inicio: null, disciplinaId: null, disciplina: null, professor: null });
      }
    });
    if (pend.length) {
      pend.sort((a, b) => (b.data + (b.inicio || '')).localeCompare(a.data + (a.inicio || '')));
      porTurma.set(t.id, { turmaId: t.id, turma: t.nome, semGrade: !temGrade, total: pend.length, aulas: pend.slice(0, 6) });
    }
  });
  return [...porTurma.values()].sort((a, b) => b.total - a.total || a.turma.localeCompare(b.turma));
}

/** Notas que faltam: turma × disciplina com aluno ativo sem nenhuma nota no bimestre. */
function notasPendentes({ pares, alunosPorTurma, lancados }) {
  return pares.map((p) => {
    const alunos = alunosPorTurma.get(p.turma_id) || 0;
    const feitos = lancados.get(`${p.turma_id}:${p.disciplina_id}`) || 0;
    return { turmaId: p.turma_id, turma: p.turma, disciplinaId: p.disciplina_id, disciplina: p.disciplina, professor: p.professor || null, alunos, lancados: Math.min(feitos, alunos) };
  }).filter((x) => x.alunos > 0 && x.lancados < x.alunos)
    .sort((a, b) => a.turma.localeCompare(b.turma) || a.disciplina.localeCompare(b.disciplina));
}

/** Bimestres a cobrar: o anterior (já terminou) e o atual nas 2 últimas semanas. */
function bimestresACobrar(periodos, hoje) {
  const ps = [...periodos].sort((a, b) => a.bimestre - b.bimestre);
  const atual = bimestreDaData(ps, hoje);
  const pAtual = ps.find((p) => p.bimestre === atual);
  const r = [];
  if (pAtual && pAtual.fim < hoje) r.push({ ...pAtual, situacao: 'encerrado' });
  else {
    const anterior = ps.find((p) => p.bimestre === atual - 1);
    if (anterior && anterior.fim < hoje) r.push({ ...anterior, situacao: 'encerrado' });
    if (pAtual && pAtual.inicio <= hoje && somarDias(pAtual.fim, -AVISO_NOTAS_DIAS) <= hoje) r.push({ ...pAtual, situacao: 'encerrando' });
  }
  return r;
}

async function contextoPedagogico(colegioId) {
  const cfg = await queryUm('SELECT ano_letivo, media_aprovacao, frequencia_minima FROM config_colegio WHERE colegio_id = ?', [colegioId]);
  const ano = cfg ? Number(cfg.ano_letivo) : Number(hojeSP().slice(0, 4));
  const [turmas, periodos] = await Promise.all([
    query('SELECT id, nome, serie, periodo, ano_letivo, criado_em FROM turmas WHERE colegio_id = ? AND ano_letivo = ? AND ativo = 1 ORDER BY nome', [colegioId, ano]),
    query('SELECT bimestre, inicio, fim FROM periodos_letivos WHERE colegio_id = ? AND ano = ?', [colegioId, ano])
  ]);
  return {
    ano, turmas, periodos: periodosDoAno(periodos, ano), calendarioDefinido: periodos.length > 0,
    mediaAprov: Number(cfg && cfg.media_aprovacao !== null && cfg.media_aprovacao !== undefined ? cfg.media_aprovacao : 6),
    freqMin: Number(cfg && cfg.frequencia_minima !== null && cfg.frequencia_minima !== undefined ? cfg.frequencia_minima : 75)
  };
}

/** permitido(turmaId, disciplinaId|null) segundo o escopo do professor. */
function permissao(esc) {
  if (!esc.restrito) return () => true;
  return (turmaId, disciplinaId) => (disciplinaId ? esc.pares.has(`${turmaId}:${disciplinaId}`) : esc.turmas.has(turmaId));
}

async function pedagogico(colegioId, esc, { diario, notas }) {
  const hoje = hojeSP();
  const agora = agoraSP().slice(11, 16);
  const ctx = await contextoPedagogico(colegioId);
  const pode = permissao(esc);
  const turmas = ctx.turmas.filter((t) => !esc.restrito || esc.turmas.has(t.id));
  const ids = turmas.map((t) => t.id);
  const r = { hoje, vinculado: !esc.restrito || !!esc.vinculado, calendarioDefinido: ctx.calendarioDefinido, turmas: turmas.length };
  if (!ids.length) return { ...r, chamadas: diario ? { dias: DIAS_CHAMADA, total: 0, turmas: [] } : undefined, notas: notas ? [] : undefined };

  if (diario) {
    const inicio = somarDias(hoje, -(DIAS_CHAMADA - 1));
    const [eventos, grade, diarios] = await Promise.all([
      query(`SELECT tipo, alcance, data, data_fim FROM eventos WHERE colegio_id = ? AND tipo IN ('feriado', 'recesso', 'letivo')
              AND data <= ? AND COALESCE(data_fim, data) >= ?`, [colegioId, hoje, inicio]),
      query(`SELECT g.turma_id, g.dia_semana, g.disciplina_id, d.nome AS disciplina, p.nome AS professor, h.inicio
               FROM grade_horaria g JOIN horarios_aula h ON h.id = g.horario_id
               LEFT JOIN disciplinas d ON d.id = g.disciplina_id LEFT JOIN professores p ON p.id = g.professor_id
              WHERE g.colegio_id = ? AND g.turma_id IN (?) AND h.tipo = 'aula'`, [colegioId, ids]),
      query('SELECT turma_id, data, disciplina_id FROM diarios WHERE colegio_id = ? AND turma_id IN (?) AND data >= ? AND data <= ?', [colegioId, ids, inicio, hoje])
    ]);
    const dias = diasLetivos(inicio, hoje, ctx.periodos, eventos);
    const lista = chamadasPendentes({ turmas, grade, diarios, dias, hoje, agora, permitido: pode });
    r.chamadas = { dias: DIAS_CHAMADA, total: lista.reduce((s, x) => s + x.total, 0), turmas: lista };
  }

  if (notas) {
    const cobrar = bimestresACobrar(ctx.periodos, hoje);
    r.notas = [];
    if (cobrar.length) {
      const [pares, alunos] = await Promise.all([
        query(`SELECT a.turma_id, t.nome AS turma, a.disciplina_id, d.nome AS disciplina, p.nome AS professor
                 FROM atribuicoes a JOIN turmas t ON t.id = a.turma_id JOIN disciplinas d ON d.id = a.disciplina_id
                 LEFT JOIN professores p ON p.id = a.professor_id
                WHERE a.colegio_id = ? AND a.turma_id IN (?)`, [colegioId, ids]),
        query(`SELECT turma_id, COUNT(*) AS n FROM alunos WHERE colegio_id = ? AND status = 'ativo' AND turma_id IN (?) GROUP BY turma_id`, [colegioId, ids])
      ]);
      const meus = pares.filter((p) => pode(p.turma_id, p.disciplina_id));
      const alunosPorTurma = new Map(alunos.map((a) => [a.turma_id, Number(a.n)]));
      for (const b of cobrar) {
        const feitos = await query(
          `SELECT n.turma_id, n.disciplina_id, COUNT(DISTINCT n.aluno_id) AS n FROM notas n
             JOIN alunos al ON al.id = n.aluno_id AND al.status = 'ativo' AND al.turma_id = n.turma_id
            WHERE n.colegio_id = ? AND n.turma_id IN (?) AND n.bimestre = ?
              AND (n.n1 IS NOT NULL OR n.n2 IS NOT NULL OR n.trabalho IS NOT NULL)
            GROUP BY n.turma_id, n.disciplina_id`, [colegioId, ids, b.bimestre]);
        const lancados = new Map(feitos.map((x) => [`${x.turma_id}:${x.disciplina_id}`, Number(x.n)]));
        const pendentes = notasPendentes({ pares: meus, alunosPorTurma, lancados });
        if (pendentes.length) r.notas.push({ bimestre: b.bimestre, fim: b.fim, situacao: b.situacao, pendentes });
      }
    }
  }
  return r;
}

/* ---------------- Alunos que precisam de atenção ---------------- */
function avaliarAlunos({ alunos, notas, freq, mediaAprov, freqMin, permitido }) {
  const porAluno = new Map();
  notas.forEach((n) => {
    if (!permitido(n.turma_id, n.disciplina_id)) return;
    const m = mediaBimestre(n);
    if (m === null) return;
    if (!porAluno.has(n.aluno_id)) porAluno.set(n.aluno_id, new Map());
    const disc = porAluno.get(n.aluno_id);
    if (!disc.has(n.disciplina_id)) disc.set(n.disciplina_id, { nome: n.disciplina, medias: [] });
    disc.get(n.disciplina_id).medias.push(m);
  });
  const fPorAluno = new Map(freq.map((f) => [f.aluno_id, f]));
  const lista = [];
  alunos.forEach((a) => {
    const f = fPorAluno.get(a.id);
    const aulas = f ? Number(f.aulas) : 0;
    const percentual = aulas ? arred1(((Number(f.presencas) + Number(f.justificadas)) / aulas) * 100) : null;
    const freqAbaixo = aulas >= MIN_AULAS_FREQ && percentual < freqMin;
    const abaixo = [...(porAluno.get(a.id) || new Map()).values()]
      .map((d) => ({ nome: d.nome, media: arred1(d.medias.reduce((s, x) => s + x, 0) / d.medias.length) }))
      .filter((d) => d.media < mediaAprov)
      .sort((x, y) => x.media - y.media);
    if (!freqAbaixo && !abaixo.length) return;
    lista.push({
      id: a.id, nome: a.nome, ra: a.ra, turmaId: a.turma_id, turma: a.turma, respNome: a.resp_nome || null, respTelefone: a.resp_telefone || null,
      frequencia: aulas ? { percentual, aulas, faltas: Number(f.faltas) } : null, freqAbaixo, disciplinasAbaixo: abaixo
    });
  });
  // Primeiro quem tem as duas coisas, depois frequência, depois quem tem mais disciplinas abaixo
  const peso = (x) => (x.freqAbaixo ? 100 : 0) + x.disciplinasAbaixo.length;
  return lista.sort((x, y) => peso(y) - peso(x) || (x.frequencia ? x.frequencia.percentual : 101) - (y.frequencia ? y.frequencia.percentual : 101) || x.nome.localeCompare(y.nome));
}

async function atencao(colegioId, esc) {
  const ctx = await contextoPedagogico(colegioId);
  const pode = permissao(esc);
  const turmas = ctx.turmas.filter((t) => !esc.restrito || esc.turmas.has(t.id));
  const ids = turmas.map((t) => t.id);
  const criterios = { mediaAprovacao: ctx.mediaAprov, frequenciaMinima: ctx.freqMin, minimoAulas: MIN_AULAS_FREQ };
  if (!ids.length) return { criterios, total: 0, alunos: [] };
  const [alunos, notas, freq] = await Promise.all([
    query(`SELECT a.id, a.nome, a.ra, a.turma_id, a.resp_nome, a.resp_telefone, t.nome AS turma
             FROM alunos a JOIN turmas t ON t.id = a.turma_id
            WHERE a.colegio_id = ? AND a.status = 'ativo' AND a.turma_id IN (?)`, [colegioId, ids]),
    query(`SELECT n.aluno_id, n.turma_id, n.disciplina_id, d.nome AS disciplina, n.bimestre, n.n1, n.n2, n.trabalho
             FROM notas n JOIN alunos a ON a.id = n.aluno_id AND a.turma_id = n.turma_id AND a.status = 'ativo'
             JOIN disciplinas d ON d.id = n.disciplina_id
            WHERE n.colegio_id = ? AND n.turma_id IN (?)`, [colegioId, ids]),
    query(`SELECT f.aluno_id, COUNT(*) AS aulas, COALESCE(SUM(f.status = 'P'), 0) AS presencas,
                  COALESCE(SUM(f.status = 'F'), 0) AS faltas, COALESCE(SUM(f.status = 'J'), 0) AS justificadas
             FROM frequencias f JOIN diarios d ON d.id = f.diario_id JOIN alunos a ON a.id = f.aluno_id AND a.turma_id = d.turma_id
            WHERE d.colegio_id = ? AND d.turma_id IN (?) GROUP BY f.aluno_id`, [colegioId, ids])
  ]);
  const lista = avaliarAlunos({ alunos, notas, freq, mediaAprov: ctx.mediaAprov, freqMin: ctx.freqMin, permitido: pode });
  return {
    criterios, total: lista.length,
    porFrequencia: lista.filter((x) => x.freqAbaixo).length,
    porMedia: lista.filter((x) => x.disciplinasAbaixo.length).length,
    alunos: lista.slice(0, 200)
  };
}

module.exports = {
  DIAS_CHAMADA, AVISO_NOTAS_DIAS, MIN_AULAS_FREQ, FIM_TURNO,
  financeiro, pedagogico, atencao,
  periodosDoAno, diasLetivos, chamadasPendentes, notasPendentes, bimestresACobrar, avaliarAlunos, permissao
};
