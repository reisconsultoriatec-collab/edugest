'use strict';
/* =====================================================================
 *  Comunicados — regras de público, leitura e WhatsApp
 *
 *  Público (alcance):
 *    todos      → famílias de todos os alunos ativos
 *    segmentos  → alunos ativos cujas turmas são do segmento (pela série)
 *    turmas     → alunos ativos das turmas escolhidas
 *  Destinatários no portal = contas de responsável ATIVAS ligadas a algum
 *  aluno do público. A leitura é por conta (um responsável com dois
 *  filhos conta uma vez).
 *  WhatsApp = telefone do responsável na ficha do aluno, agrupado por
 *  número (irmãos viram uma mensagem só).
 * ===================================================================== */
const { query } = require('../db');
const { hojeSP } = require('../utils/datas');

const TIPOS = { aviso: 'Aviso', circular: 'Circular', evento: 'Evento', urgente: 'Urgente' };
const ALCANCES = ['todos', 'segmentos', 'turmas'];
const SEGMENTOS = {
  infantil: 'Educação Infantil',
  fundamental1: 'Fundamental I',
  fundamental2: 'Fundamental II',
  medio: 'Ensino Médio',
  eja: 'EJA',
  outros: 'Outras turmas'
};

/** Segmento pela série da turma (Berçário…Infantil III, 1º–5º, 6º–9º, Série EM, EJA). */
function segmentoDaSerie(serie) {
  const s = String(serie || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/\beja\b/.test(s)) return 'eja';
  if (/bercario|maternal|infantil|\bpre\b/.test(s)) return 'infantil';
  const ano = s.match(/^(\d{1,2})\s*[ºo°]?\s*ano\b/);
  if (ano) return Number(ano[1]) <= 5 ? 'fundamental1' : 'fundamental2';
  if (/serie\s*em\b|ensino medio|\bem$/.test(s)) return 'medio';
  return 'outros';
}

const listaSegmentos = (txt) => String(txt || '').split(',').map((x) => x.trim()).filter((x) => SEGMENTOS[x]);

/** Turmas do colégio (com segmento) e turmas de cada comunicado. */
async function contexto(colegioId) {
  const [turmas, comTurmas] = await Promise.all([
    query('SELECT id, nome, serie, ativo FROM turmas WHERE colegio_id = ?', [colegioId]),
    query(
      `SELECT ct.comunicado_id, ct.turma_id FROM comunicado_turmas ct
         JOIN comunicados c ON c.id = ct.comunicado_id WHERE c.colegio_id = ?`,
      [colegioId]
    )
  ]);
  const mapaTurmas = new Map(turmas.map((t) => [t.id, { id: t.id, nome: t.nome, serie: t.serie, ativo: !!t.ativo, segmento: segmentoDaSerie(t.serie) }]));
  const turmasDe = new Map();
  comTurmas.forEach((x) => {
    if (!turmasDe.has(x.comunicado_id)) turmasDe.set(x.comunicado_id, []);
    turmasDe.get(x.comunicado_id).push(x.turma_id);
  });
  return { turmas: mapaTurmas, turmasDe };
}

/** O aluno (pela turma atual) está no público do comunicado? */
function noPublico(com, turmaId, ctx) {
  if (com.alcance === 'todos') return true;
  if (!turmaId) return false;
  if (com.alcance === 'turmas') return (ctx.turmasDe.get(com.id) || []).includes(turmaId);
  const t = ctx.turmas.get(turmaId);
  return !!t && listaSegmentos(com.segmentos).includes(t.segmento);
}

/** Texto do público: "Colégio todo", "Fundamental I, Ensino Médio" ou "5º Ano A, 5º Ano B". */
function descreverPublico(com, ctx) {
  if (com.alcance === 'todos') return 'Colégio todo';
  if (com.alcance === 'segmentos') return listaSegmentos(com.segmentos).map((s) => SEGMENTOS[s]).join(', ') || '—';
  const nomes = (ctx.turmasDe.get(com.id) || []).map((id) => (ctx.turmas.get(id) || {}).nome).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return nomes.join(', ') || '—';
}

/** Contas de responsável ativas do colégio, com os alunos ativos de cada uma. */
function vinculosResponsaveis(colegioId) {
  return query(
    `SELECT ra.usuario_id, u.nome, u.email, a.id AS aluno_id, a.nome AS aluno, a.turma_id
       FROM responsavel_aluno ra
       JOIN usuario_colegio uc ON uc.usuario_id = ra.usuario_id AND uc.colegio_id = ra.colegio_id
                              AND uc.perfil = 'responsavel' AND uc.status = 'ativo'
       JOIN usuarios u ON u.id = ra.usuario_id
       JOIN alunos a ON a.id = ra.aluno_id AND a.colegio_id = ra.colegio_id AND a.status = 'ativo'
      WHERE ra.colegio_id = ?
      ORDER BY u.nome, a.nome`,
    [colegioId]
  );
}

/** Map usuario_id → { id, nome, email, alunos[] } dos destinatários no portal. */
function destinatarios(com, vinculos, ctx) {
  const mapa = new Map();
  vinculos.forEach((l) => {
    if (!noPublico(com, l.turma_id, ctx)) return;
    if (!mapa.has(l.usuario_id)) mapa.set(l.usuario_id, { id: l.usuario_id, nome: l.nome, email: l.email, alunos: [] });
    mapa.get(l.usuario_id).alunos.push(l.aluno);
  });
  return mapa;
}

/** Leituras do colégio agrupadas: Map comunicado_id → Map usuario_id → { lidoEm, cienteEm }. */
async function leiturasDoColegio(colegioId, comunicadoId) {
  const linhas = await query(
    `SELECT comunicado_id, usuario_id, lido_em, ciente_em FROM comunicado_leituras
      WHERE colegio_id = ?${comunicadoId ? ' AND comunicado_id = ?' : ''}`,
    comunicadoId ? [colegioId, comunicadoId] : [colegioId]
  );
  const mapa = new Map();
  linhas.forEach((l) => {
    if (!mapa.has(l.comunicado_id)) mapa.set(l.comunicado_id, new Map());
    mapa.get(l.comunicado_id).set(l.usuario_id, { lidoEm: l.lido_em, cienteEm: l.ciente_em });
  });
  return mapa;
}

/** Números de leitura de um comunicado (só conta quem está no público atual). */
function resumoLeitura(com, dest, leituras) {
  const lidas = leituras.get(com.id) || new Map();
  let lidos = 0, cientes = 0;
  dest.forEach((d) => {
    const l = lidas.get(d.id);
    if (l) { lidos++; if (l.cienteEm) cientes++; }
  });
  return { destinatarios: dest.size, lidos, cientes: com.exige_ciencia ? cientes : null };
}

const digitos = (s) => String(s || '').replace(/\D/g, '');

/**
 * Famílias para o WhatsApp: telefone do responsável na ficha do aluno,
 * agrupado por número. "lido" = alguma conta do portal ligada a esses
 * alunos já leu.
 */
async function familiasWhatsApp(colegioId, com, ctx, vinculos, lidas) {
  const alunos = await query(
    `SELECT id, nome, turma_id, resp_nome, resp_telefone FROM alunos
      WHERE colegio_id = ? AND status = 'ativo' ORDER BY nome`,
    [colegioId]
  );
  const leitoresPorAluno = new Map();
  vinculos.forEach((l) => {
    if (!leitoresPorAluno.has(l.aluno_id)) leitoresPorAluno.set(l.aluno_id, []);
    leitoresPorAluno.get(l.aluno_id).push(l.usuario_id);
  });
  const porTel = new Map();
  let semTelefone = 0;
  alunos.filter((a) => noPublico(com, a.turma_id, ctx)).forEach((a) => {
    const tel = digitos(a.resp_telefone);
    if (tel.length < 10) { semTelefone++; return; }
    if (!porTel.has(tel)) porTel.set(tel, { telefone: a.resp_telefone, nome: a.resp_nome || null, alunos: [], lido: false, temPortal: false });
    const f = porTel.get(tel);
    const turma = ctx.turmas.get(a.turma_id);
    f.alunos.push(turma ? `${a.nome} (${turma.nome})` : a.nome);
    const leitores = leitoresPorAluno.get(a.id) || [];
    if (leitores.length) f.temPortal = true;
    if (leitores.some((u) => lidas.has(u))) f.lido = true;
  });
  const familias = [...porTel.values()].sort((x, y) => (x.lido - y.lido) || String(x.nome || '').localeCompare(String(y.nome || ''), 'pt-BR'));
  return { familias, semTelefone };
}

/**
 * Comunicados que o responsável vê (não expirados), com os filhos de cada
 * um e a leitura dele. Fixados primeiro, depois os mais novos.
 * @param filhos linhas de alunos ligados ao responsável (id, nome, status, turma_id)
 */
async function visiveisParaResponsavel(colegioId, usuarioId, filhos) {
  const ativos = filhos.filter((a) => a.status === 'ativo');
  if (!ativos.length) return [];
  const [coms, ctx, leituras] = await Promise.all([
    query(
      `SELECT c.id, c.titulo, c.tipo, c.alcance, c.segmentos, c.mensagem, c.fixado, c.exige_ciencia, c.expira_em,
              c.criado_em, c.atualizado_em, u.nome AS autor
         FROM comunicados c LEFT JOIN usuarios u ON u.id = c.publicado_por
        WHERE c.colegio_id = ? AND (c.expira_em IS NULL OR c.expira_em >= ?)
        ORDER BY c.criado_em DESC
        LIMIT 300`,
      [colegioId, hojeSP()]
    ),
    contexto(colegioId),
    query('SELECT comunicado_id, lido_em, ciente_em FROM comunicado_leituras WHERE usuario_id = ? AND colegio_id = ?', [usuarioId, colegioId])
  ]);
  const minhas = new Map(leituras.map((l) => [l.comunicado_id, l]));
  return coms
    .map((c) => ({ c, para: ativos.filter((a) => noPublico(c, a.turma_id, ctx)) }))
    .filter((x) => x.para.length)
    .map(({ c, para }) => {
      const l = minhas.get(c.id);
      return {
        id: c.id,
        titulo: c.titulo,
        tipo: c.tipo,
        mensagem: c.mensagem,
        fixado: !!c.fixado,
        exigeCiencia: !!c.exige_ciencia,
        expiraEm: c.expira_em,
        criadoEm: c.criado_em,
        atualizadoEm: c.atualizado_em,
        autor: c.autor,
        para: para.map((a) => a.nome),
        lidoEm: l ? l.lido_em : null,
        cienteEm: l ? l.ciente_em : null
      };
    })
    .sort((x, y) => (y.fixado - x.fixado) || String(y.criadoEm).localeCompare(String(x.criadoEm)));
}

module.exports = {
  TIPOS, ALCANCES, SEGMENTOS, segmentoDaSerie, listaSegmentos, contexto, noPublico, descreverPublico,
  vinculosResponsaveis, destinatarios, leiturasDoColegio, resumoLeitura, familiasWhatsApp, visiveisParaResponsavel
};
