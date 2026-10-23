'use strict';
/* =====================================================================
 *  Motor de sugestões da conciliação bancária (funções puras).
 *
 *  Crédito do extrato → mensalidade:
 *    identificador da cobrança (EG<colégio>M<id>) no histórico ... +100
 *    valor igual (ou até 15% a mais, com juros/multa) ............ +45 / +35
 *    nome do responsável ou do aluno no histórico ................ +40 (2+ nomes) / +20 (1 nome)
 *    data perto do vencimento (ou da baixa, se já foi recebida) ... até +15
 *  Débito do extrato → conta a pagar:
 *    valor igual (obrigatório) +50 · descrição/fornecedor +30 · data até +20
 *  Débito com cara de tarifa bancária → "Tarifa bancária" (manual)
 *
 *  Confiança: alta ≥ 85 · média ≥ 60 · baixa < 60.
 *  Só "alta" e sem empate próximo com OUTRO aluno (ou outra conta) é
 *  conciliada automaticamente — valor igual sozinho NUNCA basta (quase
 *  todas as mensalidades têm o mesmo valor). Entre meses do mesmo aluno
 *  não há dúvida de quem pagou: vale o de maior pontuação (data mais perto).
 * ===================================================================== */
const f = require('./financeiro');

const CATEGORIAS_MANUAIS = {
  credito: ['Taxa de matrícula', 'Material didático', 'Uniforme', 'Evento / passeio', 'Rendimento de aplicação',
    'Resgate de aplicação', 'Transferência entre contas', 'Aporte / empréstimo', 'Estorno recebido', 'Outras receitas'],
  debito: ['Tarifa bancária', 'Impostos e taxas', 'Juros e multas', 'Aplicação financeira', 'Transferência entre contas',
    'Retirada / pró-labore', 'Devolução / reembolso', 'Outras despesas']
};

const PARADAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'PIX', 'TED', 'DOC', 'TRANSF', 'TRANSFERENCIA', 'RECEBIDO', 'RECEBIDA',
  'RECEBIMENTO', 'ENVIADO', 'ENVIADA', 'PAGAMENTO', 'PAGTO', 'PGTO', 'PAG', 'CREDITO', 'DEBITO', 'BOLETO', 'CONTA', 'LTDA', 'EIRELI',
  'SA', 'ME', 'MEI', 'BCO', 'BANCO', 'REM', 'DEST', 'COBRANCA', 'MENSALIDADE', 'ESCOLA', 'COLEGIO']);

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const tokens = (s, min = 3) => new Set(norm(s).split(' ').filter((t) => t.length >= min && !PARADAS.has(t) && !/^\d+$/.test(t)));
const dias = (a, b) => Math.abs(f.diasEntre(a, b));
const confianca = (p) => (p >= 85 ? 'alta' : p >= 60 ? 'media' : 'baixa');

/** Identificador impresso na cobrança em PDF (txid do PIX): EG<colégio>M<mensalidade>. */
function identificador(descricao, colegioId) {
  const m = norm(descricao).match(/\bEG ?(\d+) ?M ?(\d+)\b/);
  return m && Number(m[1]) === Number(colegioId) ? Number(m[2]) : null;
}

/** Forma de pagamento provável pelo histórico do extrato. */
function formaPorDescricao(descricao) {
  const d = norm(descricao);
  if (/\bPIX\b/.test(d)) return 'PIX';
  if (/BOLETO|COBRANCA|TITULO/.test(d)) return 'Boleto';
  if (/\bDEP(OSITO)?\b|DINHEIRO/.test(d)) return 'Dinheiro';
  if (/CARTAO|REDE|CIELO|STONE|GETNET|PAGSEGURO/.test(d)) return 'Cartão de débito';
  return 'Transferência';
}

const ehTarifa = (descricao) => /\b(TARIFA|TAR|CESTA|PACOTE (DE )?SERV|MANUT(ENCAO)? (DE )?CONTA|ANUIDADE|IOF)\b/.test(norm(descricao));

/** Quantos nomes (≥3 letras) do cadastro aparecem no histórico. */
function nomesEncontrados(descricao, ...nomes) {
  const hist = tokens(descricao);
  const cad = new Set();
  nomes.forEach((n) => tokens(n).forEach((t) => cad.add(t)));
  let n = 0;
  cad.forEach((t) => { if (hist.has(t)) n += 1; });
  return n;
}

/**
 * Pontua uma mensalidade para um crédito do extrato.
 * m: { id, aluno, resp, valor, valorPago, status, vencimento, dataPagamento }
 */
function pontuarMensalidade(l, m, colegioId) {
  const idOk = identificador(l.descricao, colegioId) === m.id;
  const alvo = f.centavos(m.status === 'pago' ? (m.valorPago ?? m.valor) : m.valor);
  const lv = f.centavos(l.valor);
  const pv = lv === alvo ? 45 : (m.status !== 'pago' && lv > alvo && lv <= alvo * 1.15 ? 35 : 0);
  if (!idOk && !pv) return null; // valor diferente e sem identificador: não é candidata
  let p = (idOk ? 100 : 0) + pv;
  const nomes = nomesEncontrados(l.descricao, m.resp, m.aluno);
  if (nomes >= 2) p += 40; else if (nomes === 1) p += 20;
  if (m.status === 'pago' && m.dataPagamento) {
    const d = dias(l.data, m.dataPagamento);
    if (d <= 3) p += 15; else if (d <= 10) p += 8;
  } else {
    const d = dias(l.data, m.vencimento);
    if (d <= 15) p += 10; else if (d <= 45) p += 5;
  }
  // Identificador certo mas valor menor (pagamento parcial?): só sugere, nunca automático
  return idOk && !pv ? Math.min(p, 80) : p;
}

function pontuarConta(l, c) {
  if (f.centavos(l.valor) !== f.centavos(c.valor)) return null;
  let p = 50;
  const hist = tokens(l.descricao, 4);
  const cad = tokens(`${c.descricao} ${c.fornecedor || ''}`, 4);
  if ([...cad].some((t) => hist.has(t))) p += 30;
  if (c.status === 'pago' && c.dataPagamento) {
    const d = dias(l.data, c.dataPagamento);
    if (d <= 3) p += 20; else if (d <= 10) p += 10;
  } else {
    const d = dias(l.data, c.vencimento);
    if (d <= 5) p += 15; else if (d <= 20) p += 8;
  }
  return p;
}

/**
 * Sugestões para um lançamento, da melhor para a pior.
 * cand: { mensalidades: [...], contas: [...] }
 * usados: Set de 'm:<id>' / 'c:<id>' já escolhidos (para não sugerir duas vezes)
 */
function sugerir(l, cand, colegioId, { usados = new Set(), limite = 3 } = {}) {
  const lista = [];
  if (l.tipo === 'credito') {
    cand.mensalidades.forEach((m) => {
      if (usados.has(`m:${m.id}`)) return;
      const p = pontuarMensalidade(l, m, colegioId);
      if (p === null || p < 40) return;
      lista.push({
        tipo: 'mensalidade', id: m.id, grupo: `a${m.alunoId}`, pontos: p, confianca: confianca(p),
        rotulo: `${m.aluno} · ${f.nomeReferencia(m.referencia)}`,
        detalhe: m.status === 'pago' ? `já recebida em ${m.dataPagamento.split('-').reverse().join('/')}` : `vence ${m.vencimento.split('-').reverse().join('/')}`,
        valor: m.status === 'pago' ? (m.valorPago ?? m.valor) : m.valor,
        jaBaixada: m.status === 'pago'
      });
    });
  } else {
    cand.contas.forEach((c) => {
      if (usados.has(`c:${c.id}`)) return;
      const p = pontuarConta(l, c);
      if (p === null || p < 40) return;
      lista.push({
        tipo: 'conta', id: c.id, grupo: `c${norm(c.descricao)}`, pontos: p, confianca: confianca(p),
        rotulo: c.descricao + (c.fornecedor ? ` · ${c.fornecedor}` : ''),
        detalhe: c.status === 'pago' ? `já paga em ${c.dataPagamento.split('-').reverse().join('/')}` : `vence ${c.vencimento.split('-').reverse().join('/')}`,
        valor: c.valor,
        jaBaixada: c.status === 'pago'
      });
    });
    if (ehTarifa(l.descricao)) {
      lista.push({ tipo: 'manual', categoria: 'Tarifa bancária', grupo: 'manual', pontos: 90, confianca: 'alta', rotulo: 'Tarifa bancária', detalhe: 'despesa do banco', valor: l.valor });
    }
  }
  lista.sort((a, b) => b.pontos - a.pontos);
  return lista.slice(0, limite);
}

/** A melhor sugestão pode ser aplicada sozinha? Alta, e nenhuma sugestão de
 *  OUTRO aluno/conta a menos de 15 pontos (outro mês do mesmo aluno não conta). */
function automatica(sugestoes) {
  const [a, ...resto] = sugestoes;
  if (!a || a.confianca !== 'alta') return false;
  const rival = resto.find((x) => x.grupo !== a.grupo);
  return !rival || rival.pontos <= a.pontos - 15;
}

module.exports = {
  CATEGORIAS_MANUAIS, identificador, formaPorDescricao, ehTarifa, nomesEncontrados,
  pontuarMensalidade, pontuarConta, sugerir, automatica, norm
};
