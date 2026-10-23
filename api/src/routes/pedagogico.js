'use strict';
/* =====================================================================
 *  /api/pedagogico/opcoes — turmas e disciplinas que o usuário pode usar
 *  no Diário, Notas e Boletim (já aplicando o escopo do professor)
 *
 *  Resposta:
 *  { restrito, vinculado, mediaAprovacao, frequenciaMinima, anoLetivo,
 *    turmas: [{ id, nome, serie, anoLetivo, ativo, alunos,
 *               disciplinas: [{ id, nome, professor }] }] }
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm } = require('../db');
const { exigirAlgumModulo } = require('../middleware/auth');
const { assincrono } = require('../middleware/erros');
const { escopo } = require('../services/escopo');

router.get('/opcoes', exigirAlgumModulo(['diario', 'notas', 'boletim']), assincrono(async (req, res) => {
  const esc = await escopo(req);
  const cfg = await queryUm(
    'SELECT ano_letivo, media_aprovacao, frequencia_minima FROM config_colegio WHERE colegio_id = ?',
    [req.colegioId]
  );

  const [turmas, disciplinas, atrib] = await Promise.all([
    query(
      `SELECT t.id, t.nome, t.serie, t.ano_letivo, t.ativo,
              (SELECT COUNT(*) FROM alunos a WHERE a.turma_id = t.id AND a.status = 'ativo') AS alunos
         FROM turmas t WHERE t.colegio_id = ?
        ORDER BY t.ativo DESC, t.ano_letivo DESC, t.serie, t.nome`,
      [req.colegioId]
    ),
    query('SELECT id, nome FROM disciplinas WHERE colegio_id = ? AND ativo = 1 ORDER BY ordem, nome', [req.colegioId]),
    query(
      `SELECT at.turma_id, at.disciplina_id, p.nome AS professor
         FROM atribuicoes at JOIN professores p ON p.id = at.professor_id
        WHERE at.colegio_id = ?`,
      [req.colegioId]
    )
  ]);

  const profPorPar = new Map(atrib.map((a) => [`${a.turma_id}:${a.disciplina_id}`, a.professor]));

  const lista = turmas
    .filter((t) => !esc.restrito || esc.turmas.has(t.id))
    .map((t) => ({
      id: t.id,
      nome: t.nome,
      serie: t.serie,
      anoLetivo: t.ano_letivo,
      ativo: !!t.ativo,
      alunos: Number(t.alunos),
      disciplinas: disciplinas
        .filter((d) => !esc.restrito || esc.pares.has(`${t.id}:${d.id}`))
        .map((d) => ({ id: d.id, nome: d.nome, professor: profPorPar.get(`${t.id}:${d.id}`) || null }))
    }));

  res.json({
    restrito: esc.restrito,
    vinculado: esc.restrito ? esc.vinculado : true,
    anoLetivo: cfg ? cfg.ano_letivo : null,
    mediaAprovacao: cfg ? Number(cfg.media_aprovacao) : 6,
    frequenciaMinima: cfg ? Number(cfg.frequencia_minima) : 75,
    turmas: lista
  });
}));

module.exports = router;
