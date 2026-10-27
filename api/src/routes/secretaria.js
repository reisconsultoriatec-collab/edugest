'use strict';
/* =====================================================================
 *  /api/secretaria — documentos escolares   [módulo documentos]
 *
 *  GET    /opcoes                          alunos, modelos e pendências do cabeçalho
 *  GET    /modelos                         modelos (padrão e do colégio) e variáveis
 *  POST   /modelos                         novo modelo do colégio
 *  PUT    /modelos/:ref                    ajusta (ref = matricula | frequencia | transferencia |
 *                                          conclusao | historico | id de um modelo do colégio)
 *  DELETE /modelos/:ref                    padrão: volta ao texto do sistema · do colégio: exclui
 *  POST   /previa                          documento preenchido, sem gravar
 *  POST   /emitir                          grava no livro de registro (número + código de validação);
 *                                          transferência: pode marcar o aluno e cancelar mensalidades futuras
 *  GET    /emitidos                        livro de registro
 *  POST   /emitidos/:id/link               link do PDF (abrir na tela ou enviar por WhatsApp)
 *  POST   /emitidos/:id/cancelar           cancela (só admin) — a validação passa a mostrar "cancelado"
 *  GET    /historico/:alunoId              anos do histórico escolar
 *  PUT    /historico/:alunoId/turmas/:tid  ajuste de um ano feito no EduGest
 *  POST   /historico/:alunoId/anos         ano anterior digitado (PUT/DELETE /anos/:id)
 *  GET    /cabecalho · PUT (admin)         INEP, UF, ato de autorização, diretor(a), secretário(a)
 *  GET    /logo · PUT · DELETE (admin)     logotipo do colégio (sai em todos os PDFs)
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm, transacao } = require('../db');
const { exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade } = require('../utils/auditoria');
const { hojeSP, agoraSP, dataValida } = require('../utils/datas');
const { assinar } = require('../utils/links');
const img = require('../utils/imagem');
const S = require('../services/secretaria');

const modulo = exigirModulo('documentos');
const soAdmin = (req, res, next) => (req.perfil === 'admin'
  ? next() : next(new HttpErro(403, 'Somente o administrador pode fazer isso', 'perfil')));

const MAX_LIVRES = 30;
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

function uf(valor, campo) {
  const s = v.texto(valor, campo, { max: 2 });
  if (!s) return null;
  const u = s.toUpperCase();
  if (!UFS.includes(u)) throw new HttpErro(400, `${campo} inválida`, 'validacao');
  return u;
}

async function buscarAluno(colegioId, id) {
  const ctx = await S.contextoAluno(colegioId, v.id(id));
  if (!ctx) throw new HttpErro(404, 'Aluno não encontrado', 'nao_encontrado');
  return ctx;
}

async function buscarModelo(colegioId, ref) {
  const m = await S.obterModelo(colegioId, ref);
  if (!m) throw new HttpErro(404, 'Modelo não encontrado', 'nao_encontrado');
  return m;
}

function lerCampos(c) {
  c = c || {};
  const dataSaida = c.dataSaida ? String(c.dataSaida) : null;
  if (dataSaida && !dataValida(dataSaida)) throw new HttpErro(400, 'Data da transferência inválida', 'validacao');
  return {
    finalidade: v.texto(c.finalidade, 'Finalidade', { max: 150 }),
    destino: v.texto(c.destino, 'Escola de destino', { max: 120 }),
    dataSaida,
    // contrato
    valor: v.decimal(c.valor, 'Valor da mensalidade', { min: 0, max: 99999 }),
    parcelas: v.inteiro(c.parcelas, 'Número de parcelas', { min: 1, max: 12 }),
    diaVencimento: v.inteiro(c.diaVencimento, 'Dia do vencimento', { min: 1, max: 28 })
  };
}

function lerModelo(b) {
  const titulo = v.texto(b.titulo, 'Título', { max: 120, obrigatorio: true });
  const texto = v.texto(b.texto, 'Texto', { max: 6000, obrigatorio: true });
  const teste = S.aplicarModelo(texto, Object.fromEntries(S.VARIAVEIS.map((x) => [x.chave, 'x'])));
  if (teste.desconhecidas.length) {
    throw new HttpErro(400, `Variável desconhecida: ${teste.desconhecidas.join(', ')}. Use as variáveis da lista.`, 'validacao');
  }
  return { titulo: titulo.toUpperCase(), texto: texto.replace(/\r/g, '') };
}

/* ---------------- Opções ---------------- */
router.get('/opcoes', modulo, assincrono(async (req, res) => {
  const [alunos, escola, modelos, logo] = await Promise.all([
    query(
      `SELECT a.id, a.nome, a.ra, a.status, a.resp_nome, a.resp_telefone, t.nome AS turma, t.serie
         FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id
        WHERE a.colegio_id = ? ORDER BY a.nome LIMIT 5000`,
      [req.colegioId]
    ),
    S.escolaDocumentos(req.colegioId),
    S.listarModelos(req.colegioId),
    queryUm('SELECT largura FROM colegio_logos WHERE colegio_id = ?', [req.colegioId])
  ]);
  res.json({
    alunos: alunos.map((a) => ({
      id: a.id, nome: a.nome, ra: a.ra, status: a.status, turma: a.turma, serie: a.serie, respNome: a.resp_nome, respTelefone: a.resp_telefone
    })),
    modelos: modelos.map((m) => ({ ref: m.ref, chave: m.chave, rotulo: m.rotulo, personalizado: m.personalizado })),
    pendencias: S.pendenciasEscola(escola),
    logo: !!logo,
    admin: req.perfil === 'admin',
    resultados: S.RESULTADOS
  });
}));

/* ---------------- Modelos ---------------- */
router.get('/modelos', modulo, assincrono(async (req, res) => {
  res.json({ modelos: await S.listarModelos(req.colegioId), variaveis: S.VARIAVEIS, textoNovo: S.TEXTO_NOVO_MODELO });
}));

router.post('/modelos', modulo, assincrono(async (req, res) => {
  const m = lerModelo(req.body);
  const n = await queryUm("SELECT COUNT(*) AS n FROM documento_modelos WHERE colegio_id = ? AND chave = 'livre'", [req.colegioId]);
  if (Number(n.n) >= MAX_LIVRES) throw new HttpErro(409, `No máximo ${MAX_LIVRES} modelos próprios por colégio`, 'limite');
  const r = await query(
    "INSERT INTO documento_modelos (colegio_id, chave, titulo, texto, atualizado_por) VALUES (?, 'livre', ?, ?, ?)",
    [req.colegioId, m.titulo, m.texto, req.usuario.id]
  );
  await atividade(req.colegioId, req.usuario.id, `Modelo de documento criado: ${m.titulo}`);
  res.status(201).json({ ref: String(r.insertId), ...m });
}));

router.put('/modelos/:ref', modulo, assincrono(async (req, res) => {
  const ref = String(req.params.ref);
  const atual = await buscarModelo(req.colegioId, ref);
  const m = lerModelo(req.body);
  if (atual.chave === 'livre') {
    await query('UPDATE documento_modelos SET titulo = ?, texto = ?, atualizado_por = ? WHERE id = ? AND colegio_id = ?',
      [m.titulo, m.texto, req.usuario.id, Number(ref), req.colegioId]);
  } else {
    await transacao(async (conn) => {
      await conn.query('DELETE FROM documento_modelos WHERE colegio_id = ? AND chave = ?', [req.colegioId, ref]);
      await conn.query('INSERT INTO documento_modelos (colegio_id, chave, titulo, texto, atualizado_por) VALUES (?, ?, ?, ?, ?)',
        [req.colegioId, ref, m.titulo, m.texto, req.usuario.id]);
    });
  }
  await atividade(req.colegioId, req.usuario.id, `Modelo de documento ajustado: ${atual.rotulo}`);
  res.json({ ref, ...m, personalizado: true });
}));

router.delete('/modelos/:ref', modulo, assincrono(async (req, res) => {
  const ref = String(req.params.ref);
  const atual = await buscarModelo(req.colegioId, ref);
  if (atual.chave === 'livre') {
    await query('DELETE FROM documento_modelos WHERE id = ? AND colegio_id = ?', [Number(ref), req.colegioId]);
    await atividade(req.colegioId, req.usuario.id, `Modelo de documento excluído: ${atual.titulo}`);
  } else {
    await query('DELETE FROM documento_modelos WHERE colegio_id = ? AND chave = ?', [req.colegioId, ref]);
    await atividade(req.colegioId, req.usuario.id, `Modelo de documento voltou ao padrão: ${atual.rotulo}`);
  }
  res.status(204).end();
}));

/* ---------------- Prévia e emissão ---------------- */
async function infoTransferencia(colegioId, aluno, campos) {
  const dataSaida = campos.dataSaida || hojeSP();
  const [futuras, vencidas] = await Promise.all([
    queryUm(
      `SELECT COUNT(*) AS n, COALESCE(SUM(valor), 0) AS total FROM mensalidades
        WHERE aluno_id = ? AND colegio_id = ? AND status = 'pendente' AND referencia > ?`,
      [aluno.id, colegioId, dataSaida.slice(0, 7)]
    ),
    queryUm(
      `SELECT COUNT(*) AS n FROM mensalidades
        WHERE aluno_id = ? AND colegio_id = ? AND status = 'pendente' AND valor > 0 AND vencimento < ?`,
      [aluno.id, colegioId, hojeSP()]
    )
  ]);
  return {
    status: aluno.status, dataSaida,
    mensalidadesFuturas: Number(futuras.n), totalFuturo: Number(futuras.total), mensalidadesVencidas: Number(vencidas.n)
  };
}

async function montar(req) {
  const b = req.body || {};
  const modelo = await buscarModelo(req.colegioId, b.modelo);
  const ctx = await buscarAluno(req.colegioId, b.alunoId);
  const campos = lerCampos(b.campos);
  const opc = {
    textoEditado: b.texto === undefined || b.texto === null ? undefined : v.texto(b.texto, 'Texto', { max: 8000, obrigatorio: true }),
    tituloEditado: v.texto(b.titulo, 'Título', { max: 120 }) || undefined,
    observacao: v.texto(b.observacao, 'Observação', { max: 1500 })
  };
  const montado = modelo.chave === 'historico'
    ? await S.montarHistorico(req.colegioId, ctx, modelo, opc)
    : await S.montarDeclaracao(req.colegioId, ctx, modelo, campos, opc);
  const avisos = [...(montado.avisos || [])];
  const a = ctx.aluno;
  if (modelo.chave !== 'historico' && !a.turma_id) avisos.push('O aluno não está em nenhuma turma: série, turma e turno saem em branco.');
  if (['matricula', 'frequencia'].includes(modelo.chave) && a.status !== 'ativo') {
    avisos.push(`A situação do aluno é "${a.status}". Confira antes de declarar matrícula ou frequência.`);
  }
  if (modelo.chave === 'contrato') {
    if (!modelo.personalizado) avisos.push('Este é o modelo de referência do sistema: revise o texto com o jurídico do colégio (na aba Modelos) antes de usar com as famílias.');
    if (!a.resp_nome) avisos.push('A ficha do aluno não tem o nome do responsável: o contrato fica sem o CONTRATANTE.');
  }
  let transferencia = null;
  if (modelo.chave === 'transferencia') {
    transferencia = await infoTransferencia(req.colegioId, a, campos);
    if (transferencia.mensalidadesVencidas) {
      avisos.push(`Há ${transferencia.mensalidadesVencidas} mensalidade(s) vencida(s) em aberto. A cobrança continua pelo Financeiro: a lei proíbe reter documentos escolares por inadimplência (Lei 9.870/99).`);
    }
  }
  return { modelo, ctx, campos, montado, avisos, transferencia, transferir: b.transferir || {} };
}

router.post('/previa', modulo, assincrono(async (req, res) => {
  const { modelo, ctx, montado, avisos, transferencia } = await montar(req);
  const comum = {
    tipo: modelo.chave, titulo: montado.titulo, faltando: montado.faltando, desconhecidas: montado.desconhecidas, avisos,
    pendencias: S.pendenciasEscola(ctx.escola)
  };
  if (modelo.chave === 'historico') {
    const c = montado.conteudo;
    return res.json({ ...comum, anos: montado.anos, matriz: c.matriz, identificacao: c.identificacao, estudos: c.estudos, observacoes: c.observacoes });
  }
  res.json({ ...comum, texto: montado.texto, transferencia });
}));

router.post('/emitir', modulo, assincrono(async (req, res) => {
  const { modelo, ctx, campos, montado, transferir } = await montar(req);
  if (montado.desconhecidas.length) {
    throw new HttpErro(400, `Variável desconhecida no texto: ${montado.desconhecidas.join(', ')}`, 'validacao');
  }
  const a = ctx.aluno;
  const r = await transacao(async (conn) => {
    const reg = await S.registrar(conn, req.colegioId, req.usuario, {
      tipo: modelo.chave, titulo: montado.titulo, aluno: a, finalidade: campos.finalidade, conteudo: montado.conteudo
    });
    const efeitos = {};
    if (modelo.chave === 'transferencia' && transferir.marcar) {
      const dataSaida = campos.dataSaida || hojeSP();
      await conn.query("UPDATE alunos SET status = 'transferido', data_saida = ? WHERE id = ? AND colegio_id = ?", [dataSaida, a.id, req.colegioId]);
      efeitos.transferido = true;
      if (transferir.cancelarMensalidades) {
        const [u] = await conn.query(
          "UPDATE mensalidades SET status = 'cancelado' WHERE aluno_id = ? AND colegio_id = ? AND status = 'pendente' AND referencia > ?",
          [a.id, req.colegioId, dataSaida.slice(0, 7)]
        );
        efeitos.mensalidadesCanceladas = Number(u.affectedRows || 0);
      }
    }
    return { ...reg, efeitos };
  });
  const numero = S.numeroDoc(r.numero, r.ano);
  await atividade(req.colegioId, req.usuario.id, `Documento emitido: ${montado.titulo} nº ${numero} · ${a.nome}`);
  if (r.efeitos.transferido) {
    await atividade(req.colegioId, req.usuario.id, `Aluno transferido: ${a.nome}${r.efeitos.mensalidadesCanceladas ? ` (${r.efeitos.mensalidadesCanceladas} mensalidade(s) futura(s) cancelada(s))` : ''}`);
  }
  res.status(201).json({
    id: r.id, numero, codigo: S.formatarCodigo(r.codigo), titulo: montado.titulo, tipo: modelo.chave, efeitos: r.efeitos,
    aluno: { id: a.id, nome: a.nome, respNome: a.resp_nome, respTelefone: a.resp_telefone }
  });
}));

/* ---------------- Livro de registro ---------------- */
router.get('/emitidos', modulo, assincrono(async (req, res) => {
  const cond = ['d.colegio_id = ?'];
  const params = [req.colegioId];
  const ano = v.inteiro(req.query.ano, 'Ano', { min: 2000, max: 2100 });
  if (ano) { cond.push('d.ano = ?'); params.push(ano); }
  if (req.query.alunoId) { cond.push('d.aluno_id = ?'); params.push(v.id(req.query.alunoId)); }
  if (req.query.tipo) { cond.push('d.tipo = ?'); params.push(v.texto(req.query.tipo, 'Tipo', { max: 20 })); }
  if (req.query.situacao === 'cancelados') cond.push('d.cancelado_em IS NOT NULL');
  else if (req.query.situacao === 'validos') cond.push('d.cancelado_em IS NULL');
  const busca = v.texto(req.query.busca, 'Busca', { max: 100 });
  if (busca) {
    const termo = `%${busca.replace(/[%_\\]/g, '\\$&')}%`;
    const cod = S.normalizarCodigo(busca);
    const num = busca.match(/^(\d{1,6})(?:\/(\d{4}))?$/);
    const ou = ['d.aluno_nome LIKE ?', 'd.aluno_ra LIKE ?', 'd.titulo LIKE ?'];
    params.push(termo, termo, termo);
    if (cod) { ou.push('d.codigo = ?'); params.push(cod); }
    if (num) { ou.push(num[2] ? '(d.numero = ? AND d.ano = ?)' : 'd.numero = ?'); params.push(Number(num[1])); if (num[2]) params.push(Number(num[2])); }
    cond.push(`(${ou.join(' OR ')})`);
  }
  const linhas = await query(
    `SELECT d.id, d.ano, d.numero, d.codigo, d.tipo, d.titulo, d.aluno_id, d.aluno_nome, d.aluno_ra, d.finalidade,
            d.emitido_por_nome, d.emitido_em, d.cancelado_em, d.cancelado_por_nome, d.motivo_cancelamento,
            a.resp_nome, a.resp_telefone
       FROM documentos_emitidos d LEFT JOIN alunos a ON a.id = d.aluno_id
      WHERE ${cond.join(' AND ')} ORDER BY d.emitido_em DESC, d.id DESC LIMIT 500`,
    params
  );
  const anos = await query('SELECT DISTINCT ano FROM documentos_emitidos WHERE colegio_id = ? ORDER BY ano DESC', [req.colegioId]);
  res.json({
    anos: anos.map((x) => Number(x.ano)),
    documentos: linhas.map((d) => ({
      id: d.id, numero: S.numeroDoc(d.numero, d.ano), ano: Number(d.ano), codigo: S.formatarCodigo(d.codigo), tipo: d.tipo, titulo: d.titulo,
      alunoId: d.aluno_id, aluno: d.aluno_nome, ra: d.aluno_ra, finalidade: d.finalidade,
      emitidoPor: d.emitido_por_nome, emitidoEm: d.emitido_em,
      cancelado: !!d.cancelado_em, canceladoEm: d.cancelado_em, canceladoPor: d.cancelado_por_nome, motivo: d.motivo_cancelamento,
      respNome: d.resp_nome, respTelefone: d.resp_telefone
    })),
    podeCancelar: req.perfil === 'admin'
  });
}));

async function buscarEmitido(colegioId, id) {
  const d = await queryUm('SELECT id, titulo, aluno_nome, ano, numero, cancelado_em FROM documentos_emitidos WHERE id = ? AND colegio_id = ?', [v.id(id), colegioId]);
  if (!d) throw new HttpErro(404, 'Documento não encontrado', 'nao_encontrado');
  return d;
}

router.post('/emitidos/:id/link', modulo, assincrono(async (req, res) => {
  const d = await buscarEmitido(req.colegioId, req.params.id);
  const enviar = !!(req.body && req.body.enviar);
  if (enviar && d.cancelado_em) throw new HttpErro(409, 'Documento cancelado não pode ser enviado', 'cancelado');
  const cfg = await queryUm('SELECT link_validade_dias FROM config_colegio WHERE colegio_id = ?', [req.colegioId]);
  const dias = Number((cfg && cfg.link_validade_dias) || 30);
  const { token, expira } = assinar({ k: 'e', c: req.colegioId, i: d.id }, enviar ? dias * 86400 : 30 * 60);
  res.json({ url: `/api/publico/doc/${token}`, expira, validadeDias: enviar ? dias : null });
}));

router.post('/emitidos/:id/cancelar', modulo, soAdmin, assincrono(async (req, res) => {
  const d = await buscarEmitido(req.colegioId, req.params.id);
  if (d.cancelado_em) throw new HttpErro(409, 'Este documento já está cancelado', 'cancelado');
  const motivo = v.texto((req.body || {}).motivo, 'Motivo', { min: 5, max: 200, obrigatorio: true });
  await query(
    'UPDATE documentos_emitidos SET cancelado_em = ?, cancelado_por_nome = ?, motivo_cancelamento = ? WHERE id = ? AND colegio_id = ?',
    [agoraSP(), req.usuario.nome || null, motivo, d.id, req.colegioId]
  );
  const numero = S.numeroDoc(d.numero, d.ano);
  await atividade(req.colegioId, req.usuario.id, `Documento cancelado: ${d.titulo} nº ${numero} · ${d.aluno_nome} (${motivo})`);
  res.json({ id: d.id, cancelado: true });
}));

/* ---------------- Histórico escolar ---------------- */
router.get('/historico/:alunoId', modulo, assincrono(async (req, res) => {
  const ctx = await buscarAluno(req.colegioId, req.params.alunoId);
  const a = ctx.aluno;
  const anos = await S.anosDoHistorico(req.colegioId, a, ctx.escola);
  const disciplinas = await query('SELECT nome FROM disciplinas WHERE colegio_id = ? AND ativo = 1 ORDER BY ordem, nome', [req.colegioId]);
  res.json({
    aluno: { id: a.id, nome: a.nome, ra: a.ra, status: a.status, turma: a.turma_nome, serie: a.serie },
    anos, resultados: S.RESULTADOS, disciplinas: disciplinas.map((d) => d.nome)
  });
}));

router.put('/historico/:alunoId/turmas/:turmaId', modulo, assincrono(async (req, res) => {
  const ctx = await buscarAluno(req.colegioId, req.params.alunoId);
  const turma = await queryUm('SELECT id, serie, ano_letivo FROM turmas WHERE id = ? AND colegio_id = ?', [v.id(req.params.turmaId), req.colegioId]);
  if (!turma) throw new HttpErro(404, 'Turma não encontrada', 'nao_encontrado');
  const b = req.body || {};
  const d = {
    dias: v.inteiro(b.diasLetivos, 'Dias letivos', { min: 0, max: 366 }),
    ch: v.inteiro(b.cargaHoraria, 'Carga horária', { min: 0, max: 9999 }),
    resultado: v.texto(b.resultado, 'Resultado', { max: 30 }),
    obs: v.texto(b.observacao, 'Observação', { max: 300 })
  };
  const a = ctx.aluno;
  await transacao(async (conn) => {
    await conn.query('DELETE FROM historico_anos WHERE aluno_id = ? AND turma_id = ?', [a.id, turma.id]);
    if (d.dias !== null || d.ch !== null || d.resultado || d.obs) {
      await conn.query(
        `INSERT INTO historico_anos (colegio_id, aluno_id, turma_id, ano, serie, dias_letivos, carga_horaria, resultado, observacao, atualizado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.colegioId, a.id, turma.id, turma.ano_letivo, turma.serie, d.dias, d.ch, d.resultado, d.obs, req.usuario.id]
      );
    }
  });
  await atividade(req.colegioId, req.usuario.id, `Histórico escolar ajustado: ${a.nome} (${turma.ano_letivo})`);
  res.json({ ok: true });
}));

function lerAnoManual(b) {
  b = b || {};
  const ano = v.inteiro(b.ano, 'Ano', { min: 1950, max: Number(hojeSP().slice(0, 4)) + 1, obrigatorio: true });
  const lista = b.disciplinas === undefined || b.disciplinas === null ? [] : b.disciplinas;
  if (!Array.isArray(lista) || lista.length > 40) throw new HttpErro(400, 'Lista de disciplinas inválida (máximo 40)', 'validacao');
  const disciplinas = lista.map((d, i) => ({
    nome: v.texto((d || {}).nome, `Disciplina ${i + 1}`, { max: 60 }),
    nota: v.texto((d || {}).nota, `Nota da disciplina ${i + 1}`, { max: 12 }) || ''
  })).filter((d) => d.nome);
  return {
    ano,
    serie: v.texto(b.serie, 'Série', { max: 40, obrigatorio: true }),
    escola: v.texto(b.escola, 'Escola', { max: 120, obrigatorio: true }),
    cidade: v.texto(b.cidade, 'Cidade', { max: 60 }),
    uf: uf(b.uf, 'UF'),
    dias: v.inteiro(b.diasLetivos, 'Dias letivos', { min: 0, max: 366 }),
    ch: v.inteiro(b.cargaHoraria, 'Carga horária', { min: 0, max: 9999 }),
    freq: v.decimal(b.frequencia, 'Frequência', { min: 0, max: 100, casas: 2 }),
    resultado: v.texto(b.resultado, 'Resultado', { max: 30 }),
    obs: v.texto(b.observacao, 'Observação', { max: 300 }),
    disciplinas: JSON.stringify(disciplinas)
  };
}

router.post('/historico/:alunoId/anos', modulo, assincrono(async (req, res) => {
  const { aluno: a } = await buscarAluno(req.colegioId, req.params.alunoId);
  const d = lerAnoManual(req.body);
  const n = await queryUm('SELECT COUNT(*) AS n FROM historico_anos WHERE aluno_id = ? AND turma_id IS NULL', [a.id]);
  if (Number(n.n) >= 20) throw new HttpErro(409, 'No máximo 20 anos digitados por aluno', 'limite');
  const r = await query(
    `INSERT INTO historico_anos (colegio_id, aluno_id, ano, serie, escola, cidade, uf, dias_letivos, carga_horaria, frequencia, resultado, disciplinas, observacao, atualizado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.colegioId, a.id, d.ano, d.serie, d.escola, d.cidade, d.uf, d.dias, d.ch, d.freq, d.resultado, d.disciplinas, d.obs, req.usuario.id]
  );
  await atividade(req.colegioId, req.usuario.id, `Histórico escolar: ano ${d.ano} (${d.serie}) incluído para ${a.nome}`);
  res.status(201).json({ id: r.insertId });
}));

async function buscarAnoManual(colegioId, alunoId, id) {
  const h = await queryUm('SELECT id, ano, serie FROM historico_anos WHERE id = ? AND aluno_id = ? AND colegio_id = ? AND turma_id IS NULL', [v.id(id), alunoId, colegioId]);
  if (!h) throw new HttpErro(404, 'Ano do histórico não encontrado', 'nao_encontrado');
  return h;
}

router.put('/historico/:alunoId/anos/:id', modulo, assincrono(async (req, res) => {
  const { aluno: a } = await buscarAluno(req.colegioId, req.params.alunoId);
  const h = await buscarAnoManual(req.colegioId, a.id, req.params.id);
  const d = lerAnoManual(req.body);
  await query(
    `UPDATE historico_anos SET ano = ?, serie = ?, escola = ?, cidade = ?, uf = ?, dias_letivos = ?, carga_horaria = ?, frequencia = ?,
            resultado = ?, disciplinas = ?, observacao = ?, atualizado_por = ? WHERE id = ?`,
    [d.ano, d.serie, d.escola, d.cidade, d.uf, d.dias, d.ch, d.freq, d.resultado, d.disciplinas, d.obs, req.usuario.id, h.id]
  );
  await atividade(req.colegioId, req.usuario.id, `Histórico escolar: ano ${d.ano} (${d.serie}) alterado para ${a.nome}`);
  res.json({ id: h.id });
}));

router.delete('/historico/:alunoId/anos/:id', modulo, assincrono(async (req, res) => {
  const { aluno: a } = await buscarAluno(req.colegioId, req.params.alunoId);
  const h = await buscarAnoManual(req.colegioId, a.id, req.params.id);
  await query('DELETE FROM historico_anos WHERE id = ?', [h.id]);
  await atividade(req.colegioId, req.usuario.id, `Histórico escolar: ano ${h.ano} (${h.serie}) excluído de ${a.nome}`);
  res.status(204).end();
}));

/* ---------------- Cabeçalho e logotipo ---------------- */
router.get('/cabecalho', modulo, assincrono(async (req, res) => {
  const [e, logo] = await Promise.all([
    S.escolaDocumentos(req.colegioId),
    queryUm('SELECT largura, altura FROM colegio_logos WHERE colegio_id = ?', [req.colegioId])
  ]);
  res.json({
    inep: e.inep, uf: e.uf, atoAutorizacao: e.ato, cidade: e.cidade,
    diretorNome: e.diretor.nome, diretorRegistro: e.diretor.registro,
    secretarioNome: e.secretario.nome, secretarioRegistro: e.secretario.registro,
    pendencias: S.pendenciasEscola(e),
    logo: logo ? { largura: Number(logo.largura), altura: Number(logo.altura) } : null
  });
}));

router.put('/cabecalho', modulo, soAdmin, assincrono(async (req, res) => {
  const b = req.body || {};
  const inep = v.texto(b.inep, 'Código INEP', { max: 12 });
  if (inep && !/^\d{8}$/.test(inep)) throw new HttpErro(400, 'O código INEP tem 8 números', 'validacao');
  const d = [
    inep, uf(b.uf, 'UF'), v.texto(b.atoAutorizacao, 'Ato de autorização', { max: 300 }),
    v.texto(b.diretorNome, 'Nome do(a) diretor(a)', { max: 100 }), v.texto(b.diretorRegistro, 'Registro do(a) diretor(a)', { max: 40 }),
    v.texto(b.secretarioNome, 'Nome do(a) secretário(a)', { max: 100 }), v.texto(b.secretarioRegistro, 'Registro do(a) secretário(a)', { max: 40 })
  ];
  await query(
    `UPDATE colegios SET inep = ?, uf = ?, ato_autorizacao = ?, diretor_nome = ?, diretor_registro = ?,
            secretario_nome = ?, secretario_registro = ? WHERE id = ?`,
    [...d, req.colegioId]
  );
  await atividade(req.colegioId, req.usuario.id, 'Dados dos documentos oficiais atualizados');
  res.json({ ok: true, pendencias: S.pendenciasEscola(await S.escolaDocumentos(req.colegioId)) });
}));

router.get('/logo', modulo, assincrono(async (req, res) => {
  const l = await queryUm('SELECT imagem, largura, altura FROM colegio_logos WHERE colegio_id = ?', [req.colegioId]);
  if (!l) throw new HttpErro(404, 'O colégio ainda não tem logotipo', 'sem_logo');
  res.json({ imagem: img.paraDataUrl(l.imagem), largura: Number(l.largura), altura: Number(l.altura) });
}));

router.put('/logo', modulo, soAdmin, assincrono(async (req, res) => {
  const dados = img.deDataUrl((req.body || {}).imagem);
  if (!dados) throw new HttpErro(400, 'Envie a imagem do logotipo em JPEG', 'validacao');
  if (dados.length > img.MAX_BYTES) throw new HttpErro(400, 'Logotipo muito grande (máximo 400 KB)', 'validacao');
  const info = img.lerJpeg(dados);
  if (!info) throw new HttpErro(400, 'Arquivo de imagem inválido', 'validacao');
  if (info.largura > 3000 || info.altura > 3000) throw new HttpErro(400, 'Imagem muito grande (máximo 3000 × 3000 pixels)', 'validacao');
  await transacao(async (conn) => {
    await conn.query('DELETE FROM colegio_logos WHERE colegio_id = ?', [req.colegioId]);
    await conn.query(
      'INSERT INTO colegio_logos (colegio_id, imagem, largura, altura, componentes, atualizado_por) VALUES (?, ?, ?, ?, ?, ?)',
      [req.colegioId, dados, info.largura, info.altura, info.componentes, req.usuario.id]
    );
  });
  await atividade(req.colegioId, req.usuario.id, 'Logotipo do colégio atualizado');
  res.json({ largura: info.largura, altura: info.altura, tamanho: dados.length });
}));

router.delete('/logo', modulo, soAdmin, assincrono(async (req, res) => {
  await query('DELETE FROM colegio_logos WHERE colegio_id = ?', [req.colegioId]);
  await atividade(req.colegioId, req.usuario.id, 'Logotipo do colégio removido');
  res.status(204).end();
}));

module.exports = router;
