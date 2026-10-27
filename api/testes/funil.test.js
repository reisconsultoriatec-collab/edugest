// Funil de matrículas: situação do contato, dias na etapa, normalização e indicadores — rodar com: node api/testes/funil.test.js
process.env.CRYPTO_KEY = process.env.CRYPTO_KEY || 'ab'.repeat(32);
const F = require('../src/services/funil');
let falhas = 0;
const conf = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) falhas++; console.log(ok ? 'ok  ' : 'ERRO', n, ok ? '' : `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };

const HOJE = '2026-10-27';
const lead = (x) => ({ id: 1, nome_aluno: 'Ana', etapa: 'lead', criado_em: '2026-10-20 10:00:00', etapa_em: '2026-10-25 09:00:00', visto_em: '2026-10-21 08:00:00', ...x });
conf('contato atrasado, hoje e futuro', ['2026-10-26', '2026-10-27', '2026-10-30'].map((d) => F.formatar(lead({ proximo_contato: d }), HOJE).contato), ['atrasado', 'hoje', 'futuro']);
conf('sem contato marcado / interessado fechado não cobra contato', [F.formatar(lead({}), HOJE).contato, F.formatar(lead({ etapa: 'perdido', proximo_contato: '2026-10-01' }), HOJE).contato], [null, null]);
conf('dias na etapa', F.formatar(lead({}), HOJE).diasNaEtapa, 2);
conf('"novo" = em andamento e ainda não aberto pela equipe', [F.formatar(lead({ visto_em: null }), HOJE).novo, F.formatar(lead({}), HOJE).novo, F.formatar(lead({ visto_em: null, etapa: 'matriculado' }), HOJE).novo], [true, false, false]);
conf('via formulário (0/1 do banco)', [F.formatar(lead({ via_formulario: 1 })).viaFormulario, F.formatar(lead({ via_formulario: '0' })).viaFormulario], [true, false]);
conf('normalização para comparar nomes e telefones', [F.semAcento('  Pedro  HENRIQUE  Álves '), F.digitos('(11) 98888-7777')], ['pedro henrique alves', '11988887777']);
conf('token do formulário: 16 caracteres seguros para URL', /^[A-Za-z0-9_-]{16}$/.test(F.novoToken()) && F.novoToken() !== F.novoToken(), true);
conf('dias entre datas', [F.diasEntre('2026-10-20', '2026-10-27'), F.diasEntre('2026-10-27 23:59:00', '2026-10-27'), F.diasEntre(null, '2026-10-27')], [7, 0, null]);

const linhas = [
  { etapa: 'lead', origem: 'Instagram', serie_pretendida: '1º Ano', criado_em: '2026-10-02 10:00:00' },
  { etapa: 'visita', origem: 'Instagram', serie_pretendida: '1º Ano', criado_em: '2026-09-15 10:00:00' },
  { etapa: 'matriculado', origem: 'Instagram', serie_pretendida: '5º Ano', criado_em: '2026-09-01 10:00:00', etapa_em: '2026-09-11 10:00:00' },
  { etapa: 'matriculado', origem: 'Indicação', serie_pretendida: '1º Ano', criado_em: '2026-08-01 10:00:00', etapa_em: '2026-10-01 10:00:00' },
  { etapa: 'perdido', origem: 'Indicação', serie_pretendida: null, motivo_perda: 'Preço', criado_em: '2026-07-10 10:00:00', etapa_em: '2026-07-20 10:00:00' },
  { etapa: 'perdido', origem: null, serie_pretendida: '5º Ano', motivo_perda: 'Preço', criado_em: '2025-09-10 10:00:00' }
];
const ind = F.indicadores(linhas, HOJE);
conf('por etapa e em andamento', [ind.porEtapa, ind.emAndamento, ind.total], [{ lead: 1, visita: 1, proposta: 0, matriculado: 2, perdido: 2 }, 2, 6]);
conf('conversão = 2 ÷ (2 + 2) = 50%', ind.conversao, 50);
conf('tempo médio até a matrícula: (10 + 61) ÷ 2 = 36 dias', ind.diasAteMatricula, 36);
conf('origens em ordem de volume, com conversão', ind.origens.map((o) => [o.nome, o.total, o.matriculados, o.conversao]),
  [['Instagram', 3, 1, 100], ['Indicação', 2, 1, 50], ['Não informado', 1, 0, 0]]);
conf('motivos de perda', ind.motivos, [{ nome: 'Preço', total: 2 }]);
conf('12 meses, do mais antigo ao atual', [ind.meses.length, ind.meses[0].mes, ind.meses[11].mes], [12, '2025-11', '2026-10']);
conf('novos e matrículas por mês (fora da janela não conta)', [ind.meses[11], ind.meses[10], ind.meses.find((m) => m.mes === '2025-11')],
  [{ mes: '2026-10', novos: 1, matriculas: 1 }, { mes: '2026-09', novos: 2, matriculas: 1 }, { mes: '2025-11', novos: 0, matriculas: 0 }]);
conf('sem dados: conversão vazia', [F.indicadores([], HOJE).conversao, F.indicadores([], HOJE).diasAteMatricula], [null, null]);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
