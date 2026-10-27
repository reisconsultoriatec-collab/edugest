'use strict';
/* =====================================================================
 *  /api/alunos — alunos do colégio atual   [módulo alunos]
 *
 *  GET    /?busca=&status=&turmaId=     lista (sem CPF/RG)
 *  GET    /:id                          ficha completa (CPF/RG decifrados) e
 *                                       pessoas autorizadas a retirar o aluno
 *  POST   /                             cadastra (RA e código PAI gerados aqui)
 *  PUT    /:id                          edita
 *  POST   /:id/novo-codigo              gera novo código PAI
 *  DELETE /:id?forcar=1                 exclui
 *
 *  Exclusão: aluno com mensalidades não pode ser excluído (preserva o
 *  financeiro — use status Inativo/Transferido). Com notas ou frequência,
 *  pede confirmação (forcar=1). Documentos já emitidos continuam no livro
 *  de registro da secretaria.
 *
 *  Campos para documentos (filiação, naturalidade, datas de matrícula e
 *  saída) só são alterados quando vêm no corpo.
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
const MAX_AUTORIZADOS = 6;

router.use(exigirModulo('alunos'));

/** Pessoas autorizadas a retirar o aluno. undefined = não alterar. */
function lerAutorizados(lista) {
  if (lista === undefined) return undefined;
  if (!Array.isArray(lista)) throw new HttpErro(400, 'Lista de autorizados inválida', 'validacao');
  if (lista.length > MAX_AUTORIZADOS) {
    throw new HttpErro(400, `Máximo de ${MAX_AUTORIZADOS} pessoas autorizadas por aluno`, 'validacao');
  }
  return lista.map((p, i) => {
    const n = i + 1;
    p = p || {};
    return {
      nome: v.texto(p.nome, `Nome do autorizado ${n}`, { max: 100, min: 3, obrigatorio: true }),
      parentesco: v.texto(p.parentesco, `Parentesco do autorizado ${n}`, { max: 30 }),
      documento: v.texto(p.documento, `Documento do autorizado ${n}`, { max: 20 }),
      telefone: v.telefone(p.telefone, `Telefone do autorizado ${n}`)
    };
  });
}

async function gravarAutorizados(conn, colegioId, alunoId, lista) {
  await conn.query('DELETE FROM autorizados_retirada WHERE aluno_id = ? AND colegio_id = ?', [alunoId, colegioId]);
  if (lista.length) {
    await conn.query(
      'INSERT INTO autorizados_retirada (colegio_id, aluno_id, nome, parentesco, documento_cript, telefone) VALUES ?',
      [lista.map((p) => [colegioId, alunoId, p.nome, p.parentesco, cifrar(p.documento), p.telefone])]
    );
  }
}

async function gravarDocumentais(conn, colegioId, alunoId, docs) {
  const cols = Object.keys(docs);
  if (!cols.length) return;
  await conn.query(
    `UPDATE alunos SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND colegio_id = ?`,
    [...cols.map((c) => docs[c]), alunoId, colegioId]
  );
}

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

/* Dados usados nos documentos (histórico, declarações). Só entram os campos
 * enviados — assim nenhuma tela antiga apaga o que a secretaria preencheu. */
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const CAMPOS_DOC = {
  maeNome: ['mae_nome', (x) => v.texto(x, 'Nome da mãe', { max: 100 })],
  paiNome: ['pai_nome', (x) => v.texto(x, 'Nome do pai', { max: 100 })],
  naturalidade: ['naturalidade', (x) => v.texto(x, 'Naturalidade', { max: 60 })],
  naturalidadeUf: ['naturalidade_uf', (x) => {
    const u = v.texto(x, 'UF da naturalidade', { max: 2 });
    if (u && !UFS.includes(u.toUpperCase())) throw new HttpErro(400, 'UF da naturalidade inválida', 'validacao');
    return u ? u.toUpperCase() : null;
  }],
  nacionalidade: ['nacionalidade', (x) => v.texto(x, 'Nacionalidade', { max: 40 })],
  dataMatricula: ['data_matricula', (x) => dataOpcional(x, 'Data de matrícula')],
  dataSaida: ['data_saida', (x) => dataOpcional(x, 'Data de saída')]
};

function dataOpcional(x, campo) {
  if (x === undefined || x === null || x === '') return null;
  if (!dataValida(String(x))) throw new HttpErro(400, `${campo} inválida`, 'validacao');
  return String(x);
}

/** { coluna: valor } só dos campos de documento presentes no corpo. */
function lerDocumentais(b) {
  const r = {};
  Object.entries(CAMPOS_DOC).forEach(([k, [col, ler]]) => { if (b[k] !== undefined) r[col] = ler(b[k]); });
  return r;
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
    responsaveisPortal: Number(a.responsaveis_portal || 0),
    autorizadosRetirada: Number(a.autorizados || 0)
  };
}

const SELECT_LISTA = `
  SELECT a.id, a.ra, a.nome, a.nascimento, a.status, a.codigo_acesso, a.turma_id,
         a.resp_nome, a.resp_parentesco, a.resp_telefone, a.resp_email,
         t.nome AS turma_nome, t.ano_letivo AS turma_ano,
         (SELECT COUNT(*) FROM responsavel_aluno ra WHERE ra.aluno_id = a.id) AS responsaveis_portal,
         (SELECT COUNT(*) FROM autorizados_retirada ar WHERE ar.aluno_id = a.id) AS autorizados
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
  const extra = await queryUm(
    `SELECT cpf_cript, rg_cript, resp_cpf_cript, endereco, mae_nome, pai_nome, naturalidade, naturalidade_uf,
            nacionalidade, data_matricula, data_saida FROM alunos WHERE id = ?`,
    [id]
  );
  const autorizados = await query(
    'SELECT id, nome, parentesco, documento_cript, telefone FROM autorizados_retirada WHERE aluno_id = ? AND colegio_id = ? ORDER BY id',
    [id, req.colegioId]
  );
  res.json({
    ...formatarLista(a),
    cpf: decifrar(extra.cpf_cript),
    rg: decifrar(extra.rg_cript),
    respCpf: decifrar(extra.resp_cpf_cript),
    endereco: extra.endereco,
    maeNome: extra.mae_nome,
    paiNome: extra.pai_nome,
    naturalidade: extra.naturalidade,
    naturalidadeUf: extra.naturalidade_uf,
    nacionalidade: extra.nacionalidade,
    dataMatricula: extra.data_matricula,
    dataSaida: extra.data_saida,
    autorizados: autorizados.map((p) => ({
      id: p.id, nome: p.nome, parentesco: p.parentesco, documento: decifrar(p.documento_cript), telefone: p.telefone
    }))
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
  const docs = lerDocumentais(req.body);
  const autorizados = lerAutorizados(req.body.autorizados) || [];
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
                               codigo_acesso, resp_nome, resp_parentesco, resp_cpf_cript, resp_telefone, resp_email)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.colegioId, ra, a.nome, a.nascimento, cifrar(a.cpf), cifrar(a.rg), a.endereco, a.turma_id, a.status,
            codigo, a.resp_nome, a.resp_parentesco, cifrar(a.resp_cpf), a.resp_telefone, a.resp_email]
        );
        await gravarDocumentais(conn, req.colegioId, r.insertId, docs);
        await gravarAutorizados(conn, req.colegioId, r.insertId, autorizados);
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
  const docs = lerDocumentais(req.body);
  const autorizados = lerAutorizados(req.body.autorizados);
  await conferirTurma(req.colegioId, a.turma_id);
  const ra = v.texto(req.body.ra, 'RA', { max: 20 }) || atual.ra;

  await transacao(async (conn) => {
    await conn.query(
      `UPDATE alunos SET ra = ?, nome = ?, nascimento = ?, cpf_cript = ?, rg_cript = ?, endereco = ?, turma_id = ?, status = ?,
              resp_nome = ?, resp_parentesco = ?, resp_cpf_cript = ?, resp_telefone = ?, resp_email = ?
        WHERE id = ? AND colegio_id = ?`,
      [ra, a.nome, a.nascimento, cifrar(a.cpf), cifrar(a.rg), a.endereco, a.turma_id, a.status,
        a.resp_nome, a.resp_parentesco, cifrar(a.resp_cpf), a.resp_telefone, a.resp_email, id, req.colegioId]
    ).catch((e) => {
      if (e.code === 'ER_DUP_ENTRY') throw new HttpErro(409, `Já existe um aluno com o RA ${ra}`, 'duplicado');
      throw e;
    });
    await gravarDocumentais(conn, req.colegioId, id, docs);
    if (autorizados !== undefined) await gravarAutorizados(conn, req.colegioId, id, autorizados);
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
            (SELECT COUNT(*) FROM responsavel_aluno WHERE aluno_id = ?) AS responsaveis,
            (SELECT COUNT(*) FROM historico_anos WHERE aluno_id = ? AND turma_id IS NULL) AS historico`,
    [id, id, id, id, id]
  );
  if (uso.mensalidades > 0) {
    throw new HttpErro(409, `${a.nome} tem ${uso.mensalidades} mensalidade(s). Para preservar o histórico financeiro, altere o status para Inativo ou Transferido.`, 'tem_financeiro');
  }
  const deps = [];
  if (uso.notas) deps.push(`${uso.notas} lançamento(s) de notas`);
  if (uso.frequencias) deps.push(`${uso.frequencias} registro(s) de frequência`);
  if (uso.responsaveis) deps.push(`${uso.responsaveis} acesso(s) de responsável ao portal`);
  if (uso.historico) deps.push(`${uso.historico} ano(s) digitado(s) no histórico escolar`);
  if (deps.length && req.query.forcar !== '1') {
    throw new HttpErro(409, `${a.nome} tem ${deps.join(', ')}. Tudo isso será apagado junto com o aluno.`, 'tem_vinculos');
  }

  await query('DELETE FROM alunos WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  await atividade(req.colegioId, req.usuario.id, `Aluno excluído: ${a.nome}`);
  res.status(204).end();
}));

module.exports = router;
