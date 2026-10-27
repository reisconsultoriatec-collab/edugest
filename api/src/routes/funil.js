'use strict';
/* =====================================================================
 *  /api/funil — funil de matrículas   [módulo funil]
 *
 *  GET    /opcoes                       etapas, origens, motivos, séries, turmas, formulário
 *  GET    /resumo                       novos, contatos para hoje e atrasados (menu e Dashboard)
 *  GET    /leads                        interessados (filtros: etapa, origem, série, ano, busca)
 *  POST   /leads                        novo interessado (cadastrado pela equipe)
 *  GET    /leads/:id                    ficha + histórico de contatos (marca como visto)
 *  PUT    /leads/:id                    altera os dados
 *  DELETE /leads/:id                    exclui (e o histórico)
 *  POST   /leads/:id/etapa              muda a etapa (perdido pede motivo; matriculado só por /matricular)
 *  POST   /leads/:id/interacoes         anotação ou contato feito (+ próximo contato)
 *  POST   /leads/:id/matricular         cria o aluno (ou vincula um já cadastrado) e, se pedido,
 *                                       gera as mensalidades do ano   [precisa de alunos / mensalidades]
 *  GET    /indicadores                  números da captação
 *  GET    /formulario · PUT (admin)     formulário público de interesse
 *  POST   /formulario/novo-link (admin) troca o link (o antigo para de funcionar)
 * ===================================================================== */
const router = require('express').Router();
const { query, queryUm, transacao } = require('../db');
const { exigirModulo } = require('../middleware/auth');
const { HttpErro, assincrono } = require('../middleware/erros');
const v = require('../utils/validar');
const { atividade } = require('../utils/auditoria');
const { hojeSP, agoraSP, dataValida } = require('../utils/datas');
const F = require('../services/funil');
const fin = require('../services/financeiro');
const { lerAluno, inserirAluno } = require('../services/matricula');
const { urlBase } = require('../services/secretaria');

const modulo = exigirModulo('funil');
const soAdmin = (req, res, next) => (req.perfil === 'admin'
  ? next() : next(new HttpErro(403, 'Somente o administrador pode fazer isso', 'perfil')));
const pode = (req, m) => req.perfil === 'admin' || (req.modulos || []).includes(m);

const dataOpc = (x, campo, { futuro = true } = {}) => {
  if (x === undefined || x === null || x === '') return null;
  const s = String(x).slice(0, 10);
  if (!dataValida(s)) throw new HttpErro(400, `${campo} inválida`, 'validacao');
  if (!futuro && s > hojeSP()) throw new HttpErro(400, `${campo} inválida`, 'validacao');
  return s;
};
const dataHoraOpc = (x, campo) => {
  if (x === undefined || x === null || x === '') return null;
  const m = String(x).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (!m || !dataValida(m[1]) || Number(m[2]) > 23 || Number(m[3]) > 59) throw new HttpErro(400, `${campo} inválida`, 'validacao');
  return `${m[1]} ${m[2]}:${m[3]}:00`;
};
const dataHoraBR = (s) => (s ? `${String(s).slice(8, 10)}/${String(s).slice(5, 7)} às ${String(s).slice(11, 16)}` : '');

function lerLead(b) {
  b = b || {};
  return {
    nome_aluno: v.texto(b.nomeAluno, 'Nome do aluno', { max: 100, min: 2, obrigatorio: true }),
    nascimento: dataOpc(b.nascimento, 'Data de nascimento', { futuro: false }),
    serie_pretendida: v.texto(b.serie, 'Série pretendida', { max: 40 }),
    ano_pretendido: v.inteiro(b.ano, 'Ano letivo pretendido', { min: 2000, max: 2100 }),
    turno_pretendido: v.umDe(b.turno || null, Object.keys(F.TURNOS), 'Turno', { obrigatorio: false }),
    responsavel: v.texto(b.responsavel, 'Responsável', { max: 100 }),
    telefone: v.telefone(b.telefone, 'Telefone'),
    email: v.email(b.email, 'E-mail'),
    origem: v.texto(b.origem, 'Origem', { max: 40 }),
    obs: v.texto(b.obs, 'Observação', { max: 500 }),
    proximo_contato: dataOpc(b.proximoContato, 'Próximo contato')
  };
}

const SELECT_LEAD = `SELECT l.*, a.nome AS aluno_nome FROM leads l LEFT JOIN alunos a ON a.id = l.aluno_id`;

async function buscarLead(colegioId, id) {
  const l = await queryUm(`${SELECT_LEAD} WHERE l.id = ? AND l.colegio_id = ?`, [v.id(id), colegioId]);
  if (!l) throw new HttpErro(404, 'Interessado não encontrado', 'nao_encontrado');
  return l;
}

async function configFormulario(colegioId) {
  const c = await queryUm('SELECT ativo, token, titulo, mensagem FROM funil_config WHERE colegio_id = ?', [colegioId]);
  return c
    ? { ativo: !!Number(c.ativo), titulo: c.titulo, mensagem: c.mensagem, url: `${urlBase()}/interesse.html?c=${c.token}` }
    : { ativo: false, titulo: null, mensagem: null, url: null };
}

/* ---------------- Opções e resumo ---------------- */
router.get('/opcoes', modulo, assincrono(async (req, res) => {
  const [cfg, turmas, form] = await Promise.all([
    queryUm('SELECT ano_letivo, valor_mensalidade, dia_vencimento FROM config_colegio WHERE colegio_id = ?', [req.colegioId]),
    query('SELECT id, nome, serie, periodo, ano_letivo FROM turmas WHERE colegio_id = ? AND ativo = 1 ORDER BY ano_letivo DESC, nome', [req.colegioId]),
    configFormulario(req.colegioId)
  ]);
  const doColegio = [...new Set(turmas.map((t) => t.serie).filter(Boolean))];
  const series = [...F.SERIES.filter((s) => doColegio.includes(s)), ...doColegio.filter((s) => !F.SERIES.includes(s))];
  res.json({
    etapas: F.ETAPAS, origens: F.ORIGENS, motivos: F.MOTIVOS, turnos: F.TURNOS,
    series: series.length ? series : F.SERIES,
    anoLetivo: cfg ? Number(cfg.ano_letivo) : Number(hojeSP().slice(0, 4)),
    turmas: turmas.map((t) => ({ id: t.id, nome: t.nome, serie: t.serie, periodo: t.periodo, anoLetivo: Number(t.ano_letivo) })),
    mensalidade: { valor: cfg ? Number(cfg.valor_mensalidade) : 0, diaVencimento: cfg ? Number(cfg.dia_vencimento) : 10 },
    podeMatricular: pode(req, 'alunos'), podeMensalidades: pode(req, 'mensalidades'), admin: req.perfil === 'admin',
    formulario: form
  });
}));

router.get('/resumo', modulo, assincrono(async (req, res) => {
  const hoje = hojeSP();
  const r = await queryUm(
    `SELECT COALESCE(SUM(etapa IN ('lead','visita','proposta')), 0) AS ativos,
            COALESCE(SUM(etapa IN ('lead','visita','proposta') AND visto_em IS NULL), 0) AS novos,
            COALESCE(SUM(etapa IN ('lead','visita','proposta') AND proximo_contato = ?), 0) AS hoje,
            COALESCE(SUM(etapa IN ('lead','visita','proposta') AND proximo_contato < ?), 0) AS atrasados,
            COALESCE(SUM(etapa = 'visita' AND DATE(visita_em) = ?), 0) AS visitas
       FROM leads WHERE colegio_id = ?`,
    [hoje, hoje, hoje, req.colegioId]
  );
  const n = (k) => Number(r[k] || 0);
  res.json({ ativos: n('ativos'), novos: n('novos'), contatosHoje: n('hoje'), atrasados: n('atrasados'), visitasHoje: n('visitas') });
}));

/* ---------------- Interessados ---------------- */
router.get('/leads', modulo, assincrono(async (req, res) => {
  const cond = ['l.colegio_id = ?'];
  const params = [req.colegioId];
  if (req.query.etapa) { cond.push('l.etapa = ?'); params.push(v.umDe(req.query.etapa, Object.keys(F.ETAPAS), 'Etapa')); }
  if (req.query.origem) { cond.push('l.origem = ?'); params.push(v.texto(req.query.origem, 'Origem', { max: 40 })); }
  if (req.query.serie) { cond.push('l.serie_pretendida = ?'); params.push(v.texto(req.query.serie, 'Série', { max: 40 })); }
  const ano = v.inteiro(req.query.ano, 'Ano', { min: 2000, max: 2100 });
  if (ano) { cond.push('l.ano_pretendido = ?'); params.push(ano); }
  const busca = v.texto(req.query.busca, 'Busca', { max: 100 });
  if (busca) {
    const termo = `%${busca.replace(/[%_\\]/g, '\\$&')}%`;
    const ou = ['l.nome_aluno LIKE ?', 'l.responsavel LIKE ?', 'l.email LIKE ?'];
    params.push(termo, termo, termo);
    // telefone: todos os dígitos digitados, em ordem, com ou sem máscara
    const dig = F.digitos(busca);
    if (dig.length >= 4) { ou.push('l.telefone LIKE ?'); params.push(`%${dig.split('').join('%')}%`); }
    cond.push(`(${ou.join(' OR ')})`);
  }
  const linhas = await query(`${SELECT_LEAD} WHERE ${cond.join(' AND ')} ORDER BY l.etapa_em DESC, l.id DESC LIMIT 3000`, params);
  const hoje = hojeSP();
  const anos = await query('SELECT DISTINCT ano_pretendido AS ano FROM leads WHERE colegio_id = ? AND ano_pretendido IS NOT NULL ORDER BY ano DESC', [req.colegioId]);
  res.json({ leads: linhas.map((l) => F.formatar(l, hoje)), anos: anos.map((x) => Number(x.ano)) });
}));

router.post('/leads', modulo, assincrono(async (req, res) => {
  const d = lerLead(req.body);
  const agora = agoraSP();
  const r = await query(
    `INSERT INTO leads (colegio_id, nome_aluno, nascimento, serie_pretendida, ano_pretendido, turno_pretendido, responsavel, telefone,
                        email, origem, obs, proximo_contato, etapa, etapa_em, visto_em, criado_por, atualizado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'lead', ?, ?, ?, ?)`,
    [req.colegioId, d.nome_aluno, d.nascimento, d.serie_pretendida, d.ano_pretendido, d.turno_pretendido, d.responsavel, d.telefone,
      d.email, d.origem, d.obs, d.proximo_contato, agora, agora, req.usuario.id, req.usuario.id]
  );
  await F.anotar(null, req.colegioId, r.insertId, 'sistema', `Cadastrado por ${req.usuario.nome || 'equipe'}${d.origem ? ` · origem: ${d.origem}` : ''}`, req.usuario);
  await atividade(req.colegioId, req.usuario.id, `Funil: novo interessado ${d.nome_aluno}${d.serie_pretendida ? ` (${d.serie_pretendida})` : ''}`);
  res.status(201).json(F.formatar(await buscarLead(req.colegioId, r.insertId)));
}));

router.get('/leads/:id', modulo, assincrono(async (req, res) => {
  const l = await buscarLead(req.colegioId, req.params.id);
  if (!l.visto_em) await query('UPDATE leads SET visto_em = ? WHERE id = ?', [agoraSP(), l.id]);
  const interacoes = await query(
    'SELECT id, tipo, texto, usuario_nome, criado_em FROM lead_interacoes WHERE lead_id = ? AND colegio_id = ? ORDER BY criado_em DESC, id DESC LIMIT 200',
    [l.id, req.colegioId]
  );
  res.json({
    ...F.formatar(l), novo: false,
    interacoes: interacoes.map((x) => ({ id: x.id, tipo: x.tipo, texto: x.texto, autor: x.usuario_nome, em: x.criado_em }))
  });
}));

router.put('/leads/:id', modulo, assincrono(async (req, res) => {
  const l = await buscarLead(req.colegioId, req.params.id);
  const d = lerLead(req.body);
  await query(
    `UPDATE leads SET nome_aluno = ?, nascimento = ?, serie_pretendida = ?, ano_pretendido = ?, turno_pretendido = ?, responsavel = ?,
            telefone = ?, email = ?, origem = ?, obs = ?, proximo_contato = ?, atualizado_por = ? WHERE id = ?`,
    [d.nome_aluno, d.nascimento, d.serie_pretendida, d.ano_pretendido, d.turno_pretendido, d.responsavel, d.telefone, d.email,
      d.origem, d.obs, d.proximo_contato, req.usuario.id, l.id]
  );
  res.json(F.formatar(await buscarLead(req.colegioId, l.id)));
}));

router.delete('/leads/:id', modulo, assincrono(async (req, res) => {
  const l = await buscarLead(req.colegioId, req.params.id);
  await query('DELETE FROM leads WHERE id = ? AND colegio_id = ?', [l.id, req.colegioId]);
  await atividade(req.colegioId, req.usuario.id, `Funil: interessado excluído (${l.nome_aluno})`);
  res.status(204).end();
}));

router.post('/leads/:id/etapa', modulo, assincrono(async (req, res) => {
  const l = await buscarLead(req.colegioId, req.params.id);
  const b = req.body || {};
  if (l.aluno_id || l.etapa === 'matriculado') throw new HttpErro(409, 'Este interessado já foi matriculado', 'matriculado');
  const etapa = v.umDe(b.etapa, Object.keys(F.ETAPAS), 'Etapa');
  if (etapa === 'matriculado') throw new HttpErro(409, 'Para matricular, use o botão Matricular (ele cria o aluno)', 'usar_matricular');
  const motivo = etapa === 'perdido' ? v.texto(b.motivo, 'Motivo da perda', { max: 60, obrigatorio: true }) : null;
  const visita = etapa === 'visita' ? dataHoraOpc(b.visitaEm, 'Data da visita') : null;
  let proximo = b.proximoContato !== undefined ? dataOpc(b.proximoContato, 'Próximo contato') : (l.proximo_contato ? String(l.proximo_contato).slice(0, 10) : null);
  if (visita && b.proximoContato === undefined) proximo = visita.slice(0, 10);
  if (etapa === 'perdido') proximo = null;
  const agora = agoraSP();
  const mudou = etapa !== l.etapa;
  await query(
    `UPDATE leads SET etapa = ?, etapa_em = ?, motivo_perda = ?, visita_em = ?, proximo_contato = ?, visto_em = COALESCE(visto_em, ?), atualizado_por = ?
      WHERE id = ?`,
    [etapa, mudou ? agora : (l.etapa_em || agora), motivo, etapa === 'visita' ? (visita || l.visita_em || null) : l.visita_em, proximo, agora, req.usuario.id, l.id]
  );
  let texto = mudou ? `Etapa: ${F.ETAPAS[l.etapa]} → ${F.ETAPAS[etapa]}` : `Etapa mantida: ${F.ETAPAS[etapa]}`;
  if (visita) texto += ` · visita em ${dataHoraBR(visita)}`;
  if (motivo) texto += ` · motivo: ${motivo}`;
  await F.anotar(null, req.colegioId, l.id, 'etapa', texto, req.usuario);
  res.json(F.formatar(await buscarLead(req.colegioId, l.id)));
}));

router.post('/leads/:id/interacoes', modulo, assincrono(async (req, res) => {
  const l = await buscarLead(req.colegioId, req.params.id);
  const b = req.body || {};
  const tipo = v.umDe(b.tipo || 'nota', ['nota', 'contato'], 'Tipo');
  const texto = v.texto(b.texto, 'Anotação', { max: 600, obrigatorio: true });
  if (b.proximoContato !== undefined) {
    await query('UPDATE leads SET proximo_contato = ?, atualizado_por = ? WHERE id = ?', [dataOpc(b.proximoContato, 'Próximo contato'), req.usuario.id, l.id]);
  }
  await query('UPDATE leads SET visto_em = COALESCE(visto_em, ?) WHERE id = ?', [agoraSP(), l.id]);
  await F.anotar(null, req.colegioId, l.id, tipo, texto, req.usuario);
  res.status(201).json(F.formatar(await buscarLead(req.colegioId, l.id)));
}));

/* ---------------- Matrícula ---------------- */
router.post('/leads/:id/matricular', modulo, assincrono(async (req, res) => {
  if (!pode(req, 'alunos')) throw new HttpErro(403, 'Para matricular é preciso ter acesso ao cadastro de alunos', 'modulo');
  const l = await buscarLead(req.colegioId, req.params.id);
  if (l.aluno_id || l.etapa === 'matriculado') throw new HttpErro(409, 'Este interessado já foi matriculado', 'matriculado');
  const b = req.body || {};
  const existenteId = v.inteiro(b.alunoExistenteId, 'Aluno', { min: 1 });
  const m = b.mensalidades || {};
  const gerar = !!m.gerar;
  if (gerar && !pode(req, 'mensalidades')) throw new HttpErro(403, 'Para gerar mensalidades é preciso ter acesso às Mensalidades', 'modulo');

  let dados = null; let turma = null; let existente = null;
  if (existenteId) {
    existente = await queryUm(
      `SELECT a.id, a.nome, a.ra, a.codigo_acesso, a.resp_nome, a.resp_telefone, a.turma_id, a.status,
              t.nome AS turma_nome, t.ano_letivo
         FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id WHERE a.id = ? AND a.colegio_id = ?`,
      [existenteId, req.colegioId]
    );
    if (!existente) throw new HttpErro(400, 'Aluno não encontrado', 'validacao');
    const ja = await queryUm("SELECT id FROM leads WHERE aluno_id = ? AND colegio_id = ? AND etapa = 'matriculado'", [existente.id, req.colegioId]);
    if (ja) throw new HttpErro(409, `${existente.nome} já está ligado(a) a outro interessado do funil`, 'duplicado');
    if (existente.turma_id) turma = { id: existente.turma_id, nome: existente.turma_nome, ano_letivo: existente.ano_letivo };
  } else {
    dados = lerAluno({ ...(b.aluno || {}), status: 'ativo' });
    if (!dados.turma_id) throw new HttpErro(400, 'Escolha a turma do aluno', 'validacao');
    turma = await queryUm('SELECT id, nome, ano_letivo FROM turmas WHERE id = ? AND colegio_id = ?', [dados.turma_id, req.colegioId]);
    if (!turma) throw new HttpErro(400, 'Turma inválida', 'validacao');
  }

  let plano = null;
  if (gerar) {
    if (!turma) throw new HttpErro(400, 'O aluno precisa estar numa turma para gerar as mensalidades do ano', 'validacao');
    plano = {
      ano: Number(turma.ano_letivo),
      ini: v.inteiro(m.mesInicial, 'Mês inicial', { min: 1, max: 12, obrigatorio: true }),
      fim: v.inteiro(m.mesFinal, 'Mês final', { min: 1, max: 12, obrigatorio: true }),
      dia: v.inteiro(m.diaVencimento, 'Dia de vencimento', { min: 1, max: 28, obrigatorio: true }),
      valor: v.decimal(m.valor, 'Valor da mensalidade', { min: 0.01, max: 99999, obrigatorio: true })
    };
    if (plano.fim < plano.ini) throw new HttpErro(400, 'O mês final não pode ser anterior ao inicial', 'validacao');
  }

  const hoje = hojeSP();
  let r = null;
  for (let tentativa = 0; tentativa < 5 && !r; tentativa++) {
    try {
      r = await transacao(async (conn) => {
        const aluno = existente
          ? { id: existente.id, ra: existente.ra, codigo: existente.codigo_acesso, nome: existente.nome, respNome: existente.resp_nome, respTelefone: existente.resp_telefone }
          : { ...(await inserirAluno(conn, req.colegioId, dados, { docs: { data_matricula: hoje } })), nome: dados.nome, respNome: dados.resp_nome, respTelefone: dados.resp_telefone };
        const men = { geradas: 0, jaExistiam: 0, total: 0 };
        if (plano) {
          const [bolsas] = await conn.query('SELECT id, percentual, vigencia_inicio, vigencia_fim, ativo FROM bolsas WHERE aluno_id = ? AND colegio_id = ?', [aluno.id, req.colegioId]);
          const [existentes] = await conn.query('SELECT referencia FROM mensalidades WHERE aluno_id = ? AND colegio_id = ?', [aluno.id, req.colegioId]);
          const jaTem = new Set(existentes.map((x) => x.referencia));
          const novas = [];
          for (let mes = plano.ini; mes <= plano.fim; mes++) {
            const ref = `${plano.ano}-${String(mes).padStart(2, '0')}`;
            if (jaTem.has(ref)) { men.jaExistiam++; continue; }
            const venc = `${ref}-${String(plano.dia).padStart(2, '0')}`;
            const bolsa = fin.bolsaVigente(bolsas, venc);
            const val = fin.calcularValores(plano.valor, bolsa ? bolsa.percentual : 0);
            if (val.valor === 0) continue;
            novas.push([req.colegioId, aluno.id, ref, venc, plano.valor, val.desconto, val.valor, bolsa ? bolsa.id : null]);
            men.geradas++; men.total += fin.centavos(val.valor);
          }
          if (novas.length) {
            await conn.query('INSERT INTO mensalidades (colegio_id, aluno_id, referencia, vencimento, valor_bruto, desconto, valor, bolsa_id) VALUES ?', [novas]);
          }
          men.total /= 100;
        }
        await conn.query(
          "UPDATE leads SET etapa = 'matriculado', etapa_em = ?, aluno_id = ?, proximo_contato = NULL, motivo_perda = NULL, visto_em = COALESCE(visto_em, ?), atualizado_por = ? WHERE id = ?",
          [agoraSP(), aluno.id, agoraSP(), req.usuario.id, l.id]
        );
        const texto = `Matriculado(a): ${aluno.nome} · RA ${aluno.ra}${turma ? ` · turma ${turma.nome}` : ''}${existente ? ' (aluno já cadastrado)' : ''}`
          + `${men.geradas ? ` · ${men.geradas} mensalidade(s) gerada(s)` : ''}`;
        await F.anotar((sql, p) => conn.query(sql, p), req.colegioId, l.id, 'etapa', texto, req.usuario);
        return { aluno, mensalidades: men };
      });
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY' || tentativa === 4) throw e;
    }
  }
  if (!existente) await atividade(req.colegioId, req.usuario.id, `Aluno cadastrado: ${r.aluno.nome} (RA ${r.aluno.ra}) · matrícula pelo funil`);
  await atividade(req.colegioId, req.usuario.id, `Funil: ${l.nome_aluno} matriculado(a)${r.mensalidades.geradas ? ` · ${r.mensalidades.geradas} mensalidade(s) gerada(s)` : ''}`);
  res.status(201).json({
    aluno: { id: r.aluno.id, nome: r.aluno.nome, ra: r.aluno.ra, codigoAcesso: r.aluno.codigo, respNome: r.aluno.respNome, respTelefone: r.aluno.respTelefone },
    turma: turma ? { id: turma.id, nome: turma.nome, anoLetivo: Number(turma.ano_letivo) } : null,
    mensalidades: r.mensalidades
  });
}));

/* ---------------- Indicadores ---------------- */
router.get('/indicadores', modulo, assincrono(async (req, res) => {
  const ano = v.inteiro(req.query.ano, 'Ano', { min: 2000, max: 2100 });
  const linhas = await query(
    `SELECT etapa, origem, serie_pretendida, motivo_perda, criado_em, etapa_em, atualizado_em FROM leads
      WHERE colegio_id = ?${ano ? ' AND ano_pretendido = ?' : ''}`,
    ano ? [req.colegioId, ano] : [req.colegioId]
  );
  res.json(F.indicadores(linhas));
}));

/* ---------------- Formulário público ---------------- */
router.get('/formulario', modulo, assincrono(async (req, res) => {
  res.json(await configFormulario(req.colegioId));
}));

router.put('/formulario', modulo, soAdmin, assincrono(async (req, res) => {
  const b = req.body || {};
  const d = {
    ativo: b.ativo ? 1 : 0,
    titulo: v.texto(b.titulo, 'Título', { max: 120 }),
    mensagem: v.texto(b.mensagem, 'Mensagem', { max: 500 })
  };
  const atual = await queryUm('SELECT colegio_id FROM funil_config WHERE colegio_id = ?', [req.colegioId]);
  if (atual) {
    await query('UPDATE funil_config SET ativo = ?, titulo = ?, mensagem = ?, atualizado_por = ? WHERE colegio_id = ?',
      [d.ativo, d.titulo, d.mensagem, req.usuario.id, req.colegioId]);
  } else {
    await query('INSERT INTO funil_config (colegio_id, ativo, token, titulo, mensagem, atualizado_por) VALUES (?, ?, ?, ?, ?, ?)',
      [req.colegioId, d.ativo, F.novoToken(), d.titulo, d.mensagem, req.usuario.id]);
  }
  await atividade(req.colegioId, req.usuario.id, `Formulário de interesse ${d.ativo ? 'ligado' : 'desligado'}`);
  res.json(await configFormulario(req.colegioId));
}));

router.post('/formulario/novo-link', modulo, soAdmin, assincrono(async (req, res) => {
  const atual = await queryUm('SELECT colegio_id FROM funil_config WHERE colegio_id = ?', [req.colegioId]);
  if (!atual) throw new HttpErro(409, 'Ligue o formulário primeiro', 'sem_formulario');
  await query('UPDATE funil_config SET token = ?, atualizado_por = ? WHERE colegio_id = ?', [F.novoToken(), req.usuario.id, req.colegioId]);
  await atividade(req.colegioId, req.usuario.id, 'Formulário de interesse: link trocado (o anterior parou de funcionar)');
  res.json(await configFormulario(req.colegioId));
}));

module.exports = router;
