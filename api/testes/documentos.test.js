// Documentos escolares: modelos e variáveis, negrito, JPEG do logotipo, código de validação e tabela do histórico
// — rodar com: node api/testes/documentos.test.js
process.env.CRYPTO_KEY = process.env.CRYPTO_KEY || 'ab'.repeat(32);
const S = require('../src/services/secretaria');
const img = require('../src/utils/imagem');
const { palavrasRicas, Documento } = require('../src/pdf/pdf');
let falhas = 0;
const conf = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) falhas++; console.log(ok ? 'ok  ' : 'ERRO', n, ok ? '' : `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };

/* ---------- Modelos ---------- */
const vals = { aluno: 'Ana **Souza**', ra: '123', nascimento: '', serie: '5º Ano', segmento: 'Ensino Fundamental – Anos Iniciais', destino: '', data_saida: '27/10/2026', finalidade: 'os devidos fins' };
let r = S.aplicarModelo('Declaramos, para {finalidade}, que **{aluno}**, RA {ra}[[, nascido(a) em {nascimento}]], cursa o(a) {serie}[[ ({segmento})]].', vals);
conf('trecho [[ ]] com variável vazia some; o outro fica', r.texto, 'Declaramos, para os devidos fins, que **Ana Souza**, RA 123, cursa o(a) 5º Ano (Ensino Fundamental – Anos Iniciais).');
conf('nada faltando quando o vazio está dentro de [[ ]]', r.faltando, []);
conf('asteriscos do valor não viram negrito', r.texto.includes('**Ana Souza**'), true);
r = S.aplicarModelo('Transferido em {data_saida} para {destino} . Nascido em {nascimento}.', vals);
conf('vazio fora de [[ ]] vira "—" e entra em faltando', [r.texto, r.faltando.map((f) => f.chave)], ['Transferido em 27/10/2026 para —. Nascido em —.', ['destino', 'nascimento']]);
r = S.aplicarModelo('Olá {aluno} {apelido} e {Aluno}', vals);
conf('variável desconhecida fica e é avisada; maiúscula vale', [r.texto, r.desconhecidas], ['Olá Ana Souza {apelido} e Ana Souza', ['{apelido}']]);
r = S.aplicarModelo('{Série} · { data saida } · {RA}[[ · {Nascimento}]]', vals);
conf('acento, espaços e maiúsculas no nome da variável', [r.texto, r.desconhecidas], ['5º Ano · 27/10/2026 · 123', []]);
r = S.aplicarModelo('Linha 1\r\n\r\n\r\n\r\nLinha   2 ,  fim', vals);
conf('limpa espaços, vírgula e linhas em branco extras', r.texto, 'Linha 1\n\nLinha 2, fim');
conf('parágrafos separados por linha em branco', S.paragrafos('A\nB\n\n  C  \n\n\n'), ['A\nB', 'C']);
const todos = Object.fromEntries(S.VARIAVEIS.map((v) => [v.chave, 'x']));
const semDesconhecidas = Object.values(S.PADRAO).every((m) => !S.aplicarModelo(m.texto, todos).desconhecidas.length);
conf('modelos padrão só usam variáveis conhecidas', semDesconhecidas, true);
conf('6 modelos padrão (com o contrato), histórico por último', S.CHAVES, ['matricula', 'frequencia', 'transferencia', 'conclusao', 'contrato', 'historico']);
const vc = S.valores({ aluno: { nome: 'Ana', ra: '1', serie: '5º Ano', resp_nome: 'Maria' }, escola: { nome: 'Colégio X', cnpj: '1', diretor: {}, secretario: {}, valorMensalidade: 850, diaVencimento: 10 }, frequencia: null },
  { valor: 1234.5, parcelas: 11 });
conf('contrato: valores, anuidade e extenso', [vc.valor_mensalidade, vc.valor_anual, vc.parcelas, vc.dia_vencimento, vc.valor_mensalidade_extenso],
  ['R$ 1.234,50', 'R$ 13.579,50', '11', '10', 'mil, duzentos e trinta e quatro reais e cinquenta centavos']);
const vp = S.valores({ aluno: { nome: 'Ana', ra: '1' }, escola: { nome: 'Colégio X', diretor: {}, secretario: {}, valorMensalidade: 850, diaVencimento: 10 }, frequencia: null }, {});
conf('contrato sem valores na emissão: padrão do colégio × 12', [vp.valor_mensalidade, vp.valor_anual, vp.parcelas], ['R$ 850,00', 'R$ 10.200,00', '12']);

/* ---------- Negrito no PDF ---------- */
conf('palavras com negrito colado na pontuação', palavrasRicas('que **Ana Souza**, RA 1').map((p) => p.map((q) => (q.b ? `[${q.t}]` : q.t)).join('')),
  ['que', '[Ana]', '[Souza],', 'RA', '1']);
const d = new Documento(); d.pagina();
const y = d.paragrafoRico(60, 100, 'palavra '.repeat(60).trim(), { tam: 10, larg: 200, entrelinha: 1.5 });
conf('parágrafo quebra em linhas (y avança)', y > 100 + 10 * 1.5 * 5, true);
let paginas = 0;
d.paragrafoRico(60, 700, 'texto '.repeat(400), { tam: 10, larg: 200, limite: 720, novaPagina: () => { paginas++; d.pagina(); return 80; } });
conf('passa do limite → chama novaPagina', paginas >= 1, true);

/* ---------- JPEG ---------- */
const seg = (marca, corpo) => Buffer.concat([Buffer.from([0xFF, marca]), Buffer.from([(corpo.length + 2) >> 8, (corpo.length + 2) & 255]), Buffer.from(corpo)]);
const sof = (marca, w, h, comp) => seg(marca, [8, h >> 8, h & 255, w >> 8, w & 255, comp, ...Array(comp * 3).fill(1)]);
const jpeg = (...partes) => Buffer.concat([Buffer.from([0xFF, 0xD8]), ...partes, Buffer.from([0xFF, 0xDA, 0, 2, 0xFF, 0xD9])]);
const app0 = seg(0xE0, [...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
conf('JPEG comum (SOF0): 360 × 240, colorido', img.lerJpeg(jpeg(app0, seg(0xDB, Array(65).fill(1)), sof(0xC0, 360, 240, 3))), { largura: 360, altura: 240, componentes: 3 });
conf('JPEG progressivo (SOF2) em tons de cinza', img.lerJpeg(jpeg(app0, sof(0xC2, 1200, 400, 1))), { largura: 1200, altura: 400, componentes: 1 });
conf('DHT (C4) não é confundido com SOF', img.lerJpeg(jpeg(seg(0xC4, Array(20).fill(0)), sof(0xC1, 10, 20, 3))), { largura: 10, altura: 20, componentes: 3 });
conf('não é JPEG / sem SOF / truncado', [img.lerJpeg(Buffer.from('\x89PNG....')), img.lerJpeg(jpeg(app0)), img.lerJpeg(Buffer.from([0xFF, 0xD8, 0xFF, 0xC0, 0, 17, 8]))], [null, null, null]);
conf('data URL: só JPEG', [!!img.deDataUrl('data:image/jpeg;base64,/9j/AA=='), img.deDataUrl('data:image/png;base64,iVBOR'), img.deDataUrl('qualquer')], [true, null, null]);
conf('caber na caixa mantendo a proporção', img.caber({ largura: 360, altura: 240 }, 90, 48), { w: 72, h: 48 });

/* ---------- Código de validação ---------- */
const cods = new Set(Array.from({ length: 2000 }, () => S.gerarCodigo()));
conf('códigos: 12 caracteres sem 0/O/1/I/L, sem repetir em 2000', [cods.size, [...cods].every((c) => /^[A-HJKMNP-Z2-9]{12}$/.test(c))], [2000, true]);
conf('formatar e normalizar', [S.formatarCodigo('ABCDEFGHJKMN'), S.normalizarCodigo(' abcd-efgh-jkmn '), S.normalizarCodigo('ABCD-EFGH-JKM0'), S.normalizarCodigo('ABC')],
  ['ABCD-EFGH-JKMN', 'ABCDEFGHJKMN', null, null]);
conf('nome abreviado na validação', [S.abreviarNome('Ana Clara Souza da Silva'), S.abreviarNome('Bruno'), S.abreviarNome('')], ['Ana C. S. S.', 'Bruno', '']);
conf('número do documento', S.numeroDoc(7, 2026), '0007/2026');
process.env.URL_PUBLICA = 'https://escola.exemplo.com/';
conf('link de validação usa URL_PUBLICA', S.validacao('ABCDEFGHJKMN'), { url: 'https://escola.exemplo.com/validar.html?c=ABCDEFGHJKMN', endereco: 'escola.exemplo.com/validar.html', codigo: 'ABCD-EFGH-JKMN' });

/* ---------- Histórico ---------- */
const anos = [
  { origem: 'manual', ano: 2024, serie: '3º Ano', disciplinas: [{ nome: 'portugues', nota: '8,0' }, { nome: 'Artes', nota: 'A' }], cargaHoraria: 800, diasLetivos: 200, frequencia: 96.5, resultado: 'Aprovado' },
  { origem: 'sistema', ano: 2025, serie: '4º Ano', disciplinas: [{ nome: 'Português', nota: '8,5' }, { nome: 'Matemática', nota: '7,3' }], cargaHoraria: null, diasLetivos: 208, frequencia: null, resultado: 'Cursando' }
];
const m = S.matrizHistorico(anos);
conf('matriz: nomes do colégio primeiro, "portugues" digitado na mesma linha', m.linhas.map((l) => [l.disciplina, ...l.notas]),
  [['Português', '8,0', '8,5'], ['Matemática', '', '7,3'], ['Artes', 'A', '']]);
conf('colunas com frequência formatada', m.colunas.map((c) => [c.ano, c.frequencia, c.cargaHoraria]), [[2024, '96,5%', 800], [2025, '', null]]);
conf('nota com vírgula', [S.fmtNota(8.25), S.fmtNota(7), S.fmtNota('A'), S.fmtNota(null)], ['8,3', '7,0', 'A', '']);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
