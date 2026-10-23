'use strict';
/* =====================================================================
 *  Regras do financeiro (compartilhadas pelas rotas)
 *
 *  - Dinheiro é calculado em centavos inteiros (sem erro de ponto flutuante).
 *  - Bolsa vigente numa data: ativa e com a data dentro da vigência.
 *    Havendo mais de uma, vale a de MAIOR percentual (não somam).
 *  - Mensalidades pendentes sempre refletem as bolsas vigentes;
 *    mensalidades pagas ou canceladas nunca são recalculadas.
 *  - Situação exibida: paga · cancelada · isenta (pendente com valor 0)
 *    · vencida (pendente com vencimento passado) · pendente.
 * ===================================================================== */

const FORMAS_PAGAMENTO = ['PIX', 'Boleto', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Transferência', 'Outro'];
const RECORRENCIAS = { nenhuma: 0, mensal: 1, trimestral: 3, anual: 12 };

const centavos = (x) => Math.round(Number(x || 0) * 100);

/** Desconto e valor final a partir do valor bruto e do percentual da bolsa. */
function calcularValores(valorBruto, percentual) {
  const bruto = centavos(valorBruto);
  const desc = Math.min(bruto, Math.round((bruto * Number(percentual || 0)) / 100));
  return { desconto: desc / 100, valor: (bruto - desc) / 100 };
}

/** Bolsa de maior percentual vigente na data (AAAA-MM-DD), ou null. */
function bolsaVigente(bolsas, data) {
  let melhor = null;
  bolsas.forEach((b) => {
    if (!b.ativo) return;
    if (b.vigencia_inicio && b.vigencia_inicio > data) return;
    if (b.vigencia_fim && b.vigencia_fim < data) return;
    if (!melhor || Number(b.percentual) > Number(melhor.percentual)) melhor = b;
  });
  return melhor;
}

/** Situação para exibição (o banco guarda só pendente/pago/cancelado). */
function situacaoMensalidade(m, hoje) {
  if (m.status === 'pago') return 'paga';
  if (m.status === 'cancelado') return 'cancelada';
  if (Number(m.valor) === 0) return 'isenta';
  return m.vencimento < hoje ? 'vencida' : 'pendente';
}

function situacaoConta(c, hoje) {
  if (c.status === 'pago') return 'paga';
  if (c.status === 'cancelado') return 'cancelada';
  return c.vencimento < hoje ? 'vencida' : 'a_vencer';
}

/** Soma meses a uma data, ajustando o dia ao fim do mês quando preciso. */
function somarMeses(data, n) {
  const [a, m, d] = data.split('-').map(Number);
  const total = (a * 12 + (m - 1)) + n;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

/** Dias entre duas datas AAAA-MM-DD (b - a). */
function diasEntre(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/**
 * Recalcula desconto/valor das mensalidades PENDENTES de um aluno conforme
 * as bolsas atuais. Deve rodar dentro de transação. Retorna quantas mudaram.
 */
async function recalcularPendentes(conn, colegioId, alunoId) {
  const [bolsas] = await conn.query(
    'SELECT id, percentual, vigencia_inicio, vigencia_fim, ativo FROM bolsas WHERE colegio_id = ? AND aluno_id = ?',
    [colegioId, alunoId]
  );
  const [mens] = await conn.query(
    `SELECT id, vencimento, valor_bruto, desconto, valor, bolsa_id FROM mensalidades
      WHERE colegio_id = ? AND aluno_id = ? AND status = 'pendente' FOR UPDATE`,
    [colegioId, alunoId]
  );
  let alteradas = 0;
  for (const m of mens) {
    const b = bolsaVigente(bolsas, m.vencimento);
    const v = calcularValores(m.valor_bruto, b ? b.percentual : 0);
    const bolsaId = b ? b.id : null;
    if (centavos(v.desconto) !== centavos(m.desconto) || centavos(v.valor) !== centavos(m.valor) || bolsaId !== m.bolsa_id) {
      await conn.query('UPDATE mensalidades SET desconto = ?, valor = ?, bolsa_id = ? WHERE id = ?', [v.desconto, v.valor, bolsaId, m.id]);
      alteradas += 1;
    }
  }
  return alteradas;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
/** 'AAAA-MM' → 'Out/2026' */
const nomeReferencia = (ref) => `${MESES[Number(ref.slice(5, 7)) - 1]}/${ref.slice(0, 4)}`;

module.exports = {
  FORMAS_PAGAMENTO, RECORRENCIAS, MESES,
  centavos, calcularValores, bolsaVigente, situacaoMensalidade, situacaoConta,
  somarMeses, diasEntre, recalcularPendentes, nomeReferencia
};
