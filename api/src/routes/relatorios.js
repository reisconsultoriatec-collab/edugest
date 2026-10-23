'use strict';
/* =====================================================================
 *  /api/relatorios   [módulo relatorios]
 *
 *  GET /inadimplencia             por turma + faixas de atraso (hoje)
 *  GET /inadimplentes?turmaId=    alunos com mensalidade vencida, maior dívida primeiro
 *  GET /receita?ano=              previsto × recebido por mês de referência
 *  GET /dre?ano=&mes=             receitas (caixa) − despesas por categoria
 *  GET /bolsas?ano=               descontos concedidos por tipo e por aluno
 *
 *  Regras (as mesmas das telas de Mensalidades e Fluxo):
 *   - vencida = pendente, valor > 0 e vencimento antes de hoje (São Paulo)
 *   - canceladas ficam fora de tudo; isentas (valor 0) não contam como dívida
 *   - recebido = valor efetivamente recebido (valor_pago), pela data do pagamento
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm } = require('../db');
const { exigirModulo } = require('../middleware/auth');
const { assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { hojeSP } = require('../utils/datas');
const f = require('../services/financeiro');

router.use(exigirModulo('relatorios'));

const reais = (c) => c / 100;
const pct = (parte, total) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0);

function lerAno(req) {
  return v.inteiro(req.query.ano, 'Ano', { min: 2000, max: 2100 }) || Number(hojeSP().slice(0, 4));
}

async function anosComMensalidades(colegioId) {
  const r = await query(
    'SELECT DISTINCT LEFT(referencia, 4) AS ano FROM mensalidades WHERE colegio_id = ? ORDER BY ano DESC',
    [colegioId]
  );
  const anos = new Set(r.map((x) => Number(x.ano)));
  anos.add(Number(hojeSP().slice(0, 4)));
  return [...anos].sort((a, b) => b - a);
}

/* ---------------- Inadimplência por turma ---------------- */
router.get('/inadimplencia', assincrono(async (req, res) => {
  const hoje = hojeSP();
  const c = req.colegioId;
  const [vencidas, ativos] = await Promise.all([
    // Tudo que já venceu (pago ou não): base do percentual
    query(
      `SELECT m.aluno_id, m.valor, m.vencimento, m.status, a.turma_id, t.nome AS turma
         FROM mensalidades m
         JOIN alunos a ON a.id = m.aluno_id
         LEFT JOIN turmas t ON t.id = a.turma_id
        WHERE m.colegio_id = ? AND m.status IN ('pendente', 'pago') AND m.valor > 0 AND m.vencimento < ?`,
      [c, hoje]
    ),
    query(
      `SELECT a.turma_id, t.nome AS turma, COUNT(*) AS n
         FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id
        WHERE a.colegio_id = ? AND a.status = 'ativo'
        GROUP BY a.turma_id, t.nome`,
      [c]
    )
  ]);

  const grupos = new Map();
  const grupo = (id, nome) => {
    const k = id || 0;
    if (!grupos.has(k)) grupos.set(k, { turmaId: id || null, turma: nome || 'Sem turma', alunosAtivos: 0, devedores: new Set(), vencidas: 0, atraso: 0, vencidoTotal: 0 });
    return grupos.get(k);
  };
  ativos.forEach((x) => { grupo(x.turma_id, x.turma).alunosAtivos = Number(x.n); });

  const faixas = [
    { id: 'ate30', rotulo: '1 a 30 dias', min: 1, max: 30, valor: 0, qtd: 0 },
    { id: 'ate60', rotulo: '31 a 60 dias', min: 31, max: 60, valor: 0, qtd: 0 },
    { id: 'ate90', rotulo: '61 a 90 dias', min: 61, max: 90, valor: 0, qtd: 0 },
    { id: 'mais90', rotulo: 'Mais de 90 dias', min: 91, max: Infinity, valor: 0, qtd: 0 }
  ];
  const devedores = new Set();
  let vencidoTotal = 0; let atraso = 0; let qtdVencidas = 0;

  vencidas.forEach((m) => {
    const g = grupo(m.turma_id, m.turma);
    const cent = f.centavos(m.valor);
    g.vencidoTotal += cent; vencidoTotal += cent;
    if (m.status !== 'pendente') return;
    g.atraso += cent; atraso += cent;
    g.vencidas += 1; qtdVencidas += 1;
    g.devedores.add(m.aluno_id); devedores.add(m.aluno_id);
    const dias = f.diasEntre(m.vencimento, hoje);
    const fx = faixas.find((x) => dias >= x.min && dias <= x.max);
    fx.valor += cent; fx.qtd += 1;
  });

  const turmas = [...grupos.values()]
    .filter((g) => g.alunosAtivos > 0 || g.vencidoTotal > 0)
    .map((g) => ({
      turmaId: g.turmaId,
      turma: g.turma,
      alunosAtivos: g.alunosAtivos,
      inadimplentes: g.devedores.size,
      vencidas: g.vencidas,
      valorAtraso: reais(g.atraso),
      vencidoTotal: reais(g.vencidoTotal),
      percentual: pct(g.atraso, g.vencidoTotal)
    }))
    .sort((a, b) => b.valorAtraso - a.valorAtraso || a.turma.localeCompare(b.turma, 'pt-BR'));

  const totalAtivos = ativos.reduce((s, x) => s + Number(x.n), 0);
  res.json({
    hoje,
    resumo: {
      valorAtraso: reais(atraso),
      vencidoTotal: reais(vencidoTotal),
      percentual: pct(atraso, vencidoTotal),
      inadimplentes: devedores.size,
      alunosAtivos: totalAtivos,
      vencidas: qtdVencidas
    },
    faixas: faixas.map((x) => ({ id: x.id, rotulo: x.rotulo, valor: reais(x.valor), qtd: x.qtd, percentual: pct(x.valor, atraso) })),
    turmas
  });
}));

/* ---------------- Ranking de inadimplentes ---------------- */
router.get('/inadimplentes', assincrono(async (req, res) => {
  const hoje = hojeSP();
  const cond = ['m.colegio_id = ?', "m.status = 'pendente'", 'm.valor > 0', 'm.vencimento < ?'];
  const params = [req.colegioId, hoje];
  const turmaId = v.inteiro(req.query.turmaId, 'Turma', { min: 1 });
  if (turmaId) { cond.push('a.turma_id = ?'); params.push(turmaId); }

  const linhas = await query(
    `SELECT m.aluno_id, a.nome, a.ra, a.status AS aluno_status, a.resp_nome, a.resp_telefone, t.nome AS turma,
            COUNT(*) AS qtd, SUM(m.valor) AS total, MIN(m.vencimento) AS mais_antiga,
            GROUP_CONCAT(m.referencia ORDER BY m.referencia SEPARATOR ',') AS refs
       FROM mensalidades m
       JOIN alunos a ON a.id = m.aluno_id
       LEFT JOIN turmas t ON t.id = a.turma_id
      WHERE ${cond.join(' AND ')}
      GROUP BY m.aluno_id, a.nome, a.ra, a.status, a.resp_nome, a.resp_telefone, t.nome
      ORDER BY total DESC, a.nome
      LIMIT 1000`,
    params
  );
  const itens = linhas.map((x, i) => ({
    posicao: i + 1,
    alunoId: x.aluno_id,
    aluno: x.nome,
    ra: x.ra,
    alunoStatus: x.aluno_status,
    turma: x.turma,
    respNome: x.resp_nome,
    respTelefone: x.resp_telefone,
    vencidas: Number(x.qtd),
    total: Number(x.total),
    maisAntiga: x.mais_antiga,
    diasAtraso: f.diasEntre(x.mais_antiga, hoje),
    referencias: String(x.refs || '').split(',').filter(Boolean)
  }));
  res.json({
    hoje,
    resumo: {
      alunos: itens.length,
      total: reais(itens.reduce((s, x) => s + f.centavos(x.total), 0)),
      vencidas: itens.reduce((s, x) => s + x.vencidas, 0)
    },
    itens
  });
}));

/* ---------------- Receita prevista × recebida ---------------- */
router.get('/receita', assincrono(async (req, res) => {
  const hoje = hojeSP();
  const ano = lerAno(req);
  const [linhas, anos] = await Promise.all([
    query(
      `SELECT referencia, status, valor_bruto, desconto, valor, valor_pago, vencimento
         FROM mensalidades
        WHERE colegio_id = ? AND referencia LIKE ? AND status <> 'cancelado'`,
      [req.colegioId, `${ano}-%`]
    ),
    anosComMensalidades(req.colegioId)
  ]);

  const meses = f.MESES.map((nome, i) => ({
    mes: i + 1, nome, qtd: 0, bruto: 0, descontos: 0, previsto: 0, recebidoParcelas: 0, recebido: 0, emAtraso: 0, aVencer: 0
  }));
  linhas.forEach((m) => {
    const x = meses[Number(m.referencia.slice(5, 7)) - 1];
    x.qtd += 1;
    x.bruto += f.centavos(m.valor_bruto);
    x.descontos += f.centavos(m.desconto);
    x.previsto += f.centavos(m.valor);
    if (m.status === 'pago') {
      x.recebidoParcelas += f.centavos(m.valor);
      x.recebido += f.centavos(m.valor_pago ?? m.valor);
    } else if (Number(m.valor) > 0) {
      if (m.vencimento < hoje) x.emAtraso += f.centavos(m.valor); else x.aVencer += f.centavos(m.valor);
    }
  });
  const soma = (k) => meses.reduce((s, x) => s + x[k], 0);
  const totais = {};
  ['bruto', 'descontos', 'previsto', 'recebidoParcelas', 'recebido', 'emAtraso', 'aVencer'].forEach((k) => { totais[k] = reais(soma(k)); });
  totais.qtd = soma('qtd');
  totais.percentual = pct(soma('recebidoParcelas'), soma('previsto'));

  res.json({
    ano,
    anos,
    mesAtual: Number(hoje.slice(0, 4)) === ano ? Number(hoje.slice(5, 7)) : null,
    meses: meses.map((x) => ({
      mes: x.mes,
      nome: x.nome,
      qtd: x.qtd,
      bruto: reais(x.bruto),
      descontos: reais(x.descontos),
      previsto: reais(x.previsto),
      recebido: reais(x.recebido),
      emAtraso: reais(x.emAtraso),
      aVencer: reais(x.aVencer),
      // % das parcelas previstas que já foram pagas (juros não inflam o percentual)
      percentual: pct(x.recebidoParcelas, x.previsto)
    })),
    totais
  });
}));

/* ---------------- DRE simplificado ---------------- */
function periodo(ano, mes) {
  if (!mes) return { ini: `${ano}-01-01`, fim: `${ano}-12-31`, nome: String(ano) };
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, '0');
  return { ini: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${ultimo}`, nome: f.nomeReferencia(`${ano}-${mm}`) };
}

async function totaisPeriodo(colegioId, p) {
  const r = await queryUm(
    `SELECT
       (SELECT COALESCE(SUM(COALESCE(valor_pago, valor)), 0) FROM mensalidades
         WHERE colegio_id = ? AND status = 'pago' AND data_pagamento BETWEEN ? AND ?) AS receitas,
       (SELECT COALESCE(SUM(valor), 0) FROM contas_pagar
         WHERE colegio_id = ? AND status = 'pago' AND data_pagamento BETWEEN ? AND ?) AS despesas`,
    [colegioId, p.ini, p.fim, colegioId, p.ini, p.fim]
  );
  const receitas = Number(r.receitas); const despesas = Number(r.despesas);
  return { receitas, despesas, resultado: reais(f.centavos(receitas) - f.centavos(despesas)) };
}

router.get('/dre', assincrono(async (req, res) => {
  const ano = lerAno(req);
  const mes = v.inteiro(req.query.mes, 'Mês', { min: 1, max: 12 });
  const p = periodo(ano, mes);
  const ant = mes ? periodo(mes === 1 ? ano - 1 : ano, mes === 1 ? 12 : mes - 1) : periodo(ano - 1, null);
  const c = req.colegioId;

  const [formas, categorias, anterior, anos] = await Promise.all([
    query(
      `SELECT forma_pagamento, COUNT(*) AS qtd, SUM(COALESCE(valor_pago, valor)) AS total FROM mensalidades
        WHERE colegio_id = ? AND status = 'pago' AND data_pagamento BETWEEN ? AND ?
        GROUP BY forma_pagamento ORDER BY total DESC`,
      [c, p.ini, p.fim]
    ),
    query(
      `SELECT categoria, COUNT(*) AS qtd, SUM(valor) AS total FROM contas_pagar
        WHERE colegio_id = ? AND status = 'pago' AND data_pagamento BETWEEN ? AND ?
        GROUP BY categoria ORDER BY total DESC`,
      [c, p.ini, p.fim]
    ),
    totaisPeriodo(c, ant),
    anosComMensalidades(c)
  ]);

  const receitas = formas.reduce((s, x) => s + f.centavos(x.total), 0);
  const despesas = categorias.reduce((s, x) => s + f.centavos(x.total), 0);
  const resultado = receitas - despesas;
  res.json({
    ano,
    mes: mes || null,
    periodo: p.nome,
    anos,
    receitas: {
      total: reais(receitas),
      qtd: formas.reduce((s, x) => s + Number(x.qtd), 0),
      porForma: formas.map((x) => ({ forma: x.forma_pagamento || 'Não informada', qtd: Number(x.qtd), total: Number(x.total), percentual: pct(f.centavos(x.total), receitas) }))
    },
    despesas: {
      total: reais(despesas),
      qtd: categorias.reduce((s, x) => s + Number(x.qtd), 0),
      porCategoria: categorias.map((x) => ({ categoria: x.categoria, qtd: Number(x.qtd), total: Number(x.total), percentual: pct(f.centavos(x.total), receitas) }))
    },
    resultado: reais(resultado),
    margem: receitas > 0 ? pct(resultado, receitas) : null,
    anterior: { periodo: ant.nome, ...anterior }
  });
}));

/* ---------------- Impacto de bolsas e descontos ---------------- */
router.get('/bolsas', assincrono(async (req, res) => {
  const ano = lerAno(req);
  const c = req.colegioId;
  const [linhas, refsAno, integrais, cfg, anos] = await Promise.all([
    // Desconto real das mensalidades geradas (inclui as isentas que ficaram com valor 0)
    query(
      `SELECT m.aluno_id, a.nome, a.status AS aluno_status, t.nome AS turma, m.bolsa_id, b.tipo, b.percentual,
              COUNT(*) AS qtd, SUM(m.desconto) AS desconto, SUM(m.valor_bruto) AS bruto
         FROM mensalidades m
         JOIN alunos a ON a.id = m.aluno_id
         LEFT JOIN turmas t ON t.id = a.turma_id
         LEFT JOIN bolsas b ON b.id = m.bolsa_id
        WHERE m.colegio_id = ? AND m.referencia LIKE ? AND m.status <> 'cancelado' AND m.desconto > 0
        GROUP BY m.aluno_id, a.nome, a.status, t.nome, m.bolsa_id, b.tipo, b.percentual`,
      [c, `${ano}-%`]
    ),
    query(
      `SELECT referencia, aluno_id FROM mensalidades WHERE colegio_id = ? AND referencia LIKE ? AND status <> 'cancelado'`,
      [c, `${ano}-%`]
    ),
    // Bolsa de 100% não gera mensalidade: o impacto é estimado pela mensalidade padrão
    query(
      `SELECT b.id, b.aluno_id, b.tipo, b.vigencia_inicio, b.vigencia_fim, a.nome, a.status AS aluno_status, t.nome AS turma
         FROM bolsas b JOIN alunos a ON a.id = b.aluno_id LEFT JOIN turmas t ON t.id = a.turma_id
        WHERE b.colegio_id = ? AND b.ativo = 1 AND b.percentual >= 100`,
      [c]
    ),
    queryUm('SELECT valor_mensalidade, dia_vencimento FROM config_colegio WHERE colegio_id = ?', [c]),
    anosComMensalidades(c)
  ]);

  const valorPadrao = cfg ? Number(cfg.valor_mensalidade) : 0;
  const dia = String(cfg ? cfg.dia_vencimento : 10).padStart(2, '0');
  const refsCobradas = [...new Set(refsAno.map((x) => x.referencia))].sort();
  const temMensalidade = new Set(refsAno.map((x) => `${x.aluno_id}:${x.referencia}`));
  const brutoAno = await queryUm(
    "SELECT COALESCE(SUM(valor_bruto), 0) AS bruto FROM mensalidades WHERE colegio_id = ? AND referencia LIKE ? AND status <> 'cancelado'",
    [c, `${ano}-%`]
  );

  const alunos = linhas.map((x) => ({
    alunoId: x.aluno_id,
    aluno: x.nome,
    alunoStatus: x.aluno_status,
    turma: x.turma,
    tipo: x.tipo || 'Desconto',
    percentual: x.percentual,
    mensalidades: Number(x.qtd),
    desconto: Number(x.desconto),
    estimado: false
  }));

  // Integrais: meses em que o colégio cobrou e o aluno não teve mensalidade, com a bolsa vigente
  let integraisEstimado = 0;
  integrais.forEach((b) => {
    const meses = refsCobradas.filter((ref) => {
      const venc = `${ref}-${dia}`;
      return !temMensalidade.has(`${b.aluno_id}:${ref}`)
        && (!b.vigencia_inicio || b.vigencia_inicio <= venc)
        && (!b.vigencia_fim || b.vigencia_fim >= venc);
    }).length;
    if (!meses || !valorPadrao) return;
    const valor = reais(meses * f.centavos(valorPadrao));
    integraisEstimado += f.centavos(valor);
    alunos.push({
      alunoId: b.aluno_id, aluno: b.nome, alunoStatus: b.aluno_status, turma: b.turma, tipo: b.tipo,
      percentual: 100, mensalidades: meses, desconto: valor, estimado: true
    });
  });
  alunos.sort((a, b) => b.desconto - a.desconto || a.aluno.localeCompare(b.aluno, 'pt-BR'));

  const porTipo = new Map();
  alunos.forEach((x) => {
    if (!porTipo.has(x.tipo)) porTipo.set(x.tipo, { tipo: x.tipo, alunos: new Set(), mensalidades: 0, desconto: 0 });
    const t = porTipo.get(x.tipo);
    t.alunos.add(x.alunoId); t.mensalidades += x.mensalidades; t.desconto += f.centavos(x.desconto);
  });
  const descontoReal = linhas.reduce((s, x) => s + f.centavos(x.desconto), 0);
  const total = descontoReal + integraisEstimado;
  const potencial = f.centavos(brutoAno.bruto) + integraisEstimado;

  res.json({
    ano,
    anos,
    valorPadrao,
    resumo: {
      bolsistas: new Set(alunos.map((x) => x.alunoId)).size,
      descontoConcedido: reais(descontoReal),
      integraisEstimado: reais(integraisEstimado),
      total: reais(total),
      receitaPotencial: reais(potencial),
      percentual: pct(total, potencial),
      integrais: new Set(alunos.filter((x) => x.percentual >= 100).map((x) => x.alunoId)).size
    },
    porTipo: [...porTipo.values()]
      .map((t) => ({ tipo: t.tipo, alunos: t.alunos.size, mensalidades: t.mensalidades, desconto: reais(t.desconto), percentual: pct(t.desconto, total) }))
      .sort((a, b) => b.desconto - a.desconto),
    alunos
  });
}));

module.exports = router;
