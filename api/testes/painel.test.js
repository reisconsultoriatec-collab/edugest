// Dashboard: regras das pendências e dos alunos em atenção (sem banco)
// — rodar com: node api/testes/painel.test.js
const Module = require('module');
const orig = Module._load;
Module._load = function (req) { // o teste não abre o banco
  if (req.endsWith('/db')) return { query: async () => [], queryUm: async () => null, transacao: async () => null };
  return orig.apply(this, arguments);
};
const p = require('../src/services/painel');
let falhas = 0;
const conf = (n, ok, extra) => { console.log((ok ? 'ok   ' : 'ERRO ') + n + (ok ? '' : ' → ' + JSON.stringify(extra))); if (!ok) falhas++; };

const per = [{ bimestre: 3, inicio: '2026-08-03', fim: '2026-10-02' }, { bimestre: 4, inicio: '2026-10-05', fim: '2026-11-10' }];
const ev = [{ tipo: 'feriado', alcance: 'todos', data: '2026-10-26' }, { tipo: 'feriado', alcance: 'turmas', data: '2026-10-27' },
  { tipo: 'letivo', alcance: 'todos', data: '2026-10-24' }];
const dias = p.diasLetivos('2026-10-22', '2026-10-28', per, ev);
conf('dias letivos: úteis, menos o feriado do colégio todo, mais o sábado letivo', dias.join() === '2026-10-22,2026-10-23,2026-10-24,2026-10-27,2026-10-28', dias);
conf('fora dos bimestres (férias) não conta', p.diasLetivos('2026-07-29', '2026-08-04', per, []).join() === '2026-08-03,2026-08-04');

const turmas = [{ id: 1, nome: 'A', periodo: 'matutino', ano_letivo: 2026, criado_em: '2026-01-01' }, { id: 2, nome: 'B', periodo: 'vespertino', ano_letivo: 2026, criado_em: '2026-01-01' }];
const grade = [{ turma_id: 1, dia_semana: 3, disciplina_id: 10, disciplina: 'Mat', inicio: '07:30:00' }, { turma_id: 1, dia_semana: 3, disciplina_id: 11, disciplina: 'Port', inicio: '11:00:00' },
  { turma_id: 1, dia_semana: 2, disciplina_id: 10, disciplina: 'Mat', inicio: '07:30:00' }];
const diarios = [{ turma_id: 1, data: '2026-10-27', disciplina_id: null }];
let r = p.chamadasPendentes({ turmas, grade, diarios, dias: ['2026-10-27', '2026-10-28'], hoje: '2026-10-28', agora: '10:00', permitido: () => true });
const a = r.find((x) => x.turmaId === 1); const b = r.find((x) => x.turmaId === 2);
conf('com grade: chamada do dia cobre a terça; hoje só a aula que já começou', a.total === 1 && a.aulas[0].disciplina === 'Mat' && a.aulas[0].data === '2026-10-28', a);
conf('sem grade: hoje só depois do fim do turno (vespertino 18:00)', b.total === 1 && b.aulas[0].data === '2026-10-27' && b.semGrade, b);
r = p.chamadasPendentes({ turmas, grade, diarios, dias: ['2026-10-28'], hoje: '2026-10-28', agora: '18:30', permitido: (t, d) => t === 1 && d === 11 });
conf('escopo do professor: só a disciplina dele', r.length === 1 && r[0].aulas.map((x) => x.disciplina).join() === 'Port', r);

conf('notas: meio do 4º bimestre cobra o 3º', JSON.stringify(p.bimestresACobrar(per, '2026-10-20').map((x) => [x.bimestre, x.situacao])) === '[[3,"encerrado"]]');
conf('notas: 2 últimas semanas cobram também o atual', JSON.stringify(p.bimestresACobrar(per, '2026-10-28').map((x) => [x.bimestre, x.situacao])) === '[[3,"encerrado"],[4,"encerrando"]]');
conf('notas: depois do último, o 4º como encerrado', JSON.stringify(p.bimestresACobrar(per, '2026-12-01').map((x) => [x.bimestre, x.situacao])) === '[[4,"encerrado"]]');
const pend = p.notasPendentes({ pares: [{ turma_id: 1, turma: 'A', disciplina_id: 10, disciplina: 'Mat' }, { turma_id: 1, turma: 'A', disciplina_id: 11, disciplina: 'Port' }, { turma_id: 9, turma: 'Vazia', disciplina_id: 10, disciplina: 'Mat' }],
  alunosPorTurma: new Map([[1, 3]]), lancados: new Map([['1:10', 3], ['1:11', 1]]) });
conf('notas: só turma × disciplina com aluno sem nota (turma vazia fora)', pend.length === 1 && pend[0].disciplina === 'Port' && pend[0].lancados === 1, pend);

const al = p.avaliarAlunos({
  alunos: [{ id: 1, nome: 'Ana', turma_id: 1 }, { id: 2, nome: 'Bia', turma_id: 1 }, { id: 3, nome: 'Caio', turma_id: 1 }],
  notas: [{ aluno_id: 1, turma_id: 1, disciplina_id: 10, disciplina: 'Mat', bimestre: 1, n1: 5, n2: 6, trabalho: null }, { aluno_id: 1, turma_id: 1, disciplina_id: 10, disciplina: 'Mat', bimestre: 2, n1: 6, n2: null, trabalho: null },
    { aluno_id: 3, turma_id: 1, disciplina_id: 10, disciplina: 'Mat', bimestre: 1, n1: 8, n2: null, trabalho: null }],
  freq: [{ aluno_id: 2, aulas: 20, presencas: 12, faltas: 6, justificadas: 2 }, { aluno_id: 3, aulas: 4, presencas: 1, faltas: 3, justificadas: 0 }],
  mediaAprov: 6, freqMin: 75, permitido: () => true
});
conf('atenção: Bia (70%) e Ana (Mat 5,8 = média de 5,5 e 6); Caio com 4 aulas não acusa', al.map((x) => x.nome).join() === 'Bia,Ana' && al[0].frequencia.percentual === 70 && al[1].disciplinasAbaixo[0].media === 5.8, al);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
