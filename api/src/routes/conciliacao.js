'use strict';
/* =====================================================================
 *  /api/conciliacao   [módulo conciliacao]
 *
 *  Contas bancárias
 *    GET    /contas-banco                 lista (com pendências e último saldo)
 *    POST   /contas-banco  ·  PUT /contas-banco/:id  ·  DELETE /contas-banco/:id
 *  Extrato
 *    POST   /importar                     { contaBancoId, arquivo, conteudo (base64), simular }
 *    GET    /importacoes?contaBancoId=    histórico de importações
 *    DELETE /importacoes/:id              desfaz uma importação (se nada estiver conciliado)
 *  Lançamentos
 *    GET    /lancamentos?contaBancoId=&status=&mes=&tipo=&busca=   lista + sugestões
 *    GET    /lancamentos/:id/candidatos?busca=                     para vincular à mão
 *    POST   /lancamentos/:id/conciliar    { vinculo: mensalidade|conta|nova_conta|manual, ... }
 *    POST   /lancamentos/:id/desfazer
 *    POST   /automatica                   aplica só as sugestões de confiança alta
 *    POST   /lote                         { ids, acao: sugestoes|manual|excluir, categoria }
 *  Resumo
 *    GET    /resumo?contaBancoId=&ano=
 *
 *  Vincular a uma mensalidade em aberto dá a baixa (data e valor do extrato);
 *  a uma conta pendente, registra o pagamento. Desfazer reverte o que a
 *  conciliação fez (acao_baixa) — nunca uma baixa feita à mão antes.
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm, transacao } = require('../db');
const { exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade } = require('../utils/auditoria');
const { hojeSP, agoraSP } = require('../utils/datas');
const f = require('../services/financeiro');
const baixas = require('../services/baixas');
const motor = require('../services/conciliacao');
const { lerExtrato, ExtratoErro } = require('../services/extrato');

router.use(exigirModulo('conciliacao'));

const TIPOS_CONTA = ['corrente', 'poupanca', 'pagamento'];
const MAX_ARQUIVO = 3 * 1024 * 1024;
const moeda = (x) => `R$ ${Number(x).toFixed(2).replace('.', ',')}`;

function somarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function buscarContaBanco(colegioId, id) {
  const c = await queryUm('SELECT * FROM contas_banco WHERE id = ? AND colegio_id = ?', [id, colegioId]);
  if (!c) throw new HttpErro(404, 'Conta bancária não encontrada', 'nao_encontrado');
  return c;
}

/* =====================================================================
 *  Contas bancárias
 * ===================================================================== */
router.get('/contas-banco', assincrono(async (req, res) => {
  const [contas, imps] = await Promise.all([
    query(
      `SELECT cb.*,
              (SELECT COUNT(*) FROM lancamentos_bancarios l WHERE l.conta_banco_id = cb.id AND l.status = 'pendente') AS pendentes,
              (SELECT COUNT(*) FROM lancamentos_bancarios l WHERE l.conta_banco_id = cb.id) AS lancamentos
         FROM contas_banco cb WHERE cb.colegio_id = ? ORDER BY cb.ativo DESC, cb.nome`,
      [req.colegioId]
    ),
    query(
      `SELECT conta_banco_id, saldo_final, saldo_data, periodo_fim, importado_em FROM importacoes_extrato
        WHERE colegio_id = ? ORDER BY importado_em DESC, id DESC`,
      [req.colegioId]
    )
  ]);
  res.json(contas.map((c) => {
    const ult = imps.find((i) => i.conta_banco_id === c.id);
    const comSaldo = imps.find((i) => i.conta_banco_id === c.id && i.saldo_final !== null);
    return {
      id: c.id, nome: c.nome, banco: c.banco, agencia: c.agencia, conta: c.conta, tipo: c.tipo, ativo: !!c.ativo,
      pendentes: Number(c.pendentes), lancamentos: Number(c.lancamentos),
      ultimaImportacao: ult ? ult.importado_em : null,
      extratoAte: ult ? ult.periodo_fim : null,
      saldoBanco: comSaldo ? { valor: comSaldo.saldo_final, data: comSaldo.saldo_data } : null
    };
  }));
}));

function lerContaBanco(b) {
  return {
    nome: v.texto(b.nome, 'Nome da conta', { max: 100, min: 2, obrigatorio: true }),
    banco: v.texto(b.banco, 'Banco', { max: 60 }),
    agencia: v.texto(b.agencia, 'Agência', { max: 20 }),
    conta: v.texto(b.conta, 'Conta', { max: 20 }),
    tipo: v.umDe(b.tipo || 'corrente', TIPOS_CONTA, 'Tipo da conta')
  };
}

router.post('/contas-banco', assincrono(async (req, res) => {
  const c = lerContaBanco(req.body);
  const r = await query('INSERT INTO contas_banco (colegio_id, nome, banco, agencia, conta, tipo) VALUES (?, ?, ?, ?, ?, ?)',
    [req.colegioId, c.nome, c.banco, c.agencia, c.conta, c.tipo]);
  await atividade(req.colegioId, req.usuario.id, `Conta bancária cadastrada: ${c.nome}`);
  res.status(201).json({ id: r.insertId });
}));

router.put('/contas-banco/:id', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  await buscarContaBanco(req.colegioId, id);
  const c = lerContaBanco(req.body);
  const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
  await query('UPDATE contas_banco SET nome = ?, banco = ?, agencia = ?, conta = ?, tipo = ?, ativo = ? WHERE id = ? AND colegio_id = ?',
    [c.nome, c.banco, c.agencia, c.conta, c.tipo, ativo, id, req.colegioId]);
  await atividade(req.colegioId, req.usuario.id, `Conta bancária alterada: ${c.nome}`);
  res.json({ id });
}));

router.delete('/contas-banco/:id', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const c = await buscarContaBanco(req.colegioId, id);
  const r = await queryUm('SELECT COUNT(*) AS n FROM lancamentos_bancarios WHERE conta_banco_id = ?', [id]);
  if (Number(r.n) > 0) {
    throw new HttpErro(409, `A conta ${c.nome} tem ${r.n} lançamento(s) importado(s). Desative a conta em vez de excluir.`, 'em_uso');
  }
  await query('DELETE FROM contas_banco WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  await atividade(req.colegioId, req.usuario.id, `Conta bancária excluída: ${c.nome}`);
  res.status(204).end();
}));

/* =====================================================================
 *  Importação de extrato
 * ===================================================================== */
router.post('/importar', assincrono(async (req, res) => {
  const b = req.body;
  const contaId = v.inteiro(b.contaBancoId, 'Conta bancária', { min: 1, obrigatorio: true });
  const conta = await buscarContaBanco(req.colegioId, contaId);
  if (!conta.ativo) throw new HttpErro(409, 'Esta conta bancária está desativada', 'inativa');
  const arquivo = v.texto(b.arquivo, 'Nome do arquivo', { max: 150 }) || 'extrato';
  if (typeof b.conteudo !== 'string' || !b.conteudo) throw new HttpErro(400, 'Arquivo vazio', 'validacao');
  const buf = Buffer.from(b.conteudo, 'base64');
  if (!buf.length) throw new HttpErro(400, 'Arquivo vazio', 'validacao');
  if (buf.length > MAX_ARQUIVO) throw new HttpErro(413, 'Arquivo grande demais (máximo 3 MB). Exporte um período menor.', 'validacao');

  let extrato;
  try {
    extrato = lerExtrato(buf, arquivo);
  } catch (e) {
    if (e instanceof ExtratoErro) throw new HttpErro(400, e.message, 'extrato');
    throw e;
  }

  const existentes = new Set();
  const chaves = extrato.itens.map((x) => x.chave);
  for (let i = 0; i < chaves.length; i += 1000) {
    const r = await query('SELECT chave_importacao FROM lancamentos_bancarios WHERE conta_banco_id = ? AND chave_importacao IN (?)',
      [contaId, chaves.slice(i, i + 1000)]);
    r.forEach((x) => existentes.add(x.chave_importacao));
  }
  const novos = extrato.itens.filter((x) => !existentes.has(x.chave));
  const soma = (tipo) => f.centavos(novos.filter((x) => x.tipo === tipo).reduce((s, x) => s + x.valor, 0)) / 100;
  const resumo = {
    formato: extrato.formato,
    periodo: extrato.periodo,
    saldo: extrato.saldo,
    total: extrato.itens.length,
    novos: novos.length,
    duplicados: extrato.itens.length - novos.length,
    creditos: soma('credito'),
    debitos: soma('debito')
  };

  if (b.simular) {
    return res.json({
      ...resumo,
      simulacao: true,
      amostra: extrato.itens.slice(0, 300).map((x) => ({ data: x.data, descricao: x.descricao, tipo: x.tipo, valor: x.valor, duplicado: existentes.has(x.chave) }))
    });
  }
  if (!novos.length) throw new HttpErro(409, 'Todos os lançamentos deste arquivo já foram importados antes.', 'duplicado');

  const r = await transacao(async (conn) => {
    const [imp] = await conn.query(
      `INSERT INTO importacoes_extrato (colegio_id, conta_banco_id, arquivo, formato, periodo_inicio, periodo_fim, saldo_final, saldo_data,
                                        qtd_lancamentos, qtd_duplicados, importado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [req.colegioId, contaId, arquivo, extrato.formato, extrato.periodo.inicio, extrato.periodo.fim,
        extrato.saldo ? extrato.saldo.valor : null, extrato.saldo ? extrato.saldo.data : null, resumo.duplicados, req.usuario.id]
    );
    let inseridos = 0;
    for (let i = 0; i < novos.length; i += 500) {
      const [ins] = await conn.query(
        `INSERT IGNORE INTO lancamentos_bancarios (colegio_id, conta_banco_id, importacao_id, chave_importacao, data, descricao, tipo, valor)
         VALUES ?`,
        [novos.slice(i, i + 500).map((x) => [req.colegioId, contaId, imp.insertId, x.chave, x.data, x.descricao, x.tipo, x.valor])]
      );
      inseridos += ins.affectedRows;
    }
    await conn.query('UPDATE importacoes_extrato SET qtd_lancamentos = ?, qtd_duplicados = ? WHERE id = ?',
      [inseridos, extrato.itens.length - inseridos, imp.insertId]);
    return { importacaoId: imp.insertId, importados: inseridos, duplicados: extrato.itens.length - inseridos };
  });
  await atividade(req.colegioId, req.usuario.id, `Extrato importado (${conta.nome}): ${r.importados} lançamento(s) · ${arquivo}`);
  res.status(201).json({ ...resumo, ...r, simulacao: false });
}));

router.get('/importacoes', assincrono(async (req, res) => {
  const cond = ['i.colegio_id = ?'];
  const params = [req.colegioId];
  const contaId = v.inteiro(req.query.contaBancoId, 'Conta bancária', { min: 1 });
  if (contaId) { cond.push('i.conta_banco_id = ?'); params.push(contaId); }
  const linhas = await query(
    `SELECT i.*, cb.nome AS conta, u.nome AS usuario,
            (SELECT COUNT(*) FROM lancamentos_bancarios l WHERE l.importacao_id = i.id AND l.status = 'conciliado') AS conciliados,
            (SELECT COUNT(*) FROM lancamentos_bancarios l WHERE l.importacao_id = i.id) AS restantes
       FROM importacoes_extrato i
       JOIN contas_banco cb ON cb.id = i.conta_banco_id
       LEFT JOIN usuarios u ON u.id = i.importado_por
      WHERE ${cond.join(' AND ')}
      ORDER BY i.importado_em DESC, i.id DESC
      LIMIT 200`,
    params
  );
  res.json(linhas.map((i) => ({
    id: i.id, conta: i.conta, contaBancoId: i.conta_banco_id, arquivo: i.arquivo, formato: i.formato,
    periodoInicio: i.periodo_inicio, periodoFim: i.periodo_fim, saldoFinal: i.saldo_final, saldoData: i.saldo_data,
    lancamentos: i.qtd_lancamentos, duplicados: i.qtd_duplicados, conciliados: Number(i.conciliados), restantes: Number(i.restantes),
    usuario: i.usuario, importadoEm: i.importado_em
  })));
}));

router.delete('/importacoes/:id', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const r = await transacao(async (conn) => {
    const [[imp]] = await conn.query('SELECT * FROM importacoes_extrato WHERE id = ? AND colegio_id = ? FOR UPDATE', [id, req.colegioId]);
    if (!imp) throw new HttpErro(404, 'Importação não encontrada', 'nao_encontrado');
    const [[c]] = await conn.query("SELECT COUNT(*) AS n FROM lancamentos_bancarios WHERE importacao_id = ? AND status = 'conciliado'", [id]);
    if (Number(c.n) > 0) {
      throw new HttpErro(409, `${c.n} lançamento(s) desta importação já estão conciliados. Desfaça essas conciliações antes de desfazer a importação.`, 'conciliado');
    }
    const [del] = await conn.query('DELETE FROM lancamentos_bancarios WHERE importacao_id = ? AND colegio_id = ?', [id, req.colegioId]);
    await conn.query('DELETE FROM importacoes_extrato WHERE id = ?', [id]);
    return { ...imp, removidos: del.affectedRows };
  });
  await atividade(req.colegioId, req.usuario.id, `Importação de extrato desfeita: ${r.arquivo} (${r.removidos} lançamento(s) removido(s))`);
  res.json({ removidos: r.removidos });
}));

/* =====================================================================
 *  Candidatos (mensalidades e contas que podem casar com o extrato)
 * ===================================================================== */
async function carregarCandidatos(colegioId, ini, fim, { busca = null, amplo = false } = {}) {
  const termo = busca ? `%${busca.replace(/[%_\\]/g, '\\$&')}%` : null;
  const pIni = amplo ? '2000-01-01' : somarDias(ini, -150);
  const pFim = amplo ? '2100-12-31' : somarDias(fim, 60);
  const [mens, contas] = await Promise.all([
    query(
      `SELECT m.id, m.aluno_id, m.referencia, m.vencimento, m.valor, m.valor_pago, m.status, m.data_pagamento, a.nome AS aluno, a.ra, a.resp_nome AS resp
         FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id
        WHERE m.colegio_id = ?
          AND ((m.status = 'pendente' AND m.valor > 0 AND m.vencimento BETWEEN ? AND ?)
            OR (m.status = 'pago' AND m.data_pagamento BETWEEN ? AND ?
                AND NOT EXISTS (SELECT 1 FROM lancamentos_bancarios lb WHERE lb.mensalidade_id = m.id AND lb.status = 'conciliado')))
          ${termo ? 'AND (a.nome LIKE ? OR a.ra LIKE ? OR a.resp_nome LIKE ?)' : ''}
        ORDER BY m.vencimento
        LIMIT 5000`,
      [colegioId, pIni, pFim, somarDias(ini, amplo ? -90 : -15), somarDias(fim, amplo ? 90 : 15), ...(termo ? [termo, termo, termo] : [])]
    ),
    query(
      `SELECT c.id, c.descricao, c.fornecedor, c.categoria, c.valor, c.vencimento, c.status, c.data_pagamento
         FROM contas_pagar c
        WHERE c.colegio_id = ?
          AND ((c.status = 'pendente' AND c.vencimento BETWEEN ? AND ?)
            OR (c.status = 'pago' AND c.data_pagamento BETWEEN ? AND ?
                AND NOT EXISTS (SELECT 1 FROM lancamentos_bancarios lb WHERE lb.conta_pagar_id = c.id AND lb.status = 'conciliado')))
          ${termo ? 'AND (c.descricao LIKE ? OR c.fornecedor LIKE ?)' : ''}
        ORDER BY c.vencimento
        LIMIT 5000`,
      [colegioId, amplo ? '2000-01-01' : somarDias(ini, -60), amplo ? '2100-12-31' : somarDias(fim, 60),
        somarDias(ini, amplo ? -90 : -15), somarDias(fim, amplo ? 90 : 15), ...(termo ? [termo, termo] : [])]
    )
  ]);
  return {
    mensalidades: mens.map((m) => ({
      id: m.id, alunoId: m.aluno_id, referencia: m.referencia, vencimento: m.vencimento, valor: m.valor, valorPago: m.valor_pago,
      status: m.status, dataPagamento: m.data_pagamento, aluno: m.aluno, ra: m.ra, resp: m.resp
    })),
    contas: contas.map((c) => ({
      id: c.id, descricao: c.descricao, fornecedor: c.fornecedor, categoria: c.categoria, valor: c.valor,
      vencimento: c.vencimento, status: c.status, dataPagamento: c.data_pagamento
    }))
  };
}

const lancamento = (l) => ({ id: l.id, data: l.data, descricao: l.descricao, tipo: l.tipo, valor: Number(l.valor) });

/* =====================================================================
 *  Lançamentos
 * ===================================================================== */
router.get('/lancamentos', assincrono(async (req, res) => {
  const cond = ['l.colegio_id = ?'];
  const params = [req.colegioId];
  const contaId = v.inteiro(req.query.contaBancoId, 'Conta bancária', { min: 1 });
  if (contaId) { cond.push('l.conta_banco_id = ?'); params.push(contaId); }
  const status = v.umDe(req.query.status || null, ['pendente', 'conciliado'], 'Situação', { obrigatorio: false });
  if (status) { cond.push('l.status = ?'); params.push(status); }
  const tipo = v.umDe(req.query.tipo || null, ['credito', 'debito'], 'Tipo', { obrigatorio: false });
  if (tipo) { cond.push('l.tipo = ?'); params.push(tipo); }
  if (req.query.mes) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.mes)) throw new HttpErro(400, 'Mês inválido', 'validacao');
    cond.push("l.data BETWEEN ? AND LAST_DAY(?)"); params.push(`${req.query.mes}-01`, `${req.query.mes}-01`);
  }
  const busca = v.texto(req.query.busca, 'Busca', { max: 100 });
  if (busca) { cond.push('l.descricao LIKE ?'); params.push(`%${busca.replace(/[%_\\]/g, '\\$&')}%`); }

  const linhas = await query(
    `SELECT l.*, cb.nome AS conta_nome, m.referencia, a.nome AS aluno, cp.descricao AS conta_desc, cp.categoria AS conta_categoria,
            u.nome AS conciliado_por_nome
       FROM lancamentos_bancarios l
       JOIN contas_banco cb ON cb.id = l.conta_banco_id
       LEFT JOIN mensalidades m ON m.id = l.mensalidade_id
       LEFT JOIN alunos a ON a.id = m.aluno_id
       LEFT JOIN contas_pagar cp ON cp.id = l.conta_pagar_id
       LEFT JOIN usuarios u ON u.id = l.conciliado_por
      WHERE ${cond.join(' AND ')}
      ORDER BY l.data DESC, l.id DESC
      LIMIT 2000`,
    params
  );

  // Sugestões para os pendentes listados
  const pendentes = linhas.filter((l) => l.status === 'pendente').slice(0, 800);
  let cand = { mensalidades: [], contas: [] };
  if (pendentes.length) {
    const datas = pendentes.map((l) => l.data).sort();
    cand = await carregarCandidatos(req.colegioId, datas[0], datas[datas.length - 1]);
  }
  const sug = new Map(pendentes.map((l) => {
    const s = motor.sugerir(lancamento(l), cand, req.colegioId, { limite: 10 });
    return [l.id, { sugestoes: s.slice(0, 2), automatica: motor.automatica(s) }];
  }));

  const resumo = { quantidade: linhas.length, creditos: 0, debitos: 0, pendentes: 0, conciliados: 0, automaticas: 0 };
  linhas.forEach((l) => {
    resumo[l.tipo === 'credito' ? 'creditos' : 'debitos'] += f.centavos(l.valor);
    resumo[l.status === 'pendente' ? 'pendentes' : 'conciliados'] += 1;
    if (sug.get(l.id) && sug.get(l.id).automatica) resumo.automaticas += 1;
  });
  resumo.creditos /= 100; resumo.debitos /= 100;

  res.json({
    resumo,
    categorias: motor.CATEGORIAS_MANUAIS,
    categoriasContas: f.CATEGORIAS_CONTAS,
    itens: linhas.map((l) => ({
      id: l.id,
      contaBancoId: l.conta_banco_id,
      conta: l.conta_nome,
      data: l.data,
      descricao: l.descricao,
      tipo: l.tipo,
      valor: Number(l.valor),
      status: l.status,
      vinculo: l.status === 'conciliado' ? {
        tipo: l.vinculo_tipo,
        acao: l.acao_baixa,
        mensalidadeId: l.mensalidade_id,
        contaPagarId: l.conta_pagar_id,
        rotulo: l.vinculo_tipo === 'mensalidade'
          ? (l.aluno ? `${l.aluno} · ${f.nomeReferencia(l.referencia)}` : 'Mensalidade excluída')
          : l.vinculo_tipo === 'conta' ? (l.conta_desc || 'Conta excluída') : l.categoria,
        categoria: l.vinculo_tipo === 'conta' ? l.conta_categoria : l.categoria,
        obs: l.obs,
        por: l.conciliado_por_nome,
        em: l.conciliado_em
      } : null,
      ...(sug.get(l.id) || {})
    }))
  });
}));

router.get('/lancamentos/:id/candidatos', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const l = await queryUm('SELECT * FROM lancamentos_bancarios WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  if (!l) throw new HttpErro(404, 'Lançamento não encontrado', 'nao_encontrado');
  const busca = v.texto(req.query.busca, 'Busca', { max: 100 });
  const cand = await carregarCandidatos(req.colegioId, l.data, l.data, { busca, amplo: true });
  const lc = lancamento(l);
  let itens;
  if (l.tipo === 'credito') {
    itens = cand.mensalidades.map((m) => {
      const p = motor.pontuarMensalidade(lc, m, req.colegioId) || 0;
      return {
        tipo: 'mensalidade', id: m.id, pontos: p, confianca: p >= 85 ? 'alta' : p >= 60 ? 'media' : 'baixa',
        rotulo: `${m.aluno} · ${f.nomeReferencia(m.referencia)}`, ra: m.ra, resp: m.resp,
        valor: m.status === 'pago' ? (m.valorPago ?? m.valor) : m.valor,
        jaBaixada: m.status === 'pago',
        detalhe: m.status === 'pago' ? `já recebida em ${m.dataPagamento.split('-').reverse().join('/')}` : `vence ${m.vencimento.split('-').reverse().join('/')}`,
        distancia: Math.abs(f.diasEntre(l.data, m.status === 'pago' ? m.dataPagamento : m.vencimento))
      };
    });
  } else {
    itens = cand.contas.map((c) => {
      const p = motor.pontuarConta(lc, c) || 0;
      return {
        tipo: 'conta', id: c.id, pontos: p, confianca: p >= 85 ? 'alta' : p >= 60 ? 'media' : 'baixa',
        rotulo: c.descricao + (c.fornecedor ? ` · ${c.fornecedor}` : ''), categoria: c.categoria, valor: c.valor,
        jaBaixada: c.status === 'pago', valorDiferente: f.centavos(c.valor) !== f.centavos(l.valor),
        detalhe: c.status === 'pago' ? `já paga em ${c.dataPagamento.split('-').reverse().join('/')}` : `vence ${c.vencimento.split('-').reverse().join('/')}`,
        distancia: Math.abs(f.diasEntre(l.data, c.status === 'pago' ? c.dataPagamento : c.vencimento))
      };
    });
  }
  itens.sort((a, b) => b.pontos - a.pontos || a.distancia - b.distancia);
  res.json({ lancamento: lc, itens: itens.slice(0, 80) });
}));

/* ---------------- Conciliar (regra única) ---------------- */
async function conciliarLancamento(conn, req, l, alvo) {
  const colegioId = req.colegioId;
  let vinculo = alvo.vinculo; let mensalidadeId = null; let contaId = null; let acao = 'nenhuma'; let categoria = null; let obs = null;
  let descricao = ''; let proxima = null;

  if (vinculo === 'mensalidade') {
    if (l.tipo !== 'credito') throw new HttpErro(400, 'Só um crédito (entrada) pode ser vinculado a uma mensalidade', 'validacao');
    const [[m]] = await conn.query(
      `SELECT m.*, a.nome AS aluno FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id
        WHERE m.id = ? AND m.colegio_id = ? FOR UPDATE`, [alvo.id, colegioId]);
    if (!m) throw new HttpErro(404, 'Mensalidade não encontrada', 'nao_encontrado');
    if (m.status === 'cancelado') throw new HttpErro(409, 'Esta mensalidade está cancelada', 'status');
    if (m.status === 'pendente' && Number(m.valor) === 0) throw new HttpErro(409, 'Mensalidade isenta (bolsa de 100%)', 'status');
    if (await baixas.conciliacoes(conn, 'mensalidade', m.id)) throw new HttpErro(409, 'Esta mensalidade já está conciliada com outro lançamento do extrato', 'conciliado');
    if (m.status === 'pendente') {
      if (f.centavos(l.valor) < f.centavos(m.valor)) {
        throw new HttpErro(409, `O crédito (${moeda(l.valor)}) é menor que a mensalidade (${moeda(m.valor)}). Se foi pagamento parcial, ajuste o valor da mensalidade antes ou classifique o crédito em "Outro".`, 'valor');
      }
      await baixas.baixarMensalidade(conn, m, { data: l.data, valorPago: l.valor, forma: motor.formaPorDescricao(l.descricao), obs: 'Conciliação bancária' });
      acao = 'baixou';
    }
    mensalidadeId = m.id;
    descricao = `${m.aluno} · ${f.nomeReferencia(m.referencia)}`;
  } else if (vinculo === 'conta') {
    if (l.tipo !== 'debito') throw new HttpErro(400, 'Só um débito (saída) pode ser vinculado a uma conta a pagar', 'validacao');
    const [[c]] = await conn.query('SELECT * FROM contas_pagar WHERE id = ? AND colegio_id = ? FOR UPDATE', [alvo.id, colegioId]);
    if (!c) throw new HttpErro(404, 'Conta a pagar não encontrada', 'nao_encontrado');
    if (c.status === 'cancelado') throw new HttpErro(409, 'Esta conta está cancelada', 'status');
    if (await baixas.conciliacoes(conn, 'conta', c.id)) throw new HttpErro(409, 'Esta conta já está conciliada com outro lançamento do extrato', 'conciliado');
    if (c.status === 'pendente') {
      if (f.centavos(c.valor) !== f.centavos(l.valor)) {
        throw new HttpErro(409, `O valor da conta (${moeda(c.valor)}) é diferente do débito (${moeda(l.valor)}). Ajuste o valor em Contas a Pagar ou use "Lançar como nova conta".`, 'valor');
      }
      proxima = await baixas.pagarConta(conn, colegioId, c, l.data);
      acao = 'baixou';
    }
    contaId = c.id;
    descricao = c.descricao;
  } else if (vinculo === 'nova_conta') {
    if (l.tipo !== 'debito') throw new HttpErro(400, 'Só um débito (saída) pode virar uma conta paga', 'validacao');
    const desc = v.texto(alvo.descricao, 'Descrição', { max: 150, min: 3 }) || l.descricao.slice(0, 150);
    const cat = v.umDe(alvo.categoria || 'Outros', f.CATEGORIAS_CONTAS, 'Categoria');
    const forn = v.texto(alvo.fornecedor, 'Fornecedor', { max: 100 });
    const [ins] = await conn.query(
      `INSERT INTO contas_pagar (colegio_id, descricao, categoria, fornecedor, valor, vencimento, recorrencia, status, data_pagamento, obs)
       VALUES (?, ?, ?, ?, ?, ?, 'nenhuma', 'pago', ?, 'Criada pela conciliação bancária')`,
      [colegioId, desc, cat, forn, l.valor, l.data, l.data]
    );
    vinculo = 'conta'; contaId = ins.insertId; acao = 'criou'; descricao = `${desc} (nova conta)`;
  } else if (vinculo === 'manual') {
    categoria = v.umDe(alvo.categoria, motor.CATEGORIAS_MANUAIS[l.tipo], 'Categoria');
    obs = v.texto(alvo.obs, 'Observação', { max: 200 });
    descricao = categoria;
  } else {
    throw new HttpErro(400, 'Tipo de vínculo inválido', 'validacao');
  }

  await conn.query(
    `UPDATE lancamentos_bancarios SET status = 'conciliado', vinculo_tipo = ?, mensalidade_id = ?, conta_pagar_id = ?, acao_baixa = ?,
            categoria = ?, obs = ?, conciliado_por = ?, conciliado_em = ?
      WHERE id = ?`,
    [vinculo, mensalidadeId, contaId, acao, categoria, obs, req.usuario.id, agoraSP(), l.id]
  );
  return { vinculo, acao, descricao, proxima };
}

async function travarLancamento(conn, colegioId, id) {
  const [[l]] = await conn.query('SELECT * FROM lancamentos_bancarios WHERE id = ? AND colegio_id = ? FOR UPDATE', [id, colegioId]);
  if (!l) throw new HttpErro(404, 'Lançamento não encontrado', 'nao_encontrado');
  return l;
}

router.post('/lancamentos/:id/conciliar', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const alvo = { ...req.body };
  if (alvo.vinculo === 'mensalidade' || alvo.vinculo === 'conta') alvo.id = v.inteiro(alvo.id, 'Item', { min: 1, obrigatorio: true });
  const r = await transacao(async (conn) => {
    const l = await travarLancamento(conn, req.colegioId, id);
    if (l.status !== 'pendente') throw new HttpErro(409, 'Este lançamento já está conciliado', 'status');
    return { ...(await conciliarLancamento(conn, req, l, alvo)), l };
  });
  await atividade(req.colegioId, req.usuario.id,
    `Conciliação: ${r.l.tipo === 'credito' ? 'crédito' : 'débito'} de ${moeda(r.l.valor)} em ${r.l.data.split('-').reverse().join('/')} → ${r.descricao}`);
  res.json({ id, vinculo: r.vinculo, acao: r.acao, proxima: r.proxima });
}));

router.post('/lancamentos/:id/desfazer', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const r = await transacao(async (conn) => {
    const l = await travarLancamento(conn, req.colegioId, id);
    if (l.status !== 'conciliado') throw new HttpErro(409, 'Este lançamento não está conciliado', 'status');
    let desfeito = 'vínculo removido';
    // Primeiro solta o vínculo; depois reverte o que a conciliação fez
    await conn.query(
      `UPDATE lancamentos_bancarios SET status = 'pendente', vinculo_tipo = NULL, mensalidade_id = NULL, conta_pagar_id = NULL,
              acao_baixa = 'nenhuma', categoria = NULL, obs = NULL, conciliado_por = NULL, conciliado_em = NULL
        WHERE id = ?`,
      [id]
    );
    if (l.vinculo_tipo === 'mensalidade' && l.mensalidade_id && l.acao_baixa === 'baixou') {
      const [[m]] = await conn.query('SELECT * FROM mensalidades WHERE id = ? AND colegio_id = ? FOR UPDATE', [l.mensalidade_id, req.colegioId]);
      if (m && m.status === 'pago') { await baixas.estornarMensalidade(conn, req.colegioId, m); desfeito = 'baixa da mensalidade estornada'; }
    } else if (l.vinculo_tipo === 'conta' && l.conta_pagar_id && l.acao_baixa === 'baixou') {
      const [[c]] = await conn.query('SELECT * FROM contas_pagar WHERE id = ? AND colegio_id = ? FOR UPDATE', [l.conta_pagar_id, req.colegioId]);
      if (c && c.status === 'pago') { await baixas.estornarConta(conn, c); desfeito = 'pagamento da conta estornado'; }
    } else if (l.vinculo_tipo === 'conta' && l.conta_pagar_id && l.acao_baixa === 'criou') {
      await conn.query('DELETE FROM contas_pagar WHERE id = ? AND colegio_id = ?', [l.conta_pagar_id, req.colegioId]);
      desfeito = 'conta criada pela conciliação excluída';
    }
    return { l, desfeito };
  });
  await atividade(req.colegioId, req.usuario.id,
    `Conciliação desfeita: ${moeda(r.l.valor)} em ${r.l.data.split('-').reverse().join('/')} (${r.desfeito})`);
  res.json({ id, status: 'pendente', desfeito: r.desfeito });
}));

/* ---------------- Automática e em lote ---------------- */
async function aplicarSugestoes(req, ids, { aceitarMedia = false } = {}) {
  const cond = ["colegio_id = ?", "status = 'pendente'"];
  const params = [req.colegioId];
  if (ids) { cond.push('id IN (?)'); params.push(ids.length ? ids : [0]); }
  if (req.body.contaBancoId) { cond.push('conta_banco_id = ?'); params.push(v.inteiro(req.body.contaBancoId, 'Conta bancária', { min: 1 })); }
  const pendentes = await query(`SELECT * FROM lancamentos_bancarios WHERE ${cond.join(' AND ')} ORDER BY data, id LIMIT 2000`, params);
  const r = { conciliados: 0, mensalidades: 0, contas: 0, manuais: 0, ignorados: 0, erros: 0 };
  if (!pendentes.length) return r;
  const datas = pendentes.map((l) => l.data).sort();
  const cand = await carregarCandidatos(req.colegioId, datas[0], datas[datas.length - 1]);
  const usados = new Set();
  for (const l of pendentes) {
    const s = motor.sugerir(lancamento(l), cand, req.colegioId, { usados, limite: 10 });
    const [a] = s;
    const rival = a ? s.slice(1).find((x) => x.grupo !== a.grupo) : null;
    const ok = motor.automatica(s) || (aceitarMedia && a && a.confianca === 'media' && (!rival || rival.pontos <= a.pontos - 10));
    if (!ok) { r.ignorados += 1; continue; }
    try {
      await transacao(async (conn) => {
        const atual = await travarLancamento(conn, req.colegioId, l.id);
        if (atual.status !== 'pendente') throw new HttpErro(409, 'já conciliado');
        await conciliarLancamento(conn, req, atual, a.tipo === 'manual'
          ? { vinculo: 'manual', categoria: a.categoria, obs: 'Conciliação automática' }
          : { vinculo: a.tipo, id: a.id });
      });
      if (a.tipo !== 'manual') usados.add(`${a.tipo === 'mensalidade' ? 'm' : 'c'}:${a.id}`);
      r.conciliados += 1;
      r[a.tipo === 'mensalidade' ? 'mensalidades' : a.tipo === 'conta' ? 'contas' : 'manuais'] += 1;
    } catch (e) {
      if (!(e instanceof HttpErro)) throw e;
      r.erros += 1;
    }
  }
  return r;
}

router.post('/automatica', assincrono(async (req, res) => {
  const r = await aplicarSugestoes(req, null);
  if (r.conciliados) {
    await atividade(req.colegioId, req.usuario.id,
      `Conciliação automática: ${r.conciliados} lançamento(s) (${r.mensalidades} mensalidade(s), ${r.contas} conta(s), ${r.manuais} tarifa(s))`);
  }
  res.json(r);
}));

router.post('/lote', assincrono(async (req, res) => {
  const b = req.body;
  const acao = v.umDe(b.acao, ['sugestoes', 'manual', 'excluir'], 'Ação');
  if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 2000) throw new HttpErro(400, 'Selecione os lançamentos', 'validacao');
  const ids = b.ids.map((x) => v.inteiro(x, 'Lançamento', { min: 1, obrigatorio: true }));

  if (acao === 'sugestoes') {
    const r = await aplicarSugestoes(req, ids, { aceitarMedia: true });
    if (r.conciliados) await atividade(req.colegioId, req.usuario.id, `Conciliação em lote: ${r.conciliados} lançamento(s) pelas sugestões`);
    return res.json(r);
  }
  if (acao === 'excluir') {
    const r = await query(
      "DELETE FROM lancamentos_bancarios WHERE colegio_id = ? AND status = 'pendente' AND id IN (?)", [req.colegioId, ids]);
    await atividade(req.colegioId, req.usuario.id, `${r.affectedRows} lançamento(s) do extrato excluído(s)`);
    return res.json({ excluidos: r.affectedRows, ignorados: ids.length - r.affectedRows });
  }
  // manual: classifica todos com a mesma categoria (só os do tipo compatível)
  const categoria = v.texto(b.categoria, 'Categoria', { max: 40, obrigatorio: true });
  const obs = v.texto(b.obs, 'Observação', { max: 200 });
  const pend = await query("SELECT id, tipo FROM lancamentos_bancarios WHERE colegio_id = ? AND status = 'pendente' AND id IN (?)", [req.colegioId, ids]);
  const validos = pend.filter((l) => motor.CATEGORIAS_MANUAIS[l.tipo].includes(categoria)).map((l) => l.id);
  if (validos.length) {
    await query(
      `UPDATE lancamentos_bancarios SET status = 'conciliado', vinculo_tipo = 'manual', acao_baixa = 'nenhuma', categoria = ?, obs = ?,
              conciliado_por = ?, conciliado_em = ?
        WHERE colegio_id = ? AND status = 'pendente' AND id IN (?)`,
      [categoria, obs, req.usuario.id, agoraSP(), req.colegioId, validos]
    );
    await atividade(req.colegioId, req.usuario.id, `Conciliação em lote: ${validos.length} lançamento(s) como "${categoria}"`);
  }
  res.json({ conciliados: validos.length, ignorados: ids.length - validos.length });
}));

/* =====================================================================
 *  Resumo
 * ===================================================================== */
router.get('/resumo', assincrono(async (req, res) => {
  const ano = v.inteiro(req.query.ano, 'Ano', { min: 2000, max: 2100 }) || Number(hojeSP().slice(0, 4));
  const cond = ['l.colegio_id = ?', 'l.data BETWEEN ? AND ?'];
  const params = [req.colegioId, `${ano}-01-01`, `${ano}-12-31`];
  const contaId = v.inteiro(req.query.contaBancoId, 'Conta bancária', { min: 1 });
  if (contaId) { cond.push('l.conta_banco_id = ?'); params.push(contaId); }
  const linhas = await query(
    `SELECT MONTH(l.data) AS mes, l.tipo, l.status, l.vinculo_tipo, l.categoria, cp.categoria AS conta_categoria, l.valor
       FROM lancamentos_bancarios l LEFT JOIN contas_pagar cp ON cp.id = l.conta_pagar_id
      WHERE ${cond.join(' AND ')}`,
    params
  );
  const meses = f.MESES.map((nome, i) => ({ mes: i + 1, nome, creditos: 0, debitos: 0, lancamentos: 0, conciliados: 0 }));
  const cats = new Map();
  linhas.forEach((l) => {
    const x = meses[l.mes - 1];
    x[l.tipo === 'credito' ? 'creditos' : 'debitos'] += f.centavos(l.valor);
    x.lancamentos += 1;
    if (l.status !== 'conciliado') return;
    x.conciliados += 1;
    const nome = l.vinculo_tipo === 'mensalidade' ? 'Mensalidades'
      : l.vinculo_tipo === 'conta' ? `Contas · ${l.conta_categoria || 'Outros'}` : (l.categoria || 'Outros');
    const k = `${l.tipo}|${nome}`;
    if (!cats.has(k)) cats.set(k, { tipo: l.tipo, categoria: nome, qtd: 0, total: 0 });
    const c = cats.get(k); c.qtd += 1; c.total += f.centavos(l.valor);
  });
  const tot = meses.reduce((t, x) => ({ creditos: t.creditos + x.creditos, debitos: t.debitos + x.debitos, lancamentos: t.lancamentos + x.lancamentos, conciliados: t.conciliados + x.conciliados }),
    { creditos: 0, debitos: 0, lancamentos: 0, conciliados: 0 });
  res.json({
    ano,
    meses: meses.map((x) => ({ ...x, creditos: x.creditos / 100, debitos: x.debitos / 100, saldo: (x.creditos - x.debitos) / 100,
      percentual: x.lancamentos ? Math.round((x.conciliados / x.lancamentos) * 1000) / 10 : null })),
    totais: { ...tot, creditos: tot.creditos / 100, debitos: tot.debitos / 100, saldo: (tot.creditos - tot.debitos) / 100,
      percentual: tot.lancamentos ? Math.round((tot.conciliados / tot.lancamentos) * 1000) / 10 : null },
    categorias: [...cats.values()].map((c) => ({ ...c, total: c.total / 100 })).sort((a, b) => a.tipo.localeCompare(b.tipo) || b.total - a.total)
  });
}));

module.exports = router;
