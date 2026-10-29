'use strict';
/* =====================================================================
 *  Categorias das contas a pagar — cada colégio tem a sua lista.
 *
 *  · A lista nasce sozinha no primeiro uso: as categorias padrão mais as
 *    que o colégio já usava nas contas.
 *  · Renomear muda também as contas que já usavam o nome antigo (os
 *    relatórios, o fluxo de caixa e o painel continuam somando juntos).
 *  · Excluir só sem nenhuma conta usando. "Outros" é fixa: é a categoria
 *    de quem não escolhe nenhuma.
 *  · Nomes iguais sem diferença de acento ou maiúscula ("agua" = "Água")
 *    são a mesma categoria (collation do banco).
 * ===================================================================== */
const { query, queryUm, transacao } = require('../db');
const { HttpErro } = require('../middleware/erros');
const v = require('../utils/validar');
const { CATEGORIAS_CONTAS } = require('./financeiro');

const FIXA = 'Outros';

/** query no pool (devolve as linhas) ou numa transação já aberta. */
async function q(conn, sql, params) {
  if (!conn) return query(sql, params);
  const [linhas] = await conn.query(sql, params);
  return linhas;
}

/** Cria a lista do colégio na primeira vez (padrão + as já usadas nas contas). */
async function garantir(colegioId) {
  const r = await queryUm('SELECT COUNT(*) AS n FROM categorias_contas WHERE colegio_id = ?', [colegioId]);
  if (r && Number(r.n)) return;
  const usadas = await query('SELECT DISTINCT categoria FROM contas_pagar WHERE colegio_id = ? AND categoria IS NOT NULL AND categoria <> ?', [colegioId, '']);
  const nomes = [...new Set([...CATEGORIAS_CONTAS, ...usadas.map((u) => u.categoria)])];
  await query('INSERT IGNORE INTO categorias_contas (colegio_id, nome) VALUES ?', [nomes.map((n) => [colegioId, n])]);
}

const ordenar = (a, b) => (a.nome === FIXA) - (b.nome === FIXA) || a.nome.localeCompare(b.nome, 'pt-BR');

/** Lista com quantas contas usam cada categoria. */
async function listar(colegioId) {
  await garantir(colegioId);
  const linhas = await query(
    `SELECT c.id, c.nome,
            (SELECT COUNT(*) FROM contas_pagar p WHERE p.colegio_id = c.colegio_id AND p.categoria = c.nome) AS contas
       FROM categorias_contas c WHERE c.colegio_id = ?`, [colegioId]);
  return linhas.map((c) => ({ id: c.id, nome: c.nome, contas: Number(c.contas), fixa: c.nome === FIXA })).sort(ordenar);
}

/** Só os nomes, em ordem ("Outros" no fim). */
async function nomes(colegioId) {
  return (await listar(colegioId)).map((c) => c.nome);
}

/**
 * Confere a categoria de uma conta e devolve o nome como está cadastrado.
 * Vazia = "Outros". atual: a categoria que a conta já tinha (sempre aceita).
 */
async function validar(colegioId, nome, { atual = null, conn = null } = {}) {
  const n = v.texto(nome, 'Categoria', { max: 40 }) || FIXA;
  if (atual && n === atual) return n;
  await garantir(colegioId);
  const [achou] = await q(conn, 'SELECT nome FROM categorias_contas WHERE colegio_id = ? AND nome = ?', [colegioId, n]);
  if (!achou) throw new HttpErro(400, `Categoria "${n}" não cadastrada. Cadastre em Contas a Pagar › Categorias.`, 'categoria');
  return achou.nome;
}

const lerNome = (nome) => v.texto(nome, 'Nome da categoria', { min: 2, max: 40, obrigatorio: true });

async function buscar(conn, colegioId, id) {
  const [c] = await q(conn, 'SELECT id, nome FROM categorias_contas WHERE id = ? AND colegio_id = ?', [id, colegioId]);
  if (!c) throw new HttpErro(404, 'Categoria não encontrada', 'nao_encontrado');
  return c;
}

async function conflito(conn, colegioId, nome, id = 0) {
  const [outra] = await q(conn, 'SELECT nome FROM categorias_contas WHERE colegio_id = ? AND nome = ? AND id <> ?', [colegioId, nome, id]);
  if (outra) throw new HttpErro(409, `Já existe a categoria "${outra.nome}"`, 'duplicado');
}

async function criar(colegioId, nomeBruto) {
  const nome = lerNome(nomeBruto);
  await garantir(colegioId);
  await conflito(null, colegioId, nome);
  const r = await query('INSERT INTO categorias_contas (colegio_id, nome) VALUES (?, ?)', [colegioId, nome]);
  return { id: r.insertId, nome, contas: 0, fixa: false };
}

/** Renomeia e leva junto as contas que usavam o nome antigo. */
async function renomear(colegioId, id, nomeBruto) {
  const nome = lerNome(nomeBruto);
  return transacao(async (conn) => {
    const c = await buscar(conn, colegioId, id);
    if (c.nome === FIXA) throw new HttpErro(409, `A categoria "${FIXA}" é fixa: é a usada quando nenhuma é escolhida`, 'fixa');
    if (nome === FIXA) throw new HttpErro(409, `"${FIXA}" já existe e é fixa`, 'duplicado');
    await conflito(conn, colegioId, nome, id);
    await conn.query('UPDATE categorias_contas SET nome = ? WHERE id = ?', [nome, id]);
    const [up] = await conn.query('UPDATE contas_pagar SET categoria = ? WHERE colegio_id = ? AND categoria = ?', [nome, colegioId, c.nome]);
    return { id, antes: c.nome, nome, contas: up.affectedRows || 0 };
  });
}

/** Exclui se nenhuma conta usa. */
async function excluir(colegioId, id) {
  return transacao(async (conn) => {
    const c = await buscar(conn, colegioId, id);
    if (c.nome === FIXA) throw new HttpErro(409, `A categoria "${FIXA}" é fixa e não pode ser excluída`, 'fixa');
    const [[u]] = await conn.query('SELECT COUNT(*) AS n FROM contas_pagar WHERE colegio_id = ? AND categoria = ?', [colegioId, c.nome]);
    const n = Number(u.n);
    if (n) throw new HttpErro(409, `"${c.nome}" está em ${n} conta(s). Para tirá-la da lista, mude a categoria dessas contas ou renomeie a categoria.`, 'em_uso');
    await conn.query('DELETE FROM categorias_contas WHERE id = ?', [id]);
    return c;
  });
}

module.exports = { FIXA, garantir, listar, nomes, validar, criar, renomear, excluir };
