/* =====================================================================
 *  EduGest — estrutura do app: menu, seletor de colégio, rotas (#/id),
 *  timeout de sessão e saída.
 * ===================================================================== */
'use strict';
(function (EG) {
  /* pronto: true = módulo já existe nesta versão */
  const MENU = [
    { secao: 'Principal', itens: [
      { id: 'dashboard', rotulo: 'Dashboard', icone: 'ti-dashboard', pronto: true }
    ] },
    { secao: 'Pedagógico', itens: [
      { id: 'alunos', rotulo: 'Alunos', icone: 'ti-users', pronto: true },
      { id: 'professores', rotulo: 'Professores', icone: 'ti-user-check', pronto: true },
      { id: 'turmas', rotulo: 'Turmas e Séries', icone: 'ti-layout-grid', pronto: true },
      { id: 'diario', rotulo: 'Diário de Classe', icone: 'ti-notebook', pronto: true },
      { id: 'notas', rotulo: 'Notas e Médias', icone: 'ti-list-numbers', pronto: true },
      { id: 'boletim', rotulo: 'Boletim', icone: 'ti-report', pronto: true },
      { id: 'calendario', rotulo: 'Calendário Escolar', icone: 'ti-calendar-event' },
      { id: 'grade', rotulo: 'Grade Horária', icone: 'ti-clock-hour-3' },
      { id: 'documentos', rotulo: 'Documentos', icone: 'ti-file-certificate' }
    ] },
    { secao: 'Financeiro', itens: [
      { id: 'mensalidades', rotulo: 'Mensalidades', icone: 'ti-receipt', pronto: true },
      { id: 'contas', rotulo: 'Contas a Pagar', icone: 'ti-file-invoice', pronto: true },
      { id: 'fluxo', rotulo: 'Fluxo de Caixa', icone: 'ti-chart-arrows-vertical', pronto: true },
      { id: 'bolsas', rotulo: 'Descontos e Bolsas', icone: 'ti-discount-2', pronto: true },
      { id: 'relatorios', rotulo: 'Relatórios', icone: 'ti-report-analytics' },
      { id: 'conciliacao', rotulo: 'Conciliação Bancária', icone: 'ti-arrows-exchange' }
    ] },
    { secao: 'Captação', itens: [{ id: 'funil', rotulo: 'Funil de Matrículas', icone: 'ti-filter' }] },
    { secao: 'Comunicação', itens: [{ id: 'comunicados', rotulo: 'Comunicados', icone: 'ti-message-circle' }] },
    { secao: 'Responsável', itens: [{ id: 'portal', rotulo: 'Portal do Responsável', icone: 'ti-home-heart' }] },
    { secao: 'Sistema', itens: [
      { id: 'config', rotulo: 'Configurações', icone: 'ti-settings', pronto: true },
      { id: 'usuarios', rotulo: 'Usuários', icone: 'ti-users-group', pronto: true },
      { id: 'seguranca', rotulo: 'Log de Segurança', icone: 'ti-shield-lock', pronto: true, soAdmin: true }
    ] }
  ];
  const TODOS = MENU.flatMap((s) => s.itens);

  function permitido(item) {
    const e = EG.estado;
    if (item.soAdmin) return e.perfil === 'admin';
    // Tudo depende dos módulos liberados, inclusive o Dashboard
    return e.modulos.includes(item.id);
  }

  /* ---------- Entrar no app ---------- */
  EG.entrarApp = async function (vinculo) {
    EG.estado.colegioId = vinculo.id;
    const col = await EG.api('GET', '/colegios/atual');
    EG.estado.colegio = col;
    EG.estado.perfil = col.perfil;
    EG.estado.modulos = col.modulos || [];

    if (EG._loginManual) {
      EG._loginManual = false;
      EG.api('POST', '/conta/evento', { tipo: 'login_ok' }).catch(() => {});
    }

    const u = EG.estado.me.usuario;
    EG.$('#avatar').textContent = EG.iniciais(u.nome);
    EG.$('#usuarioNome').textContent = u.nome;
    EG.$('#usuarioPerfil').textContent = EG.PERFIS[col.perfil] || col.perfil;

    montarSeletor();
    montarMenu();
    EG.$('#telaAuth').hidden = true;
    EG.$('#app').hidden = false;
    EG.carregando(false);
    iniciarSessao(col.config ? col.config.timeoutSessaoMin : 15);
    navegarPelaUrl();
  };

  function montarSeletor() {
    const sel = EG.$('#seletorColegio');
    const lista = EG.estado.me.colegios || [];
    sel.innerHTML = lista.map((c) => {
      const extra = c.status === 'ativo' ? '' : ` (${(EG.STATUS[c.status] || c.status).toLowerCase()})`;
      return `<option value="${c.id}" ${c.id === EG.estado.colegioId ? 'selected' : ''}>${EG.esc(c.nome + extra)}</option>`;
    }).join('');
    // Responsável não cria colégio
    EG.$('[data-action="novo-colegio"]').hidden = EG.estado.perfil === 'responsavel';
  }

  function montarMenu() {
    let html = '';
    MENU.forEach((s) => {
      const itens = s.itens.filter(permitido);
      if (!itens.length) return;
      html += `<div class="menu-secao">${EG.esc(s.secao)}</div>`;
      itens.forEach((i) => {
        html += `<button class="menu-item" data-action="ir" data-pagina="${i.id}">
          <i class="ti ${i.icone}"></i> ${EG.esc(i.rotulo)}${i.pronto ? '' : '<span class="breve">em breve</span>'}</button>`;
      });
    });
    EG.$('#menu').innerHTML = html;
    const p = EG.estado.colegio.pendentes;
    EG.atualizarPendentes(p ? p.total : 0);
  }

  /** Contador de cadastros pendentes no item "Usuários" do menu (só admin). */
  EG.atualizarPendentes = function (total) {
    if (EG.estado.colegio && EG.estado.colegio.pendentes) EG.estado.colegio.pendentes.total = total;
    const item = EG.$('.menu-item[data-pagina="usuarios"]');
    if (!item) return;
    let c = item.querySelector('.contador');
    if (!total) { if (c) c.remove(); return; }
    if (!c) {
      c = document.createElement('span');
      c.className = 'contador';
      item.appendChild(c);
    }
    c.textContent = total;
    c.title = `${total} cadastro(s) aguardando aprovação`;
  };

  /* ---------- Navegação ---------- */
  function paginaInicial() {
    const primeiro = TODOS.find(permitido);
    return primeiro ? primeiro.id : null;
  }

  function navegarPelaUrl() {
    const id = (location.hash.match(/^#\/([\w-]+)/) || [])[1];
    EG.navegar(id || paginaInicial(), true);
  }

  EG.navegar = function (id, semHistorico) {
    let item = TODOS.find((i) => i.id === id);
    if (!item || !permitido(item)) {
      const inicial = paginaInicial();
      if (!inicial) { semModulos(); return; }
      item = TODOS.find((i) => i.id === inicial);
      id = item.id;
    }
    if (!semHistorico || location.hash !== '#/' + id) history.replaceState(null, '', '#/' + id);
    EG.$$('.menu-item').forEach((m) => m.classList.toggle('ativo', m.dataset.pagina === id));
    EG.$('#titulo').textContent = item.rotulo;
    fecharMenuMobile();

    const el = EG.$('#conteudo');
    el.onclick = null; // cada módulo registra os próprios eventos
    el.onkeydown = null;
    el.onchange = null;
    el.oninput = null;
    const mod = EG.modulos[id];
    if (item.pronto && mod) {
      el.innerHTML = '<div class="vazio"><div class="spinner pequeno" style="margin:0 auto"></div></div>';
      Promise.resolve(mod.render(el)).catch((e) => {
        el.innerHTML = `<div class="card"><div class="msg-erro">${EG.esc(e.message)}</div>
          <button class="btn btn-secundario" data-action="ir" data-pagina="${id}"><i class="ti ti-refresh"></i> Tentar novamente</button></div>`;
      });
    } else {
      el.innerHTML = `<div class="card em-breve"><i class="ti ${item.icone}"></i><h2>${EG.esc(item.rotulo)}</h2>
        <p>Este módulo está sendo migrado para a nova versão do EduGest e será liberado nas próximas etapas.</p></div>`;
    }
  };
  /** Usuário sem nenhum módulo liberado: não mostra dado algum. */
  function semModulos() {
    history.replaceState(null, '', location.pathname);
    EG.$('#titulo').textContent = 'Sem módulos liberados';
    const el = EG.$('#conteudo');
    el.onclick = null;
    el.innerHTML = `<div class="card em-breve"><i class="ti ti-lock"></i><h2>Nenhum módulo liberado</h2>
      <p>Seu acesso a este colégio está ativo, mas nenhum módulo foi liberado para você. Fale com o administrador.</p></div>`;
  }

  window.addEventListener('hashchange', () => { if (!EG.$('#app').hidden) navegarPelaUrl(); });

  /** Recarrega a página atual (após salvar algo). */
  EG.recarregarPagina = () => navegarPelaUrl();

  function fecharMenuMobile() {
    EG.$('#sidebar').classList.remove('aberta');
    EG.$('.sidebar-fundo').classList.remove('aberto');
  }

  /* ---------- Trocar / criar colégio ---------- */
  EG.$('#seletorColegio').addEventListener('change', async (e) => {
    const id = Number(e.target.value);
    try {
      EG.carregando(true, 'Alternando colégio...');
      await EG.api('PUT', '/me/colegio-atual', { colegioId: id });
      history.replaceState(null, '', '#/dashboard');
      await EG.carregarSessao(id);
      EG.toast('Colégio alternado');
    } catch (err) {
      EG.carregando(false);
      EG.toast(err.message, 'erro');
      montarSeletor();
    }
  });

  function modalNovoColegio() {
    const m = EG.modal({
      titulo: 'Cadastrar novo colégio',
      corpo: `<p class="card-desc" style="margin:0 0 14px">Cada colégio tem dados totalmente separados. Você será o administrador do novo colégio.</p>
        <div class="campo"><label>Nome do colégio *</label><input class="input" name="nome" maxlength="120"></div>
        <div class="linha-2">
          <div class="campo"><label>CNPJ</label><input class="input" name="cnpj" data-mascara="cnpj" maxlength="18" autocomplete="off"></div>
          <div class="campo"><label>Telefone</label><input class="input" name="telefone" data-mascara="telefone" maxlength="15"></div>
        </div>
        <div class="campo"><label>Endereço</label><input class="input" name="endereco" maxlength="200"></div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Criar colégio', classe: 'btn-primario', icone: 'ti-building-plus', acao: async () => {
          const d = EG.lerForm(m.el);
          const r = await EG.api('POST', '/colegios', d);
          m.fechar();
          history.replaceState(null, '', '#/config');
          await EG.carregarSessao(r.id);
          EG.toast(`Colégio "${r.nome}" criado!`);
        } }
      ]
    });
  }

  /* ---------- Timeout de sessão ---------- */
  const EVENTOS = ['mousedown', 'keydown', 'scroll', 'touchstart'];
  const AVISO_SEG = 60;
  let limiteMs = 0, tAviso = null, tContagem = null, modalAviso = null;

  function iniciarSessao(minutos) {
    EG.pararSessao();
    limiteMs = Number(minutos) > 0 ? Number(minutos) * 60000 : 0; // 0 = desativado
    if (!limiteMs) return;
    EVENTOS.forEach((ev) => document.addEventListener(ev, atividade, { passive: true }));
    agendar();
  }
  EG.pararSessao = function () {
    limiteMs = 0;
    EVENTOS.forEach((ev) => document.removeEventListener(ev, atividade));
    clearTimeout(tAviso); clearInterval(tContagem);
    if (modalAviso) { modalAviso.fechar(); modalAviso = null; }
  };
  EG.iniciarSessao = iniciarSessao; // usado ao salvar a configuração

  function agendar() {
    clearTimeout(tAviso);
    tAviso = setTimeout(avisar, Math.max(limiteMs - AVISO_SEG * 1000, 1000));
  }
  function atividade() { if (!modalAviso) agendar(); }
  function avisar() {
    let seg = AVISO_SEG;
    modalAviso = EG.modal({
      titulo: 'Sessão prestes a expirar',
      largura: 420,
      corpo: `<div class="auth-status"><div class="icone-grande" style="background:var(--aviso-bg);color:var(--aviso)"><i class="ti ti-clock-pause"></i></div>
        <p>Por segurança, sua sessão será encerrada por inatividade em</p>
        <div class="fonte-titulo" style="font-size:36px;font-weight:700;color:var(--erro)" id="contagem">${seg}</div><p>segundos</p></div>`,
      aoFechar: () => { modalAviso = null; clearInterval(tContagem); if (limiteMs) agendar(); },
      botoes: [
        { texto: 'Sair agora', acao: () => sair('timeout') },
        { texto: 'Continuar conectado', classe: 'btn-primario', acao: (m) => m.fechar() }
      ]
    });
    tContagem = setInterval(() => {
      seg -= 1;
      const c = EG.$('#contagem');
      if (c) c.textContent = seg;
      if (seg <= 0) sair('timeout');
    }, 1000);
  }

  /* ---------- Sair ---------- */
  async function sair(motivo) {
    EG.pararSessao();
    try { await EG.api('POST', '/conta/evento', { tipo: motivo === 'timeout' ? 'timeout' : 'logout' }); } catch (e) { /* segue */ }
    await EG.auth.signOut();
    history.replaceState(null, '', location.pathname);
    if (motivo === 'timeout') EG.toast('Sessão encerrada por inatividade', 'info');
  }

  /* ---------- Cliques do app ---------- */
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('#app [data-action], #modais [data-action="ir"]');
    const dd = EG.$('#usuarioDropdown');
    if (!ev.target.closest('.usuario-menu')) dd.hidden = true;
    if (!b) return;
    const acao = b.dataset.action;
    if (acao === 'ir') EG.navegar(b.dataset.pagina);
    else if (acao === 'menu-abrir') { EG.$('#sidebar').classList.add('aberta'); EG.$('.sidebar-fundo').classList.add('aberto'); }
    else if (acao === 'menu-fechar') fecharMenuMobile();
    else if (acao === 'tema') EG.alternarTema();
    else if (acao === 'menu-usuario') dd.hidden = !dd.hidden;
    else if (acao === 'sair') sair('logout');
    else if (acao === 'novo-colegio') modalNovoColegio();
  });
})(window.EG);
