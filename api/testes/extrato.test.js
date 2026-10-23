// Leitura de extratos OFX/CSV — rodar com: node api/testes/extrato.test.js
const { lerExtrato, lerNumero, lerData } = require('../src/services/extrato');
let falhas = 0;
const conf = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) falhas++; console.log(ok ? 'ok  ' : 'ERRO', n, ok ? '' : `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
conf('números', ['1.234,56', '-1234.56', '(12,00)', '12,00 D', 'R$ 5,00', '1,234.56', '600', '-0,01', '50,00-', 'abc', ''].map(lerNumero), [1234.56, -1234.56, -12, -12, 5, 1234.56, 600, -0.01, -50, null, null]);
conf('datas', ['23/10/2026', '23/10/26', '2026-10-23', '20261023120000[-3:BRT]', '31/02/2026', '1/9/2026', '2026-10-23 08:00'].map(lerData), ['2026-10-23', '2026-10-23', '2026-10-23', '2026-10-23', null, '2026-09-01', '2026-10-23']);

// OFX 1.x (SGML) em Windows-1252, como o de bancos brasileiros
const ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0341<ACCTID>12345-6</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001<DTEND>20261023
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261008120000[-3:BRT]<TRNAMT>600.00<FITID>202610080001<MEMO>PIX RECEBIDO - MARIA JOSÉ SOUZA EG1M501
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261009<TRNAMT>300,00<FITID>202610090002<NAME>JOAO LIMA<MEMO>PIX RECEBIDO
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005<TRNAMT>-3000.00<FITID>202610050003<MEMO>PAGTO BOLETO IMOBILIARIA CENTRO
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261010<TRNAMT>-45.90<FITID>202610100004<MEMO>TARIFA PACOTE SERVIÇOS
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261011<TRNAMT>600.00<FITID>0<MEMO>PIX RECEBIDO ANA
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261011<TRNAMT>600.00<FITID>0<MEMO>PIX RECEBIDO ANA
</BANKTRANLIST><LEDGERBAL><BALAMT>12345.67<DTASOF>20261023</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const r1 = lerExtrato(Buffer.from(ofx, 'latin1'), 'extrato.ofx');
conf('ofx formato/qtd', [r1.formato, r1.itens.length], ['ofx', 6]);
conf('ofx acento cp1252', r1.itens.find((x) => x.valor === 600 && x.descricao.includes('MARIA')).descricao, 'PIX RECEBIDO - MARIA JOSÉ SOUZA EG1M501');
conf('ofx NAME+MEMO', r1.itens.find((x) => x.valor === 300).descricao, 'PIX RECEBIDO JOAO LIMA');
conf('ofx débito/tipo', r1.itens.filter((x) => x.tipo === 'debito').map((x) => [x.valor, x.data]), [['2026-10-05', 3000].reverse(), [45.9, '2026-10-10']]);
conf('ofx saldo/período', [r1.saldo, r1.periodo], [{ valor: 12345.67, data: '2026-10-23' }, { inicio: '2026-10-05', fim: '2026-10-11' }]);
conf('ofx FITID repetido gera chaves distintas', new Set(r1.itens.map((x) => x.chave)).size, 6);
const r1b = lerExtrato(Buffer.from(ofx, 'latin1'), 'extrato.ofx');
conf('reimportar = mesmas chaves', r1b.itens.map((x) => x.chave), r1.itens.map((x) => x.chave));

// OFX 2.x (XML, UTF-8)
const xml = `<?xml version="1.0" encoding="UTF-8"?><?OFX OFXHEADER="200" VERSION="220"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261015</DTPOSTED><TRNAMT>612.00</TRNAMT><FITID>A1</FITID><MEMO>Transferência recebida &amp; cia</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261016</DTPOSTED><TRNAMT>-400.00</TRNAMT><FITID>A2</FITID><NAME>ENEL</NAME></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const r2 = lerExtrato(Buffer.from(xml, 'utf8'), 'x.ofx');
conf('ofx xml', r2.itens.map((x) => [x.data, x.tipo, x.valor, x.descricao]), [['2026-10-15', 'credito', 612, 'Transferência recebida & cia'], ['2026-10-16', 'debito', 400, 'ENEL']]);

// CSV estilo Itaú (; , valor com sinal, linhas de saldo)
const itau = `data;lançamento;ag./origem;valor (R$);saldos (R$)
01/10/2026;SALDO ANTERIOR;;;1.000,00
08/10/2026;PIX TRANSF MARIA J08/10;;600,00;
09/10/2026;PAG BOLETO ENERGIA;;-400,00;
09/10/2026;SALDO DO DIA;;;1.200,00`;
const r3 = lerExtrato(Buffer.from(itau, 'latin1'), 'itau.csv');
conf('csv itaú', r3.itens.map((x) => [x.data, x.tipo, x.valor, x.descricao]), [['2026-10-08', 'credito', 600, 'PIX TRANSF MARIA J08/10'], ['2026-10-09', 'debito', 400, 'PAG BOLETO ENERGIA']]);
// CSV estilo Bradesco (crédito e débito em colunas, documento)
const brad = `Extrato de: Ag: 1234 | Conta: 56789-0
Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)
08/10/26;Transfe Pix Rem: Maria Jose Souza;1234567;600,00;;1.600,00
10/10/26;Tarifa Bancaria Cesta;0001;;45,90;1.554,10
Total;;;600,00;45,90;`;
const r4 = lerExtrato(Buffer.from(brad, 'utf8'), 'bradesco.csv');
conf('csv bradesco', r4.itens.map((x) => [x.data, x.tipo, x.valor, x.descricao]), [['2026-10-08', 'credito', 600, 'Transfe Pix Rem: Maria Jose Souza 1234567'], ['2026-10-10', 'debito', 45.9, 'Tarifa Bancaria Cesta 0001']]);
// CSV estilo Nubank (vírgula, aspas, valor americano)
const nu = `Data,Valor,Identificador,Descrição
08/10/2026,600.00,abc-1,"Transferência recebida pelo Pix - MARIA JOSE SOUZA - •••.123.456-•• - BCO DO BRASIL"
12/10/2026,-1250.50,abc-2,"Pagamento de boleto efetuado - FORNECEDOR, LTDA"`;
const r5 = lerExtrato(Buffer.from(nu, 'utf8'), 'nubank.csv');
conf('csv nubank', r5.itens.map((x) => [x.tipo, x.valor, x.descricao.slice(0, 40)]), [['credito', 600, 'Transferência recebida pelo Pix - MARIA '], ['debito', 1250.5, 'Pagamento de boleto efetuado - FORNECEDO']]);
// Sem cabeçalho (formato do sistema antigo) + tipo C/D
const simples = `08/10/2026;PIX RECEBIDO ANA;600,00\n09/10/2026;ALUGUEL;-3.000,00`;
conf('csv sem cabeçalho', lerExtrato(Buffer.from(simples), 'a.csv').itens.map((x) => [x.tipo, x.valor]), [['credito', 600], ['debito', 3000]]);
const cd = `Data;Descrição;Valor;Tipo\n08/10/2026;PIX ANA;600,00;C\n09/10/2026;ALUGUEL;3.000,00;D`;
conf('csv coluna C/D', lerExtrato(Buffer.from(cd), 'b.csv').itens.map((x) => [x.tipo, x.valor]), [['credito', 600], ['debito', 3000]]);
try { lerExtrato(Buffer.from('nome;idade\nana;10'), 'c.csv'); conf('csv inválido', 'aceitou', 'erro'); } catch (e) { conf('csv inválido → mensagem', e.message.slice(0, 40), 'Nenhum lançamento encontrado. O CSV prec'); }
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTodos os testes passaram"); process.exitCode = falhas ? 1 : 0;
