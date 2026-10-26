/* =====================================================================
 *  EduGest — Grade horária   [módulo grade]
 *  Turmas (montar a semana) · Professores (semana de cada um) ·
 *  Horários (aulas e intervalos de cada turno).
 *  Coordenação monta e altera; professor consulta ("Minha grade").
 *  EG.gradeTabela também desenha a grade no Portal do Responsável.
 * ===================================================================== */
'use strict';
(function (EG) {
  const DIAS = { 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };
  const min = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const hora = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  const sobrepoe = (a, b) => min(a.inicio) < min(b.fim) && min(b.inicio) < min(a.fim);
  const diaHoje = () => new Date(`${EG.hojeSP()}T12:00:00Z`).getUTCDay();

  /**
   * Tabela da grade de uma turma.
   * @param d { horarios, dias, celula(dia, h) → { disciplinaId, disciplina, professor, conflito } | null }
   * @param editavel células viram botões [data-cel="dia:horarioId"]
   */
  function tabela(d, editavel) {
    const hoje = diaHoje();
    const cores = new Map();
    const cor = (id) => { if (!cores.has(id)) cores.set(id, cores.size % 5); return cores.get(id); };
    return `<div class="tabela-wrap"><table class="grade-tab">
      <thead><tr><th>Horário</th>${d.dias.map((x) => `<th class="${x === hoje ? 'hoje' : ''}">${DIAS[x]}</th>`).join('')}</tr></thead>
      <tbody>${d.horarios.map((h) => (h.tipo === 'intervalo'
        ? `<tr class="grade-intervalo"><td>${h.inicio}–${h.fim}</td><td colspan="${d.dias.length}">Intervalo</td></tr>`
        : `<tr><td><strong>${h.rotulo}</strong><br><small class="sub">${h.inicio}–${h.fim}</small></td>${d.dias.map((x) => {
          const c = d.celula(x, h);
          const tag = editavel ? 'button' : 'div';
          const attrs = editavel ? ` data-cel="${x}:${h.id}" type="button"` : '';
          if (!c) return `<td><${tag} class="grade-cel vazia"${attrs}>${editavel ? '+' : ''}</${tag}></td>`;
          return `<td><${tag} class="grade-cel cheia ${c.conflito ? 'conflito' : `cor-${cor(c.disciplinaId || 0)}`}"${attrs} title="${EG.esc(c.conflito || '')}">
            <strong>${EG.esc(c.disciplina || '—')}</strong><small>${EG.esc(c.professor || 'sem professor')}</small></${tag}></td>`;
        }).join('')}</tr>`)).join('')}</tbody>
    </table></div>`;
  }

  /** Grade pronta (portal e consulta): dados da API → tabela. */
  EG.gradeTabela = function (r) {
    const mapa = new Map(r.celulas.map((c) => [`${c.dia}:${c.horarioId}`, c]));
    const dias = [1, 2, 3, 4, 5].concat(r.sabado ? [6] : []);
    return tabela({ horarios: r.horarios, dias, celula: (x, h) => mapa.get(`${x}:${h.id}`) || null }, false);
  };

  /** Semana de um professor: linhas por faixa de horário (vários turnos juntos). */
  function tabelaProfessor(r) {
    if (!r.aulas.length) return '<div class="vazio"><i class="ti ti-calendar-off"></i>Nenhuma aula na grade</div>';
    const faixas = [...new Map(r.aulas.map((a) => [`${a.inicio}-${a.fim}`, { inicio: a.inicio, fim: a.fim }])).values()]
      .sort((a, b) => min(a.inicio) - min(b.inicio));
    const dias = [1, 2, 3, 4, 5].concat(r.aulas.some((a) => a.dia === 6) ? [6] : []);
    const hoje = diaHoje();
    return `<div class="tabela-wrap"><table class="grade-tab">
      <thead><tr><th>Horário</th>${dias.map((x) => `<th class="${x === hoje ? 'hoje' : ''}">${DIAS[x]}</th>`).join('')}</tr></thead>
      <tbody>${faixas.map((f) => `<tr><td><small class="sub">${f.inicio}–${f.fim}</small></td>${dias.map((x) => {
        const aqui = r.aulas.filter((a) => a.dia === x && a.inicio === f.inicio && a.fim === f.fim);
        if (!aqui.length) return '<td><div class="grade-cel vazia"></div></td>';
        // Em teoria nunca há duas (a grade bloqueia conflitos); se houver, aparece em vermelho
        return `<td><div class="grade-cel cheia ${aqui.length > 1 ? 'conflito' : 'cor-0'}">${aqui.map((a) => `<strong>${EG.esc(a.turma)}</strong><small>${EG.esc(a.disciplina || '—')}</small>`).join('')}</div></td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  const imprimirCom = (el, titulo) => {
    el.querySelector('[data-impressao]').innerHTML = `<div class="boletim-cab" style="margin-bottom:10px"><h2 style="margin:0">${EG.esc(EG.estado.colegio.nome)} · ${EG.esc(titulo)}</h2></div>`;
    window.print();
  };

  /* =====================================================================
   *  Tela
   * ===================================================================== */
  const est = {};
  let opcoes = null;
  let edicao = null; // grade da turma em edição

  function abas() {
    const lista = opcoes.coordenacao
      ? [['turmas', 'Turmas', 'ti-table'], ['professores', 'Professores', 'ti-user-check'], ['horarios', 'Horários', 'ti-clock']]
      : [...(opcoes.professorId ? [['minha', 'Minha grade', 'ti-user']] : []), ['turmas', 'Turmas', 'ti-table']];
    if (!lista.some(([v]) => v === est.aba)) est.aba = lista[0][0];
    return `<div class="abas no-print">${lista.map(([v, r, i]) => `<button class="aba ${est.aba === v ? 'ativa' : ''}" data-aba="${v}"><i class="ti ${i}"></i> ${r}</button>`).join('')}</div>`;
  }

  async function desenhar(el) {
    if (edicao && edicao.alterada && !(await EG.confirmar('Há alterações na grade que ainda não foram salvas. Descartar?', { titulo: 'Grade não salva', textoOk: 'Descartar', perigo: true }))) return false;
    edicao = null;
    el.querySelector('[data-abas]').innerHTML = abas();
    const corpo = el.querySelector('[data-corpo]');
    corpo.innerHTML = '<div class="card"><div class="vazio"><div class="spinner pequeno" style="margin:0 auto"></div></div></div>';
    if (est.aba === 'turmas') await abaTurmas(el, corpo);
    else if (est.aba === 'professores') await abaProfessores(el, corpo, false);
    else if (est.aba === 'minha') await abaProfessores(el, corpo, true);
    else if (est.aba === 'horarios') await abaHorarios(el, corpo);
    return true;
  }

  /* ---------- Turmas ---------- */
  async function abaTurmas(el, corpo) {
    if (!opcoes.turmas.length) {
      corpo.innerHTML = '<div class="card"><div class="vazio"><i class="ti ti-layout-grid"></i>Nenhuma turma ativa cadastrada</div></div>';
      return;
    }
    if (!opcoes.turmas.some((t) => String(t.id) === String(est.turmaId))) est.turmaId = opcoes.turmas[0].id;
    const r = await EG.api('GET', `/grade/turmas/${est.turmaId}`);
    edicao = {
      dados: r,
      celulas: new Map(r.celulas.map((c) => [`${c.dia}:${c.horarioId}`, { disciplinaId: c.disciplinaId, professorId: c.professorId }])),
      alterada: false,
      sabado: r.sabado || !!est.sabado
    };
    desenharTurma(el, corpo);
  }

  function infoCelula(chave, h, dia) {
    const c = edicao.celulas.get(chave);
    if (!c || (!c.disciplinaId && !c.professorId)) return null;
    const d = edicao.dados;
    const disc = d.disciplinas.find((x) => x.id === c.disciplinaId);
    const prof = d.professores.find((x) => x.id === c.professorId);
    const choque = c.professorId ? d.ocupacoes.find((o) => o.professorId === c.professorId && o.dia === dia && sobrepoe(h, o)) : null;
    return {
      disciplinaId: c.disciplinaId, disciplina: disc ? disc.nome : null, professorId: c.professorId, professor: prof ? prof.nome : null,
      conflito: choque ? `${prof ? prof.nome : 'Professor'} já está no ${choque.turma} (${choque.inicio}–${choque.fim})` : null
    };
  }

  function desenharTurma(el, corpo) {
    const d = edicao.dados;
    const t = d.turma;
    const dias = [1, 2, 3, 4, 5].concat(edicao.sabado ? [6] : []);
    const aulasTurno = d.horarios.filter((h) => h.tipo === 'aula');
    const celula = (x, h) => infoCelula(`${x}:${h.id}`, h, x);
    const conflitos = [];
    const porDisc = new Map();
    aulasTurno.forEach((h) => dias.forEach((x) => {
      const c = celula(x, h);
      if (!c) return;
      if (c.conflito) conflitos.push(`${DIAS[x]}, ${h.inicio}: ${c.conflito}`);
      const k = c.disciplina || 'Sem disciplina';
      porDisc.set(k, (porDisc.get(k) || 0) + 1);
    }));
    const total = [...porDisc.values()].reduce((s, n) => s + n, 0);
    corpo.innerHTML = `<div class="card">
      <div class="card-cab no-print"><div class="card-titulo"><i class="ti ti-table"></i> Grade da turma</div>
        <div class="acoes-topo">
          <select class="select" data-turma style="width:auto">${opcoes.turmas.map((x) => `<option value="${x.id}" ${String(x.id) === String(est.turmaId) ? 'selected' : ''}>${EG.esc(x.nome)}</option>`).join('')}</select>
          <label style="display:flex;gap:6px;align-items:center;font-size:13px;cursor:pointer"><input type="checkbox" data-sabado ${edicao.sabado ? 'checked' : ''}> Sábado</label>
          <button class="btn btn-secundario" data-acao="imprimir"><i class="ti ti-printer"></i> Imprimir</button>
        </div></div>
      <p class="card-desc no-print">${EG.esc(t.nome)} · ${EG.esc(t.serie)} · turno ${EG.esc(t.periodoNome.toLowerCase())}.
        ${d.podeEditar ? 'Clique numa aula para escolher a disciplina; o professor vem das atribuições da turma.' : ''}</p>
      ${!aulasTurno.length ? `<div class="vazio"><i class="ti ti-clock"></i>O turno ${EG.esc(t.periodoNome.toLowerCase())} ainda não tem horários de aula.
          ${opcoes.coordenacao ? `<br><button class="btn btn-primario" data-acao="ir-horarios" data-periodo="${t.periodo}" style="margin-top:14px"><i class="ti ti-clock"></i> Definir horários do ${EG.esc(t.periodoNome.toLowerCase())}</button>` : ''}</div>`
        : `${conflitos.length ? `<div class="msg-erro" style="margin-bottom:14px"><strong>Conflito de horário:</strong><br>${conflitos.map((c) => EG.esc(c)).join('<br>')}</div>` : ''}
          ${tabela({ horarios: d.horarios, dias, celula }, d.podeEditar)}
          <div class="grade-resumo"><span class="sub">Aulas por semana:</span>
            ${[...porDisc.entries()].sort((a, b) => b[1] - a[1]).map(([n, q]) => `<span class="selo selo-neutro">${EG.esc(n)}: ${q}</span>`).join('') || '<span class="sub">nenhuma ainda</span>'}
            <span class="sub" style="margin-left:auto">${total} de ${aulasTurno.length * dias.length} aulas preenchidas</span></div>
          ${d.podeEditar ? `<div class="grade-acoes no-print">
            ${edicao.alterada ? '<span class="sub"><i class="ti ti-alert-circle"></i> Alterações não salvas</span><button class="btn btn-secundario" data-acao="desfazer">Desfazer</button>' : ''}
            <button class="btn btn-primario" data-acao="salvar" ${edicao.alterada ? '' : 'disabled'}><i class="ti ti-device-floppy"></i> Salvar grade</button></div>` : ''}`}
    </div>`;
  }

  function modalCelula(el, corpo, dia, horarioId) {
    const d = edicao.dados;
    const h = d.horarios.find((x) => x.id === horarioId);
    const chave = `${dia}:${horarioId}`;
    const atual = edicao.celulas.get(chave) || { disciplinaId: null, professorId: null };
    let profTocado = false;
    const m = EG.modal({
      titulo: `${DIAS[dia]} · ${h.rotulo} (${h.inicio}–${h.fim})`,
      largura: 460,
      corpo: `<div class="campo"><label>Disciplina</label><select class="select" name="disciplinaId"><option value="">— aula vazia —</option>
          ${d.disciplinas.map((x) => `<option value="${x.id}" ${x.id === atual.disciplinaId ? 'selected' : ''}>${EG.esc(x.nome)}</option>`).join('')}</select></div>
        <div class="campo"><label>Professor</label><select class="select" name="professorId"><option value="">— sem professor —</option>
          ${d.professores.map((x) => `<option value="${x.id}" ${x.id === atual.professorId ? 'selected' : ''}>${EG.esc(x.nome)}</option>`).join('')}</select>
          <small data-dica></small></div>
        <div class="msg-erro" data-choque hidden></div>`,
      botoes: [
        { texto: 'Limpar', icone: 'ti-eraser', acao: () => aplicar(null, null) },
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Aplicar', classe: 'btn-primario', icone: 'ti-check', acao: () => {
          const disc = Number(m.el.querySelector('[name=disciplinaId]').value) || null;
          const prof = Number(m.el.querySelector('[name=professorId]').value) || null;
          aplicar(disc, prof);
        } }
      ]
    });
    function aplicar(disciplinaId, professorId) {
      if (disciplinaId || professorId) edicao.celulas.set(chave, { disciplinaId, professorId });
      else edicao.celulas.delete(chave);
      edicao.alterada = true;
      m.fechar();
      desenharTurma(el, corpo);
    }
    const selDisc = m.el.querySelector('[name=disciplinaId]');
    const selProf = m.el.querySelector('[name=professorId]');
    function atualizar() {
      const disc = Number(selDisc.value) || null;
      const atrib = disc ? d.atribuicoes[disc] : null;
      m.el.querySelector('[data-dica]').textContent = !disc ? ''
        : atrib ? (Number(selProf.value) === atrib ? 'Professor da atribuição da turma.' : 'A atribuição desta disciplina é de outro professor.')
          : 'Esta disciplina ainda não tem professor atribuído na turma (Turmas › atribuições).';
      const prof = Number(selProf.value) || null;
      const choque = prof ? d.ocupacoes.find((o) => o.professorId === prof && o.dia === dia && sobrepoe(h, o)) : null;
      const caixa = m.el.querySelector('[data-choque]');
      caixa.hidden = !choque;
      if (choque) caixa.textContent = `Atenção: este professor já está no ${choque.turma} das ${choque.inicio} às ${choque.fim}. A grade não poderá ser salva assim.`;
    }
    selDisc.addEventListener('change', () => {
      const disc = Number(selDisc.value) || null;
      if (!profTocado) selProf.value = disc && d.atribuicoes[disc] ? String(d.atribuicoes[disc]) : (disc ? selProf.value : '');
      atualizar();
    });
    selProf.addEventListener('change', () => { profTocado = true; atualizar(); });
    atualizar();
  }

  async function salvarTurma(el, corpo) {
    const d = edicao.dados;
    const aulasTurno = d.horarios.filter((h) => h.tipo === 'aula');
    const dias = [1, 2, 3, 4, 5, 6];
    const temConflito = aulasTurno.some((h) => dias.some((x) => { const c = infoCelula(`${x}:${h.id}`, h, x); return c && c.conflito; }));
    if (temConflito) throw EG.erro('Resolva os conflitos de horário (em vermelho) antes de salvar.');
    const celulas = [...edicao.celulas.entries()].map(([k, c]) => {
      const [dia, horarioId] = k.split(':').map(Number);
      return { dia, horarioId, disciplinaId: c.disciplinaId, professorId: c.professorId };
    }).filter((c) => edicao.sabado || c.dia !== 6);
    const r = await EG.api('PUT', `/grade/turmas/${d.turma.id}`, { celulas });
    EG.toast(`Grade do ${d.turma.nome} salva (${r.aulas} aulas)`);
    opcoes = await EG.api('GET', '/grade/opcoes');
    edicao.alterada = false;
    await abaTurmas(el, corpo);
  }

  /* ---------- Professores / Minha grade ---------- */
  async function abaProfessores(el, corpo, minha) {
    let r;
    if (minha) {
      r = await EG.api('GET', '/grade/minha');
    } else {
      if (!opcoes.professores.length) { corpo.innerHTML = '<div class="card"><div class="vazio"><i class="ti ti-user-check"></i>Nenhum professor ativo</div></div>'; return; }
      if (!opcoes.professores.some((p) => String(p.id) === String(est.professorId))) {
        est.professorId = (opcoes.professores.find((p) => p.aulas) || opcoes.professores[0]).id;
      }
      r = await EG.api('GET', `/grade/professores/${est.professorId}`);
    }
    const p = r.professor;
    corpo.innerHTML = `<div class="card">
      <div class="card-cab no-print"><div class="card-titulo"><i class="ti ti-user-check"></i> ${minha ? 'Minha grade' : 'Grade do professor'}</div>
        <div class="acoes-topo">
          ${minha ? '' : `<select class="select" data-professor style="width:auto">${opcoes.professores.map((x) => `<option value="${x.id}" ${String(x.id) === String(est.professorId) ? 'selected' : ''}>${EG.esc(x.nome)} (${x.aulas} aula${x.aulas === 1 ? '' : 's'})</option>`).join('')}</select>`}
          <button class="btn btn-secundario" data-acao="imprimir"><i class="ti ti-printer"></i> Imprimir</button>
        </div></div>
      ${minha && !r.vinculado ? '<div class="vazio"><i class="ti ti-link-off"></i>Seu login ainda não está ligado a um cadastro de professor. Peça ao administrador (Sistema › Usuários).</div>' : `
        <p class="card-desc"><strong>${EG.esc(p.nome)}</strong> · ${r.total} aula(s) por semana${p.cargaHoraria ? ` · carga horária do cadastro: ${p.cargaHoraria} h/semana` : ''}</p>
        ${tabelaProfessor(r)}`}
    </div>`;
    corpo.dataset.titulo = minha || !p ? 'Minha grade' : `Grade de ${p.nome}`;
  }

  /* ---------- Horários dos turnos ---------- */
  let horarios = null;
  async function abaHorarios(el, corpo) {
    est.periodo = est.periodo || 'matutino';
    const r = await EG.api('GET', '/grade/horarios');
    horarios = r.horarios;
    desenharHorarios(el, corpo, horarios[est.periodo].map((h) => ({ ...h })));
  }

  function desenharHorarios(el, corpo, linhas) {
    const periodos = opcoes.periodos;
    corpo.innerHTML = `<div class="card">
      <div class="card-cab"><div class="card-titulo"><i class="ti ti-clock"></i> Horários das aulas</div></div>
      <p class="card-desc">Cada turma usa os horários do seu turno. Ao mudar um horário, as aulas marcadas nele continuam na grade.</p>
      <div class="filtros">${periodos.map((x) => `<button class="chip ${est.periodo === x.id ? 'ativo' : ''}" data-periodo="${x.id}">${x.nome}${x.aulas ? ` (${x.aulas})` : ''}</button>`).join('')}</div>
      ${linhas.length ? `<div class="tabela-wrap"><table class="horarios-tab">
        <thead><tr><th>#</th><th>Tipo</th><th>Início</th><th>Fim</th><th>Na grade</th><th></th></tr></thead>
        <tbody>${linhas.map((h, i) => `<tr data-linha="${i}">
          <td>${h.tipo === 'aula' ? `${linhas.slice(0, i + 1).filter((x) => x.tipo === 'aula').length}ª` : '—'}</td>
          <td><select class="select" data-campo="tipo"><option value="aula" ${h.tipo === 'aula' ? 'selected' : ''}>Aula</option><option value="intervalo" ${h.tipo === 'intervalo' ? 'selected' : ''}>Intervalo</option></select></td>
          <td><input class="input" type="time" data-campo="inicio" value="${h.inicio}"></td>
          <td><input class="input" type="time" data-campo="fim" value="${h.fim}"></td>
          <td>${h.aulasNaGrade ? `<span class="selo selo-info">${h.aulasNaGrade} aula(s)</span>` : '<span class="sub">—</span>'}</td>
          <td class="acoes"><button class="btn-icone perigo" data-remover="${i}" title="Remover"><i class="ti ti-trash"></i></button></td></tr>`).join('')}</tbody>
      </table></div>` : `<div class="vazio"><i class="ti ti-clock"></i>Nenhum horário no turno ${periodos.find((x) => x.id === est.periodo).nome.toLowerCase()}.
          <br>Use <strong>Gerar automaticamente</strong> ou adicione as aulas uma a uma.</div>`}
      <div class="grade-acoes">
        <button class="btn btn-secundario" data-acao="add-aula"><i class="ti ti-plus"></i> Aula</button>
        <button class="btn btn-secundario" data-acao="add-intervalo"><i class="ti ti-coffee"></i> Intervalo</button>
        <button class="btn btn-secundario" data-acao="gerar"><i class="ti ti-wand"></i> Gerar automaticamente</button>
        <button class="btn btn-primario" data-acao="salvar-horarios"><i class="ti ti-device-floppy"></i> Salvar horários</button>
      </div>
    </div>`;
    corpo._linhas = linhas;
  }

  /** Lê a tabela de horários da tela (com o que foi digitado). */
  function lerLinhas(corpo) {
    return (corpo._linhas || []).map((h, i) => {
      const tr = corpo.querySelector(`[data-linha="${i}"]`);
      return tr ? { ...h, tipo: tr.querySelector('[data-campo=tipo]').value, inicio: tr.querySelector('[data-campo=inicio]').value, fim: tr.querySelector('[data-campo=fim]').value } : h;
    });
  }

  function modalGerar(el, corpo) {
    const m = EG.modal({
      titulo: 'Gerar horários automaticamente',
      largura: 480,
      corpo: `<div class="linha-2">
          <div class="campo"><label>Primeira aula começa às</label><input class="input" type="time" name="inicio" value="${est.periodo === 'vespertino' ? '13:00' : est.periodo === 'noturno' ? '19:00' : '07:00'}"></div>
          <div class="campo"><label>Duração da aula (min)</label><input class="input" type="number" name="duracao" min="20" max="120" value="50"></div>
        </div>
        <div class="linha-2">
          <div class="campo"><label>Número de aulas</label><input class="input" type="number" name="aulas" min="1" max="12" value="${est.periodo === 'integral' ? 9 : est.periodo === 'noturno' ? 4 : 5}"></div>
          <div class="campo"><label>Intervalo depois da</label><select class="select" name="apos"><option value="0">sem intervalo</option>
            ${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option value="${n}" ${n === 3 ? 'selected' : ''}>${n}ª aula</option>`).join('')}</select></div>
        </div>
        <div class="campo"><label>Duração do intervalo (min)</label><input class="input" type="number" name="intervalo" min="5" max="120" value="20" style="max-width:160px"></div>
        <small class="sub">Substitui a lista do turno. As aulas já marcadas na grade continuam nas mesmas posições (1ª aula, 2ª aula…).</small>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Gerar', classe: 'btn-primario', icone: 'ti-wand', acao: () => {
          const d = EG.lerForm(m.el);
          const dur = Number(d.duracao), n = Number(d.aulas), apos = Number(d.apos), iv = Number(d.intervalo);
          if (!d.inicio || !(dur >= 20 && dur <= 120) || !(n >= 1 && n <= 12) || (apos && !(iv >= 5 && iv <= 120))) throw EG.erro('Confira os valores.');
          const novas = [];
          let t = min(d.inicio);
          for (let i = 1; i <= n; i++) {
            novas.push({ tipo: 'aula', inicio: hora(t), fim: hora(t + dur) }); t += dur;
            if (i === apos && i < n) { novas.push({ tipo: 'intervalo', inicio: hora(t), fim: hora(t + iv) }); t += iv; }
          }
          if (t > 24 * 60) throw EG.erro('Os horários passam da meia-noite.');
          // Reaproveita os horários existentes pela posição (as aulas da grade continuam no lugar)
          const atuais = lerLinhas(corpo);
          novas.forEach((x, i) => { if (atuais[i]) { x.id = atuais[i].id; x.aulasNaGrade = atuais[i].aulasNaGrade; } });
          m.fechar();
          desenharHorarios(el, corpo, novas);
          EG.toast('Horários gerados. Confira e clique em Salvar horários.', 'info');
        } }
      ]
    });
  }

  async function salvarHorarios(el, corpo) {
    const linhas = lerLinhas(corpo);
    const ficam = new Set(linhas.filter((h) => h.id).map((h) => h.id));
    const perdidas = horarios[est.periodo].filter((h) => !ficam.has(h.id)).reduce((s, h) => s + (h.aulasNaGrade || 0), 0)
      + linhas.filter((h) => h.id && h.tipo === 'intervalo').reduce((s, h) => s + (h.aulasNaGrade || 0), 0);
    if (perdidas && !(await EG.confirmar(`${perdidas} aula(s) marcada(s) na grade estão em horários que serão removidos ou viraram intervalo, e vão sair da grade.\n\nContinuar?`,
      { titulo: 'Aulas serão removidas', textoOk: 'Salvar mesmo assim', perigo: true }))) return;
    const r = await EG.api('PUT', `/grade/horarios/${est.periodo}`, { horarios: linhas.map((h) => ({ id: h.id || null, tipo: h.tipo, inicio: h.inicio, fim: h.fim })) });
    EG.toast(`Horários salvos${r.aulasRemovidas ? ` · ${r.aulasRemovidas} aula(s) saíram da grade` : ''}`);
    opcoes = await EG.api('GET', '/grade/opcoes');
    await abaHorarios(el, corpo);
  }

  EG.registrarModulo('grade', {
    async render(el) {
      EG.filtrosDaSessao(est, { aba: null, turmaId: '', professorId: '', periodo: 'matutino', sabado: false });
      edicao = null;
      opcoes = await EG.api('GET', '/grade/opcoes');
      el.innerHTML = '<div data-abas></div><div data-corpo></div><div class="so-print-bloco" data-impressao></div>';
      await desenhar(el);
      const corpo = el.querySelector('[data-corpo]');

      el.onchange = async (ev) => {
        const t = ev.target;
        try {
          if (t.matches('[data-turma]')) {
            const antes = est.turmaId;
            est.turmaId = t.value;
            if (!(await desenhar(el))) { est.turmaId = antes; t.value = antes; }
          } else if (t.matches('[data-professor]')) { est.professorId = t.value; await desenhar(el); }
          else if (t.matches('[data-sabado]')) { est.sabado = t.checked; edicao.sabado = t.checked; desenharTurma(el, corpo); }
        } catch (e) { EG.toast(e.message, 'erro'); }
      };
      el.onclick = (ev) => {
        const t = ev.target;
        const aba = t.closest('[data-aba]');
        if (aba) { const antes = est.aba; est.aba = aba.dataset.aba; desenhar(el).then((ok) => { if (!ok) { est.aba = antes; } }).catch((e) => EG.toast(e.message, 'erro')); return; }
        const cel = t.closest('[data-cel]');
        if (cel && edicao) { const [dia, h] = cel.dataset.cel.split(':').map(Number); modalCelula(el, corpo, dia, h); return; }
        const per = t.closest('[data-periodo]');
        if (per && !t.closest('[data-acao]')) { est.periodo = per.dataset.periodo; desenharHorarios(el, corpo, horarios[est.periodo].map((h) => ({ ...h }))); return; }
        const rem = t.closest('[data-remover]');
        if (rem) { const l = lerLinhas(corpo); l.splice(Number(rem.dataset.remover), 1); desenharHorarios(el, corpo, l); return; }
        const b = t.closest('[data-acao]');
        if (!b) return;
        EG.guarda(b, async () => {
          try {
            const acao = b.dataset.acao;
            if (acao === 'salvar') await salvarTurma(el, corpo);
            else if (acao === 'desfazer') { edicao.alterada = false; await abaTurmas(el, corpo); }
            else if (acao === 'imprimir') imprimirCom(el, est.aba === 'turmas' ? `Grade horária · ${edicao.dados.turma.nome}` : (corpo.dataset.titulo || 'Grade'));
            else if (acao === 'ir-horarios') { est.periodo = b.dataset.periodo; est.aba = 'horarios'; await desenhar(el); }
            else if (acao === 'add-aula' || acao === 'add-intervalo') {
              const l = lerLinhas(corpo);
              const ult = l[l.length - 1];
              const ini = ult ? min(ult.fim) : (est.periodo === 'vespertino' ? 13 * 60 : est.periodo === 'noturno' ? 19 * 60 : 7 * 60);
              const dur = acao === 'add-aula' ? 50 : 20;
              l.push({ tipo: acao === 'add-aula' ? 'aula' : 'intervalo', inicio: hora(ini), fim: hora(Math.min(ini + dur, 23 * 60 + 59)) });
              desenharHorarios(el, corpo, l);
            } else if (acao === 'gerar') modalGerar(el, corpo);
            else if (acao === 'salvar-horarios') await salvarHorarios(el, corpo);
          } catch (e) { EG.toast(e.message, 'erro'); }
        });
      };
    }
  });

  // Ao sair da tela com a grade alterada e não salva, avisa
  window.addEventListener('beforeunload', (ev) => { if (edicao && edicao.alterada) { ev.preventDefault(); ev.returnValue = ''; } });
})(window.EG);
