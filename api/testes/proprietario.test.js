// Proprietário do sistema (PROPRIETARIO_EMAILS) — rodar com: node api/testes/proprietario.test.js
const { emailsProprietario, situacaoProprietario, ehProprietario } = require('../src/utils/proprietario');
let falhas = 0;
const conf = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) falhas++; console.log(ok ? 'ok  ' : 'ERRO', n, ok ? '' : `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };

delete process.env.PROPRIETARIO_EMAILS;
conf('sem variável: ninguém é proprietário', [emailsProprietario(), situacaoProprietario({ email: 'a@b.com', emailVerificado: true })], [[], null]);

process.env.PROPRIETARIO_EMAILS = ' Dono@Reis.com ; outro@reis.com,terceiro@reis.com ';
conf('lista: minúsculas, vírgula, ponto e vírgula e espaços', emailsProprietario(), ['dono@reis.com', 'outro@reis.com', 'terceiro@reis.com']);
conf('e-mail confirmado → ativo', situacaoProprietario({ email: 'dono@reis.com', emailVerificado: true }), 'ativo');
conf('maiúsculas no token também valem', situacaoProprietario({ email: 'OUTRO@reis.com', emailVerificado: true }), 'ativo');
conf('e-mail não confirmado → verificar', situacaoProprietario({ email: 'dono@reis.com', emailVerificado: false }), 'verificar');
conf('outro e-mail → null', situacaoProprietario({ email: 'diretor@colegio.com', emailVerificado: true }), null);
conf('parecido não vale (sem prefixo/sufixo)', [situacaoProprietario({ email: 'xdono@reis.com', emailVerificado: true }), situacaoProprietario({ email: 'dono@reis.com.br', emailVerificado: true })], [null, null]);
conf('sem e-mail / sem firebase', [situacaoProprietario({ email: '', emailVerificado: true }), situacaoProprietario(undefined)], [null, null]);
conf('ehProprietario só com e-mail confirmado', [ehProprietario({ email: 'dono@reis.com', emailVerificado: true }), ehProprietario({ email: 'dono@reis.com', emailVerificado: false })], [true, false]);

console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
