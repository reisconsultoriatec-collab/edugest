'use strict';
/* =====================================================================
 *  /api/grade — grade horária   [módulo grade]
 *
 *  GET /opcoes                  turmas (com aulas preenchidas) e professores (aulas x carga)
 *  GET /horarios                horários de todos os turnos e quantas aulas usam cada um
 *  PUT /horarios/:periodo       salva os horários de um turno            [coordenação]
 *  GET /turmas/:id              grade da turma, disciplinas, professores, atribuições e
 *                               aulas dos professores em outras turmas (conflitos)
 *  PUT /turmas/:id              salva a grade da turma (bloqueia conflitos) [coordenação]
 *  GET /professores/:id         semana do professor (coordenação ou o próprio)
 *  GET /minha                   semana do professor logado e as aulas de hoje
 *
 *  Coordenação = quem tem o módulo e não é professor. Professor consulta.
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm, transacao } = require('../db');
const { exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade } = require('../utils/auditoria');
const { hojeSP } = require('../utils/datas');
const { escopo, buscarTurma } = require('../services/escopo');
const g = require('../services/grade');
const { gradeDaTurma } = g;

const modulo = exigirModulo('grade');
const coordenacao = (req, res, next) => (req.perfil === 'professor'
  ? next(new HttpErro(403, 'Somente a coordenação altera a grade horária', 'perfil'))
  : next());

/** Semana do professor em todas as turmas ativas. */
async function gradeDoProfessor(colegioId, professorId) {
  const prof = await queryUm('SELECT id, nome, carga_horaria FROM professores WHERE id = ? AND colegio_id = ?', [professorId, colegioId]);
  if (!prof) throw new HttpErro(404, 'Professor não encontrado', 'nao_encontrado');
  const aulas = await query(
    `SELECT g.dia_semana, h.inicio, h.fim, t.id AS turma_id, t.nome AS turma, d.nome AS disciplina
       FROM grade_horaria g
       JOIN horarios_aula h ON h.id = g.horario_id
       JOIN turmas t ON t.id = g.turma_id AND t.ativo = 1
       LEFT JOIN disciplinas d ON d.id = g.disciplina_id
      WHERE g.colegio_id = ? AND g.professor_id = ?
      ORDER BY g.dia_semana, h.inicio`,
    [colegioId, professorId]
  );
  return {
    professor: { id: prof.id, nome: prof.nome, cargaHoraria: prof.carga_horaria },
    aulas: aulas.map((a) => ({ dia: Number(a.dia_semana), inicio: g.hhmm(a.inicio), fim: g.hhmm(a.fim), turmaId: a.turma_id, turma: a.turma, disciplina: a.disciplina })),
    total: aulas.length
  };
}

/** Dia da semana de hoje na grade (1 = segunda … 6 = sábado; domingo = 0). */
const diaDeHoje = () => new Date(`${hojeSP()}T12:00:00Z`).getUTCDay();

/* ---------------- Opções ---------------- */
router.get('/opcoes', modulo, assincrono(async (req, res) => {
  const [esc, turmas, profs, horarios] = await Promise.all([
    escopo(req),
    query(
      `SELECT t.id, t.nome, t.serie, t.periodo,
              (SELECT COUNT(*) FROM grade_horaria g WHERE g.turma_id = t.id AND g.disciplina_id IS NOT NULL) AS aulas
         FROM turmas t WHERE t.colegio_id = ? AND t.ativo = 1 ORDER BY t.nome`,
      [req.colegioId]
    ),
    query(
      `SELECT p.id, p.nome, p.carga_horaria,
              (SELECT COUNT(*) FROM grade_horaria g JOIN turmas t ON t.id = g.turma_id AND t.ativo = 1 WHERE g.professor_id = p.id) AS aulas
         FROM professores p WHERE p.colegio_id = ? AND p.status = 'ativo' ORDER BY p.nome`,
      [req.colegioId]
    ),
    query("SELECT periodo, COUNT(*) AS n FROM horarios_aula WHERE colegio_id = ? AND tipo = 'aula' GROUP BY periodo", [req.colegioId])
  ]);
  const porTurno = Object.fromEntries(horarios.map((h) => [h.periodo, Number(h.n)]));
  res.json({
    coordenacao: req.perfil !== 'professor',
    professorId: esc.restrito ? esc.professorId : null,
    periodos: Object.entries(g.PERIODOS).map(([id, nome]) => ({ id, nome, aulas: porTurno[id] || 0 })),
    turmas: turmas.map((t) => ({ id: t.id, nome: t.nome, serie: t.serie, periodo: t.periodo, aulas: Number(t.aulas), aulasTurno: porTurno[t.periodo] || 0 })),
    professores: profs.map((p) => ({ id: p.id, nome: p.nome, cargaHoraria: p.carga_horaria, aulas: Number(p.aulas) }))
  });
}));

/* ---------------- Horários dos turnos ---------------- */
router.get('/horarios', modulo, assincrono(async (req, res) => {
  const [hs, uso] = await Promise.all([
    g.horariosDoColegio(req.colegioId),
    query('SELECT horario_id, COUNT(*) AS n FROM grade_horaria WHERE colegio_id = ? GROUP BY horario_id', [req.colegioId])
  ]);
  const usoPor = Object.fromEntries(uso.map((u) => [u.horario_id, Number(u.n)]));
  const porPeriodo = Object.fromEntries(Object.keys(g.PERIODOS).map((p) => [p, []]));
  hs.forEach((h) => { porPeriodo[h.periodo].push({ ...h, aulasNaGrade: usoPor[h.id] || 0 }); });
  Object.keys(porPeriodo).forEach((p) => { porPeriodo[p] = g.numerar(porPeriodo[p]); });
  res.json({ horarios: porPeriodo });
}));

router.put('/horarios/:periodo', modulo, coordenacao, assincrono(async (req, res) => {
  const periodo = v.umDe(req.params.periodo, Object.keys(g.PERIODOS), 'Turno');
  let lista;
  try { lista = g.validarHorarios(req.body.horarios); } catch (e) { throw new HttpErro(400, e.message, 'validacao'); }

  const atuais = await query('SELECT id FROM horarios_aula WHERE colegio_id = ? AND periodo = ?', [req.colegioId, periodo]);
  const ids = new Set(atuais.map((h) => h.id));
  if (lista.some((h) => h.id && !ids.has(h.id))) throw new HttpErro(400, 'Horário inválido', 'validacao');
  const mantidos = new Set(lista.filter((h) => h.id).map((h) => h.id));
  const removidos = [...ids].filter((id) => !mantidos.has(id));

  const aulasRemovidas = await transacao(async (conn) => {
    let n = 0;
    if (removidos.length) {
      const ph = removidos.map(() => '?').join(',');
      const [[c]] = await conn.query(`SELECT COUNT(*) AS n FROM grade_horaria WHERE horario_id IN (${ph})`, removidos);
      n = Number(c.n);
      await conn.query(`DELETE FROM horarios_aula WHERE colegio_id = ? AND id IN (${ph})`, [req.colegioId, ...removidos]);
    }
    for (const h of lista) {
      if (h.id) {
        await conn.query('UPDATE horarios_aula SET ordem = ?, inicio = ?, fim = ?, tipo = ? WHERE id = ? AND colegio_id = ?',
          [h.ordem, h.inicio, h.fim, h.tipo, h.id, req.colegioId]);
        // Virou intervalo: as aulas marcadas nesse horário saem da grade
        if (h.tipo === 'intervalo') {
          const [r] = await conn.query('DELETE FROM grade_horaria WHERE horario_id = ?', [h.id]);
          n += Number(r.affectedRows || 0);
        }
      } else {
        await conn.query('INSERT INTO horarios_aula (colegio_id, periodo, ordem, inicio, fim, tipo) VALUES (?, ?, ?, ?, ?, ?)',
          [req.colegioId, periodo, h.ordem, h.inicio, h.fim, h.tipo]);
      }
    }
    return n;
  });
  await atividade(req.colegioId, req.usuario.id, `Horários do turno ${g.PERIODOS[periodo].toLowerCase()} atualizados`);
  res.json({ periodo, horarios: g.numerar(await g.horariosDoColegio(req.colegioId, periodo)), aulasRemovidas });
}));

/* ---------------- Grade da turma ---------------- */
router.get('/turmas/:id', modulo, assincrono(async (req, res) => {
  const turma = await buscarTurma(req.colegioId, v.id(req.params.id));
  const [grade, disciplinas, professores, atrib, outras] = await Promise.all([
    gradeDaTurma(req.colegioId, turma),
    query('SELECT id, nome FROM disciplinas WHERE colegio_id = ? AND ativo = 1 ORDER BY ordem, nome', [req.colegioId]),
    query("SELECT id, nome FROM professores WHERE colegio_id = ? AND status = 'ativo' ORDER BY nome", [req.colegioId]),
    query('SELECT disciplina_id, professor_id FROM atribuicoes WHERE turma_id = ? AND colegio_id = ?', [turma.id, req.colegioId]),
    g.ocupacoes(req.colegioId, turma.id)
  ]);
  res.json({
    ...grade,
    disciplinas,
    professores,
    atribuicoes: Object.fromEntries(atrib.map((a) => [a.disciplina_id, a.professor_id])),
    ocupacoes: outras,
    podeEditar: req.perfil !== 'professor'
  });
}));

router.put('/turmas/:id', modulo, coordenacao, assincrono(async (req, res) => {
  const turma = await buscarTurma(req.colegioId, v.id(req.params.id));
  const lista = Array.isArray(req.body.celulas) ? req.body.celulas : null;
  if (!lista || lista.length > 6 * 20) throw new HttpErro(400, 'Grade inválida', 'validacao');

  const [horarios, discs, profs] = await Promise.all([
    g.horariosDoColegio(req.colegioId, turma.periodo),
    query('SELECT id FROM disciplinas WHERE colegio_id = ?', [req.colegioId]),
    query("SELECT id, nome FROM professores WHERE colegio_id = ? AND status = 'ativo'", [req.colegioId])
  ]);
  const hMap = new Map(horarios.map((h) => [h.id, h]));
  const dSet = new Set(discs.map((d) => d.id));
  const pMap = new Map(profs.map((p) => [p.id, p.nome]));

  const vistas = new Set();
  const aulas = [];
  for (const c of lista) {
    const dia = Number(c.dia), horarioId = Number(c.horarioId);
    const disciplinaId = c.disciplinaId ? Number(c.disciplinaId) : null;
    const professorId = c.professorId ? Number(c.professorId) : null;
    if (!disciplinaId && !professorId) continue; // aula vazia
    if (!(dia >= 1 && dia <= 6)) throw new HttpErro(400, 'Dia da semana inválido', 'validacao');
    const h = hMap.get(horarioId);
    if (!h || h.tipo !== 'aula') throw new HttpErro(400, `Horário inválido para o turno ${g.PERIODOS[turma.periodo].toLowerCase()}`, 'validacao');
    if (disciplinaId && !dSet.has(disciplinaId)) throw new HttpErro(400, 'Disciplina inválida', 'validacao');
    if (professorId && !pMap.has(professorId)) throw new HttpErro(400, 'Professor inválido ou inativo', 'validacao');
    const chave = `${dia}:${horarioId}`;
    if (vistas.has(chave)) throw new HttpErro(400, 'Aula repetida no mesmo horário', 'validacao');
    vistas.add(chave);
    aulas.push({ dia, horarioId, disciplinaId, professorId, professor: pMap.get(professorId), inicio: h.inicio, fim: h.fim });
  }

  const choques = g.conflitos(aulas, await g.ocupacoes(req.colegioId, turma.id));
  if (choques.length) {
    const c = choques[0];
    const mais = choques.length > 1 ? ` (e mais ${choques.length - 1} conflito(s))` : '';
    throw new HttpErro(409, `${c.professor} já está no ${c.turma} na ${g.DIAS[c.dia].toLowerCase()}, ${c.inicio}–${c.fim}${mais}`, 'conflito');
  }

  await transacao(async (conn) => {
    await conn.query('DELETE FROM grade_horaria WHERE turma_id = ? AND colegio_id = ?', [turma.id, req.colegioId]);
    if (aulas.length) {
      await conn.query('INSERT INTO grade_horaria (colegio_id, turma_id, dia_semana, horario_id, disciplina_id, professor_id) VALUES ?',
        [aulas.map((a) => [req.colegioId, turma.id, a.dia, a.horarioId, a.disciplinaId, a.professorId])]);
    }
  });
  await atividade(req.colegioId, req.usuario.id, `Grade horária do ${turma.nome} atualizada`);
  res.json({ turmaId: turma.id, aulas: aulas.length });
}));

/* ---------------- Grade do professor ---------------- */
router.get('/professores/:id', modulo, assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  if (req.perfil === 'professor') {
    const esc = await escopo(req);
    if (esc.professorId !== id) throw new HttpErro(403, 'Você só pode ver a sua grade', 'escopo');
  }
  res.json(await gradeDoProfessor(req.colegioId, id));
}));

router.get('/minha', modulo, assincrono(async (req, res) => {
  const esc = await escopo(req);
  if (!esc.professorId) return res.json({ vinculado: false, aulas: [], hoje: [], total: 0 });
  const r = await gradeDoProfessor(req.colegioId, esc.professorId);
  const dia = diaDeHoje();
  res.json({ vinculado: true, ...r, hoje: r.aulas.filter((a) => a.dia === dia) });
}));

module.exports = router;
