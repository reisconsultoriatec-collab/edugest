'use strict';
/* =====================================================================
 *  Cadastro de aluno — o mesmo para a tela de Alunos e para a matrícula
 *  feita pelo Funil: RA sequencial do ano (AAAA0001…) e código de acesso
 *  do responsável (PAI…). Roda dentro da transação de quem chama; quem
 *  chama repete em caso de ER_DUP_ENTRY (dois cadastros ao mesmo tempo).
 * ===================================================================== */
const { cifrar } = require('../utils/crypto');
const { codigoAcessoAluno } = require('../utils/codigos');
const { hojeSP, dataValida } = require('../utils/datas');
const { HttpErro } = require('../middleware/erros');
const v = require('../utils/validar');

const STATUS = ['ativo', 'inativo', 'transferido'];

/** Dados do aluno vindos do formulário (validados). */
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
    resp_cpf: v.cpf(b.respCpf, 'CPF do responsável'),
    resp_telefone: v.telefone(b.respTelefone, 'Telefone do responsável'),
    resp_email: v.email(b.respEmail, 'E-mail do responsável')
  };
}


async function proximoRA(conn, colegioId, ano) {
  const [[r]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING(ra, 5) AS UNSIGNED)) AS ultimo
       FROM alunos WHERE colegio_id = ? AND ra REGEXP ? FOR UPDATE`,
    [colegioId, `^${ano}[0-9]{4,}$`]
  );
  return `${ano}${String(Number(r.ultimo || 0) + 1).padStart(4, '0')}`;
}

/**
 * @param a     colunas já validadas: nome, nascimento, cpf, rg, endereco, turma_id, status,
 *              resp_nome, resp_parentesco, resp_cpf, resp_telefone, resp_email
 * @param docs  { coluna: valor } dos campos de documentos (mae_nome, data_matricula…)
 * @returns {{ id, ra, codigo }}
 */
async function inserirAluno(conn, colegioId, a, { ra = null, docs = {} } = {}) {
  const raFinal = ra || await proximoRA(conn, colegioId, hojeSP().slice(0, 4));
  const codigo = codigoAcessoAluno();
  const [r] = await conn.query(
    `INSERT INTO alunos (colegio_id, ra, nome, nascimento, cpf_cript, rg_cript, endereco, turma_id, status,
                         codigo_acesso, resp_nome, resp_parentesco, resp_cpf_cript, resp_telefone, resp_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [colegioId, raFinal, a.nome, a.nascimento || null, cifrar(a.cpf || null), cifrar(a.rg || null), a.endereco || null,
      a.turma_id || null, a.status || 'ativo', codigo, a.resp_nome || null, a.resp_parentesco || null,
      cifrar(a.resp_cpf || null), a.resp_telefone || null, a.resp_email || null]
  );
  const cols = Object.keys(docs);
  if (cols.length) {
    await conn.query(`UPDATE alunos SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => docs[c]), r.insertId]);
  }
  return { id: r.insertId, ra: raFinal, codigo };
}

module.exports = { STATUS, lerAluno, proximoRA, inserirAluno };
