/* EduGest — Dashboard: indicadores e atividade recente */
'use strict';
(function (EG) {
  EG.registrarModulo('dashboard', {
    async render(el) {
      const e = EG.estado;
      const col = e.colegio;
      const [atividades, r] = await Promise.all([
        EG.api('GET', '/colegios/atual/atividades?limite=15'),
        EG.api('GET', '/colegios/atual/resumo')
      ]);
      const nome = (e.me.usuario.nome || '').split(' ')[0];
      if (r.pendentes) EG.atualizarPendentes(r.pendentes.total);
      // "Inadimplentes" abre as mensalidades vencidas de todos os meses
      // (este clique roda antes da navegação, que fica no document)
      el.onclick = (ev) => {
        if (ev.target.closest('[data-preset="inadimplentes"]')) {
          EG.filtroInicialMensalidades = { referencia: '', turmaId: '', busca: '', status: 'vencida' };
        }
      };

      el.innerHTML = `
        ${avisoPendentes(r.pendentes)}
        <div class="card" style="background:linear-gradient(135deg,#1A2744,#2D3F63);color:#fff;border:none">
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <div class="avatar" style="width:56px;height:56px;font-size:22px">${EG.esc(EG.iniciais(e.me.usuario.nome))}</div>
            <div style="flex:1;min-width:200px">
              <div class="fonte-titulo" style="font-size:20px;font-weight:700">Olá, ${EG.esc(nome)}!</div>
              <div style="opacity:.8;font-size:13px">${EG.esc(col.nome)} · ${EG.esc(EG.PERFIS[e.perfil] || e.perfil)} · Ano letivo ${EG.esc(col.config.anoLetivo)}</div>
            </div>
          </div>
        </div>

        <div class="grade-kpi">
          ${kpi('ti-users', 'var(--info-bg)', 'var(--info)', 'Alunos ativos', r.alunos,
            r.alunosSemTurma ? `${r.alunosSemTurma} sem turma` : 'todos com turma', 'alunos')}
          ${kpi('ti-user-check', 'var(--roxo-bg)', 'var(--roxo)', 'Professores ativos', r.professores, 'corpo docente', 'professores')}
          ${kpi('ti-layout-grid', 'var(--ok-bg)', 'var(--ok)', 'Turmas ativas', r.turmas, `ano letivo ${r.anoLetivo}`, 'turmas')}
          ${kpi('ti-alert-triangle', 'var(--erro-bg)', 'var(--erro)', 'Inadimplentes', r.inadimplentes, 'com mensalidade vencida', 'mensalidades', 'inadimplentes')}
        </div>

        <div class="card">
          <div class="card-cab"><div class="card-titulo"><i class="ti ti-clock"></i> Atividade recente</div></div>
          ${atividades.length ? `<ul class="lista-atividade">${atividades.map((a) => `
            <li><i class="ti ti-point-filled" style="color:var(--amber);font-size:10px"></i>
              <span>${a.autor ? `<strong style="color:var(--amber-d)">${EG.esc(a.autor)}</strong> · ` : ''}${EG.esc(a.acao)}</span>
              <span class="quando">${EG.dataHora(a.data)}</span></li>`).join('')}</ul>`
          : '<div class="vazio"><i class="ti ti-clock"></i>Nenhuma atividade ainda</div>'}
        </div>`;
    }
  });

  /** Alerta de cadastros aguardando aprovação (só chega preenchido para o admin). */
  function avisoPendentes(p) {
    if (!p || !p.total) return '';
    const partes = [];
    if (p.responsaveis) partes.push(`${p.responsaveis} ${p.responsaveis === 1 ? 'responsável de aluno' : 'responsáveis de alunos'}`);
    if (p.equipe) partes.push(`${p.equipe} da equipe`);
    return `<div class="pendente-item" style="margin-bottom:20px">
      <span class="avatar"><i class="ti ti-user-exclamation"></i></span>
      <div class="pendente-info">
        <strong>${p.total === 1 ? '1 cadastro aguardando' : `${p.total} cadastros aguardando`} a sua aprovação</strong>
        <span class="sub">${EG.esc(partes.join(' e '))} · essas pessoas só acessam o sistema depois de aprovadas</span>
      </div>
      <button class="btn btn-primario" data-action="ir" data-pagina="usuarios"><i class="ti ti-user-check"></i> Revisar agora</button>
    </div>`;
  }

  function kpi(icone, fundo, cor, rotulo, valor, obs, modulo, preset) {
    const link = modulo && EG.pode(modulo)
      ? ` data-action="ir" data-pagina="${modulo}"${preset ? ` data-preset="${preset}"` : ''} style="cursor:pointer"` : '';
    return `<div class="kpi"${link}><div class="kpi-icone" style="background:${fundo};color:${cor}"><i class="ti ${icone}"></i></div>
      <div><div class="kpi-rotulo">${rotulo}</div><div class="kpi-valor">${EG.esc(valor)}</div><div class="kpi-obs">${EG.esc(obs)}</div></div></div>`;
  }
})(window.EG);
