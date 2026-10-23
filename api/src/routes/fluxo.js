'use strict';
/* =====================================================================
 *  /api/fluxo?ano=2026 — Fluxo de caixa   [módulo fluxo]
 *
 *  Realizado (pela data de pagamento):
 *    entradas = mensalidades pagas (valor recebido)
 *    saídas   = contas pagas
 *  Previsto (pela data de vencimento, ainda não pago):
 *    a receber = mensalidades pendentes com valor > 0
 *    a pagar   = contas pendentes
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm } = require('../db');
const { exigirModulo } = require('../middleware/auth');
const { assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { hojeSP } = require('../utils/datas');
const f = require('../services/financeiro');

router.use(exigirModulo('fluxo'));

router.get('/', assincrono(async (req, res) => {
  const hoje = hojeSP();
  const anoAtual = Number(hoje.slice(0, 4));
  const ano = v.inteiro(req.query.ano, 'Ano', { min: 2000, max: 2100 }) || anoAtual;
  const ini = `${ano}-01-01`;
  const fim = `${ano}-12-31`;
  const c = req.colegioId;

  const [ent, sai, prevEnt, prevSai, ultEnt, ultSai, limites] = await Promise.all([
    query(
      `SELECT MONTH(data_pagamento) AS mes, SUM(COALESCE(valor_pago, valor)) AS total FROM mensalidades
        WHERE colegio_id = ? AND status = 'pago' AND data_pagamento BETWEEN ? AND ? GROUP BY MONTH(data_pagamento)`,
      [c, ini, fim]
    ),
    query(
      `SELECT MONTH(data_pagamento) AS mes, SUM(valor) AS total FROM contas_pagar
        WHERE colegio_id = ? AND status = 'pago' AND data_pagamento BETWEEN ? AND ? GROUP BY MONTH(data_pagamento)`,
      [c, ini, fim]
    ),
    query(
      `SELECT MONTH(vencimento) AS mes, SUM(valor) AS total FROM mensalidades
        WHERE colegio_id = ? AND status = 'pendente' AND valor > 0 AND vencimento BETWEEN ? AND ? GROUP BY MONTH(vencimento)`,
      [c, ini, fim]
    ),
    query(
      `SELECT MONTH(vencimento) AS mes, SUM(valor) AS total FROM contas_pagar
        WHERE colegio_id = ? AND status = 'pendente' AND vencimento BETWEEN ? AND ? GROUP BY MONTH(vencimento)`,
      [c, ini, fim]
    ),
    query(
      `SELECT m.id, m.data_pagamento, COALESCE(m.valor_pago, m.valor) AS valor, m.referencia, m.forma_pagamento, a.nome AS aluno
         FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id
        WHERE m.colegio_id = ? AND m.status = 'pago' AND m.data_pagamento BETWEEN ? AND ?
        ORDER BY m.data_pagamento DESC, m.id DESC LIMIT 8`,
      [c, ini, fim]
    ),
    query(
      `SELECT id, data_pagamento, valor, descricao, categoria FROM contas_pagar
        WHERE colegio_id = ? AND status = 'pago' AND data_pagamento BETWEEN ? AND ?
        ORDER BY data_pagamento DESC, id DESC LIMIT 8`,
      [c, ini, fim]
    ),
    queryUm(
      `SELECT LEAST(COALESCE((SELECT MIN(YEAR(vencimento)) FROM mensalidades WHERE colegio_id = ?), 9999),
                    COALESCE((SELECT MIN(YEAR(vencimento)) FROM contas_pagar WHERE colegio_id = ?), 9999)) AS primeiro,
              GREATEST(COALESCE((SELECT MAX(YEAR(vencimento)) FROM mensalidades WHERE colegio_id = ?), 0),
                       COALESCE((SELECT MAX(YEAR(vencimento)) FROM contas_pagar WHERE colegio_id = ?), 0)) AS ultimo`,
      [c, c, c, c]
    )
  ]);

  const porMes = (linhas) => {
    const arr = Array(12).fill(0);
    linhas.forEach((l) => { arr[l.mes - 1] = f.centavos(l.total); });
    return arr;
  };
  const E = porMes(ent); const S = porMes(sai); const PE = porMes(prevEnt); const PS = porMes(prevSai);

  let acumulado = 0;
  const meses = E.map((_, i) => {
    acumulado += E[i] - S[i];
    return {
      mes: i + 1,
      nome: f.MESES[i],
      entradas: E[i] / 100,
      saidas: S[i] / 100,
      saldo: (E[i] - S[i]) / 100,
      saldoAcumulado: acumulado / 100,
      previstoEntradas: PE[i] / 100,
      previstoSaidas: PS[i] / 100
    };
  });
  const soma = (arr) => arr.reduce((s, x) => s + x, 0) / 100;
  const mesAtual = ano === anoAtual ? Number(hoje.slice(5, 7)) : null;

  const primeiro = Math.min(limites.primeiro, anoAtual);
  const ultimo = Math.max(limites.ultimo, anoAtual);
  const anos = [];
  for (let a = ultimo; a >= primeiro; a--) anos.push(a);

  res.json({
    ano,
    anos,
    mesAtual,
    meses,
    totais: {
      entradas: soma(E), saidas: soma(S), saldo: soma(E) - soma(S),
      previstoEntradas: soma(PE), previstoSaidas: soma(PS)
    },
    ultimasEntradas: ultEnt.map((x) => ({ data: x.data_pagamento, valor: x.valor, descricao: `${x.aluno} · ${f.nomeReferencia(x.referencia)}`, detalhe: x.forma_pagamento })),
    ultimasSaidas: ultSai.map((x) => ({ data: x.data_pagamento, valor: x.valor, descricao: x.descricao, detalhe: x.categoria }))
  });
}));

module.exports = router;
