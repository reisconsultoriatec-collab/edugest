/* =====================================================================
 *  EduGest — Diário de Classe
 *  Conteúdo da aula + chamada (P presente · F falta · J justificada)
 *  Aula = disciplina, ou "chamada do dia" (Ed. Infantil / Fund. I)
 * ===================================================================== */
'use strict';
(function (EG) {
  let op = null;           // turmas/disciplinas permitidas
  let dados = null;        // diário carregado
  let historico = [];
  let chamada = {};        // alunoId → 'P' | 'F' | 'J'
  let rascunho = null;     // texto digitado ainda não salvo (sobrevive ao redesenho)
  let alterado = false;
  const sel = { turmaId: '', data: '', disciplinaId: '' };

  const turmaSel = () => op.turmas.find((t) => t.id === Number(sel.turmaId));
  const STATUS_ALUNO = { inativo: 'inativo', transferido: 'transferido', concluido: 'concluiu' };

  function render(el) {
    if (!op.turmas.some((t) => t.ativo)) { el.innerHTML = EG.semTurmas(op); return; }
    const t = turmaSel();
    el.innerHTML = `
      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-notebook"></i> Diário de Classe</div><div class="acoes-topo" data-area="acoes"></div></div>
        <div class="linha-3">
          <div class="campo"><label>Turma</label><select class="select" data-filtro="turma">${EG.opcoesTurmas(op.turmas, sel.turmaId)}</select></div>
          <div class="campo"><label>Data da aula</label><input class="input" type="date" data-filtro="data" max="${EG.hojeSP()}" value="${EG.esc(sel.data)}"></div>
          <div class="campo"><label>Aula</label><select class="select" data-filtro="disciplina" ${t ? '' : 'disabled'}>
            <option value="">Chamada do dia (todas as aulas)</option>
            ${t ? t.disciplinas.map((d) => `<option value="${d.id}" ${String(d.id) === String(sel.disciplinaId) ? 'selected' : ''}>${EG.esc(d.nome)}</option>`).join('') : ''}
          </select></div>
        </div>
        <div data-area="aula">${t ? '<div class="vazio"><div class="spinner pequeno" style="margin:0 auto"></div></div>' : '<div class="vazio"><i class="ti ti-notebook"></i>Selecione a turma</div>'}</div>
      </div>
      <div class="card" data-area="historico" ${t ? '' : 'hidden'}></div>`;
  }

  function contagem() {
    const c = { P: 0, F: 0, J: 0 };
    Object.values(chamada).forEach((s) => { c[s] += 1; });
    c.sem = dados.alunos.length - (c.P + c.F + c.J);
    return c;
  }

  function renderAula(el) {
    const area = EG.$('[data-area="aula"]', el);
    if (!dados) return;
    const c = contagem();
    const d = dados.diario;
    EG.$('[data-area="acoes"]', el).innerHTML = `
      <button class="btn btn-secundario" data-action="todos-presentes" ${dados.alunos.length ? '' : 'disabled'}><i class="ti ti-checks"></i> Todos presentes</button>
      ${d ? '<button class="btn btn-secundario" data-action="excluir"><i class="ti ti-trash"></i> Excluir registro</button>' : ''}
      <button class="btn btn-primario" data-action="salvar"><i class="ti ti-device-floppy"></i> Salvar diário</button>`;
    area.innerHTML = `
      <div class="sub" style="margin-bottom:12px">${d
        ? `<i class="ti ti-circle-check" style="color:var(--ok)"></i> Registrado por <strong>${EG.esc(d.registradoPor || '—')}</strong> · última alteração em ${EG.dataHora(d.atualizadoEm)}`
        : '<i class="ti ti-circle-plus"></i> Nenhum registro nesta data — preencha e salve.'}</div>
      <div class="campo"><label>Conteúdo ministrado</label>
        <textarea class="textarea" data-campo="conteudo" maxlength="2000" rows="3" placeholder="Descreva o conteúdo da aula...">${EG.esc(rascunho !== null ? rascunho : (d ? d.conteudo : ''))}</textarea></div>
      <div class="rotulo" style="margin:6px 0 10px">Chamada · ${dados.alunos.length} aluno(s) <span data-area="contagem" style="text-transform:none;letter-spacing:0">${textoContagem(c)}</span></div>
      ${dados.alunos.length ? `<div class="chamada">${dados.alunos.map((a, i) => `
        <div class="chamada-linha" data-aluno="${a.id}">
          <span class="num">${i + 1}</span>
          <span class="nome"><strong>${EG.esc(a.nome)}</strong> <small>${EG.esc(a.ra)}</small>
            ${STATUS_ALUNO[a.status] ? `<span class="selo selo-neutro">${STATUS_ALUNO[a.status]}</span>` : ''}</span>
          ${['P', 'F', 'J'].map((s) => `<button class="att ${s} ${chamada[a.id] === s ? 'on' : ''}" data-action="marcar" data-status="${s}"
            title="${s === 'P' ? 'Presente' : s === 'F' ? 'Falta' : 'Falta justificada'}">${s}</button>`).join('')}
        </div>`).join('')}</div>`
        : '<div class="vazio"><i class="ti ti-users"></i>Nenhum aluno ativo nesta turma</div>'}`;
  }

  function textoContagem(c) {
    return `· <span style="color:var(--ok)">${c.P} P</span> · <span style="color:var(--erro)">${c.F} F</span> · <span style="color:var(--aviso)">${c.J} J</span>`
      + (c.sem ? ` · <span style="color:var(--muted)">${c.sem} sem marcação</span>` : '');
  }

  function renderHistorico(el) {
    const area = EG.$('[data-area="historico"]', el);
    if (!area) return;
    area.hidden = false;
    area.innerHTML = `
      <div class="card-cab"><div class="card-titulo"><i class="ti ti-history"></i> Registros da turma</div><span class="sub">últimos ${historico.length}</span></div>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Data</th><th>Aula</th><th>Conteúdo</th><th>Chamada</th></tr></thead>
        <tbody>${historico.map((h) => `<tr data-hist="${h.id}" data-data="${h.data}" data-disc="${h.disciplinaId || ''}" style="cursor:pointer">
          <td style="white-space:nowrap">${EG.data(h.data)}</td>
          <td>${EG.esc(h.disciplina || 'Chamada do dia')}</td>
          <td><span class="sub">${EG.esc(h.conteudo || '—')}</span></td>
          <td style="white-space:nowrap"><span style="color:var(--ok)">${h.presentes} P</span> · <span style="color:var(--erro)">${h.faltas} F</span> · <span style="color:var(--aviso)">${h.justificadas} J</span></td>
        </tr>`).join('') || '<tr><td colspan="4"><div class="vazio">Nenhum registro ainda</div></td></tr>'}</tbody>
      </table></div>`;
  }

  async function carregarAula(el) {
    const area = EG.$('[data-area="aula"]', el);
    dados = null;
    rascunho = null;
    alterado = false;
    const acoes = EG.$('[data-area="acoes"]', el);
    if (acoes) acoes.innerHTML = '';
    if (!sel.turmaId || !sel.data) return;
    try {
      const q = `?turmaId=${sel.turmaId}&data=${sel.data}&disciplinaId=${sel.disciplinaId || ''}`;
      const [d, h] = await Promise.all([EG.api('GET', '/diario' + q), EG.api('GET', `/diario/historico?turmaId=${sel.turmaId}`)]);
      dados = d;
      historico = h;
      chamada = {};
      d.alunos.forEach((a) => { if (a.presenca) chamada[a.id] = a.presenca; });
      renderAula(el);
      renderHistorico(el);
    } catch (e) {
      area.innerHTML = `<div class="msg-erro">${EG.esc(e.message)}</div>`;
    }
  }

  async function podeDescartar() {
    if (!alterado) return true;
    return EG.confirmar('Há alterações não salvas neste diário. Deseja descartá-las?', { textoOk: 'Descartar' });
  }

  function escolherTurma(id) {
    sel.turmaId = id;
    const t = turmaSel();
    // Professor: começa pela disciplina dele; demais: chamada do dia
    sel.disciplinaId = t && op.restrito && t.disciplinas.length ? String(t.disciplinas[0].id) : '';
  }

  async function aoClicar(ev, el) {
    const b = ev.target.closest('[data-action], [data-hist]');
    if (!b || !el.contains(b)) return;
    try {
      if (b.dataset.hist) {
        if (!(await podeDescartar())) return;
        sel.data = b.dataset.data;
        sel.disciplinaId = b.dataset.disc;
        render(el); await carregarAula(el);
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const acao = b.dataset.action;
      if (acao === 'marcar') {
        const id = Number(b.closest('[data-aluno]').dataset.aluno);
        chamada[id] = b.dataset.status;
        alterado = true;
        b.parentElement.querySelectorAll('.att').forEach((x) => x.classList.toggle('on', x === b));
        EG.$('[data-area="contagem"]', el).innerHTML = textoContagem(contagem());
      } else if (acao === 'todos-presentes') {
        dados.alunos.forEach((a) => { chamada[a.id] = 'P'; });
        alterado = true;
        renderAula(el);
      } else if (acao === 'salvar') {
        await EG.guarda(b, async () => {
          const conteudo = EG.$('[data-campo="conteudo"]', el).value.trim();
          const c = contagem();
          if (c.sem && Object.keys(chamada).length
            && !(await EG.confirmar(`${c.sem} aluno(s) ficaram sem marcação na chamada. Salvar mesmo assim?`, { textoOk: 'Salvar' }))) return;
          await EG.api('PUT', '/diario', { turmaId: Number(sel.turmaId), data: sel.data, disciplinaId: sel.disciplinaId || null, conteudo, chamada });
          EG.toast('Diário salvo');
          await carregarAula(el);
        });
      } else if (acao === 'excluir') {
        if (!(await EG.confirmar('Excluir o registro desta aula, com o conteúdo e a chamada?', { perigo: true, textoOk: 'Excluir' }))) return;
        await EG.api('DELETE', `/diario/${dados.diario.id}`);
        EG.toast('Registro excluído');
        await carregarAula(el);
      }
    } catch (e) { EG.toast(e.message, 'erro'); }
  }

  async function aoMudar(ev, el) {
    const f = ev.target.dataset.filtro;
    if (!f) return;
    if (!(await podeDescartar())) {
      ev.target.value = f === 'turma' ? sel.turmaId : f === 'data' ? sel.data : sel.disciplinaId;
      return;
    }
    if (f === 'turma') escolherTurma(ev.target.value);
    else if (f === 'data') sel.data = ev.target.value;
    else if (f === 'disciplina') sel.disciplinaId = ev.target.value;
    render(el);
    await carregarAula(el);
  }

  EG.registrarModulo('diario', {
    async render(el) {
      op = await EG.opcoesPedagogicas();
      EG.filtrosDaSessao(sel, { turmaId: '', data: '', disciplinaId: '' });
      if (!sel.data || sel.data > EG.hojeSP()) sel.data = EG.hojeSP();
      if (!op.turmas.some((t) => t.id === Number(sel.turmaId) && t.ativo)) {
        const primeira = op.turmas.find((t) => t.ativo);
        escolherTurma(primeira ? String(primeira.id) : '');
      }
      render(el);
      await carregarAula(el);
      el.onclick = (ev) => aoClicar(ev, el);
      el.onchange = (ev) => aoMudar(ev, el);
      el.oninput = (ev) => {
        if (ev.target.dataset.campo === 'conteudo') { rascunho = ev.target.value; alterado = true; }
      };
    }
  });
})(window.EG);
