'use strict';
/* =====================================================================
 *  /api/portal — Portal do responsável   [perfil responsável]
 *
 *  GET  /                              colégio e filhos vinculados
 *  GET  /alunos/:id/resumo             frequência, médias, mensalidades, últimas faltas
 *  GET  /alunos/:id/boletim?turmaId=   boletim (turma atual ou anteriores)
 *  GET  /alunos/:id/frequencia?turmaId= por disciplina, por mês e as faltas
 *  GET  /alunos/:id/financeiro?ano=    mensalidades do ano
 *  POST /documentos                    link do PDF (cobrança/recibo, carnê, declaração)
 *  GET  /comunicados                   comunicados para os filhos (não expirados)
 *  GET  /comunicados/pendentes         não lidos, aguardando ciência e os últimos 3
 *  POST /comunicados/:id/lido          registra a leitura
 *  POST /comunicados/:id/ciente        confirma ciência (se o comunicado pedir)
 *  GET  /calendario?inicio=&fim=       eventos visíveis às famílias dos filhos
 *  GET  /calendario/proximos           próximas datas (Início)
 *  GET  /alunos/:id/grade              horário de aulas da turma atual do aluno
 *  GET  /privacidade                   contato do encarregado, aceite dos termos e meus pedidos (LGPD)
 *  GET  /meus-dados                    cópia de tudo o que o sistema guarda sobre mim e meus filhos (JSON)
 *  POST /solicitacoes                  pedido do titular (acesso, correção, exclusão...)
 *  POST /encerrar-acesso               desfaz o vínculo com o colégio (os registros escolares ficam)
 *
 *  Segurança: TODA consulta passa por meuFilho(), que só aceita alunos
 *  ligados a este usuário (responsavel_aluno) neste colégio.
 * ===================================================================== */
const router = require('express').Router();
const { SQL_TURMAS_DA_VIRADA } = require('../services/virada');
const { query, queryUm } = require('../db');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { hojeSP, agoraSP, dataValida } = require('../utils/datas');
const f = require('../services/financeiro');
const { arred1 } = require('../services/escopo');
const { montarBoletim } = require('../services/boletim');
const { assinar } = require('../utils/links');
const { TIPOS, DocErro } = require('../services/documentos');
const { visiveisParaResponsavel } = require('../services/comunicados');
const cal = require('../services/calendario');
const { gradeDaTurma } = require('../services/grade');
const lgpd = require('../services/lgpd');
const { seguranca, atividade } = require('../utils/auditoria');

async function filhos(req) {
  return query(
    `SELECT a.id, a.nome, a.ra, a.status, a.nascimento, a.turma_id, a.resp_nome, a.resp_telefone, ra.parentesco,
            t.nome AS turma, t.serie, t.periodo, t.ano_letivo
       FROM responsavel_aluno ra
       JOIN alunos a ON a.id = ra.aluno_id AND a.colegio_id = ra.colegio_id
       LEFT JOIN turmas t ON t.id = a.turma_id
      WHERE ra.usuario_id = ? AND ra.colegio_id = ?
      ORDER BY a.nome`,
    [req.usuario.id, req.colegioId]
  );
}

async function meuFilho(req) {
  const id = v.id(req.params.id);
  const a = (await filhos(req)).find((x) => x.id === id);
  // 404 (e não 403) para não revelar se o aluno existe
  if (!a) throw new HttpErro(404, 'Aluno não encontrado', 'nao_encontrado');
  return a;
}

const turmaAtual = (a) => (a.turma_id ? { id: a.turma_id, nome: a.turma, serie: a.serie, periodo: a.periodo, ano_letivo: a.ano_letivo } : null);

/** Turmas com histórico do aluno (atual + onde tem nota ou chamada). */
async function turmasDoAluno(req, a) {
  return query(
    `SELECT t.id, t.nome, t.serie, t.periodo, t.ano_letivo FROM turmas t
      WHERE t.colegio_id = ?
        AND (t.id = ?
          OR t.id IN (SELECT n.turma_id FROM notas n WHERE n.aluno_id = ?)
          OR t.id IN (SELECT d.turma_id FROM frequencias fr JOIN diarios d ON d.id = fr.diario_id WHERE fr.aluno_id = ?)
          OR t.id IN (${SQL_TURMAS_DA_VIRADA}))
      ORDER BY t.ano_letivo DESC, t.nome`,
    [req.colegioId, a.turma_id || 0, a.id, a.id, a.id]
  );
}

async function escolherTurma(req, a) {
  const turmas = await turmasDoAluno(req, a);
  let turma = null;
  if (req.query.turmaId) {
    turma = turmas.find((t) => t.id === v.id(req.query.turmaId));
    if (!turma) throw new HttpErro(404, 'Turma não encontrada', 'nao_encontrado');
  } else {
    turma = turmas.find((t) => t.id === a.turma_id) || turmas[0] || null;
  }
  return { turmas: turmas.map((t) => ({ id: t.id, nome: t.nome, anoLetivo: t.ano_letivo, atual: t.id === a.turma_id })), turma };
}

const alunoPublico = (a) => ({
  id: a.id, nome: a.nome, ra: a.ra, status: a.status, nascimento: a.nascimento, parentesco: a.parentesco,
  turma: a.turma_id ? { id: a.turma_id, nome: a.turma, serie: a.serie, periodo: a.periodo, anoLetivo: a.ano_letivo } : null
});

/* ---------------- Início ---------------- */
router.get('/', assincrono(async (req, res) => {
  const [lista, col] = await Promise.all([
    filhos(req),
    queryUm(
      `SELECT c.nome, c.telefone, c.email, c.whatsapp_notif, cfg.pix_chave, cfg.ano_letivo
         FROM colegios c LEFT JOIN config_colegio cfg ON cfg.colegio_id = c.id WHERE c.id = ?`,
      [req.colegioId]
    )
  ]);
  res.json({
    colegio: { nome: col.nome, telefone: col.telefone, email: col.email, whatsapp: col.whatsapp_notif || col.telefone, anoLetivo: col.ano_letivo },
    alunos: lista.map(alunoPublico)
  });
}));

router.get('/alunos/:id/resumo', assincrono(async (req, res) => {
  const a = await meuFilho(req);
  const hoje = hojeSP();
  const turma = turmaAtual(a);
  const [boletim, mens, faltas] = await Promise.all([
    turma ? montarBoletim(req.colegioId, a, turma) : null,
    query(
      `SELECT id, referencia, vencimento, valor, valor_pago, status, data_pagamento FROM mensalidades
        WHERE aluno_id = ? AND colegio_id = ? AND status <> 'cancelado' ORDER BY vencimento`,
      [a.id, req.colegioId]
    ),
    query(
      `SELECT d.data, disc.nome AS disciplina, fr.status FROM frequencias fr
         JOIN diarios d ON d.id = fr.diario_id
         LEFT JOIN disciplinas disc ON disc.id = d.disciplina_id
        WHERE fr.aluno_id = ? AND fr.colegio_id = ? AND fr.status IN ('F', 'J')
        ORDER BY d.data DESC, disc.nome LIMIT 5`,
      [a.id, req.colegioId]
    )
  ]);

  let notas = null;
  if (boletim) {
    const comMedia = boletim.disciplinas.filter((d) => d.mediaFinal !== null);
    notas = {
      mediaGeral: comMedia.length ? arred1(comMedia.reduce((s, d) => s + d.mediaFinal, 0) / comMedia.length) : null,
      abaixo: comMedia.filter((d) => d.mediaFinal < boletim.criterios.mediaAprovacao).map((d) => d.nome),
      disciplinasComNota: comMedia.length,
      mediaAprovacao: boletim.criterios.mediaAprovacao,
      situacaoGeral: boletim.situacaoGeral
    };
  }

  const abertas = mens.filter((m) => m.status === 'pendente' && Number(m.valor) > 0);
  const vencidas = abertas.filter((m) => m.vencimento < hoje);
  const proxima = abertas.find((m) => m.vencimento >= hoje) || null;
  const pagas = mens.filter((m) => m.status === 'pago');
  const ultimaPaga = pagas.sort((x, y) => String(y.data_pagamento).localeCompare(String(x.data_pagamento)))[0] || null;

  res.json({
    aluno: alunoPublico(a),
    frequencia: boletim ? { ...boletim.frequencia, minima: boletim.criterios.frequenciaMinima } : null,
    notas,
    financeiro: {
      abertas: abertas.length,
      vencidas: vencidas.length,
      valorVencido: f.centavos(vencidas.reduce((s, m) => s + Number(m.valor), 0)) / 100,
      proxima: proxima ? { id: proxima.id, referencia: proxima.referencia, vencimento: proxima.vencimento, valor: proxima.valor } : null,
      atrasada: vencidas.length ? { id: vencidas[0].id, referencia: vencidas[0].referencia, vencimento: vencidas[0].vencimento, valor: vencidas[0].valor } : null,
      ultimaPaga: ultimaPaga ? { referencia: ultimaPaga.referencia, dataPagamento: ultimaPaga.data_pagamento, valor: ultimaPaga.valor_pago ?? ultimaPaga.valor } : null
    },
    ultimasFaltas: faltas.map((x) => ({ data: x.data, disciplina: x.disciplina, justificada: x.status === 'J' }))
  });
}));

/* ---------------- Boletim ---------------- */
router.get('/alunos/:id/boletim', assincrono(async (req, res) => {
  const a = await meuFilho(req);
  const { turmas, turma } = await escolherTurma(req, a);
  res.json({ turmas, boletim: turma ? await montarBoletim(req.colegioId, a, turma) : null });
}));

/* ---------------- Frequência ---------------- */
router.get('/alunos/:id/frequencia', assincrono(async (req, res) => {
  const a = await meuFilho(req);
  const { turmas, turma } = await escolherTurma(req, a);
  if (!turma) return res.json({ turmas, turma: null });

  const [registros, cfg] = await Promise.all([
    query(
      `SELECT d.data, d.disciplina_id, disc.nome AS disciplina, fr.status, d.conteudo
         FROM frequencias fr
         JOIN diarios d ON d.id = fr.diario_id
         LEFT JOIN disciplinas disc ON disc.id = d.disciplina_id
        WHERE fr.aluno_id = ? AND d.turma_id = ? AND d.colegio_id = ?
        ORDER BY d.data DESC, disc.nome`,
      [a.id, turma.id, req.colegioId]
    ),
    queryUm('SELECT frequencia_minima FROM config_colegio WHERE colegio_id = ?', [req.colegioId])
  ]);
  const minima = Number(cfg ? cfg.frequencia_minima : 75);
  const conta = () => ({ aulas: 0, presencas: 0, faltas: 0, justificadas: 0 });
  const somar = (o, st) => { o.aulas += 1; if (st === 'P') o.presencas += 1; else if (st === 'F') o.faltas += 1; else o.justificadas += 1; };
  const pct = (o) => (o.aulas ? arred1(((o.presencas + o.justificadas) / o.aulas) * 100) : null);

  const total = conta();
  const disc = new Map();
  const meses = new Map();
  registros.forEach((r) => {
    somar(total, r.status);
    const k = r.disciplina_id || 0;
    if (!disc.has(k)) disc.set(k, { nome: r.disciplina || 'Chamada do dia', ...conta() });
    somar(disc.get(k), r.status);
    const m = r.data.slice(0, 7);
    if (!meses.has(m)) meses.set(m, conta());
    somar(meses.get(m), r.status);
  });

  res.json({
    turmas,
    turma: { id: turma.id, nome: turma.nome, anoLetivo: turma.ano_letivo },
    minima,
    total: { ...total, percentual: pct(total) },
    disciplinas: [...disc.values()].map((d) => ({ ...d, percentual: pct(d) })).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')),
    meses: [...meses.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([ref, o]) => ({ referencia: ref, ...o, percentual: pct(o) })),
    ausencias: registros.filter((r) => r.status !== 'P').slice(0, 300).map((r) => ({
      data: r.data, disciplina: r.disciplina || 'Chamada do dia', justificada: r.status === 'J',
      conteudo: r.conteudo ? String(r.conteudo).slice(0, 300) : null
    }))
  });
}));

/* ---------------- Financeiro ---------------- */
router.get('/alunos/:id/financeiro', assincrono(async (req, res) => {
  const a = await meuFilho(req);
  const hoje = hojeSP();
  const anosR = await query(
    "SELECT DISTINCT LEFT(referencia, 4) AS ano FROM mensalidades WHERE aluno_id = ? AND colegio_id = ? AND status <> 'cancelado' ORDER BY ano DESC",
    [a.id, req.colegioId]
  );
  const anos = anosR.map((x) => Number(x.ano));
  const ano = v.inteiro(req.query.ano, 'Ano', { min: 2000, max: 2100 }) || (anos.includes(Number(hoje.slice(0, 4))) ? Number(hoje.slice(0, 4)) : (anos[0] || Number(hoje.slice(0, 4))));

  const [linhas, cfg] = await Promise.all([
    query(
      `SELECT m.id, m.referencia, m.vencimento, m.valor_bruto, m.desconto, m.valor, m.valor_pago, m.status, m.data_pagamento,
              m.forma_pagamento, b.tipo AS bolsa_tipo, b.percentual AS bolsa_pct
         FROM mensalidades m LEFT JOIN bolsas b ON b.id = m.bolsa_id
        WHERE m.aluno_id = ? AND m.colegio_id = ? AND m.referencia LIKE ? AND m.status <> 'cancelado'
        ORDER BY m.referencia`,
      [a.id, req.colegioId, `${ano}-%`]
    ),
    queryUm('SELECT pix_tipo, pix_chave, cidade FROM config_colegio WHERE colegio_id = ?', [req.colegioId])
  ]);

  const resumo = { abertas: 0, valorAberto: 0, vencidas: 0, valorVencido: 0, pagas: 0, valorPago: 0, descontos: 0 };
  const itens = linhas.map((m) => {
    const situacao = f.situacaoMensalidade(m, hoje);
    if (situacao === 'pendente' || situacao === 'vencida') { resumo.abertas += 1; resumo.valorAberto += f.centavos(m.valor); }
    if (situacao === 'vencida') { resumo.vencidas += 1; resumo.valorVencido += f.centavos(m.valor); }
    if (situacao === 'paga') { resumo.pagas += 1; resumo.valorPago += f.centavos(m.valor_pago ?? m.valor); }
    resumo.descontos += f.centavos(m.desconto);
    return {
      id: m.id, referencia: m.referencia, vencimento: m.vencimento, valorBruto: m.valor_bruto, desconto: m.desconto, valor: m.valor,
      bolsa: m.bolsa_tipo ? { tipo: m.bolsa_tipo, percentual: m.bolsa_pct } : null,
      situacao, diasAtraso: situacao === 'vencida' ? f.diasEntre(m.vencimento, hoje) : 0,
      dataPagamento: m.data_pagamento, valorPago: m.valor_pago, formaPagamento: m.forma_pagamento
    };
  });
  ['valorAberto', 'valorVencido', 'valorPago', 'descontos'].forEach((k) => { resumo[k] /= 100; });

  res.json({
    ano,
    anos: [...new Set([...anos, ano])].sort((x, y) => y - x),
    pixConfigurado: !!(cfg && cfg.pix_tipo && cfg.pix_chave && cfg.cidade),
    resumo,
    itens
  });
}));

/* ---------------- Documentos em PDF ---------------- */
router.post('/documentos', assincrono(async (req, res) => {
  const b = req.body;
  const tipo = v.umDe(b.tipo, ['mensalidade', 'carne', 'declaracao'], 'Documento');
  const meus = new Set((await filhos(req)).map((x) => x.id));
  let dados;
  if (tipo === 'mensalidade') {
    const id = v.inteiro(b.id, 'Mensalidade', { min: 1, obrigatorio: true });
    const m = await queryUm('SELECT aluno_id FROM mensalidades WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
    if (!m || !meus.has(m.aluno_id)) throw new HttpErro(404, 'Mensalidade não encontrada', 'nao_encontrado');
    dados = { k: 'm', c: req.colegioId, i: id };
  } else {
    const alunoId = v.inteiro(b.alunoId, 'Aluno', { min: 1, obrigatorio: true });
    if (!meus.has(alunoId)) throw new HttpErro(404, 'Aluno não encontrado', 'nao_encontrado');
    dados = { k: tipo === 'carne' ? 'c' : 'd', c: req.colegioId, i: alunoId, a: v.inteiro(b.ano, 'Ano', { min: 2000, max: 2100, obrigatorio: true }) };
  }
  try {
    await TIPOS[dados.k].carregar(dados);
  } catch (e) {
    if (e instanceof DocErro) throw new HttpErro(409, e.message, 'documento');
    throw e;
  }
  const { token, expira } = assinar(dados, 30 * 60);
  res.json({ url: `/api/publico/doc/${token}`, expira });
}));

/* ---------------- Comunicados ---------------- */
const comunicadosDaFamilia = async (req) => visiveisParaResponsavel(req.colegioId, req.usuario.id, await filhos(req));

/** Comunicado que este responsável pode ver, ou 404. */
async function meuComunicado(req) {
  const id = v.id(req.params.id);
  const c = (await comunicadosDaFamilia(req)).find((x) => x.id === id);
  if (!c) throw new HttpErro(404, 'Comunicado não encontrado', 'nao_encontrado');
  return c;
}

async function minhaLeitura(req, comunicadoId) {
  const l = await queryUm(
    'SELECT lido_em, ciente_em FROM comunicado_leituras WHERE comunicado_id = ? AND usuario_id = ?',
    [comunicadoId, req.usuario.id]
  );
  return { id: comunicadoId, lidoEm: l ? l.lido_em : null, cienteEm: l ? l.ciente_em : null };
}

router.get('/comunicados', assincrono(async (req, res) => {
  res.json({ itens: await comunicadosDaFamilia(req) });
}));

router.get('/comunicados/pendentes', assincrono(async (req, res) => {
  const itens = await comunicadosDaFamilia(req);
  res.json({
    // Pedem atenção: não lidos ou aguardando a confirmação de ciência
    atencao: itens.filter((c) => !c.lidoEm || (c.exigeCiencia && !c.cienteEm)).length,
    naoLidos: itens.filter((c) => !c.lidoEm).length,
    aguardandoCiencia: itens.filter((c) => c.exigeCiencia && !c.cienteEm).length,
    ultimos: itens.slice(0, 3).map(({ mensagem, ...c }) => ({ ...c, resumo: mensagem.length > 160 ? mensagem.slice(0, 157) + '...' : mensagem }))
  });
}));

router.post('/comunicados/:id/lido', assincrono(async (req, res) => {
  const c = await meuComunicado(req);
  await query(
    'INSERT IGNORE INTO comunicado_leituras (comunicado_id, usuario_id, colegio_id, lido_em) VALUES (?, ?, ?, ?)',
    [c.id, req.usuario.id, req.colegioId, agoraSP()]
  );
  res.json(await minhaLeitura(req, c.id));
}));

router.post('/comunicados/:id/ciente', assincrono(async (req, res) => {
  const c = await meuComunicado(req);
  if (!c.exigeCiencia) throw new HttpErro(409, 'Este comunicado não pede confirmação de ciência', 'sem_ciencia');
  const agora = agoraSP();
  await query(
    'INSERT IGNORE INTO comunicado_leituras (comunicado_id, usuario_id, colegio_id, lido_em) VALUES (?, ?, ?, ?)',
    [c.id, req.usuario.id, req.colegioId, agora]
  );
  await query(
    'UPDATE comunicado_leituras SET ciente_em = COALESCE(ciente_em, ?) WHERE comunicado_id = ? AND usuario_id = ?',
    [agora, c.id, req.usuario.id]
  );
  res.json(await minhaLeitura(req, c.id));
}));

/* ---------------- Horário de aulas ---------------- */
router.get('/alunos/:id/grade', assincrono(async (req, res) => {
  const a = await meuFilho(req);
  const turma = turmaAtual(a);
  if (!turma) return res.json({ aluno: alunoPublico(a), turma: null });
  res.json({ aluno: alunoPublico(a), ...(await gradeDaTurma(req.colegioId, turma)) });
}));

/* ---------------- Calendário ---------------- */
router.get('/calendario', assincrono(async (req, res) => {
  const { inicio, fim } = req.query;
  if (!dataValida(inicio) || !dataValida(fim) || fim < inicio || cal.diasEntre(inicio, fim) > 400) {
    throw new HttpErro(400, 'Intervalo inválido', 'validacao');
  }
  res.json({ itens: await cal.eventosDaFamilia(req.colegioId, await filhos(req), inicio, fim) });
}));

router.get('/calendario/proximos', assincrono(async (req, res) => {
  const hoje = hojeSP();
  const itens = await cal.eventosDaFamilia(req.colegioId, await filhos(req), hoje, cal.somarDias(hoje, 45));
  res.json({ itens: itens.slice(0, 5) });
}));

/* ---------------- Privacidade (LGPD) ---------------- */
router.get('/privacidade', assincrono(async (req, res) => {
  const [encarregado, termos, solicitacoes] = await Promise.all([
    lgpd.encarregado(req.colegioId), lgpd.termosDoUsuario(req.usuario.id), lgpd.listarSolicitacoes(req.colegioId, { usuarioId: req.usuario.id })
  ]);
  res.json({ encarregado, termos, solicitacoes, tipos: lgpd.TIPOS, prazoDias: lgpd.PRAZO_DIAS });
}));

router.get('/meus-dados', assincrono(async (req, res) => {
  const dados = await lgpd.exportarResponsavel(req.usuario.id, req.colegioId);
  await seguranca(req, {
    tipo: 'privacidade', colegioId: req.colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: `Baixou a cópia dos próprios dados (${dados.alunos.length} aluno${dados.alunos.length === 1 ? '' : 's'})`
  });
  res.set('Cache-Control', 'no-store');
  res.json(dados);
}));

router.post('/solicitacoes', assincrono(async (req, res) => {
  const b = req.body || {};
  let aluno = null;
  if (b.alunoId) {
    const id = v.id(b.alunoId);
    aluno = (await filhos(req)).find((x) => x.id === id);
    if (!aluno) throw new HttpErro(404, 'Aluno não encontrado', 'nao_encontrado');
  }
  const s = await lgpd.criarSolicitacao({ colegioId: req.colegioId, usuario: req.usuario, aluno, tipo: b.tipo, descricao: b.descricao });
  await seguranca(req, {
    tipo: 'privacidade', colegioId: req.colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: `Pedido de privacidade nº ${s.id}: ${s.tipoRotulo}`
  });
  await atividade(req.colegioId, req.usuario.id, `Novo pedido de privacidade (LGPD): ${s.tipoRotulo}`);
  res.status(201).json(s);
}));

router.post('/encerrar-acesso', assincrono(async (req, res) => {
  if (String((req.body && req.body.confirmacao) || '').trim().toUpperCase() !== 'ENCERRAR') {
    throw new HttpErro(400, 'Digite ENCERRAR para confirmar', 'validacao');
  }
  const r = await lgpd.encerrarAcesso(req.usuario.id, req.colegioId);
  await seguranca(req, {
    tipo: 'privacidade', colegioId: req.colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: `Encerrou o próprio acesso ao portal (${r.alunosDesvinculados} aluno${r.alunosDesvinculados === 1 ? '' : 's'} desvinculado${r.alunosDesvinculados === 1 ? '' : 's'})`
  });
  await atividade(req.colegioId, req.usuario.id, 'Responsável encerrou o próprio acesso ao portal');
  res.json(r);
}));

module.exports = router;
