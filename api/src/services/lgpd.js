'use strict';
/* =====================================================================
 *  LGPD (Lei 13.709/2018)
 *  · Termos de uso e política de privacidade: versão atual e aceite de
 *    cada pessoa (data, IP e dispositivo).
 *  · Encarregado pelo tratamento de dados do colégio (art. 41).
 *  · Pedidos dos titulares (art. 18): abertos pelo responsável no portal,
 *    respondidos pelo administrador em até 15 dias (art. 19).
 *  · Cópia dos dados (acesso e portabilidade) do aluno e do responsável.
 *  · Minimização: apagar interessados do funil perdidos há mais de 1 ano.
 *  O colégio é o controlador; a Reis Tecnologia, a operadora.
 * ===================================================================== */
const { query, queryUm, transacao } = require('../db');
const { HttpErro } = require('../middleware/erros');
const { decifrar } = require('../utils/crypto');
const { agoraSP, hojeSP } = require('../utils/datas');
const { ipCliente } = require('../utils/ip');
const { dispositivo } = require('../utils/auditoria');

/** Mudou o texto de termos.html ou privacidade.html? Troque a versão: todos aceitam de novo. */
const TERMOS_VERSAO = '2026-10';
const PRAZO_DIAS = 15;
const TIPOS = {
  acesso: 'Saber quais dados o colégio tem',
  correcao: 'Corrigir dados',
  exclusao: 'Excluir dados',
  portabilidade: 'Receber uma cópia dos dados',
  revogacao: 'Revogar consentimento ou não receber comunicações',
  informacao: 'Saber com quem os dados são compartilhados',
  outro: 'Outro assunto'
};
const STATUS = { aberta: 'Aberta', em_andamento: 'Em andamento', concluida: 'Concluída', recusada: 'Recusada' };
const MESES_CAPTACAO = 12;

function somarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const limiteCaptacao = () => {
  const d = new Date(`${hojeSP()}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - MESES_CAPTACAO);
  return d.toISOString().slice(0, 10);
};

/* ---------------- Termos ---------------- */
async function termosDoUsuario(usuarioId) {
  const r = await queryUm('SELECT aceito_em FROM termos_aceites WHERE usuario_id = ? AND versao = ?', [usuarioId, TERMOS_VERSAO]);
  return { versao: TERMOS_VERSAO, aceito: !!r, aceitoEm: r ? r.aceito_em : null };
}
async function aceitarTermos(req, { usuarioId, colegioId, perfil }) {
  await query(
    `INSERT IGNORE INTO termos_aceites (usuario_id, versao, colegio_id, perfil, aceito_em, ip, dispositivo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [usuarioId, TERMOS_VERSAO, colegioId || null, perfil || null, agoraSP(), ipCliente(req).slice(0, 45), dispositivo(req.headers['user-agent'])]
  );
  return termosDoUsuario(usuarioId);
}

/* ---------------- Encarregado ---------------- */
async function encarregado(colegioId) {
  const r = await queryUm(
    `SELECT c.nome AS colegio, c.email AS colegio_email, c.telefone AS colegio_telefone,
            cfg.encarregado_nome, cfg.encarregado_email, cfg.encarregado_telefone
       FROM colegios c LEFT JOIN config_colegio cfg ON cfg.colegio_id = c.id WHERE c.id = ?`,
    [colegioId]
  );
  return {
    colegio: r ? r.colegio : null,
    nome: (r && r.encarregado_nome) || null,
    email: (r && r.encarregado_email) || null,
    telefone: (r && r.encarregado_telefone) || null,
    // sem encarregado definido, o contato é o do colégio
    contatoEmail: (r && (r.encarregado_email || r.colegio_email)) || null,
    contatoTelefone: (r && (r.encarregado_telefone || r.colegio_telefone)) || null
  };
}
async function salvarEncarregado(colegioId, { nome, email, telefone }) {
  const tem = await queryUm('SELECT colegio_id FROM config_colegio WHERE colegio_id = ?', [colegioId]);
  if (tem) {
    await query('UPDATE config_colegio SET encarregado_nome = ?, encarregado_email = ?, encarregado_telefone = ? WHERE colegio_id = ?',
      [nome || null, email || null, telefone || null, colegioId]);
  } else {
    await query('INSERT INTO config_colegio (colegio_id, ano_letivo, encarregado_nome, encarregado_email, encarregado_telefone) VALUES (?, ?, ?, ?, ?)',
      [colegioId, Number(hojeSP().slice(0, 4)), nome || null, email || null, telefone || null]);
  }
  return encarregado(colegioId);
}

/* ---------------- Cópia dos dados ---------------- */
const ou = (x) => (x === undefined || x === '' ? null : x);
const SIT_MENS = (m) => (m.status === 'pago' ? 'paga' : m.status === 'cancelado' ? 'cancelada' : Number(m.valor) === 0 ? 'isenta' : m.vencimento < hojeSP() ? 'vencida' : 'em aberto');

/** Tudo o que o EduGest guarda sobre um aluno deste colégio (para o titular ou a pedido dele). */
async function exportarAluno(colegioId, alunoId) {
  const a = await queryUm(
    `SELECT a.*, t.nome AS turma, t.serie, t.ano_letivo FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id
      WHERE a.id = ? AND a.colegio_id = ?`, [alunoId, colegioId]);
  if (!a) throw new HttpErro(404, 'Aluno não encontrado', 'nao_encontrado');
  const [autorizados, responsaveis, notas, frequencia, mensalidades, documentos, anos] = await Promise.all([
    query('SELECT nome, parentesco, documento_cript, telefone FROM autorizados_retirada WHERE aluno_id = ? AND colegio_id = ?', [alunoId, colegioId]),
    query(`SELECT u.nome, u.email, ra.parentesco FROM responsavel_aluno ra JOIN usuarios u ON u.id = ra.usuario_id
            WHERE ra.aluno_id = ? AND ra.colegio_id = ? ORDER BY u.nome`, [alunoId, colegioId]),
    query(`SELECT t.ano_letivo, t.nome AS turma, d.nome AS disciplina, n.bimestre, n.n1, n.n2, n.trabalho
             FROM notas n JOIN turmas t ON t.id = n.turma_id LEFT JOIN disciplinas d ON d.id = n.disciplina_id
            WHERE n.aluno_id = ? AND n.colegio_id = ? ORDER BY t.ano_letivo, d.nome, n.bimestre`, [alunoId, colegioId]),
    query(`SELECT di.data, t.nome AS turma, d.nome AS disciplina, f.status
             FROM frequencias f JOIN diarios di ON di.id = f.diario_id JOIN turmas t ON t.id = di.turma_id
             LEFT JOIN disciplinas d ON d.id = di.disciplina_id
            WHERE f.aluno_id = ? AND di.colegio_id = ? ORDER BY di.data`, [alunoId, colegioId]),
    query(`SELECT referencia, vencimento, valor_bruto, desconto, valor, status, data_pagamento, valor_pago, forma_pagamento
             FROM mensalidades WHERE aluno_id = ? AND colegio_id = ? ORDER BY referencia`, [alunoId, colegioId]),
    query(`SELECT ano, numero, codigo, tipo, titulo, emitido_em, cancelado_em FROM documentos_emitidos
            WHERE aluno_id = ? AND colegio_id = ? ORDER BY emitido_em`, [alunoId, colegioId]),
    query(`SELECT ano, serie, escola, cidade, uf, frequencia, resultado FROM historico_anos
            WHERE aluno_id = ? AND colegio_id = ? AND turma_id IS NULL ORDER BY ano`, [alunoId, colegioId])
  ]);
  const freqStatus = { P: 'presente', F: 'falta', J: 'falta justificada' };
  return {
    aluno: {
      nome: a.nome, ra: a.ra, nascimento: ou(a.nascimento), cpf: ou(decifrar(a.cpf_cript)), rg: ou(decifrar(a.rg_cript)),
      endereco: ou(a.endereco), situacao: a.status, turma: ou(a.turma), serie: ou(a.serie), anoLetivo: a.ano_letivo || null,
      mae: ou(a.mae_nome), pai: ou(a.pai_nome), naturalidade: ou(a.naturalidade), naturalidadeUf: ou(a.naturalidade_uf),
      nacionalidade: ou(a.nacionalidade), dataMatricula: ou(a.data_matricula), dataSaida: ou(a.data_saida)
    },
    responsavelCadastrado: {
      nome: ou(a.resp_nome), parentesco: ou(a.resp_parentesco), cpf: ou(decifrar(a.resp_cpf_cript)),
      telefone: ou(a.resp_telefone), email: ou(a.resp_email)
    },
    autorizadosRetirada: autorizados.map((x) => ({ nome: x.nome, parentesco: ou(x.parentesco), documento: ou(decifrar(x.documento_cript)), telefone: ou(x.telefone) })),
    responsaveisNoPortal: responsaveis.map((x) => ({ nome: x.nome, email: x.email, parentesco: ou(x.parentesco) })),
    notas: notas.map((x) => ({ ano: Number(x.ano_letivo), turma: x.turma, disciplina: x.disciplina, bimestre: Number(x.bimestre), nota1: x.n1, nota2: x.n2, trabalho: x.trabalho })),
    frequencia: frequencia.map((x) => ({ data: x.data, turma: x.turma, aula: x.disciplina || 'Chamada do dia', registro: freqStatus[x.status] || x.status })),
    mensalidades: mensalidades.map((m) => ({
      referencia: m.referencia, vencimento: m.vencimento, valorSemDesconto: Number(m.valor_bruto), desconto: Number(m.desconto || 0), valor: Number(m.valor),
      situacao: SIT_MENS(m), pagaEm: ou(m.data_pagamento), valorPago: m.valor_pago === null ? null : Number(m.valor_pago), forma: ou(m.forma_pagamento)
    })),
    documentosEmitidos: documentos.map((d) => ({ numero: `${d.numero}/${d.ano}`, codigoValidacao: d.codigo, tipo: d.tipo, titulo: d.titulo, emitidoEm: d.emitido_em, cancelado: !!d.cancelado_em })),
    anosAnterioresNoHistorico: anos.map((x) => ({ ano: x.ano, serie: x.serie, escola: x.escola, cidade: ou(x.cidade), uf: ou(x.uf), frequencia: x.frequencia, resultado: ou(x.resultado) }))
  };
}

/** Cópia dos dados de um responsável (os dele e os de cada filho vinculado) — o colégio baixa para atender o pedido. */
async function exportarResponsavel(usuarioId, colegioId) {
  const [u, termos, filhos, leituras, pedidos, enc] = await Promise.all([
    queryUm('SELECT nome, email, criado_em, ultimo_acesso FROM usuarios WHERE id = ?', [usuarioId]),
    query('SELECT versao, aceito_em, ip, dispositivo FROM termos_aceites WHERE usuario_id = ? ORDER BY aceito_em', [usuarioId]),
    query(`SELECT ra.aluno_id, ra.parentesco FROM responsavel_aluno ra WHERE ra.usuario_id = ? AND ra.colegio_id = ?`, [usuarioId, colegioId]),
    query(`SELECT c.titulo, l.lido_em, l.ciente_em FROM comunicado_leituras l JOIN comunicados c ON c.id = l.comunicado_id
            WHERE l.usuario_id = ? AND l.colegio_id = ? ORDER BY l.lido_em`, [usuarioId, colegioId]),
    listarSolicitacoes(colegioId, { usuarioId }),
    encarregado(colegioId)
  ]);
  const alunos = [];
  for (const f of filhos) alunos.push({ parentesco: ou(f.parentesco), ...(await exportarAluno(colegioId, f.aluno_id)) });
  return {
    sobre: `Cópia dos dados pessoais guardados no EduGest pelo ${enc.colegio || 'colégio'} (controlador dos dados). Gerada em ${agoraSP()} a pedido do titular (art. 18 da LGPD).`,
    contatoPrivacidade: { encarregado: enc.nome, email: enc.contatoEmail, telefone: enc.contatoTelefone },
    voce: u ? { nome: u.nome, email: u.email, contaCriadaEm: u.criado_em, ultimoAcesso: u.ultimo_acesso } : null,
    aceitesDosTermos: termos.map((t) => ({ versao: t.versao, aceitoEm: t.aceito_em, ip: t.ip, dispositivo: t.dispositivo })),
    comunicadosLidos: leituras.map((l) => ({ titulo: l.titulo, lidoEm: l.lido_em, cienteEm: ou(l.ciente_em) })),
    pedidosDePrivacidade: pedidos.map(({ id, tipo, descricao, status, resposta, criadaEm, respondidaEm }) => ({ id, tipo, descricao, status, resposta, criadaEm, respondidaEm })),
    alunos
  };
}

/* ---------------- Pedidos dos titulares ---------------- */
function formatarSolicitacao(s) {
  return {
    id: s.id, tipo: s.tipo, tipoRotulo: TIPOS[s.tipo] || s.tipo, descricao: s.descricao, status: s.status, statusRotulo: STATUS[s.status] || s.status,
    resposta: s.resposta || null, respondidaEm: s.respondida_em || null, respondidaPor: s.respondida_por_nome || null,
    criadaEm: s.criada_em, prazo: s.prazo, atrasada: ['aberta', 'em_andamento'].includes(s.status) && s.prazo < hojeSP(),
    solicitante: s.solicitante_nome, solicitanteEmail: s.solicitante_email || null, solicitanteId: s.usuario_id || null,
    alunoId: s.aluno_id || null, aluno: s.aluno_nome || null
  };
}
async function listarSolicitacoes(colegioId, { usuarioId } = {}) {
  const linhas = await query(
    `SELECT s.*, u.nome AS respondida_por_nome FROM solicitacoes_titular s LEFT JOIN usuarios u ON u.id = s.respondida_por
      WHERE s.colegio_id = ? ${usuarioId ? 'AND s.usuario_id = ?' : ''}
      ORDER BY FIELD(s.status, 'aberta', 'em_andamento', 'concluida', 'recusada'), s.criada_em DESC LIMIT 300`,
    usuarioId ? [colegioId, usuarioId] : [colegioId]
  );
  return linhas.map(formatarSolicitacao);
}
async function criarSolicitacao({ colegioId, usuario, aluno, tipo, descricao }) {
  if (!TIPOS[tipo]) throw new HttpErro(400, 'Escolha o tipo do pedido', 'validacao');
  const texto = String(descricao || '').trim();
  if (texto.length < 10) throw new HttpErro(400, 'Descreva o pedido (pelo menos 10 caracteres)', 'validacao');
  const abertas = await queryUm(`SELECT COUNT(*) AS n FROM solicitacoes_titular WHERE colegio_id = ? AND usuario_id = ? AND status IN ('aberta', 'em_andamento')`,
    [colegioId, usuario.id]);
  if (Number(abertas.n) >= 5) throw new HttpErro(409, 'Você já tem 5 pedidos em aberto. Aguarde a resposta do colégio.', 'limite');
  const hoje = hojeSP();
  const r = await query(
    `INSERT INTO solicitacoes_titular (colegio_id, usuario_id, solicitante_nome, solicitante_email, aluno_id, aluno_nome, tipo, descricao, criada_em, prazo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [colegioId, usuario.id, usuario.nome, usuario.email || null, aluno ? aluno.id : null, aluno ? aluno.nome : null, tipo, texto.slice(0, 2000), agoraSP(), somarDias(hoje, PRAZO_DIAS)]
  );
  const s = await queryUm('SELECT * FROM solicitacoes_titular WHERE id = ?', [r.insertId]);
  return formatarSolicitacao(s);
}
async function responderSolicitacao(colegioId, id, usuarioId, { status, resposta }) {
  if (!STATUS[status]) throw new HttpErro(400, 'Situação inválida', 'validacao');
  const s = await queryUm('SELECT * FROM solicitacoes_titular WHERE id = ? AND colegio_id = ?', [id, colegioId]);
  if (!s) throw new HttpErro(404, 'Pedido não encontrado', 'nao_encontrado');
  const texto = String(resposta || '').trim();
  if (['concluida', 'recusada'].includes(status) && texto.length < 5) {
    throw new HttpErro(400, status === 'recusada' ? 'Explique o motivo da recusa (a família vê a resposta)' : 'Escreva a resposta para a família', 'validacao');
  }
  await query('UPDATE solicitacoes_titular SET status = ?, resposta = ?, respondida_por = ?, respondida_em = ? WHERE id = ? AND colegio_id = ?',
    [status, texto ? texto.slice(0, 4000) : s.resposta, usuarioId, agoraSP(), id, colegioId]);
  const n = await queryUm(`SELECT s.*, u.nome AS respondida_por_nome FROM solicitacoes_titular s LEFT JOIN usuarios u ON u.id = s.respondida_por WHERE s.id = ?`, [id]);
  return formatarSolicitacao(n);
}
/** Para o administrador atender um pedido: os dados de quem pediu (responsável e filhos vinculados neste colégio). */
async function exportarSolicitante(colegioId, id) {
  const s = await queryUm('SELECT id, usuario_id, solicitante_nome FROM solicitacoes_titular WHERE id = ? AND colegio_id = ?', [id, colegioId]);
  if (!s) throw new HttpErro(404, 'Pedido não encontrado', 'nao_encontrado');
  if (!s.usuario_id) throw new HttpErro(409, 'Quem fez o pedido não tem mais conta no sistema. Use a cópia por aluno.', 'sem_conta');
  return { pedido: s.id, solicitante: s.solicitante_nome, dados: await exportarResponsavel(s.usuario_id, colegioId) };
}
async function contarAbertas(colegioId) {
  const r = await queryUm(
    `SELECT COUNT(*) AS n, COALESCE(SUM(prazo < ?), 0) AS atrasadas, MIN(prazo) AS proximo
       FROM solicitacoes_titular WHERE colegio_id = ? AND status IN ('aberta', 'em_andamento')`, [hojeSP(), colegioId]);
  return { abertas: Number(r.n), atrasadas: Number(r.atrasadas), proximoPrazo: r.proximo || null };
}

/* ---------------- Aceites e captação ---------------- */
async function resumoAceites(colegioId) {
  const r = await queryUm(
    `SELECT COUNT(*) AS total, COALESCE(SUM(t.usuario_id IS NOT NULL), 0) AS aceitaram,
            COALESCE(SUM(uc.perfil = 'responsavel'), 0) AS responsaveis,
            COALESCE(SUM(uc.perfil = 'responsavel' AND t.usuario_id IS NOT NULL), 0) AS responsaveis_aceitaram
       FROM usuario_colegio uc LEFT JOIN termos_aceites t ON t.usuario_id = uc.usuario_id AND t.versao = ?
      WHERE uc.colegio_id = ? AND uc.status = 'ativo'`, [TERMOS_VERSAO, colegioId]);
  return {
    versao: TERMOS_VERSAO, total: Number(r.total), aceitaram: Number(r.aceitaram),
    responsaveis: Number(r.responsaveis), responsaveisAceitaram: Number(r.responsaveis_aceitaram)
  };
}
async function captacaoAntiga(colegioId) {
  const r = await queryUm(
    `SELECT COUNT(*) AS n FROM leads WHERE colegio_id = ? AND etapa = 'perdido' AND COALESCE(etapa_em, atualizado_em, criado_em) < ?`,
    [colegioId, limiteCaptacao()]);
  return { meses: MESES_CAPTACAO, perdidosAntigos: Number(r.n) };
}
async function limparCaptacao(colegioId) {
  const r = await query(
    `DELETE FROM leads WHERE colegio_id = ? AND etapa = 'perdido' AND COALESCE(etapa_em, atualizado_em, criado_em) < ?`,
    [colegioId, limiteCaptacao()]);
  return { apagados: r.affectedRows };
}

/* ---------------- Responsável encerra o próprio acesso ---------------- */
async function encerrarAcesso(usuarioId, colegioId) {
  return transacao(async (conn) => {
    const [vinc] = await conn.query('DELETE FROM responsavel_aluno WHERE usuario_id = ? AND colegio_id = ?', [usuarioId, colegioId]);
    const [uc] = await conn.query("DELETE FROM usuario_colegio WHERE usuario_id = ? AND colegio_id = ? AND perfil = 'responsavel'", [usuarioId, colegioId]);
    await conn.query('UPDATE usuarios SET colegio_atual_id = NULL WHERE id = ? AND colegio_atual_id = ?', [usuarioId, colegioId]);
    return { alunosDesvinculados: vinc.affectedRows, acessoRemovido: uc.affectedRows > 0 };
  });
}

module.exports = {
  TERMOS_VERSAO, TIPOS, STATUS, PRAZO_DIAS, somarDias,
  termosDoUsuario, aceitarTermos, encarregado, salvarEncarregado,
  exportarAluno, exportarResponsavel, exportarSolicitante,
  listarSolicitacoes, criarSolicitacao, responderSolicitacao, contarAbertas,
  resumoAceites, captacaoAntiga, limparCaptacao, encerrarAcesso
};
