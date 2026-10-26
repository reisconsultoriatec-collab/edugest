'use strict';
/* =====================================================================
 *  Grade horária — horários dos turnos, conflitos e totais
 *
 *  Conflito: o mesmo professor em duas turmas no mesmo dia, em aulas
 *  cujos horários se sobrepõem (vale entre turnos diferentes, ex.: uma
 *  turma integral e outra matutina).
 * ===================================================================== */
const { query } = require('../db');

const DIAS = { 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };
const PERIODOS = { matutino: 'Matutino', vespertino: 'Vespertino', integral: 'Integral', noturno: 'Noturno' };

const hhmm = (t) => (t ? String(t).slice(0, 5) : null);
const minutos = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const sobrepoe = (a, b) => minutos(a.inicio) < minutos(b.fim) && minutos(b.inicio) < minutos(a.fim);

/**
 * Valida a lista de horários de um turno: HH:MM, fim depois do início,
 * em ordem e sem sobreposição. Devolve a lista normalizada (com ordem).
 */
function validarHorarios(lista) {
  if (!Array.isArray(lista)) throw new Error('Lista de horários inválida');
  if (lista.length > 20) throw new Error('No máximo 20 horários por turno');
  const re = /^([01]\d|2[0-3]):[0-5]\d$/;
  const norm = lista.map((h, i) => {
    const inicio = hhmm(h.inicio), fim = hhmm(h.fim);
    if (!re.test(inicio || '') || !re.test(fim || '')) throw new Error(`Horário ${i + 1}: use HH:MM`);
    if (minutos(fim) <= minutos(inicio)) throw new Error(`Horário ${i + 1}: o fim precisa ser depois do início`);
    const tipo = h.tipo === 'intervalo' ? 'intervalo' : 'aula';
    return { id: h.id ? Number(h.id) : null, inicio, fim, tipo };
  }).sort((a, b) => minutos(a.inicio) - minutos(b.inicio));
  for (let i = 1; i < norm.length; i++) {
    if (minutos(norm[i].inicio) < minutos(norm[i - 1].fim)) {
      throw new Error(`Os horários ${norm[i - 1].inicio}–${norm[i - 1].fim} e ${norm[i].inicio}–${norm[i].fim} se sobrepõem`);
    }
  }
  return norm.map((h, i) => ({ ...h, ordem: i + 1 }));
}

/** Rótulo das aulas: "1ª aula", "2ª aula"… (intervalos não contam). */
function numerar(horarios) {
  let n = 0;
  return horarios.map((h) => ({ ...h, rotulo: h.tipo === 'aula' ? `${++n}ª aula` : 'Intervalo' }));
}

async function horariosDoColegio(colegioId, periodo) {
  const linhas = await query(
    `SELECT id, periodo, ordem, inicio, fim, tipo FROM horarios_aula
      WHERE colegio_id = ?${periodo ? ' AND periodo = ?' : ''} ORDER BY periodo, inicio`,
    periodo ? [colegioId, periodo] : [colegioId]
  );
  return linhas.map((h) => ({ id: h.id, periodo: h.periodo, ordem: h.ordem, inicio: hhmm(h.inicio), fim: hhmm(h.fim), tipo: h.tipo }));
}

/**
 * Aulas já marcadas na grade (com horário e turma), para checar conflitos.
 * @param exceto turma que está sendo editada (fica de fora)
 */
async function ocupacoes(colegioId, exceto) {
  const linhas = await query(
    `SELECT g.professor_id, g.dia_semana, h.inicio, h.fim, t.id AS turma_id, t.nome AS turma, d.nome AS disciplina
       FROM grade_horaria g
       JOIN horarios_aula h ON h.id = g.horario_id
       JOIN turmas t ON t.id = g.turma_id
       LEFT JOIN disciplinas d ON d.id = g.disciplina_id
      WHERE g.colegio_id = ? AND g.professor_id IS NOT NULL AND t.ativo = 1${exceto ? ' AND g.turma_id <> ?' : ''}`,
    exceto ? [colegioId, exceto] : [colegioId]
  );
  return linhas.map((o) => ({
    professorId: o.professor_id, dia: Number(o.dia_semana), inicio: hhmm(o.inicio), fim: hhmm(o.fim),
    turmaId: o.turma_id, turma: o.turma, disciplina: o.disciplina
  }));
}

/**
 * Conflitos das aulas de uma turma com as ocupações das outras turmas.
 * @param aulas [{ dia, inicio, fim, professorId, professor }]
 */
function conflitos(aulas, outras) {
  const lista = [];
  aulas.forEach((a) => {
    if (!a.professorId) return;
    outras.filter((o) => o.professorId === a.professorId && o.dia === a.dia && sobrepoe(a, o)).forEach((o) => {
      lista.push({ dia: a.dia, inicio: a.inicio, fim: a.fim, professorId: a.professorId, professor: a.professor, turma: o.turma, turmaId: o.turmaId });
    });
  });
  return lista;
}

/** Grade de uma turma: horários do turno (numerados) e as aulas marcadas. */
async function gradeDaTurma(colegioId, turma) {
  const [horarios, aulas] = await Promise.all([
    horariosDoColegio(colegioId, turma.periodo),
    query(
      `SELECT g.dia_semana, g.horario_id, g.disciplina_id, d.nome AS disciplina, g.professor_id, p.nome AS professor
         FROM grade_horaria g
         LEFT JOIN disciplinas d ON d.id = g.disciplina_id
         LEFT JOIN professores p ON p.id = g.professor_id
        WHERE g.turma_id = ? AND g.colegio_id = ?`,
      [turma.id, colegioId]
    )
  ]);
  const celulas = aulas.map((a) => ({
    dia: Number(a.dia_semana), horarioId: a.horario_id,
    disciplinaId: a.disciplina_id, disciplina: a.disciplina, professorId: a.professor_id, professor: a.professor
  }));
  return {
    turma: { id: turma.id, nome: turma.nome, serie: turma.serie, periodo: turma.periodo, periodoNome: PERIODOS[turma.periodo] },
    horarios: numerar(horarios),
    celulas,
    sabado: celulas.some((c) => c.dia === 6)
  };
}

module.exports = { DIAS, PERIODOS, hhmm, minutos, sobrepoe, validarHorarios, numerar, horariosDoColegio, ocupacoes, conflitos, gradeDaTurma };
