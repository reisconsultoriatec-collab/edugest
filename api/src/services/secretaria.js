'use strict';
/* =====================================================================
 *  Documentos escolares (secretaria)
 *
 *  Declarações: texto do modelo (padrão do sistema ou ajustado pelo
 *  colégio) com variáveis {aluno}, {serie}… preenchidas com os dados do
 *  aluno, da turma e do colégio. **texto** sai em negrito. Trechos entre
 *  [[ e ]] somem quando alguma variável de dentro está vazia.
 *
 *  Histórico escolar: anos feitos no EduGest (médias finais do boletim,
 *  frequência, dias letivos do calendário e carga horária da grade, com
 *  ajustes da secretaria) + anos anteriores digitados.
 *
 *  Cada documento emitido ganha número (sequência do colégio no ano) e
 *  código de validação; o conteúdo impresso fica gravado, e a 2ª via sai
 *  idêntica à original.
 * ===================================================================== */
const crypto = require('crypto');
const { query, queryUm } = require('../db');
const { decifrar } = require('../utils/crypto');
const { hojeSP, agoraSP } = require('../utils/datas');
const { dataPorExtenso, valorPorExtenso } = require('../utils/extenso');
const { montarBoletim } = require('./boletim');
const { segmentoDaSerie } = require('./comunicados');
const cal = require('./calendario');
const { minutos } = require('./grade');

/* ---------------- Modelos padrão ---------------- */
const PADRAO = {
  matricula: {
    rotulo: 'Declaração de matrícula',
    titulo: 'DECLARAÇÃO DE MATRÍCULA',
    texto: 'Declaramos, para {finalidade}, que **{aluno}**, RA {ra}[[, nascido(a) em {nascimento}]], está regularmente '
      + 'matriculado(a) nesta instituição de ensino no ano letivo de **{ano_letivo}**, cursando o(a) **{serie}**[[ ({segmento})]], '
      + 'turma {turma}, no período {turno}.\n\nPor ser verdade, firmamos a presente declaração.'
  },
  frequencia: {
    rotulo: 'Declaração de frequência',
    titulo: 'DECLARAÇÃO DE FREQUÊNCIA',
    texto: 'Declaramos, para {finalidade}, que **{aluno}**, RA {ra}, está regularmente matriculado(a) nesta instituição de '
      + 'ensino no ano letivo de **{ano_letivo}**, cursando o(a) **{serie}**[[ ({segmento})]], turma {turma}, no período {turno}, '
      + 'e que frequenta as aulas com **{frequencia}** de frequência até a presente data.\n\nPor ser verdade, firmamos a presente declaração.'
  },
  transferencia: {
    rotulo: 'Declaração de transferência',
    titulo: 'DECLARAÇÃO DE TRANSFERÊNCIA',
    texto: 'Declaramos, para {finalidade}, que **{aluno}**, RA {ra}[[, nascido(a) em {nascimento}]][[, filho(a) de {filiacao}]], '
      + 'esteve regularmente matriculado(a) nesta instituição de ensino no ano letivo de **{ano_letivo}**, cursando o(a) '
      + '**{serie}**[[ ({segmento})]], turma {turma}, e foi transferido(a) em **{data_saida}**[[, com destino a {destino}]].'
      + '\n\nDeclaramos, ainda, que nada consta em nossos registros que o(a) desabone.\n\nPor ser verdade, firmamos a presente declaração.'
  },
  conclusao: {
    rotulo: 'Declaração de conclusão',
    titulo: 'DECLARAÇÃO DE CONCLUSÃO',
    texto: 'Declaramos, para {finalidade}, que **{aluno}**, RA {ra}[[, nascido(a) em {nascimento}]][[, natural de {naturalidade}]]'
      + '[[, filho(a) de {filiacao}]], concluiu nesta instituição de ensino **{curso}** no ano letivo de **{ano_letivo}**, '
      + 'tendo cursado o(a) {serie} com aprovação.\n\nPor ser verdade, firmamos a presente declaração.'
  },
  contrato: {
    rotulo: 'Contrato de prestação de serviços',
    titulo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS',
    texto: 'Pelo presente instrumento particular, de um lado **{escola}**[[, inscrita no CNPJ sob o nº {cnpj}]][[, com sede em {endereco_escola}]], '
      + 'doravante denominada **CONTRATADA**, e de outro lado **{responsavel}**[[, CPF {responsavel_cpf}]][[, residente em {endereco}]], '
      + 'doravante denominado(a) **CONTRATANTE**, responsável pelo(a) aluno(a) **{aluno}**[[, nascido(a) em {nascimento}]], '
      + 'têm entre si justo e contratado o seguinte:'
      + '\n\n**CLÁUSULA 1ª – DO OBJETO.** O presente contrato tem por objeto a prestação de serviços educacionais ao(à) aluno(a) acima '
      + 'identificado(a) no ano letivo de **{ano_letivo}**, no(a) **{serie}**[[ ({segmento})]], turno {turno}, conforme o calendário escolar, '
      + 'o projeto pedagógico e o regimento escolar da CONTRATADA, dos quais o(a) CONTRATANTE declara ter conhecimento.'
      + '\n\n**CLÁUSULA 2ª – DO VALOR E DA FORMA DE PAGAMENTO.** Pelos serviços contratados, o(a) CONTRATANTE pagará à CONTRATADA a anuidade de '
      + '**{valor_anual}** ({valor_anual_extenso}), dividida em **{parcelas}** parcelas mensais de **{valor_mensalidade}** '
      + '({valor_mensalidade_extenso}), com vencimento no dia **{dia_vencimento}** de cada mês.'
      + '\n\n**CLÁUSULA 3ª – DO ATRASO.** O pagamento feito após o vencimento estará sujeito a multa de 2% (dois por cento) e a juros de mora '
      + 'de 1% (um por cento) ao mês.'
      + '\n\n**CLÁUSULA 4ª – DAS OBRIGAÇÕES DA CONTRATADA.** Ministrar o ensino de acordo com a legislação vigente e o seu projeto pedagógico, '
      + 'fornecer os documentos escolares do(a) aluno(a) e manter o(a) CONTRATANTE informado(a) sobre a frequência e o desempenho escolar.'
      + '\n\n**CLÁUSULA 5ª – DAS OBRIGAÇÕES DO(A) CONTRATANTE.** Efetuar os pagamentos nas datas acordadas, zelar pela frequência e pela '
      + 'pontualidade do(a) aluno(a), respeitar o regimento escolar e manter os seus dados atualizados na secretaria.'
      + '\n\n**CLÁUSULA 6ª – DA RESCISÃO.** O(A) CONTRATANTE poderá rescindir este contrato a qualquer tempo, mediante pedido por escrito à '
      + 'secretaria, ficando devidas as parcelas vencidas até o mês do pedido. Os documentos de transferência não serão retidos por '
      + 'falta de pagamento (Lei nº 9.870/1999).'
      + '\n\n**CLÁUSULA 7ª – DA VIGÊNCIA.** Este contrato vigora durante o ano letivo de {ano_letivo}.'
      + '\n\n**CLÁUSULA 8ª – DO FORO.** Fica eleito o foro da comarca de {cidade} para resolver as questões deste contrato.'
      + '\n\nE, por estarem de acordo, as partes assinam este instrumento em duas vias de igual teor, na presença das testemunhas abaixo.'
  },
  historico: {
    rotulo: 'Histórico escolar',
    titulo: 'HISTÓRICO ESCOLAR',
    texto: 'Documento expedido com base nos registros escolares desta instituição de ensino.'
  }
};
const CHAVES = Object.keys(PADRAO);
const TEXTO_NOVO_MODELO = 'Declaramos, para {finalidade}, que **{aluno}**, RA {ra}, aluno(a) do(a) {serie}, turma {turma}, '
  + 'no ano letivo de {ano_letivo}, ...\n\nPor ser verdade, firmamos a presente declaração.';

/* ---------------- Variáveis ---------------- */
const VARIAVEIS = [
  ['aluno', 'Nome do aluno', 'ficha'], ['ra', 'RA', 'ficha'], ['nascimento', 'Data de nascimento', 'ficha'],
  ['naturalidade', 'Naturalidade (cidade/UF)', 'ficha'], ['nacionalidade', 'Nacionalidade', 'ficha'],
  ['cpf', 'CPF do aluno', 'ficha'], ['rg', 'RG do aluno', 'ficha'],
  ['mae', 'Nome da mãe', 'ficha'], ['pai', 'Nome do pai', 'ficha'], ['filiacao', 'Filiação (mãe e pai)', 'ficha'],
  ['responsavel', 'Nome do responsável', 'ficha'], ['data_matricula', 'Data de matrícula', 'ficha'],
  ['serie', 'Série', 'turma'], ['turma', 'Turma', 'turma'], ['turno', 'Turno', 'turma'],
  ['segmento', 'Segmento (ex.: Ensino Fundamental – Anos Iniciais)', 'turma'],
  ['curso', 'Curso com artigo (ex.: o Ensino Fundamental)', 'turma'], ['ano_letivo', 'Ano letivo', 'turma'],
  ['frequencia', 'Frequência no ano (%)', 'diario'],
  ['data_saida', 'Data da transferência', 'emissao'], ['destino', 'Escola de destino', 'emissao'],
  ['finalidade', 'Finalidade (padrão: os devidos fins)', 'emissao'],
  ['escola', 'Nome do colégio', 'config'], ['cnpj', 'CNPJ do colégio', 'config'], ['inep', 'Código INEP', 'config'],
  ['cidade', 'Cidade do colégio', 'config'], ['data', 'Data de hoje por extenso', 'auto'],
  ['diretor', 'Nome do(a) diretor(a)', 'config'], ['secretario', 'Nome do(a) secretário(a)', 'config'],
  ['endereco', 'Endereço do aluno', 'ficha'], ['endereco_escola', 'Endereço do colégio', 'config'],
  ['responsavel_cpf', 'CPF do responsável', 'ficha'], ['responsavel_telefone', 'Telefone do responsável', 'ficha'],
  ['responsavel_email', 'E-mail do responsável', 'ficha'],
  ['valor_mensalidade', 'Valor da mensalidade', 'emissao'], ['valor_mensalidade_extenso', 'Mensalidade por extenso', 'emissao'],
  ['parcelas', 'Número de parcelas', 'emissao'], ['dia_vencimento', 'Dia do vencimento', 'emissao'],
  ['valor_anual', 'Valor anual (mensalidade × parcelas)', 'emissao'], ['valor_anual_extenso', 'Valor anual por extenso', 'emissao']
].map(([chave, rotulo, onde]) => ({ chave, rotulo, onde }));
const ROTULO_VAR = Object.fromEntries(VARIAVEIS.map((v) => [v.chave, v]));

const SEGMENTOS_DOC = {
  infantil: 'Educação Infantil', fundamental1: 'Ensino Fundamental – Anos Iniciais', fundamental2: 'Ensino Fundamental – Anos Finais',
  medio: 'Ensino Médio', eja: 'Educação de Jovens e Adultos', outros: ''
};
const CURSOS = {
  infantil: 'a Educação Infantil', fundamental1: 'os Anos Iniciais do Ensino Fundamental', fundamental2: 'o Ensino Fundamental',
  medio: 'o Ensino Médio', eja: 'a Educação de Jovens e Adultos', outros: ''
};
const RESULTADO_AUTO = { aprovado: 'Aprovado', recuperacao: 'Em recuperação', frequencia_insuficiente: 'Frequência insuficiente', em_curso: 'Cursando' };
const RESULTADOS = ['Aprovado', 'Aprovado pelo Conselho de Classe', 'Promovido', 'Retido', 'Cursando', 'Transferido', 'Em recuperação'];

/* ---------------- Formatos ---------------- */
const dataBR = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const fmtCpf = (c) => { const d = String(c || '').replace(/\D/g, ''); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : ''; };
const pct = (n) => `${Number(n).toFixed(1).replace('.', ',')}%`;
const moeda = (n) => `R$ ${Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const fmtNota = (n) => (n === null || n === undefined || n === '' ? '' : typeof n === 'number' ? n.toFixed(1).replace('.', ',') : String(n));
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const limpar = (v) => String(v ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();

/* ---------------- Código de validação ---------------- */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I/L
function gerarCodigo() {
  let s = '';
  for (let i = 0; i < 12; i++) s += ALFABETO[crypto.randomInt(ALFABETO.length)];
  return s;
}
const formatarCodigo = (c) => String(c || '').replace(/(.{4})(?=.)/g, '$1-');
function normalizarCodigo(c) {
  const s = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 12 && [...s].every((ch) => ALFABETO.includes(ch)) ? s : null;
}
const numeroDoc = (numero, ano) => `${String(numero).padStart(4, '0')}/${ano}`;

/** "Ana Clara Souza Lima" → "Ana C. S. L." (página pública de validação). */
function abreviarNome(nome) {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '';
  return [p[0], ...p.slice(1).filter((x) => !/^(da|de|do|das|dos|e)$/i.test(x)).map((x) => `${x[0].toUpperCase()}.`)].join(' ');
}

/** Endereço público do sistema (para o QR Code de validação). */
function urlBase() {
  const u = (process.env.URL_PUBLICA || String(process.env.CORS_ORIGINS || '').split(',')[0] || '').trim();
  return (u || 'https://edugest.reisconsultoriatec.com').replace(/\/+$/, '');
}
function validacao(codigo) {
  const base = urlBase();
  return { url: `${base}/validar.html?c=${codigo}`, endereco: `${base.replace(/^https?:\/\//, '')}/validar.html`, codigo: formatarCodigo(codigo) };
}

/* ---------------- Colégio ---------------- */
async function escolaDocumentos(colegioId) {
  const c = await queryUm(
    `SELECT c.nome, c.cnpj, c.telefone, c.email, c.endereco, c.inep, c.uf, c.ato_autorizacao,
            c.diretor_nome, c.diretor_registro, c.secretario_nome, c.secretario_registro,
            cfg.cidade, cfg.ano_letivo, cfg.valor_mensalidade, cfg.dia_vencimento
       FROM colegios c LEFT JOIN config_colegio cfg ON cfg.colegio_id = c.id WHERE c.id = ?`,
    [colegioId]
  );
  if (!c) return null;
  return {
    nome: c.nome, cnpj: c.cnpj, telefone: c.telefone, email: c.email, endereco: c.endereco,
    inep: c.inep, uf: c.uf, ato: c.ato_autorizacao, cidade: c.cidade, anoLetivo: c.ano_letivo,
    valorMensalidade: c.valor_mensalidade === null || c.valor_mensalidade === undefined ? null : Number(c.valor_mensalidade),
    diaVencimento: c.dia_vencimento ? Number(c.dia_vencimento) : null,
    diretor: { nome: c.diretor_nome, registro: c.diretor_registro },
    secretario: { nome: c.secretario_nome, registro: c.secretario_registro }
  };
}

/** O que falta no cabeçalho/assinaturas para os documentos saírem completos. */
function pendenciasEscola(e) {
  const f = [];
  if (!e.cidade) f.push('cidade (Configurações → Cobrança e PIX)');
  if (!e.uf) f.push('UF do colégio');
  if (!e.diretor.nome && !e.secretario.nome) f.push('nome do(a) diretor(a) ou secretário(a)');
  return f;
}

function assinaturas(e) {
  const l = [];
  if (e.secretario.nome) l.push({ nome: e.secretario.nome, cargo: 'Secretário(a) Escolar', registro: e.secretario.registro || '' });
  if (e.diretor.nome) l.push({ nome: e.diretor.nome, cargo: 'Diretor(a)', registro: e.diretor.registro || '' });
  if (!l.length) l.push({ nome: '', cargo: 'Direção / Secretaria', registro: '' });
  return l;
}

const escolaImpressa = (e) => ({
  nome: e.nome, cnpj: e.cnpj, inep: e.inep, ato: e.ato, endereco: e.endereco,
  cidade: e.cidade, uf: e.uf, telefone: e.telefone, email: e.email
});

/* ---------------- Modelos ---------------- */
async function obterModelo(colegioId, ref) {
  const r = String(ref || '');
  if (PADRAO[r]) {
    const m = await queryUm(
      'SELECT titulo, texto, atualizado_em FROM documento_modelos WHERE colegio_id = ? AND chave = ? ORDER BY id DESC LIMIT 1',
      [colegioId, r]
    );
    return {
      ref: r, chave: r, rotulo: PADRAO[r].rotulo, titulo: m ? m.titulo : PADRAO[r].titulo, texto: m ? m.texto : PADRAO[r].texto,
      personalizado: !!m, atualizadoEm: m ? m.atualizado_em : null
    };
  }
  if (!/^\d+$/.test(r)) return null;
  const m = await queryUm("SELECT id, titulo, texto, atualizado_em FROM documento_modelos WHERE id = ? AND colegio_id = ? AND chave = 'livre'", [Number(r), colegioId]);
  return m && { ref: String(m.id), chave: 'livre', rotulo: m.titulo, titulo: m.titulo, texto: m.texto, personalizado: true, atualizadoEm: m.atualizado_em };
}

async function listarModelos(colegioId) {
  const linhas = await query('SELECT id, chave, titulo, texto, atualizado_em FROM documento_modelos WHERE colegio_id = ? ORDER BY id', [colegioId]);
  const proprio = new Map();
  linhas.filter((m) => m.chave !== 'livre').forEach((m) => proprio.set(m.chave, m));
  const padrao = CHAVES.map((k) => {
    const m = proprio.get(k);
    return {
      ref: k, chave: k, rotulo: PADRAO[k].rotulo, titulo: m ? m.titulo : PADRAO[k].titulo, texto: m ? m.texto : PADRAO[k].texto,
      personalizado: !!m, atualizadoEm: m ? m.atualizado_em : null, tituloPadrao: PADRAO[k].titulo, textoPadrao: PADRAO[k].texto
    };
  });
  const livres = linhas.filter((m) => m.chave === 'livre').map((m) => ({
    ref: String(m.id), chave: 'livre', rotulo: m.titulo, titulo: m.titulo, texto: m.texto, personalizado: true, atualizadoEm: m.atualizado_em
  }));
  return [...padrao, ...livres];
}

/* ---------------- Aluno e variáveis ---------------- */
async function contextoAluno(colegioId, alunoId) {
  const a = await queryUm(
    `SELECT a.*, t.nome AS turma_nome, t.serie, t.periodo, t.ano_letivo AS turma_ano
       FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id
      WHERE a.id = ? AND a.colegio_id = ?`,
    [alunoId, colegioId]
  );
  if (!a) return null;
  const [escola, f] = await Promise.all([
    escolaDocumentos(colegioId),
    a.turma_id ? queryUm(
      `SELECT COUNT(*) AS aulas, COALESCE(SUM(f.status IN ('P', 'J')), 0) AS presentes
         FROM frequencias f JOIN diarios d ON d.id = f.diario_id WHERE f.aluno_id = ? AND d.turma_id = ?`,
      [a.id, a.turma_id]
    ) : null
  ]);
  const frequencia = f && Number(f.aulas) ? Math.round((Number(f.presentes) / Number(f.aulas)) * 1000) / 10 : null;
  return { aluno: a, escola, frequencia };
}

function valores(ctx, campos = {}) {
  const a = ctx.aluno; const e = ctx.escola;
  const seg = segmentoDaSerie(a.serie);
  return {
    aluno: a.nome, ra: a.ra, nascimento: dataBR(a.nascimento),
    naturalidade: a.naturalidade ? `${a.naturalidade}${a.naturalidade_uf ? `/${a.naturalidade_uf}` : ''}` : '',
    nacionalidade: a.nacionalidade || '', cpf: fmtCpf(decifrar(a.cpf_cript)), rg: decifrar(a.rg_cript) || '',
    mae: a.mae_nome || '', pai: a.pai_nome || '', filiacao: [a.mae_nome, a.pai_nome].filter(Boolean).join(' e '),
    responsavel: a.resp_nome || '', data_matricula: dataBR(a.data_matricula),
    serie: a.serie || '', turma: a.turma_nome || '', turno: a.periodo || '',
    segmento: a.serie ? SEGMENTOS_DOC[seg] : '', curso: a.serie ? CURSOS[seg] : '',
    ano_letivo: String(a.turma_ano || e.anoLetivo || hojeSP().slice(0, 4)),
    frequencia: ctx.frequencia === null || ctx.frequencia === undefined ? '' : pct(ctx.frequencia),
    data_saida: dataBR(campos.dataSaida || a.data_saida), destino: campos.destino || '',
    finalidade: campos.finalidade || 'os devidos fins',
    escola: e.nome, cnpj: e.cnpj || '', inep: e.inep || '', cidade: e.cidade || '', data: dataPorExtenso(hojeSP()),
    diretor: e.diretor.nome || '', secretario: e.secretario.nome || '',
    endereco: a.endereco || '', endereco_escola: enderecoEscola(e),
    responsavel_cpf: fmtCpf(decifrar(a.resp_cpf_cript)), responsavel_telefone: a.resp_telefone || '', responsavel_email: a.resp_email || '',
    ...valoresContrato(e, campos)
  };
}

function enderecoEscola(e) {
  const cid = [e.cidade, e.uf].filter(Boolean).join('/');
  if (!e.endereco) return cid;
  return cid && !semAcento(e.endereco).includes(semAcento(e.cidade)) ? `${e.endereco} – ${cid}` : e.endereco;
}

/** Valores do contrato: os da emissão ou, se não vierem, os padrões do colégio (12 parcelas). */
function valoresContrato(e, campos) {
  const valor = campos.valor !== undefined && campos.valor !== null ? Number(campos.valor) : e.valorMensalidade;
  const parcelas = campos.parcelas ? Number(campos.parcelas) : 12;
  const dia = campos.diaVencimento ? Number(campos.diaVencimento) : e.diaVencimento;
  if (!valor) return { valor_mensalidade: '', valor_mensalidade_extenso: '', parcelas: String(parcelas), dia_vencimento: dia ? String(dia) : '', valor_anual: '', valor_anual_extenso: '' };
  const anual = Math.round(valor * 100 * parcelas) / 100;
  return {
    valor_mensalidade: moeda(valor), valor_mensalidade_extenso: valorPorExtenso(valor),
    parcelas: String(parcelas), dia_vencimento: dia ? String(dia) : '',
    valor_anual: moeda(anual), valor_anual_extenso: valorPorExtenso(anual)
  };
}

/**
 * Preenche o modelo. Variável vazia fora de [[ ]] vira "—" e entra em "faltando".
 * @returns {{ texto, faltando: [{chave, rotulo, onde}], desconhecidas: string[] }}
 */
// {aluno}, {Aluno}, {série}, { ano letivo } → mesma variável (quem edita o modelo digita à mão)
const VAR = /\{\s*([^{}\n]{1,30}?)\s*\}/g;
const chaveVar = (k) => semAcento(k).replace(/[\s-]+/g, '_');

function aplicarModelo(texto, vals) {
  const faltando = new Set(); const desconhecidas = new Set();
  const valor = (k) => limpar(vals[k]);
  let s = String(texto || '').replace(/\r/g, '');
  // trechos opcionais
  s = s.replace(/\[\[([\s\S]*?)\]\]/g, (m, dentro) => {
    const vs = [...dentro.matchAll(VAR)].map((x) => chaveVar(x[1]));
    return vs.some((k) => k in vals && !valor(k)) ? '' : dentro;
  });
  s = s.replace(VAR, (m, bruto) => {
    const k = chaveVar(bruto);
    if (!(k in vals)) { desconhecidas.add(m); return m; }
    const v = valor(k);
    if (!v) { faltando.add(k); return '—'; }
    return v;
  });
  s = s.split('\n').map((l) => l.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.;:])/g, '$1').replace(/\*\*\*\*/g, '').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
  return {
    texto: s,
    faltando: [...faltando].map((k) => ROTULO_VAR[k] || { chave: k, rotulo: k, onde: '' }),
    desconhecidas: [...desconhecidas]
  };
}

const paragrafos = (texto) => String(texto || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/* ---------------- Histórico ---------------- */
async function diasLetivosDoAno(colegioId, ano, cache) {
  if (cache.has(ano)) return cache.get(ano);
  const periodos = await query('SELECT bimestre, inicio, fim FROM periodos_letivos WHERE colegio_id = ? AND ano = ? ORDER BY bimestre', [colegioId, ano]);
  let total = null;
  if (periodos.length) {
    const ini = periodos.map((p) => String(p.inicio).slice(0, 10)).sort()[0];
    const fim = periodos.map((p) => String(p.fim).slice(0, 10)).sort().pop();
    const eventos = await cal.eventosNoIntervalo(colegioId, ini, fim);
    total = cal.calcularDiasLetivos(periodos.map((p) => ({ bimestre: p.bimestre, inicio: String(p.inicio).slice(0, 10), fim: String(p.fim).slice(0, 10) })), eventos).total;
  }
  cache.set(ano, total);
  return total;
}

async function minutosSemanais(turmaId) {
  const aulas = await query(
    `SELECT h.inicio, h.fim FROM grade_horaria g JOIN horarios_aula h ON h.id = g.horario_id
      WHERE g.turma_id = ? AND g.disciplina_id IS NOT NULL`,
    [turmaId]
  );
  return aulas.reduce((s, x) => s + minutos(String(x.fim).slice(0, 5)) - minutos(String(x.inicio).slice(0, 5)), 0);
}

const lerDisciplinas = (txt) => {
  try { const l = typeof txt === 'string' ? JSON.parse(txt) : txt; return Array.isArray(l) ? l : []; } catch (e) { return []; }
};

/**
 * Anos do histórico do aluno, em ordem.
 * origem 'sistema': turma do EduGest (médias e frequência calculadas) + ajustes
 * origem 'manual' : ano anterior digitado pela secretaria
 */
async function anosDoHistorico(colegioId, aluno, escola) {
  const [turmas, linhas] = await Promise.all([
    query(
      `SELECT t.id, t.nome, t.serie, t.periodo, t.ano_letivo FROM turmas t
        WHERE t.colegio_id = ? AND (t.id = ?
           OR t.id IN (SELECT n.turma_id FROM notas n WHERE n.aluno_id = ?)
           OR t.id IN (SELECT d.turma_id FROM frequencias f JOIN diarios d ON d.id = f.diario_id WHERE f.aluno_id = ?))`,
      [colegioId, aluno.turma_id || 0, aluno.id, aluno.id]
    ),
    query('SELECT * FROM historico_anos WHERE aluno_id = ? AND colegio_id = ? ORDER BY ano, id', [aluno.id, colegioId])
  ]);
  const cache = new Map();
  const sistema = [];
  for (const t of turmas) {
    const b = await montarBoletim(colegioId, aluno, t);
    const aj = linhas.find((x) => x.turma_id === t.id);
    const dias = await diasLetivosDoAno(colegioId, t.ano_letivo, cache);
    const min = await minutosSemanais(t.id);
    const ch = dias && min ? Math.round((min * (dias / 5)) / 60) : null;
    let resultado = RESULTADO_AUTO[b.situacaoGeral] || 'Cursando';
    if (resultado === 'Cursando' && aluno.status === 'transferido' && t.id === aluno.turma_id) resultado = 'Transferido';
    sistema.push({
      origem: 'sistema', turmaId: t.id, turma: t.nome, ano: Number(t.ano_letivo), serie: t.serie,
      escola: escola.nome, cidade: escola.cidade || '', uf: escola.uf || '',
      diasLetivos: aj && aj.dias_letivos !== null ? Number(aj.dias_letivos) : dias,
      cargaHoraria: aj && aj.carga_horaria !== null ? Number(aj.carga_horaria) : ch,
      frequencia: b.frequencia.percentual,
      resultado: (aj && aj.resultado) || resultado,
      observacao: aj ? aj.observacao || '' : '',
      disciplinas: b.disciplinas.filter((d) => d.mediaFinal !== null).map((d) => ({ nome: d.nome, nota: fmtNota(d.mediaFinal) })),
      automatico: { diasLetivos: dias, cargaHoraria: ch, resultado },
      ajustado: !!aj
    });
  }
  const manuais = linhas.filter((x) => !x.turma_id).map((x) => ({
    origem: 'manual', id: x.id, ano: Number(x.ano), serie: x.serie, escola: x.escola || '', cidade: x.cidade || '', uf: x.uf || '',
    diasLetivos: x.dias_letivos === null ? null : Number(x.dias_letivos),
    cargaHoraria: x.carga_horaria === null ? null : Number(x.carga_horaria),
    frequencia: x.frequencia === null ? null : Number(x.frequencia),
    resultado: x.resultado || '', observacao: x.observacao || '',
    disciplinas: lerDisciplinas(x.disciplinas).map((d) => ({ nome: limpar(d.nome), nota: limpar(d.nota) })).filter((d) => d.nome)
  }));
  return [...manuais, ...sistema].sort((a, b) => a.ano - b.ano || String(a.serie).localeCompare(String(b.serie), 'pt-BR'));
}

/**
 * Tabela do histórico: disciplinas × anos. Nomes e ordem das disciplinas do
 * colégio vêm primeiro; as que só existem nos anos digitados entram depois.
 */
function matrizHistorico(anos) {
  const ordem = []; const nomes = new Map();
  [...anos.filter((a) => a.origem === 'sistema'), ...anos.filter((a) => a.origem !== 'sistema')].forEach((a) => a.disciplinas.forEach((d) => {
    const k = semAcento(d.nome);
    if (!nomes.has(k)) { nomes.set(k, d.nome); ordem.push(k); }
  }));
  return {
    colunas: anos.map((a) => ({
      ano: a.ano, serie: a.serie, cargaHoraria: a.cargaHoraria, diasLetivos: a.diasLetivos,
      frequencia: a.frequencia === null || a.frequencia === undefined ? '' : pct(a.frequencia), resultado: a.resultado || ''
    })),
    linhas: ordem.map((k) => ({
      disciplina: nomes.get(k),
      notas: anos.map((a) => { const d = a.disciplinas.find((x) => semAcento(x.nome) === k); return d ? d.nota : ''; })
    }))
  };
}

/* ---------------- Conteúdo impresso ---------------- */
function base(ctx, titulo) {
  return {
    versao: 1, titulo, escola: escolaImpressa(ctx.escola),
    aluno: { nome: ctx.aluno.nome, ra: ctx.aluno.ra },
    local: ctx.escola.cidade || '', data: dataPorExtenso(hojeSP()),
    assinaturas: assinaturas(ctx.escola)
  };
}

/** Declaração pronta (prévia ou emissão). textoEditado: texto ajustado só para este documento. */
async function montarDeclaracao(colegioId, ctx, modelo, campos, { textoEditado, tituloEditado } = {}) {
  const vals = valores(ctx, campos);
  const titulo = limpar(tituloEditado || modelo.titulo).toUpperCase().slice(0, 120) || modelo.titulo;
  const r = aplicarModelo(textoEditado !== undefined && textoEditado !== null ? textoEditado : modelo.texto, vals);
  const conteudo = { ...base(ctx, titulo), tipo: modelo.chave, paragrafos: paragrafos(r.texto) };
  if (modelo.chave === 'contrato') {
    const e = ctx.escola;
    conteudo.assinaturas = [
      { nome: ctx.aluno.resp_nome || '', cargo: 'CONTRATANTE', registro: vals.responsavel_cpf ? `CPF ${vals.responsavel_cpf}` : '' },
      { nome: e.nome, cargo: 'CONTRATADA', registro: e.cnpj ? `CNPJ ${e.cnpj}` : '' },
      { nome: '', cargo: 'Testemunha', registro: 'Nome e CPF:' },
      { nome: '', cargo: 'Testemunha', registro: 'Nome e CPF:' }
    ];
  }
  return { titulo, texto: r.texto, faltando: r.faltando, desconhecidas: r.desconhecidas, conteudo };
}

async function montarHistorico(colegioId, ctx, modelo, { observacao, tituloEditado, textoEditado } = {}) {
  const a = ctx.aluno;
  const anos = await anosDoHistorico(colegioId, a, ctx.escola);
  const titulo = limpar(tituloEditado || modelo.titulo).toUpperCase().slice(0, 120) || modelo.titulo;
  const obsModelo = aplicarModelo(textoEditado !== undefined && textoEditado !== null ? textoEditado : modelo.texto, valores(ctx, {}));
  const observacoes = [
    ...paragrafos(obsModelo.texto),
    ...paragrafos(observacao),
    ...anos.filter((x) => x.observacao).map((x) => `${x.ano} · ${x.serie}: ${x.observacao}`)
  ];
  const nat = a.naturalidade ? `${a.naturalidade}${a.naturalidade_uf ? `/${a.naturalidade_uf}` : ''}` : '';
  const identificacao = [
    ['Aluno(a)', a.nome], ['RA', a.ra], ['Data de nascimento', dataBR(a.nascimento)], ['Naturalidade', nat],
    ['Nacionalidade', a.nacionalidade || ''], ['CPF', fmtCpf(decifrar(a.cpf_cript))], ['RG', decifrar(a.rg_cript) || ''],
    ['Filiação', [a.mae_nome, a.pai_nome].filter(Boolean).join(' e ')]
  ];
  const faltando = [];
  if (!a.nascimento) faltando.push(ROTULO_VAR.nascimento);
  if (!a.naturalidade) faltando.push(ROTULO_VAR.naturalidade);
  if (!a.mae_nome && !a.pai_nome) faltando.push(ROTULO_VAR.filiacao);
  const avisos = [];
  if (!anos.length) avisos.push('O aluno ainda não tem notas no EduGest nem anos anteriores digitados.');
  anos.filter((x) => x.origem === 'sistema' && x.resultado === 'Cursando').forEach((x) => avisos.push(`${x.ano} (${x.serie}) ainda está em curso.`));
  anos.filter((x) => x.origem === 'sistema' && !x.cargaHoraria).forEach((x) => avisos.push(`${x.ano} (${x.serie}): sem carga horária (monte a grade horária e os bimestres do calendário, ou ajuste no histórico).`));
  const ultimo = anos[anos.length - 1];
  const seg = segmentoDaSerie((ultimo && ultimo.serie) || a.serie);
  return {
    titulo, anos, faltando, avisos, desconhecidas: obsModelo.desconhecidas,
    conteudo: {
      ...base(ctx, titulo), tipo: 'historico', subtitulo: SEGMENTOS_DOC[seg] || '',
      identificacao, matriz: matrizHistorico(anos),
      estudos: anos.map((x) => ({ ano: x.ano, serie: x.serie, escola: x.escola, cidade: [x.cidade, x.uf].filter(Boolean).join('/') })),
      observacoes
    }
  };
}

/* ---------------- Registro ---------------- */
/**
 * Grava no livro de registro (numeração por colégio e ano) dentro da transação.
 * @returns {{ id, numero, ano, codigo, conteudo }}
 */
async function registrar(conn, colegioId, usuario, { tipo, titulo, aluno, finalidade, conteudo }) {
  const agora = agoraSP();
  const ano = Number(agora.slice(0, 4));
  const [[m]] = await conn.query('SELECT MAX(numero) AS n FROM documentos_emitidos WHERE colegio_id = ? AND ano = ? FOR UPDATE', [colegioId, ano]);
  const numero = Number(m.n || 0) + 1;
  for (let t = 0; ; t++) {
    const codigo = gerarCodigo();
    const final = {
      ...conteudo,
      numero: numeroDoc(numero, ano),
      emitidoEm: `${dataBR(agora)} às ${agora.slice(11, 16)}`,
      emitidoPor: usuario.nome || '',
      validacao: validacao(codigo)
    };
    try {
      const [r] = await conn.query(
        `INSERT INTO documentos_emitidos (colegio_id, ano, numero, codigo, tipo, titulo, aluno_id, aluno_nome, aluno_ra, finalidade,
                                          conteudo, emitido_por, emitido_por_nome, emitido_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [colegioId, ano, numero, codigo, tipo, titulo.slice(0, 120), aluno.id, aluno.nome, aluno.ra, finalidade || null,
          JSON.stringify(final), usuario.id, usuario.nome || null, agora]
      );
      return { id: r.insertId, numero, ano, codigo, conteudo: final };
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY' || !/codigo/.test(e.message) || t >= 3) throw e;
    }
  }
}

/** Situação do documento para a página pública de validação. */
async function validarCodigo(texto) {
  const codigo = normalizarCodigo(texto);
  if (!codigo) return null;
  const d = await queryUm(
    `SELECT d.ano, d.numero, d.titulo, d.aluno_nome, d.emitido_em, d.cancelado_em, d.motivo_cancelamento, c.nome AS escola
       FROM documentos_emitidos d JOIN colegios c ON c.id = d.colegio_id WHERE d.codigo = ?`,
    [codigo]
  );
  if (!d) return null;
  return {
    situacao: d.cancelado_em ? 'cancelado' : 'valido',
    documento: d.titulo, numero: numeroDoc(d.numero, d.ano), escola: d.escola, aluno: abreviarNome(d.aluno_nome),
    emitidoEm: dataBR(d.emitido_em), canceladoEm: d.cancelado_em ? dataBR(d.cancelado_em) : null,
    motivo: d.cancelado_em ? d.motivo_cancelamento || '' : null, codigo: formatarCodigo(codigo)
  };
}

module.exports = {
  PADRAO, CHAVES, TEXTO_NOVO_MODELO, VARIAVEIS, RESULTADOS, SEGMENTOS_DOC, CURSOS,
  dataBR, fmtNota, gerarCodigo, formatarCodigo, normalizarCodigo, numeroDoc, abreviarNome, urlBase, validacao,
  escolaDocumentos, pendenciasEscola, assinaturas, obterModelo, listarModelos,
  contextoAluno, valores, aplicarModelo, paragrafos, anosDoHistorico, matrizHistorico,
  montarDeclaracao, montarHistorico, registrar, validarCodigo, lerDisciplinas
};
