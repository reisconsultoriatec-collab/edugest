// Central de ajuda: conteúdo do manual sem referências quebradas (artigos, telas, tours, trilhas)
// — rodar com: node api/testes/ajuda.test.js
const path = require('path');
global.window = { EG: {} };
require(path.join(__dirname, '../../web/assets/js/ajuda-conteudo.js'));
const A = window.EG.AJUDA;
const TELAS = ['dashboard', 'direcao', 'alunos', 'professores', 'turmas', 'diario', 'notas', 'boletim', 'calendario', 'grade', 'documentos', 'mensalidades',
  'contas', 'fluxo', 'bolsas', 'relatorios', 'conciliacao', 'funil', 'comunicados', 'portal', 'portal-boletim', 'portal-frequencia', 'portal-grade',
  'portal-financeiro', 'portal-comunicados', 'portal-calendario', 'portal-privacidade', 'config', 'usuarios', 'online', 'virada', 'seguranca', 'lgpd', 'colegios', 'ajuda'];
const PERFIS = ['admin', 'professor', 'financeiro', 'equipe', 'responsavel', 'proprietario'];
const BLOCOS = ['p', 'h', 'passos', 'lista', 'dica', 'atencao', 'onde', 'tabela'];
let falhas = 0;
const conf = (n, lista) => { console.log((lista.length ? 'ERRO ' : 'ok   ') + n + (lista.length ? ' → ' + lista.join(', ') : '')); if (lista.length) falhas++; };
const ids = A.artigos.map((a) => a.id);
const cats = new Set(A.categorias.map((c) => c.id));
conf('ids únicos', ids.filter((x, i) => ids.indexOf(x) !== i));
conf('categoria existe', A.artigos.filter((a) => !cats.has(a.cat)).map((a) => a.id));
conf('tela existe', A.artigos.flatMap((a) => [a.tela, ...(a.telas || [])].filter((t) => t && !TELAS.includes(t)).map((t) => `${a.id}:${t}`)));
conf('perfis conhecidos', A.artigos.flatMap((a) => (a.perfis || []).filter((p) => !PERFIS.includes(p)).map((p) => `${a.id}:${p}`)));
conf('título, resumo e corpo', A.artigos.filter((a) => !a.titulo || !a.resumo || !a.corpo.length).map((a) => a.id));
conf('blocos válidos', A.artigos.flatMap((a) => a.corpo.filter((b) => !BLOCOS.includes(b[0])).map((b) => `${a.id}:${b[0]}`)));
conf('relacionados existem', A.artigos.flatMap((a) => (a.relacionados || []).filter((r) => !ids.includes(r)).map((r) => `${a.id}→${r}`)));
conf('trilhas apontam para artigos', Object.entries(A.trilhas).flatMap(([p, l]) => l.filter((id) => !ids.includes(id)).map((id) => `${p}:${id}`)));
conf('implantação aponta para artigos e telas', A.implantacao.filter((x) => !ids.includes(x.artigo) || !TELAS.includes(x.pagina)).map((x) => x.id));
conf('16 itens de implantação (os mesmos da API)', A.implantacao.length === 16 ? [] : [String(A.implantacao.length)]);
conf('tours de telas existentes', Object.keys(A.tours).filter((t) => !TELAS.includes(t)));
const fs = require('fs');
const menu = [...fs.readFileSync(path.join(__dirname, '../../web/assets/js/shell.js'), 'utf8').matchAll(/\{ id: '([\w-]+)'/g)].map((m) => m[1]);
conf('as telas do teste são as do menu', [...TELAS.filter((t) => !menu.includes(t)), ...menu.filter((t) => !TELAS.includes(t)).map((t) => 'falta no teste: ' + t)]);
conf('toda tela do menu está na ordem do tour', menu.filter((t) => t !== 'ajuda' && t !== 'portal-grade' && ![...A.ordemEquipe, ...A.ordemPortal].includes(t)).concat(menu.length ? [] : ['menu não lido']));
conf('toda tela da ordem do tour tem passos no tour geral', [...A.ordemEquipe, ...A.ordemPortal].filter((t) => !(A.tours[t] || []).some((p) => p.g) && t !== 'portal-grade'));
conf('cada passo tem título e texto', Object.entries(A.tours).flatMap(([t, l]) => l.filter((p) => !p.titulo || !p.texto).map(() => t)));
conf('negrito e botões fechados', A.artigos.filter((a) => { const s = JSON.stringify(a); return (s.match(/\*\*/g) || []).length % 2 || (s.match(/\{\{/g) || []).length !== (s.match(/\}\}/g) || []).length; }).map((a) => a.id));
console.log(`${A.artigos.length} artigos, ${Object.values(A.tours).flat().length} passos de tour`);
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
