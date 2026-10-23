'use strict';
/* =====================================================================
 *  /api/mensalidades   [módulo mensalidades]
 *
 *  GET    /?referencia=AAAA-MM&turmaId=&busca=   lista + resumo do filtro
 *  POST   /gerar                                 gera (ou simula) por período
 *  PUT    /:id                                   altera valor bruto / vencimento (pendente)
 *  POST   /:id/pagar                             registra a baixa
 *  POST   /:id/estornar                          desfaz a baixa
 *  POST   /:id/cancelar  ·  POST /:id/reativar
 *  DELETE /:id                                   exclui (não paga)
 *
 *  O desconto nunca é digitado: vem da bolsa vigente no vencimento
 *  (ver services/financeiro.js). Bolsa de 100% → mensalidade não é gerada.
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm, transacao } = require('../db');
const { exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade } = require('../utils/auditoria');
const { hojeSP, dataValida } = require('../utils/datas');
const f = require('../services/financeiro');
const baixas = require('../services/baixas');

router.use(exigirModulo('mensalidades'));

const REF = /^\d{4}-(0[1-9]|1[0-2])$/;

function lerData(valor, campo, { naoFutura = false } = {}) {
  const d = String(valor || '');
  if (!dataValida(d)) throw new HttpErro(400, `${campo} inválida`, 'validacao');
  if (naoFutura && d > hojeSP()) throw new HttpErro(400, `${campo} não pode ser futura`, 'validacao');
  return d;
}

async function buscarMensalidade(conn, colegioId, id) {
  const [[m]] = await conn.query(
    `SELECT m.*, a.nome AS aluno FROM mensalidades m JOIN alunos a ON a.id = m.aluno_id
      WHERE m.id = ? AND m.colegio_id = ? FOR UPDATE`,
    [id, colegioId]
  );
  if (!m) throw new HttpErro(404, 'Mensalidade não encontrada', 'nao_encontrado');
  return m;
}

/* ---------------- Listar ---------------- */
router.get('/', assincrono(async (req, res) => {
  const cond = ['m.colegio_id = ?'];
  const params = [req.colegioId];
  if (req.query.referencia) {
    if (!REF.test(req.query.referencia)) throw new HttpErro(400, 'Referência inválida', 'validacao');
    cond.push('m.referencia = ?'); params.push(req.query.referencia);
  }
  if (req.query.turmaId) { cond.push('a.turma_id = ?'); params.push(v.id(req.query.turmaId)); }
  const busca = v.texto(req.query.busca, 'Busca', { max: 100 });
  if (busca) {
    const termo = `%${busca.replace(/[%_\\]/g, '\\$&')}%`;
    cond.push('(a.nome LIKE ? OR a.ra LIKE ? OR a.resp_nome LIKE ?)'); params.push(termo, termo, termo);
  }

  const [linhas, refs] = await Promise.all([
    query(
      `SELECT m.id, m.aluno_id, m.referencia, m.vencimento, m.valor_bruto, m.desconto, m.valor, m.valor_pago,
              m.status, m.data_pagamento, m.forma_pagamento, m.obs_pagamento,
              a.nome AS aluno, a.ra, a.resp_nome, a.resp_telefone, t.nome AS turma,
              b.tipo AS bolsa_tipo, b.percentual AS bolsa_pct
         FROM mensalidades m
         JOIN alunos a ON a.id = m.aluno_id
         LEFT JOIN turmas t ON t.id = a.turma_id
         LEFT JOIN bolsas b ON b.id = m.bolsa_id
        WHERE ${cond.join(' AND ')}
        ORDER BY m.vencimento DESC, a.nome
        LIMIT 5000`,
      params
    ),
    query('SELECT DISTINCT referencia FROM mensalidades WHERE colegio_id = ? ORDER BY referencia DESC', [req.colegioId])
  ]);

  const hoje = hojeSP();
  const resumo = { recebido: 0, aReceber: 0, emAtraso: 0, descontos: 0, inadimplentes: 0, quantidade: {} };
  const devedores = new Set();
  const itens = linhas.map((m) => {
    const sit = f.situacaoMensalidade(m, hoje);
    resumo.quantidade[sit] = (resumo.quantidade[sit] || 0) + 1;
    if (sit === 'paga') resumo.recebido += f.centavos(m.valor_pago ?? m.valor);
    if (sit === 'pendente') resumo.aReceber += f.centavos(m.valor);
    if (sit === 'vencida') { resumo.emAtraso += f.centavos(m.valor); devedores.add(m.aluno_id); }
    if (sit !== 'cancelada') resumo.descontos += f.centavos(m.desconto);
    return {
      id: m.id,
      alunoId: m.aluno_id,
      aluno: m.aluno,
      ra: m.ra,
      turma: m.turma,
      respNome: m.resp_nome,
      respTelefone: m.resp_telefone,
      referencia: m.referencia,
      vencimento: m.vencimento,
      valorBruto: m.valor_bruto,
      desconto: m.desconto,
      valor: m.valor,
      bolsa: m.bolsa_tipo ? { tipo: m.bolsa_tipo, percentual: m.bolsa_pct } : null,
      situacao: sit,
      diasAtraso: sit === 'vencida' ? f.diasEntre(m.vencimento, hoje) : 0,
      dataPagamento: m.data_pagamento,
      valorPago: m.valor_pago,
      formaPagamento: m.forma_pagamento,
      obsPagamento: m.obs_pagamento
    };
  });
  ['recebido', 'aReceber', 'emAtraso', 'descontos'].forEach((k) => { resumo[k] /= 100; });
  resumo.inadimplentes = devedores.size;

  res.json({ resumo, referencias: refs.map((r) => r.referencia), formas: f.FORMAS_PAGAMENTO, itens });
}));

/* ---------------- Gerar ---------------- */
router.post('/gerar', assincrono(async (req, res) => {
  const b = req.body;
  const ano = v.inteiro(b.ano, 'Ano', { min: 2000, max: 2100, obrigatorio: true });
  const mesIni = v.inteiro(b.mesInicial, 'Mês inicial', { min: 1, max: 12, obrigatorio: true });
  const mesFim = v.inteiro(b.mesFinal, 'Mês final', { min: 1, max: 12, obrigatorio: true });
  if (mesFim < mesIni) throw new HttpErro(400, 'O mês final não pode ser anterior ao inicial', 'validacao');
  const dia = v.inteiro(b.diaVencimento, 'Dia de vencimento', { min: 1, max: 28, obrigatorio: true });
  const valorBase = v.decimal(b.valor, 'Valor da mensalidade', { min: 0.01, max: 99999, obrigatorio: true });
  const escopo = v.umDe(b.escopo || 'todos', ['todos', 'turma', 'aluno'], 'Para quem');

  let alunos;
  if (escopo === 'aluno') {
    const id = v.inteiro(b.alunoId, 'Aluno', { min: 1, obrigatorio: true });
    alunos = await query("SELECT id, nome FROM alunos WHERE id = ? AND colegio_id = ? AND status = 'ativo'", [id, req.colegioId]);
    if (!alunos.length) throw new HttpErro(400, 'Aluno não encontrado ou não está ativo', 'validacao');
  } else if (escopo === 'turma') {
    const turmaId = v.inteiro(b.turmaId, 'Turma', { min: 1, obrigatorio: true });
    const t = await queryUm('SELECT id FROM turmas WHERE id = ? AND colegio_id = ?', [turmaId, req.colegioId]);
    if (!t) throw new HttpErro(400, 'Turma inválida', 'validacao');
    alunos = await query("SELECT id, nome FROM alunos WHERE turma_id = ? AND colegio_id = ? AND status = 'ativo'", [turmaId, req.colegioId]);
  } else {
    alunos = await query("SELECT id, nome FROM alunos WHERE colegio_id = ? AND status = 'ativo'", [req.colegioId]);
  }
  if (!alunos.length) throw new HttpErro(400, 'Nenhum aluno ativo para gerar mensalidades', 'validacao');

  const ids = alunos.map((a) => a.id);
  const refs = [];
  for (let mes = mesIni; mes <= mesFim; mes++) refs.push(`${ano}-${String(mes).padStart(2, '0')}`);

  const [bolsas, existentes] = await Promise.all([
    query('SELECT id, aluno_id, percentual, vigencia_inicio, vigencia_fim, ativo FROM bolsas WHERE colegio_id = ? AND aluno_id IN (?)', [req.colegioId, ids]),
    query('SELECT aluno_id, referencia FROM mensalidades WHERE colegio_id = ? AND aluno_id IN (?) AND referencia IN (?)', [req.colegioId, ids, refs])
  ]);
  const jaTem = new Set(existentes.map((e) => `${e.aluno_id}:${e.referencia}`));
  const bolsasPorAluno = new Map();
  bolsas.forEach((x) => { if (!bolsasPorAluno.has(x.aluno_id)) bolsasPorAluno.set(x.aluno_id, []); bolsasPorAluno.get(x.aluno_id).push(x); });

  const novas = [];
  const r = { alunos: alunos.length, meses: refs.length, geradas: 0, jaExistiam: 0, isentas: 0, comDesconto: 0, valorBruto: 0, descontos: 0, total: 0 };
  alunos.forEach((a) => {
    refs.forEach((ref) => {
      if (jaTem.has(`${a.id}:${ref}`)) { r.jaExistiam += 1; return; }
      const venc = `${ref}-${String(dia).padStart(2, '0')}`;
      const bolsa = f.bolsaVigente(bolsasPorAluno.get(a.id) || [], venc);
      const val = f.calcularValores(valorBase, bolsa ? bolsa.percentual : 0);
      if (val.valor === 0) { r.isentas += 1; return; }
      if (val.desconto > 0) r.comDesconto += 1;
      r.geradas += 1;
      r.valorBruto += f.centavos(valorBase);
      r.descontos += f.centavos(val.desconto);
      r.total += f.centavos(val.valor);
      novas.push([req.colegioId, a.id, ref, venc, valorBase, val.desconto, val.valor, bolsa ? bolsa.id : null]);
    });
  });
  ['valorBruto', 'descontos', 'total'].forEach((k) => { r[k] /= 100; });

  if (b.simular || !novas.length) return res.json({ ...r, simulacao: !!b.simular });

  await transacao(async (conn) => {
    for (let i = 0; i < novas.length; i += 500) {
      await conn.query(
        'INSERT INTO mensalidades (colegio_id, aluno_id, referencia, vencimento, valor_bruto, desconto, valor, bolsa_id) VALUES ?',
        [novas.slice(i, i + 500)]
      );
    }
  }).catch((e) => {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpErro(409, 'Algumas mensalidades foram geradas por outra pessoa agora mesmo. Atualize a tela e tente de novo.', 'duplicado');
    throw e;
  });

  const periodo = refs.length === 1 ? f.nomeReferencia(refs[0]) : `${f.nomeReferencia(refs[0])} a ${f.nomeReferencia(refs[refs.length - 1])}`;
  await atividade(req.colegioId, req.usuario.id, `${r.geradas} mensalidade(s) gerada(s) · ${periodo}`);
  res.status(201).json({ ...r, simulacao: false });
}));

/* ---------------- Alterar valor / vencimento ---------------- */
router.put('/:id', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const valorBruto = v.decimal(req.body.valorBruto, 'Valor', { min: 0.01, max: 99999, obrigatorio: true });
  const venc = lerData(req.body.vencimento, 'Data de vencimento');

  const r = await transacao(async (conn) => {
    const m = await buscarMensalidade(conn, req.colegioId, id);
    if (m.status !== 'pendente') throw new HttpErro(409, 'Só é possível alterar mensalidade pendente', 'status');
    const [bolsas] = await conn.query(
      'SELECT id, percentual, vigencia_inicio, vigencia_fim, ativo FROM bolsas WHERE colegio_id = ? AND aluno_id = ?',
      [req.colegioId, m.aluno_id]
    );
    const bolsa = f.bolsaVigente(bolsas, venc);
    const val = f.calcularValores(valorBruto, bolsa ? bolsa.percentual : 0);
    await conn.query(
      'UPDATE mensalidades SET valor_bruto = ?, vencimento = ?, desconto = ?, valor = ?, bolsa_id = ? WHERE id = ?',
      [valorBruto, venc, val.desconto, val.valor, bolsa ? bolsa.id : null, id]
    );
    return { ...m, ...val };
  });
  await atividade(req.colegioId, req.usuario.id, `Mensalidade alterada: ${r.aluno} · ${f.nomeReferencia(r.referencia)}`);
  res.json({ id, desconto: r.desconto, valor: r.valor });
}));

/* ---------------- Baixa ---------------- */
router.post('/:id/pagar', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const data = lerData(req.body.dataPagamento || hojeSP(), 'Data do pagamento', { naoFutura: true });
  const forma = v.umDe(req.body.formaPagamento || 'PIX', f.FORMAS_PAGAMENTO, 'Forma de pagamento');
  const obs = v.texto(req.body.obs, 'Observação', { max: 200 });

  const r = await transacao(async (conn) => {
    const m = await buscarMensalidade(conn, req.colegioId, id);
    if (m.status !== 'pendente') throw new HttpErro(409, 'Esta mensalidade não está pendente', 'status');
    if (Number(m.valor) === 0) throw new HttpErro(409, 'Mensalidade isenta (bolsa de 100%) — não há o que receber', 'status');
    const valorPago = req.body.valorPago === undefined || req.body.valorPago === null || req.body.valorPago === ''
      ? m.valor : v.decimal(req.body.valorPago, 'Valor recebido', { min: 0.01, max: 99999 });
    await baixas.baixarMensalidade(conn, m, { data, valorPago, forma, obs });
    return { ...m, valorPago };
  });
  await atividade(req.colegioId, req.usuario.id,
    `Mensalidade recebida: ${r.aluno} · ${f.nomeReferencia(r.referencia)} · R$ ${Number(r.valorPago).toFixed(2).replace('.', ',')} (${forma})`);
  res.json({ id, status: 'pago' });
}));

router.post('/:id/estornar', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const r = await transacao(async (conn) => {
    const m = await buscarMensalidade(conn, req.colegioId, id);
    if (m.status !== 'pago') throw new HttpErro(409, 'Esta mensalidade não está paga', 'status');
    if (await baixas.conciliacoes(conn, 'mensalidade', id)) {
      throw new HttpErro(409, 'Este pagamento está conciliado com o extrato bancário. Desfaça a conciliação antes de estornar.', 'conciliado');
    }
    await baixas.estornarMensalidade(conn, req.colegioId, m);
    return m;
  });
  await atividade(req.colegioId, req.usuario.id, `Pagamento estornado: ${r.aluno} · ${f.nomeReferencia(r.referencia)}`);
  res.json({ id, status: 'pendente' });
}));

/* ---------------- Cancelar / reativar / excluir ---------------- */
router.post('/:id/cancelar', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const r = await transacao(async (conn) => {
    const m = await buscarMensalidade(conn, req.colegioId, id);
    if (m.status !== 'pendente') throw new HttpErro(409, 'Só é possível cancelar mensalidade pendente', 'status');
    await conn.query("UPDATE mensalidades SET status = 'cancelado' WHERE id = ?", [id]);
    return m;
  });
  await atividade(req.colegioId, req.usuario.id, `Mensalidade cancelada: ${r.aluno} · ${f.nomeReferencia(r.referencia)}`);
  res.json({ id, status: 'cancelado' });
}));

router.post('/:id/reativar', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const r = await transacao(async (conn) => {
    const m = await buscarMensalidade(conn, req.colegioId, id);
    if (m.status !== 'cancelado') throw new HttpErro(409, 'Esta mensalidade não está cancelada', 'status');
    await conn.query("UPDATE mensalidades SET status = 'pendente' WHERE id = ?", [id]);
    await f.recalcularPendentes(conn, req.colegioId, m.aluno_id);
    return m;
  });
  await atividade(req.colegioId, req.usuario.id, `Mensalidade reativada: ${r.aluno} · ${f.nomeReferencia(r.referencia)}`);
  res.json({ id, status: 'pendente' });
}));

router.delete('/:id', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const r = await transacao(async (conn) => {
    const m = await buscarMensalidade(conn, req.colegioId, id);
    if (m.status === 'pago') throw new HttpErro(409, 'Mensalidade paga não pode ser excluída. Estorne o pagamento antes, se for o caso.', 'status');
    await conn.query('DELETE FROM mensalidades WHERE id = ?', [id]);
    return m;
  });
  await atividade(req.colegioId, req.usuario.id, `Mensalidade excluída: ${r.aluno} · ${f.nomeReferencia(r.referencia)}`);
  res.status(204).end();
}));

module.exports = router;
