// Motor de sugestões da conciliação — rodar com: node api/testes/conciliacao.test.js
const c = require('../src/services/conciliacao');
let falhas = 0;
const conf = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) falhas++; console.log(ok ? 'ok  ' : 'ERRO', n, ok ? '' : `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
const M = [
  { id: 501, alunoId: 1, aluno: 'Pedro Souza', resp: 'Maria José Souza', referencia: '2026-10', vencimento: '2026-10-10', valor: 600, status: 'pendente' },
  { id: 502, alunoId: 2, aluno: 'Lucas Lima', resp: 'João Lima', referencia: '2026-10', vencimento: '2026-10-10', valor: 600, status: 'pendente' },
  { id: 503, alunoId: 3, aluno: 'Ana Rocha', resp: 'Carla Rocha', referencia: '2026-10', vencimento: '2026-10-10', valor: 600, status: 'pendente' },
  { id: 504, alunoId: 4, aluno: 'Bia Lima', resp: 'João Lima', referencia: '2026-10', vencimento: '2026-10-10', valor: 300, status: 'pendente' },
  { id: 505, alunoId: 5, aluno: 'Davi Melo', resp: 'Rita Melo', referencia: '2026-09', vencimento: '2026-09-10', valor: 600, status: 'pago', valorPago: 600, dataPagamento: '2026-10-07' }
];
const C = [
  { id: 1, descricao: 'Aluguel', fornecedor: 'Imobiliária Centro', valor: 3000, vencimento: '2026-10-05', status: 'pendente' },
  { id: 2, descricao: 'Energia elétrica', fornecedor: 'ENEL', valor: 400, vencimento: '2026-10-15', status: 'pendente' },
  { id: 3, descricao: 'Internet', fornecedor: 'Vivo', valor: 400, vencimento: '2026-10-20', status: 'pendente' }
];
const cand = { mensalidades: M, contas: C };
const L = (descricao, valor, tipo = 'credito', data = '2026-10-08') => ({ descricao, valor, tipo, data });
const top = (l) => { const s = c.sugerir(l, cand, 1); return s.map((x) => `${x.tipo}:${x.id || x.categoria}:${x.confianca}`); };
conf('identificador EG1M501', top(L('PIX RECEBIDO - EG1M501', 600)).slice(0, 1), ['mensalidade:501:alta']);
conf('identificador de outro colégio ignorado', c.identificador('PIX EG2M501', 1), null);
conf('identificador com espaço', c.identificador('PIX REC EG 1 M 501 MARIA', 1), 501);
conf('nome do responsável + valor', top(L('PIX RECEBIDO MARIA JOSE SOUZA', 600))[0], 'mensalidade:501:alta');
conf('auto ok (nome + valor)', c.automatica(c.sugerir(L('PIX RECEBIDO MARIA JOSE SOUZA', 600), cand, 1)), true);
const soValor = c.sugerir(L('PIX RECEBIDO FULANO DE TAL', 600), cand, 1);
conf('só valor → nunca alta', soValor.some((x) => x.confianca === 'alta'), false);
conf('só valor + baixa manual no dia → média (só sugestão)', [soValor[0].id, soValor[0].confianca], [505, 'media']);
conf('só valor com acréscimo → baixa', c.sugerir(L('PIX FULANO', 612), cand, 1).map((x) => x.confianca), ['baixa', 'baixa', 'baixa']);
conf('acréscimo + 1 nome → média', c.sugerir(L('PIX MARIA FULANA', 612), cand, 1)[0].confianca, 'media');
conf('só valor → não automática', c.automatica(soValor), false);
const joao = c.sugerir(L('PIX RECEBIDO JOAO LIMA', 600), cand, 1);
conf('João Lima 600 → filho de 600 (não o de 300)', joao[0].id, 502);
conf('João Lima 300 → Bia (300)', c.sugerir(L('PIX RECEBIDO JOAO LIMA', 300), cand, 1)[0].id, 504);
conf('com juros (612) + nome → alta', top(L('PIX MARIA JOSE SOUZA', 612))[0], 'mensalidade:501:alta');
const parcial = c.sugerir(L('PIX EG1M501 MARIA JOSE SOUZA', 300), cand, 1);
conf('identificador + valor menor → média, não automática', [parcial[0].id, parcial[0].confianca, c.automatica(parcial)], [501, 'media', false]);
conf('já recebida (baixa manual) mesma data + nome', top(L('PIX RITA MELO', 600, 'credito', '2026-10-07'))[0], 'mensalidade:505:alta');
conf('usados não repetem', c.sugerir(L('PIX MARIA JOSE SOUZA', 600), cand, 1, { usados: new Set(['m:501']) }).map((x) => x.id).includes(501), false);
conf('conta: aluguel valor + fornecedor + data', top(L('PAGTO BOLETO IMOBILIARIA CENTRO', 3000, 'debito', '2026-10-05'))[0], 'conta:1:alta');
const e400 = c.sugerir(L('DEBITO AUTOMATICO ENEL', 400, 'debito', '2026-10-15'), cand, 1);
conf('conta: ENEL 400 escolhe energia, não internet', [e400[0].id, e400[0].confianca, c.automatica(e400)], [2, 'alta', true]);
const d400 = c.sugerir(L('PAGAMENTO DIVERSOS', 400, 'debito', '2026-10-17'), cand, 1);
conf('conta: 400 sem descrição → média e não automática (empate)', [d400.map((x) => x.confianca).join(','), c.automatica(d400)], ['media,media', false]);
conf('tarifa', top(L('TARIFA PACOTE SERVIÇOS', 45.9, 'debito'))[0], 'manual:Tarifa bancária:alta');
conf('forma', ['PIX RECEBIDO X', 'PAGTO BOLETO', 'DEP DINHEIRO AG', 'TED RECEBIDA'].map(c.formaPorDescricao), ['PIX', 'Boleto', 'Dinheiro', 'Transferência']);
// Mesmo aluno, meses diferentes → automática pega o mais perto; irmãos com mesmo valor → não
const M2 = [
  { id: 601, alunoId: 9, aluno: 'Lucas Lima', resp: 'João Lima', referencia: '2026-10', vencimento: '2026-10-10', valor: 600, status: 'pendente' },
  { id: 602, alunoId: 9, aluno: 'Lucas Lima', resp: 'João Lima', referencia: '2026-11', vencimento: '2026-11-10', valor: 600, status: 'pendente' }
];
const s1 = c.sugerir(L('PIX RECEBIDO JOAO LIMA', 600, 'credito', '2026-10-09'), { mensalidades: M2, contas: [] }, 1, { limite: 10 });
conf('mesmo aluno out/nov → automática escolhe out', [s1[0].id, c.automatica(s1)], [601, true]);
const M3 = M2.concat([{ id: 701, alunoId: 10, aluno: 'Bia Lima', resp: 'João Lima', referencia: '2026-10', vencimento: '2026-10-10', valor: 600, status: 'pendente' }]);
const s2 = c.sugerir(L('PIX RECEBIDO JOAO LIMA', 600, 'credito', '2026-10-09'), { mensalidades: M3, contas: [] }, 1, { limite: 10 });
conf('irmãos (mesmo responsável e valor) → não automática', c.automatica(s2), false);
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTodos os testes passaram"); process.exitCode = falhas ? 1 : 0;
