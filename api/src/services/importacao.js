'use strict';
/* =====================================================================
 *  Importação de alunos por planilha (Excel/CSV lido no navegador)
 *
 *  O navegador lê o arquivo e manda as linhas já com as colunas ligadas
 *  aos campos do EduGest. Aqui cada linha passa pelas mesmas validações
 *  do cadastro manual, mais:
 *  - datas em DD/MM/AAAA ou AAAA-MM-DD; CPF que o Excel guardou como
 *    número (sem o zero da frente) é completado;
 *  - turma pelo nome (sem diferenciar maiúsculas/acentos), no ano letivo;
 *  - duplicados: mesmo CPF, mesmo RA ou mesmo nome + nascimento, contra
 *    o que já está no colégio e dentro da própria planilha.
 *  Simular devolve o resultado de cada linha sem gravar nada. Importar
 *  grava só as linhas sem erro, numa transação, e registra a importação
 *  para poder desfazer enquanto os alunos não tiverem movimento.
 * ===================================================================== */
const { query, queryUm, transacao } = require('../db');
const { HttpErro } = require('../middleware/erros');
const { decifrar } = require('../utils/crypto');
const { dataValida } = require('../utils/datas');
const { lerAluno, inserirAluno } = require('./matricula');

const MAX_LINHAS = 2000;

/** Campos aceitos (nome do campo → como aparece para a pessoa). */
const CAMPOS = {
  nome: 'Nome do aluno', nascimento: 'Data de nascimento', cpf: 'CPF do aluno', rg: 'RG', ra: 'RA',
  turma: 'Turma', respNome: 'Nome do responsável', respParentesco: 'Parentesco', respCpf: 'CPF do responsável',
  respTelefone: 'Telefone do responsável', respEmail: 'E-mail do responsável', endereco: 'Endereço',
  maeNome: 'Nome da mãe', paiNome: 'Nome do pai', naturalidade: 'Naturalidade', naturalidadeUf: 'UF de nascimento',
  nacionalidade: 'Nacionalidade', dataMatricula: 'Data de matrícula'
};

const chave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** Nome de turma sem os sinais de ordinal: '1º Ano A', '1° ano a' e '1o ano A' → '1 ano a'. */
const chaveTurma = (s) => chave(s).replace(/[º°ª]/g, '').replace(/(\d)[oa](?=\s|$)/g, '$1').replace(/\s+/g, ' ').trim();
const texto = (x) => (x === undefined || x === null ? '' : String(x).trim());

/** '05/03/2019', '5/3/2019', '05-03-2019', '2019-03-05' → '2019-03-05'; vazio → null; inválida → false. */
function lerData(x) {
  const s = texto(x);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let iso = null;
  if (m) iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = !iso && s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return iso && dataValida(iso) ? iso : false;
}

/** CPF que o Excel guardou como número perde o zero da frente: completa até 11 dígitos. */
function lerCpf(x) {
  const s = texto(x);
  if (!s) return '';
  const d = s.replace(/\D/g, '');
  return d.length >= 9 && d.length < 11 ? d.padStart(11, '0') : s;
}

/** Linha da planilha → corpo no formato do cadastro (o que lerAluno espera) + erros de formato. */
function prepararLinha(l) {
  const erros = [];
  const corpo = {};
  ['nome', 'rg', 'endereco', 'respNome', 'respParentesco', 'respTelefone', 'respEmail',
    'maeNome', 'paiNome', 'naturalidade', 'nacionalidade', 'ra'].forEach((k) => { corpo[k] = texto(l[k]); });
  corpo.cpf = lerCpf(l.cpf);
  corpo.respCpf = lerCpf(l.respCpf);
  corpo.naturalidadeUf = texto(l.naturalidadeUf).toUpperCase().slice(0, 2);
  const nasc = lerData(l.nascimento);
  if (nasc === false) erros.push('Data de nascimento inválida (use DD/MM/AAAA)'); else corpo.nascimento = nasc;
  const mat = lerData(l.dataMatricula);
  if (mat === false) erros.push('Data de matrícula inválida (use DD/MM/AAAA)'); else corpo.dataMatricula = mat;
  if (corpo.respEmail) corpo.respEmail = corpo.respEmail.toLowerCase();
  return { corpo, erros };
}

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const limitar = (s, max) => (s ? String(s).slice(0, max) : null);

/**
 * Confere todas as linhas. Não grava nada.
 * @returns {{ anoLetivo, linhas: [{linha, nome, turma, situacao:'ok'|'erro'|'duplicado', mensagens, a, docs, ra}] }}
 */
async function conferir(colegioId, linhasPlanilha) {
  if (!Array.isArray(linhasPlanilha) || !linhasPlanilha.length) throw new HttpErro(400, 'A planilha não tem linhas para importar', 'validacao');
  if (linhasPlanilha.length > MAX_LINHAS) throw new HttpErro(400, `No máximo ${MAX_LINHAS} alunos por importação. Divida a planilha.`, 'validacao');

  const cfg = await queryUm('SELECT ano_letivo FROM config_colegio WHERE colegio_id = ?', [colegioId]);
  const anoLetivo = Number(cfg.ano_letivo);
  const [turmas, existentes] = await Promise.all([
    query('SELECT id, nome, ano_letivo FROM turmas WHERE colegio_id = ? AND ano_letivo = ?', [colegioId, anoLetivo]),
    query('SELECT id, nome, ra, nascimento, cpf_cript FROM alunos WHERE colegio_id = ?', [colegioId])
  ]);
  const turmaPorNome = new Map(turmas.map((t) => [chave(t.nome), t]));
  // Segunda tentativa, só se não houver ambiguidade: "1o ano A" ou "1° Ano A" = "1º Ano A"
  const turmaSolta = new Map();
  turmas.forEach((t) => { const k = chaveTurma(t.nome); turmaSolta.set(k, turmaSolta.has(k) ? null : t); });
  const porCpf = new Map(), porNomeNasc = new Map(), porRa = new Map();
  existentes.forEach((a) => {
    const c = String(decifrar(a.cpf_cript) || '').replace(/\D/g, '');
    if (c) porCpf.set(c, a);
    if (a.nascimento) porNomeNasc.set(`${chave(a.nome)}|${String(a.nascimento).slice(0, 10)}`, a);
    porRa.set(chave(a.ra), a);
  });
  const vistosCpf = new Map(), vistosNome = new Map(), vistosRa = new Map();

  const saida = linhasPlanilha.map((l, i) => {
    const linha = Number(l.linha) || i + 2;
    const { corpo, erros } = prepararLinha(l);
    const msgs = [...erros];
    let turmaNome = texto(l.turma) || null;
    let turmaId = null;
    if (turmaNome) {
      const t = turmaPorNome.get(chave(turmaNome)) || turmaSolta.get(chaveTurma(turmaNome));
      if (t) { turmaId = t.id; turmaNome = t.nome; } else msgs.push(`Turma "${turmaNome}" não existe em ${anoLetivo}`);
    }
    if (corpo.naturalidadeUf && !UFS.includes(corpo.naturalidadeUf)) msgs.push('UF de nascimento inválida');
    let a = null;
    try {
      a = lerAluno({ ...corpo, turmaId: turmaId || '', status: 'ativo' });
    } catch (e) {
      msgs.push(e.message);
    }
    const docs = {
      mae_nome: limitar(corpo.maeNome, 100), pai_nome: limitar(corpo.paiNome, 100), naturalidade: limitar(corpo.naturalidade, 60),
      naturalidade_uf: corpo.naturalidadeUf || null, nacionalidade: limitar(corpo.nacionalidade, 40), data_matricula: corpo.dataMatricula || null
    };
    Object.keys(docs).forEach((k) => { if (docs[k] === null || docs[k] === '') delete docs[k]; });
    const ra = corpo.ra ? corpo.ra.slice(0, 20) : null;

    // Duplicados
    let duplicado = null;
    if (a) {
      const cpf = String(a.cpf || '').replace(/\D/g, '');
      const nn = a.nascimento ? `${chave(a.nome)}|${a.nascimento}` : null;
      const ex = (cpf && porCpf.get(cpf)) || (nn && porNomeNasc.get(nn)) || (ra && porRa.get(chave(ra)));
      if (ex) duplicado = `Já cadastrado: ${ex.nome} (RA ${ex.ra})`;
      else {
        const rep = (cpf && vistosCpf.get(cpf)) || (nn && vistosNome.get(nn)) || (ra && vistosRa.get(chave(ra)));
        if (rep) duplicado = `Repetido na planilha (igual à linha ${rep})`;
      }
      if (cpf && !vistosCpf.has(cpf)) vistosCpf.set(cpf, linha);
      if (nn && !vistosNome.has(nn)) vistosNome.set(nn, linha);
      if (ra && !vistosRa.has(chave(ra))) vistosRa.set(chave(ra), linha);
    }
    const situacao = msgs.length ? 'erro' : duplicado ? 'duplicado' : 'ok';
    return {
      linha, nome: (a && a.nome) || texto(l.nome) || '', turma: turmaNome, situacao,
      mensagens: duplicado && !msgs.length ? [duplicado] : msgs,
      a, docs, ra
    };
  });
  return { anoLetivo, linhas: saida };
}

const resumo = (linhas) => ({
  total: linhas.length,
  ok: linhas.filter((l) => l.situacao === 'ok').length,
  erros: linhas.filter((l) => l.situacao === 'erro').length,
  duplicados: linhas.filter((l) => l.situacao === 'duplicado').length
});
const publica = (l) => ({ linha: l.linha, nome: l.nome, turma: l.turma, situacao: l.situacao, mensagens: l.mensagens });

async function simular(colegioId, linhas) {
  const r = await conferir(colegioId, linhas);
  return { anoLetivo: r.anoLetivo, ...resumo(r.linhas), linhas: r.linhas.map(publica) };
}

async function importar(colegioId, usuarioId, arquivo, linhas) {
  const r = await conferir(colegioId, linhas);
  const boas = r.linhas.filter((l) => l.situacao === 'ok');
  if (!boas.length) throw new HttpErro(400, 'Nenhuma linha pronta para importar. Corrija a planilha e tente de novo.', 'validacao');
  const res = await transacao(async (conn) => {
    const [ri] = await conn.query('INSERT INTO importacoes_alunos (colegio_id, arquivo, total, feita_por) VALUES (?, ?, ?, ?)',
      [colegioId, arquivo ? String(arquivo).slice(0, 160) : null, boas.length, usuarioId]);
    const criados = [];
    for (const l of boas) {
      let novo = null;
      for (let tentativa = 0; tentativa < 4 && !novo; tentativa++) {
        try {
          novo = await inserirAluno(conn, colegioId, l.a, { ra: l.ra, docs: l.docs });
        } catch (e) {
          const dup = e.code === 'ER_DUP_ENTRY' || /UNIQUE/i.test(e.message || '');
          if (!dup || tentativa === 3) throw e;
          if (l.ra && /ra/i.test(e.message)) throw new HttpErro(409, `Linha ${l.linha}: já existe um aluno com o RA ${l.ra}`, 'duplicado');
        }
      }
      await conn.query('UPDATE alunos SET importacao_id = ? WHERE id = ?', [ri.insertId, novo.id]);
      criados.push({ linha: l.linha, id: novo.id, nome: l.a.nome, ra: novo.ra, codigoAcesso: novo.codigo, turma: l.turma, respNome: l.a.resp_nome, respTelefone: l.a.resp_telefone });
    }
    return { id: ri.insertId, criados };
  });
  return { id: res.id, importados: res.criados.length, ...resumo(r.linhas), alunos: res.criados, ignoradas: r.linhas.filter((l) => l.situacao !== 'ok').map(publica) };
}

/* ---------------- Histórico e desfazer ---------------- */
async function bloqueio(colegioId, importacaoId, conn) {
  const um = async (sql, p) => {
    if (conn) { const [[x]] = await conn.query(sql, p); return x; }
    return queryUm(sql, p);
  };
  const sub = 'SELECT id FROM alunos WHERE colegio_id = ? AND importacao_id = ?';
  const checks = [
    ['SELECT COUNT(*) AS n FROM mensalidades WHERE aluno_id IN (' + sub + ')', 'têm mensalidades'],
    ['SELECT COUNT(*) AS n FROM notas WHERE aluno_id IN (' + sub + ')', 'têm notas lançadas'],
    ['SELECT COUNT(*) AS n FROM frequencias WHERE aluno_id IN (' + sub + ')', 'têm chamada registrada'],
    ['SELECT COUNT(*) AS n FROM responsavel_aluno WHERE aluno_id IN (' + sub + ')', 'já têm responsável usando o portal']
  ];
  for (const [sql, texto] of checks) {
    const r = await um(sql, [colegioId, importacaoId]);
    if (Number(r.n)) return `alunos desta importação ${texto}.`;
  }
  return null;
}

async function listar(colegioId) {
  const lista = await query(
    `SELECT i.*, u.nome AS por_nome, d.nome AS desfeita_por_nome,
            (SELECT COUNT(*) FROM alunos a WHERE a.importacao_id = i.id AND a.colegio_id = i.colegio_id) AS restantes
       FROM importacoes_alunos i LEFT JOIN usuarios u ON u.id = i.feita_por LEFT JOIN usuarios d ON d.id = i.desfeita_por
      WHERE i.colegio_id = ? ORDER BY i.id DESC LIMIT 20`,
    [colegioId]
  );
  const out = [];
  for (const i of lista) {
    const item = {
      id: i.id, arquivo: i.arquivo, total: Number(i.total), restantes: Number(i.restantes), feitaEm: i.feita_em, por: i.por_nome || null,
      desfeitaEm: i.desfeita_em || null, desfeitaPor: i.desfeita_por_nome || null, podeDesfazer: false, bloqueio: null
    };
    if (!i.desfeita_em && item.restantes) {
      item.bloqueio = await bloqueio(colegioId, i.id);
      item.podeDesfazer = !item.bloqueio;
    }
    out.push(item);
  }
  return out;
}

async function desfazer(colegioId, usuarioId, importacaoId) {
  return transacao(async (conn) => {
    const [[i]] = await conn.query('SELECT * FROM importacoes_alunos WHERE id = ? AND colegio_id = ? FOR UPDATE', [importacaoId, colegioId]);
    if (!i) throw new HttpErro(404, 'Importação não encontrada', 'nao_encontrado');
    if (i.desfeita_em) throw new HttpErro(409, 'Esta importação já foi desfeita', 'conflito');
    const b = await bloqueio(colegioId, importacaoId, conn);
    if (b) throw new HttpErro(409, `Não dá para desfazer: ${b} Exclua ou ajuste esses alunos um a um.`, 'conflito');
    const [r] = await conn.query('DELETE FROM alunos WHERE colegio_id = ? AND importacao_id = ?', [colegioId, importacaoId]);
    await conn.query('UPDATE importacoes_alunos SET desfeita_em = NOW(), desfeita_por = ? WHERE id = ?', [usuarioId, importacaoId]);
    return { removidos: r.affectedRows };
  });
}

module.exports = { CAMPOS, MAX_LINHAS, lerData, lerCpf, chaveTurma, prepararLinha, simular, importar, listar, desfazer };
