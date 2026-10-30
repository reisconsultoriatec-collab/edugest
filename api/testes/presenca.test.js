// Usuários online: horários, aparelho e a lista do administrador (sem banco)
// — rodar com: node api/testes/presenca.test.js
const Module = require('module');
const orig = Module._load;
Module._load = function (req) { // o teste não abre o banco
  if (req.endsWith('/db')) return { query: async () => [], queryUm: async () => null, transacao: async () => null };
  return orig.apply(this, arguments);
};
const p = require('../src/services/presenca');
let falhas = 0;
const conf = (n, ok, extra) => { console.log((ok ? 'ok   ' : 'ERRO ') + n + (ok ? '' : ' → ' + JSON.stringify(extra))); if (!ok) falhas++; };

conf('2 minutos antes', p.menosSegundos('2026-10-29 20:01:30', 120) === '2026-10-29 19:59:30');
conf('vira o dia sem fuso', p.menosSegundos('2026-11-01 00:00:30', 60) === '2026-10-31 23:59:30');
const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const android = 'Mozilla/5.0 (Linux; Android 14; SM-A146M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
conf('computador', p.aparelho(chrome) === 'Computador · Chrome / Windows', p.aparelho(chrome));
conf('celular (iPhone)', p.aparelho(iphone) === 'Celular · Safari / iOS', p.aparelho(iphone));
conf('celular (Android)', p.aparelho(android) === 'Celular · Chrome / Android', p.aparelho(android));

const s = (usuario_id, nome, perfil, ativo, inicio, ultimo, disp) => ({ usuario_id, nome, email: `${usuario_id}@x`, perfil, ativo, inicio, ultimo_sinal: ultimo, dispositivo: disp });
const sessoes = [
  s(1, 'Ana Admin', 'admin', 1, '2026-10-29 08:00:00', '2026-10-29 20:00:30', 'Computador · Chrome / Windows'),
  s(2, 'Bia Admin', 'admin', 0, '2026-10-29 19:00:00', '2026-10-29 20:00:10', 'Computador · Edge / Windows'),
  s(3, 'Caio Prof', 'professor', 0, '2026-10-29 18:00:00', '2026-10-29 20:00:00', 'Celular · Chrome / Android'),
  s(3, 'Caio Prof', 'professor', 1, '2026-10-29 19:30:00', '2026-10-29 20:00:40', 'Computador · Chrome / Windows'),
  s(4, 'Duda Fin', 'financeiro', 0, '2026-10-29 19:50:00', '2026-10-29 20:00:20', 'Computador · Chrome / Windows'),
  s(10, 'Mãe 1', 'responsavel', 1, '2026-10-29 20:00:00', '2026-10-29 20:00:30', 'Celular · Safari / iOS'),
  s(11, 'Pai 2', 'responsavel', 0, '2026-10-29 19:40:00', '2026-10-29 20:00:30', 'Celular · Safari / iOS')
];
const equipe = [
  { id: 1, nome: 'Ana Admin', perfil: 'admin' }, { id: 2, nome: 'Bia Admin', perfil: 'admin' }, { id: 3, nome: 'Caio Prof', perfil: 'professor' },
  { id: 4, nome: 'Duda Fin', perfil: 'financeiro' },
  { id: 5, nome: 'Eva Prof', perfil: 'professor', visto: '2026-10-29 15:10:00', ultimo_acesso: '2026-10-29 07:00:00' },
  { id: 6, nome: 'Fabio Sec', perfil: 'professor', visto: null, ultimo_acesso: '2026-10-28 10:00:00' },
  { id: 7, nome: 'Gil Novo', perfil: 'financeiro', visto: null, ultimo_acesso: null }
];
let r = p.montarOnline({ sessoes, equipe, euId: 1, proprietario: false });
conf('total e por perfil (pessoas, não abas)', r.total === 6 && r.porPerfil.admin === 2 && r.porPerfil.professor === 1 && r.porPerfil.financeiro === 1 && r.porPerfil.responsavel === 2, r.porPerfil);
conf('responsáveis só como número', r.responsaveis.online === 2 && r.responsaveis.ativos === 1 && !r.equipe.some((x) => x.perfil === 'responsavel'), r.responsaveis);
const caio = r.equipe.find((x) => x.usuarioId === 3);
conf('duas abas: ativa se mexeu em alguma, desde a mais antiga, dois aparelhos', caio.abas === 2 && caio.ativo && caio.desde === '2026-10-29 18:00:00'
  && caio.ultimoSinal === '2026-10-29 20:00:40' && caio.aparelhos.length === 2, caio);
conf('ativos primeiro, depois por nome', r.equipe.map((x) => x.nome).join() === 'Ana Admin,Caio Prof,Bia Admin,Duda Fin', r.equipe.map((x) => x.nome));
conf('equipe ativa: 2', r.ativos === 2, r.ativos);
conf('não encerra a si mesmo nem outro administrador', !r.equipe.find((x) => x.usuarioId === 1).podeEncerrar && r.equipe.find((x) => x.usuarioId === 1).voce
  && !r.equipe.find((x) => x.usuarioId === 2).podeEncerrar && caio.podeEncerrar, r.equipe);
conf('fora do sistema: visto por último (deste colégio, senão o último acesso), mais recente primeiro', r.fora.map((x) => `${x.nome}:${x.vistoEm}`).join()
  === 'Eva Prof:2026-10-29 15:10:00,Fabio Sec:2026-10-28 10:00:00,Gil Novo:null', r.fora);
r = p.montarOnline({ sessoes, equipe, euId: 99, proprietario: true });
conf('proprietário pode encerrar administradores', r.equipe.every((x) => x.podeEncerrar), r.equipe.map((x) => x.podeEncerrar));
r = p.montarOnline({ sessoes: [], equipe: [], euId: 1, proprietario: false });
conf('ninguém online', r.total === 0 && r.equipe.length === 0 && r.responsaveis.online === 0);

(async () => {
  try { await p.sinal({ aba: 'x', usuarioId: 1, colegioId: 1, perfil: 'admin', ativo: true, ua: '', agora: '2026-10-29 20:00:00' }); conf('aba inválida recusada', false); }
  catch (e) { conf('aba inválida recusada', e.status === 400); }
  try { await p.encerrar(1, 1, { agora: '2026-10-29 20:00:00', euId: 1, proprietario: false }); conf('encerrar a própria sessão recusado', false); }
  catch (e) { conf('encerrar a própria sessão recusado', e.status === 400); }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os testes passaram');
  process.exit(falhas ? 1 : 0);
})();
