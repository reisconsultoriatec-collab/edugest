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
 * ===================================================================== */
const router = require('express').Router();
const { query, transacao } = require('../db');
const { exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade } = require('../utils/auditoria');
const { hojeSP, dataValida } = require('../utils/datas');
const f = require('../services/financeiro');

router.use(exigirModulo('contas'));

const CATEGORIAS = ['Aluguel', 'Água', 'Energia', 'Internet e telefone', 'Folha de pagamento', 'Encargos e impostos',
  'Material didático', 'Material de limpeza', 'Manutenção', 'Alimentação', 'Transporte', 'Marketing', 'Serviços', 'Outros'];

function lerData(valor, campo, { naoFutura = false } = {}) {
  const d = String(valor || '');
  if (!dataValida(d)) throw new HttpErro(400, `${campo} inválida`, 'validacao');
  if (naoFutura && d > hojeSP()) throw new HttpErro(400, `${campo} não pode ser futura`, 'validacao');
  return d;
}

function lerConta(b) {
  return {
    descricao: v.texto(b.descricao, 'Descrição', { max: 150, min: 3, obrigatorio: true }),
    categoria: v.texto(b.categoria, 'Categoria', { max: 40 }) || 'Outros',
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
    query('SELECT DISTINCT categoria FROM contas_pagar WHERE colegio_id = ? ORDER BY categoria', [req.colegioId])
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
  const categorias = [...new Set([...CATEGORIAS, ...cats.map((x) => x.categoria)])];
  res.json({ resumo, categorias, itens });
}));

/* ---------------- Criar / editar ---------------- */
router.post('/', assincrono(async (req, res) => {
  const c = lerConta(req.body);
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
  const c = lerConta(req.body);
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
    await conn.query("UPDATE contas_pagar SET status = 'pago', data_pagamento = ? WHERE id = ?", [data, id]);

    // Conta recorrente: já deixa a próxima lançada (se ainda não existir)
    let proxima = null;
    const meses = f.RECORRENCIAS[c.recorrencia] || 0;
    if (meses) {
      const venc = f.somarMeses(c.vencimento, meses);
      const [[existe]] = await conn.query(
        'SELECT id FROM contas_pagar WHERE colegio_id = ? AND descricao = ? AND vencimento = ? LIMIT 1',
        [req.colegioId, c.descricao, venc]
      );
      if (!existe) {
        await conn.query(
          `INSERT INTO contas_pagar (colegio_id, descricao, categoria, fornecedor, valor, vencimento, recorrencia, obs)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.colegioId, c.descricao, c.categoria, c.fornecedor, c.valor, venc, c.recorrencia, c.obs]
        );
        proxima = { vencimento: venc };
      }
    }
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
    const [[conc]] = await conn.query(
      "SELECT COUNT(*) AS n FROM lancamentos_bancarios WHERE conta_pagar_id = ? AND status = 'conciliado'", [id]
    );
    if (conc.n > 0) throw new HttpErro(409, 'Este pagamento está conciliado com o extrato bancário. Desfaça a conciliação antes de estornar.', 'conciliado');
    await conn.query("UPDATE contas_pagar SET status = 'pendente', data_pagamento = NULL WHERE id = ?", [id]);
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
    const [[conc]] = await conn.query(
      "SELECT COUNT(*) AS n FROM lancamentos_bancarios WHERE conta_pagar_id = ? AND status = 'conciliado'", [id]
    );
    if (conc.n > 0) throw new HttpErro(409, 'Esta conta está conciliada com o extrato bancário. Desfaça a conciliação antes de excluir.', 'conciliado');
    await conn.query('DELETE FROM contas_pagar WHERE id = ?', [id]);
    return c;
  });
  await atividade(req.colegioId, req.usuario.id, `Conta a pagar excluída: ${r.descricao}`);
  res.status(204).end();
}));

module.exports = router;
