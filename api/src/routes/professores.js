'use strict';
/* =====================================================================
 *  /api/professores — corpo docente do colégio atual
 *
 *  GET    /                         lista com disciplinas e login vinculado
 *  GET    /usuarios-disponiveis     logins da equipe que podem ser vinculados
 *  GET    /:id                      ficha completa (CPF decifrado)
 *  POST   /                         cadastra                    [módulo professores]
 *  PUT    /:id                      edita                       [módulo professores]
 *  DELETE /:id?forcar=1             exclui                      [módulo professores]
 *
 *  O vínculo com um login (usuario_id) permite, nos próximos módulos,
 *  que o professor veja só as próprias turmas no diário e nas notas.
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm, transacao } = require('../db');
const { exigirModulo, exigirAlgumModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade } = require('../utils/auditoria');
const { cifrar, decifrar } = require('../utils/crypto');

const LEITORES = ['professores', 'grade', 'diario', 'notas'];

const SELECT_LISTA = `
  SELECT p.id, p.nome, p.telefone, p.email, p.carga_horaria, p.status, p.usuario_id,
         u.nome AS usuario_nome, u.email AS usuario_email,
         (SELECT GROUP_CONCAT(d.id ORDER BY d.ordem, d.nome)
            FROM professor_disciplina pd JOIN disciplinas d ON d.id = pd.disciplina_id
           WHERE pd.professor_id = p.id) AS disc_ids,
         (SELECT GROUP_CONCAT(d.nome ORDER BY d.ordem, d.nome SEPARATOR '|')
            FROM professor_disciplina pd JOIN disciplinas d ON d.id = pd.disciplina_id
           WHERE pd.professor_id = p.id) AS disc_nomes
    FROM professores p
    LEFT JOIN usuarios u ON u.id = p.usuario_id`;

function formatar(p) {
  return {
    id: p.id,
    nome: p.nome,
    telefone: p.telefone,
    email: p.email,
    cargaHoraria: p.carga_horaria,
    status: p.status,
    usuarioId: p.usuario_id,
    usuario: p.usuario_id ? { nome: p.usuario_nome, email: p.usuario_email } : null,
    disciplinas: p.disc_ids
      ? String(p.disc_ids).split(',').map((id, i) => ({ id: Number(id), nome: String(p.disc_nomes).split('|')[i] }))
      : []
  };
}

function lerProfessor(b) {
  const disciplinas = Array.isArray(b.disciplinas)
    ? [...new Set(b.disciplinas.map((x) => v.inteiro(x, 'Disciplina', { min: 1 })))]
    : [];
  const usuarioId = b.usuarioId === '' || b.usuarioId === null || b.usuarioId === undefined
    ? null : v.inteiro(b.usuarioId, 'Login', { min: 1 });
  return {
    nome: v.texto(b.nome, 'Nome do professor', { max: 100, min: 3, obrigatorio: true }),
    cpf: v.cpf(b.cpf),
    telefone: v.telefone(b.telefone),
    email: v.email(b.email),
    carga_horaria: v.inteiro(b.cargaHoraria, 'Carga horária', { min: 0, max: 80 }),
    status: v.umDe(b.status || 'ativo', ['ativo', 'inativo'], 'Status'),
    usuario_id: usuarioId,
    disciplinas
  };
}

/** Confere disciplinas e login pertencem ao colégio. */
async function conferirVinculos(conn, colegioId, p, professorId) {
  if (p.disciplinas.length) {
    const [[r]] = await conn.query(
      'SELECT COUNT(*) AS n FROM disciplinas WHERE colegio_id = ? AND id IN (?)',
      [colegioId, p.disciplinas]
    );
    if (r.n !== p.disciplinas.length) throw new HttpErro(400, 'Disciplina inválida', 'validacao');
  }
  if (p.usuario_id) {
    const [[u]] = await conn.query(
      `SELECT uc.perfil FROM usuario_colegio uc
        WHERE uc.usuario_id = ? AND uc.colegio_id = ? AND uc.status = 'ativo' AND uc.perfil IN ('admin', 'professor')`,
      [p.usuario_id, colegioId]
    );
    if (!u) throw new HttpErro(400, 'O login escolhido não é de um professor ou administrador ativo deste colégio', 'validacao');
    const [[outro]] = await conn.query(
      'SELECT nome FROM professores WHERE colegio_id = ? AND usuario_id = ? AND id <> ?',
      [colegioId, p.usuario_id, professorId || 0]
    );
    if (outro) throw new HttpErro(409, `Este login já está vinculado ao professor ${outro.nome}`, 'duplicado');
  }
}

async function gravarDisciplinas(conn, professorId, disciplinas) {
  await conn.query('DELETE FROM professor_disciplina WHERE professor_id = ?', [professorId]);
  if (disciplinas.length) {
    await conn.query(
      'INSERT INTO professor_disciplina (professor_id, disciplina_id) VALUES ?',
      [disciplinas.map((d) => [professorId, d])]
    );
  }
}

/* ---------------- Listar ---------------- */
router.get('/', exigirAlgumModulo(LEITORES), assincrono(async (req, res) => {
  const linhas = await query(`${SELECT_LISTA} WHERE p.colegio_id = ? ORDER BY p.status, p.nome`, [req.colegioId]);
  res.json(linhas.map(formatar));
}));

router.get('/usuarios-disponiveis', exigirModulo('professores'), assincrono(async (req, res) => {
  const linhas = await query(
    `SELECT u.id, u.nome, u.email, uc.perfil,
            (SELECT p.nome FROM professores p WHERE p.colegio_id = uc.colegio_id AND p.usuario_id = u.id LIMIT 1) AS vinculado_a
       FROM usuario_colegio uc JOIN usuarios u ON u.id = uc.usuario_id
      WHERE uc.colegio_id = ? AND uc.status = 'ativo' AND uc.perfil IN ('admin', 'professor')
      ORDER BY u.nome`,
    [req.colegioId]
  );
  res.json(linhas.map((u) => ({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, vinculadoA: u.vinculado_a })));
}));

/* ---------------- Ficha ---------------- */
router.get('/:id', exigirModulo('professores'), assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const p = await queryUm(`${SELECT_LISTA} WHERE p.id = ? AND p.colegio_id = ?`, [id, req.colegioId]);
  if (!p) throw new HttpErro(404, 'Professor não encontrado', 'nao_encontrado');
  const extra = await queryUm('SELECT cpf_cript FROM professores WHERE id = ?', [id]);
  res.json({ ...formatar(p), cpf: decifrar(extra.cpf_cript) });
}));

/* ---------------- Cadastrar ---------------- */
router.post('/', exigirModulo('professores'), assincrono(async (req, res) => {
  const p = lerProfessor(req.body);
  const id = await transacao(async (conn) => {
    await conferirVinculos(conn, req.colegioId, p, null);
    const [r] = await conn.query(
      `INSERT INTO professores (colegio_id, usuario_id, nome, cpf_cript, telefone, email, carga_horaria, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.colegioId, p.usuario_id, p.nome, cifrar(p.cpf), p.telefone, p.email, p.carga_horaria, p.status]
    );
    await gravarDisciplinas(conn, r.insertId, p.disciplinas);
    return r.insertId;
  });
  await atividade(req.colegioId, req.usuario.id, `Professor cadastrado: ${p.nome}`);
  res.status(201).json({ id, nome: p.nome });
}));

/* ---------------- Editar ---------------- */
router.put('/:id', exigirModulo('professores'), assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const p = lerProfessor(req.body);
  await transacao(async (conn) => {
    const [[atual]] = await conn.query('SELECT id FROM professores WHERE id = ? AND colegio_id = ? FOR UPDATE', [id, req.colegioId]);
    if (!atual) throw new HttpErro(404, 'Professor não encontrado', 'nao_encontrado');
    await conferirVinculos(conn, req.colegioId, p, id);
    await conn.query(
      `UPDATE professores SET usuario_id = ?, nome = ?, cpf_cript = ?, telefone = ?, email = ?, carga_horaria = ?, status = ?
        WHERE id = ? AND colegio_id = ?`,
      [p.usuario_id, p.nome, cifrar(p.cpf), p.telefone, p.email, p.carga_horaria, p.status, id, req.colegioId]
    );
    await gravarDisciplinas(conn, id, p.disciplinas);
  });
  await atividade(req.colegioId, req.usuario.id, `Professor atualizado: ${p.nome}`);
  res.json({ id, nome: p.nome });
}));

/* ---------------- Excluir ---------------- */
router.delete('/:id', exigirModulo('professores'), assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const p = await queryUm('SELECT nome FROM professores WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  if (!p) throw new HttpErro(404, 'Professor não encontrado', 'nao_encontrado');

  const uso = await queryUm(
    `SELECT (SELECT COUNT(*) FROM grade_horaria WHERE professor_id = ?) AS grade,
            (SELECT COUNT(*) FROM diarios WHERE professor_id = ?) AS diarios`,
    [id, id]
  );
  const deps = [];
  if (uso.grade) deps.push(`${uso.grade} horário(s) na grade (ficarão sem professor)`);
  if (uso.diarios) deps.push(`${uso.diarios} registro(s) de diário (ficarão sem professor)`);
  if (deps.length && req.query.forcar !== '1') {
    throw new HttpErro(409, `${p.nome} tem ${deps.join(' e ')}. Se preferir manter o histórico, altere o status para Inativo.`, 'tem_vinculos');
  }
  await query('DELETE FROM professores WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  await atividade(req.colegioId, req.usuario.id, `Professor excluído: ${p.nome}`);
  res.status(204).end();
}));

module.exports = router;
