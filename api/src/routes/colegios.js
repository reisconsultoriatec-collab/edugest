'use strict';
/* =====================================================================
 *  /api/colegios  (usuário logado e cadastrado)
 *
 *  Colégio novo: só o proprietário do sistema, em /api/proprietario.
 *
 *  GET    /atual                     dados, configuração e disciplinas
 *  PUT    /atual                     dados cadastrais            [admin]
 *  PUT    /atual/config              configuração                [admin]
 *  PUT    /atual/cobranca            chave PIX e textos das cobranças [admin]
 *  POST   /atual/convite/regenerar   novo código de convite      [admin]
 *  POST   /atual/disciplinas         cria disciplina             [admin]
 *  PUT    /atual/disciplinas/:id     edita / ativa / desativa    [admin]
 *  DELETE /atual/disciplinas/:id     exclui se não tiver notas   [admin]
 *  GET    /atual/resumo              indicadores do dashboard    [módulo dashboard]
 *  GET    /atual/atividades          atividade recente (?limite, ?antes, ?autor) [módulo dashboard]
 *  GET    /atual/atividades/autores  quem aparece na atividade   [módulo dashboard]
 *
 *  "atual" = colégio do header X-Colegio-Id (ou o último selecionado).
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm } = require('../db');
const { exigirColegio, exigirPerfil, exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade, seguranca } = require('../utils/auditoria');
const { codigoConvite } = require('../utils/codigos');
const { lerDadosColegio, salvarDadosColegio } = require('../services/colegios');
const { hojeSP } = require('../utils/datas');
const { TIPOS_CHAVE, normalizarChave } = require('../utils/pix');
const { contarAbertas } = require('../services/lgpd');

const soAdmin = [exigirColegio, exigirPerfil('admin')];

/** Cadastros aguardando aprovação no colégio (só o admin aprova). */
async function contarPendentes(colegioId) {
  const r = await queryUm(
    `SELECT COUNT(*) AS total, COALESCE(SUM(perfil = 'responsavel'), 0) AS responsaveis
       FROM usuario_colegio WHERE colegio_id = ? AND status = 'pendente'`,
    [colegioId]
  );
  const total = Number(r.total || 0);
  const responsaveis = Number(r.responsaveis || 0);
  return { total, responsaveis, equipe: total - responsaveis };
}
const soEquipe = [exigirColegio, exigirPerfil('admin', 'professor', 'financeiro')];

/* ---------------- Ler colégio atual ---------------- */
router.get('/atual', exigirColegio, assincrono(async (req, res) => {
  const c = await queryUm(
    `SELECT c.id, c.nome, c.cnpj, c.telefone, c.email, c.endereco, c.codigo_convite, c.whatsapp_notif,
            cfg.ano_letivo, cfg.valor_mensalidade, cfg.dia_vencimento, cfg.media_aprovacao,
            cfg.frequencia_minima, cfg.timeout_sessao_min, cfg.pix_tipo, cfg.pix_chave, cfg.pix_beneficiario,
            cfg.cidade, cfg.cobranca_instrucoes, cfg.link_validade_dias
       FROM colegios c
       LEFT JOIN config_colegio cfg ON cfg.colegio_id = c.id
      WHERE c.id = ?`,
    [req.colegioId]
  );
  if (!c) throw new HttpErro(404, 'Colégio não encontrado', 'nao_encontrado');

  const disciplinas = req.perfil === 'responsavel'
    ? []
    : await query(
      'SELECT id, nome, ordem, ativo FROM disciplinas WHERE colegio_id = ? ORDER BY ordem, nome',
      [req.colegioId]
    );

  const admin = req.perfil === 'admin';
  // Bimestres do ano letivo (calendário): "bimestre atual" nas telas de notas
  const periodos = c.ano_letivo
    ? await query('SELECT bimestre, inicio, fim FROM periodos_letivos WHERE colegio_id = ? AND ano = ? ORDER BY bimestre', [req.colegioId, c.ano_letivo])
    : [];
  res.json({
    id: c.id,
    nome: c.nome,
    cnpj: c.cnpj,
    telefone: c.telefone,
    email: c.email,
    endereco: c.endereco,
    // Dados internos só para o admin
    codigoConvite: admin ? c.codigo_convite : undefined,
    whatsappNotif: admin ? c.whatsapp_notif : undefined,
    config: {
      anoLetivo: c.ano_letivo,
      valorMensalidade: c.valor_mensalidade,
      diaVencimento: c.dia_vencimento,
      mediaAprovacao: c.media_aprovacao,
      frequenciaMinima: c.frequencia_minima,
      timeoutSessaoMin: c.timeout_sessao_min
    },
    // Dados de cobrança (a chave PIX já é pública: vai impressa nas cobranças)
    cobranca: req.perfil === 'responsavel' ? undefined : {
      pixTipo: c.pix_tipo,
      pixChave: c.pix_chave,
      pixBeneficiario: c.pix_beneficiario,
      cidade: c.cidade,
      instrucoes: c.cobranca_instrucoes,
      linkValidadeDias: c.link_validade_dias || 30,
      pixConfigurado: !!(c.pix_tipo && c.pix_chave && c.cidade)
    },
    disciplinas: disciplinas.map((d) => ({ id: d.id, nome: d.nome, ordem: d.ordem, ativo: !!d.ativo })),
    periodos: periodos.map((p) => ({ bimestre: Number(p.bimestre), inicio: p.inicio, fim: p.fim })),
    pendentes: admin ? await contarPendentes(req.colegioId) : undefined,
    privacidade: admin ? await contarAbertas(req.colegioId) : undefined, // pedidos LGPD em aberto (menu)
    perfil: req.perfil,
    modulos: req.modulos
  });
}));

/* ---------------- Editar dados ---------------- */
router.put('/atual', soAdmin, assincrono(async (req, res) => {
  await salvarDadosColegio(query, req.colegioId, lerDadosColegio(req.body));
  await atividade(req.colegioId, req.usuario.id, 'Dados do colégio atualizados');
  res.json({ ok: true });
}));

/* ---------------- Configuração ---------------- */
router.put('/atual/config', soAdmin, assincrono(async (req, res) => {
  const b = req.body;
  const cfg = [
    v.inteiro(b.anoLetivo, 'Ano letivo', { min: 2000, max: 2100, obrigatorio: true }),
    v.decimal(b.valorMensalidade, 'Valor da mensalidade', { min: 0, max: 99999999, obrigatorio: true }),
    v.inteiro(b.diaVencimento, 'Dia de vencimento', { min: 1, max: 28, obrigatorio: true }),
    v.decimal(b.mediaAprovacao, 'Média de aprovação', { min: 0, max: 10, obrigatorio: true }),
    v.inteiro(b.frequenciaMinima, 'Frequência mínima', { min: 0, max: 100, obrigatorio: true }),
    // 0 = desativado (corrige o bug do "Desativado" virar 15 min)
    v.inteiro(b.timeoutSessaoMin, 'Timeout de sessão', { min: 0, max: 240, obrigatorio: true })
  ];
  await query(
    `INSERT INTO config_colegio
       (colegio_id, ano_letivo, valor_mensalidade, dia_vencimento, media_aprovacao, frequencia_minima, timeout_sessao_min)
     VALUES (?, ?, ?, ?, ?, ?, ?) AS novo
     ON DUPLICATE KEY UPDATE
       ano_letivo = novo.ano_letivo, valor_mensalidade = novo.valor_mensalidade,
       dia_vencimento = novo.dia_vencimento, media_aprovacao = novo.media_aprovacao,
       frequencia_minima = novo.frequencia_minima, timeout_sessao_min = novo.timeout_sessao_min`,
    [req.colegioId, ...cfg]
  );
  await atividade(req.colegioId, req.usuario.id, 'Configurações do colégio atualizadas');
  res.json({ ok: true });
}));

/* ---------------- Cobrança (PIX e documentos) ---------------- */
router.put('/atual/cobranca', soAdmin, assincrono(async (req, res) => {
  const b = req.body;
  const tipo = v.umDe(b.pixTipo || null, Object.keys(TIPOS_CHAVE), 'Tipo da chave PIX', { obrigatorio: false });
  let chave = null;
  if (tipo) {
    if (!String(b.pixChave || '').trim()) throw new HttpErro(400, 'Informe a chave PIX', 'validacao');
    if (tipo === 'cpf') v.cpf(b.pixChave, 'Chave PIX (CPF)');
    if (tipo === 'cnpj') v.cnpj(b.pixChave, 'Chave PIX (CNPJ)');
    chave = normalizarChave(tipo, b.pixChave);
    if (!chave) throw new HttpErro(400, `Chave PIX inválida para o tipo ${TIPOS_CHAVE[tipo]}`, 'validacao');
  }
  const beneficiario = v.texto(b.pixBeneficiario, 'Nome do beneficiário', { max: 60 });
  const cidade = v.texto(b.cidade, 'Cidade', { max: 60 });
  if (tipo && !cidade) throw new HttpErro(400, 'Informe a cidade — ela é obrigatória no QR Code PIX', 'validacao');
  const instrucoes = v.texto(b.instrucoes, 'Instruções', { max: 300 });
  const validade = v.inteiro(b.linkValidadeDias, 'Validade dos links', { min: 1, max: 365 }) || 30;

  const antes = await queryUm('SELECT pix_tipo, pix_chave FROM config_colegio WHERE colegio_id = ?', [req.colegioId]);
  if (!antes) throw new HttpErro(404, 'Configuração do colégio não encontrada', 'nao_encontrado');
  await query(
    `UPDATE config_colegio SET pix_tipo = ?, pix_chave = ?, pix_beneficiario = ?, cidade = ?,
            cobranca_instrucoes = ?, link_validade_dias = ?
      WHERE colegio_id = ?`,
    [tipo, chave, beneficiario, cidade, instrucoes, validade, req.colegioId]
  );
  // Trocar a chave PIX muda para onde vai o dinheiro: fica no log de segurança
  if ((antes.pix_chave || null) !== chave) {
    const fim = chave ? `${TIPOS_CHAVE[tipo]} terminada em ${chave.slice(-4)}` : 'removida';
    await seguranca(req, {
      tipo: 'admin', colegioId: req.colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
      detalhes: `Chave PIX das cobranças alterada (${fim})`
    });
  }
  await atividade(req.colegioId, req.usuario.id, 'Dados de cobrança (PIX) atualizados');
  res.json({ ok: true, pixChave: chave });
}));

/* ---------------- Código de convite ---------------- */
router.post('/atual/convite/regenerar', soAdmin, assincrono(async (req, res) => {
  let codigo = null;
  for (let t = 0; t < 5 && !codigo; t++) {
    const novo = codigoConvite();
    try {
      await query('UPDATE colegios SET codigo_convite = ? WHERE id = ?', [novo, req.colegioId]);
      codigo = novo;
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY' || t === 4) throw e;
    }
  }
  await seguranca(req, {
    tipo: 'admin', colegioId: req.colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: 'Gerou novo código de convite (o anterior deixou de funcionar)'
  });
  res.json({ codigoConvite: codigo });
}));

/* ---------------- Disciplinas ---------------- */
router.post('/atual/disciplinas', soAdmin, assincrono(async (req, res) => {
  const nome = v.texto(req.body.nome, 'Disciplina', { max: 60, obrigatorio: true });
  const ordem = v.inteiro(req.body.ordem, 'Ordem', { min: 0, max: 999 });
  const prox = ordem !== null ? ordem : ((await queryUm(
    'SELECT COALESCE(MAX(ordem), 0) + 1 AS prox FROM disciplinas WHERE colegio_id = ?', [req.colegioId]
  )).prox);
  const r = await query(
    'INSERT INTO disciplinas (colegio_id, nome, ordem) VALUES (?, ?, ?)',
    [req.colegioId, nome, prox]
  );
  await atividade(req.colegioId, req.usuario.id, `Disciplina criada: ${nome}`);
  res.status(201).json({ id: r.insertId, nome, ordem: prox, ativo: true });
}));

router.put('/atual/disciplinas/:id', soAdmin, assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const atual = await queryUm('SELECT id, nome, ordem, ativo FROM disciplinas WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  if (!atual) throw new HttpErro(404, 'Disciplina não encontrada', 'nao_encontrado');

  const nome = req.body.nome !== undefined ? v.texto(req.body.nome, 'Disciplina', { max: 60, obrigatorio: true }) : atual.nome;
  const ordem = req.body.ordem !== undefined ? v.inteiro(req.body.ordem, 'Ordem', { min: 0, max: 999, obrigatorio: true }) : atual.ordem;
  const ativo = req.body.ativo !== undefined ? (req.body.ativo ? 1 : 0) : atual.ativo;

  await query('UPDATE disciplinas SET nome = ?, ordem = ?, ativo = ? WHERE id = ? AND colegio_id = ?',
    [nome, ordem, ativo, id, req.colegioId]);
  res.json({ id, nome, ordem, ativo: !!ativo });
}));

router.delete('/atual/disciplinas/:id', soAdmin, assincrono(async (req, res) => {
  const id = v.id(req.params.id);
  const d = await queryUm('SELECT nome FROM disciplinas WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  if (!d) throw new HttpErro(404, 'Disciplina não encontrada', 'nao_encontrado');

  const uso = await queryUm(
    `SELECT (SELECT COUNT(*) FROM notas WHERE disciplina_id = ? AND colegio_id = ?) AS notas,
            (SELECT COUNT(*) FROM diarios WHERE disciplina_id = ? AND colegio_id = ?) AS diarios`,
    [id, req.colegioId, id, req.colegioId]
  );
  if (uso.notas > 0 || uso.diarios > 0) {
    const partes = [];
    if (uso.notas) partes.push(`${uso.notas} nota(s) lançada(s)`);
    if (uso.diarios) partes.push(`${uso.diarios} registro(s) no diário`);
    throw new HttpErro(409, `A disciplina ${d.nome} tem ${partes.join(' e ')}. Desative em vez de excluir.`, 'em_uso');
  }
  await query('DELETE FROM disciplinas WHERE id = ? AND colegio_id = ?', [id, req.colegioId]);
  await atividade(req.colegioId, req.usuario.id, `Disciplina excluída: ${d.nome}`);
  res.status(204).end();
}));

/* ---------------- Implantação (checklist do administrador) ----------------
 * O que já foi configurado no colégio, para a Central de ajuda e o Dashboard
 * mostrarem os próximos passos. Só contagens: nenhum dado pessoal. */
router.get('/atual/implantacao', soAdmin, assincrono(async (req, res) => {
  const c = req.colegioId;
  const cfg = await queryUm('SELECT ano_letivo, valor_mensalidade, pix_chave, cidade, encarregado_nome, encarregado_email FROM config_colegio WHERE colegio_id = ?', [c]);
  const ano = cfg ? Number(cfg.ano_letivo) : Number(hojeSP().slice(0, 4));
  const n = await queryUm(
    `SELECT
       (SELECT COUNT(*) FROM colegios WHERE id = ? AND COALESCE(cnpj, '') <> '' AND COALESCE(telefone, '') <> '' AND COALESCE(endereco, '') <> '') AS dados,
       (SELECT COUNT(*) FROM colegio_logos WHERE colegio_id = ?) AS logo,
       (SELECT COUNT(*) FROM turmas WHERE colegio_id = ? AND ano_letivo = ? AND ativo = 1) AS turmas,
       (SELECT COUNT(*) FROM professores WHERE colegio_id = ? AND status = 'ativo') AS professores,
       (SELECT COUNT(*) FROM atribuicoes a JOIN turmas t ON t.id = a.turma_id WHERE a.colegio_id = ? AND t.ano_letivo = ?) AS atribuicoes,
       (SELECT COUNT(*) FROM horarios_aula WHERE colegio_id = ?) AS horarios,
       (SELECT COUNT(*) FROM grade_horaria g JOIN turmas t ON t.id = g.turma_id WHERE g.colegio_id = ? AND t.ano_letivo = ?) AS grade,
       (SELECT COUNT(*) FROM periodos_letivos WHERE colegio_id = ? AND ano = ?) AS bimestres,
       (SELECT COUNT(*) FROM alunos WHERE colegio_id = ? AND status = 'ativo') AS alunos,
       (SELECT COUNT(*) FROM alunos WHERE colegio_id = ? AND status = 'ativo' AND turma_id IS NULL) AS sem_turma,
       (SELECT COUNT(*) FROM mensalidades WHERE colegio_id = ? AND referencia LIKE ?) AS mensalidades,
       (SELECT COUNT(*) FROM usuario_colegio WHERE colegio_id = ? AND status = 'ativo' AND perfil <> 'responsavel') AS equipe,
       (SELECT COUNT(*) FROM responsavel_aluno WHERE colegio_id = ?) AS familias`,
    [c, c, c, ano, c, c, ano, c, c, ano, c, ano, c, c, c, `${ano}-%`, c, c]
  );
  const num = Object.fromEntries(Object.entries(n).map(([k, x]) => [k, Number(x)]));
  const itens = {
    dados: num.dados > 0,
    mensalidade: !!(cfg && Number(cfg.valor_mensalidade) > 0),
    pix: !!(cfg && cfg.pix_chave && cfg.cidade),
    documentos: num.logo > 0,
    turmas: num.turmas > 0,
    professores: num.professores > 0,
    atribuicoes: num.atribuicoes > 0,
    horarios: num.horarios > 0,
    grade: num.grade > 0,
    calendario: num.bimestres > 0,
    alunos: num.alunos > 0,
    enturmados: num.alunos > 0 && num.sem_turma === 0,
    mensalidades: num.mensalidades > 0,
    equipe: num.equipe >= 2,
    familias: num.familias > 0,
    lgpd: !!(cfg && cfg.encarregado_nome && cfg.encarregado_email)
  };
  res.json({
    anoLetivo: ano,
    itens,
    feitos: Object.values(itens).filter(Boolean).length,
    total: Object.keys(itens).length,
    numeros: { turmas: num.turmas, professores: num.professores, alunos: num.alunos, semTurma: num.sem_turma, equipe: num.equipe, familias: num.familias }
  });
}));

/* ---------------- Indicadores do Dashboard ---------------- */
router.get('/atual/resumo', soEquipe, exigirModulo('dashboard'), assincrono(async (req, res) => {
  const cfg = await queryUm('SELECT ano_letivo FROM config_colegio WHERE colegio_id = ?', [req.colegioId]);
  const ano = cfg ? cfg.ano_letivo : Number(hojeSP().slice(0, 4));
  const r = await queryUm(
    `SELECT
       (SELECT COUNT(*) FROM alunos WHERE colegio_id = ? AND status = 'ativo') AS alunos,
       (SELECT COUNT(*) FROM alunos WHERE colegio_id = ? AND status = 'ativo' AND turma_id IS NULL) AS alunos_sem_turma,
       (SELECT COUNT(*) FROM professores WHERE colegio_id = ? AND status = 'ativo') AS professores,
       (SELECT COUNT(*) FROM turmas WHERE colegio_id = ? AND ativo = 1 AND ano_letivo = ?) AS turmas,
       (SELECT COUNT(DISTINCT aluno_id) FROM mensalidades
         WHERE colegio_id = ? AND status = 'pendente' AND valor > 0 AND vencimento < ?) AS inadimplentes`,
    [req.colegioId, req.colegioId, req.colegioId, req.colegioId, ano, req.colegioId, hojeSP()]
  );
  res.json({
    anoLetivo: ano,
    alunos: Number(r.alunos),
    alunosSemTurma: Number(r.alunos_sem_turma),
    professores: Number(r.professores),
    turmas: Number(r.turmas),
    inadimplentes: Number(r.inadimplentes),
    pendentes: req.perfil === 'admin' ? await contarPendentes(req.colegioId) : undefined,
    privacidade: req.perfil === 'admin' ? await contarAbertas(req.colegioId) : undefined
  });
}));

/* ---------------- Atividade recente ---------------- */
// Exige o módulo Dashboard (o admin sempre tem)
// ?limite=  ?antes=<id> (próxima página)  ?autor=<usuarioId>
router.get('/atual/atividades', soEquipe, exigirModulo('dashboard'), assincrono(async (req, res) => {
  const limite = v.inteiro(req.query.limite, 'Limite', { min: 1, max: 100 }) || 20;
  const antes = v.inteiro(req.query.antes, 'Página', { min: 1 });
  const autor = v.inteiro(req.query.autor, 'Pessoa', { min: 1 });
  const cond = ['a.colegio_id = ?']; const params = [req.colegioId];
  if (antes) { cond.push('a.id < ?'); params.push(antes); }
  if (autor) { cond.push('a.usuario_id = ?'); params.push(autor); }
  const itens = await query(
    `SELECT a.id, a.acao, a.criado_em, u.nome AS autor
       FROM atividades a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE ${cond.join(' AND ')}
      ORDER BY a.id DESC
      LIMIT ?`,
    [...params, limite]
  );
  res.json(itens.map((a) => ({ id: a.id, acao: a.acao, autor: a.autor, data: a.criado_em })));
}));

/* Quem aparece na atividade do colégio (filtro do "Ver todas") */
router.get('/atual/atividades/autores', soEquipe, exigirModulo('dashboard'), assincrono(async (req, res) => {
  const linhas = await query(
    `SELECT u.id, u.nome, COUNT(*) AS n FROM atividades a JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.colegio_id = ? GROUP BY u.id, u.nome ORDER BY u.nome`,
    [req.colegioId]
  );
  res.json(linhas.map((l) => ({ id: l.id, nome: l.nome, atividades: Number(l.n) })));
}));

module.exports = router;
