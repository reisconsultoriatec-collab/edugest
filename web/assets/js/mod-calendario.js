/* =====================================================================
 *  EduGest — Calendário escolar   [módulo calendario]
 *  Grade do mês e lista · eventos com público, horário e local ·
 *  bimestres e dias letivos · feriados nacionais · impressão.
 *  Professor: evento/prova/reunião só para as turmas dele.
 *  As funções de desenho (EG.cal) também servem o Portal do Responsável.
 * ===================================================================== */
'use strict';
(function (EG) {
  const TIPOS = {
    evento: 'Evento', prova: 'Prova', reuniao: 'Reunião', conselho: 'Conselho de classe',
    feriado: 'Feriado', recesso: 'Recesso', letivo: 'Dia letivo extra', bimestre: 'Bimestre'
  };
  const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const SEMANA_LONGA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

  /* ---------- Datas 'AAAA-MM-DD' ---------- */
  const dt = (s) => new Date(`${s}T12:00:00Z`);
  const iso = (d) => d.toISOString().slice(0, 10);
  const somar = (s, n) => { const d = dt(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const dow = (s) => dt(s).getUTCDay();
  const mesSeguinte = (mes, n) => { const d = dt(`${mes}-01`); d.setUTCMonth(d.getUTCMonth() + n); return iso(d).slice(0, 7); };
  const ultimoDia = (mes) => somar(`${mesSeguinte(mes, 1)}-01`, -1);
  const nomeMes = (mes) => `${EG.MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
  const dataLonga = (s) => `${SEMANA_LONGA[dow(s)]}, ${Number(s.slice(8, 10))} de ${EG.MESES[Number(s.slice(5, 7)) - 1].toLowerCase()}`;

  /** Primeiro e último dia da grade do mês (semanas de domingo a sábado). */
  function limitesGrade(mes) {
    const ini = `${mes}-01`;
    const fim = ultimoDia(mes);
    return { inicio: somar(ini, -dow(ini)), fim: somar(fim, 6 - dow(fim)) };
  }

  const horario = (e) => (e.horaInicio ? (e.horaFim ? `${e.horaInicio}–${e.horaFim}` : e.horaInicio) : '');
  const periodoTxt = (e) => (e.dataFim ? `${EG.data(e.data)} a ${EG.data(e.dataFim)}` : dataLonga(e.data));
  const tag = (tipo) => `<span class="cal-ev tag ev-${tipo}">${TIPOS[tipo] || tipo}</span>`;

  /** Map data → eventos (os de vários dias aparecem em cada dia). */
  function porDia(eventos, inicio, fim) {
    const mapa = new Map();
    eventos.forEach((e) => {
      const ate = e.dataFim || e.data;
      for (let d = e.data > inicio ? e.data : inicio, n = 0; d <= ate && d <= fim && n < 400; d = somar(d, 1), n++) {
        if (!mapa.has(d)) mapa.set(d, []);
        mapa.get(d).push(e);
      }
    });
    mapa.forEach((l) => l.sort((a, b) => (a.horaInicio || '').localeCompare(b.horaInicio || '') || a.titulo.localeCompare(b.titulo)));
    return mapa;
  }

  /** Marcos dos bimestres para a grade: data → texto. */
  function marcos(periodos) {
    const m = new Map();
    (periodos || []).forEach((p) => {
      m.set(p.inicio, `Início ${p.bimestre}º bim.`);
      m.set(p.fim, (m.has(p.fim) ? m.get(p.fim) + ' · ' : '') + `Fim ${p.bimestre}º bim.`);
    });
    return m;
  }

  /** Grade do mês (HTML). Clique: [data-dia] no dia e [data-ev] no evento. */
  function grade(mes, eventos, periodos) {
    const { inicio, fim } = limitesGrade(mes);
    const dias = porDia(eventos, inicio, fim);
    const mk = marcos(periodos);
    const hoje = EG.hojeSP();
    let html = SEMANA.map((s) => `<div class="cal-semana">${s}</div>`).join('');
    for (let d = inicio; d <= fim; d = somar(d, 1)) {
      const evs = dias.get(d) || [];
      const naoLetivo = evs.some((e) => e.naoLetivo);
      const cls = ['cal-dia', d.slice(0, 7) !== mes ? 'fora' : '', d === hoje ? 'hoje' : '', dow(d) === 0 || dow(d) === 6 ? 'fds' : '', naoLetivo ? 'nao-letivo' : ''].filter(Boolean).join(' ');
      const visiveis = evs.slice(0, 3);
      html += `<div class="${cls}" data-dia="${d}">
        <div class="cal-num"><b>${Number(d.slice(8, 10))}</b>${mk.has(d) ? `<span class="cal-marco" title="${EG.esc(mk.get(d))}">${EG.esc(mk.get(d))}</span>` : ''}</div>
        ${visiveis.map((e) => `<button class="cal-ev ev-${e.tipo}" data-ev="${e.id}" title="${EG.esc(`${TIPOS[e.tipo] || e.tipo}: ${e.titulo}${horario(e) ? ' · ' + horario(e) : ''}`)}">${horario(e) && !e.dataFim ? e.horaInicio + ' ' : ''}${EG.esc(e.titulo)}</button>`).join('')}
        ${evs.length > 3 ? `<span class="cal-mais">+${evs.length - 3} mais</span>` : ''}
      </div>`;
    }
    return `<div class="cal-grade">${html}</div>`;
  }

  /** Lista (agenda) dos eventos do intervalo, agrupada por dia de início. */
  function lista(eventos, vazio) {
    if (!eventos.length) return `<div class="vazio"><i class="ti ti-calendar"></i>${vazio || 'Nenhum evento neste mês'}</div>`;
    const grupos = new Map();
    [...eventos].sort((a, b) => a.data.localeCompare(b.data) || (a.horaInicio || '').localeCompare(b.horaInicio || '')).forEach((e) => {
      if (!grupos.has(e.data)) grupos.set(e.data, []);
      grupos.get(e.data).push(e);
    });
    return [...grupos.entries()].map(([d, evs]) => `<div class="cal-lista-dia">
      <div class="cal-lista-data"><strong>${Number(d.slice(8, 10))}</strong><small>${SEMANA[dow(d)]} · ${EG.MESES_CURTOS[Number(d.slice(5, 7)) - 1]}</small></div>
      <div class="cal-lista-itens">${evs.map((e) => `<div class="cal-item" data-ev="${e.id}">
        ${tag(e.tipo)}
        <div><strong>${EG.esc(e.titulo)}</strong>
          <div class="sub">${[e.dataFim ? `até ${EG.data(e.dataFim)}` : '', horario(e), e.lugar ? EG.esc(e.lugar) : '', e.publico && e.publico !== 'Colégio todo' ? EG.esc(e.publico) : '',
            e.para && e.para.length ? 'Para: ' + EG.esc(e.para.join(', ')) : '', e.visivelFamilias === false ? 'só a equipe' : ''].filter(Boolean).join(' · ')}</div></div>
      </div>`).join('')}</div></div>`).join('');
  }

  /** Detalhe de um evento (HTML). */
  function detalhe(e) {
    const itens = [
      `<i class="ti ti-calendar"></i> ${periodoTxt(e)}`,
      horario(e) ? `<i class="ti ti-clock"></i> ${horario(e)}` : '',
      e.lugar ? `<i class="ti ti-map-pin"></i> ${EG.esc(e.lugar)}` : '',
      e.publico ? `<i class="ti ti-users"></i> ${EG.esc(e.publico)}` : '',
      e.para && e.para.length ? `<i class="ti ti-users"></i> Para: ${EG.esc(e.para.join(', '))}` : ''
    ].filter(Boolean);
    return `<div class="com-selos">${tag(e.tipo)}${e.naoLetivo ? '<span class="selo selo-erro">Dia não letivo</span>' : ''}${e.visivelFamilias === false ? '<span class="selo selo-neutro"><i class="ti ti-eye-off"></i> Só a equipe</span>' : ''}</div>
      <div class="com-titulo" style="font-size:17px">${EG.esc(e.titulo)}</div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;font-size:13px;color:var(--text-2)">${itens.map((x) => `<div>${x}</div>`).join('')}</div>
      ${e.descricao ? `<div class="com-texto">${EG.esc(e.descricao)}</div>` : ''}
      ${e.autor ? `<p class="sub" style="margin-top:12px">Cadastrado por ${EG.esc(e.autor)}</p>` : ''}`;
  }

  /** Eventos de um dia (modal). */
  function modalDia(dia, eventos, { podeCriar, aoNovo, aoEvento } = {}) {
    const doDia = (porDia(eventos, dia, dia).get(dia) || []);
    const m = EG.modal({
      titulo: dataLonga(dia).replace(/^./, (c) => c.toUpperCase()),
      largura: 520,
      corpo: doDia.length ? `<div class="cal-lista-itens">${doDia.map((e) => `<div class="cal-item" data-ev="${e.id}">${tag(e.tipo)}
          <div><strong>${EG.esc(e.titulo)}</strong><div class="sub">${[horario(e), e.lugar ? EG.esc(e.lugar) : '', e.publico && e.publico !== 'Colégio todo' ? EG.esc(e.publico) : '',
            e.para && e.para.length ? 'Para: ' + EG.esc(e.para.join(', ')) : ''].filter(Boolean).join(' · ')}</div></div></div>`).join('')}</div>`
        : '<div class="vazio"><i class="ti ti-calendar"></i>Nenhum evento neste dia</div>',
      botoes: [
        ...(podeCriar ? [{ texto: 'Novo evento neste dia', icone: 'ti-plus', acao: () => { m.fechar(); aoNovo(dia); } }] : []),
        { texto: 'Fechar', classe: 'btn-primario', acao: () => m.fechar() }
      ]
    });
    m.el.addEventListener('click', (ev) => {
      const it = ev.target.closest('[data-ev]');
      if (it && aoEvento) { m.fechar(); aoEvento(Number(it.dataset.ev)); }
    });
  }

  EG.cal = { TIPOS, grade, lista, detalhe, modalDia, limitesGrade, mesSeguinte, ultimoDia, nomeMes, tag, somar, dataLonga };

  /* =====================================================================
   *  Tela da equipe
   * ===================================================================== */
  const est = {};
  let opcoes = null;
  let anoInfo = null;
  let eventos = [];

  async function carregarEventos() {
    const intervalo = est.vista === 'mes' ? limitesGrade(est.mes) : { inicio: `${est.mes}-01`, fim: ultimoDia(est.mes) };
    const q = new URLSearchParams(intervalo);
    if (est.tipo) q.set('tipo', est.tipo);
    if (est.turmaId) q.set('turmaId', est.turmaId);
    eventos = (await EG.api('GET', '/calendario?' + q)).itens;
  }

  function desenharCalendario(el) {
    el.querySelector('[data-titulo-mes]').textContent = nomeMes(est.mes);
    el.querySelectorAll('[data-vista]').forEach((b) => b.classList.toggle('ativo', b.dataset.vista === est.vista));
    el.querySelector('[data-cal]').innerHTML = est.vista === 'mes'
      ? grade(est.mes, eventos, anoInfo ? anoInfo.periodos : [])
      : lista(eventos.filter((e) => (e.dataFim || e.data) >= `${est.mes}-01` && e.data <= ultimoDia(est.mes)));
  }

  function desenharAnoLetivo(el) {
    const box = el.querySelector('[data-ano-letivo]');
    const a = anoInfo;
    const cab = `<div class="card-cab"><div class="card-titulo"><i class="ti ti-school"></i> Ano letivo ${a.ano}</div>
      ${opcoes.coordenacao ? '<button class="btn btn-secundario btn-pequeno" data-action="bimestres"><i class="ti ti-calendar-cog"></i> Definir bimestres</button>' : ''}</div>`;
    if (!a.periodos.length) {
      box.innerHTML = `${cab}<div class="vazio"><i class="ti ti-calendar-stats"></i>Defina o início e o fim de cada bimestre para o sistema contar os dias letivos
        ${opcoes.coordenacao ? '<br><button class="btn btn-primario" data-action="bimestres" style="margin-top:14px"><i class="ti ti-calendar-cog"></i> Definir bimestres</button>' : ''}</div>`;
      return;
    }
    const falta = a.meta - a.total;
    box.innerHTML = `${cab}
      <div class="bimestres">${a.bimestres.map((b) => `<div class="bimestre ${a.bimestreAtual === b.bimestre && EG.hojeSP() >= b.inicio && EG.hojeSP() <= b.fim ? 'atual' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center"><strong>${b.bimestre}º bimestre</strong>
          ${a.bimestreAtual === b.bimestre && EG.hojeSP() >= b.inicio && EG.hojeSP() <= b.fim ? '<span class="selo selo-aviso">atual</span>' : ''}</div>
        <small>${EG.data(b.inicio)} a ${EG.data(b.fim)}</small>
        <div class="dias">${b.diasLetivos}</div><small>dias letivos${b.descontados ? ` · ${b.descontados} feriado(s)/recesso(s)` : ''}${b.extras ? ` · ${b.extras} dia(s) extra(s)` : ''}</small>
      </div>`).join('')}</div>
      <div style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span><strong>${a.total}</strong> dias letivos no ano</span><span class="sub">mínimo: ${a.meta} (LDB)</span></div>
        <div class="medidor" style="height:8px"><span style="width:${Math.min(100, Math.round((a.total / a.meta) * 100))}%;background:${falta > 0 ? 'var(--aviso)' : 'var(--ok)'}"></span></div>
        ${falta > 0 ? `<p class="sub" style="margin-top:6px;color:var(--aviso-tx)"><i class="ti ti-alert-triangle"></i> Faltam ${falta} dia(s) letivo(s) para o mínimo. Inclua dias letivos extras (ex.: sábados letivos) ou ajuste os bimestres.</p>` : ''}
        <p class="sub" style="margin-top:6px">Conta de segunda a sexta dentro dos bimestres, menos feriados e recessos do colégio todo, mais os dias letivos extras.</p>
      </div>`;
  }

  async function recarregar(el, tudo) {
    if (tudo) anoInfo = await EG.api('GET', `/calendario/ano-letivo?ano=${opcoes.anoLetivo}`);
    await carregarEventos();
    desenharCalendario(el);
    if (tudo) desenharAnoLetivo(el);
  }

  /* ---------- Evento: criar / editar ---------- */
  const ALCANCES = [['todos', 'Colégio todo', 'ti-building'], ['segmentos', 'Segmentos', 'ti-stack-2'], ['turmas', 'Turmas', 'ti-layout-grid']];

  function modalEvento(el, e, diaInicial) {
    const editando = !!e;
    e = e || {
      titulo: '', tipo: opcoes.restrito ? 'prova' : 'evento', data: diaInicial || EG.hojeSP(), dataFim: null, horaInicio: null, horaFim: null,
      lugar: '', descricao: '', alcance: opcoes.restrito ? 'turmas' : 'todos', segmentos: [],
      turmas: opcoes.restrito && opcoes.turmas.length === 1 ? [{ id: opcoes.turmas[0].id }] : [], visivelFamilias: true
    };
    const turmasSel = new Set(e.turmas.map((t) => t.id));
    let visivelTocado = editando;
    const m = EG.modal({
      titulo: editando ? 'Editar evento' : 'Novo evento',
      largura: 680,
      corpo: `
        <div class="campo"><label>Título *</label><input class="input" name="titulo" maxlength="150" value="${EG.esc(e.titulo)}" placeholder="Ex.: Reunião de pais, Prova de Matemática"></div>
        <div class="linha-2">
          <div class="campo"><label>Tipo</label><select class="select" name="tipo">${opcoes.tipos.map((t) => `<option value="${t.id}" ${t.id === e.tipo ? 'selected' : ''}>${t.nome}</option>`).join('')}</select>
            <small data-dica-tipo></small></div>
          <div class="campo"><label>Local (opcional)</label><input class="input" name="lugar" maxlength="120" value="${EG.esc(e.lugar || '')}" placeholder="Ex.: Auditório"></div>
        </div>
        <div class="linha-2">
          <div class="campo"><label>Data *</label><input class="input" type="date" name="data" value="${EG.esc(e.data)}"></div>
          <div class="campo"><label>Até (vários dias)</label><input class="input" type="date" name="dataFim" value="${EG.esc(e.dataFim || '')}"></div>
        </div>
        <div class="linha-2">
          <div class="campo"><label>Começa às (opcional)</label><input class="input" type="time" name="horaInicio" value="${EG.esc(e.horaInicio || '')}"></div>
          <div class="campo"><label>Termina às (opcional)</label><input class="input" type="time" name="horaFim" value="${EG.esc(e.horaFim || '')}"></div>
        </div>
        <div class="campo"><label>Descrição (opcional)</label><textarea class="textarea" name="descricao" rows="3" maxlength="1000">${EG.esc(e.descricao || '')}</textarea></div>
        <div class="campo"><label>Para quem</label>
          <div class="opcoes-publico">${ALCANCES.map(([v, r, i]) => {
            const bloq = opcoes.restrito && v !== 'turmas';
            return `<button type="button" class="chip ${e.alcance === v ? 'ativo' : ''}" data-alcance="${v}" ${bloq ? 'disabled title="Professor cadastra só para as turmas em que leciona" style="opacity:.45;cursor:not-allowed"' : ''}><i class="ti ${i}"></i> ${r}</button>`;
          }).join('')}</div>
          <input type="hidden" name="alcance" value="${e.alcance}">
          <div data-bloco="todos" ${e.alcance === 'todos' ? '' : 'hidden'}><small>Todas as turmas.</small></div>
          <div data-bloco="segmentos" ${e.alcance === 'segmentos' ? '' : 'hidden'}>${opcoes.segmentos.length
            ? `<div class="lista-check">${opcoes.segmentos.map((s) => `<label><input type="checkbox" name="segmentos" value="${s.id}" ${e.segmentos.includes(s.id) ? 'checked' : ''}> ${EG.esc(s.nome)}</label>`).join('')}</div>`
            : '<small>Nenhuma turma ativa cadastrada.</small>'}</div>
          <div data-bloco="turmas" ${e.alcance === 'turmas' ? '' : 'hidden'}>${opcoes.turmas.length
            ? `<div class="lista-check">${opcoes.turmas.map((t) => `<label><input type="checkbox" name="turmas" value="${t.id}" ${turmasSel.has(t.id) ? 'checked' : ''}> ${EG.esc(t.nome)}</label>`).join('')}</div>`
            : `<small>${opcoes.restrito ? 'Nenhuma turma atribuída a você.' : 'Nenhuma turma ativa cadastrada.'}</small>`}</div>
        </div>
        <label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer"><input type="checkbox" name="visivelFamilias" ${e.visivelFamilias ? 'checked' : ''} style="margin-top:3px">
          <span><strong>Aparece para as famílias</strong><br><small style="color:var(--muted)">Desmarque para eventos internos (conselho de classe, reunião pedagógica).</small></span></label>`,
      botoes: [
        ...(editando && e.podeEditar ? [{ texto: 'Excluir', classe: 'btn-perigo', icone: 'ti-trash', acao: async () => {
          const ok = await EG.confirmar(`Excluir o evento "${e.titulo}"?`, { titulo: 'Excluir evento', textoOk: 'Excluir', perigo: true });
          if (!ok) return;
          await EG.api('DELETE', `/calendario/${e.id}`);
          m.fechar(); EG.toast('Evento excluído');
          await recarregar(el, true);
        } }] : []),
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Salvar', classe: 'btn-primario', icone: 'ti-device-floppy', acao: async () => {
          const d = EG.lerForm(m.el);
          const corpo = {
            titulo: d.titulo, tipo: d.tipo, data: d.data, dataFim: d.dataFim || null, horaInicio: d.horaInicio || null, horaFim: d.horaFim || null,
            lugar: d.lugar, descricao: d.descricao, alcance: d.alcance, segmentos: d.segmentos || [], turmas: (d.turmas || []).map(Number),
            visivelFamilias: m.el.querySelector('[name=visivelFamilias]').checked
          };
          if (!corpo.titulo || corpo.titulo.trim().length < 3) throw EG.erro('Informe o título.');
          if (!corpo.data) throw EG.erro('Informe a data.');
          if (corpo.alcance === 'segmentos' && !corpo.segmentos.length) throw EG.erro('Escolha pelo menos um segmento.');
          if (corpo.alcance === 'turmas' && !corpo.turmas.length) throw EG.erro('Escolha pelo menos uma turma.');
          if (editando) await EG.api('PUT', `/calendario/${e.id}`, corpo); else await EG.api('POST', '/calendario', corpo);
          m.fechar();
          EG.toast(editando ? 'Evento salvo' : 'Evento incluído no calendário');
          if (!editando && corpo.data.slice(0, 7) !== est.mes) est.mes = corpo.data.slice(0, 7);
          await recarregar(el, ['feriado', 'recesso', 'letivo'].includes(corpo.tipo) || ['feriado', 'recesso', 'letivo'].includes(e.tipo));
        } }
      ]
    });
    const dica = () => {
      const t = m.el.querySelector('[name=tipo]').value;
      m.el.querySelector('[data-dica-tipo]').textContent = t === 'feriado' || t === 'recesso'
        ? 'Dia não letivo: sai da conta de dias letivos (se for para o colégio todo).'
        : t === 'letivo' ? 'Conta como dia letivo, mesmo em sábado ou domingo (colégio todo).' : '';
    };
    dica();
    m.el.querySelector('[name=tipo]').addEventListener('change', (ev) => {
      dica();
      if (!visivelTocado) m.el.querySelector('[name=visivelFamilias]').checked = ev.target.value !== 'conselho';
    });
    m.el.querySelector('[name=visivelFamilias]').addEventListener('change', () => { visivelTocado = true; });
    m.el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-alcance]');
      if (!b || b.disabled) return;
      m.el.querySelectorAll('[data-alcance]').forEach((x) => x.classList.toggle('ativo', x === b));
      m.el.querySelector('[name=alcance]').value = b.dataset.alcance;
      m.el.querySelectorAll('[data-bloco]').forEach((bl) => { bl.hidden = bl.dataset.bloco !== b.dataset.alcance; });
    });
  }

  async function abrirEvento(el, id) {
    const e = eventos.find((x) => x.id === id) || await EG.api('GET', `/calendario/${id}`);
    const m = EG.modal({
      titulo: TIPOS[e.tipo] || 'Evento',
      largura: 520,
      corpo: detalhe(e),
      botoes: [
        ...(e.podeEditar ? [{ texto: 'Editar', icone: 'ti-pencil', acao: () => { m.fechar(); modalEvento(el, e); } }] : []),
        { texto: 'Fechar', classe: 'btn-primario', acao: () => m.fechar() }
      ]
    });
  }

  /* ---------- Bimestres ---------- */
  function modalBimestres(el) {
    const p = new Map((anoInfo.periodos || []).map((x) => [x.bimestre, x]));
    const m = EG.modal({
      titulo: `Bimestres de ${anoInfo.ano}`,
      largura: 560,
      corpo: `<p class="card-desc" style="margin:0 0 14px">Início e fim de cada bimestre. As férias entre eles não contam como dias letivos.</p>
        ${[1, 2, 3, 4].map((b) => `<div class="linha-bim"><strong>${b}º bimestre</strong>
          <input class="input" type="date" data-b="${b}" data-campo="inicio" value="${EG.esc((p.get(b) || {}).inicio || '')}" aria-label="Início do ${b}º bimestre">
          <input class="input" type="date" data-b="${b}" data-campo="fim" value="${EG.esc((p.get(b) || {}).fim || '')}" aria-label="Fim do ${b}º bimestre"></div>`).join('')}
        <small class="sub">Deixe em branco o bimestre que ainda não tem datas.</small>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Salvar', classe: 'btn-primario', icone: 'ti-device-floppy', acao: async () => {
          const bimestres = [1, 2, 3, 4].map((b) => ({
            bimestre: b,
            inicio: m.el.querySelector(`[data-b="${b}"][data-campo="inicio"]`).value || null,
            fim: m.el.querySelector(`[data-b="${b}"][data-campo="fim"]`).value || null
          }));
          const meio = bimestres.find((x) => !!x.inicio !== !!x.fim);
          if (meio) throw EG.erro(`Preencha o início e o fim do ${meio.bimestre}º bimestre.`);
          anoInfo = await EG.api('PUT', '/calendario/ano-letivo', { ano: anoInfo.ano, bimestres });
          // O "bimestre atual" das outras telas também passa a usar estas datas
          if (anoInfo.ano === Number(EG.estado.colegio.config.anoLetivo)) EG.estado.colegio.periodos = anoInfo.periodos;
          m.fechar();
          EG.toast('Bimestres salvos');
          desenharAnoLetivo(el);
          desenharCalendario(el);
        } }
      ]
    });
  }

  /* ---------- Feriados nacionais ---------- */
  async function modalFeriados(el, ano) {
    ano = ano || opcoes.anoLetivo;
    const r = await EG.api('GET', `/calendario/feriados?ano=${ano}`);
    const novos = r.feriados.filter((f) => !f.jaCadastrado).length;
    const m = EG.modal({
      titulo: 'Feriados nacionais',
      largura: 600,
      corpo: `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
          <p class="card-desc" style="margin:0">Marque os que entram no calendário de <strong>${ano}</strong>.</p>
          <select class="select" data-ano style="width:auto">${[opcoes.anoLetivo - 1, opcoes.anoLetivo, opcoes.anoLetivo + 1].map((a) => `<option ${a === ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px">${r.feriados.map((f) => `<label style="display:flex;gap:10px;align-items:center;padding:7px 4px;border-bottom:1px solid var(--border);cursor:${f.jaCadastrado ? 'default' : 'pointer'}">
          <input type="checkbox" data-data="${f.data}" ${f.jaCadastrado ? 'checked disabled' : 'checked'}>
          <span style="width:120px;font-variant-numeric:tabular-nums">${EG.data(f.data)}${f.dataFim ? ` a ${EG.data(f.dataFim).slice(0, 5)}` : ''}</span>
          <span style="flex:1">${EG.esc(f.titulo)} <small class="sub">${EG.cal.dataLonga(f.data).split(',')[0]}</small></span>
          ${f.jaCadastrado ? '<span class="selo selo-ok">já no calendário</span>' : f.facultativo ? '<span class="selo selo-neutro">ponto facultativo</span>' : ''}</label>`).join('')}</div>
        <p class="sub" style="margin-top:12px">Feriados estaduais e municipais (ex.: aniversário da cidade): use <strong>Novo evento</strong> com o tipo Feriado.</p>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: novos ? 'Incluir no calendário' : 'Tudo incluído', classe: 'btn-primario', icone: 'ti-check', acao: async () => {
          const datas = [...m.el.querySelectorAll('[data-data]:checked:not(:disabled)')].map((x) => x.dataset.data);
          if (!datas.length) { m.fechar(); return; }
          const res = await EG.api('POST', '/calendario/feriados', { ano, datas });
          m.fechar();
          EG.toast(`${res.criados} feriado(s) incluído(s)`);
          await recarregar(el, true);
        } }
      ]
    });
    m.el.querySelector('[data-ano]').addEventListener('change', (ev) => { m.fechar(); modalFeriados(el, Number(ev.target.value)).catch((e) => EG.toast(e.message, 'erro')); });
  }

  /* ---------- Impressão do ano ---------- */
  async function imprimir(el) {
    const ano = opcoes.anoLetivo;
    const q = new URLSearchParams({ inicio: `${ano}-01-01`, fim: `${ano}-12-31` });
    if (est.turmaId) q.set('turmaId', est.turmaId);
    const todos = (await EG.api('GET', '/calendario?' + q)).itens.filter((e) => e.visivelFamilias && e.tipo !== 'bimestre');
    const turma = est.turmaId ? opcoes.todasTurmas.find((t) => String(t.id) === String(est.turmaId)) : null;
    const meses = [];
    for (let i = 1; i <= 12; i++) {
      const mes = `${ano}-${String(i).padStart(2, '0')}`;
      const doMes = todos.filter((e) => e.data.slice(0, 7) === mes);
      if (doMes.length) meses.push(`<div class="cal-print-mes"><h3 style="margin:10px 0 4px">${EG.MESES[i - 1]}</h3>
        <table><tbody>${doMes.map((e) => `<tr><td style="white-space:nowrap;width:120px">${EG.data(e.data).slice(0, 5)}${e.dataFim ? ` a ${EG.data(e.dataFim).slice(0, 5)}` : ''}</td>
          <td style="width:130px">${TIPOS[e.tipo]}</td><td><strong>${EG.esc(e.titulo)}</strong>${[e.horaInicio ? horario(e) : '', e.lugar ? EG.esc(e.lugar) : '', e.publico !== 'Colégio todo' ? EG.esc(e.publico) : ''].filter(Boolean).map((x) => ` · ${x}`).join('')}</td></tr>`).join('')}</tbody></table></div>`);
    }
    const a = anoInfo;
    el.querySelector('[data-impressao]').innerHTML = `<div class="boletim-cab" style="margin-bottom:12px">
        <h2 style="margin:0">${EG.esc(EG.estado.colegio.nome)} · Calendário escolar ${ano}</h2>
        ${turma ? `<div>Turma: ${EG.esc(turma.nome)}</div>` : ''}</div>
      ${a && a.periodos.length ? `<p style="margin-bottom:10px">${a.bimestres.map((b) => `<strong>${b.bimestre}º bim.:</strong> ${EG.data(b.inicio).slice(0, 5)} a ${EG.data(b.fim).slice(0, 5)} (${b.diasLetivos} dias)`).join(' · ')}
        · <strong>Total: ${a.total} dias letivos</strong></p>` : ''}
      ${meses.join('') || '<p>Nenhum evento no ano.</p>'}`;
    window.print();
  }

  EG.registrarModulo('calendario', {
    async render(el) {
      EG.filtrosDaSessao(est, { mes: EG.hojeSP().slice(0, 7), vista: 'mes', tipo: '', turmaId: '' });
      opcoes = await EG.api('GET', '/calendario/opcoes');
      el.innerHTML = `
        <div class="card no-print">
          <div class="card-cab"><div class="card-titulo"><i class="ti ti-calendar-event"></i> Calendário escolar</div>
            <div class="acoes-topo">
              ${opcoes.coordenacao ? '<button class="btn btn-secundario" data-action="feriados"><i class="ti ti-flag"></i> Feriados nacionais</button>' : ''}
              <button class="btn btn-secundario" data-action="imprimir"><i class="ti ti-printer"></i> Imprimir</button>
              <button class="btn btn-primario" data-action="novo"><i class="ti ti-plus"></i> Novo evento</button>
            </div></div>
          ${opcoes.restrito ? '<p class="card-desc">Como professor, você cadastra provas, eventos e reuniões das turmas em que leciona.</p>' : ''}
          <div class="cal-barra">
            <div class="cal-nav">
              <button class="btn-icone" data-nav="-1" title="Mês anterior"><i class="ti ti-chevron-left"></i></button>
              <strong data-titulo-mes></strong>
              <button class="btn-icone" data-nav="1" title="Próximo mês"><i class="ti ti-chevron-right"></i></button>
              <button class="btn btn-secundario btn-pequeno" data-nav="hoje">Hoje</button>
            </div>
            <div class="cal-filtros">
              <select class="select" data-filtro="tipo"><option value="">Todos os tipos</option>
                ${Object.entries(TIPOS).filter(([k]) => k !== 'bimestre').map(([k, n]) => `<option value="${k}" ${est.tipo === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
              <select class="select" data-filtro="turma"><option value="">Todas as turmas</option>
                ${opcoes.todasTurmas.map((t) => `<option value="${t.id}" ${String(est.turmaId) === String(t.id) ? 'selected' : ''}>${EG.esc(t.nome)}</option>`).join('')}</select>
              <button class="chip" data-vista="mes"><i class="ti ti-calendar-month"></i> Mês</button>
              <button class="chip" data-vista="lista"><i class="ti ti-list"></i> Lista</button>
            </div>
          </div>
          <div data-cal><div class="vazio"><div class="spinner pequeno" style="margin:0 auto"></div></div></div>
          <div class="cal-legenda">${Object.entries(TIPOS).filter(([k]) => k !== 'bimestre').map(([k]) => tag(k)).join('')}</div>
        </div>
        <div class="card no-print" data-ano-letivo></div>
        <div class="so-print-bloco" data-impressao></div>`;
      await recarregar(el, true);

      el.onchange = (ev) => {
        const f = ev.target.dataset.filtro;
        if (!f) return;
        if (f === 'tipo') est.tipo = ev.target.value;
        if (f === 'turma') est.turmaId = ev.target.value;
        recarregar(el, false).catch((e) => EG.toast(e.message, 'erro'));
      };
      el.onclick = (ev) => {
        const t = ev.target;
        const nav = t.closest('[data-nav]');
        if (nav) {
          est.mes = nav.dataset.nav === 'hoje' ? EG.hojeSP().slice(0, 7) : mesSeguinte(est.mes, Number(nav.dataset.nav));
          recarregar(el, false).catch((e) => EG.toast(e.message, 'erro'));
          return;
        }
        const vista = t.closest('[data-vista]');
        if (vista) { est.vista = vista.dataset.vista; recarregar(el, false).catch((e) => EG.toast(e.message, 'erro')); return; }
        const evb = t.closest('[data-ev]');
        if (evb && el.contains(evb)) { abrirEvento(el, Number(evb.dataset.ev)).catch((e) => EG.toast(e.message, 'erro')); return; }
        const dia = t.closest('[data-dia]');
        if (dia) {
          modalDia(dia.dataset.dia, eventos, {
            podeCriar: true,
            aoNovo: (d) => modalEvento(el, null, d),
            aoEvento: (id) => abrirEvento(el, id).catch((e) => EG.toast(e.message, 'erro'))
          });
          return;
        }
        const b = t.closest('[data-action]');
        if (!b || !el.contains(b)) return;
        const acao = b.dataset.action;
        EG.guarda(b, async () => {
          try {
            if (acao === 'novo') modalEvento(el, null, null);
            else if (acao === 'bimestres') modalBimestres(el);
            else if (acao === 'feriados') await modalFeriados(el);
            else if (acao === 'imprimir') await imprimir(el);
          } catch (e) { EG.toast(e.message, 'erro'); }
        });
      };
    }
  });
})(window.EG);
