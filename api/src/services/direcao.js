'use strict';
/* =====================================================================
 *  Painel da Direção — visão do colégio para a alta direção
 *
 *  Acesso: administrador marcado como alta direção (usuario_colegio.direcao)
 *  ou o proprietário do sistema. Os números são do colégio todo, no ano
 *  letivo atual (financeiro: mês do vencimento e mês do pagamento).
 *
 *  As contas ficam em funções sem banco (montar*), testáveis; as consultas
 *  só trazem as linhas do ano. Resultado guardado por 60 s por colégio,
 *  porque o painel pode ficar aberto numa TV atualizando sozinho.
 * ===================================================================== */
const { query, queryUm } = require('../db');
const { hojeSP, agoraSP } = require('../utils/datas');
const { ehProprietario } = require('../utils/proprietario');
const { arred1, mediaBimestre } = require('./escopo');
const F = require('./funil');
const painel = require('./painel');

const CACHE_MS = 60 * 1000;
const cache = new Map();

/** Alta direção (administrador marcado) ou proprietário do sistema. */
async function podeVerDirecao(req) {
  if (!req.usuario || !req.colegioId) return false;
  if (ehProprietario(req.firebase)) return true;
  if (req.perfil !== 'admin') return false;
  try {
    const r = await queryUm('SELECT direcao FROM usuario_colegio WHERE usuario_id = ? AND colegio_id = ?', [req.usuario.id, req.colegioId]);
    return !!(r && Number(r.direcao));
  } catch (e) {
    return false; // migração 015 ainda não aplicada
  }
}

const num = (x) => Number(x || 0);
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const pct = (a, b) => (b ? arred1((a / b) * 100) : null);
const dia10 = (x) => (x ? String(x).slice(0, 10) : null);
const mesesDoAno = (ano) => Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
const fimDoMes = (m) => { const [a, mm] = m.split('-').map(Number); return new Date(Date.UTC(a, mm, 0)).toISOString().slice(0, 10); };

/* ---------------- Financeiro ---------------- */
function montarFinanceiro({ ano, hoje, mensalidades, contas }) {
  const meses = mesesDoAno(ano);
  const mesAtual = hoje.slice(0, 7);
  const ate = (m) => m <= mesAtual;
  const receita = new Map(meses.map((m) => [m, { mes: m, previsto: 0, recebido: 0, emAberto: 0, vencido: 0, devidoAteHoje: 0 }]));
  const fluxo = new Map(meses.map((m) => [m, { mes: m, entradas: 0, saidas: 0 }]));
  let brutoAno = 0, descontoAno = 0;
  const ticket = [];
  mensalidades.forEach((x) => {
    if (x.status === 'cancelado') return;
    const venc = dia10(x.vencimento);
    const r = receita.get(venc.slice(0, 7));
    const valor = num(x.valor);
    if (r) {
      brutoAno += num(x.valor_bruto); descontoAno += num(x.desconto);
      if (valor > 0) {
        r.previsto += valor;
        if (x.status === 'pago') r.recebido += num(x.valor_pago !== null && x.valor_pago !== undefined ? x.valor_pago : x.valor);
        else if (venc < hoje) r.vencido += valor;
        else r.emAberto += valor;
        if (venc < hoje) r.devidoAteHoje += valor;
        if (venc.slice(0, 7) === mesAtual) ticket.push(valor);
      }
    }
    if (x.status === 'pago' && x.data_pagamento) {
      const f = fluxo.get(dia10(x.data_pagamento).slice(0, 7));
      if (f) f.entradas += num(x.valor_pago !== null && x.valor_pago !== undefined ? x.valor_pago : x.valor);
    }
  });
  const categorias = new Map();
  contas.forEach((c) => {
    if (c.status !== 'pago' || !c.data_pagamento) return;
    const pg = dia10(c.data_pagamento);
    const f = fluxo.get(pg.slice(0, 7));
    if (!f) return;
    f.saidas += num(c.valor);
    const cat = c.categoria || 'Outros';
    categorias.set(cat, (categorias.get(cat) || 0) + num(c.valor));
  });
  const receitaMensal = [...receita.values()].map((r) => ({ mes: r.mes, previsto: r2(r.previsto), recebido: r2(r.recebido), emAberto: r2(r.emAberto), vencido: r2(r.vencido) }));
  // Inadimplência do mês: o que venceu e não foi pago ÷ o que venceu (só meses que já tiveram vencimento)
  const inadimplenciaMensal = [...receita.values()].map((r) => ({ mes: r.mes, percentual: ate(r.mes) && r.devidoAteHoje ? pct(r.vencido, r.devidoAteHoje) : null }));
  const fluxoMensal = [...fluxo.values()].map((f) => (ate(f.mes)
    ? { mes: f.mes, entradas: r2(f.entradas), saidas: r2(f.saidas), saldo: r2(f.entradas - f.saidas) }
    : { mes: f.mes, entradas: null, saidas: null, saldo: null }));
  const cats = [...categorias.entries()].map(([nome, valor]) => ({ nome, valor: r2(valor) })).sort((a, b) => b.valor - a.valor);
  const despesasCategorias = cats.length > 6
    ? [...cats.slice(0, 5), { nome: 'Outras', valor: r2(cats.slice(5).reduce((s, c) => s + c.valor, 0)) }]
    : cats;
  const doMes = receita.get(mesAtual) || { previsto: 0, recebido: 0 };
  const ateHoje = [...receita.values()].filter((r) => ate(r.mes));
  const devido = ateHoje.reduce((s, r) => s + r.devidoAteHoje, 0);
  const vencido = ateHoje.reduce((s, r) => s + r.vencido, 0);
  return {
    receitaMensal, inadimplenciaMensal, fluxoMensal, despesasCategorias,
    receitaMes: { previsto: r2(doMes.previsto), recebido: r2(doMes.recebido), percentual: pct(doMes.recebido, doMes.previsto) },
    receitaAno: {
      previsto: r2(receitaMensal.reduce((s, r) => s + r.previsto, 0)),
      recebido: r2(receitaMensal.reduce((s, r) => s + r.recebido, 0)),
      entradas: r2(fluxoMensal.reduce((s, f) => s + num(f.entradas), 0)),
      saidas: r2(fluxoMensal.reduce((s, f) => s + num(f.saidas), 0))
    },
    inadimplenciaAno: { valor: r2(vencido), percentual: pct(vencido, devido) },
    descontos: { valor: r2(descontoAno), percentual: pct(descontoAno, brutoAno) },
    ticketMedio: ticket.length ? r2(ticket.reduce((s, v) => s + v, 0) / ticket.length) : null
  };
}

/* ---------------- Alunos e turmas ---------------- */
function montarAlunos({ ano, hoje, alunos, turmas }) {
  const mesAtual = hoje.slice(0, 7);
  const entrada = (a) => dia10(a.data_matricula) || dia10(a.criado_em);
  const ativoEm = (a, d) => {
    const e = entrada(a);
    if (e && e > d) return false;
    if (a.status === 'ativo') return true;
    const s = dia10(a.data_saida);
    return !!s && s > d;
  };
  const alunosMensal = mesesDoAno(ano).map((m) => {
    if (m > mesAtual) return { mes: m, ativos: null };
    const d = m === mesAtual ? hoje : fimDoMes(m);
    return { mes: m, ativos: alunos.filter((a) => ativoEm(a, d)).length };
  });
  const ativos = alunos.filter((a) => a.status === 'ativo');
  const porTurma = new Map();
  ativos.forEach((a) => { if (a.turma_id) porTurma.set(a.turma_id, (porTurma.get(a.turma_id) || 0) + 1); });
  const ocupacaoTurmas = turmas.map((t) => ({ turmaId: t.id, turma: t.nome, serie: t.serie, periodo: t.periodo, alunos: porTurma.get(t.id) || 0, capacidade: num(t.capacidade) || null }))
    .sort((x, y) => x.turma.localeCompare(y.turma, 'pt-BR', { numeric: true }));
  const capacidade = ocupacaoTurmas.reduce((s, t) => s + num(t.capacidade), 0);
  const nasTurmas = ocupacaoTurmas.reduce((s, t) => s + t.alunos, 0);
  const ini = `${ano}-01-01`, fim = `${ano}-12-31`;
  return {
    alunosMensal, ocupacaoTurmas,
    alunos: {
      ativos: ativos.length, semTurma: ativos.filter((a) => !a.turma_id).length, capacidade, vagas: capacidade ? Math.max(0, capacidade - nasTurmas) : null,
      ocupacao: pct(nasTurmas, capacidade),
      entradasAno: alunos.filter((a) => { const e = entrada(a); return e && e >= ini && e <= fim; }).length,
      saidasAno: alunos.filter((a) => a.status !== 'ativo' && dia10(a.data_saida) && dia10(a.data_saida) >= ini && dia10(a.data_saida) <= fim).length,
      inicioDoAno: alunosMensal[0].ativos
    }
  };
}

/* ---------------- Pedagógico ---------------- */
function montarPedagogico({ turmas, freq, notas, mediaAprov }) {
  const nomes = new Map(turmas.map((t) => [t.id, t.nome]));
  const frequenciaTurmas = freq.filter((f) => num(f.aulas) > 0 && nomes.has(f.turma_id))
    .map((f) => ({ turmaId: f.turma_id, turma: nomes.get(f.turma_id), percentual: pct(num(f.presentes), num(f.aulas)), registros: num(f.aulas) }))
    .sort((a, b) => a.turma.localeCompare(b.turma, 'pt-BR', { numeric: true }));
  const totAulas = freq.reduce((s, f) => s + num(f.aulas), 0);
  const totPres = freq.reduce((s, f) => s + num(f.presentes), 0);
  const porDisc = new Map(); const porAlunoDisc = new Map(); const todas = [];
  notas.forEach((n) => {
    const m = mediaBimestre(n);
    if (m === null) return;
    todas.push(m);
    if (!porDisc.has(n.disciplina_id)) porDisc.set(n.disciplina_id, { nome: n.disciplina, soma: 0, n: 0 });
    const d = porDisc.get(n.disciplina_id); d.soma += m; d.n++;
    const k = `${n.disciplina_id}:${n.aluno_id}`;
    if (!porAlunoDisc.has(k)) porAlunoDisc.set(k, []);
    porAlunoDisc.get(k).push(m);
  });
  const abaixoPorDisc = new Map();
  porAlunoDisc.forEach((ms, k) => {
    const media = arred1(ms.reduce((s, x) => s + x, 0) / ms.length);
    if (media < mediaAprov) { const d = Number(k.split(':')[0]); abaixoPorDisc.set(d, (abaixoPorDisc.get(d) || 0) + 1); }
  });
  const mediasDisciplinas = [...porDisc.entries()].map(([id, d]) => ({ disciplinaId: id, disciplina: d.nome, media: arred1(d.soma / d.n), alunosAbaixo: abaixoPorDisc.get(id) || 0 }))
    .sort((a, b) => a.media - b.media || a.disciplina.localeCompare(b.disciplina, 'pt-BR'));
  return {
    frequenciaTurmas, mediasDisciplinas,
    frequenciaMedia: pct(totPres, totAulas),
    mediaGeral: todas.length ? arred1(todas.reduce((s, x) => s + x, 0) / todas.length) : null
  };
}

/* ---------------- Consultas ---------------- */
async function carregar(colegioId) {
  const hoje = hojeSP();
  const cfg = await queryUm(
    `SELECT c.nome, cfg.ano_letivo, cfg.media_aprovacao, cfg.frequencia_minima FROM colegios c
       LEFT JOIN config_colegio cfg ON cfg.colegio_id = c.id WHERE c.id = ?`, [colegioId]);
  const ano = cfg && cfg.ano_letivo ? Number(cfg.ano_letivo) : Number(hoje.slice(0, 4));
  const mediaAprov = Number(cfg && cfg.media_aprovacao !== null && cfg.media_aprovacao !== undefined ? cfg.media_aprovacao : 6);
  const freqMin = Number(cfg && cfg.frequencia_minima !== null && cfg.frequencia_minima !== undefined ? cfg.frequencia_minima : 75);
  const ini = `${ano}-01-01`, fim = `${ano}-12-31`;
  const doze = (() => { const [a, m] = hoje.slice(0, 7).split('-').map(Number); return new Date(Date.UTC(a, m - 12, 1)).toISOString().slice(0, 10); })();
  const turmas = await query('SELECT id, nome, serie, periodo, capacidade FROM turmas WHERE colegio_id = ? AND ano_letivo = ? AND ativo = 1', [colegioId, ano]);
  const ids = turmas.length ? turmas.map((t) => t.id) : [0];
  const [alunos, mensalidades, contas, divida, freq, notas, leads, professores, eventos, atencao] = await Promise.all([
    query('SELECT id, status, turma_id, data_matricula, data_saida, criado_em FROM alunos WHERE colegio_id = ?', [colegioId]),
    query(`SELECT aluno_id, vencimento, valor_bruto, desconto, valor, status, data_pagamento, valor_pago FROM mensalidades
            WHERE colegio_id = ? AND ((vencimento >= ? AND vencimento <= ?) OR (data_pagamento >= ? AND data_pagamento <= ?))`,
    [colegioId, ini, fim, ini, fim]),
    query(`SELECT valor, status, categoria, data_pagamento FROM contas_pagar
            WHERE colegio_id = ? AND status = 'pago' AND data_pagamento >= ? AND data_pagamento <= ?`, [colegioId, ini, fim]),
    queryUm(`SELECT COALESCE(SUM(valor), 0) AS valor, COUNT(DISTINCT aluno_id) AS alunos FROM mensalidades
              WHERE colegio_id = ? AND status = 'pendente' AND valor > 0 AND vencimento < ?`, [colegioId, hoje]),
    query(`SELECT d.turma_id, COUNT(*) AS aulas, COALESCE(SUM(f.status IN ('P', 'J')), 0) AS presentes
             FROM frequencias f JOIN diarios d ON d.id = f.diario_id
            WHERE d.colegio_id = ? AND d.turma_id IN (?) GROUP BY d.turma_id`, [colegioId, ids]),
    query(`SELECT n.aluno_id, n.disciplina_id, d.nome AS disciplina, n.bimestre, n.n1, n.n2, n.trabalho
             FROM notas n JOIN alunos a ON a.id = n.aluno_id AND a.turma_id = n.turma_id AND a.status = 'ativo'
             JOIN disciplinas d ON d.id = n.disciplina_id
            WHERE n.colegio_id = ? AND n.turma_id IN (?)`, [colegioId, ids]),
    query(`SELECT etapa, origem, serie_pretendida, motivo_perda, criado_em, etapa_em, atualizado_em FROM leads
            WHERE colegio_id = ? AND criado_em >= ?`, [colegioId, doze]),
    queryUm("SELECT COUNT(*) AS n FROM professores WHERE colegio_id = ? AND status = 'ativo'", [colegioId]),
    query(`SELECT titulo, tipo, data, data_fim, hora_inicio FROM eventos
            WHERE colegio_id = ? AND tipo <> 'bimestre' AND COALESCE(data_fim, data) >= ? AND data <= ?
            ORDER BY data, hora_inicio LIMIT 6`, [colegioId, hoje, `${ano + 1}-12-31`]),
    painel.atencao(colegioId, { restrito: false })
  ]);
  const fin = montarFinanceiro({ ano, hoje, mensalidades, contas });
  const al = montarAlunos({ ano, hoje, alunos, turmas });
  const ped = montarPedagogico({ turmas, freq, notas, mediaAprov });
  const cap = F.indicadores(leads, hoje);
  return {
    geradoEm: agoraSP(), hoje, anoLetivo: ano, colegio: cfg ? cfg.nome : null,
    criterios: { mediaAprovacao: mediaAprov, frequenciaMinima: freqMin },
    kpis: {
      ...al.alunos, turmas: turmas.length, professores: num(professores && professores.n),
      receitaMes: fin.receitaMes, receitaAno: fin.receitaAno, ticketMedio: fin.ticketMedio, descontos: fin.descontos,
      inadimplencia: { ...fin.inadimplenciaAno, emAberto: r2(num(divida.valor)), alunos: num(divida.alunos) },
      frequenciaMedia: ped.frequenciaMedia, mediaGeral: ped.mediaGeral,
      atencao: { total: atencao.total, porFrequencia: atencao.porFrequencia || 0, porMedia: atencao.porMedia || 0 },
      captacao: { interessados: cap.total, emAndamento: cap.emAndamento, matriculados: cap.porEtapa.matriculado || 0, perdidos: cap.porEtapa.perdido || 0, conversao: cap.conversao }
    },
    receitaMensal: fin.receitaMensal, inadimplenciaMensal: fin.inadimplenciaMensal, fluxoMensal: fin.fluxoMensal,
    despesasCategorias: fin.despesasCategorias, alunosMensal: al.alunosMensal, ocupacaoTurmas: al.ocupacaoTurmas,
    frequenciaTurmas: ped.frequenciaTurmas, mediasDisciplinas: ped.mediasDisciplinas,
    captacaoMensal: cap.meses, captacaoEtapas: Object.entries(F.ETAPAS).map(([id, rotulo]) => ({ etapa: id, rotulo, quantidade: cap.porEtapa[id] || 0 })),
    eventos: eventos.map((e) => ({ titulo: e.titulo, tipo: e.tipo, data: dia10(e.data), dataFim: dia10(e.data_fim), hora: e.hora_inicio ? String(e.hora_inicio).slice(0, 5) : null }))
  };
}

async function painelDirecao(colegioId, { atualizar } = {}) {
  const c = cache.get(colegioId);
  if (!atualizar && c && Date.now() - c.em < CACHE_MS) return c.dados;
  const dados = await carregar(colegioId);
  cache.set(colegioId, { em: Date.now(), dados });
  return dados;
}

module.exports = { podeVerDirecao, painelDirecao, montarFinanceiro, montarAlunos, montarPedagogico, CACHE_MS, _cache: cache };
