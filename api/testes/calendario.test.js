// Calendário: Páscoa, feriados nacionais, dias letivos e bimestre atual — rodar com: node api/testes/calendario.test.js
const cal = require('../src/services/calendario');
let falhas = 0;
const conf = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) falhas++; console.log(ok ? 'ok  ' : 'ERRO', n, ok ? '' : `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };

conf('Páscoa', [2024, 2025, 2026, 2027, 2028, 2030].map(cal.pascoa), ['2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28', '2028-04-16', '2030-04-21']);
const f26 = cal.feriadosNacionais(2026);
const achar = (t) => f26.find((f) => f.titulo === t);
conf('12 feriados em 2026', f26.length, 12);
conf('Carnaval 2026 (seg e ter, facultativo)', [achar('Carnaval').data, achar('Carnaval').dataFim, achar('Carnaval').facultativo], ['2026-02-16', '2026-02-17', true]);
conf('Sexta-feira Santa e Corpus Christi 2026', [achar('Sexta-feira Santa').data, achar('Corpus Christi').data], ['2026-04-03', '2026-06-04']);
conf('Consciência Negra é nacional', achar('Dia Nacional de Zumbi e da Consciência Negra').data, '2026-11-20');

const periodos = [
  { bimestre: 1, inicio: '2026-02-02', fim: '2026-04-17' }, { bimestre: 2, inicio: '2026-04-20', fim: '2026-07-03' },
  { bimestre: 3, inicio: '2026-07-27', fim: '2026-10-02' }, { bimestre: 4, inicio: '2026-10-05', fim: '2026-12-11' }
];
conf('sem feriados: dias úteis', cal.calcularDiasLetivos(periodos, []).bimestres.map((b) => b.diasLetivos), [55, 55, 50, 50]);
const eventos = f26.map((f) => ({ tipo: 'feriado', alcance: 'todos', data: f.data, data_fim: f.dataFim, titulo: f.titulo }));
eventos.push({ tipo: 'letivo', alcance: 'todos', data: '2026-03-14', titulo: 'Sábado letivo' });
eventos.push({ tipo: 'recesso', alcance: 'segmentos', data: '2026-07-27', data_fim: '2026-07-31', titulo: 'Recesso do Infantil' }); // não conta
eventos.push({ tipo: 'feriado', alcance: 'todos', data: '2026-08-31', titulo: 'Aniversário da cidade' });
const d = cal.calcularDiasLetivos(periodos, eventos);
conf('com feriados, sábado letivo e feriado municipal', [d.bimestres.map((b) => b.diasLetivos), d.total, d.meta], [[53, 52, 48, 47], 200, 200]);
conf('descontados e extras do 1º bimestre', [d.bimestres[0].descontados, d.bimestres[0].extras], [3, 1]);
conf('feriado no fim de semana não desconta', cal.calcularDiasLetivos([{ bimestre: 1, inicio: '2026-11-09', fim: '2026-11-20' }],
  [{ tipo: 'feriado', alcance: 'todos', data: '2026-11-15', titulo: 'Proclamação' }]).total, 10);
conf('bimestre atual pelas datas', ['2026-01-10', '2026-03-01', '2026-07-15', '2026-10-04', '2026-10-26', '2026-12-20'].map((x) => cal.bimestreDaData(periodos, x)), [1, 1, 2, 3, 4, 4]);
conf('sem bimestres: null', cal.bimestreDaData([], '2026-05-01'), null);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
