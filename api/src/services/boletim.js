'use strict';
/* =====================================================================
 *  Boletim de um aluno numa turma — a mesma regra para a equipe
 *  (/api/boletim) e para o portal do responsável (/api/portal).
 *
 *  - Média do bimestre: média das notas lançadas, 1 casa.
 *  - Média final da disciplina: média dos bimestres lançados, 1 casa.
 *  - Situação da disciplina: "em curso" até os 4 bimestres; depois
 *    "aprovado" (>= média do colégio) ou "recuperação".
 *  - Frequência: (presenças + faltas justificadas) / aulas registradas.
 * ===================================================================== */
const { query, queryUm } = require('../db');
const { arred1, mediaBimestre } = require('./escopo');

/**
 * @param {number} colegioId
 * @param {object} aluno  linha de alunos (id, nome, ra, nascimento, status, resp_nome, resp_telefone)
 * @param {object} turma  linha de turmas (id, nome, serie, periodo, ano_letivo)
 */
async function montarBoletim(colegioId, aluno, turma) {
  const [colegio, disciplinas, notas, freq] = await Promise.all([
    queryUm(
      `SELECT c.nome, c.cnpj, c.telefone, c.endereco, cfg.media_aprovacao, cfg.frequencia_minima
         FROM colegios c LEFT JOIN config_colegio cfg ON cfg.colegio_id = c.id WHERE c.id = ?`,
      [colegioId]
    ),
    query('SELECT id, nome, ativo FROM disciplinas WHERE colegio_id = ? ORDER BY ordem, nome', [colegioId]),
    query('SELECT disciplina_id, bimestre, n1, n2, trabalho FROM notas WHERE aluno_id = ? AND turma_id = ?', [aluno.id, turma.id]),
    queryUm(
      `SELECT COUNT(*) AS aulas,
              COALESCE(SUM(f.status = 'P'), 0) AS presencas,
              COALESCE(SUM(f.status = 'F'), 0) AS faltas,
              COALESCE(SUM(f.status = 'J'), 0) AS justificadas
         FROM frequencias f JOIN diarios d ON d.id = f.diario_id
        WHERE f.aluno_id = ? AND d.turma_id = ?`,
      [aluno.id, turma.id]
    )
  ]);

  const mediaAprov = Number(colegio.media_aprovacao ?? 6);
  const freqMin = Number(colegio.frequencia_minima ?? 75);

  const porDisc = new Map();
  notas.forEach((n) => {
    if (!porDisc.has(n.disciplina_id)) porDisc.set(n.disciplina_id, [null, null, null, null]);
    porDisc.get(n.disciplina_id)[n.bimestre - 1] = mediaBimestre(n);
  });

  const linhas = disciplinas
    .filter((d) => d.ativo || porDisc.has(d.id))
    .map((d) => {
      const bims = porDisc.get(d.id) || [null, null, null, null];
      const lancados = bims.filter((m) => m !== null);
      const mediaFinal = lancados.length ? arred1(lancados.reduce((s, m) => s + m, 0) / lancados.length) : null;
      let situacao = 'sem_notas';
      if (lancados.length === 4) situacao = mediaFinal >= mediaAprov ? 'aprovado' : 'recuperacao';
      else if (lancados.length) situacao = 'em_curso';
      return { id: d.id, nome: d.nome, bimestres: bims, mediaFinal, situacao };
    });

  const aulas = Number(freq.aulas);
  const presencas = Number(freq.presencas);
  const faltas = Number(freq.faltas);
  const justificadas = Number(freq.justificadas);
  const percentual = aulas ? arred1(((presencas + justificadas) / aulas) * 100) : null;
  const freqSituacao = percentual === null ? 'sem_registros' : percentual < freqMin ? 'abaixo' : 'regular';

  // Situação geral: só é final quando todas as disciplinas com notas têm os 4 bimestres
  const comNotas = linhas.filter((l) => l.situacao !== 'sem_notas');
  let situacaoGeral = 'em_curso';
  if (comNotas.length && comNotas.every((l) => l.situacao === 'aprovado' || l.situacao === 'recuperacao')) {
    if (freqSituacao === 'abaixo') situacaoGeral = 'frequencia_insuficiente';
    else if (comNotas.some((l) => l.situacao === 'recuperacao')) situacaoGeral = 'recuperacao';
    else situacaoGeral = 'aprovado';
  }

  return {
    colegio: { nome: colegio.nome, cnpj: colegio.cnpj, telefone: colegio.telefone, endereco: colegio.endereco },
    criterios: { mediaAprovacao: mediaAprov, frequenciaMinima: freqMin },
    aluno: {
      id: aluno.id, nome: aluno.nome, ra: aluno.ra, nascimento: aluno.nascimento, status: aluno.status,
      respNome: aluno.resp_nome, respTelefone: aluno.resp_telefone
    },
    turma: { id: turma.id, nome: turma.nome, serie: turma.serie, periodo: turma.periodo, anoLetivo: turma.ano_letivo },
    disciplinas: linhas,
    frequencia: { aulas, presencas, faltas, justificadas, percentual, situacao: freqSituacao },
    situacaoGeral
  };
}

module.exports = { montarBoletim };
