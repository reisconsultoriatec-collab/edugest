'use strict';
/* =====================================================================
 *  /api/diario — Diário de Classe   [módulo diario]
 *
 *  GET    /?turmaId=&data=&disciplinaId=   diário do dia (ou vazio) + chamada
 *  GET    /historico?turmaId=              últimos registros da turma
 *  PUT    /                                grava conteúdo e chamada (cria ou atualiza)
 *  DELETE /:id                             exclui o registro e a chamada
 *
 *  disciplinaId vazio = "chamada do dia" (Ed. Infantil / Fund. I).
 *  Chamada: P = presente, F = falta, J = falta justificada.
 *  Professor: só turmas/disciplinas atribuídas a ele.
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm, transacao } = require('../db');
const { exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade } = require('../utils/auditoria');
const { hojeSP, dataValida } = require('../utils/datas');
const { escopo, exigirTurma, exigirDisciplina, buscarTurma, buscarDisciplina } = require('../services/escopo');

router.use(exigirModulo('diario'));

function lerDisciplinaId(valor) {
  if (valor === undefined || valor === null || valor === '' || valor === 'dia') return null;
  return v.inteiro(valor, 'Disciplina', { min: 1 });
}

function lerData(valor, turma) {
  const data = String(valor || '');
  if (!dataValida(data)) throw new HttpErro(400, 'Data inválida', 'validacao');
  if (data > hojeSP()) throw new HttpErro(400, 'Não é possível registrar aula em data futura', 'validacao');
  if (Number(data.slice(0, 4)) !== turma.ano_letivo) {
    throw new HttpErro(400, `A data precisa estar no ano letivo da turma (${turma.ano_letivo})`, 'validacao');
  }
  return data;
}

/** Confere turma, data, disciplina e escopo. */
async function contexto(req, turmaIdBruto, dataBruta, discBruta) {
  const esc = await escopo(req);
  const turmaId = v.id(turmaIdBruto);
  const turma = await buscarTurma(req.colegioId, turmaId);
  exigirTurma(esc, turmaId);
  const data = lerData(dataBruta, turma);
  const disciplinaId = lerDisciplinaId(discBruta);
  let disciplina = null;
  if (disciplinaId) {
    disciplina = await buscarDisciplina(req.colegioId, disciplinaId);
    exigirDisciplina(esc, turmaId, disciplinaId);
  }
  return { esc, turma, data, disciplinaId, disciplina };
}

/* ---------------- Ler o diário do dia ---------------- */
router.get('/', assincrono(async (req, res) => {
  const { turma, data, disciplinaId } = await contexto(req, req.query.turmaId, req.query.data, req.query.disciplinaId);

  const d = await queryUm(
    `SELECT d.id, d.conteudo, d.atualizado_em, u.nome AS registrado_por
       FROM diarios d LEFT JOIN usuarios u ON u.id = d.criado_por
      WHERE d.colegio_id = ? AND d.turma_id = ? AND d.data = ? AND d.disciplina_id <=> ?`,
    [req.colegioId, turma.id, data, disciplinaId]
  );

  const alunos = await query(
    `SELECT a.id, a.nome, a.ra, a.status, f.status AS presenca
       FROM alunos a
       LEFT JOIN frequencias f ON f.aluno_id = a.id AND f.diario_id = ?
      WHERE a.colegio_id = ? AND ((a.turma_id = ? AND a.status = 'ativo') OR f.diario_id IS NOT NULL)
      ORDER BY a.nome`,
    [d ? d.id : 0, req.colegioId, turma.id]
  );

  res.json({
    turma: { id: turma.id, nome: turma.nome, anoLetivo: turma.ano_letivo },
    data,
    disciplinaId,
    diario: d ? { id: d.id, conteudo: d.conteudo, registradoPor: d.registrado_por, atualizadoEm: d.atualizado_em } : null,
    alunos: alunos.map((a) => ({ id: a.id, nome: a.nome, ra: a.ra, status: a.status, presenca: a.presenca || null }))
  });
}));

/* ---------------- Histórico da turma ---------------- */
router.get('/historico', assincrono(async (req, res) => {
  const esc = await escopo(req);
  const turmaId = v.id(req.query.turmaId);
  await buscarTurma(req.colegioId, turmaId);
  exigirTurma(esc, turmaId);

  const linhas = await query(
    `SELECT d.id, d.data, d.disciplina_id, disc.nome AS disciplina, LEFT(d.conteudo, 140) AS conteudo,
            (SELECT COUNT(*) FROM frequencias f WHERE f.diario_id = d.id AND f.status = 'P') AS p,
            (SELECT COUNT(*) FROM frequencias f WHERE f.diario_id = d.id AND f.status = 'F') AS f,
            (SELECT COUNT(*) FROM frequencias f WHERE f.diario_id = d.id AND f.status = 'J') AS j
       FROM diarios d
       LEFT JOIN disciplinas disc ON disc.id = d.disciplina_id
      WHERE d.colegio_id = ? AND d.turma_id = ?
      ORDER BY d.data DESC, disc.nome
      LIMIT 60`,
    [req.colegioId, turmaId]
  );

  res.json(linhas
    .filter((l) => !esc.restrito || l.disciplina_id === null || esc.pares.has(`${turmaId}:${l.disciplina_id}`))
    .map((l) => ({
      id: l.id,
      data: l.data,
      disciplinaId: l.disciplina_id,
      disciplina: l.disciplina,
      conteudo: l.conteudo,
      presentes: Number(l.p),
      faltas: Number(l.f),
      justificadas: Number(l.j)
    })));
}));

/* ---------------- Gravar ---------------- */
router.put('/', assincrono(async (req, res) => {
  const { esc, turma, data, disciplinaId, disciplina } = await contexto(req, req.body.turmaId, req.body.data, req.body.disciplinaId);
  const conteudo = v.texto(req.body.conteudo, 'Conteúdo da aula', { max: 2000 });

  const chamadaBruta = req.body.chamada && typeof req.body.chamada === 'object' ? req.body.chamada : {};
  const chamada = Object.entries(chamadaBruta).map(([alunoId, st]) => {
    if (!['P', 'F', 'J'].includes(st)) throw new HttpErro(400, 'Marcação de chamada inválida', 'validacao');
    return [v.id(alunoId), st];
  });
  if (!conteudo && !chamada.length) throw new HttpErro(400, 'Informe o conteúdo da aula ou faça a chamada', 'validacao');

  const resultado = await transacao(async (conn) => {
    const [[existente]] = await conn.query(
      `SELECT id FROM diarios WHERE colegio_id = ? AND turma_id = ? AND data = ? AND disciplina_id <=> ? FOR UPDATE`,
      [req.colegioId, turma.id, data, disciplinaId]
    );

    // Alunos aceitos: da turma, ou já presentes na chamada deste registro
    if (chamada.length) {
      const ids = chamada.map(([id]) => id);
      const [[ok]] = await conn.query(
        `SELECT COUNT(*) AS n FROM alunos a
          WHERE a.colegio_id = ? AND a.id IN (?)
            AND (a.turma_id = ? OR EXISTS (SELECT 1 FROM frequencias f WHERE f.diario_id = ? AND f.aluno_id = a.id))`,
        [req.colegioId, ids, turma.id, existente ? existente.id : 0]
      );
      if (ok.n !== ids.length) throw new HttpErro(400, 'A chamada tem aluno que não é desta turma', 'validacao');
    }

    // Professor da aula: quem está registrando, ou o atribuído à disciplina
    let professorId = esc.professorId;
    if (!professorId && disciplinaId) {
      const [[at]] = await conn.query('SELECT professor_id FROM atribuicoes WHERE turma_id = ? AND disciplina_id = ?', [turma.id, disciplinaId]);
      professorId = at ? at.professor_id : null;
    }

    let diarioId;
    if (existente) {
      diarioId = existente.id;
      await conn.query('UPDATE diarios SET conteudo = ?, professor_id = COALESCE(?, professor_id) WHERE id = ?', [conteudo, professorId, diarioId]);
    } else {
      const [r] = await conn.query(
        `INSERT INTO diarios (colegio_id, turma_id, data, disciplina_id, professor_id, conteudo, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.colegioId, turma.id, data, disciplinaId, professorId, conteudo, req.usuario.id]
      );
      diarioId = r.insertId;
    }

    if (chamada.length) {
      await conn.query(
        `INSERT INTO frequencias (diario_id, aluno_id, colegio_id, status) VALUES ? AS novo
         ON DUPLICATE KEY UPDATE status = novo.status`,
        [chamada.map(([alunoId, st]) => [diarioId, alunoId, req.colegioId, st])]
      );
    }
    return { diarioId, novo: !existente };
  });

  const cont = { P: 0, F: 0, J: 0 };
  chamada.forEach(([, st]) => { cont[st] += 1; });
  const [a, m, d] = data.split('-');
  await atividade(req.colegioId, req.usuario.id,
    `Diário ${turma.nome} · ${d}/${m}/${a}${disciplina ? ' · ' + disciplina.nome : ''}`
    + (chamada.length ? ` (${cont.P} presença(s), ${cont.F + cont.J} falta(s))` : ''));
  res.json({ id: resultado.diarioId, novo: resultado.novo });
}));

/* ---------------- Excluir ---------------- */
router.delete('/:id', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const d = await queryUm(
    `SELECT d.id, d.turma_id, d.disciplina_id, d.data, t.nome AS turma
       FROM diarios d JOIN turmas t ON t.id = d.turma_id
      WHERE d.id = ? AND d.colegio_id = ?`,
    [id, req.colegioId]
  );
  if (!d) throw new HttpErro(404, 'Registro não encontrado', 'nao_encontrado');
  const esc = await escopo(req);
  exigirTurma(esc, d.turma_id);
  if (d.disciplina_id) exigirDisciplina(esc, d.turma_id, d.disciplina_id);

  await query('DELETE FROM diarios WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  const [a, m, dia] = d.data.split('-');
  await atividade(req.colegioId, req.usuario.id, `Registro de diário excluído: ${d.turma} · ${dia}/${m}/${a}`);
  res.status(204).end();
}));

module.exports = router;
