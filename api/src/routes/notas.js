'use strict';
/* =====================================================================
 *  /api/notas — Lançamento de notas   [módulo notas]
 *
 *  GET /?turmaId=&disciplinaId=&bimestre=   alunos com N1, N2, Trabalho
 *  PUT /                                    grava a planilha do bimestre
 *
 *  Média do bimestre = média das notas lançadas (nota em branco não conta
 *  como zero), arredondada a 1 casa. A média de aprovação vem da
 *  configuração do colégio. Professor: só disciplinas atribuídas a ele.
 * ===================================================================== */
const router = require('express').Router();
const { query, transacao } = require('../db');
const { exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade } = require('../utils/auditoria');
const { escopo, exigirTurma, exigirDisciplina, buscarTurma, buscarDisciplina, mediaBimestre } = require('../services/escopo');

router.use(exigirModulo('notas'));

async function contexto(req, src) {
  const esc = await escopo(req);
  const turmaId = v.id(src.turmaId);
  const disciplinaId = v.inteiro(src.disciplinaId, 'Disciplina', { min: 1, obrigatorio: true });
  const bimestre = v.inteiro(src.bimestre, 'Bimestre', { min: 1, max: 4, obrigatorio: true });
  const turma = await buscarTurma(req.colegioId, turmaId);
  exigirTurma(esc, turmaId);
  const disciplina = await buscarDisciplina(req.colegioId, disciplinaId);
  exigirDisciplina(esc, turmaId, disciplinaId);
  return { turma, disciplina, bimestre };
}

const nota = (valor, campo) => v.decimal(valor, campo, { min: 0, max: 10, casas: 2 });

/* ---------------- Ler ---------------- */
router.get('/', assincrono(async (req, res) => {
  const { turma, disciplina, bimestre } = await contexto(req, req.query);
  const linhas = await query(
    `SELECT a.id, a.nome, a.ra, a.status, n.n1, n.n2, n.trabalho, n.atualizado_em, u.nome AS atualizado_por
       FROM alunos a
       LEFT JOIN notas n ON n.aluno_id = a.id AND n.turma_id = ? AND n.disciplina_id = ? AND n.bimestre = ?
       LEFT JOIN usuarios u ON u.id = n.atualizado_por
      WHERE a.colegio_id = ? AND ((a.turma_id = ? AND a.status = 'ativo') OR n.id IS NOT NULL)
      ORDER BY a.nome`,
    [turma.id, disciplina.id, bimestre, req.colegioId, turma.id]
  );
  const ultima = linhas.filter((l) => l.atualizado_em).sort((a, b) => (a.atualizado_em < b.atualizado_em ? 1 : -1))[0];
  res.json({
    turma: { id: turma.id, nome: turma.nome, anoLetivo: turma.ano_letivo },
    disciplina: { id: disciplina.id, nome: disciplina.nome },
    bimestre,
    ultimaAlteracao: ultima ? { por: ultima.atualizado_por, em: ultima.atualizado_em } : null,
    alunos: linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      ra: l.ra,
      status: l.status,
      n1: l.n1,
      n2: l.n2,
      trabalho: l.trabalho,
      media: mediaBimestre(l)
    }))
  });
}));

/* ---------------- Gravar ---------------- */
router.put('/', assincrono(async (req, res) => {
  const { turma, disciplina, bimestre } = await contexto(req, req.body);
  if (!Array.isArray(req.body.notas) || !req.body.notas.length) throw new HttpErro(400, 'Nenhuma nota enviada', 'validacao');
  if (req.body.notas.length > 500) throw new HttpErro(400, 'Planilha muito grande', 'validacao');

  const linhas = req.body.notas.map((n, i) => {
    const pos = `(linha ${i + 1})`;
    return {
      alunoId: v.id(n.alunoId),
      n1: nota(n.n1, `Nota 1 ${pos}`),
      n2: nota(n.n2, `Nota 2 ${pos}`),
      trabalho: nota(n.trabalho, `Trabalho ${pos}`)
    };
  });
  const ids = [...new Set(linhas.map((l) => l.alunoId))];
  if (ids.length !== linhas.length) throw new HttpErro(400, 'Aluno repetido na planilha', 'validacao');

  const totais = await transacao(async (conn) => {
    const [[ok]] = await conn.query(
      `SELECT COUNT(*) AS n FROM alunos a
        WHERE a.colegio_id = ? AND a.id IN (?)
          AND (a.turma_id = ? OR EXISTS (SELECT 1 FROM notas x WHERE x.aluno_id = a.id AND x.turma_id = ?))`,
      [req.colegioId, ids, turma.id, turma.id]
    );
    if (ok.n !== ids.length) throw new HttpErro(400, 'A planilha tem aluno que não é desta turma', 'validacao');

    const preenchidas = linhas.filter((l) => l.n1 !== null || l.n2 !== null || l.trabalho !== null);
    const vazias = linhas.filter((l) => l.n1 === null && l.n2 === null && l.trabalho === null);

    if (vazias.length) {
      await conn.query(
        'DELETE FROM notas WHERE turma_id = ? AND disciplina_id = ? AND bimestre = ? AND aluno_id IN (?)',
        [turma.id, disciplina.id, bimestre, vazias.map((l) => l.alunoId)]
      );
    }
    if (preenchidas.length) {
      await conn.query(
        `INSERT INTO notas (colegio_id, turma_id, aluno_id, disciplina_id, bimestre, n1, n2, trabalho, atualizado_por)
         VALUES ? AS novo
         ON DUPLICATE KEY UPDATE n1 = novo.n1, n2 = novo.n2, trabalho = novo.trabalho, atualizado_por = novo.atualizado_por`,
        [preenchidas.map((l) => [req.colegioId, turma.id, l.alunoId, disciplina.id, bimestre, l.n1, l.n2, l.trabalho, req.usuario.id])]
      );
    }
    return { gravadas: preenchidas.length, limpas: vazias.length };
  });

  await atividade(req.colegioId, req.usuario.id,
    `Notas lançadas: ${turma.nome} · ${disciplina.nome} · ${bimestre}º bimestre (${totais.gravadas} aluno(s))`);
  res.json(totais);
}));

module.exports = router;
