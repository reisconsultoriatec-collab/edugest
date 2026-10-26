// Comunicados: segmentos, público e leitura — rodar com: node api/testes/comunicados.test.js
const c$ = require('../src/services/comunicados');
let falhas = 0;
const conf = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) falhas++; console.log(ok ? 'ok  ' : 'ERRO', n, ok ? '' : `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };

conf('segmento pela série', ['Berçário', 'Maternal II', 'Infantil III', 'Pré II', '1º Ano', '5º Ano', '6º Ano', '9º Ano', '1ª Série EM', '3ª Série EM', 'EJA', 'Outra'].map(c$.segmentoDaSerie),
  ['infantil', 'infantil', 'infantil', 'infantil', 'fundamental1', 'fundamental1', 'fundamental2', 'fundamental2', 'medio', 'medio', 'eja', 'outros']);
conf('lista de segmentos ignora inválidos', c$.listaSegmentos('medio, xx,infantil,'), ['medio', 'infantil']);

const ctx = {
  turmas: new Map([[1, { id: 1, nome: '5º Ano B', segmento: 'fundamental1' }], [2, { id: 2, nome: '5º Ano A', segmento: 'fundamental1' }], [3, { id: 3, nome: '7º Ano', segmento: 'fundamental2' }]]),
  turmasDe: new Map([[30, [1, 2]]])
};
const todos = { id: 10, alcance: 'todos' }, seg = { id: 20, alcance: 'segmentos', segmentos: 'fundamental2' }, tur = { id: 30, alcance: 'turmas' };
conf('público: todos (até aluno sem turma)', [c$.noPublico(todos, 1, ctx), c$.noPublico(todos, null, ctx)], [true, true]);
conf('público: segmento', [c$.noPublico(seg, 3, ctx), c$.noPublico(seg, 1, ctx), c$.noPublico(seg, null, ctx)], [true, false, false]);
conf('público: turmas', [c$.noPublico(tur, 2, ctx), c$.noPublico(tur, 3, ctx)], [true, false]);
conf('texto do público', [c$.descreverPublico(todos, ctx), c$.descreverPublico(seg, ctx), c$.descreverPublico(tur, ctx)], ['Colégio todo', 'Fundamental II', '5º Ano A, 5º Ano B']);

const vinculos = [
  { usuario_id: 7, nome: 'Maria', email: 'm@x', aluno_id: 1, aluno: 'Ana', turma_id: 2 },
  { usuario_id: 7, nome: 'Maria', email: 'm@x', aluno_id: 2, aluno: 'Beto', turma_id: 3 },
  { usuario_id: 8, nome: 'João', email: 'j@x', aluno_id: 3, aluno: 'Caio', turma_id: 1 }
];
const dTodos = c$.destinatarios(todos, vinculos, ctx);
conf('destinatários: um por conta, com os filhos', [...dTodos.values()].map((d) => [d.nome, d.alunos]), [['Maria', ['Ana', 'Beto']], ['João', ['Caio']]]);
conf('destinatários do segmento', [...c$.destinatarios(seg, vinculos, ctx).keys()], [7]);
const leituras = new Map([[10, new Map([[7, { lidoEm: '2026-10-26 10:00:00', cienteEm: null }], [99, { lidoEm: 'x', cienteEm: 'y' }]])]]);
conf('leitura conta só quem está no público', c$.resumoLeitura(todos, dTodos, leituras), { destinatarios: 2, lidos: 1, cientes: null });
conf('ciência só quando exigida', c$.resumoLeitura({ ...todos, exige_ciencia: 1 }, dTodos, leituras), { destinatarios: 2, lidos: 1, cientes: 0 });

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
