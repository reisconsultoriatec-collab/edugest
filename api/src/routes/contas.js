'use strict';
/* =====================================================================
 *  /api/contas — Contas a pagar   [módulo contas]
 *
 *  GET    /?mes=AAAA-MM&categoria=&busca=   lista + resumo do filtro
 *  POST   /                                 cria
 *  PUT    /:id                              edita
 *  POST   /:id/pagar                        registra o pagamento; se a conta
 *                                           é recorrente, cria a próxima
 *  POST   /:id/estornar                     desfaz o pagamento
 *  DELETE /:id                              exclui
 *
 *  Categorias (cada colégio tem a sua lista):
 *  GET    /categorias        lista com quantas contas usam cada uma
 *  POST   /categorias        { nome } cria
 *  PUT    /categorias/:id    { nome } renomeia (as contas vão junto)
 *  DELETE /categorias/:id    exclui (só sem contas; "Outros" é fixa)
 * ===================================================================== */
const router = require('express').Router();
const { query, transacao } = require('../db');
const { exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade } = require('../utils/auditoria');
const { hojeSP, dataValida } = require('../utils/datas');
const f = require('../services/financeiro');
const baixas = require('../services/baixas');
const categorias = require('../services/categoriasContas');

router.use(exigirModulo('contas'));

function lerData(valor, campo, { naoFutura = false } = {}) {
  const d = String(valor || '');
  if (!dataValida(d)) throw new HttpErro(400, `${campo} inválida`, 'validacao');
  if (naoFutura && d > hojeSP()) throw new HttpErro(400, `${campo} não pode ser futura`, 'validacao');
  return d;
}

/** atual: a categoria que a conta já tinha (editar sem trocar a categoria sempre vale). */
async function lerConta(colegioId, b, atual = null) {
  return {
    descricao: v.texto(b.descricao, 'Descrição', { max: 150, min: 3, obrigatorio: true }),
    categoria: await categorias.validar(colegioId, b.categoria, { atual }),
    fornecedor: v.texto(b.fornecedor, 'Fornecedor', { max: 100 }),
    valor: v.decimal(b.valor, 'Valor', { min: 0.01, max: 99999999, obrigatorio: true }),
    vencimento: lerData(b.vencimento, 'Data de vencimento'),
    recorrencia: v.umDe(b.recorrencia || 'nenhuma', Object.keys(f.RECORRENCIAS), 'Recorrência'),
    obs: v.texto(b.obs, 'Observações', { max: 500 })
  };
}

async function buscarConta(conn, colegioId, id) {
  const [[c]] = await conn.query('SELECT * FROM contas_pagar WHERE id = ? AND colegio_id = ? FOR UPDATE', [id, colegioId]);
  if (!c) throw new HttpErro(404, 'Conta não encontrada', 'nao_encontrado');
  return c;
}

/* ---------------- Categorias ---------------- */
router.get('/categorias', assincrono(async (req, res) => {
  res.json({ categorias: await categorias.listar(req.colegioId) });
}));

router.post('/categorias', assincrono(async (req, res) => {
  const c = await categorias.criar(req.colegioId, (req.body || {}).nome);
  await atividade(req.colegioId, req.usuario.id, `Categoria de contas criada: ${c.nome}`);
  res.status(201).json(c);
}));

router.put('/categorias/:id', assincrono(async (req, res) => {
  const r = await categorias.renomear(req.colegioId, v.id(req.params.id), (req.body || {}).nome);
  if (r.antes !== r.nome) {
    await atividade(req.colegioId, req.usuario.id, `Categoria de contas renomeada: ${r.antes} → ${r.nome}${r.contas ? ` (${r.contas} conta(s))` : ''}`);
  }
  res.json(r);
}));

router.delete('/categorias/:id', assincrono(async (req, res) => {
  const c = await categorias.excluir(req.colegioId, v.id(req.params.id));
  await atividade(req.colegioId, req.usuario.id, `Categoria de contas excluída: ${c.nome}`);
  res.status(204).end();
}));

/* ---------------- Listar ---------------- */
router.get('/', assincrono(async (req, res) => {
  const cond = ['colegio_id = ?'];
  const params = [req.colegioId];
  if (req.query.mes) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.mes)) throw new HttpErro(400, 'Mês inválido', 'validacao');
    cond.push("DATE_FORMAT(vencimento, '%Y-%m') = ?"); params.push(req.query.mes);
  }
  const categoria = v.texto(req.query.categoria, 'Categoria', { max: 40 });
  if (categoria) { cond.push('categoria = ?'); params.push(categoria); }
  const busca = v.texto(req.query.busca, 'Busca', { max: 100 });
  if (busca) {
    const termo = `%${busca.replace(/[%_\\]/g, '\\$&')}%`;
    cond.push('(descricao LIKE ? OR fornecedor LIKE ?)'); params.push(termo, termo);
  }

  const [linhas, cats] = await Promise.all([
    query(`SELECT * FROM contas_pagar WHERE ${cond.join(' AND ')} ORDER BY vencimento, descricao LIMIT 3000`, params),
    categorias.nomes(req.colegioId)
  ]);
  const hoje = hojeSP();
  const resumo = { aPagar: 0, vencidas: 0, pagas: 0, quantidade: {} };
  const itens = linhas.map((c) => {
    const sit = f.situacaoConta(c, hoje);
    resumo.quantidade[sit] = (resumo.quantidade[sit] || 0) + 1;
    if (sit === 'a_vencer') resumo.aPagar += f.centavos(c.valor);
    if (sit === 'vencida') resumo.vencidas += f.centavos(c.valor);
    if (sit === 'paga') resumo.pagas += f.centavos(c.valor);
    return {
      id: c.id,
      descricao: c.descricao,
      categoria: c.categoria,
      fornecedor: c.fornecedor,
      valor: c.valor,
      vencimento: c.vencimento,
      recorrencia: c.recorrencia,
      situacao: sit,
      diasAtraso: sit === 'vencida' ? f.diasEntre(c.vencimento, hoje) : 0,
      dataPagamento: c.data_pagamento,
      obs: c.obs
    };
  });
  ['aPagar', 'vencidas', 'pagas'].forEach((k) => { resumo[k] /= 100; });
  res.json({ resumo, categorias: cats, itens });
}));

/* ---------------- Criar / editar ---------------- */
router.post('/', assincrono(async (req, res) => {
  const c = await lerConta(req.colegioId, req.body);
  const r = await query(
    `INSERT INTO contas_pagar (colegio_id, descricao, categoria, fornecedor, valor, vencimento, recorrencia, obs)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.colegioId, c.descricao, c.categoria, c.fornecedor, c.valor, c.vencimento, c.recorrencia, c.obs]
  );
  await atividade(req.colegioId, req.usuario.id, `Conta a pagar cadastrada: ${c.descricao}`);
  res.status(201).json({ id: r.insertId });
}));

router.put('/:id', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const [antes] = await query('SELECT categoria FROM contas_pagar WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  const c = await lerConta(req.colegioId, req.body, antes ? antes.categoria : null);
  await transacao(async (conn) => {
    await buscarConta(conn, req.colegioId, id);
    await conn.query(
      `UPDATE contas_pagar SET descricao = ?, categoria = ?, fornecedor = ?, valor = ?, vencimento = ?, recorrencia = ?, obs = ?
        WHERE id = ?`,
      [c.descricao, c.categoria, c.fornecedor, c.valor, c.vencimento, c.recorrencia, c.obs, id]
    );
  });
  await atividade(req.colegioId, req.usuario.id, `Conta a pagar alterada: ${c.descricao}`);
  res.json({ id });
}));

/* ---------------- Pagar / estornar ---------------- */
router.post('/:id/pagar', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const data = lerData(req.body.dataPagamento || hojeSP(), 'Data do pagamento', { naoFutura: true });

  const r = await transacao(async (conn) => {
    const c = await buscarConta(conn, req.colegioId, id);
    if (c.status !== 'pendente') throw new HttpErro(409, 'Esta conta não está pendente', 'status');
    // Conta recorrente: já deixa a próxima lançada (se ainda não existir)
    const proxima = await baixas.pagarConta(conn, req.colegioId, c, data);
    return { ...c, proxima };
  });
  await atividade(req.colegioId, req.usuario.id, `Conta paga: ${r.descricao} · R$ ${Number(r.valor).toFixed(2).replace('.', ',')}`);
  res.json({ id, status: 'pago', proxima: r.proxima });
}));

router.post('/:id/estornar', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const r = await transacao(async (conn) => {
    const c = await buscarConta(conn, req.colegioId, id);
    if (c.status !== 'pago') throw new HttpErro(409, 'Esta conta não está paga', 'status');
    if (await baixas.conciliacoes(conn, 'conta', id)) {
      throw new HttpErro(409, 'Este pagamento está conciliado com o extrato bancário. Desfaça a conciliação antes de estornar.', 'conciliado');
    }
    await baixas.estornarConta(conn, c);
    return c;
  });
  await atividade(req.colegioId, req.usuario.id, `Pagamento de conta estornado: ${r.descricao}`);
  res.json({ id, status: 'pendente' });
}));

/* ---------------- Excluir ---------------- */
router.delete('/:id', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const r = await transacao(async (conn) => {
    const c = await buscarConta(conn, req.colegioId, id);
    if (await baixas.conciliacoes(conn, 'conta', id)) {
      throw new HttpErro(409, 'Esta conta está conciliada com o extrato bancário. Desfaça a conciliação antes de excluir.', 'conciliado');
    }
    await conn.query('DELETE FROM contas_pagar WHERE id = ?', [id]);
    return c;
  });
  await atividade(req.colegioId, req.usuario.id, `Conta a pagar excluída: ${r.descricao}`);
  res.status(204).end();
}));

module.exports = router;
