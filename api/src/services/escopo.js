'use strict';
/* =====================================================================
 *  Escopo do professor no pedagógico (diário, notas, boletim)
 *
 *  Perfil "professor": vê só as turmas/disciplinas atribuídas a ele
 *  (tabela atribuicoes), pelo cadastro de professor vinculado ao login.
 *  Demais perfis com o módulo liberado: sem restrição.
 * ===================================================================== */
const { query, queryUm } = require('../db');
const { HttpErro } = require('../middleware/erros');

async function escopo(req) {
  if (req.perfil !== 'professor') return { restrito: false, professorId: null };

  const prof = await queryUm(
    "SELECT id FROM professores WHERE colegio_id = ? AND usuario_id = ? AND status = 'ativo' LIMIT 1",
    [req.colegioId, req.usuario.id]
  );
  if (!prof) return { restrito: true, vinculado: false, professorId: null, turmas: new Set(), pares: new Set() };

  const at = await query(
    'SELECT turma_id, disciplina_id FROM atribuicoes WHERE professor_id = ? AND colegio_id = ?',
    [prof.id, req.colegioId]
  );
  return {
    restrito: true,
    vinculado: true,
    professorId: prof.id,
    turmas: new Set(at.map((a) => a.turma_id)),
    pares: new Set(at.map((a) => `${a.turma_id}:${a.disciplina_id}`))
  };
}

function exigirTurma(esc, turmaId) {
  if (esc.restrito && !esc.turmas.has(turmaId)) {
    throw new HttpErro(403, 'Esta turma não está atribuída a você', 'escopo');
  }
}

function exigirDisciplina(esc, turmaId, disciplinaId) {
  if (esc.restrito && !esc.pares.has(`${turmaId}:${disciplinaId}`)) {
    throw new HttpErro(403, 'Esta disciplina não está atribuída a você nesta turma', 'escopo');
  }
}

/** Turma do colégio atual ou 404. */
async function buscarTurma(colegioId, turmaId) {
  const t = await queryUm(
    'SELECT id, nome, serie, periodo, ano_letivo, ativo FROM turmas WHERE id = ? AND colegio_id = ?',
    [turmaId, colegioId]
  );
  if (!t) throw new HttpErro(404, 'Turma não encontrada', 'nao_encontrado');
  return t;
}

/** Disciplina do colégio atual ou 400. */
async function buscarDisciplina(colegioId, disciplinaId) {
  const d = await queryUm('SELECT id, nome, ativo FROM disciplinas WHERE id = ? AND colegio_id = ?', [disciplinaId, colegioId]);
  if (!d) throw new HttpErro(400, 'Disciplina inválida', 'validacao');
  return d;
}

/** Arredonda para 1 casa (como aparece no boletim). */
const arred1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;

/** Média do bimestre: média das notas lançadas (em branco não conta como zero). */
function mediaBimestre(n) {
  const vals = [n.n1, n.n2, n.trabalho].filter((x) => x !== null && x !== undefined).map(Number);
  if (!vals.length) return null;
  return arred1(vals.reduce((s, x) => s + x, 0) / vals.length);
}

module.exports = { escopo, exigirTurma, exigirDisciplina, buscarTurma, buscarDisciplina, arred1, mediaBimestre };
