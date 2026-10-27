// Virada do ano letivo e importação: séries, nomes de turma, resultado do ano, datas e CPF da planilha
// — rodar com: node api/testes/virada.test.js
process.env.CRYPTO_KEY = process.env.CRYPTO_KEY || 'ab'.repeat(32);
const Module = require('module');
const orig = Module._load;
Module._load = function (req) { if (req.endsWith('/db')) return {}; return orig.apply(this, arguments); };
const V = require('../src/services/virada');
const I = require('../src/services/importacao');
const { calcular } = require('../src/services/boletim');
let falhas = 0;
const conf = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) falhas++; console.log(ok ? 'ok  ' : 'ERRO', n, ok ? '' : `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };

/* ---------- Séries ---------- */
conf('próxima série na sequência', ['Berçário', 'Infantil III', '5º Ano', '9º Ano', '1ª Série EM'].map(V.proximaSerie),
  ['Maternal I', '1º Ano', '6º Ano', '1ª Série EM', '2ª Série EM']);
conf('3ª Série EM conclui (null)', V.proximaSerie('3ª Série EM'), null);
conf('escritas diferentes da mesma série', ['5o ano', '5° Ano', '5º ANO', '1a serie em', '2ª série ensino médio'].map(V.proximaSerie),
  ['6º Ano', '6º Ano', '6º Ano', '2ª Série EM', '3ª Série EM']);
conf('série desconhecida fica igual', ['EJA', 'Pré II', 'Outra'].map(V.proximaSerie), ['EJA', 'Pré II', 'Outra']);
conf('nome da turma no ano seguinte', [
  V.nomeProximo('5º Ano A', '5º Ano', '6º Ano'), V.nomeProximo('5o ano B', '5º Ano', '6º Ano'),
  V.nomeProximo('Turma Azul', '5º Ano', '6º Ano'), V.nomeProximo('1ª Série EM - Manhã', '1ª Série EM', '2ª Série EM'),
  V.nomeProximo('3ª Série EM A', '3ª Série EM', null)
], ['6º Ano A', '6º Ano B', 'Turma Azul', '2ª Série EM - Manhã', '3ª Série EM A']);

/* ---------- Resultado e sugestão ---------- */
conf('resultado ao promover', ['aprovado', 'recuperacao', 'frequencia_insuficiente', 'em_curso', 'sem_notas'].map((s) => V.resultadoDe('promover', s)),
  ['Aprovado', 'Aprovado pelo Conselho de Classe', 'Aprovado pelo Conselho de Classe', 'Promovido', 'Promovido']);
conf('reter e sair', [V.resultadoDe('reter', 'aprovado'), V.resultadoDe('sair', 'aprovado'), V.resultadoDe('sair', 'em_curso'), V.resultadoDe('manter', 'aprovado')],
  ['Retido', 'Aprovado', 'Cursando', null]);
conf('sugestão', [V.acaoSugerida('aprovado', false), V.acaoSugerida('aprovado', true), V.acaoSugerida('sem_notas', false),
  V.acaoSugerida('recuperacao', false), V.acaoSugerida('frequencia_insuficiente', false), V.acaoSugerida('em_curso', false)],
['promover', 'concluir', 'promover', 'manter', 'manter', 'manter']);

/* ---------- Regra do boletim (função pura usada pela virada) ---------- */
const disc = [{ id: 1, nome: 'Português', ativo: 1 }, { id: 2, nome: 'Matemática', ativo: 1 }];
const nota = (d, b, n) => ({ disciplina_id: d, bimestre: b, n1: n, n2: n, trabalho: null });
const quatro = (d, n) => [1, 2, 3, 4].map((b) => nota(d, b, n));
let r = calcular({ disciplinas: disc, notas: [...quatro(1, 8), ...quatro(2, 7)], freq: { aulas: 10, presencas: 9, faltas: 1, justificadas: 0 }, mediaAprov: 6, freqMin: 75 });
conf('aprovado com 90% de frequência', [r.situacaoGeral, r.frequencia.percentual], ['aprovado', 90]);
r = calcular({ disciplinas: disc, notas: [...quatro(1, 8), ...quatro(2, 5)], freq: null, mediaAprov: 6, freqMin: 75 });
conf('recuperação sem chamada registrada', [r.situacaoGeral, r.frequencia.situacao], ['recuperacao', 'sem_registros']);
r = calcular({ disciplinas: disc, notas: [nota(1, 1, 9)], freq: null, mediaAprov: 6, freqMin: 75 });
conf('notas incompletas = em curso', r.situacaoGeral, 'em_curso');

/* ---------- Planilha ---------- */
conf('datas aceitas', ['05/03/2017', '5/3/2017', '05-03-2017', '2017-03-05', '2017-3-5', ''].map(I.lerData),
  ['2017-03-05', '2017-03-05', '2017-03-05', '2017-03-05', '2017-03-05', null]);
conf('datas inválidas', ['31/02/2017', '05/03/17', 'ontem'].map(I.lerData), [false, false, false]);
conf('CPF sem o zero que o Excel tirou', [I.lerCpf('3920154045'), I.lerCpf(392015404), I.lerCpf('039.201.540-45'), I.lerCpf('')],
  ['03920154045', '00392015404', '039.201.540-45', '']);
conf('turma escrita de outro jeito', ['1º Ano A', '1° ano a', '1o ANO A', '1ª Série EM B', 'Turma Azul'].map(I.chaveTurma),
  ['1 ano a', '1 ano a', '1 ano a', '1 serie em b', 'turma azul']);
const p = I.prepararLinha({ nome: '  Ana  ', naturalidadeUf: 'sp ', respEmail: 'A@B.COM', nascimento: '01/02/2016', dataMatricula: '99/99/2026' });
conf('linha preparada', [p.corpo.nome, p.corpo.naturalidadeUf, p.corpo.respEmail, p.corpo.nascimento, p.erros], ['Ana', 'SP', 'a@b.com', '2016-02-01', ['Data de matrícula inválida (use DD/MM/AAAA)']]);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
