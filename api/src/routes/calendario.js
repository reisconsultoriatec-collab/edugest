'use strict';
/* =====================================================================
 *  /api/calendario — calendário escolar   [módulo calendario]
 *
 *  GET    /opcoes                tipos, segmentos, turmas, ano letivo
 *  GET    /?inicio=&fim=&tipo=&turmaId=   eventos que tocam o intervalo
 *  GET    /proximos?dias=&limite=         próximos eventos (Dashboard)
 *  GET    /ano-letivo?ano=       bimestres e dias letivos
 *  PUT    /ano-letivo            { ano, bimestres: [{ bimestre, inicio, fim }] }
 *  GET    /feriados?ano=         feriados nacionais do ano (e quais já estão no calendário)
 *  POST   /feriados              { ano, datas: [...] } inclui os escolhidos
 *  GET    /:id · POST / · PUT /:id · DELETE /:id
 *
 *  Professor: cadastra evento, prova e reunião só para as turmas
 *  atribuídas a ele e só altera os próprios. Feriados, recessos, dias
 *  letivos extras e os bimestres ficam com a coordenação.
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm, transacao } = require('../db');
const { exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade } = require('../utils/auditoria');
const { hojeSP, agoraSP, dataValida } = require('../utils/datas');
const { escopo } = require('../services/escopo');
const { SEGMENTOS, ALCANCES, segmentoDaSerie, noPublico } = require('../services/comunicados');
const cal = require('../services/calendario');

const modulo = exigirModulo('calendario');
const naoProfessor = (req, res, next) => (req.perfil === 'professor'
  ? next(new HttpErro(403, 'Somente a coordenação altera feriados, recessos e bimestres', 'perfil'))
  : next());
const podeGerir = (req, e) => req.perfil !== 'professor' || e.criado_por === req.usuario.id;

function lerData(valor, campo, obrigatorio) {
  if (!valor) {
    if (obrigatorio) throw new HttpErro(400, `${campo} é obrigatória`, 'validacao');
    return null;
  }
  if (!dataValida(valor)) throw new HttpErro(400, `${campo} inválida`, 'validacao');
  return valor;
}
function lerHora(valor, campo) {
  if (!valor) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(valor))) throw new HttpErro(400, `${campo} inválida (use HH:MM)`, 'validacao');
  return valor;
}

async function anoLetivoAtual(colegioId) {
  const c = await queryUm('SELECT ano_letivo FROM config_colegio WHERE colegio_id = ?', [colegioId]);
  return c && c.ano_letivo ? Number(c.ano_letivo) : Number(hojeSP().slice(0, 4));
}

async function buscar(req, id) {
  const e = await queryUm(
    `SELECT e.*, u.nome AS autor FROM eventos e LEFT JOIN usuarios u ON u.id = e.criado_por
      WHERE e.id = ? AND e.colegio_id = ?`,
    [id, req.colegioId]
  );
  if (!e) throw new HttpErro(404, 'Evento não encontrado', 'nao_encontrado');
  return e;
}

/** Valida o corpo de criar/editar. */
async function lerCorpo(req) {
  const b = req.body;
  const esc = await escopo(req);
  const tiposPermitidos = esc.restrito ? cal.TIPOS_PROFESSOR : cal.TIPOS_FORM;
  const d = {
    titulo: v.texto(b.titulo, 'Título', { max: 150, min: 3, obrigatorio: true }),
    tipo: v.umDe(b.tipo || 'evento', tiposPermitidos, 'Tipo'),
    data: lerData(b.data, 'Data', true),
    dataFim: lerData(b.dataFim, 'Data final', false),
    horaInicio: lerHora(b.horaInicio, 'Hora de início'),
    horaFim: lerHora(b.horaFim, 'Hora de término'),
    lugar: v.texto(b.lugar, 'Local', { max: 120 }),
    descricao: v.texto(b.descricao, 'Descrição', { max: 1000 }),
    alcance: v.umDe(b.alcance || 'todos', ALCANCES, 'Público'),
    segmentos: null,
    turmas: [],
    visivelFamilias: b.visivelFamilias === undefined ? (b.tipo !== 'conselho') : !!b.visivelFamilias
  };
  if (d.dataFim === d.data) d.dataFim = null;
  if (d.dataFim) {
    if (d.dataFim < d.data) throw new HttpErro(400, 'A data final não pode ser antes da data de início', 'validacao');
    if (cal.diasEntre(d.data, d.dataFim) > 366) throw new HttpErro(400, 'Um evento pode durar no máximo um ano', 'validacao');
  }
  if (d.horaFim && !d.horaInicio) throw new HttpErro(400, 'Informe a hora de início', 'validacao');
  if (d.horaFim && !d.dataFim && d.horaFim <= d.horaInicio) throw new HttpErro(400, 'A hora de término precisa ser depois da hora de início', 'validacao');

  if (d.alcance === 'segmentos') {
    const lista = [...new Set((Array.isArray(b.segmentos) ? b.segmentos : []).filter((s) => SEGMENTOS[s]))];
    if (!lista.length) throw new HttpErro(400, 'Escolha pelo menos um segmento', 'validacao');
    d.segmentos = lista.join(',');
  }
  if (d.alcance === 'turmas') {
    const ids = [...new Set((Array.isArray(b.turmas) ? b.turmas : []).map(Number))];
    if (!ids.length || ids.some((n) => !Number.isInteger(n) || n <= 0)) throw new HttpErro(400, 'Escolha pelo menos uma turma', 'validacao');
    const achadas = await query(`SELECT id, nome FROM turmas WHERE colegio_id = ? AND id IN (${ids.map(() => '?').join(',')})`, [req.colegioId, ...ids]);
    if (achadas.length !== ids.length) throw new HttpErro(400, 'Turma inválida', 'validacao');
    d.turmas = ids;
    d.nomesTurmas = new Map(achadas.map((t) => [t.id, t.nome]));
  }

  if (esc.restrito) {
    if (!esc.vinculado) throw new HttpErro(403, 'Seu login ainda não está ligado a um cadastro de professor. Peça ao administrador (Sistema › Usuários).', 'escopo');
    if (d.alcance !== 'turmas') throw new HttpErro(403, 'Professor cadastra eventos só para as turmas em que leciona. Escolha as turmas.', 'escopo');
    const fora = d.turmas.find((id) => !esc.turmas.has(id));
    if (fora) throw new HttpErro(403, `A turma ${d.nomesTurmas.get(fora)} não está atribuída a você`, 'escopo');
  }
  return d;
}

async function gravarTurmas(conn, eventoId, turmas) {
  await conn.query('DELETE FROM evento_turmas WHERE evento_id = ?', [eventoId]);
  if (turmas.length) await conn.query('INSERT INTO evento_turmas (evento_id, turma_id) VALUES ?', [turmas.map((t) => [eventoId, t])]);
}

/* ---------------- Opções ---------------- */
router.get('/opcoes', modulo, assincrono(async (req, res) => {
  const [esc, turmas, ano] = await Promise.all([
    escopo(req),
    query('SELECT id, nome, serie FROM turmas WHERE colegio_id = ? AND ativo = 1 ORDER BY nome', [req.colegioId]),
    anoLetivoAtual(req.colegioId)
  ]);
  const comSeg = turmas.map((t) => ({ id: t.id, nome: t.nome, serie: t.serie, segmento: segmentoDaSerie(t.serie) }));
  const contagem = {};
  comSeg.forEach((t) => { contagem[t.segmento] = (contagem[t.segmento] || 0) + 1; });
  const tipos = esc.restrito ? cal.TIPOS_PROFESSOR : cal.TIPOS_FORM;
  res.json({
    tipos: tipos.map((id) => ({ id, nome: cal.TIPOS[id] })),
    segmentos: Object.entries(SEGMENTOS).filter(([id]) => contagem[id]).map(([id, nome]) => ({ id, nome, turmas: contagem[id] })),
    turmas: esc.restrito ? comSeg.filter((t) => esc.turmas.has(t.id)) : comSeg,
    todasTurmas: comSeg,
    restrito: esc.restrito,
    vinculado: esc.restrito ? esc.vinculado : true,
    coordenacao: req.perfil !== 'professor',
    anoLetivo: ano
  });
}));

/* ---------------- Eventos de um intervalo ---------------- */
router.get('/', modulo, assincrono(async (req, res) => {
  const inicio = lerData(req.query.inicio, 'Data inicial', true);
  const fim = lerData(req.query.fim, 'Data final', true);
  if (fim < inicio || cal.diasEntre(inicio, fim) > 400) throw new HttpErro(400, 'Intervalo inválido', 'validacao');
  const tipo = v.umDe(req.query.tipo || null, Object.keys(cal.TIPOS), 'Tipo', { obrigatorio: false });
  const turmaId = v.inteiro(req.query.turmaId, 'Turma', { min: 1 });
  const [eventos, ctx] = await Promise.all([
    cal.eventosNoIntervalo(req.colegioId, inicio, fim, tipo ? ' AND e.tipo = ?' : '', tipo ? [tipo] : []),
    cal.contexto(req.colegioId)
  ]);
  res.json({
    itens: eventos
      .filter((e) => !turmaId || noPublico(e, turmaId, ctx))
      .map((e) => cal.formatar(e, ctx, podeGerir(req, e)))
  });
}));

router.get('/proximos', modulo, assincrono(async (req, res) => {
  const dias = v.inteiro(req.query.dias, 'Dias', { min: 1, max: 120 }) || 30;
  const limite = v.inteiro(req.query.limite, 'Limite', { min: 1, max: 20 }) || 6;
  const hoje = hojeSP();
  const [eventos, ctx] = await Promise.all([
    cal.eventosNoIntervalo(req.colegioId, hoje, cal.somarDias(hoje, dias), " AND e.tipo <> 'bimestre'"),
    cal.contexto(req.colegioId)
  ]);
  res.json({ itens: eventos.slice(0, limite).map((e) => cal.formatar(e, ctx, podeGerir(req, e))) });
}));

/* ---------------- Ano letivo: bimestres e dias letivos ---------------- */
async function anoLetivo(colegioId, ano) {
  const periodos = (await query(
    'SELECT bimestre, inicio, fim FROM periodos_letivos WHERE colegio_id = ? AND ano = ? ORDER BY bimestre',
    [colegioId, ano]
  )).map((p) => ({ bimestre: Number(p.bimestre), inicio: p.inicio, fim: p.fim }));
  let dias = { bimestres: [], total: 0, meta: cal.META_DIAS_LETIVOS };
  if (periodos.length) {
    const ini = periodos.reduce((m, p) => (p.inicio < m ? p.inicio : m), periodos[0].inicio);
    const fim = periodos.reduce((m, p) => (p.fim > m ? p.fim : m), periodos[0].fim);
    const eventos = await query(
      `SELECT tipo, alcance, data, data_fim, titulo FROM eventos
        WHERE colegio_id = ? AND tipo IN ('feriado', 'recesso', 'letivo') AND alcance = 'todos'
          AND data <= ? AND COALESCE(data_fim, data) >= ?`,
      [colegioId, fim, ini]
    );
    dias = cal.calcularDiasLetivos(periodos, eventos);
  }
  return { ano, periodos, ...dias, bimestreAtual: cal.bimestreDaData(periodos, hojeSP()) };
}

router.get('/ano-letivo', modulo, assincrono(async (req, res) => {
  const ano = v.inteiro(req.query.ano, 'Ano', { min: 2000, max: 2100 }) || await anoLetivoAtual(req.colegioId);
  res.json(await anoLetivo(req.colegioId, ano));
}));

router.put('/ano-letivo', modulo, naoProfessor, assincrono(async (req, res) => {
  const ano = v.inteiro(req.body.ano, 'Ano', { min: 2000, max: 2100, obrigatorio: true });
  const lista = Array.isArray(req.body.bimestres) ? req.body.bimestres : [];
  const bims = [];
  for (const x of lista) {
    const bimestre = v.inteiro(x.bimestre, 'Bimestre', { min: 1, max: 4, obrigatorio: true });
    if (!x.inicio && !x.fim) continue; // bimestre em branco: sem datas
    const inicio = lerData(x.inicio, `Início do ${bimestre}º bimestre`, true);
    const fim = lerData(x.fim, `Fim do ${bimestre}º bimestre`, true);
    if (fim < inicio) throw new HttpErro(400, `O ${bimestre}º bimestre termina antes de começar`, 'validacao');
    if (cal.diasEntre(inicio, fim) > 200) throw new HttpErro(400, `O ${bimestre}º bimestre está longo demais`, 'validacao');
    if (bims.some((b) => b.bimestre === bimestre)) throw new HttpErro(400, `${bimestre}º bimestre repetido`, 'validacao');
    bims.push({ bimestre, inicio, fim });
  }
  bims.sort((a, b) => a.bimestre - b.bimestre);
  for (let i = 1; i < bims.length; i++) {
    if (bims[i].inicio <= bims[i - 1].fim) {
      throw new HttpErro(400, `O ${bims[i].bimestre}º bimestre precisa começar depois do fim do ${bims[i - 1].bimestre}º`, 'validacao');
    }
  }
  await transacao(async (conn) => {
    await conn.query('DELETE FROM periodos_letivos WHERE colegio_id = ? AND ano = ?', [req.colegioId, ano]);
    if (bims.length) {
      await conn.query('INSERT INTO periodos_letivos (colegio_id, ano, bimestre, inicio, fim) VALUES ?',
        [bims.map((b) => [req.colegioId, ano, b.bimestre, b.inicio, b.fim])]);
    }
  });
  await atividade(req.colegioId, req.usuario.id, `Bimestres do ano letivo ${ano} atualizados`);
  res.json(await anoLetivo(req.colegioId, ano));
}));

/* ---------------- Feriados nacionais ---------------- */
async function feriadosDoAno(colegioId, ano) {
  const existentes = await query(
    "SELECT data FROM eventos WHERE colegio_id = ? AND tipo = 'feriado' AND data BETWEEN ? AND ?",
    [colegioId, cal.iso(ano, 1, 1), cal.iso(ano, 12, 31)]
  );
  const ja = new Set(existentes.map((e) => e.data));
  return cal.feriadosNacionais(ano).map((f) => ({ ...f, jaCadastrado: ja.has(f.data) }));
}

router.get('/feriados', modulo, naoProfessor, assincrono(async (req, res) => {
  const ano = v.inteiro(req.query.ano, 'Ano', { min: 2000, max: 2100 }) || await anoLetivoAtual(req.colegioId);
  res.json({ ano, feriados: await feriadosDoAno(req.colegioId, ano) });
}));

router.post('/feriados', modulo, naoProfessor, assincrono(async (req, res) => {
  const ano = v.inteiro(req.body.ano, 'Ano', { min: 2000, max: 2100, obrigatorio: true });
  const escolhidas = new Set(Array.isArray(req.body.datas) ? req.body.datas : []);
  const novos = (await feriadosDoAno(req.colegioId, ano)).filter((f) => escolhidas.has(f.data) && !f.jaCadastrado);
  if (novos.length) {
    const agora = agoraSP();
    await query(
      `INSERT INTO eventos (colegio_id, titulo, data, data_fim, tipo, alcance, visivel_familias, descricao, criado_por, criado_em)
       VALUES ?`,
      [novos.map((f) => [req.colegioId, f.titulo, f.data, f.dataFim, 'feriado', 'todos', 1,
        f.facultativo ? 'Ponto facultativo nacional' : 'Feriado nacional', req.usuario.id, agora])]
    );
    await atividade(req.colegioId, req.usuario.id, `${novos.length} feriado(s) nacional(is) de ${ano} incluído(s) no calendário`);
  }
  res.status(201).json({ criados: novos.length });
}));

/* ---------------- Um evento ---------------- */
router.get('/:id', modulo, assincrono(async (req, res) => {
  const e = await buscar(req, v.id(req.params.id));
  res.json(cal.formatar(e, await cal.contexto(req.colegioId), podeGerir(req, e)));
}));

router.post('/', modulo, assincrono(async (req, res) => {
  const d = await lerCorpo(req);
  const id = await transacao(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO eventos (colegio_id, titulo, data, data_fim, hora_inicio, hora_fim, lugar, tipo, alcance, segmentos,
                            visivel_familias, descricao, criado_por, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.colegioId, d.titulo, d.data, d.dataFim, d.horaInicio, d.horaFim, d.lugar, d.tipo, d.alcance, d.segmentos,
        d.visivelFamilias ? 1 : 0, d.descricao, req.usuario.id, agoraSP()]
    );
    await gravarTurmas(conn, r.insertId, d.turmas);
    return r.insertId;
  });
  await atividade(req.colegioId, req.usuario.id, `Evento no calendário: ${d.titulo}`);
  res.status(201).json({ id });
}));

router.put('/:id', modulo, assincrono(async (req, res) => {
  const e = await buscar(req, v.id(req.params.id));
  if (!podeGerir(req, e)) throw new HttpErro(403, 'Só quem cadastrou (ou a coordenação) pode alterar este evento', 'perfil');
  if (req.perfil === 'professor' && !cal.TIPOS_PROFESSOR.includes(e.tipo)) throw new HttpErro(403, 'Somente a coordenação altera este tipo de evento', 'perfil');
  const d = await lerCorpo(req);
  await transacao(async (conn) => {
    await conn.query(
      `UPDATE eventos SET titulo = ?, data = ?, data_fim = ?, hora_inicio = ?, hora_fim = ?, lugar = ?, tipo = ?, alcance = ?,
              segmentos = ?, visivel_familias = ?, descricao = ?, atualizado_por = ?, atualizado_em = ?
        WHERE id = ? AND colegio_id = ?`,
      [d.titulo, d.data, d.dataFim, d.horaInicio, d.horaFim, d.lugar, d.tipo, d.alcance, d.segmentos,
        d.visivelFamilias ? 1 : 0, d.descricao, req.usuario.id, agoraSP(), e.id, req.colegioId]
    );
    await gravarTurmas(conn, e.id, d.turmas);
  });
  await atividade(req.colegioId, req.usuario.id, `Evento alterado: ${d.titulo}`);
  res.json({ id: e.id });
}));

router.delete('/:id', modulo, assincrono(async (req, res) => {
  const e = await buscar(req, v.id(req.params.id));
  if (!podeGerir(req, e)) throw new HttpErro(403, 'Só quem cadastrou (ou a coordenação) pode excluir este evento', 'perfil');
  await query('DELETE FROM eventos WHERE id = ? AND colegio_id = ?', [e.id, req.colegioId]);
  await atividade(req.colegioId, req.usuario.id, `Evento excluído: ${e.titulo}`);
  res.status(204).end();
}));

module.exports = router;
