/* =====================================================================
 *  EduGest — Turmas e Séries
 * ===================================================================== */
'use strict';
(function (EG) {
  let turmas = [];
  let filtroAno = null;
  let chave = null; // usuário + colégio dos filtros guardados
  let filtroPeriodo = '';

  async function carregar(el) {
    if (!filtroAno) filtroAno = EG.estado.colegio.config.anoLetivo;
    turmas = await EG.api('GET', '/turmas');
    const anos = [...new Set([EG.estado.colegio.config.anoLetivo, ...turmas.map((t) => t.anoLetivo)])].sort((a, b) => b - a);
    const lista = turmas
      .filter((t) => t.anoLetivo === Number(filtroAno))
      .filter((t) => !filtroPeriodo || t.periodo === filtroPeriodo)
      .sort((a, b) => (b.ativo - a.ativo) || (EG.SERIES.indexOf(a.serie) - EG.SERIES.indexOf(b.serie)) || a.nome.localeCompare(b.nome));
    const podeEditar = EG.pode('turmas');
    const totalAlunos = lista.filter((t) => t.ativo).reduce((s, t) => s + t.alunos, 0);
    const totalVagas = lista.filter((t) => t.ativo).reduce((s, t) => s + t.capacidade, 0);

    el.innerHTML = `
      <div class="card">
        <div class="card-cab">
          <div class="card-titulo"><i class="ti ti-layout-grid"></i> Turmas de ${EG.esc(filtroAno)}</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <select class="select" data-filtro="ano" style="width:auto">${EG.opcoes(anos.map((a) => ({ value: a, label: 'Ano letivo ' + a })), filtroAno)}</select>
            ${podeEditar ? '<button class="btn btn-primario" data-action="nova"><i class="ti ti-plus"></i> Nova turma</button>' : ''}
          </div>
        </div>
        <div class="filtros">
          <button class="chip ${!filtroPeriodo ? 'ativo' : ''}" data-action="periodo" data-periodo="">Todos</button>
          ${Object.entries(EG.PERIODOS).map(([k, r]) => `<button class="chip ${filtroPeriodo === k ? 'ativo' : ''}" data-action="periodo" data-periodo="${k}">${r}</button>`).join('')}
          <span class="sub" style="margin-left:auto;align-self:center">${lista.filter((t) => t.ativo).length} turma(s) ativa(s) · ${totalAlunos} aluno(s) · ${Math.max(totalVagas - totalAlunos, 0)} vaga(s)</span>
        </div>
        ${lista.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px">${lista.map((t) => cartao(t, podeEditar)).join('')}</div>`
          : `<div class="vazio"><i class="ti ti-layout-grid"></i>Nenhuma turma em ${EG.esc(filtroAno)}${podeEditar ? '<br><br><button class="btn btn-primario btn-pequeno" data-action="nova"><i class="ti ti-plus"></i> Criar a primeira turma</button>' : ''}</div>`}
      </div>`;
  }

  function cartao(t, podeEditar) {
    const pct = t.capacidade ? Math.min(100, Math.round((t.alunos / t.capacidade) * 100)) : 0;
    const cor = pct >= 100 ? 'var(--erro)' : pct > 85 ? 'var(--aviso)' : 'var(--ok)';
    return `<div class="card" data-id="${t.id}" style="margin:0;${t.ativo ? '' : 'opacity:.6'}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
        <strong class="fonte-titulo" style="font-size:16px">${EG.esc(t.nome)}</strong>
        ${t.ativo ? `<span class="selo selo-info">${EG.esc(EG.PERIODOS[t.periodo] || t.periodo)}</span>` : '<span class="selo selo-neutro">inativa</span>'}
      </div>
      <div class="sub" style="margin-bottom:10px">${EG.esc(t.serie)} · ${EG.esc(t.sala || 'sem sala')}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="flex:1;height:6px;background:var(--bg);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${cor}"></div></div>
        <span style="font-size:12px;font-weight:600;color:var(--text-2)">${t.alunos}/${t.capacidade}</span>
      </div>
      <div class="sub" style="margin-top:8px"><i class="ti ti-user-check"></i> ${t.atribuicoes} de ${totalDisciplinas()} disciplina(s) com professor</div>
      <div style="display:flex;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid var(--border);flex-wrap:wrap">
        ${EG.pode('alunos') ? '<button class="btn btn-secundario btn-pequeno" data-action="ver-alunos"><i class="ti ti-users"></i> Alunos</button>' : ''}
        ${podeEditar ? `<button class="btn btn-secundario btn-pequeno" data-action="professores"><i class="ti ti-user-check"></i> Professores</button>
          <button class="btn btn-secundario btn-pequeno" data-action="editar"><i class="ti ti-edit"></i> Editar</button>
          <button class="btn-icone" data-action="alternar" title="${t.ativo ? 'Desativar' : 'Reativar'}"><i class="ti ${t.ativo ? 'ti-archive' : 'ti-archive-off'}"></i></button>
          <button class="btn-icone perigo" data-action="excluir" title="Excluir"><i class="ti ti-trash"></i></button>` : ''}
      </div>
    </div>`;
  }

  const totalDisciplinas = () => (EG.estado.colegio.disciplinas || []).filter((d) => d.ativo).length;

  /* ---------- Atribuição de aulas: professor de cada disciplina ---------- */
  async function modalProfessores(t, el) {
    const r = await EG.api('GET', `/turmas/${t.id}/atribuicoes`);
    const opcoesProf = (disciplinaId, atual) => {
      const leciona = r.professores.filter((p) => p.disciplinas.includes(disciplinaId));
      const outros = r.professores.filter((p) => !p.disciplinas.includes(disciplinaId));
      const op = (p) => `<option value="${p.id}" ${p.id === atual ? 'selected' : ''}>${EG.esc(p.nome)}</option>`;
      return '<option value="">— sem professor —</option>'
        + (leciona.length ? `<optgroup label="Lecionam esta disciplina">${leciona.map(op).join('')}</optgroup>` : '')
        + (outros.length ? `<optgroup label="${leciona.length ? 'Outros professores' : 'Professores'}">${outros.map(op).join('')}</optgroup>` : '');
    };
    const m = EG.modal({
      titulo: `Professores · ${t.nome}`,
      largura: 620,
      corpo: r.professores.length ? `
        <p class="card-desc" style="margin:0 0 14px">Defina quem dá cada disciplina nesta turma. O professor verá esta turma no Diário e nas Notas apenas nas disciplinas atribuídas a ele.</p>
        <div class="codigo-box" style="margin-bottom:14px">
          <span class="sub" style="width:100%">Professor polivalente (Ed. Infantil / Fund. I): aplica o mesmo professor a todas as disciplinas</span>
          <select class="select" data-polivalente style="flex:1;min-width:200px"><option value="">Escolha o professor</option>${r.professores.map((p) => `<option value="${p.id}">${EG.esc(p.nome)}</option>`).join('')}</select>
          <button type="button" class="btn btn-secundario btn-pequeno" data-aplicar-todas><i class="ti ti-copy-check"></i> Aplicar a todas</button>
        </div>
        ${r.disciplinas.map((d) => `<div class="disciplina-linha" data-disciplina="${d.id}">
          <span style="flex:1;font-weight:500">${EG.esc(d.nome)}</span>
          <select class="select" style="flex:1.4">${opcoesProf(d.id, d.professorId)}</select>
        </div>`).join('')}`
        : '<div class="vazio"><i class="ti ti-user-off"></i>Nenhum professor ativo cadastrado.<br>Cadastre os professores em <strong>Professores</strong>.</div>',
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        ...(r.professores.length ? [{ texto: 'Salvar', classe: 'btn-primario', icone: 'ti-device-floppy', acao: async () => {
          const atribuicoes = EG.$$('[data-disciplina]', m.el).map((linha) => ({
            disciplinaId: Number(linha.dataset.disciplina),
            professorId: linha.querySelector('select').value ? Number(linha.querySelector('select').value) : null
          }));
          await EG.api('PUT', `/turmas/${t.id}/atribuicoes`, { atribuicoes });
          m.fechar(); EG.toast('Professores da turma salvos'); carregar(el);
        } }] : [])
      ]
    });
    m.el.addEventListener('click', (ev) => {
      if (!ev.target.closest('[data-aplicar-todas]')) return;
      const id = m.el.querySelector('[data-polivalente]').value;
      if (!id) { m.erro('Escolha o professor polivalente.'); return; }
      m.erro('');
      EG.$$('[data-disciplina] select', m.el).forEach((s) => { s.value = id; });
    });
  }

  function modalTurma(t, el) {
    const nova = !t;
    t = t || { periodo: 'matutino', capacidade: 35, anoLetivo: Number(filtroAno) };
    const series = EG.SERIES.includes(t.serie) || !t.serie ? EG.SERIES : [t.serie, ...EG.SERIES];
    const m = EG.modal({
      titulo: nova ? 'Nova turma' : `Editar ${t.nome}`,
      corpo: `
        <div class="linha-2">
          <div class="campo"><label>Nome da turma *</label><input class="input" name="nome" maxlength="50" placeholder="Ex.: 5º Ano A" value="${EG.esc(t.nome)}"></div>
          <div class="campo"><label>Série</label><select class="select" name="serie">${EG.opcoes(series.map((s) => ({ value: s, label: s })), t.serie || '1º Ano')}</select></div>
        </div>
        <div class="linha-3">
          <div class="campo"><label>Período</label><select class="select" name="periodo">${EG.opcoes(Object.entries(EG.PERIODOS).map(([k, r]) => ({ value: k, label: r })), t.periodo)}</select></div>
          <div class="campo"><label>Capacidade</label><input class="input" type="number" name="capacidade" min="1" max="200" value="${EG.esc(t.capacidade)}"></div>
          <div class="campo"><label>Ano letivo</label><input class="input" type="number" name="anoLetivo" min="2000" max="2100" value="${EG.esc(t.anoLetivo)}"></div>
        </div>
        <div class="campo"><label>Sala</label><input class="input" name="sala" maxlength="30" placeholder="Ex.: Sala 12" value="${EG.esc(t.sala)}"></div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Salvar', classe: 'btn-primario', icone: 'ti-device-floppy', acao: async () => {
          const d = EG.lerForm(m.el);
          if (nova) await EG.api('POST', '/turmas', d); else await EG.api('PUT', `/turmas/${t.id}`, d);
          filtroAno = Number(d.anoLetivo) || filtroAno;
          m.fechar(); EG.toast(nova ? 'Turma criada' : 'Turma atualizada'); carregar(el);
        } }
      ]
    });
  }

  async function aoClicar(ev, el) {
    const b = ev.target.closest('[data-action]');
    if (!b || !el.contains(b)) return;
    const caixa = b.closest('[data-id]');
    const t = caixa ? turmas.find((x) => x.id === Number(caixa.dataset.id)) : null;
    const acao = b.dataset.action;
    try {
      if (acao === 'nova') modalTurma(null, el);
      else if (acao === 'editar') modalTurma(t, el);
      else if (acao === 'professores') await modalProfessores(t, el);
      else if (acao === 'periodo') { filtroPeriodo = b.dataset.periodo; await carregar(el); }
      else if (acao === 'ver-alunos') { EG.filtroInicialAlunos = { turmaId: t.id }; EG.navegar('alunos'); }
      else if (acao === 'alternar') {
        if (t.ativo && !(await EG.confirmar(`Desativar a turma ${t.nome}?\n\nEla sai das listas de seleção, mas o histórico é mantido. Você pode reativá-la depois.`, { textoOk: 'Desativar' }))) return;
        await EG.api('PUT', `/turmas/${t.id}`, { ativo: !t.ativo });
        EG.toast(t.ativo ? 'Turma desativada' : 'Turma reativada'); await carregar(el);
      } else if (acao === 'excluir') {
        if (await EG.excluirComConfirmacao(`/turmas/${t.id}`, `Excluir a turma ${t.nome}?`)) { EG.toast('Turma excluída'); await carregar(el); }
      }
    } catch (e) { EG.toast(e.message, 'erro'); }
  }

  EG.registrarModulo('turmas', {
    async render(el) {
      filtroPeriodo = '';
      if (chave !== EG.chaveSessao()) { chave = EG.chaveSessao(); filtroAno = null; }
      await carregar(el);
      el.onclick = (ev) => aoClicar(ev, el);
      el.onchange = (ev) => {
        if (ev.target.matches('[data-filtro="ano"]')) { filtroAno = Number(ev.target.value); carregar(el).catch((e) => EG.toast(e.message, 'erro')); }
      };
    }
  });
})(window.EG);
