'use strict';
/* =====================================================================
 *  /api/painel — cartões do Dashboard   [equipe com o módulo dashboard]
 *
 *  GET /financeiro   mensalidades do mês, atraso e contas dos próximos 7 dias
 *                    (mensalidades e contas conforme os módulos da pessoa)
 *  GET /pedagogico   aulas sem chamada (7 dias) e notas que faltam no bimestre
 *                    (chamada: módulo diario · notas: módulo notas)
 *  GET /atencao      alunos com frequência ou média abaixo do mínimo
 *
 *  Professor: só as turmas e disciplinas atribuídas a ele.
 * ===================================================================== */
const router = require('express').Router();
const { exigirModulo, exigirAlgumModulo } = require('../middleware/auth');
const { assincrono } = require('../middleware/erros');
const { escopo } = require('../services/escopo');
const painel = require('../services/painel');

const tem = (req, m) => req.perfil === 'admin' || (req.modulos || []).includes(m);

router.use(exigirModulo('dashboard'));

router.get('/financeiro', exigirAlgumModulo(['mensalidades', 'contas']), assincrono(async (req, res) => {
  res.json(await painel.financeiro(req.colegioId, { mensalidades: tem(req, 'mensalidades'), contas: tem(req, 'contas') }));
}));

router.get('/pedagogico', exigirAlgumModulo(['diario', 'notas']), assincrono(async (req, res) => {
  res.json(await painel.pedagogico(req.colegioId, await escopo(req), { diario: tem(req, 'diario'), notas: tem(req, 'notas') }));
}));

router.get('/atencao', exigirAlgumModulo(['boletim', 'notas', 'diario']), assincrono(async (req, res) => {
  res.json(await painel.atencao(req.colegioId, await escopo(req)));
}));

module.exports = router;
