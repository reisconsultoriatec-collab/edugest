/* EduGest — Dashboard: indicadores e atividade recente */
'use strict';
(function (EG) {
  EG.registrarModulo('dashboard', {
    async render(el) {
      const e = EG.estado;
      const col = e.colegio;
      const ehProfessor = e.perfil === 'professor' && EG.pode('grade');
      const [atividades, r, com, agenda, minha, funil] = await Promise.all([
        EG.api('GET', '/colegios/atual/atividades?limite=15'),
        EG.api('GET', '/colegios/atual/resumo'),
        EG.pode('comunicados') ? EG.api('GET', '/comunicados/recentes?limite=5').catch(() => null) : null,
        EG.pode('calendario') ? EG.api('GET', '/calendario/proximos?dias=30&limite=6').catch(() => null) : null,
        ehProfessor ? EG.api('GET', '/grade/minha').catch(() => null) : null,
        EG.pode('funil') && e.perfil !== 'professor' ? EG.api('GET', '/funil/resumo').catch(() => null) : null
      ]);
      const nome = (e.me.usuario.nome || '').split(' ')[0];
      if (r.pendentes) EG.atualizarPendentes(r.pendentes.total);
      if (r.privacidade && EG.atualizarPrivacidade) EG.atualizarPrivacidade(r.privacidade.abertas);
      // "Inadimplentes" abre as mensalidades vencidas de todos os meses
      // (este clique roda antes da navegação, que fica no document)
      el.onclick = (ev) => {
        if (ev.target.closest('[data-preset="inadimplentes"]')) {
          EG.filtroInicialMensalidades = { referencia: '', turmaId: '', busca: '', status: 'vencida' };
        }
      };

      el.innerHTML = `
        ${avisoPendentes(r.pendentes)}
        ${avisoPrivacidade(r.privacidade)}
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

        ${e.perfil === 'admin' ? '<div data-dash-implantacao></div>' : ''}
        ${minha && minha.vinculado && minha.total ? cardAulasHoje(minha) : ''}
        ${funil && (funil.novos || funil.contatosHoje || funil.atrasados || funil.visitasHoje) ? cardFunil(funil) : ''}
        ${agenda || com ? `<div class="${agenda && com ? 'linha-2' : ''}" style="gap:20px;align-items:start;margin-bottom:20px">
          ${agenda ? cardAgenda(agenda.itens, !!com) : ''}
          ${com ? cardComunicados(com.itens, !!agenda) : ''}
        </div>` : ''}
        <div class="card">
          <div class="card-cab"><div class="card-titulo"><i class="ti ti-clock"></i> Atividade recente</div></div>
          ${atividades.length ? `<ul class="lista-atividade">${atividades.map((a) => `
            <li><i class="ti ti-point-filled" style="color:var(--amber);font-size:10px"></i>
              <span>${a.autor ? `<strong style="color:var(--amber-d)">${EG.esc(a.autor)}</strong> · ` : ''}${EG.esc(a.acao)}</span>
              <span class="quando">${EG.dataHora(a.data)}</span></li>`).join('')}</ul>`
          : '<div class="vazio"><i class="ti ti-clock"></i>Nenhuma atividade ainda</div>'}
        </div>`;
      // Administrador: o que ainda falta configurar no colégio (some quando tudo estiver pronto)
      const impl = el.querySelector('[data-dash-implantacao]');
      if (impl && EG.cartaoImplantacao) {
        EG.cartaoImplantacao().then((html) => { if (impl.isConnected) { if (html) impl.outerHTML = html; else impl.remove(); } }).catch(() => impl.remove());
      }
    }
  });

  /** Captação: o que pede atenção hoje no funil de matrículas. */
  function cardFunil(f) {
    const item = (n, rot, cor) => (n ? `<div class="funil-dash-item"><strong style="color:${cor}">${n}</strong><span>${rot}</span></div>` : '');
    return `<div class="card">
      <div class="card-cab"><div class="card-titulo"><i class="ti ti-filter"></i> Captação de alunos</div>
        <button class="btn btn-secundario btn-pequeno" data-action="ir" data-pagina="funil">Abrir o funil</button></div>
      <div class="funil-dash">
        ${item(f.novos, 'novo(s) interessado(s)', 'var(--info)')}
        ${item(f.contatosHoje, 'contato(s) para hoje', 'var(--amber-d)')}
        ${item(f.atrasados, 'contato(s) atrasado(s)', 'var(--erro)')}
        ${item(f.visitasHoje, 'visita(s) hoje', 'var(--roxo)')}
        <div class="funil-dash-item"><strong>${f.ativos}</strong><span>em andamento</span></div>
      </div></div>`;
  }

  /** Últimos comunicados no ar, com quantos responsáveis já leram. */
  function cardComunicados(itens, lado) {
    return `<div class="card" style="${lado ? 'margin:0' : ''}">
      <div class="card-cab"><div class="card-titulo"><i class="ti ti-speakerphone"></i> Últimos comunicados</div>
        <button class="btn btn-secundario btn-pequeno" data-action="ir" data-pagina="comunicados">${itens.length ? 'Ver todos' : 'Publicar'}</button></div>
      ${itens.length ? `<ul class="lista-atividade">${itens.map((c) => `<li>
          ${EG.seloTipoComunicado(c.tipo)}
          <span>${EG.esc(c.titulo)}<br><small class="sub">${EG.esc(c.publico)}${c.leitura.destinatarios ? ` · lido por ${c.leitura.lidos} de ${c.leitura.destinatarios}` : ''}</small></span>
          <span class="quando">${EG.data(c.criadoEm)}</span></li>`).join('')}</ul>`
        : '<div class="vazio"><i class="ti ti-speakerphone"></i>Nenhum comunicado no ar</div>'}
    </div>`;
  }

  /** Professor: as aulas de hoje pela grade horária. */
  function cardAulasHoje(m) {
    return `<div class="card">
      <div class="card-cab"><div class="card-titulo"><i class="ti ti-clock-hour-3"></i> Suas aulas hoje</div>
        <button class="btn btn-secundario btn-pequeno" data-action="ir" data-pagina="grade">Minha grade</button></div>
      ${m.hoje.length ? `<ul class="lista-atividade">${m.hoje.map((a) => `<li><span class="selo selo-info">${a.inicio}–${a.fim}</span>
          <span><strong>${EG.esc(a.turma)}</strong> · ${EG.esc(a.disciplina || '—')}</span></li>`).join('')}</ul>`
        : '<div class="vazio" style="padding:20px"><i class="ti ti-mood-happy"></i>Nenhuma aula na grade hoje</div>'}
    </div>`;
  }

  /** Próximos eventos do calendário (30 dias). */
  function cardAgenda(itens, lado) {
    return `<div class="card" style="${lado ? 'margin:0' : ''}">
      <div class="card-cab"><div class="card-titulo"><i class="ti ti-calendar-event"></i> Próximos eventos</div>
        <button class="btn btn-secundario btn-pequeno" data-action="ir" data-pagina="calendario">Calendário</button></div>
      ${itens.length ? `<ul class="lista-atividade">${itens.map((e) => `<li>
          ${EG.cal.tag(e.tipo)}
          <span>${EG.esc(e.titulo)}<br><small class="sub">${EG.esc(e.publico)}${e.lugar ? ' · ' + EG.esc(e.lugar) : ''}</small></span>
          <span class="quando">${EG.data(e.data).slice(0, 5)}${e.dataFim ? ' a ' + EG.data(e.dataFim).slice(0, 5) : ''}${e.horaInicio ? ' · ' + e.horaInicio : ''}</span></li>`).join('')}</ul>`
        : '<div class="vazio"><i class="ti ti-calendar"></i>Nada marcado para os próximos 30 dias</div>'}
    </div>`;
  }

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

  /** Pedidos de privacidade (LGPD) das famílias aguardando resposta (só o admin recebe). */
  function avisoPrivacidade(p) {
    if (!p || !p.abertas) return '';
    const prazo = p.atrasadas ? `${p.atrasadas} com o prazo de 15 dias vencido` : p.proximoPrazo ? `responder até ${EG.data(p.proximoPrazo)}` : '';
    return `<div class="pendente-item ${p.atrasadas ? 'pendente-urgente' : ''}" style="margin-bottom:20px">
      <span class="avatar"><i class="ti ti-user-shield"></i></span>
      <div class="pendente-info">
        <strong>${p.abertas === 1 ? '1 pedido de privacidade' : `${p.abertas} pedidos de privacidade`} aguardando resposta</strong>
        <span class="sub">Pedidos das famílias pela LGPD (cópia, correção, exclusão de dados...)${prazo ? ' · ' + EG.esc(prazo) : ''}</span>
      </div>
      <button class="btn btn-primario" data-action="ir" data-pagina="lgpd"><i class="ti ti-message-reply"></i> Responder</button>
    </div>`;
  }

  function kpi(icone, fundo, cor, rotulo, valor, obs, modulo, preset) {
    const link = modulo && EG.pode(modulo)
      ? ` data-action="ir" data-pagina="${modulo}"${preset ? ` data-preset="${preset}"` : ''} style="cursor:pointer"` : '';
    return `<div class="kpi"${link}><div class="kpi-icone" style="background:${fundo};color:${cor}"><i class="ti ${icone}"></i></div>
      <div><div class="kpi-rotulo">${rotulo}</div><div class="kpi-valor">${EG.esc(valor)}</div><div class="kpi-obs">${EG.esc(obs)}</div></div></div>`;
  }
})(window.EG);
