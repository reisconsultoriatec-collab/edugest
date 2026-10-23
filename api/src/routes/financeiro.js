'use strict';
/* =====================================================================
 *  /api/financeiro/alunos — lista enxuta de alunos para os módulos
 *  financeiros (escolher aluno numa bolsa ou mensalidade avulsa), sem
 *  expor os dados pessoais do cadastro completo.
 * ===================================================================== */
const router = require('express').Router();
const { query } = require('../db');
const { exigirAlgumModulo } = require('../middleware/auth');
const { assincrono } = require('../middleware/erros');

router.get('/alunos', exigirAlgumModulo(['mensalidades', 'bolsas']), assincrono(async (req, res) => {
  const linhas = await query(
    `SELECT a.id, a.nome, a.ra, a.status, t.nome AS turma
       FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id
      WHERE a.colegio_id = ? AND a.status = 'ativo'
      ORDER BY a.nome`,
    [req.colegioId]
  );
  res.json(linhas.map((a) => ({ id: a.id, nome: a.nome, ra: a.ra, turma: a.turma })));
}));

module.exports = router;
