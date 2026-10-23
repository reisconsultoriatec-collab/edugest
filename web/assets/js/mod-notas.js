/* =====================================================================
 *  EduGest — Lançamento de Notas
 *  Nota 1 · Nota 2 · Trabalho por bimestre. Média = média das notas
 *  lançadas (em branco não conta como zero), 1 casa decimal.
 * ===================================================================== */
'use strict';
(function (EG) {
  let op = null;
  let dados = null;
  let alterado = false;
  const sel = { turmaId: '', disciplinaId: '', bimestre: '' };
  const CAMPOS = [['n1', 'Nota 1'], ['n2', 'Nota 2'], ['trabalho', 'Trabalho']];

  const turmaSel = () => op.turmas.find((t) => t.id === Number(sel.turmaId));

  function render(el) {
    if (!op.turmas.some((t) => t.ativo)) { el.innerHTML = EG.semTurmas(op); return; }
    const t = turmaSel();
    el.innerHTML = `
      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-list-numbers"></i> Lançamento de Notas</div></div>
        <div class="linha-3">
          <div class="campo"><label>Turma</label><select class="select" data-filtro="turma">${EG.opcoesTurmas(op.turmas, sel.turmaId)}</select></div>
          <div class="campo"><label>Disciplina</label><select class="select" data-filtro="disciplina" ${t ? '' : 'disabled'}>
            ${t && t.disciplinas.length ? t.disciplinas.map((d) => `<option value="${d.id}" ${String(d.id) === String(sel.disciplinaId) ? 'selected' : ''}>${EG.esc(d.nome)}${d.professor && !op.restrito ? ' — ' + EG.esc(d.professor) : ''}</option>`).join('') : '<option value="">Nenhuma disciplina</option>'}
          </select></div>
          <div class="campo"><label>Bimestre</label><select class="select" data-filtro="bimestre">
            ${[1, 2, 3, 4].map((b) => `<option value="${b}" ${String(b) === String(sel.bimestre) ? 'selected' : ''}>${b}º bimestre</option>`).join('')}
          </select></div>
        </div>
        <div data-area="planilha">${t ? '<div class="vazio"><div class="spinner pequeno" style="margin:0 auto"></div></div>' : '<div class="vazio"><i class="ti ti-list-numbers"></i>Selecione a turma</div>'}</div>
      </div>`;
  }

  function situacao(media) {
    if (media === null) return '<span class="sub">—</span>';
    return media >= op.mediaAprovacao
      ? '<span class="selo selo-ok">Na média</span>'
      : '<span class="selo selo-erro">Abaixo da média</span>';
  }

  function renderPlanilha(el) {
    const area = EG.$('[data-area="planilha"]', el);
    if (!dados) return;
    const u = dados.ultimaAlteracao;
    area.innerHTML = `
      <div class="msg-info">Média para aprovação: <strong>${EG.fmtNota(op.mediaAprovacao)}</strong>.
        A média do bimestre é a média das notas lançadas — nota em branco não conta como zero.
        Use vírgula ou ponto (ex.: 7,5). Enter passa para o próximo aluno.</div>
      ${dados.alunos.length ? `<div class="tabela-wrap"><table class="planilha-notas">
        <thead><tr><th>Nº</th><th>Aluno</th>${CAMPOS.map(([, r]) => `<th>${r}</th>`).join('')}<th>Média</th><th>Situação</th></tr></thead>
        <tbody>${dados.alunos.map((a, i) => `<tr data-aluno="${a.id}">
          <td class="sub">${i + 1}</td>
          <td><strong>${EG.esc(a.nome)}</strong>${a.status !== 'ativo' ? ` <span class="selo selo-neutro">${EG.esc(a.status)}</span>` : ''}<br><small>${EG.esc(a.ra)}</small></td>
          ${CAMPOS.map(([c, r]) => `<td><input class="input nota" data-campo="${c}" inputmode="decimal" maxlength="5" aria-label="${r} de ${EG.esc(a.nome)}"
            value="${a[c] === null || a[c] === undefined ? '' : EG.esc(String(a[c]).replace('.', ','))}"></td>`).join('')}
          <td data-media style="font-weight:700">${EG.fmtNota(a.media)}</td>
          <td data-situacao>${situacao(a.media)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px">
        <span class="sub" data-area="status">${u ? `Última alteração por ${EG.esc(u.por || '—')} em ${EG.dataHora(u.em)}` : 'Nenhuma nota lançada neste bimestre'}</span>
        <button class="btn btn-primario" data-action="salvar"><i class="ti ti-device-floppy"></i> Salvar notas</button>
      </div>` : '<div class="vazio"><i class="ti ti-users"></i>Nenhum aluno ativo nesta turma</div>'}`;
  }

  /** Recalcula média e situação da linha; marca nota inválida. */
  function recalcular(tr) {
    const vals = CAMPOS.map(([c]) => {
      const inp = tr.querySelector(`[data-campo="${c}"]`);
      const n = EG.lerNota(inp.value);
      inp.classList.toggle('invalido', Number.isNaN(n));
      return Number.isNaN(n) ? null : n;
    });
    const media = EG.mediaNotas(vals);
    tr.querySelector('[data-media]').textContent = EG.fmtNota(media);
    tr.querySelector('[data-situacao]').innerHTML = situacao(media);
  }

  async function carregarPlanilha(el) {
    dados = null;
    alterado = false;
    const area = EG.$('[data-area="planilha"]', el);
    if (!sel.turmaId || !sel.disciplinaId) return;
    try {
      dados = await EG.api('GET', `/notas?turmaId=${sel.turmaId}&disciplinaId=${sel.disciplinaId}&bimestre=${sel.bimestre}`);
      renderPlanilha(el);
    } catch (e) {
      area.innerHTML = `<div class="msg-erro">${EG.esc(e.message)}</div>`;
    }
  }

  function escolherTurma(id) {
    sel.turmaId = id;
    const t = turmaSel();
    if (!t || !t.disciplinas.some((d) => String(d.id) === String(sel.disciplinaId))) {
      sel.disciplinaId = t && t.disciplinas.length ? String(t.disciplinas[0].id) : '';
    }
  }

  async function salvar(el, btn) {
    const linhas = EG.$$('tr[data-aluno]', el);
    let invalida = false;
    const notas = linhas.map((tr) => {
      const r = { alunoId: Number(tr.dataset.aluno) };
      CAMPOS.forEach(([c]) => {
        const n = EG.lerNota(tr.querySelector(`[data-campo="${c}"]`).value);
        if (Number.isNaN(n)) invalida = true;
        r[c] = Number.isNaN(n) ? null : n;
      });
      return r;
    });
    if (invalida) { EG.toast('Há nota inválida (em vermelho). Use valores de 0 a 10.', 'erro'); return; }
    await EG.guarda(btn, async () => {
      const r = await EG.api('PUT', '/notas', {
        turmaId: Number(sel.turmaId), disciplinaId: Number(sel.disciplinaId), bimestre: Number(sel.bimestre), notas
      });
      EG.toast(`Notas salvas (${r.gravadas} aluno(s))`);
      await carregarPlanilha(el);
    });
  }

  async function podeDescartar() {
    if (!alterado) return true;
    return EG.confirmar('Há notas digitadas que ainda não foram salvas. Deseja descartá-las?', { textoOk: 'Descartar' });
  }

  EG.registrarModulo('notas', {
    async render(el) {
      op = await EG.opcoesPedagogicas();
      EG.filtrosDaSessao(sel, { turmaId: '', disciplinaId: '', bimestre: '' });
      if (!sel.bimestre) sel.bimestre = String(EG.bimestreAtual());
      if (!op.turmas.some((t) => t.id === Number(sel.turmaId) && t.ativo)) {
        const primeira = op.turmas.find((t) => t.ativo);
        escolherTurma(primeira ? String(primeira.id) : '');
      } else escolherTurma(sel.turmaId);
      render(el);
      await carregarPlanilha(el);

      el.onclick = (ev) => {
        const b = ev.target.closest('[data-action="salvar"]');
        if (b) salvar(el, b).catch((e) => EG.toast(e.message, 'erro'));
      };
      el.oninput = (ev) => {
        if (!ev.target.matches('input.nota')) return;
        alterado = true;
        recalcular(ev.target.closest('tr'));
      };
      el.onkeydown = (ev) => {
        if (ev.key !== 'Enter' || !ev.target.matches('input.nota')) return;
        ev.preventDefault();
        const prox = ev.target.closest('tr').nextElementSibling;
        const alvo = prox && prox.querySelector(`[data-campo="${ev.target.dataset.campo}"]`);
        if (alvo) { alvo.focus(); alvo.select(); }
      };
      el.onchange = async (ev) => {
        const f = ev.target.dataset.filtro;
        if (!f) return;
        if (!(await podeDescartar())) {
          ev.target.value = f === 'turma' ? sel.turmaId : f === 'disciplina' ? sel.disciplinaId : sel.bimestre;
          return;
        }
        if (f === 'turma') escolherTurma(ev.target.value);
        else if (f === 'disciplina') sel.disciplinaId = ev.target.value;
        else if (f === 'bimestre') sel.bimestre = ev.target.value;
        render(el);
        await carregarPlanilha(el);
      };
    }
  });
})(window.EG);
