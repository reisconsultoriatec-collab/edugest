// Painel da Direção: contas do financeiro, alunos e pedagógico, e quem pode ver (sem banco)
// — rodar com: node api/testes/direcao.test.js
const Module = require('module');
const orig = Module._load;
let marcado = 0;
Module._load = function (req) { // o teste não abre o banco
  if (req.endsWith('/db')) return { query: async () => [], queryUm: async () => ({ direcao: marcado }), transacao: async () => null };
  return orig.apply(this, arguments);
};
process.env.PROPRIETARIO_EMAILS = 'dono@exemplo.com';
const d = require('../src/services/direcao');
let falhas = 0;
const conf = (n, ok, extra) => { console.log((ok ? 'ok   ' : 'ERRO ') + n + (ok ? '' : ' → ' + JSON.stringify(extra))); if (!ok) falhas++; };

(async () => {
  /* ---------- Financeiro ---------- */
  const hoje = '2026-10-20';
  const m = (venc, valor, status, pag, extra = {}) => ({ vencimento: venc, valor, valor_bruto: extra.bruto || valor, desconto: extra.desconto || 0, status, data_pagamento: pag || null, valor_pago: extra.pago === undefined ? null : extra.pago });
  const mensalidades = [
    m('2026-09-10', 600, 'pago', '2026-09-09'), m('2026-09-10', 600, 'pendente'),
    m('2026-10-10', 600, 'pago', '2026-10-11', { pago: 612 }), m('2026-10-10', 540, 'pendente', null, { bruto: 600, desconto: 60 }),
    m('2026-10-25', 600, 'pendente'), m('2026-11-10', 600, 'pendente'),
    m('2026-10-10', 600, 'cancelado'), m('2026-10-10', 0, 'pago', '2026-10-01'),
    m('2025-12-10', 600, 'pago', '2026-01-05') // venceu no ano anterior, pago em janeiro: entra só no fluxo
  ];
  const contas = [
    { valor: 1000, status: 'pago', categoria: 'Pessoal', data_pagamento: '2026-10-05' }, { valor: 200, status: 'pago', categoria: 'Energia', data_pagamento: '2026-09-05' },
    { valor: 50, status: 'pago', categoria: null, data_pagamento: '2026-10-06' }, { valor: 999, status: 'pendente', categoria: 'Pessoal', data_pagamento: null }
  ];
  const f = d.montarFinanceiro({ ano: 2026, hoje, mensalidades, contas });
  const out = f.receitaMensal.find((x) => x.mes === '2026-10');
  conf('receita de outubro: previsto sem canceladas e sem valor zero', out.previsto === 1740, out);
  conf('recebido usa o valor pago (com juros)', out.recebido === 612, out);
  conf('vencido (antes de hoje, sem pagar) e a vencer separados', out.vencido === 540 && out.emAberto === 600, out);
  conf('dezembro do ano anterior não entra na receita do ano', f.receitaMensal.find((x) => x.mes === '2026-01').previsto === 0);
  const inad = Object.fromEntries(f.inadimplenciaMensal.map((x) => [x.mes, x.percentual]));
  conf('inadimplência de setembro: 600 de 1.200 = 50%', inad['2026-09'] === 50, inad);
  conf('inadimplência de outubro só do que já venceu: 540 de 1.140', inad['2026-10'] === 47.4, inad);
  conf('mês que ainda não chegou fica sem valor', inad['2026-11'] === null && inad['2026-02'] === null, inad);
  const fl = Object.fromEntries(f.fluxoMensal.map((x) => [x.mes, x]));
  conf('fluxo pelo mês do pagamento (janeiro recebe a de dezembro)', fl['2026-01'].entradas === 600 && fl['2026-10'].entradas === 612 && fl['2026-09'].entradas === 600, fl['2026-01']);
  conf('saídas só das contas pagas', fl['2026-10'].saidas === 1050 && fl['2026-09'].saidas === 200, fl['2026-10']);
  conf('meses futuros sem barras', fl['2026-11'].entradas === null && fl['2026-11'].saldo === null);
  conf('despesas por categoria em ordem, sem categoria vira Outros', f.despesasCategorias.map((c) => c.nome).join() === 'Pessoal,Energia,Outros', f.despesasCategorias);
  conf('receita do mês e percentual', f.receitaMes.previsto === 1740 && f.receitaMes.recebido === 612 && f.receitaMes.percentual === 35.2, f.receitaMes);
  conf('inadimplência do ano: 1.140 de 2.340 vencidos até hoje', f.inadimplenciaAno.valor === 1140 && f.inadimplenciaAno.percentual === 48.7, f.inadimplenciaAno);
  conf('descontos do ano', f.descontos.valor === 60, f.descontos);
  const muitas = Array.from({ length: 8 }, (_, i) => ({ valor: 100 - i, status: 'pago', categoria: `C${i}`, data_pagamento: '2026-03-01' }));
  const f2 = d.montarFinanceiro({ ano: 2026, hoje, mensalidades: [], contas: muitas });
  conf('mais de 6 categorias: 5 maiores + Outras', f2.despesasCategorias.length === 6 && f2.despesasCategorias[5].nome === 'Outras' && f2.despesasCategorias[5].valor === 95 + 94 + 93, f2.despesasCategorias);

  /* ---------- Alunos ---------- */
  const alunos = [
    { id: 1, status: 'ativo', turma_id: 1, data_matricula: '2025-02-01' },
    { id: 2, status: 'ativo', turma_id: 1, data_matricula: '2026-03-15' },
    { id: 3, status: 'transferido', turma_id: 2, data_matricula: '2025-02-01', data_saida: '2026-06-10' },
    { id: 4, status: 'ativo', turma_id: null, data_matricula: null, criado_em: '2026-09-02 10:00:00' }
  ];
  const turmas = [{ id: 1, nome: '5º Ano A', capacidade: 2 }, { id: 2, nome: '6º Ano A', capacidade: 30 }, { id: 3, nome: '7º Ano', capacidade: null }];
  const a = d.montarAlunos({ ano: 2026, hoje, alunos, turmas });
  const am = Object.fromEntries(a.alunosMensal.map((x) => [x.mes, x.ativos]));
  conf('ativos no fim de cada mês (entrada e saída)', am['2026-01'] === 2 && am['2026-03'] === 3 && am['2026-06'] === 2 && am['2026-09'] === 3 && am['2026-10'] === 3, am);
  conf('meses futuros sem valor', am['2026-11'] === null, am);
  const oc = Object.fromEntries(a.ocupacaoTurmas.map((t) => [t.turma, `${t.alunos}/${t.capacidade}`]));
  conf('ocupação por turma (só ativos)', oc['5º Ano A'] === '2/2' && oc['6º Ano A'] === '0/30' && oc['7º Ano'] === '0/null', oc);
  conf('indicadores: ativos, sem turma, vagas, ocupação', a.alunos.ativos === 3 && a.alunos.semTurma === 1 && a.alunos.capacidade === 32 && a.alunos.vagas === 30 && a.alunos.ocupacao === 6.3, a.alunos);
  conf('entradas e saídas do ano; início do ano', a.alunos.entradasAno === 2 && a.alunos.saidasAno === 1 && a.alunos.inicioDoAno === 2, a.alunos);

  /* ---------- Pedagógico ---------- */
  const p = d.montarPedagogico({
    turmas: [{ id: 1, nome: '5º Ano A' }, { id: 2, nome: '6º Ano A' }],
    freq: [{ turma_id: 1, aulas: 10, presentes: 9 }, { turma_id: 2, aulas: 10, presentes: 6 }, { turma_id: 9, aulas: 5, presentes: 5 }],
    notas: [
      { aluno_id: 1, disciplina_id: 10, disciplina: 'Matemática', bimestre: 1, n1: 4, n2: null, trabalho: null },
      { aluno_id: 1, disciplina_id: 10, disciplina: 'Matemática', bimestre: 2, n1: 6, n2: null, trabalho: null },
      { aluno_id: 2, disciplina_id: 10, disciplina: 'Matemática', bimestre: 1, n1: 9, n2: null, trabalho: null },
      { aluno_id: 1, disciplina_id: 11, disciplina: 'Português', bimestre: 1, n1: null, n2: null, trabalho: null }
    ],
    mediaAprov: 6
  });
  conf('frequência por turma (turma de fora do ano ignorada)', p.frequenciaTurmas.map((t) => `${t.turma}:${t.percentual}`).join() === '5º Ano A:90,6º Ano A:60', p.frequenciaTurmas);
  conf('frequência média do colégio', p.frequenciaMedia === 80, p.frequenciaMedia);
  const mat = p.mediasDisciplinas.find((x) => x.disciplina === 'Matemática');
  conf('média da disciplina e alunos abaixo (média do aluno 5,0)', mat.media === 6.3 && mat.alunosAbaixo === 1 && p.mediasDisciplinas.length === 1, p.mediasDisciplinas);
  conf('média geral', p.mediaGeral === 6.3, p.mediaGeral);

  /* ---------- Presença em sala ---------- */
  const tp = [{ id: 1, nome: '6º Ano A', sala: '12', periodo: 'matutino' }, { id: 2, nome: '5º Ano A', sala: null, periodo: 'vespertino' }, { id: 3, nome: '7º Ano', periodo: 'matutino' }];
  const lp = [
    // hoje (28/10), 6º Ano A: Ana presente em 1 das 2 aulas, Bia faltou nas 2, Caio justificada, Duda presente → 2 de 4 = 50% (alerta)
    { turma_id: 1, data: '2026-10-28', aluno_id: 1, p: 1, j: 0 }, { turma_id: 1, data: '2026-10-28', aluno_id: 2, p: 0, j: 0 },
    { turma_id: 1, data: '2026-10-28', aluno_id: 3, p: 0, j: 2 }, { turma_id: 1, data: '2026-10-28', aluno_id: 4, p: 2, j: 0 },
    // hoje, 5º Ano A: 3 de 4 = 75%
    { turma_id: 2, data: '2026-10-28', aluno_id: 5, p: 1, j: 0 }, { turma_id: 2, data: '2026-10-28', aluno_id: 6, p: 1, j: 0 },
    { turma_id: 2, data: '2026-10-28', aluno_id: 7, p: 1, j: 0 }, { turma_id: 2, data: '2026-10-28', aluno_id: 8, p: 0, j: 0 },
    // ontem, 6º Ano A: 1 de 2; sábado 24/10 (fora dos dias letivos) teve chamada
    { turma_id: 1, data: '2026-10-27', aluno_id: 1, p: 1, j: 0 }, { turma_id: 1, data: '2026-10-27', aluno_id: 2, p: 0, j: 0 },
    { turma_id: 2, data: '2026-10-24', aluno_id: 5, p: 1, j: 0 }
  ];
  const dl = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28'];
  const pr = d.montarPresenca({ turmas: tp, dias: dl, linhas: lp, hoje: '2026-10-28' });
  conf('últimos 5 dias (inclui dia com chamada fora do calendário), o último é hoje', pr.dias.join() === '2026-10-23,2026-10-24,2026-10-26,2026-10-27,2026-10-28' && pr.principal === '2026-10-28' && pr.resumo.ehHoje, pr.dias);
  const t6 = pr.turmas.find((t) => t.turma === '6º Ano A'); const h6 = t6.dias[4];
  conf('aluno conta por dia: presente em alguma aula; senão justificada; senão falta', h6.alunos === 4 && h6.presentes === 2 && h6.justificadas === 1 && h6.faltas === 1 && h6.percentual === 50, h6);
  conf('abaixo de 60% fica em alerta', t6.alerta && !pr.turmas.find((t) => t.turma === '5º Ano A').alerta, pr.turmas.map((t) => [t.turma, t.alerta]));
  conf('turma sem chamada: sem percentual e sem alerta', pr.turmas.find((t) => t.turma === '7º Ano').dias.every((x) => x.percentual === null) && !pr.turmas.find((t) => t.turma === '7º Ano').alerta);
  conf('resumo do dia: 5 de 8 presentes, 2 de 3 turmas com chamada, 1 em alerta', pr.resumo.presentes === 5 && pr.resumo.alunos === 8 && pr.resumo.percentual === 62.5
    && pr.resumo.turmasComChamada === 2 && pr.resumo.turmas === 3 && pr.resumo.emAlerta.length === 1 && pr.resumo.emAlerta[0].percentual === 50, pr.resumo);
  conf('turmas em ordem e com sala', pr.turmas.map((t) => t.turma).join() === '5º Ano A,6º Ano A,7º Ano' && t6.sala === '12', pr.turmas.map((t) => t.turma));
  const fds = d.montarPresenca({ turmas: tp, dias: dl.slice(0, 4), linhas: [], hoje: '2026-10-25' });
  conf('fim de semana: dia principal é o último dia letivo (sem alerta, sem chamada)', fds.principal === '2026-10-23' && !fds.resumo.ehHoje && fds.resumo.percentual === null && !fds.resumo.emAlerta.length, fds);
  const ferias = d.montarPresenca({ turmas: tp, dias: [], linhas: [], hoje: '2026-07-15' });
  conf('férias sem chamada: sem dias', ferias.principal === null && ferias.dias.length === 0 && ferias.turmas[0].dias.length === 0, ferias);

  /* ---------- Quem pode ver ---------- */
  const req = (perfil, email, verif) => ({ usuario: { id: 5 }, colegioId: 1, perfil, firebase: { email, emailVerificado: verif } });
  marcado = 0;
  conf('proprietário (e-mail confirmado) sempre vê', await d.podeVerDirecao(req('admin', 'dono@exemplo.com', true)));
  conf('proprietário sem confirmar o e-mail não vê', !(await d.podeVerDirecao(req('admin', 'dono@exemplo.com', false))));
  conf('administrador sem a marcação não vê', !(await d.podeVerDirecao(req('admin', 'x@y.com', true))));
  marcado = 1;
  conf('administrador marcado como alta direção vê', await d.podeVerDirecao(req('admin', 'x@y.com', true)));
  conf('professor nunca vê (mesmo marcado no banco)', !(await d.podeVerDirecao(req('professor', 'x@y.com', true))));
  conf('sem colégio não vê', !(await d.podeVerDirecao({ usuario: { id: 5 }, perfil: 'admin', firebase: {} })));

  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
  process.exit(falhas ? 1 : 0);
})();
