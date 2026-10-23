'use strict';
/* =====================================================================
 *  /api/alunos — alunos do colégio atual   [módulo alunos]
 *
 *  GET    /?busca=&status=&turmaId=     lista (sem CPF/RG)
 *  GET    /:id                          ficha completa (CPF/RG decifrados)
 *  POST   /                             cadastra (RA e código PAI gerados aqui)
 *  PUT    /:id                          edita
 *  POST   /:id/novo-codigo              gera novo código PAI
 *  DELETE /:id?forcar=1                 exclui
 *
 *  Exclusão: aluno com mensalidades não pode ser excluído (preserva o
 *  financeiro — use status Inativo/Transferido). Com notas ou frequência,
 *  pede confirmação (forcar=1).
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm, transacao } = require('../db');
const { exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade } = require('../utils/auditoria');
const { cifrar, decifrar } = require('../utils/crypto');
const { codigoAcessoAluno } = require('../utils/codigos');
const { hojeSP, dataValida } = require('../utils/datas');

const STATUS = ['ativo', 'inativo', 'transferido'];

router.use(exigirModulo('alunos'));

function lerAluno(b) {
  const nascimento = b.nascimento ? String(b.nascimento) : null;
  if (nascimento && (!dataValida(nascimento) || nascimento > hojeSP())) {
    throw new HttpErro(400, 'Data de nascimento inválida', 'validacao');
  }
  const turmaId = b.turmaId === '' || b.turmaId === null || b.turmaId === undefined
    ? null : v.inteiro(b.turmaId, 'Turma', { min: 1 });
  return {
    nome: v.texto(b.nome, 'Nome do aluno', { max: 100, min: 3, obrigatorio: true }),
    nascimento,
    cpf: v.cpf(b.cpf, 'CPF do aluno'),
    rg: v.texto(b.rg, 'RG', { max: 20 }),
    endereco: v.texto(b.endereco, 'Endereço', { max: 200 }),
    turma_id: turmaId,
    status: v.umDe(b.status || 'ativo', STATUS, 'Status'),
    resp_nome: v.texto(b.respNome, 'Nome do responsável', { max: 100 }),
    resp_parentesco: v.texto(b.respParentesco, 'Parentesco', { max: 20 }),
    resp_telefone: v.telefone(b.respTelefone, 'Telefone do responsável'),
    resp_email: v.email(b.respEmail, 'E-mail do responsável')
  };
}

async function conferirTurma(colegioId, turmaId) {
  if (!turmaId) return;
  const t = await queryUm('SELECT id FROM turmas WHERE id = ? AND colegio_id = ?', [turmaId, colegioId]);
  if (!t) throw new HttpErro(400, 'Turma inválida', 'validacao');
}

function formatarLista(a) {
  return {
    id: a.id,
    ra: a.ra,
    nome: a.nome,
    nascimento: a.nascimento,
    status: a.status,
    codigoAcesso: a.codigo_acesso,
    turmaId: a.turma_id,
    turma: a.turma_nome,
    turmaAno: a.turma_ano,
    respNome: a.resp_nome,
    respParentesco: a.resp_parentesco,
    respTelefone: a.resp_telefone,
    respEmail: a.resp_email,
    responsaveisPortal: Number(a.responsaveis_portal || 0)
  };
}

const SELECT_LISTA = `
  SELECT a.id, a.ra, a.nome, a.nascimento, a.status, a.codigo_acesso, a.turma_id,
         a.resp_nome, a.resp_parentesco, a.resp_telefone, a.resp_email,
         t.nome AS turma_nome, t.ano_letivo AS turma_ano,
         (SELECT COUNT(*) FROM responsavel_aluno ra WHERE ra.aluno_id = a.id) AS responsaveis_portal
    FROM alunos a
    LEFT JOIN turmas t ON t.id = a.turma_id`;

/* ---------------- Listar ---------------- */
router.get('/', assincrono(async (req, res) => {
  const cond = ['a.colegio_id = ?'];
  const params = [req.colegioId];

  const status = v.umDe(req.query.status || null, STATUS, 'Status', { obrigatorio: false });
  if (status) { cond.push('a.status = ?'); params.push(status); }

  if (req.query.turmaId === 'sem') cond.push('a.turma_id IS NULL');
  else if (req.query.turmaId) { cond.push('a.turma_id = ?'); params.push(v.id(req.query.turmaId)); }

  const busca = v.texto(req.query.busca, 'Busca', { max: 100 });
  if (busca) {
    cond.push('(a.nome LIKE ? OR a.ra LIKE ? OR a.codigo_acesso LIKE ? OR a.resp_nome LIKE ?)');
    const termo = `%${busca.replace(/[%_\\]/g, '\\$&')}%`;
    params.push(termo, termo, termo, termo);
  }

  const linhas = await query(`${SELECT_LISTA} WHERE ${cond.join(' AND ')} ORDER BY a.nome LIMIT 3000`, params);
  res.json(linhas.map(formatarLista));
}));

/* ---------------- Ficha ---------------- */
router.get('/:id', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const a = await queryUm(`${SELECT_LISTA} WHERE a.id = ? AND a.colegio_id = ?`, [id, req.colegioId]);
  if (!a) throw new HttpErro(404, 'Aluno não encontrado', 'nao_encontrado');
  const extra = await queryUm('SELECT cpf_cript, rg_cript, endereco FROM alunos WHERE id = ?', [id]);
  res.json({
    ...formatarLista(a),
    cpf: decifrar(extra.cpf_cript),
    rg: decifrar(extra.rg_cript),
    endereco: extra.endereco
  });
}));

/* ---------------- Cadastrar ---------------- */
async function proximoRA(conn, colegioId, ano) {
  const [[r]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING(ra, 5) AS UNSIGNED)) AS ultimo
       FROM alunos WHERE colegio_id = ? AND ra REGEXP ? FOR UPDATE`,
    [colegioId, `^${ano}[0-9]{4,}$`]
  );
  return `${ano}${String(Number(r.ultimo || 0) + 1).padStart(4, '0')}`;
}

router.post('/', assincrono(async (req, res) => {
  const a = lerAluno(req.body);
  await conferirTurma(req.colegioId, a.turma_id);
  const raInformado = v.texto(req.body.ra, 'RA', { max: 20 });

  let criado = null;
  for (let tentativa = 0; tentativa < 5 && !criado; tentativa++) {
    try {
      criado = await transacao(async (conn) => {
        const ra = raInformado || await proximoRA(conn, req.colegioId, hojeSP().slice(0, 4));
        const codigo = codigoAcessoAluno();
        const [r] = await conn.query(
          `INSERT INTO alunos (colegio_id, ra, nome, nascimento, cpf_cript, rg_cript, endereco, turma_id, status,
                               codigo_acesso, resp_nome, resp_parentesco, resp_telefone, resp_email)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.colegioId, ra, a.nome, a.nascimento, cifrar(a.cpf), cifrar(a.rg), a.endereco, a.turma_id, a.status,
            codigo, a.resp_nome, a.resp_parentesco, a.resp_telefone, a.resp_email]
        );
        return { id: r.insertId, ra, codigo };
      });
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY') throw e;
      if (raInformado && /uk_alunos_ra/.test(e.message)) throw new HttpErro(409, `Já existe um aluno com o RA ${raInformado}`, 'duplicado');
      if (tentativa === 4) throw e;
    }
  }

  await atividade(req.colegioId, req.usuario.id, `Aluno cadastrado: ${a.nome} (RA ${criado.ra})`);
  res.status(201).json({ id: criado.id, ra: criado.ra, codigoAcesso: criado.codigo, nome: a.nome });
}));

/* ---------------- Editar ---------------- */
router.put('/:id', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const atual = await queryUm('SELECT ra FROM alunos WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  if (!atual) throw new HttpErro(404, 'Aluno não encontrado', 'nao_encontrado');
  const a = lerAluno(req.body);
  await conferirTurma(req.colegioId, a.turma_id);
  const ra = v.texto(req.body.ra, 'RA', { max: 20 }) || atual.ra;

  await query(
    `UPDATE alunos SET ra = ?, nome = ?, nascimento = ?, cpf_cript = ?, rg_cript = ?, endereco = ?, turma_id = ?, status = ?,
            resp_nome = ?, resp_parentesco = ?, resp_telefone = ?, resp_email = ?
      WHERE id = ? AND colegio_id = ?`,
    [ra, a.nome, a.nascimento, cifrar(a.cpf), cifrar(a.rg), a.endereco, a.turma_id, a.status,
      a.resp_nome, a.resp_parentesco, a.resp_telefone, a.resp_email, id, req.colegioId]
  ).catch((e) => {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpErro(409, `Já existe um aluno com o RA ${ra}`, 'duplicado');
    throw e;
  });
  await atividade(req.colegioId, req.usuario.id, `Aluno atualizado: ${a.nome}`);
  res.json({ id, ra });
}));

/* ---------------- Novo código PAI ---------------- */
router.post('/:id/novo-codigo', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const a = await queryUm('SELECT nome FROM alunos WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  if (!a) throw new HttpErro(404, 'Aluno não encontrado', 'nao_encontrado');
  let codigo = null;
  for (let t = 0; t < 5 && !codigo; t++) {
    const novo = codigoAcessoAluno();
    try {
      await query('UPDATE alunos SET codigo_acesso = ? WHERE id = ?', [novo, id]);
      codigo = novo;
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY' || t === 4) throw e;
    }
  }
  await atividade(req.colegioId, req.usuario.id, `Novo código de acesso gerado para ${a.nome}`);
  res.json({ codigoAcesso: codigo });
}));

/* ---------------- Excluir ---------------- */
router.delete('/:id', assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const a = await queryUm('SELECT nome FROM alunos WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  if (!a) throw new HttpErro(404, 'Aluno não encontrado', 'nao_encontrado');

  const uso = await queryUm(
    `SELECT (SELECT COUNT(*) FROM mensalidades WHERE aluno_id = ?) AS mensalidades,
            (SELECT COUNT(*) FROM notas WHERE aluno_id = ?) AS notas,
            (SELECT COUNT(*) FROM frequencias WHERE aluno_id = ?) AS frequencias,
            (SELECT COUNT(*) FROM responsavel_aluno WHERE aluno_id = ?) AS responsaveis`,
    [id, id, id, id]
  );
  if (uso.mensalidades > 0) {
    throw new HttpErro(409, `${a.nome} tem ${uso.mensalidades} mensalidade(s). Para preservar o histórico financeiro, altere o status para Inativo ou Transferido.`, 'tem_financeiro');
  }
  const deps = [];
  if (uso.notas) deps.push(`${uso.notas} lançamento(s) de notas`);
  if (uso.frequencias) deps.push(`${uso.frequencias} registro(s) de frequência`);
  if (uso.responsaveis) deps.push(`${uso.responsaveis} acesso(s) de responsável ao portal`);
  if (deps.length && req.query.forcar !== '1') {
    throw new HttpErro(409, `${a.nome} tem ${deps.join(', ')}. Tudo isso será apagado junto com o aluno.`, 'tem_vinculos');
  }

  await query('DELETE FROM alunos WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  await atividade(req.colegioId, req.usuario.id, `Aluno excluído: ${a.nome}`);
  res.status(204).end();
}));

module.exports = router;
