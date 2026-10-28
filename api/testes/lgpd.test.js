// LGPD: coerência entre o serviço, o banco (schema e migração 014) e as páginas públicas
// — rodar com: node api/testes/lgpd.test.js
const fs = require('fs');
const path = require('path');
const Module = require('module');
const orig = Module._load;
Module._load = function (req) { // o teste não abre o banco
  if (req.endsWith('/db')) return { query: async () => [], queryUm: async () => null, transacao: async () => null };
  return orig.apply(this, arguments);
};
process.env.CRYPTO_KEY = process.env.CRYPTO_KEY || 'ab'.repeat(32);
const lgpd = require('../src/services/lgpd');
const ler = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const enumDe = (sql, coluna) => {
  const m = sql.match(new RegExp(`${coluna}\\s+ENUM\\(([^)]*)\\)`));
  return m ? m[1].split(',').map((x) => x.trim().replace(/'/g, '')) : null;
};
let falhas = 0;
const conf = (n, ok, extra) => { console.log((ok ? 'ok   ' : 'ERRO ') + n + (ok ? '' : ' → ' + JSON.stringify(extra))); if (!ok) falhas++; };

const schema = ler('api/sql/schema.sql');
const mig = ler('api/sql/migracoes/014-lgpd.sql');
const tabela = (sql, nome) => (sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${nome} \\(([\\s\\S]*?)\\) ENGINE`)) || [])[1] || '';

conf('versão dos termos no formato AAAA-MM', /^\d{4}-\d{2}$/.test(lgpd.TERMOS_VERSAO), lgpd.TERMOS_VERSAO);
for (const [nome, sql] of [['schema', schema], ['migração 014', mig]]) {
  const sol = tabela(sql, 'solicitacoes_titular');
  conf(`${nome}: tipos de pedido iguais aos do serviço`, JSON.stringify(enumDe(sol, 'tipo')) === JSON.stringify(Object.keys(lgpd.TIPOS)), enumDe(sol, 'tipo'));
  conf(`${nome}: situações iguais às do serviço`, JSON.stringify(enumDe(sol, 'status')) === JSON.stringify(Object.keys(lgpd.STATUS)), enumDe(sol, 'status'));
  conf(`${nome}: termos_aceites com versão única por pessoa`, /UNIQUE KEY \w+ \(usuario_id, versao\)/.test(tabela(sql, 'termos_aceites')));
}
const logSchema = enumDe(tabela(schema, 'log_seguranca'), 'tipo');
const logMig = enumDe(mig.match(/MODIFY COLUMN tipo ENUM\([^)]*\)/)[0], 'tipo');
conf('log de segurança com o tipo "privacidade" (schema = migração)', logSchema.includes('privacidade') && JSON.stringify(logSchema) === JSON.stringify(logMig), { logSchema, logMig });
conf('rota do log aceita o filtro "privacidade"', /'privacidade'\]/.test(ler('api/src/routes/seguranca.js')));
conf('encarregado: colunas no schema e na migração', ['encarregado_nome', 'encarregado_email', 'encarregado_telefone'].every((c) => schema.includes(c) && mig.includes(c)));

conf('prazo de 15 dias (art. 19)', lgpd.PRAZO_DIAS === 15);
conf('somarDias: virada de mês e de ano', lgpd.somarDias('2026-10-28', 15) === '2026-11-12' && lgpd.somarDias('2026-12-25', 15) === '2027-01-09', [lgpd.somarDias('2026-10-28', 15), lgpd.somarDias('2026-12-25', 15)]);

for (const pag of ['web/termos.html', 'web/privacidade.html']) {
  const html = ler(pag);
  conf(`${pag}: mostra a versão ${lgpd.TERMOS_VERSAO}`, html.includes(`Versão ${lgpd.TERMOS_VERSAO}`));
  conf(`${pag}: marca Reis Tecnologia`, html.includes('Reis Tecnologia') && !/F[êe]nix/i.test(html));
}
const app = ler('web/index.html') + ler('web/assets/js/auth.js');
conf('tela de acesso tem os links dos termos e da privacidade', app.includes('href="termos.html"') && app.includes('href="privacidade.html"'));
const server = ler('api/server.js');
conf('/api/lgpd só para administrador', /app\.use\('\/api\/lgpd', autenticar, carregarUsuario, exigirColegio, exigirPerfil\('admin'\)/.test(server));
conf('/api/portal só para responsável', /app\.use\('\/api\/portal', autenticar, carregarUsuario, exigirColegio, exigirPerfil\('responsavel'\)/.test(server));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
