'use strict';
/* =====================================================================
 *  /api/comunicados — equipe do colégio   [módulo comunicados]
 *
 *  GET    /opcoes     tipos, segmentos e turmas que o usuário pode usar
 *  GET    /recentes   últimos comunicados ativos (Dashboard)
 *  GET    /?tipo=&situacao=ativos|expirados|todos&busca=
 *  GET    /:id        comunicado + quem leu + famílias para o WhatsApp
 *  POST   /           publica
 *  PUT    /:id        edita (mantém as leituras)
 *  DELETE /:id        exclui
 *
 *  Professor: publica só para as turmas atribuídas a ele e só edita /
 *  exclui / vê as leituras dos próprios comunicados. Demais perfis com
 *  o módulo: sem restrição.
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm, transacao } = require('../db');
const { exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade } = require('../utils/auditoria');
const { hojeSP, agoraSP, dataValida } = require('../utils/datas');
const { escopo } = require('../services/escopo');
const c$ = require('../services/comunicados');

const modulo = exigirModulo('comunicados');

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const podeGerir = (req, com) => req.perfil !== 'professor' || com.publicado_por === req.usuario.id;

async function buscar(req, id) {
  const com = await queryUm(
    `SELECT c.*, u.nome AS autor FROM comunicados c LEFT JOIN usuarios u ON u.id = c.publicado_por
      WHERE c.id = ? AND c.colegio_id = ?`,
    [id, req.colegioId]
  );
  if (!com) throw new HttpErro(404, 'Comunicado não encontrado', 'nao_encontrado');
  return com;
}

function formatar(com, ctx, leitura, req) {
  const hoje = hojeSP();
  return {
    id: com.id,
    titulo: com.titulo,
    tipo: com.tipo,
    mensagem: com.mensagem,
    alcance: com.alcance,
    segmentos: c$.listaSegmentos(com.segmentos),
    turmas: (ctx.turmasDe.get(com.id) || []).map((id) => ctx.turmas.get(id)).filter(Boolean).map((t) => ({ id: t.id, nome: t.nome })),
    publico: c$.descreverPublico(com, ctx),
    fixado: !!com.fixado,
    exigeCiencia: !!com.exige_ciencia,
    expiraEm: com.expira_em,
    expirado: !!(com.expira_em && com.expira_em < hoje),
    autor: com.autor,
    criadoEm: com.criado_em,
    atualizadoEm: com.atualizado_em,
    podeEditar: podeGerir(req, com),
    leitura
  };
}

/** Valida o corpo de publicar/editar. */
async function lerCorpo(req, atual) {
  const b = req.body;
  const dados = {
    titulo: v.texto(b.titulo, 'Título', { max: 150, min: 3, obrigatorio: true }),
    mensagem: v.texto(b.mensagem, 'Mensagem', { max: 5000, min: 3, obrigatorio: true }),
    tipo: v.umDe(b.tipo || 'aviso', Object.keys(c$.TIPOS), 'Tipo'),
    alcance: v.umDe(b.alcance || 'todos', c$.ALCANCES, 'Público'),
    segmentos: null,
    turmas: [],
    fixado: b.fixado === true || b.fixado === 1 || b.fixado === '1' ? 1 : 0,
    exigeCiencia: b.exigeCiencia === true || b.exigeCiencia === 1 || b.exigeCiencia === '1' ? 1 : 0,
    expiraEm: null
  };

  if (dados.alcance === 'segmentos') {
    const lista = [...new Set((Array.isArray(b.segmentos) ? b.segmentos : []).filter((s) => c$.SEGMENTOS[s]))];
    if (!lista.length) throw new HttpErro(400, 'Escolha pelo menos um segmento', 'validacao');
    dados.segmentos = lista.join(',');
  }
  if (dados.alcance === 'turmas') {
    const ids = [...new Set((Array.isArray(b.turmas) ? b.turmas : []).map(Number))];
    if (!ids.length || ids.some((n) => !Number.isInteger(n) || n <= 0)) throw new HttpErro(400, 'Escolha pelo menos uma turma', 'validacao');
    const ph = ids.map(() => '?').join(',');
    const achadas = await query(`SELECT id, nome FROM turmas WHERE colegio_id = ? AND id IN (${ph})`, [req.colegioId, ...ids]);
    if (achadas.length !== ids.length) throw new HttpErro(400, 'Turma inválida', 'validacao');
    dados.turmas = ids;
    dados.nomesTurmas = new Map(achadas.map((t) => [t.id, t.nome]));
  }

  if (b.expiraEm) {
    if (!dataValida(b.expiraEm)) throw new HttpErro(400, 'Data de expiração inválida', 'validacao');
    const mantida = atual && atual.expira_em === b.expiraEm;
    if (!mantida && b.expiraEm < hojeSP()) throw new HttpErro(400, 'A data de expiração não pode ser no passado', 'validacao');
    dados.expiraEm = b.expiraEm;
  }

  // Professor: só para as turmas em que leciona
  const esc = await escopo(req);
  if (esc.restrito) {
    if (!esc.vinculado) {
      throw new HttpErro(403, 'Seu login ainda não está ligado a um cadastro de professor. Peça ao administrador (Sistema › Usuários).', 'escopo');
    }
    if (dados.alcance !== 'turmas') {
      throw new HttpErro(403, 'Professor publica só para as turmas em que leciona. Escolha as turmas.', 'escopo');
    }
    const fora = dados.turmas.find((id) => !esc.turmas.has(id));
    if (fora) throw new HttpErro(403, `A turma ${dados.nomesTurmas.get(fora)} não está atribuída a você`, 'escopo');
  }
  return dados;
}

async function gravarTurmas(conn, comunicadoId, turmas) {
  await conn.query('DELETE FROM comunicado_turmas WHERE comunicado_id = ?', [comunicadoId]);
  if (turmas.length) {
    await conn.query('INSERT INTO comunicado_turmas (comunicado_id, turma_id) VALUES ?', [turmas.map((t) => [comunicadoId, t])]);
  }
}

/* ---------------- Opções do formulário ---------------- */
router.get('/opcoes', modulo, assincrono(async (req, res) => {
  const [esc, turmas] = await Promise.all([
    escopo(req),
    query("SELECT id, nome, serie, ano_letivo FROM turmas WHERE colegio_id = ? AND ativo = 1 ORDER BY nome", [req.colegioId])
  ]);
  const comSeg = turmas.map((t) => ({ id: t.id, nome: t.nome, serie: t.serie, anoLetivo: t.ano_letivo, segmento: c$.segmentoDaSerie(t.serie) }));
  const minhas = esc.restrito ? comSeg.filter((t) => esc.turmas.has(t.id)) : comSeg;
  const contagem = {};
  comSeg.forEach((t) => { contagem[t.segmento] = (contagem[t.segmento] || 0) + 1; });
  res.json({
    tipos: Object.entries(c$.TIPOS).map(([id, nome]) => ({ id, nome })),
    segmentos: Object.entries(c$.SEGMENTOS).filter(([id]) => contagem[id]).map(([id, nome]) => ({ id, nome, turmas: contagem[id] })),
    turmas: minhas,
    restrito: esc.restrito,
    vinculado: esc.restrito ? esc.vinculado : true
  });
}));

/* ---------------- Lista ---------------- */
async function listar(req, { tipo, situacao = 'ativos', busca = '', limite = 300 } = {}) {
  const hoje = hojeSP();
  const params = [req.colegioId];
  let filtro = '';
  if (tipo) { filtro += ' AND c.tipo = ?'; params.push(tipo); }
  if (situacao === 'ativos') { filtro += ' AND (c.expira_em IS NULL OR c.expira_em >= ?)'; params.push(hoje); }
  if (situacao === 'expirados') { filtro += ' AND c.expira_em < ?'; params.push(hoje); }
  const [coms, ctx, vinculos, leituras] = await Promise.all([
    query(
      `SELECT c.*, u.nome AS autor FROM comunicados c LEFT JOIN usuarios u ON u.id = c.publicado_por
        WHERE c.colegio_id = ?${filtro}
        ORDER BY c.criado_em DESC LIMIT 500`,
      params
    ),
    c$.contexto(req.colegioId),
    c$.vinculosResponsaveis(req.colegioId),
    c$.leiturasDoColegio(req.colegioId)
  ]);
  const q = semAcento(busca.trim());
  return coms
    .filter((c) => !q || semAcento(`${c.titulo} ${c.mensagem} ${c.autor || ''}`).includes(q))
    .map((c) => formatar(c, ctx, c$.resumoLeitura(c, c$.destinatarios(c, vinculos, ctx), leituras), req))
    // Fixados (ainda no ar) primeiro, depois os mais novos
    .sort((x, y) => ((y.fixado && !y.expirado) - (x.fixado && !x.expirado)) || String(y.criadoEm).localeCompare(String(x.criadoEm)))
    .slice(0, limite);
}

router.get('/', modulo, assincrono(async (req, res) => {
  const tipo = v.umDe(req.query.tipo || null, Object.keys(c$.TIPOS), 'Tipo', { obrigatorio: false });
  const situacao = v.umDe(req.query.situacao || 'ativos', ['ativos', 'expirados', 'todos'], 'Situação');
  res.json({ itens: await listar(req, { tipo, situacao, busca: String(req.query.busca || '').slice(0, 100) }) });
}));

router.get('/recentes', modulo, assincrono(async (req, res) => {
  const limite = v.inteiro(req.query.limite, 'Limite', { min: 1, max: 10 }) || 4;
  res.json({ itens: await listar(req, { situacao: 'ativos', limite }) });
}));

/* ---------------- Detalhe ---------------- */
router.get('/:id', modulo, assincrono(async (req, res) => {
  const com = await buscar(req, v.id(req.params.id));
  const [ctx, vinculos, leituras] = await Promise.all([
    c$.contexto(req.colegioId),
    c$.vinculosResponsaveis(req.colegioId),
    c$.leiturasDoColegio(req.colegioId, com.id)
  ]);
  const dest = c$.destinatarios(com, vinculos, ctx);
  const r = formatar(com, ctx, c$.resumoLeitura(com, dest, leituras), req);
  if (r.podeEditar) {
    const lidas = leituras.get(com.id) || new Map();
    r.leituras = [...dest.values()].map((d) => {
      const l = lidas.get(d.id);
      return { nome: d.nome, email: d.email, alunos: d.alunos, lidoEm: l ? l.lidoEm : null, cienteEm: l ? l.cienteEm : null };
    }).sort((x, y) => (!!x.lidoEm - !!y.lidoEm) || x.nome.localeCompare(y.nome, 'pt-BR'));
    Object.assign(r, await c$.familiasWhatsApp(req.colegioId, com, ctx, vinculos, lidas));
  }
  res.json(r);
}));

/* ---------------- Publicar ---------------- */
router.post('/', modulo, assincrono(async (req, res) => {
  const d = await lerCorpo(req, null);
  const id = await transacao(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO comunicados (colegio_id, titulo, tipo, alcance, segmentos, mensagem, fixado, exige_ciencia, expira_em, publicado_por, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.colegioId, d.titulo, d.tipo, d.alcance, d.segmentos, d.mensagem, d.fixado, d.exigeCiencia, d.expiraEm, req.usuario.id, agoraSP()]
    );
    await gravarTurmas(conn, r.insertId, d.turmas);
    return r.insertId;
  });
  await atividade(req.colegioId, req.usuario.id, `Comunicado publicado: ${d.titulo}`);
  res.status(201).json({ id });
}));

/* ---------------- Editar ---------------- */
router.put('/:id', modulo, assincrono(async (req, res) => {
  const com = await buscar(req, v.id(req.params.id));
  if (!podeGerir(req, com)) throw new HttpErro(403, 'Só quem publicou (ou a coordenação) pode alterar este comunicado', 'perfil');
  const d = await lerCorpo(req, com);
  await transacao(async (conn) => {
    await conn.query(
      `UPDATE comunicados SET titulo = ?, tipo = ?, alcance = ?, segmentos = ?, mensagem = ?, fixado = ?, exige_ciencia = ?,
              expira_em = ?, atualizado_por = ?, atualizado_em = ?
        WHERE id = ? AND colegio_id = ?`,
      [d.titulo, d.tipo, d.alcance, d.segmentos, d.mensagem, d.fixado, d.exigeCiencia, d.expiraEm, req.usuario.id, agoraSP(), com.id, req.colegioId]
    );
    await gravarTurmas(conn, com.id, d.turmas);
  });
  await atividade(req.colegioId, req.usuario.id, `Comunicado alterado: ${d.titulo}`);
  res.json({ id: com.id });
}));

/* ---------------- Excluir ---------------- */
router.delete('/:id', modulo, assincrono(async (req, res) => {
  const com = await buscar(req, v.id(req.params.id));
  if (!podeGerir(req, com)) throw new HttpErro(403, 'Só quem publicou (ou a coordenação) pode excluir este comunicado', 'perfil');
  await query('DELETE FROM comunicados WHERE id = ? AND colegio_id = ?', [com.id, req.colegioId]);
  await atividade(req.colegioId, req.usuario.id, `Comunicado excluído: ${com.titulo}`);
  res.status(204).end();
}));

module.exports = router;
