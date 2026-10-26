// Grade horária: validação dos horários, numeração e conflitos — rodar com: node api/testes/grade.test.js
const g = require('../src/services/grade');
let falhas = 0;
const conf = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) falhas++; console.log(ok ? 'ok  ' : 'ERRO', n, ok ? '' : `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
const erro = (n, fn, trecho) => { let m = ''; try { fn(); } catch (e) { m = e.message; } conf(n, m.includes(trecho) ? trecho : m || '(não deu erro)', trecho); };

conf('hhmm corta os segundos do MySQL', [g.hhmm('07:50:00'), g.hhmm(null)], ['07:50', null]);
conf('minutos', [g.minutos('00:00'), g.minutos('07:50'), g.minutos('13:05:00')], [0, 470, 785]);
conf('sobrepõe: encostado não conta', g.sobrepoe({ inicio: '07:00', fim: '07:50' }, { inicio: '07:50', fim: '08:40' }), false);
conf('sobrepõe: um dentro do outro', g.sobrepoe({ inicio: '07:00', fim: '09:00' }, { inicio: '07:30', fim: '08:00' }), true);
conf('sobrepõe: turnos diferentes com cruzamento', g.sobrepoe({ inicio: '11:00', fim: '11:50' }, { inicio: '11:30', fim: '12:20' }), true);

const v = g.validarHorarios([
  { id: '7', inicio: '07:50:00', fim: '08:40:00' },
  { inicio: '07:00', fim: '07:50' },
  { inicio: '09:30', fim: '09:50', tipo: 'intervalo' },
  { inicio: '08:40', fim: '09:30', tipo: 'qualquer' }
]);
conf('validar: ordena pelo início e numera a ordem', v.map((h) => [h.ordem, h.inicio, h.fim, h.tipo]),
  [[1, '07:00', '07:50', 'aula'], [2, '07:50', '08:40', 'aula'], [3, '08:40', '09:30', 'aula'], [4, '09:30', '09:50', 'intervalo']]);
conf('validar: mantém o id (número) para atualizar no lugar', [v[1].id, v[0].id], [7, null]);
conf('validar: lista vazia é permitida (apaga o turno)', g.validarHorarios([]), []);
erro('validar: formato', () => g.validarHorarios([{ inicio: '7:00', fim: '07:50' }]), 'use HH:MM');
erro('validar: hora inválida', () => g.validarHorarios([{ inicio: '24:00', fim: '24:50' }]), 'use HH:MM');
erro('validar: fim antes do início', () => g.validarHorarios([{ inicio: '08:00', fim: '07:50' }]), 'o fim precisa ser depois do início');
erro('validar: sobreposição', () => g.validarHorarios([{ inicio: '07:00', fim: '07:50' }, { inicio: '07:40', fim: '08:30' }]), 'se sobrepõem');
erro('validar: no máximo 20', () => g.validarHorarios(Array.from({ length: 21 }, (_, i) => ({ inicio: `${String(i).padStart(2, '0')}:00`, fim: `${String(i).padStart(2, '0')}:30` }))), 'No máximo 20');
erro('validar: não é lista', () => g.validarHorarios(null), 'inválida');

conf('numerar: intervalo não conta como aula', g.numerar(v).map((h) => h.rotulo), ['1ª aula', '2ª aula', '3ª aula', 'Intervalo']);

const outras = [
  { professorId: 1, dia: 1, inicio: '07:00', fim: '07:50', turmaId: 10, turma: '5º Ano A' },
  { professorId: 1, dia: 2, inicio: '07:00', fim: '07:50', turmaId: 10, turma: '5º Ano A' },
  { professorId: 2, dia: 1, inicio: '07:50', fim: '08:40', turmaId: 11, turma: '5º Ano B' },
  { professorId: 1, dia: 3, inicio: '13:00', fim: '13:50', turmaId: 12, turma: 'Integral I' }
];
const aulas = [
  { dia: 1, inicio: '07:00', fim: '07:50', professorId: 1, professor: 'Paula' },   // conflito com o 5º A
  { dia: 1, inicio: '07:50', fim: '08:40', professorId: 1, professor: 'Paula' },   // livre (o 2 é outro professor)
  { dia: 2, inicio: '07:50', fim: '08:40', professorId: 1, professor: 'Paula' },   // encostado: livre
  { dia: 3, inicio: '13:30', fim: '14:20', professorId: 1, professor: 'Paula' },   // cruza com o integral
  { dia: 1, inicio: '07:00', fim: '07:50', professorId: null, professor: null }    // sem professor: ignora
];
const c = g.conflitos(aulas, outras);
conf('conflitos: mesmo professor, mesmo dia e horário que se cruza', c.map((x) => [x.dia, x.inicio, x.turma]), [[1, '07:00', '5º Ano A'], [3, '13:30', 'Integral I']]);
conf('conflitos: nenhum com a lista vazia', g.conflitos(aulas, []), []);
conf('dias e turnos', [g.DIAS[1], g.DIAS[6], g.PERIODOS.integral], ['Segunda', 'Sábado', 'Integral']);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
