'use strict';
/* =====================================================================
 *  /api/boletim — Boletim escolar   [módulo boletim]
 *
 *  GET /alunos?turmaId=          alunos da turma (atuais, com notas nela ou que saíram dela na virada do ano)
 *  GET /:alunoId?turmaId=        boletim do aluno naquela turma
 *
 *  Regras em services/boletim.js (as mesmas do portal do responsável).
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm } = require('../db');
const { montarBoletim } = require('../services/boletim');
const { exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { escopo, exigirTurma, buscarTurma } = require('../services/escopo');

router.use(exigirModulo('boletim'));

async function turmaPermitida(req, turmaId) {
  const esc = await escopo(req);
  const turma = await buscarTurma(req.colegioId, turmaId);
  exigirTurma(esc, turmaId);
  return turma;
}

router.get('/alunos', assincrono(async (req, res) => {
  const turma = await turmaPermitida(req, v.id(req.query.turmaId));
  const alunos = await query(
    `SELECT a.id, a.nome, a.ra, a.status
       FROM alunos a
      WHERE a.colegio_id = ?
        AND (a.turma_id = ? OR EXISTS (SELECT 1 FROM notas n WHERE n.aluno_id = a.id AND n.turma_id = ?)
             OR EXISTS (SELECT 1 FROM virada_alunos va JOIN viradas vv ON vv.id = va.virada_id
                         WHERE va.aluno_id = a.id AND va.turma_origem_id = ? AND vv.desfeita_em IS NULL))
      ORDER BY a.nome`,
    [req.colegioId, turma.id, turma.id, turma.id]
  );
  res.json(alunos.map((a) => ({ id: a.id, nome: a.nome, ra: a.ra, status: a.status })));
}));

router.get('/:alunoId', assincrono(async (req, res) => {
  const alunoId = v.id(req.params.alunoId);
  const aluno = await queryUm(
    `SELECT id, nome, ra, nascimento, status, turma_id, resp_nome, resp_telefone
       FROM alunos WHERE id = ? AND colegio_id = ?`,
    [alunoId, req.colegioId]
  );
  if (!aluno) throw new HttpErro(404, 'Aluno não encontrado', 'nao_encontrado');
  const turmaId = req.query.turmaId ? v.id(req.query.turmaId) : aluno.turma_id;
  if (!turmaId) throw new HttpErro(400, 'O aluno não está em nenhuma turma', 'sem_turma');
  const turma = await turmaPermitida(req, turmaId);

  res.json(await montarBoletim(req.colegioId, aluno, turma));
}));

module.exports = router;
