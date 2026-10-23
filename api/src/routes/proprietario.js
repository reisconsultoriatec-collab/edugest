'use strict';
/* =====================================================================
 *  /api/proprietario — Gestão de Colégios   [somente o proprietário]
 *
 *  GET  /colegios                 todos os colégios do sistema, com números
 *  POST /colegios                 cadastra um colégio novo
 *  PUT  /colegios/:id             dados cadastrais (nome, CNPJ, contatos, endereço)
 *  PUT  /colegios/:id/situacao    { ativo } desativa / reativa um colégio
 *
 *  O proprietário é definido no .env (PROPRIETARIO_EMAILS) — veja
 *  src/utils/proprietario.js. Os parâmetros de cada colégio continuam com
 *  o administrador do colégio (Sistema › Configurações).
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm, transacao } = require('../db');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade, seguranca } = require('../utils/auditoria');
const { criarColegio, lerDadosColegio, salvarDadosColegio } = require('../services/colegios');

/* ---------------- Lista ---------------- */
router.get('/colegios', assincrono(async (req, res) => {
  const [colegios, admins, meus] = await Promise.all([
    query(
      `SELECT c.id, c.nome, c.cnpj, c.telefone, c.email, c.endereco, c.whatsapp_notif, c.codigo_convite, c.ativo, c.criado_em,
              (SELECT COUNT(*) FROM alunos a WHERE a.colegio_id = c.id AND a.status = 'ativo') AS alunos,
              (SELECT COUNT(*) FROM usuario_colegio uc
                WHERE uc.colegio_id = c.id AND uc.status = 'ativo' AND uc.perfil <> 'responsavel') AS equipe,
              (SELECT COUNT(*) FROM usuario_colegio uc
                WHERE uc.colegio_id = c.id AND uc.status = 'ativo' AND uc.perfil = 'responsavel') AS responsaveis,
              (SELECT COUNT(*) FROM usuario_colegio uc
                WHERE uc.colegio_id = c.id AND uc.status = 'pendente') AS pendentes
         FROM colegios c
        ORDER BY c.ativo DESC, c.nome`
    ),
    query(
      `SELECT uc.colegio_id, u.id, u.nome, u.email, uc.status
         FROM usuario_colegio uc JOIN usuarios u ON u.id = uc.usuario_id
        WHERE uc.perfil = 'admin'
        ORDER BY u.nome`
    ),
    query('SELECT colegio_id, perfil, status FROM usuario_colegio WHERE usuario_id = ?', [req.usuario.id])
  ]);

  const adminsPor = new Map();
  admins.forEach((a) => {
    if (!adminsPor.has(a.colegio_id)) adminsPor.set(a.colegio_id, []);
    adminsPor.get(a.colegio_id).push({ nome: a.nome, email: a.email, status: a.status, voce: a.id === req.usuario.id });
  });
  const meuPor = new Map(meus.map((m) => [m.colegio_id, { perfil: m.perfil, status: m.status }]));

  const itens = colegios.map((c) => ({
    id: c.id,
    nome: c.nome,
    cnpj: c.cnpj,
    telefone: c.telefone,
    email: c.email,
    endereco: c.endereco,
    whatsappNotif: c.whatsapp_notif,
    codigoConvite: c.codigo_convite,
    ativo: !!c.ativo,
    criadoEm: c.criado_em,
    alunos: Number(c.alunos),
    equipe: Number(c.equipe),
    responsaveis: Number(c.responsaveis),
    pendentes: Number(c.pendentes),
    administradores: adminsPor.get(c.id) || [],
    meuVinculo: meuPor.get(c.id) || null
  }));

  res.json({
    totais: {
      colegios: itens.length,
      ativos: itens.filter((c) => c.ativo).length,
      alunos: itens.filter((c) => c.ativo).reduce((s, c) => s + c.alunos, 0)
    },
    colegios: itens
  });
}));

/* ---------------- Cadastrar ---------------- */
router.post('/colegios', assincrono(async (req, res) => {
  const nome = v.texto(req.body.nome, 'Nome do colégio', { max: 120, min: 3, obrigatorio: true });
  const cnpj = v.cnpj(req.body.cnpj);
  const telefone = v.telefone(req.body.telefone);
  const endereco = v.texto(req.body.endereco, 'Endereço', { max: 200 });

  // O proprietário vira administrador do colégio novo (para aprovar o
  // diretor quando ele se cadastrar com o código), sem trocar de colégio.
  const colegioId = await transacao((conn) =>
    criarColegio(conn, { nome, usuarioId: req.usuario.id, cnpj, telefone, endereco, tornarAtual: false }));
  const c = await queryUm('SELECT codigo_convite FROM colegios WHERE id = ?', [colegioId]);

  await atividade(colegioId, req.usuario.id, `Colégio cadastrado pela Reis Tecnologia: ${nome}`);
  await seguranca(req, {
    tipo: 'admin', colegioId, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: `Proprietário do sistema cadastrou o colégio ${nome}`
  });
  res.status(201).json({ id: colegioId, nome, codigoConvite: c.codigo_convite });
}));

/* ---------------- Editar dados cadastrais ----------------
 * Só os dados do cadastro. Os parâmetros (ano letivo, mensalidade, PIX...)
 * continuam com o administrador do colégio, em Sistema › Configurações. */
router.put('/colegios/:id', assincrono(async (req, res) => {
  const id = v.inteiro(req.params.id, 'Colégio', { min: 1, obrigatorio: true });
  const c = await queryUm('SELECT id, nome FROM colegios WHERE id = ?', [id]);
  if (!c) throw new HttpErro(404, 'Colégio não encontrado', 'nao_encontrado');

  const dados = lerDadosColegio(req.body);
  await salvarDadosColegio(query, id, dados);

  const renomeado = dados.nome !== c.nome ? ` (antes: ${c.nome})` : '';
  await atividade(id, req.usuario.id, 'Dados do colégio atualizados pela Reis Tecnologia');
  await seguranca(req, {
    tipo: 'admin', colegioId: id, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: `Proprietário do sistema alterou os dados do colégio ${dados.nome}${renomeado}`
  });
  res.json({ id, nome: dados.nome });
}));

/* ---------------- Desativar / reativar ---------------- */
router.put('/colegios/:id/situacao', assincrono(async (req, res) => {
  const id = v.inteiro(req.params.id, 'Colégio', { min: 1, obrigatorio: true });
  if (typeof req.body.ativo !== 'boolean') throw new HttpErro(400, 'Informe se o colégio fica ativo (true/false)', 'validacao');
  const ativo = req.body.ativo;

  const c = await queryUm('SELECT id, nome, ativo FROM colegios WHERE id = ?', [id]);
  if (!c) throw new HttpErro(404, 'Colégio não encontrado', 'nao_encontrado');
  if (!!c.ativo === ativo) return res.json({ id, ativo });

  await query('UPDATE colegios SET ativo = ? WHERE id = ?', [ativo ? 1 : 0, id]);
  const acao = ativo ? 'reativou' : 'desativou';
  await atividade(id, req.usuario.id, `Colégio ${ativo ? 'reativado' : 'desativado'} pela Reis Tecnologia`);
  await seguranca(req, {
    tipo: 'admin', colegioId: id, usuarioId: req.usuario.id, email: req.usuario.email,
    detalhes: `Proprietário do sistema ${acao} o colégio ${c.nome}`
  });
  res.json({ id, ativo });
}));

module.exports = router;
