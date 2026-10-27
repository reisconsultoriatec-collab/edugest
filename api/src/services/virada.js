'use strict';
/* =====================================================================
 *  Virada do ano letivo (rematrícula)
 *
 *  Prévia: turmas do ano que termina com a turma proposta para o ano
 *  seguinte (próxima série) e cada aluno com a situação calculada pelas
 *  notas e frequência (mesma regra do boletim) e a ação sugerida.
 *
 *  Execução (uma transação): cria as turmas novas (ou usa as que já
 *  existem), move os alunos (promover / reter / concluir / sair /
 *  enturmar), copia professores e grade se pedido, gera as mensalidades
 *  do ano novo e muda o ano letivo da configuração. Guarda o estado
 *  anterior de tudo em viradas / virada_turmas / virada_alunos.
 *
 *  Desfazer: só a última virada, e só enquanto o ano novo não tiver
 *  movimento (mensalidade paga, notas ou diário nas turmas criadas,
 *  aluno de fora colocado nelas).
 *
 *  O ano que termina continua intacto: notas, frequência, boletim,
 *  histórico e financeiro ficam ligados às turmas antigas.
 * ===================================================================== */
const { query, queryUm, transacao } = require('../db');
const { HttpErro } = require('../middleware/erros');
const { calcular } = require('./boletim');
const f = require('./financeiro');
const { hojeSP } = require('../utils/datas');

/* ---------------- Séries ---------------- */
const SEQUENCIA = ['Berçário', 'Maternal I', 'Maternal II', 'Infantil I', 'Infantil II', 'Infantil III',
  '1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano', '6º Ano', '7º Ano', '8º Ano', '9º Ano',
  '1ª Série EM', '2ª Série EM', '3ª Série EM'];
/** Compara séries e nomes sem acento, maiúsculas, º/ª/°, "o"/"a" de ordinal e o "EM" do fim. */
const chave = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[\u00ba\u00b0\u00aa]/g, '').replace(/(\d)[oa](?=\s|$)/g, '$1').replace(/\bensino medio\b|\bem$/g, '')
  .replace(/\s+/g, ' ').trim();
const INDICE = new Map(SEQUENCIA.map((s, i) => [chave(s), i]));

/** Próxima série: '5º Ano' → '6º Ano'; '3ª Série EM' → null (conclui); série desconhecida → a mesma. */
function proximaSerie(serie) {
  const i = INDICE.get(chave(serie));
  if (i === undefined) return serie;
  return i === SEQUENCIA.length - 1 ? null : SEQUENCIA[i + 1];
}

/** Nome da turma no ano seguinte: '5º Ano A' → '6º Ano A'. Se o nome não começa pela série, fica igual. */
function nomeProximo(nome, serie, proxima) {
  if (!proxima) return nome;
  const n = String(nome || '').trim();
  const s = String(serie || '').trim();
  if (s && chave(n).startsWith(chave(s))) {
    const resto = n.slice(s.length).trim();
    return `${proxima}${resto ? ' ' + resto : ''}`.slice(0, 50);
  }
  return n;
}

/* ---------------- Resultado do ano ---------------- */
const ACOES = ['promover', 'reter', 'concluir', 'sair', 'manter'];
const ACOES_SEM_TURMA = ['enturmar', 'sair', 'manter'];

/** Situação calculada → texto do histórico conforme a decisão tomada na virada. */
function resultadoDe(acao, situacao) {
  if (acao === 'reter') return 'Retido';
  if (acao === 'promover' || acao === 'concluir') {
    if (situacao === 'aprovado') return 'Aprovado';
    if (situacao === 'recuperacao' || situacao === 'frequencia_insuficiente') return 'Aprovado pelo Conselho de Classe';
    return 'Promovido';
  }
  if (acao === 'sair') {
    return { aprovado: 'Aprovado', recuperacao: 'Em recuperação', frequencia_insuficiente: 'Frequência insuficiente' }[situacao] || 'Cursando';
  }
  return null;
}

/**
 * Ação sugerida: aprovado → promover (ou concluir, se a turma conclui);
 * sem notas no sistema → promover (colégio que não lança notas);
 * recuperação, frequência baixa ou notas incompletas → decidir depois.
 */
function acaoSugerida(situacao, turmaConclui) {
  if (situacao === 'aprovado' || situacao === 'sem_notas') return turmaConclui ? 'concluir' : 'promover';
  return 'manter';
}

/* ---------------- Prévia ---------------- */
async function configDoColegio(colegioId, conn) {
  const sql = 'SELECT ano_letivo, valor_mensalidade, dia_vencimento, media_aprovacao, frequencia_minima FROM config_colegio WHERE colegio_id = ?';
  if (conn) { const [[c]] = await conn.query(sql + ' FOR UPDATE', [colegioId]); return c; }
  return queryUm(sql, [colegioId]);
}

/** Anos possíveis: o ano letivo atual → seguinte, ou (depois da virada) o anterior → atual para resolver quem ficou. */
function validarAnos(cfg, anoDe) {
  const atual = Number(cfg.ano_letivo);
  if (anoDe !== atual && anoDe !== atual - 1) {
    throw new HttpErro(400, `A virada parte do ano letivo atual (${atual}) ou, para resolver alunos pendentes, de ${atual - 1}`, 'validacao');
  }
  return { anoDe, anoPara: anoDe + 1, modo: anoDe === atual ? 'nova' : 'complemento' };
}

async function situacoesDaTurma(colegioId, turmaIds, cfg) {
  if (!turmaIds.length) return { disciplinas: [], notas: new Map(), freq: new Map() };
  const [disciplinas, notas, freq] = await Promise.all([
    query('SELECT id, nome, ativo FROM disciplinas WHERE colegio_id = ? ORDER BY ordem, nome', [colegioId]),
    query('SELECT aluno_id, turma_id, disciplina_id, bimestre, n1, n2, trabalho FROM notas WHERE colegio_id = ? AND turma_id IN (?)', [colegioId, turmaIds]),
    query(
      `SELECT f.aluno_id, d.turma_id, COUNT(*) AS aulas,
              COALESCE(SUM(f.status = 'P'), 0) AS presencas, COALESCE(SUM(f.status = 'F'), 0) AS faltas,
              COALESCE(SUM(f.status = 'J'), 0) AS justificadas
         FROM frequencias f JOIN diarios d ON d.id = f.diario_id
        WHERE d.colegio_id = ? AND d.turma_id IN (?)
        GROUP BY f.aluno_id, d.turma_id`,
      [colegioId, turmaIds]
    )
  ]);
  const porAluno = new Map();
  notas.forEach((n) => { const k = `${n.aluno_id}:${n.turma_id}`; if (!porAluno.has(k)) porAluno.set(k, []); porAluno.get(k).push(n); });
  const freqMap = new Map(freq.map((x) => [`${x.aluno_id}:${x.turma_id}`, x]));
  return { disciplinas, notas: porAluno, freq: freqMap, mediaAprov: Number(cfg.media_aprovacao ?? 6), freqMin: Number(cfg.frequencia_minima ?? 75) };
}

function situacaoDoAluno(dados, alunoId, turmaId) {
  const k = `${alunoId}:${turmaId}`;
  const notas = dados.notas.get(k) || [];
  const fr = dados.freq.get(k) || null;
  const r = calcular({ disciplinas: dados.disciplinas, notas, freq: fr, mediaAprov: dados.mediaAprov, freqMin: dados.freqMin });
  const medias = r.linhas.filter((l) => l.mediaFinal !== null);
  return {
    situacao: notas.length ? r.situacaoGeral : 'sem_notas',
    frequencia: r.frequencia.percentual,
    abaixoDaMedia: medias.filter((l) => l.mediaFinal < dados.mediaAprov).map((l) => l.nome)
  };
}

const formatarTurma = (t) => ({
  id: t.id, nome: t.nome, serie: t.serie, periodo: t.periodo, capacidade: Number(t.capacidade || 35), anoLetivo: Number(t.ano_letivo),
  ativo: t.ativo === undefined || t.ativo === null ? true : !!Number(t.ativo)
});

/** Alunos ativos ainda em turmas do ano anterior ao letivo atual (ficaram para decidir depois). */
async function pendentesDoAnoAnterior(colegioId, anoLetivo) {
  const r = await queryUm(`SELECT COUNT(*) AS n FROM alunos a JOIN turmas t ON t.id = a.turma_id
                            WHERE a.colegio_id = ? AND a.status = 'ativo' AND t.ano_letivo = ?`, [colegioId, anoLetivo - 1]);
  return Number(r.n);
}

async function previa(colegioId, anoPedido) {
  const cfg = await configDoColegio(colegioId);
  const atual = Number(cfg.ano_letivo);
  const pendentes = await pendentesDoAnoAnterior(colegioId, atual);
  let anoDe = anoPedido ? Number(anoPedido) : atual;
  if (!anoPedido && pendentes) {
    // Depois da virada, quem ficou para decidir depois aparece primeiro
    const feita = await queryUm('SELECT id FROM viradas WHERE colegio_id = ? AND ano_para = ? AND desfeita_em IS NULL LIMIT 1', [colegioId, atual]);
    if (feita) anoDe = atual - 1;
  }
  const { anoPara, modo } = validarAnos(cfg, anoDe);
  const hoje = hojeSP();

  const [turmasDe, turmasPara, alunos, semTurma, abertas, historico] = await Promise.all([
    query('SELECT * FROM turmas WHERE colegio_id = ? AND ano_letivo = ? ORDER BY nome', [colegioId, anoDe]),
    query('SELECT * FROM turmas WHERE colegio_id = ? AND ano_letivo = ? ORDER BY nome', [colegioId, anoPara]),
    query(
      `SELECT a.id, a.nome, a.ra, a.turma_id FROM alunos a JOIN turmas t ON t.id = a.turma_id
        WHERE a.colegio_id = ? AND a.status = 'ativo' AND t.ano_letivo = ? ORDER BY a.nome`,
      [colegioId, anoDe]
    ),
    query(
      `SELECT a.id, a.nome, a.ra, a.turma_id, t.nome AS turma, t.ano_letivo FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id
        WHERE a.colegio_id = ? AND a.status = 'ativo' AND (a.turma_id IS NULL OR t.ano_letivo < ?) ORDER BY a.nome`,
      [colegioId, anoDe]
    ),
    query(
      `SELECT aluno_id, COUNT(*) AS qtd, SUM(valor) AS valor FROM mensalidades
        WHERE colegio_id = ? AND status = 'pendente' AND valor > 0 AND vencimento < ? GROUP BY aluno_id`,
      [colegioId, hoje]
    ),
    historicoViradas(colegioId)
  ]);

  const dados = await situacoesDaTurma(colegioId, turmasDe.map((t) => t.id), cfg);
  const ocupacao = turmasPara.length
    ? await query("SELECT turma_id, COUNT(*) AS n FROM alunos WHERE colegio_id = ? AND status = 'ativo' AND turma_id IN (?) GROUP BY turma_id",
      [colegioId, turmasPara.map((t) => t.id)])
    : [];
  const alunosNa = new Map(ocupacao.map((x) => [x.turma_id, Number(x.n)]));
  const abertoPor = new Map(abertas.map((x) => [x.aluno_id, { qtd: Number(x.qtd), valor: Number(x.valor) }]));
  const seriesOferecidas = new Set([...turmasDe, ...turmasPara].map((t) => chave(t.serie)));
  const paraPorNome = new Map(turmasPara.map((t) => [chave(t.nome), t]));

  const turmas = turmasDe.map((t) => {
    const proxima = proximaSerie(t.serie);
    const nome = nomeProximo(t.nome, t.serie, proxima);
    let proposta;
    if (proxima === null) proposta = { acao: 'concluir', motivo: 'ultima_serie' };
    else if (paraPorNome.has(chave(nome))) proposta = { acao: 'existente', destinoId: paraPorNome.get(chave(nome)).id };
    else if (!seriesOferecidas.has(chave(proxima)) && chave(proxima) !== chave(t.serie)) proposta = { acao: 'concluir', motivo: 'serie_nao_oferecida', serie: proxima };
    else proposta = { acao: 'criar', nome, serie: proxima, periodo: t.periodo, capacidade: Number(t.capacidade || 35) };
    const conclui = proposta.acao === 'concluir';
    const lista = alunos.filter((a) => a.turma_id === t.id).map((a) => {
      const s = situacaoDoAluno(dados, a.id, t.id);
      return {
        id: a.id, nome: a.nome, ra: a.ra, ...s,
        emAberto: abertoPor.get(a.id) || null,
        sugestao: acaoSugerida(s.situacao, conclui)
      };
    });
    return { ...formatarTurma(t), proximaSerie: proxima, proposta, alunos: lista };
  });

  return {
    anoDe, anoPara, modo,
    anoLetivoAtual: atual,
    pendentesAnoAnterior: pendentes,
    anosPossiveis: pendentes ? [atual - 1, atual] : [atual],
    config: { valorMensalidade: Number(cfg.valor_mensalidade || 0), diaVencimento: Number(cfg.dia_vencimento || 10) },
    turmas,
    turmasExistentes: turmasPara.map((t) => ({ ...formatarTurma(t), alunos: alunosNa.get(t.id) || 0 })),
    semTurma: semTurma.map((a) => ({
      id: a.id, nome: a.nome, ra: a.ra, turma: a.turma || null, turmaAno: a.ano_letivo ? Number(a.ano_letivo) : null,
      emAberto: abertoPor.get(a.id) || null, sugestao: 'manter'
    })),
    viradas: historico
  };
}

/* ---------------- Histórico de viradas ---------------- */
async function historicoViradas(colegioId) {
  const lista = await query(
    `SELECT v.*, u.nome AS por_nome, d.nome AS desfeita_por_nome FROM viradas v
       LEFT JOIN usuarios u ON u.id = v.feita_por LEFT JOIN usuarios d ON d.id = v.desfeita_por
      WHERE v.colegio_id = ? ORDER BY v.id DESC LIMIT 20`,
    [colegioId]
  );
  const ultima = lista.find((v) => !v.desfeita_em);
  const out = [];
  for (const v of lista) {
    let resumo = {};
    try { resumo = JSON.parse(v.resumo || '{}'); } catch (e) { resumo = {}; }
    const item = {
      id: v.id, anoDe: Number(v.ano_de), anoPara: Number(v.ano_para), feitaEm: v.feita_em, por: v.por_nome || null,
      desfeitaEm: v.desfeita_em || null, desfeitaPor: v.desfeita_por_nome || null, resumo, podeDesfazer: false, bloqueio: null
    };
    if (ultima && v.id === ultima.id) {
      const b = await bloqueioDesfazer(colegioId, v.id);
      item.podeDesfazer = !b;
      item.bloqueio = b;
    }
    out.push(item);
  }
  return out;
}

/** Por que não dá para desfazer (null = pode). */
async function bloqueioDesfazer(colegioId, viradaId, conn) {
  const um = async (sql, p) => {
    if (conn) { const [[r]] = await conn.query(sql, p); return r; }
    return queryUm(sql, p);
  };
  const pagas = await um("SELECT COUNT(*) AS n FROM mensalidades WHERE colegio_id = ? AND virada_id = ? AND status = 'pago'", [colegioId, viradaId]);
  if (Number(pagas.n)) return `${pagas.n} mensalidade(s) gerada(s) pela virada já foram pagas.`;
  const notas = await um(
    `SELECT COUNT(*) AS n FROM notas WHERE turma_id IN (SELECT turma_id FROM virada_turmas WHERE virada_id = ? AND criada = 1)`, [viradaId]);
  if (Number(notas.n)) return 'Já há notas lançadas nas turmas criadas pela virada.';
  const diarios = await um(
    `SELECT COUNT(*) AS n FROM diarios WHERE turma_id IN (SELECT turma_id FROM virada_turmas WHERE virada_id = ? AND criada = 1)`, [viradaId]);
  if (Number(diarios.n)) return 'Já há aulas registradas no diário das turmas criadas pela virada.';
  const outros = await um(
    `SELECT COUNT(*) AS n FROM alunos WHERE colegio_id = ?
        AND turma_id IN (SELECT turma_id FROM virada_turmas WHERE virada_id = ? AND criada = 1)
        AND id NOT IN (SELECT aluno_id FROM virada_alunos WHERE virada_id = ?)`, [colegioId, viradaId, viradaId]);
  if (Number(outros.n)) return `${outros.n} aluno(s) cadastrado(s) depois da virada estão nas turmas criadas por ela.`;
  return null;
}

/* ---------------- Execução ---------------- */
const PERIODOS = ['matutino', 'vespertino', 'integral', 'noturno'];

/**
 * @param {object} p {anoDe, turmas:[{origemId, acao:'criar'|'existente'|'concluir', nome, serie, periodo, capacidade, destinoId, copiarProfessores}],
 *                    alunos:[{id, acao, destino:'nova:<origemId>'|'<turmaId>'}],
 *                    mensalidades:{gerar, valor, mesInicial, mesFinal, diaVencimento}, novoValorPadrao}
 */
async function executar(colegioId, usuarioId, p) {
  return transacao(async (conn) => {
    const q = async (sql, params) => (await conn.query(sql, params))[0];
    const cfg = await configDoColegio(colegioId, conn);
    const { anoDe, anoPara, modo } = validarAnos(cfg, Number(p.anoDe));

    const turmasDe = await q('SELECT * FROM turmas WHERE colegio_id = ? AND ano_letivo = ?', [colegioId, anoDe]);
    const turmasPara = await q('SELECT * FROM turmas WHERE colegio_id = ? AND ano_letivo = ?', [colegioId, anoPara]);
    const deId = new Map(turmasDe.map((t) => [t.id, t]));
    const paraId = new Map(turmasPara.map((t) => [t.id, t]));

    const [rv] = await conn.query(
      `INSERT INTO viradas (colegio_id, ano_de, ano_para, ano_letivo_anterior, valor_anterior, valor_novo, feita_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [colegioId, anoDe, anoPara, cfg.ano_letivo, cfg.valor_mensalidade, p.novoValorPadrao ?? null, usuarioId]
    );
    const viradaId = rv.insertId;

    /* 1. Turmas do ano novo */
    const destinoDaOrigem = new Map(); // origemId → turmaId no ano novo (ou null = conclui)
    const criadas = [];
    const usadas = new Set();
    for (const t of p.turmas || []) {
      const origem = deId.get(t.origemId);
      if (!origem) throw new HttpErro(400, `Turma de origem inválida (${t.origemId})`, 'validacao');
      if (t.acao === 'concluir') { destinoDaOrigem.set(origem.id, null); continue; }
      if (t.acao === 'existente') {
        if (!paraId.has(t.destinoId)) throw new HttpErro(400, `A turma escolhida para ${origem.nome} não é de ${anoPara}`, 'validacao');
        destinoDaOrigem.set(origem.id, t.destinoId);
        usadas.add(t.destinoId);
        continue;
      }
      if (t.acao !== 'criar') throw new HttpErro(400, 'Ação de turma inválida', 'validacao');
      const nome = String(t.nome || '').trim().slice(0, 50);
      const serie = String(t.serie || '').trim().slice(0, 30);
      if (nome.length < 1 || !serie) throw new HttpErro(400, `Informe nome e série da turma nova (origem ${origem.nome})`, 'validacao');
      const periodo = PERIODOS.includes(t.periodo) ? t.periodo : origem.periodo;
      const capacidade = Math.max(1, Math.min(200, Number(t.capacidade) || Number(origem.capacidade) || 35));
      let r;
      try {
        [r] = await conn.query('INSERT INTO turmas (colegio_id, ano_letivo, nome, serie, periodo, capacidade) VALUES (?, ?, ?, ?, ?, ?)',
          [colegioId, anoPara, nome, serie, periodo, capacidade]);
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY' || /UNIQUE/i.test(e.message)) throw new HttpErro(409, `Já existe a turma "${nome}" em ${anoPara}. Escolha "usar a turma que já existe".`, 'duplicado');
        throw e;
      }
      const novaId = r.insertId;
      criadas.push({ id: novaId, origem, periodo });
      destinoDaOrigem.set(origem.id, novaId);
      paraId.set(novaId, { id: novaId, nome, serie, ano_letivo: anoPara });
      await conn.query('INSERT INTO virada_turmas (virada_id, turma_id, turma_origem_id, criada) VALUES (?, ?, ?, 1)', [viradaId, novaId, origem.id]);
      if (t.copiarProfessores) {
        await conn.query(
          `INSERT INTO atribuicoes (colegio_id, turma_id, disciplina_id, professor_id)
           SELECT colegio_id, ?, disciplina_id, professor_id FROM atribuicoes WHERE turma_id = ? AND colegio_id = ?`,
          [novaId, origem.id, colegioId]);
        if (periodo === origem.periodo) {
          await conn.query(
            `INSERT INTO grade_horaria (colegio_id, turma_id, dia_semana, horario_id, disciplina_id, professor_id)
             SELECT colegio_id, ?, dia_semana, horario_id, disciplina_id, professor_id FROM grade_horaria WHERE turma_id = ? AND colegio_id = ?`,
            [novaId, origem.id, colegioId]);
        }
      }
    }
    for (const id of usadas) {
      await conn.query('INSERT INTO virada_turmas (virada_id, turma_id, turma_origem_id, criada) VALUES (?, ?, NULL, 0)', [viradaId, id]);
    }

    /* 2. Alunos */
    const ids = (p.alunos || []).map((a) => Number(a.id)).filter(Boolean);
    if (new Set(ids).size !== ids.length) throw new HttpErro(400, 'Aluno repetido na lista', 'validacao');
    const atuais = ids.length
      ? await q(`SELECT a.id, a.nome, a.status, a.turma_id, a.data_saida, t.ano_letivo FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id
                  WHERE a.colegio_id = ? AND a.id IN (?) FOR UPDATE`, [colegioId, ids])
      : [];
    const porId = new Map(atuais.map((a) => [a.id, a]));
    const cfgSit = { media_aprovacao: cfg.media_aprovacao, frequencia_minima: cfg.frequencia_minima };
    const dados = await situacoesDaTurma(colegioId, turmasDe.map((t) => t.id), cfgSit);
    const resumo = { promovidos: 0, retidos: 0, concluidos: 0, sairam: 0, enturmados: 0, mantidos: 0, turmasCriadas: criadas.length, turmasUsadas: usadas.size };
    const paraCobrar = [];
    const hoje = hojeSP();

    const resolverDestino = (destino, origemId) => {
      if (destino === undefined || destino === null || destino === '') return origemId ? destinoDaOrigem.get(origemId) : null;
      const s = String(destino);
      if (s.startsWith('nova:')) {
        const o = Number(s.slice(5));
        if (!destinoDaOrigem.has(o) || !destinoDaOrigem.get(o)) throw new HttpErro(400, 'Turma de destino inválida', 'validacao');
        return destinoDaOrigem.get(o);
      }
      const id = Number(s);
      if (!paraId.has(id)) throw new HttpErro(400, `A turma de destino precisa ser de ${anoPara}`, 'validacao');
      return id;
    };

    for (const d of p.alunos || []) {
      const a = porId.get(Number(d.id));
      if (!a) throw new HttpErro(400, 'Aluno não encontrado', 'validacao');
      if (a.status !== 'ativo') throw new HttpErro(409, `${a.nome} não está mais ativo. Atualize a tela.`, 'conflito');
      const naTurmaDoAno = a.turma_id && deId.has(a.turma_id);
      const semTurmaDoAno = !a.turma_id || (a.ano_letivo && Number(a.ano_letivo) < anoDe);
      if (!naTurmaDoAno && !semTurmaDoAno) throw new HttpErro(409, `${a.nome} já não está numa turma de ${anoDe}. Atualize a tela.`, 'conflito');
      const acoes = naTurmaDoAno ? ACOES : ACOES_SEM_TURMA;
      if (!acoes.includes(d.acao)) throw new HttpErro(400, `Ação inválida para ${a.nome}`, 'validacao');
      if (d.acao === 'manter') { resumo.mantidos += 1; continue; }

      const s = naTurmaDoAno ? situacaoDoAluno(dados, a.id, a.turma_id) : { situacao: null };
      let destinoId = null, statusNovo = 'ativo', dataSaida = a.data_saida;
      if (d.acao === 'promover' || d.acao === 'reter' || d.acao === 'enturmar') {
        destinoId = d.acao === 'promover' ? resolverDestino(d.destino, a.turma_id) : resolverDestino(d.destino, null);
        if (!destinoId) throw new HttpErro(400, `Escolha a turma de ${anoPara} para ${a.nome}`, 'validacao');
      } else if (d.acao === 'concluir') {
        statusNovo = 'concluido'; dataSaida = hoje;
      } else if (d.acao === 'sair') {
        statusNovo = 'inativo'; dataSaida = hoje;
      }
      const resultado = naTurmaDoAno ? resultadoDe(d.acao, s.situacao) : null;
      await conn.query(
        `INSERT INTO virada_alunos (virada_id, aluno_id, acao, turma_origem_id, turma_destino_id, status_origem, status_destino, data_saida_origem, situacao, resultado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [viradaId, a.id, d.acao, a.turma_id || null, destinoId, a.status, statusNovo, a.data_saida || null, s.situacao, resultado]
      );
      if (destinoId) {
        await conn.query('UPDATE alunos SET turma_id = ? WHERE id = ? AND colegio_id = ?', [destinoId, a.id, colegioId]);
        paraCobrar.push(a.id);
      } else {
        await conn.query('UPDATE alunos SET status = ?, data_saida = ? WHERE id = ? AND colegio_id = ?', [statusNovo, dataSaida, a.id, colegioId]);
      }
      resumo[{ promover: 'promovidos', reter: 'retidos', concluir: 'concluidos', sair: 'sairam', enturmar: 'enturmados' }[d.acao]] += 1;
    }

    /* 3. Mensalidades do ano novo */
    resumo.mensalidades = 0; resumo.valorMensalidades = 0;
    const m = p.mensalidades || {};
    if (m.gerar && paraCobrar.length) {
      const valor = Number(m.valor);
      const mesIni = Number(m.mesInicial || 1), mesFim = Number(m.mesFinal || 12);
      const dia = Number(m.diaVencimento || cfg.dia_vencimento || 10);
      if (!(valor > 0 && valor < 100000)) throw new HttpErro(400, 'Valor da mensalidade inválido', 'validacao');
      if (!(mesIni >= 1 && mesFim <= 12 && mesFim >= mesIni)) throw new HttpErro(400, 'Meses inválidos', 'validacao');
      if (!(dia >= 1 && dia <= 28)) throw new HttpErro(400, 'Dia de vencimento inválido', 'validacao');
      const refs = [];
      for (let mes = mesIni; mes <= mesFim; mes++) refs.push(`${anoPara}-${String(mes).padStart(2, '0')}`);
      const bolsas = await q('SELECT id, aluno_id, percentual, vigencia_inicio, vigencia_fim, ativo FROM bolsas WHERE colegio_id = ? AND aluno_id IN (?)', [colegioId, paraCobrar]);
      const existentes = await q('SELECT aluno_id, referencia FROM mensalidades WHERE colegio_id = ? AND aluno_id IN (?) AND referencia IN (?)', [colegioId, paraCobrar, refs]);
      const jaTem = new Set(existentes.map((e) => `${e.aluno_id}:${e.referencia}`));
      const porAluno = new Map();
      bolsas.forEach((x) => { if (!porAluno.has(x.aluno_id)) porAluno.set(x.aluno_id, []); porAluno.get(x.aluno_id).push(x); });
      const novas = [];
      paraCobrar.forEach((alunoId) => refs.forEach((ref) => {
        if (jaTem.has(`${alunoId}:${ref}`)) return;
        const venc = `${ref}-${String(dia).padStart(2, '0')}`;
        const bolsa = f.bolsaVigente(porAluno.get(alunoId) || [], venc);
        const val = f.calcularValores(valor, bolsa ? bolsa.percentual : 0);
        if (val.valor === 0) return;
        novas.push([colegioId, alunoId, ref, venc, valor, val.desconto, val.valor, bolsa ? bolsa.id : null, viradaId]);
        resumo.valorMensalidades += f.centavos(val.valor);
      }));
      for (let i = 0; i < novas.length; i += 500) {
        await conn.query('INSERT INTO mensalidades (colegio_id, aluno_id, referencia, vencimento, valor_bruto, desconto, valor, bolsa_id, virada_id) VALUES ?', [novas.slice(i, i + 500)]);
      }
      resumo.mensalidades = novas.length;
      resumo.valorMensalidades /= 100;
    }

    /* 4. Configuração: o ano letivo passa a ser o novo (só na virada "nova") */
    if (modo === 'nova') {
      const valorNovo = p.novoValorPadrao === undefined || p.novoValorPadrao === null || p.novoValorPadrao === '' ? null : Number(p.novoValorPadrao);
      if (valorNovo !== null && !(valorNovo >= 0 && valorNovo < 100000)) throw new HttpErro(400, 'Novo valor padrão inválido', 'validacao');
      await conn.query('UPDATE config_colegio SET ano_letivo = ?, valor_mensalidade = COALESCE(?, valor_mensalidade) WHERE colegio_id = ?', [anoPara, valorNovo, colegioId]);
      await conn.query('UPDATE viradas SET valor_novo = ? WHERE id = ?', [valorNovo, viradaId]);
    }
    resumo.modo = modo;
    await conn.query('UPDATE viradas SET resumo = ? WHERE id = ?', [JSON.stringify(resumo), viradaId]);
    return { id: viradaId, anoDe, anoPara, modo, resumo };
  });
}

/* ---------------- Desfazer ---------------- */
async function desfazer(colegioId, usuarioId, viradaId) {
  return transacao(async (conn) => {
    const [[v]] = await conn.query('SELECT * FROM viradas WHERE id = ? AND colegio_id = ? FOR UPDATE', [viradaId, colegioId]);
    if (!v) throw new HttpErro(404, 'Virada não encontrada', 'nao_encontrado');
    if (v.desfeita_em) throw new HttpErro(409, 'Esta virada já foi desfeita', 'conflito');
    const [[ultima]] = await conn.query('SELECT MAX(id) AS id FROM viradas WHERE colegio_id = ? AND desfeita_em IS NULL', [colegioId]);
    if (Number(ultima.id) !== v.id) throw new HttpErro(409, 'Só dá para desfazer a última virada feita', 'conflito');
    const b = await bloqueioDesfazer(colegioId, v.id, conn);
    if (b) throw new HttpErro(409, `Não dá para desfazer: ${b}`, 'conflito');

    const [alunos] = await conn.query('SELECT * FROM virada_alunos WHERE virada_id = ?', [v.id]);
    for (const a of alunos) {
      await conn.query('UPDATE alunos SET turma_id = ?, status = ?, data_saida = ? WHERE id = ? AND colegio_id = ?',
        [a.turma_origem_id, a.status_origem, a.data_saida_origem, a.aluno_id, colegioId]);
    }
    const [rm] = await conn.query("DELETE FROM mensalidades WHERE colegio_id = ? AND virada_id = ? AND status <> 'pago'", [colegioId, v.id]);
    const [criadas] = await conn.query('SELECT turma_id FROM virada_turmas WHERE virada_id = ? AND criada = 1', [v.id]);
    if (criadas.length) await conn.query('DELETE FROM turmas WHERE colegio_id = ? AND id IN (?)', [colegioId, criadas.map((x) => x.turma_id)]);
    if (Number(v.ano_letivo_anterior) !== Number(v.ano_para)) {
      await conn.query('UPDATE config_colegio SET ano_letivo = ?, valor_mensalidade = COALESCE(?, valor_mensalidade) WHERE colegio_id = ?',
        [v.ano_letivo_anterior, v.valor_novo === null ? null : v.valor_anterior, colegioId]);
    }
    await conn.query('UPDATE viradas SET desfeita_em = NOW(), desfeita_por = ? WHERE id = ?', [usuarioId, v.id]);
    return { alunos: alunos.length, mensalidades: rm.affectedRows, turmas: criadas.length, anoLetivo: Number(v.ano_letivo_anterior) };
  });
}

/* Para histórico, boletim e portal: turmas de anos anteriores em que o aluno esteve (viradas não desfeitas). */
const SQL_TURMAS_DA_VIRADA = `SELECT va.turma_origem_id FROM virada_alunos va JOIN viradas vv ON vv.id = va.virada_id
  WHERE va.aluno_id = ? AND vv.desfeita_em IS NULL AND va.turma_origem_id IS NOT NULL`;

module.exports = {
  SEQUENCIA, ACOES, proximaSerie, nomeProximo, resultadoDe, acaoSugerida,
  previa, executar, desfazer, historicoViradas, SQL_TURMAS_DA_VIRADA
};
