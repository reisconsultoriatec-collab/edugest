/* =====================================================================
 *  EduGest — Boletim Escolar
 *  Médias por bimestre, média final, situação e frequência.
 *  Imprimir / salvar em PDF (impressão do navegador) e enviar por WhatsApp.
 * ===================================================================== */
'use strict';
(function (EG) {
  let op = null;
  let alunos = [];
  let boletim = null;
  const sel = { turmaId: '', alunoId: '' };

  const SITUACAO = {
    aprovado: ['Aprovado', 'selo-ok'],
    recuperacao: ['Recuperação', 'selo-erro'],
    em_curso: ['Em curso', 'selo-info'],
    sem_notas: ['Sem notas', 'selo-neutro']
  };
  const GERAL = {
    aprovado: ['Aprovado', 'var(--ok)'],
    recuperacao: ['Em recuperação', 'var(--erro)'],
    frequencia_insuficiente: ['Frequência insuficiente', 'var(--erro)'],
    em_curso: ['Ano letivo em curso', 'var(--info)']
  };

  function render(el) {
    if (!op.turmas.length) { el.innerHTML = EG.semTurmas(op); return; }
    el.innerHTML = `
      <div class="card no-print">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-report"></i> Boletim Escolar</div></div>
        <div class="linha-2">
          <div class="campo"><label>Turma</label><select class="select" data-filtro="turma">${EG.opcoesTurmas(op.turmas, sel.turmaId, { incluirInativas: true })}</select></div>
          <div class="campo"><label>Aluno</label><select class="select" data-filtro="aluno" ${alunos.length ? '' : 'disabled'}>
            <option value="">${alunos.length ? 'Selecione o aluno' : 'Nenhum aluno'}</option>
            ${alunos.map((a) => `<option value="${a.id}" ${String(a.id) === String(sel.alunoId) ? 'selected' : ''}>${EG.esc(a.nome)}${a.status !== 'ativo' ? ' (' + EG.esc(a.status) + ')' : ''}</option>`).join('')}
          </select></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap" ${boletim ? '' : 'hidden'}>
          <button class="btn btn-secundario" data-action="imprimir"><i class="ti ti-printer"></i> Imprimir / PDF</button>
          <button class="btn btn-whats" data-action="whats"><i class="ti ti-brand-whatsapp"></i> Enviar ao responsável</button>
        </div>
      </div>
      <div data-area="boletim">${boletim ? htmlBoletim(boletim)
        : `<div class="card"><div class="vazio"><i class="ti ti-report"></i>${sel.turmaId ? 'Selecione o aluno' : 'Selecione a turma e o aluno'}</div></div>`}</div>`;
  }

  function htmlBoletim(b) {
    const fr = b.frequencia;
    const g = GERAL[b.situacaoGeral] || GERAL.em_curso;
    const abaixo = (m) => m !== null && m < b.criterios.mediaAprovacao;
    return `<div class="card boletim">
      <div class="boletim-cab">
        <div>
          <div class="fonte-titulo" style="font-size:20px;font-weight:700">${EG.esc(b.colegio.nome)}</div>
          <div class="sub">${[b.colegio.cnpj ? 'CNPJ ' + EG.esc(b.colegio.cnpj) : '', EG.esc(b.colegio.endereco || ''), EG.esc(b.colegio.telefone || '')].filter(Boolean).join(' · ')}</div>
        </div>
        <div style="text-align:right"><div class="fonte-titulo" style="font-weight:700">Boletim Escolar</div><div class="sub">Ano letivo ${EG.esc(b.turma.anoLetivo)}</div></div>
      </div>
      <div class="boletim-dados">
        <div><span class="rotulo">Aluno</span>${EG.esc(b.aluno.nome)}</div>
        <div><span class="rotulo">RA</span>${EG.esc(b.aluno.ra)}</div>
        <div><span class="rotulo">Turma</span>${EG.esc(b.turma.nome)}</div>
        <div><span class="rotulo">Série · Período</span>${EG.esc(b.turma.serie)} · ${EG.esc(EG.PERIODOS[b.turma.periodo] || b.turma.periodo)}</div>
      </div>
      <div class="tabela-wrap"><table class="tabela-boletim">
        <thead><tr><th>Disciplina</th><th>1º bim</th><th>2º bim</th><th>3º bim</th><th>4º bim</th><th>Média final</th><th>Situação</th></tr></thead>
        <tbody>${b.disciplinas.map((d) => {
          const s = SITUACAO[d.situacao] || SITUACAO.sem_notas;
          return `<tr><td><strong>${EG.esc(d.nome)}</strong></td>
            ${d.bimestres.map((m) => `<td class="${abaixo(m) ? 'nota-baixa' : ''}">${EG.fmtNota(m)}</td>`).join('')}
            <td class="${abaixo(d.mediaFinal) ? 'nota-baixa' : ''}" style="font-weight:700">${EG.fmtNota(d.mediaFinal)}</td>
            <td><span class="selo ${s[1]}">${s[0]}</span></td></tr>`;
        }).join('') || '<tr><td colspan="7"><div class="vazio">Nenhuma disciplina</div></td></tr>'}</tbody>
      </table></div>
      <div class="boletim-rodape">
        <div class="boletim-freq ${fr.situacao === 'abaixo' ? 'alerta' : ''}">
          <span class="rotulo">Frequência</span>
          ${fr.percentual === null ? '<span class="sub">Nenhuma aula registrada no diário</span>'
            : `<strong style="font-size:18px">${fr.percentual.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%</strong>
               <span class="sub">${fr.aulas} aula(s) registrada(s) · ${fr.faltas} falta(s)${fr.justificadas ? ` · ${fr.justificadas} justificada(s)` : ''}</span>
               ${fr.situacao === 'abaixo' ? `<span class="sub" style="color:var(--erro)">Abaixo do mínimo de ${b.criterios.frequenciaMinima}%</span>` : ''}`}
        </div>
        <div class="boletim-freq">
          <span class="rotulo">Situação</span>
          <strong style="font-size:16px;color:${g[1]}">${g[0]}</strong>
          <span class="sub">Média mínima ${EG.fmtNota(b.criterios.mediaAprovacao)} · frequência mínima ${b.criterios.frequenciaMinima}%</span>
        </div>
      </div>
      <div class="sub" style="margin-top:16px;text-align:center">Emitido em ${EG.data(EG.hojeSP())} pelo EduGest · Reis Tecnologia</div>
    </div>`;
  }

  function mensagemWhats(b) {
    const linhas = b.disciplinas.filter((d) => d.situacao !== 'sem_notas').map((d) => {
      const bims = d.bimestres.map((m, i) => (m === null ? null : `${i + 1}º ${EG.fmtNota(m)}`)).filter(Boolean).join(' · ');
      return `• *${d.nome}*: ${bims} → média *${EG.fmtNota(d.mediaFinal)}*`;
    });
    const fr = b.frequencia;
    return `📚 *${b.colegio.nome}* — Boletim ${b.turma.anoLetivo}\n👤 *${b.aluno.nome}* · ${b.turma.nome}\n\n`
      + (linhas.length ? linhas.join('\n') : 'Ainda não há notas lançadas.')
      + (fr.percentual !== null ? `\n\n📅 Frequência: *${fr.percentual.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%* (${fr.faltas} falta(s))` : '')
      + `\n\nSituação: *${(GERAL[b.situacaoGeral] || GERAL.em_curso)[0]}*`;
  }

  async function carregarAlunos() {
    alunos = sel.turmaId ? await EG.api('GET', `/boletim/alunos?turmaId=${sel.turmaId}`) : [];
    if (!alunos.some((a) => String(a.id) === String(sel.alunoId))) sel.alunoId = '';
  }

  async function carregarBoletim() {
    boletim = sel.turmaId && sel.alunoId ? await EG.api('GET', `/boletim/${sel.alunoId}?turmaId=${sel.turmaId}`) : null;
  }

  EG.registrarModulo('boletim', {
    async render(el) {
      op = await EG.opcoesPedagogicas();
      EG.filtrosDaSessao(sel, { turmaId: '', alunoId: '' });
      boletim = null;
      if (!op.turmas.some((t) => t.id === Number(sel.turmaId))) {
        const primeira = op.turmas.find((t) => t.ativo) || op.turmas[0];
        sel.turmaId = primeira ? String(primeira.id) : '';
        sel.alunoId = '';
      }
      await carregarAlunos();
      await carregarBoletim();
      render(el);

      el.onchange = async (ev) => {
        const f = ev.target.dataset.filtro;
        if (!f) return;
        try {
          if (f === 'turma') { sel.turmaId = ev.target.value; await carregarAlunos(); }
          else if (f === 'aluno') sel.alunoId = ev.target.value;
          await carregarBoletim();
        } catch (e) { EG.toast(e.message, 'erro'); boletim = null; }
        render(el);
      };
      el.onclick = (ev) => {
        const b = ev.target.closest('[data-action]');
        if (!b || !boletim) return;
        if (b.dataset.action === 'imprimir') window.print();
        else if (b.dataset.action === 'whats') {
          if (!boletim.aluno.respTelefone) EG.toast('O aluno não tem telefone do responsável cadastrado — escolha o contato no WhatsApp.', 'info');
          EG.abrirWhatsApp(boletim.aluno.respTelefone, mensagemWhats(boletim));
        }
      };
    }
  });
})(window.EG);
