/* =====================================================================
 *  EduGest — Virada do ano letivo (rematrícula)            [somente admin]
 *  1. Turmas        para cada turma do ano que termina: criar a turma do
 *                   ano novo (série seguinte), usar uma que já existe ou
 *                   não continuar
 *  2. Alunos        promover / reter / concluir / sair / decidir depois,
 *                   com a situação calculada pelas notas e frequência
 *  3. Mensalidades  do ano novo
 *  4. Conferir      →  POST /api/virada (tudo ou nada)
 *  Nada é gravado antes do passo 4. A última virada pode ser desfeita
 *  enquanto o ano novo não tiver movimento.
 * ===================================================================== */
'use strict';
(function (EG) {
  const SEQUENCIA = ['Berçário', 'Maternal I', 'Maternal II', 'Infantil I', 'Infantil II', 'Infantil III',
    '1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano', '6º Ano', '7º Ano', '8º Ano', '9º Ano',
    '1ª Série EM', '2ª Série EM', '3ª Série EM'];
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  /** Mesma comparação de séries da API: sem acento, º/ª/°, "o"/"a" de ordinal e o "EM" do fim. */
  const chave = (s) => semAcento(s).toLowerCase().replace(/[º°ª]/g, '').replace(/(\d)[oa](?=\s|$)/g, '$1')
    .replace(/\bensino medio\b|\bem$/g, '').replace(/\s+/g, ' ').trim();
  const chaveNome = (s) => semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim();

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

  const SITUACAO = {
    aprovado: ['selo-ok', 'Aprovado'],
    recuperacao: ['selo-aviso', 'Em recuperação'],
    frequencia_insuficiente: ['selo-erro', 'Frequência baixa'],
    em_curso: ['selo-neutro', 'Notas incompletas'],
    sem_notas: ['selo-neutro', 'Sem notas lançadas']
  };
  const ACOES = [['promover', 'Promover'], ['reter', 'Reter (repete a série)'], ['concluir', 'Concluiu o curso'], ['sair', 'Sai da escola'], ['manter', 'Decidir depois']];
  const ACOES_SEM = [['enturmar', 'Colocar numa turma'], ['sair', 'Sai da escola'], ['manter', 'Decidir depois']];
  const NOME_ACAO = Object.fromEntries([...ACOES, ...ACOES_SEM]);
  const CURTO = { promover: 'promover', reter: 'reter', concluir: 'concluem', sair: 'saem', manter: 'decidir depois', enturmar: 'enturmar' };
  const PRECISA_TURMA = ['promover', 'reter', 'enturmar'];
  const PASSOS = ['Turmas', 'Alunos', 'Mensalidades', 'Conferir'];

  let st = null;          // estado da tela (prévia + escolhas)
  let anoPedido = null;   // null = a API escolhe (virada nova ou alunos pendentes)
  let cacheDestinos = null;

  const opcoes = (lista, atual) => lista.map(([v, l]) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${l}</option>`).join('');
  const pct = (x) => `${String(Math.round(Number(x) * 10) / 10).replace('.', ',')}%`;
  const numero = (v) => Number(String(v ?? '').replace(',', '.'));
  const kpi = (icone, fundo, cor, rotulo, valor, obs) => `<div class="kpi"><div class="kpi-icone" style="background:${fundo};color:${cor}"><i class="ti ${icone}"></i></div>
    <div><div class="kpi-rotulo">${rotulo}</div><div class="kpi-valor" style="font-size:22px">${EG.esc(valor)}</div><div class="kpi-obs">${EG.esc(obs)}</div></div></div>`;

  /* ---------------- Estado ---------------- */
  function iniciarEstado(p, el) {
    const turmas = new Map();
    p.turmas.forEach((t) => {
      const pr = t.proposta || {};
      turmas.set(t.id, {
        acao: pr.acao || 'criar',
        nome: pr.nome || nomeProximo(t.nome, t.serie, t.proximaSerie || pr.serie),
        serie: pr.serie || t.proximaSerie || t.serie,
        periodo: pr.periodo || t.periodo,
        capacidade: pr.capacidade || t.capacidade || 35,
        destinoId: pr.destinoId ? String(pr.destinoId) : '',
        copiarProfessores: true
      });
    });
    const alunos = new Map();
    p.turmas.forEach((t) => t.alunos.forEach((a) => alunos.set(a.id, { acao: a.sugestao, destino: '' })));
    const sem = new Map(p.semTurma.map((a) => [a.id, { acao: 'manter', destino: '' }]));
    // Ano novo já começou (virada feita em janeiro ou alunos pendentes): cobra a partir do mês atual
    const hoje = EG.hojeSP();
    const mesInicial = Number(hoje.slice(0, 4)) === p.anoPara ? Number(hoje.slice(5, 7)) : 1;
    cacheDestinos = null;
    return {
      el, p, passo: 1, turmas, alunos, sem, filtro: '', resultado: null,
      fin: { gerar: p.config.valorMensalidade > 0, valor: p.config.valorMensalidade || '', mesInicial, mesFinal: 12, dia: p.config.diaVencimento || 10, salvarPadrao: true }
    };
  }

  /** Turmas que entram na virada: com alunos ou (virada nova) ativas mesmo vazias. */
  const visiveis = () => st.p.turmas.filter((t) => t.alunos.length || (st.p.modo === 'nova' && t.ativo !== false));
  const turmaDe = (id) => st.p.turmas.find((t) => t.id === id);

  /** Turmas do ano novo que podem receber alunos: as que serão criadas e as que já existem. */
  function destinos() {
    if (cacheDestinos) return cacheDestinos;
    const lista = [];
    visiveis().forEach((t) => {
      const pl = st.turmas.get(t.id);
      if (pl.acao === 'criar') {
        lista.push({ valor: `nova:${t.id}`, nome: String(pl.nome || '').trim() || `(nova, de ${t.nome})`, serie: pl.serie, capacidade: Number(pl.capacidade) || 35, ocupados: 0, nova: true, origem: t });
      }
    });
    st.p.turmasExistentes.forEach((t) => lista.push({ valor: String(t.id), nome: t.nome, serie: t.serie, capacidade: t.capacidade, ocupados: t.alunos || 0, nova: false }));
    lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
    return (cacheDestinos = lista);
  }
  const mudouTurmas = () => { cacheDestinos = null; };
  const nomeDestino = (valor) => (destinos().find((d) => d.valor === valor) || {}).nome || '';

  function destinoDaTurma(t) {
    const pl = st.turmas.get(t.id);
    if (pl.acao === 'criar') return `nova:${t.id}`;
    if (pl.acao === 'existente') return pl.destinoId || '';
    return '';
  }
  /** Retido: turma do ano novo da mesma série (de preferência com o mesmo nome). */
  function destinoRetido(t) {
    const ds = destinos().filter((d) => chave(d.serie) === chave(t.serie));
    return (ds.find((d) => chaveNome(d.nome) === chaveNome(t.nome)) || ds[0] || { valor: '' }).valor;
  }
  function destinoEfetivo(s, t) {
    if (!PRECISA_TURMA.includes(s.acao)) return '';
    if (s.destino && destinos().some((d) => d.valor === s.destino)) return s.destino;
    if (s.acao === 'promover' && t) return destinoDaTurma(t);
    if (s.acao === 'reter' && t) return destinoRetido(t);
    return '';
  }

  function contagens() {
    const c = { promover: 0, reter: 0, concluir: 0, sair: 0, manter: 0, enturmar: 0, semTurmaManter: 0, devedores: 0 };
    visiveis().forEach((t) => t.alunos.forEach((a) => {
      const s = st.alunos.get(a.id);
      c[s.acao] += 1;
      if (a.emAberto && PRECISA_TURMA.includes(s.acao)) c.devedores += 1;
    }));
    st.p.semTurma.forEach((a) => {
      const s = st.sem.get(a.id);
      if (s.acao === 'manter') c.semTurmaManter += 1; else c[s.acao] += 1;
      if (a.emAberto && PRECISA_TURMA.includes(s.acao)) c.devedores += 1;
    });
    c.turmasNovas = visiveis().filter((t) => st.turmas.get(t.id).acao === 'criar').length;
    c.vaoParaTurma = c.promover + c.reter + c.enturmar;
    c.depois = c.manter + c.semTurmaManter;
    return c;
  }
  /** Quantos alunos entram em cada turma do ano novo. */
  function ocupacao() {
    const m = new Map();
    const somar = (v) => { if (v) m.set(v, (m.get(v) || 0) + 1); };
    visiveis().forEach((t) => t.alunos.forEach((a) => somar(destinoEfetivo(st.alunos.get(a.id), t))));
    st.p.semTurma.forEach((a) => somar(destinoEfetivo(st.sem.get(a.id), null)));
    return m;
  }
  const mesesCobrados = () => Math.max(0, Number(st.fin.mesFinal) - Number(st.fin.mesInicial) + 1);
  function novoValorPadrao() {
    const p = st.p, f = st.fin;
    if (p.modo !== 'nova' || !f.gerar || !f.salvarPadrao) return null;
    const v = numero(f.valor);
    return v > 0 && v !== p.config.valorMensalidade ? v : null;
  }
  function textoResumo(r) {
    return [r.promovidos && `${r.promovidos} promovido(s)`, r.retidos && `${r.retidos} retido(s)`, r.concluidos && `${r.concluidos} concluinte(s)`,
      r.sairam && `${r.sairam} saída(s)`, r.enturmados && `${r.enturmados} enturmado(s)`, r.turmasCriadas && `${r.turmasCriadas} turma(s) criada(s)`,
      r.mensalidades && `${r.mensalidades} mensalidade(s)`].filter(Boolean).join(' · ') || 'sem alterações';
  }

  /* ---------------- Cabeçalho e histórico ---------------- */
  function cabecalho() {
    const p = st.p;
    const anos = p.anosPossiveis.length > 1
      ? `<div class="filtros" style="margin:0">${p.anosPossiveis.map((a) => `<button class="chip ${a === p.anoDe ? 'ativo' : ''}" data-action="ano" data-ano="${a}">${a} → ${a + 1}${a < p.anoLetivoAtual ? ' · pendentes' : ''}</button>`).join('')}</div>`
      : '';
    const desc = p.modo === 'nova'
      ? `Prepara ${p.anoPara}: cria as turmas, passa cada aluno para a turma nova e gera as mensalidades. Tudo de ${p.anoDe} continua guardado (notas, boletins, histórico escolar e financeiro). Nada é gravado até você confirmar no último passo.`
      : `A virada para ${p.anoPara} já foi feita. Aqui você resolve os alunos que ficaram em "Decidir depois" nas turmas de ${p.anoDe}: promover, reter, concluir ou registrar a saída.`;
    return `<div class="card virada-cab">
      <div class="card-cab" style="margin-bottom:10px">
        <div class="card-titulo"><i class="ti ti-calendar-repeat"></i> Virada do ano letivo</div>
        ${anos}
      </div>
      <div class="virada-anos"><span class="ano">${p.anoDe}</span><i class="ti ti-arrow-right"></i><span class="ano novo">${p.anoPara}</span>
        ${p.modo === 'complemento' ? '<span class="selo selo-aviso">alunos pendentes</span>' : ''}</div>
      <p class="sub virada-desc">${desc}</p>
      ${historico()}
    </div>`;
  }
  function historico() {
    const lista = st.p.viradas || [];
    if (!lista.length) return '';
    return `<details class="virada-hist">
      <summary><i class="ti ti-history"></i> Viradas já feitas (${lista.length})</summary>
      ${lista.map((v) => `<div class="virada-hist-item ${v.desfeitaEm ? 'desfeita' : ''}">
        <div><strong>${v.anoDe} → ${v.anoPara}</strong>${v.resumo && v.resumo.modo === 'complemento' ? ' <span class="selo selo-neutro">pendentes</span>' : ''}
          ${v.desfeitaEm ? ' <span class="selo selo-neutro">desfeita</span>' : ''}
          <span class="sub"> em ${EG.dataHora(v.feitaEm)}${v.por ? ` por ${EG.esc(v.por)}` : ''}</span><br>
          <small>${EG.esc(textoResumo(v.resumo || {}))}</small>
          ${v.desfeitaEm ? `<br><small>Desfeita em ${EG.dataHora(v.desfeitaEm)}${v.desfeitaPor ? ` por ${EG.esc(v.desfeitaPor)}` : ''}</small>` : ''}
          ${v.bloqueio ? `<br><small>Não dá mais para desfazer: ${EG.esc(v.bloqueio)}</small>` : ''}
        </div>
        ${v.podeDesfazer ? `<button class="btn btn-secundario btn-pequeno" data-action="desfazer" data-id="${v.id}"><i class="ti ti-arrow-back-up"></i> Desfazer</button>` : ''}
      </div>`).join('')}
    </details>`;
  }

  /* ---------------- Passos ---------------- */
  function passos() {
    return `<ol class="imp-passos virada-passos">${PASSOS.map((r, k) => {
      const n = k + 1;
      return `<li class="${n === st.passo ? 'atual' : n < st.passo ? 'feito' : ''}"><button type="button" data-action="passo" data-passo="${n}" ${n === st.passo ? 'aria-current="step"' : ''}>
        <span>${n < st.passo ? '<i class="ti ti-check"></i>' : n}</span> ${r}</button></li>`;
    }).join('')}</ol>`;
  }
  function resumoCurto() {
    const c = contagens();
    return [c.turmasNovas && `${c.turmasNovas} turma(s) nova(s)`, c.vaoParaTurma && `${c.vaoParaTurma} em turmas de ${st.p.anoPara}`,
      c.concluir && `${c.concluir} concluem`, c.sair && `${c.sair} saem`, c.depois && `${c.depois} decidir depois`].filter(Boolean).join(' · ');
  }
  function rodape() {
    const n = st.passo;
    return `<div class="msg-erro" data-erro-virada hidden></div>
      <div class="virada-rodape-linha">
        <div class="virada-rodape-info" data-resumo>${resumoCurto()}</div>
        <div class="virada-rodape-botoes">
          ${n > 1 ? '<button class="btn btn-secundario" data-action="voltar"><i class="ti ti-arrow-left"></i> Voltar</button>' : ''}
          ${n < PASSOS.length
            ? `<button class="btn btn-primario" data-action="continuar">Continuar: ${PASSOS[n]} <i class="ti ti-arrow-right"></i></button>`
            : `<button class="btn btn-primario" data-action="confirmar"><i class="ti ti-calendar-repeat"></i> ${st.p.modo === 'nova' ? `Fazer a virada para ${st.p.anoPara}` : 'Confirmar as decisões'}</button>`}
        </div>
      </div>`;
  }
  const atualizarRodape = () => { const i = EG.$('[data-resumo]', st.el); if (i) i.textContent = resumoCurto(); };

  /* ---------- 1. Turmas ---------- */
  function corpoTurmas() {
    const p = st.p;
    const lista = visiveis();
    return `<div class="virada-titulo"><h3>Turmas de ${p.anoPara}</h3>
        <p class="sub">Para cada turma de ${p.anoDe}, diga para qual turma de ${p.anoPara} os alunos vão. O EduGest já propõe a série seguinte; ajuste nome, série, período e vagas se precisar.${p.turmasExistentes.length ? ` Já há ${p.turmasExistentes.length} turma(s) cadastrada(s) em ${p.anoPara}.` : ''}</p></div>
      <datalist id="vt-series">${SEQUENCIA.map((s) => `<option value="${s}">`).join('')}</datalist>
      ${lista.length ? `<div class="vt-lista">${lista.map(linhaTurma).join('')}</div>` : `<div class="vazio"><i class="ti ti-layout-grid"></i>Nenhuma turma de ${p.anoDe} com alunos.</div>`}`;
  }
  function linhaTurma(t) {
    const p = st.p;
    const pl = st.turmas.get(t.id);
    const acoes = [['criar', 'Criar turma nova'], ...(p.turmasExistentes.length ? [['existente', 'Usar uma turma que já existe']] : []), ['concluir', `Não continua em ${p.anoPara}`]];
    const campo = (c) => `name="vt-${c}" data-t="${t.id}" data-tc="${c}"`;
    let detalhe;
    if (pl.acao === 'criar') {
      detalhe = `<div class="vt-campos">
          <label class="vt-campo vt-nome"><span>Nome</span><input class="input" ${campo('nome')} maxlength="50" value="${EG.esc(pl.nome)}"></label>
          <label class="vt-campo"><span>Série</span><input class="input" ${campo('serie')} maxlength="30" list="vt-series" value="${EG.esc(pl.serie)}"></label>
          <label class="vt-campo"><span>Período</span><select class="select" ${campo('periodo')}>${EG.opcoes(Object.entries(EG.PERIODOS).map(([k, r]) => ({ value: k, label: r })), pl.periodo)}</select></label>
          <label class="vt-campo vt-vagas"><span>Vagas</span><input class="input" type="number" min="1" max="200" ${campo('capacidade')} value="${EG.esc(pl.capacidade)}"></label>
        </div>
        <label class="check-linha vt-copiar"><input type="checkbox" ${campo('copiarProfessores')} ${pl.copiarProfessores ? 'checked' : ''}>
          Copiar os professores${pl.periodo === t.periodo ? ' e a grade horária' : ''} de ${EG.esc(t.nome)}</label>`;
    } else if (pl.acao === 'existente') {
      detalhe = `<div class="vt-campos unico"><label class="vt-campo vt-nome"><span>Turma de ${p.anoPara}</span><select class="select" ${campo('destinoId')}>
          <option value="">Escolha a turma</option>${p.turmasExistentes.map((x) => `<option value="${x.id}" ${String(x.id) === String(pl.destinoId) ? 'selected' : ''}>${EG.esc(x.nome)} · ${EG.esc(x.serie)} (${x.alunos}/${x.capacidade})</option>`).join('')}
        </select></label></div>`;
    } else {
      const pr = t.proposta || {};
      const motivo = pr.acao === 'concluir' && pr.motivo === 'ultima_serie'
        ? `${EG.esc(t.serie)} é a última série: no próximo passo os alunos aparecem como <strong>concluintes</strong>.`
        : pr.acao === 'concluir' && pr.motivo === 'serie_nao_oferecida'
          ? `O colégio não tem turma de ${EG.esc(pr.serie)}. No próximo passo, escolha o que acontece com cada aluno (concluir, sair ou ir para outra turma). Se ${EG.esc(pr.serie)} vai abrir em ${p.anoPara}, escolha "Criar turma nova".`
          : `Os alunos não passam juntos para uma turma de ${p.anoPara}. No próximo passo, escolha o que acontece com cada um.`;
      detalhe = `<p class="vt-nota"><i class="ti ti-info-circle"></i> <span>${motivo}</span></p>`;
    }
    return `<div class="vt-linha" data-linha-turma="${t.id}">
      <div class="vt-de"><strong>${EG.esc(t.nome)}</strong>
        <small>${EG.esc(t.serie)} · ${EG.esc(EG.PERIODOS[t.periodo] || t.periodo)}</small>
        <small>${t.alunos.length} aluno(s)${t.ativo === false ? ' · turma inativa' : ''}</small></div>
      <div class="vt-seta" aria-hidden="true"><i class="ti ti-arrow-right"></i></div>
      <div class="vt-para">
        <select class="select vt-acao" ${campo('acao')} aria-label="${EG.esc(t.nome)} em ${p.anoPara}">${opcoes(acoes, pl.acao)}</select>
        ${detalhe}
      </div>
    </div>`;
  }
  function validarTurmas() {
    const p = st.p;
    const novas = new Map();
    const existentes = new Map(p.turmasExistentes.map((t) => [chaveNome(t.nome), t]));
    for (const t of visiveis()) {
      const pl = st.turmas.get(t.id);
      const alvo = (c) => `[data-t="${t.id}"][data-tc="${c}"]`;
      if (pl.acao === 'criar') {
        const nome = String(pl.nome || '').trim();
        if (!nome) return { msg: `Informe o nome da turma nova que recebe ${t.nome}.`, alvo: alvo('nome') };
        if (!String(pl.serie || '').trim()) return { msg: `Informe a série da turma nova que recebe ${t.nome}.`, alvo: alvo('serie') };
        const cap = Number(pl.capacidade);
        if (!(Number.isInteger(cap) && cap >= 1 && cap <= 200)) return { msg: `Vagas da turma ${nome}: de 1 a 200.`, alvo: alvo('capacidade') };
        const k = chaveNome(nome);
        if (existentes.has(k)) return { msg: `Já existe a turma "${existentes.get(k).nome}" em ${p.anoPara}. Em ${t.nome}, escolha "Usar uma turma que já existe" ou mude o nome.`, alvo: alvo('nome') };
        if (novas.has(k)) return { msg: `${novas.get(k)} e ${t.nome} iriam criar a mesma turma "${nome}". Mude um dos nomes; para juntar as duas, crie uma e, no passo Alunos, escolha a turma de cada aluno.`, alvo: alvo('nome') };
        novas.set(k, t.nome);
      } else if (pl.acao === 'existente' && !pl.destinoId) {
        return { msg: `Escolha a turma de ${p.anoPara} que recebe ${t.nome}.`, alvo: alvo('destinoId') };
      }
    }
    return null;
  }

  /* ---------- 2. Alunos ---------- */
  function precisaAtencao(t, a, s) {
    return ['recuperacao', 'frequencia_insuficiente', 'em_curso'].includes(a.situacao) || !!a.emAberto
      || (PRECISA_TURMA.includes(s.acao) && !destinoEfetivo(s, t));
  }
  function passaFiltro(t, a) {
    const s = st.alunos.get(a.id);
    if (st.filtro === 'atencao') return precisaAtencao(t, a, s);
    if (st.filtro === 'manter') return s.acao === 'manter';
    return true;
  }
  function chipsAlunos() {
    const p = st.p;
    let total = p.semTurma.length, atencao = p.semTurma.length, depois = 0;
    visiveis().forEach((t) => t.alunos.forEach((a) => {
      const s = st.alunos.get(a.id);
      total += 1;
      if (precisaAtencao(t, a, s)) atencao += 1;
      if (s.acao === 'manter') depois += 1;
    }));
    p.semTurma.forEach((a) => { if (st.sem.get(a.id).acao === 'manter') depois += 1; });
    return [['', `Todos (${total})`], ['atencao', `Precisam de atenção (${atencao})`], ['manter', `Decidir depois (${depois})`]].map(([k, r]) =>
      `<button class="chip ${st.filtro === k ? 'ativo' : ''}" data-action="filtro-alunos" data-filtro-alunos="${k}">${r}</button>`).join('');
  }
  const atualizarChips = () => { const c = EG.$('[data-chips-alunos]', st.el); if (c) c.innerHTML = chipsAlunos(); };
  function corpoAlunos() {
    const p = st.p;
    const lista = visiveis().filter((t) => t.alunos.length);
    const total = lista.reduce((n, t) => n + t.alunos.length, 0) + p.semTurma.length;
    const secoes = lista.map(secaoTurma).join('') + (p.semTurma.length ? secaoSemTurma() : '');
    return `<div class="virada-titulo"><h3>Alunos</h3>
        <p class="sub">A decisão já vem sugerida pelas notas e pela frequência de ${p.anoDe} (a mesma regra do boletim): aprovados são promovidos; quem está em recuperação, com frequência baixa ou com notas incompletas fica em <strong>Decidir depois</strong>. Quem fica em "Decidir depois" continua na turma de ${p.anoDe} e pode ser resolvido mais tarde, nesta mesma tela.</p></div>
      <div class="filtros" data-chips-alunos>${chipsAlunos()}</div>
      ${secoes.trim() || `<div class="vazio"><i class="ti ti-users"></i>${total ? 'Nenhum aluno neste filtro' : `Nenhum aluno ativo nas turmas de ${p.anoDe}`}</div>`}`;
  }
  function contagemTurma(t) {
    const n = {};
    t.alunos.forEach((a) => { const k = st.alunos.get(a.id).acao; n[k] = (n[k] || 0) + 1; });
    return `${t.alunos.length} aluno(s): ${ACOES.filter(([k]) => n[k]).map(([k]) => `${n[k]} ${CURTO[k]}`).join(' · ')}`;
  }
  function secaoTurma(t) {
    const linhas = t.alunos.filter((a) => passaFiltro(t, a));
    if (st.filtro && !linhas.length) return '';
    const pl = st.turmas.get(t.id);
    const destino = destinoDaTurma(t);
    const para = pl.acao === 'concluir'
      ? '<span class="selo selo-neutro">não continua</span>'
      : `${EG.esc(nomeDestino(destino) || 'escolha a turma no passo 1')}${pl.acao === 'criar' ? ' <span class="selo selo-info">nova</span>' : ''}`;
    return `<section class="va-secao" data-secao="${t.id}">
      <div class="va-cab">
        <div class="va-cab-txt"><div><strong>${EG.esc(t.nome)}</strong> <i class="ti ti-arrow-right"></i> ${para}</div>
          <small data-contagem="${t.id}">${contagemTurma(t)}</small></div>
        <select class="select va-todos" name="va-todos" data-todos="${t.id}" aria-label="Aplicar a todos os alunos de ${EG.esc(t.nome)}">
          <option value="">Aplicar a todos...</option><option value="sugestao">Sugestão do EduGest</option>${ACOES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
      </div>
      <div class="tabela-wrap"><table class="va-tabela">
        <thead><tr><th>Aluno</th><th>Situação em ${st.p.anoDe}</th><th>Decisão</th><th>Turma em ${st.p.anoPara}</th></tr></thead>
        <tbody>${linhas.map((a) => linhaAluno(t, a)).join('')}</tbody>
      </table></div>
    </section>`;
  }
  const dica = (acao, sugestao) => (sugestao && acao !== sugestao ? `Sugestão: ${NOME_ACAO[sugestao]}` : '');
  function linhaAluno(t, a) {
    const s = st.alunos.get(a.id);
    const [cls, rot] = SITUACAO[a.situacao] || ['selo-neutro', a.situacao];
    return `<tr data-aluno="${a.id}" data-turma="${t.id}">
      <td><strong>${EG.esc(a.nome)}</strong><br><small>RA ${EG.esc(a.ra || '—')}</small></td>
      <td><span class="selo ${cls}">${rot}</span>${a.frequencia !== null && a.frequencia !== undefined ? ` <small>${pct(a.frequencia)} de presença</small>` : ''}
        ${a.abaixoDaMedia && a.abaixoDaMedia.length ? `<br><small>Abaixo da média: ${a.abaixoDaMedia.map(EG.esc).join(', ')}</small>` : ''}
        ${a.emAberto ? `<br><span class="selo selo-aviso va-aberto" title="${EG.moeda(a.emAberto.valor)} vencido(s)"><i class="ti ti-alert-triangle"></i> ${a.emAberto.qtd} mensalidade(s) em aberto</span>` : ''}</td>
      <td><select class="select" name="va-acao" data-a="${a.id}" data-ac="acao" aria-label="Decisão para ${EG.esc(a.nome)}">${opcoes(ACOES, s.acao)}</select>
        <small class="va-dica" data-dica>${dica(s.acao, a.sugestao)}</small></td>
      <td data-cel-destino>${celDestino(s, t, a.id, 'a')}</td>
    </tr>`;
  }
  function celDestino(s, t, id, tipo) {
    if (!PRECISA_TURMA.includes(s.acao)) {
      const txt = { concluir: 'Sai com o curso concluído', sair: 'Fica inativo (sai da escola)', manter: t ? `Continua em ${EG.esc(t.nome)} por enquanto` : 'Continua como está' }[s.acao] || '';
      return `<small class="sub">${txt}</small>`;
    }
    const ef = destinoEfetivo(s, t);
    return `<select class="select ${ef ? '' : 'invalido'}" name="va-destino" data-${tipo}="${id}" data-${tipo}c="destino" aria-label="Turma de ${st.p.anoPara}">
      <option value="">Escolha a turma</option>${destinos().map((d) => `<option value="${d.valor}" ${d.valor === ef ? 'selected' : ''}>${EG.esc(d.nome)}${d.nova ? ' (nova)' : ''}</option>`).join('')}
    </select>`;
  }
  function secaoSemTurma() {
    const p = st.p;
    const linhas = p.semTurma.filter((a) => st.filtro !== 'manter' || st.sem.get(a.id).acao === 'manter');
    if (st.filtro && !linhas.length) return '';
    return `<section class="va-secao" data-secao="sem">
      <div class="va-cab"><div class="va-cab-txt"><div><strong>Alunos ativos sem turma de ${p.anoDe}</strong></div>
        <small>Sem turma ou ainda numa turma de ano anterior. Coloque numa turma de ${p.anoPara}, registre a saída ou deixe como está.</small></div></div>
      <div class="tabela-wrap"><table class="va-tabela">
        <thead><tr><th>Aluno</th><th>Turma atual</th><th>Decisão</th><th>Turma em ${p.anoPara}</th></tr></thead>
        <tbody>${linhas.map((a) => {
          const s = st.sem.get(a.id);
          return `<tr data-sem="${a.id}">
            <td><strong>${EG.esc(a.nome)}</strong><br><small>RA ${EG.esc(a.ra || '—')}</small></td>
            <td>${a.turma ? `${EG.esc(a.turma)} <small>(${a.turmaAno})</small>` : '<span class="sub">sem turma</span>'}
              ${a.emAberto ? `<br><span class="selo selo-aviso va-aberto" title="${EG.moeda(a.emAberto.valor)} vencido(s)"><i class="ti ti-alert-triangle"></i> ${a.emAberto.qtd} mensalidade(s) em aberto</span>` : ''}</td>
            <td><select class="select" name="va-acao" data-s="${a.id}" data-sc="acao" aria-label="Decisão para ${EG.esc(a.nome)}">${opcoes(ACOES_SEM, s.acao)}</select></td>
            <td data-cel-destino>${celDestino(s, null, a.id, 's')}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </section>`;
  }
  function validarAlunos() {
    const p = st.p;
    for (const t of visiveis()) {
      for (const a of t.alunos) {
        const s = st.alunos.get(a.id);
        if (PRECISA_TURMA.includes(s.acao) && !destinoEfetivo(s, t)) {
          return { msg: `Escolha a turma de ${p.anoPara} de ${a.nome} (${t.nome}).`, alvo: `[data-a="${a.id}"][data-ac="destino"]` };
        }
      }
    }
    for (const a of p.semTurma) {
      const s = st.sem.get(a.id);
      if (PRECISA_TURMA.includes(s.acao) && !destinoEfetivo(s, null)) {
        return { msg: `Escolha a turma de ${p.anoPara} de ${a.nome}.`, alvo: `[data-s="${a.id}"][data-sc="destino"]` };
      }
    }
    return null;
  }

  /* ---------- 3. Mensalidades ---------- */
  function corpoMensalidades() {
    const p = st.p, f = st.fin;
    const opMes = (sel) => EG.MESES.map((m, i) => `<option value="${i + 1}" ${Number(sel) === i + 1 ? 'selected' : ''}>${m}</option>`).join('');
    return `<div class="virada-titulo"><h3>Mensalidades de ${p.anoPara}</h3>
        <p class="sub">As mensalidades de ${p.anoDe} que estão em aberto continuam como estão, em Mensalidades.</p></div>
      <label class="check-linha"><input type="checkbox" name="vf-gerar" data-f="gerar" ${f.gerar ? 'checked' : ''}>
        <span>Gerar as mensalidades de ${p.anoPara} dos alunos que vão para turmas de ${p.anoPara}</span></label>
      <fieldset class="vf-campos" ${f.gerar ? '' : 'disabled'}>
        <div class="vf-grade">
          <div class="campo"><label for="vf-valor">Valor da mensalidade (R$)</label><input class="input" id="vf-valor" type="number" step="0.01" min="0" name="vf-valor" data-f="valor" value="${EG.esc(f.valor)}"></div>
          <div class="campo"><label for="vf-ini">Do mês</label><select class="select" id="vf-ini" name="vf-ini" data-f="mesInicial">${opMes(f.mesInicial)}</select></div>
          <div class="campo"><label for="vf-fim">Até o mês</label><select class="select" id="vf-fim" name="vf-fim" data-f="mesFinal">${opMes(f.mesFinal)}</select></div>
          <div class="campo"><label for="vf-dia">Vencimento (dia do mês)</label><input class="input" id="vf-dia" type="number" min="1" max="28" name="vf-dia" data-f="dia" value="${EG.esc(f.dia)}"></div>
        </div>
        <div data-vf-padrao>${caixaPadrao()}</div>
        <div class="msg-info" data-vf-estimativa>${estimativa()}</div>
      </fieldset>`;
  }
  function caixaPadrao() {
    const p = st.p, v = numero(st.fin.valor);
    if (p.modo !== 'nova' || !(v > 0) || v === p.config.valorMensalidade) return '';
    return `<label class="check-linha"><input type="checkbox" name="vf-padrao" data-f="salvarPadrao" ${st.fin.salvarPadrao ? 'checked' : ''}>
      <span>Usar ${EG.moeda(v)} como valor padrão da mensalidade em Configurações${p.config.valorMensalidade ? ` (hoje ${EG.moeda(p.config.valorMensalidade)})` : ''}</span></label>`;
  }
  function estimativa() {
    const c = contagens(), meses = mesesCobrados(), v = numero(st.fin.valor);
    if (!c.vaoParaTurma) return `Com as decisões do passo Alunos, ninguém vai para turma de ${st.p.anoPara}, então nenhuma mensalidade será gerada.`;
    return `<strong>${c.vaoParaTurma} aluno(s) × ${meses} mês(es) = até ${c.vaoParaTurma * meses} mensalidade(s)</strong>${v > 0 ? ` de ${EG.moeda(v)}` : ''}.
      Descontos e bolsas vigentes são aplicados automaticamente; bolsa de 100% não gera cobrança; o mês em que o aluno já tiver mensalidade não é gerado de novo.`;
  }
  function validarFin() {
    const f = st.fin;
    if (!f.gerar) return null;
    if (!(numero(f.valor) > 0)) return { msg: 'Informe o valor da mensalidade (ou desmarque "Gerar as mensalidades").', alvo: '[data-f="valor"]' };
    if (Number(f.mesFinal) < Number(f.mesInicial)) return { msg: 'O mês final vem antes do mês inicial.', alvo: '[data-f="mesFinal"]' };
    const dia = Number(f.dia);
    if (!(Number.isInteger(dia) && dia >= 1 && dia <= 28)) return { msg: 'O dia de vencimento vai de 1 a 28.', alvo: '[data-f="dia"]' };
    return null;
  }

  /* ---------- 4. Conferir ---------- */
  function corpoConferir() {
    const p = st.p, f = st.fin, c = contagens();
    const ocup = ocupacao();
    const meses = mesesCobrados();
    const nv = novoValorPadrao();
    const linhasDestino = destinos().filter((d) => d.nova || ocup.get(d.valor)).map((d) => {
      const entram = ocup.get(d.valor) || 0;
      const total = d.ocupados + entram;
      return { d, entram, total, cheia: total > d.capacidade };
    });
    const avisos = [];
    linhasDestino.filter((x) => x.cheia).forEach((x) => avisos.push(`${EG.esc(x.d.nome)} fica com ${x.total} alunos para ${x.d.capacidade} vagas.`));
    if (c.devedores) avisos.push(`${c.devedores} aluno(s) com mensalidades vencidas em aberto vão para turmas de ${p.anoPara}. As pendências continuam em Mensalidades.`);
    const semProf = visiveis().filter((t) => { const pl = st.turmas.get(t.id); return pl.acao === 'criar' && !pl.copiarProfessores; }).length;
    if (semProf) avisos.push(`${semProf} turma(s) nova(s) sem professores copiados: depois, atribua os professores e monte a grade horária.`);
    if (c.vaoParaTurma && !f.gerar) avisos.push(`As mensalidades de ${p.anoPara} não serão geradas. Dá para gerar depois, em Mensalidades.`);
    const naoContinuam = visiveis().filter((t) => st.turmas.get(t.id).acao === 'concluir');
    const porOrigem = visiveis().filter((t) => t.alunos.length).map((t) => {
      const n = {};
      t.alunos.forEach((a) => { const k = st.alunos.get(a.id).acao; n[k] = (n[k] || 0) + 1; });
      const pl = st.turmas.get(t.id);
      return `<tr><td><strong>${EG.esc(t.nome)}</strong></td><td>${pl.acao === 'concluir' ? '<span class="sub">não continua</span>' : EG.esc(nomeDestino(destinoDaTurma(t)))}</td>
        ${ACOES.map(([k]) => `<td class="num">${n[k] || '<span class="sub">—</span>'}</td>`).join('')}</tr>`;
    }).join('');
    return `<div class="virada-titulo"><h3>Conferir e confirmar</h3>
        <p class="sub">A virada só é gravada quando você clicar em "${p.modo === 'nova' ? `Fazer a virada para ${p.anoPara}` : 'Confirmar as decisões'}".</p></div>
      <div class="grade-kpi virada-kpis">
        ${kpi('ti-layout-grid', 'var(--info-bg)', 'var(--info)', 'Turmas novas', c.turmasNovas, `em ${p.anoPara}`)}
        ${kpi('ti-arrow-big-up-lines', 'var(--ok-bg)', 'var(--ok)', `Em turmas de ${p.anoPara}`, c.vaoParaTurma, [c.promover && `${c.promover} promovido(s)`, c.reter && `${c.reter} retido(s)`, c.enturmar && `${c.enturmar} enturmado(s)`].filter(Boolean).join(', ') || 'nenhum aluno')}
        ${kpi('ti-school', 'var(--roxo-bg)', 'var(--roxo)', 'Concluem / saem', `${c.concluir} / ${c.sair}`, 'ficam fora das turmas do ano novo')}
        ${kpi('ti-clock-pause', 'var(--aviso-bg)', 'var(--aviso-tx)', 'Decidir depois', c.depois, 'continuam como estão')}
        ${kpi('ti-receipt', 'var(--ok-bg)', 'var(--ok)', 'Mensalidades', f.gerar ? `até ${c.vaoParaTurma * meses}` : 'não gerar', f.gerar ? `${EG.moeda(numero(f.valor))} · ${EG.MESES_CURTOS[f.mesInicial - 1]} a ${EG.MESES_CURTOS[f.mesFinal - 1]} · dia ${f.dia}` : '')}
      </div>
      ${avisos.length ? `<div class="msg-aviso"><strong><i class="ti ti-alert-triangle"></i> Atenção</strong><ul class="va-avisos">${avisos.map((a) => `<li>${a}</li>`).join('')}</ul></div>` : ''}
      ${linhasDestino.length ? `<div class="rotulo" style="margin:6px 0 8px">Turmas de ${p.anoPara}</div>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Turma</th><th>Série</th><th class="num">Entram agora</th><th class="num">Alunos / vagas</th></tr></thead>
        <tbody>${linhasDestino.map((x) => `<tr><td><strong>${EG.esc(x.d.nome)}</strong> ${x.d.nova ? '<span class="selo selo-info">nova</span>' : ''}</td><td>${EG.esc(x.d.serie)}</td>
          <td class="num">${x.entram}</td><td class="num ${x.cheia ? 'texto-erro' : ''}">${x.total}/${x.d.capacidade}${x.cheia ? ' <i class="ti ti-alert-triangle" title="Acima das vagas"></i>' : ''}</td></tr>`).join('')}</tbody>
      </table></div>` : ''}
      ${naoContinuam.length ? `<p class="sub" style="margin-top:8px">Não continuam em ${p.anoPara}: ${naoContinuam.map((t) => EG.esc(t.nome)).join(', ')}.</p>` : ''}
      ${porOrigem ? `<div class="rotulo" style="margin:18px 0 8px">Decisões por turma de ${p.anoDe}</div>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Turma de ${p.anoDe}</th><th>Vai para</th>${ACOES.map(([k]) => `<th class="num">${CURTO[k].replace(/^./, (x) => x.toUpperCase())}</th>`).join('')}</tr></thead>
        <tbody>${porOrigem}</tbody>
      </table></div>` : ''}
      <div class="msg-info" style="margin-top:16px"><i class="ti ti-shield-check"></i>
        ${p.modo === 'nova' ? `O ano letivo do colégio passa a ser <strong>${p.anoPara}</strong>${nv ? ` e o valor padrão da mensalidade, ${EG.moeda(nv)}` : ''}. ` : ''}
        Tudo de ${p.anoDe} continua guardado. Dá para desfazer depois, nesta mesma tela, enquanto as turmas novas não tiverem notas ou chamada e nenhuma mensalidade gerada pela virada estiver paga.</div>`;
  }

  /* ---------------- Montagem ---------------- */
  const CORPOS = [corpoTurmas, corpoAlunos, corpoMensalidades, corpoConferir];
  const VALIDAR = [validarTurmas, validarAlunos, validarFin];

  function render(el) {
    if (st.resultado) { el.innerHTML = telaResultado(); return; }
    const vazio = !visiveis().length && !st.p.semTurma.length;
    el.innerHTML = `<div data-cab>${cabecalho()}</div>${vazio
      ? `<div class="card"><div class="vazio"><i class="ti ti-layout-grid"></i>Não há turmas de ${st.p.anoDe} nem alunos ativos para passar para ${st.p.anoPara}.<br>Cadastre as turmas em <strong>Turmas e Séries</strong>.</div></div>`
      : '<div data-passos></div><div class="card virada-corpo" data-corpo></div><div class="virada-rodape" data-rodape></div>'}`;
    if (!vazio) renderPasso();
  }
  function renderPasso() {
    EG.$('[data-passos]', st.el).innerHTML = passos();
    renderCorpo();
    EG.$('[data-rodape]', st.el).innerHTML = rodape();
  }
  function renderCorpo() { EG.$('[data-corpo]', st.el).innerHTML = CORPOS[st.passo - 1](); }

  function mostrarErro(e) {
    const caixa = EG.$('[data-erro-virada]', st.el);
    if (caixa) { caixa.textContent = e.msg; caixa.hidden = false; }
    if (!e.alvo) return;
    let alvo = EG.$(e.alvo, st.el);
    if (!alvo && st.passo === 2 && st.filtro) { st.filtro = ''; renderCorpo(); alvo = EG.$(e.alvo, st.el); }
    if (alvo) {
      alvo.classList.add('invalido');
      alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
      alvo.focus({ preventScroll: true });
    }
  }
  function limparErro() { const c = EG.$('[data-erro-virada]', st.el); if (c) c.hidden = true; }

  function irPara(n) {
    if (n < 1 || n > PASSOS.length || n === st.passo) return;
    if (n > st.passo) {
      for (let k = st.passo; k < n; k++) {
        const e = VALIDAR[k - 1] && VALIDAR[k - 1]();
        if (e) {
          if (k !== st.passo) { st.passo = k; renderPasso(); }
          mostrarErro(e);
          return;
        }
      }
    }
    st.passo = n;
    renderPasso();
    const topo = EG.$('[data-passos]', st.el);
    if (topo && topo.getBoundingClientRect().top < 0) topo.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function pedido() {
    const p = st.p, f = st.fin;
    const vis = visiveis();
    const alunos = [];
    vis.forEach((t) => t.alunos.forEach((a) => {
      const s = st.alunos.get(a.id);
      alunos.push({ id: a.id, acao: s.acao, destino: destinoEfetivo(s, t) || null });
    }));
    p.semTurma.forEach((a) => {
      const s = st.sem.get(a.id);
      if (s.acao !== 'manter') alunos.push({ id: a.id, acao: s.acao, destino: destinoEfetivo(s, null) || null });
    });
    return {
      anoDe: p.anoDe,
      turmas: vis.map((t) => {
        const pl = st.turmas.get(t.id);
        return {
          origemId: t.id, acao: pl.acao, nome: String(pl.nome || '').trim(), serie: String(pl.serie || '').trim(),
          periodo: pl.periodo, capacidade: Number(pl.capacidade) || null,
          destinoId: pl.acao === 'existente' ? Number(pl.destinoId) : null, copiarProfessores: !!pl.copiarProfessores
        };
      }),
      alunos,
      mensalidades: f.gerar
        ? { gerar: true, valor: numero(f.valor), mesInicial: Number(f.mesInicial), mesFinal: Number(f.mesFinal), diaVencimento: Number(f.dia) }
        : { gerar: false },
      novoValorPadrao: novoValorPadrao()
    };
  }

  async function recarregarColegio() {
    try { EG.estado.colegio = await EG.api('GET', '/colegios/atual'); } catch (e) { /* a tela segue; o ano aparece certo ao recarregar */ }
  }

  async function confirmar(btn) {
    for (let k = 1; k < PASSOS.length; k++) {
      const e = VALIDAR[k - 1]();
      if (e) { st.passo = k; renderPasso(); mostrarErro(e); return; }
    }
    const p = st.p, c = contagens(), f = st.fin;
    const mens = f.gerar && c.vaoParaTurma ? `\nAté ${c.vaoParaTurma * mesesCobrados()} mensalidade(s) de ${p.anoPara} serão geradas.` : '';
    const msg = p.modo === 'nova'
      ? `Fazer a virada ${p.anoDe} → ${p.anoPara}?\n\n${c.turmasNovas} turma(s) nova(s), ${c.vaoParaTurma} aluno(s) em turmas de ${p.anoPara}, ${c.concluir} concluinte(s), ${c.sair} saída(s) e ${c.depois} para decidir depois.${mens}\nO ano letivo do colégio passa a ser ${p.anoPara}.\n\nDá para desfazer depois, enquanto o ano novo não tiver movimento.`
      : `Gravar as decisões dos alunos pendentes de ${p.anoDe}?\n\n${c.vaoParaTurma} aluno(s) em turmas de ${p.anoPara}, ${c.concluir} concluinte(s), ${c.sair} saída(s) e ${c.depois} para decidir depois.${mens}`;
    if (!(await EG.confirmar(msg, { titulo: 'Virada do ano letivo', textoOk: p.modo === 'nova' ? 'Fazer a virada' : 'Gravar' }))) return;
    limparErro();
    await EG.guarda(btn, async () => {
      try {
        const r = await EG.gerando(EG.$('[data-corpo]', st.el), 'Fazendo a virada do ano letivo...', () => EG.api('POST', '/virada', pedido()), 'ti-calendar-repeat');
        st.resultado = r;
        await recarregarColegio();
        render(st.el);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (e) { mostrarErro({ msg: e.message }); }
    });
  }

  function telaResultado() {
    const r = st.resultado, s = r.resumo || {};
    const nova = r.modo === 'nova';
    return `<div class="card virada-feita">
      <div class="auth-status">
        <div class="icone-grande" style="background:var(--ok-bg);color:var(--ok)"><i class="ti ti-circle-check"></i></div>
        <h3>${nova ? `Virada feita: ${r.anoDe} → ${r.anoPara}` : `Alunos pendentes de ${r.anoDe} resolvidos`}</h3>
        <p>${nova ? `O ano letivo do colégio agora é <strong>${r.anoPara}</strong>. Tudo de ${r.anoDe} continua guardado.` : 'As decisões foram gravadas.'}</p>
      </div>
      <div class="grade-kpi virada-kpis">
        ${kpi('ti-layout-grid', 'var(--info-bg)', 'var(--info)', 'Turmas criadas', s.turmasCriadas || 0, s.turmasUsadas ? `e ${s.turmasUsadas} já existente(s) usada(s)` : `em ${r.anoPara}`)}
        ${kpi('ti-arrow-big-up-lines', 'var(--ok-bg)', 'var(--ok)', `Em turmas de ${r.anoPara}`, (s.promovidos || 0) + (s.retidos || 0) + (s.enturmados || 0),
          [s.promovidos && `${s.promovidos} promovido(s)`, s.retidos && `${s.retidos} retido(s)`, s.enturmados && `${s.enturmados} enturmado(s)`].filter(Boolean).join(', ') || 'nenhum aluno')}
        ${kpi('ti-school', 'var(--roxo-bg)', 'var(--roxo)', 'Concluíram / saíram', `${s.concluidos || 0} / ${s.sairam || 0}`, 'fora das turmas do ano novo')}
        ${kpi('ti-receipt', 'var(--ok-bg)', 'var(--ok)', 'Mensalidades geradas', s.mensalidades || 0, s.mensalidades ? `${EG.moeda(s.valorMensalidades)} no total` : 'nenhuma')}
      </div>
      <div class="msg-info"><strong>Próximos passos:</strong> confira as turmas de ${r.anoPara} (professores e grade horária)${s.mensalidades ? ' e as mensalidades geradas' : ''}.
        ${s.mantidos ? `Os ${s.mantidos} aluno(s) em "Decidir depois" continuam como estavam: volte a esta tela quando decidir.` : ''}
        Se algo saiu errado, dá para desfazer nesta tela, em "Viradas já feitas", enquanto o ano novo não tiver movimento.</div>
      <div class="virada-acoes-fim">
        <button class="btn btn-secundario" data-action="ir-turmas"><i class="ti ti-layout-grid"></i> Ver turmas de ${r.anoPara}</button>
        ${s.mensalidades ? '<button class="btn btn-secundario" data-action="ir-mensalidades"><i class="ti ti-receipt"></i> Ver mensalidades</button>' : ''}
        <button class="btn btn-primario" data-action="recarregar"><i class="ti ti-calendar-repeat"></i> Voltar à virada do ano</button>
      </div>
    </div>`;
  }

  /* ---------------- Eventos ---------------- */
  function mudarTurma(x, final) {
    const id = Number(x.dataset.t), campo = x.dataset.tc;
    const pl = st.turmas.get(id);
    pl[campo] = x.type === 'checkbox' ? x.checked : x.value;
    x.classList.remove('invalido');
    mudouTurmas();
    limparErro();
    if (final && (campo === 'acao' || campo === 'periodo')) {
      const linha = x.closest('[data-linha-turma]');
      linha.outerHTML = linhaTurma(turmaDe(id));
      const novo = EG.$(`[data-t="${id}"][data-tc="${campo}"]`, st.el);
      if (novo) novo.focus();
    }
    atualizarRodape();
  }
  function mudarAluno(x, tipo) {
    const id = Number(x.dataset[tipo]);
    const s = (tipo === 'a' ? st.alunos : st.sem).get(id);
    if (!s) return;
    const tr = x.closest('tr');
    const t = tipo === 'a' ? turmaDe(Number(tr.dataset.turma)) : null;
    limparErro();
    if (x.dataset[tipo + 'c'] === 'acao') {
      s.acao = x.value;
      s.destino = '';
      tr.querySelector('[data-cel-destino]').innerHTML = celDestino(s, t, id, tipo);
      const d = tr.querySelector('[data-dica]');
      if (d) d.textContent = dica(s.acao, t.alunos.find((a) => a.id === id).sugestao);
    } else {
      s.destino = x.value;
      x.classList.toggle('invalido', !x.value);
    }
    if (t) { const c = EG.$(`[data-contagem="${t.id}"]`, st.el); if (c) c.textContent = contagemTurma(t); }
    atualizarChips();
    atualizarRodape();
  }
  function aplicarTodos(x) {
    const t = turmaDe(Number(x.dataset.todos));
    const v = x.value;
    if (!t || !v) return;
    t.alunos.forEach((a) => { const s = st.alunos.get(a.id); s.acao = v === 'sugestao' ? a.sugestao : v; s.destino = ''; });
    x.closest('[data-secao]').outerHTML = secaoTurma(t);
    limparErro();
    atualizarChips();
    atualizarRodape();
  }
  function mudarFin(x) {
    const f = st.fin, campo = x.dataset.f;
    f[campo] = x.type === 'checkbox' ? x.checked : x.value;
    x.classList.remove('invalido');
    limparErro();
    if (campo === 'gerar') { const fs = EG.$('.vf-campos', st.el); if (fs) fs.disabled = !f.gerar; }
    if (campo !== 'salvarPadrao') { const cx = EG.$('[data-vf-padrao]', st.el); if (cx) cx.innerHTML = caixaPadrao(); }
    const est = EG.$('[data-vf-estimativa]', st.el);
    if (est) est.innerHTML = estimativa();
  }

  async function trocarAno(ano, el) {
    if (ano === st.p.anoDe) return;
    if (EG.telaAlterada() && !(await EG.confirmar('As escolhas feitas nesta tela serão perdidas. Trocar mesmo assim?', { textoOk: 'Trocar' }))) return;
    EG.limparAlteracoes();
    anoPedido = ano;
    el.innerHTML = EG.esqueleto(true);
    await carregar(el);
  }

  async function desfazer(btn, id, el) {
    const v = (st.p.viradas || []).find((x) => x.id === id);
    if (!v) return;
    const nova = !v.resumo || v.resumo.modo !== 'complemento';
    const ok = await EG.confirmar(`Desfazer a virada ${v.anoDe} → ${v.anoPara}?\n\n`
      + 'Os alunos voltam para as turmas e a situação que tinham antes. As turmas criadas por ela e as mensalidades que ela gerou são apagadas'
      + (nova ? `, e o ano letivo do colégio volta a ser ${v.anoDe}.` : '.')
      + `\n\nNotas, chamadas e pagamentos de ${v.anoDe} não mudam.`, { titulo: 'Desfazer a virada', textoOk: 'Desfazer a virada', perigo: true });
    if (!ok) return;
    await EG.guarda(btn, async () => {
      const r = await EG.api('POST', `/virada/${id}/desfazer`);
      EG.toast(`Virada desfeita: ${r.alunos} aluno(s) de volta${r.turmas ? `, ${r.turmas} turma(s) apagada(s)` : ''}${r.mensalidades ? `, ${r.mensalidades} mensalidade(s) apagada(s)` : ''}`);
      await recarregarColegio();
      anoPedido = null;
      el.innerHTML = EG.esqueleto(true);
      await carregar(el);
    });
  }

  async function aoClicar(ev, el) {
    const b = ev.target.closest('[data-action]');
    if (!b || !el.contains(b)) return;
    try {
      switch (b.dataset.action) {
        case 'passo': irPara(Number(b.dataset.passo)); break;
        case 'voltar': irPara(st.passo - 1); break;
        case 'continuar': irPara(st.passo + 1); break;
        case 'confirmar': await confirmar(b); break;
        case 'filtro-alunos': st.filtro = b.dataset.filtroAlunos; renderCorpo(); break;
        case 'ano': await trocarAno(Number(b.dataset.ano), el); break;
        case 'desfazer': await desfazer(b, Number(b.dataset.id), el); break;
        case 'ir-turmas': EG.anoInicialTurmas = st.resultado.anoPara; EG.navegar('turmas'); break;
        case 'ir-mensalidades': EG.navegar('mensalidades'); break;
        case 'recarregar': anoPedido = null; el.innerHTML = EG.esqueleto(true); await carregar(el); break;
        default: break;
      }
    } catch (e) { EG.toast(e.message, 'erro'); }
  }
  function aoMudar(ev) {
    const x = ev.target;
    if (!st || !x.dataset) return;
    if (x.dataset.tc) mudarTurma(x, true);
    else if (x.dataset.ac) mudarAluno(x, 'a');
    else if (x.dataset.sc) mudarAluno(x, 's');
    else if (x.dataset.todos) aplicarTodos(x);
    else if (x.dataset.f) mudarFin(x);
  }
  function aoDigitar(ev) {
    const x = ev.target;
    if (!st || x.tagName !== 'INPUT' || x.type === 'checkbox') return;
    if (x.dataset.tc) mudarTurma(x, false);
    else if (x.dataset.f) mudarFin(x);
  }

  async function carregar(el) {
    const p = await EG.api('GET', '/virada/previa' + (anoPedido ? `?ano=${anoPedido}` : ''));
    st = iniciarEstado(p, el);
    render(el);
  }

  EG.registrarModulo('virada', {
    async render(el) {
      anoPedido = null;
      await carregar(el);
      el.onclick = (ev) => aoClicar(ev, el);
      el.onchange = aoMudar;
      el.oninput = aoDigitar;
    }
  });
})(window.EG);
