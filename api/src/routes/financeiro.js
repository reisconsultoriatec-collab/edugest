'use strict';
/* =====================================================================
 *  /api/financeiro/alunos — lista enxuta de alunos para os módulos
 *  financeiros (escolher aluno numa bolsa, mensalidade avulsa, carnê ou
 *  declaração), sem expor os dados pessoais do cadastro completo.
 *  ?todos=1 inclui inativos e transferidos (declaração de quem saiu).
 * ===================================================================== */
const router = require('express').Router();
const { query } = require('../db');
const { exigirAlgumModulo } = require('../middleware/auth');
const { assincrono } = require('../middleware/erros');

router.get('/alunos', exigirAlgumModulo(['mensalidades', 'bolsas']), assincrono(async (req, res) => {
  const todos = req.query.todos === '1';
  const linhas = await query(
    `SELECT a.id, a.nome, a.ra, a.status, a.resp_nome, a.resp_telefone, t.nome AS turma
       FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id
      WHERE a.colegio_id = ? ${todos ? '' : "AND a.status = 'ativo'"}
      ORDER BY a.nome`,
    [req.colegioId]
  );
  res.json(linhas.map((a) => ({
    id: a.id, nome: a.nome, ra: a.ra, turma: a.turma, status: a.status, respNome: a.resp_nome, respTelefone: a.resp_telefone
  })));
}));

module.exports = router;
