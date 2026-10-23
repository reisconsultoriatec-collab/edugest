'use strict';
/* =====================================================================
 *  Baixas — a mesma regra usada pelos botões "Receber" / "Pagar" e pela
 *  conciliação bancária. Todas rodam dentro de transação (conn) e
 *  recebem a linha já travada com SELECT ... FOR UPDATE.
 * ===================================================================== */
const f = require('./financeiro');

/** Mensalidade pendente → paga. */
async function baixarMensalidade(conn, m, { data, valorPago, forma, obs }) {
  await conn.query(
    `UPDATE mensalidades SET status = 'pago', data_pagamento = ?, valor_pago = ?, forma_pagamento = ?, obs_pagamento = ?
      WHERE id = ?`,
    [data, valorPago ?? m.valor, forma, obs || null, m.id]
  );
}

/** Mensalidade paga → pendente (e recalcula o desconto das bolsas). */
async function estornarMensalidade(conn, colegioId, m) {
  await conn.query(
    `UPDATE mensalidades SET status = 'pendente', data_pagamento = NULL, valor_pago = NULL, forma_pagamento = NULL, obs_pagamento = NULL
      WHERE id = ?`,
    [m.id]
  );
  await f.recalcularPendentes(conn, colegioId, m.aluno_id);
}

/** Conta pendente → paga. Se for recorrente, lança a próxima (se ainda não existir). */
async function pagarConta(conn, colegioId, c, data) {
  await conn.query("UPDATE contas_pagar SET status = 'pago', data_pagamento = ? WHERE id = ?", [data, c.id]);
  const meses = f.RECORRENCIAS[c.recorrencia] || 0;
  if (!meses) return null;
  const venc = f.somarMeses(c.vencimento, meses);
  const [[existe]] = await conn.query(
    'SELECT id FROM contas_pagar WHERE colegio_id = ? AND descricao = ? AND vencimento = ? LIMIT 1',
    [colegioId, c.descricao, venc]
  );
  if (existe) return null;
  await conn.query(
    `INSERT INTO contas_pagar (colegio_id, descricao, categoria, fornecedor, valor, vencimento, recorrencia, obs)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [colegioId, c.descricao, c.categoria, c.fornecedor, c.valor, venc, c.recorrencia, c.obs]
  );
  return { vencimento: venc };
}

/** Conta paga → pendente. */
async function estornarConta(conn, c) {
  await conn.query("UPDATE contas_pagar SET status = 'pendente', data_pagamento = NULL WHERE id = ?", [c.id]);
}

/** Quantos lançamentos do extrato estão conciliados com a mensalidade/conta. */
async function conciliacoes(conn, campo, id) {
  const [[r]] = await conn.query(
    `SELECT COUNT(*) AS n FROM lancamentos_bancarios WHERE ${campo === 'conta' ? 'conta_pagar_id' : 'mensalidade_id'} = ? AND status = 'conciliado'`,
    [id]
  );
  return Number(r.n);
}

module.exports = { baixarMensalidade, estornarMensalidade, pagarConta, estornarConta, conciliacoes };
