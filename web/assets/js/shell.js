/* =====================================================================
 *  EduGest — estrutura do app: menu (grupos recolhíveis), seletor de
 *  colégio, rotas (#/id), timeout de sessão e saída.
 *  Colégio novo: só o proprietário, em Sistema › Gestão de Colégios.
 * ===================================================================== */
'use strict';
(function (EG) {
  /* pronto: true = módulo já existe nesta versão */
  const MENU = [
    { secao: 'Principal', fixo: true, itens: [
      { id: 'dashboard', rotulo: 'Dashboard', icone: 'ti-dashboard', pronto: true }
    ] },
    { secao: 'Pedagógico', itens: [
      { id: 'alunos', rotulo: 'Alunos', icone: 'ti-users', pronto: true },
      { id: 'professores', rotulo: 'Professores', icone: 'ti-user-check', pronto: true },
      { id: 'turmas', rotulo: 'Turmas e Séries', icone: 'ti-layout-grid', pronto: true },
      { id: 'diario', rotulo: 'Diário de Classe', icone: 'ti-notebook', pronto: true },
      { id: 'notas', rotulo: 'Notas e Médias', icone: 'ti-list-numbers', pronto: true },
      { id: 'boletim', rotulo: 'Boletim', icone: 'ti-report', pronto: true },
      { id: 'calendario', rotulo: 'Calendário Escolar', icone: 'ti-calendar-event', pronto: true },
      { id: 'grade', rotulo: 'Grade Horária', icone: 'ti-clock-hour-3', pronto: true },
      { id: 'documentos', rotulo: 'Documentos', icone: 'ti-file-certificate', pronto: true }
    ] },
    { secao: 'Financeiro', itens: [
      { id: 'mensalidades', rotulo: 'Mensalidades', icone: 'ti-receipt', pronto: true },
      { id: 'contas', rotulo: 'Contas a Pagar', icone: 'ti-file-invoice', pronto: true },
      { id: 'fluxo', rotulo: 'Fluxo de Caixa', icone: 'ti-chart-arrows-vertical', pronto: true },
      { id: 'bolsas', rotulo: 'Descontos e Bolsas', icone: 'ti-discount-2', pronto: true },
      { id: 'relatorios', rotulo: 'Relatórios', icone: 'ti-report-analytics', pronto: true },
      { id: 'conciliacao', rotulo: 'Conciliação Bancária', icone: 'ti-arrows-exchange', pronto: true }
    ] },
    { secao: 'Captação', itens: [{ id: 'funil', rotulo: 'Funil de Matrículas', icone: 'ti-filter', pronto: true }] },
    { secao: 'Comunicação', itens: [{ id: 'comunicados', rotulo: 'Comunicados', icone: 'ti-speakerphone', pronto: true }] },
    { secao: 'Portal do Responsável', fixo: true, itens: [
      { id: 'portal', modulo: 'portal', rotulo: 'Início', icone: 'ti-home-heart', pronto: true },
      { id: 'portal-boletim', modulo: 'portal', rotulo: 'Boletim', icone: 'ti-report', pronto: true },
      { id: 'portal-frequencia', modulo: 'portal', rotulo: 'Frequência', icone: 'ti-calendar-check', pronto: true },
      { id: 'portal-grade', modulo: 'portal', rotulo: 'Horário de aulas', icone: 'ti-clock-hour-3', pronto: true },
      { id: 'portal-financeiro', modulo: 'portal', rotulo: 'Financeiro', icone: 'ti-receipt', pronto: true },
      { id: 'portal-comunicados', modulo: 'portal', rotulo: 'Comunicados', icone: 'ti-speakerphone', pronto: true },
      { id: 'portal-calendario', modulo: 'portal', rotulo: 'Calendário', icone: 'ti-calendar-event', pronto: true }
    ] },
    { secao: 'Sistema', itens: [
      { id: 'config', rotulo: 'Configurações', icone: 'ti-settings', pronto: true },
      { id: 'usuarios', rotulo: 'Usuários', icone: 'ti-users-group', pronto: true },
      { id: 'seguranca', rotulo: 'Log de Segurança', icone: 'ti-shield-lock', pronto: true, soAdmin: true },
      // Só o proprietário do sistema (PROPRIETARIO_EMAILS no .env da API)
      { id: 'colegios', rotulo: 'Gestão de Colégios', icone: 'ti-building-community', pronto: true, soProprietario: true }
    ] }
  ];
  const TODOS = MENU.flatMap((s) => s.itens);

  function permitido(item) {
    const e = EG.estado;
    if (item.soProprietario) return !!(e.me && (e.me.proprietario || e.me.proprietarioVerificar));
    if (item.soAdmin) return e.perfil === 'admin';
    // Tudo depende dos módulos liberados, inclusive o Dashboard
    return e.modulos.includes(item.modulo || item.id);
  }

  /* ---------- Entrar no app ---------- */
  EG.entrarApp = async function (vinculo) {
    EG.estado.colegioId = vinculo.id;
    EG.carregando(true, 'Carregando os dados do colégio...', 50);
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
    // Responsável: número de comunicados novos no menu
    if (col.perfil === 'responsavel' && EG.atualizarComunicadosPortal) EG.atualizarComunicadosPortal();
    // Equipe com o funil: novos interessados e contatos do dia no menu
    if (col.perfil !== 'responsavel' && EG.atualizarFunil) EG.atualizarFunil();
    EG.$('#telaAuth').hidden = true;
    EG.$('#app').hidden = false;
    iniciarSessao(col.config ? col.config.timeoutSessaoMin : 15);
    // A tela de carregamento só sai quando a primeira página estiver pronta (no máximo 6 s)
    EG.carregando(true, 'Preparando o seu painel...', 80);
    await Promise.race([navegarPelaUrl(), new Promise((ok) => setTimeout(ok, 6000))]);
    EG.carregando(true, 'Tudo pronto!', 100);
    await new Promise((ok) => setTimeout(ok, 200));
    EG.carregando(false);
  };

  function montarSeletor() {
    const sel = EG.$('#seletorColegio');
    const lista = EG.estado.me.colegios || [];
    sel.innerHTML = lista.map((c) => {
      const extra = c.status === 'ativo' ? '' : ` (${(EG.STATUS[c.status] || c.status).toLowerCase()})`;
      return `<option value="${c.id}" ${c.id === EG.estado.colegioId ? 'selected' : ''}>${EG.esc(c.nome + extra)}</option>`;
    }).join('');
  }

  /* Menu: "Principal" fica sempre à mostra; os demais grupos abrem com um
   * clique no título (um por vez). O grupo da tela atual abre sozinho. */
  function montarMenu() {
    let html = '';
    MENU.forEach((s, n) => {
      const itens = s.itens.filter(permitido);
      if (!itens.length) return;
      const botoes = itens.map((i) => `<button class="menu-item" data-action="ir" data-pagina="${i.id}">
          <i class="ti ${i.icone}"></i> ${EG.esc(i.rotulo)}${i.pronto ? '' : '<span class="breve">em breve</span>'}</button>`).join('');
      if (s.fixo) {
        html += `<div class="menu-secao">${EG.esc(s.secao)}</div>${botoes}`;
        return;
      }
      html += `<div class="menu-grupo" data-grupo="${n}">
        <button class="menu-grupo-titulo" data-action="grupo" aria-expanded="false" aria-controls="menuGrupo${n}">
          <span class="menu-grupo-nome">${EG.esc(s.secao)}</span><span class="contador" hidden></span><i class="ti ti-chevron-down"></i></button>
        <div class="menu-grupo-itens" id="menuGrupo${n}"><div>${botoes}</div></div>
      </div>`;
    });
    EG.$('#menu').innerHTML = html;
    const p = EG.estado.colegio.pendentes;
    EG.atualizarPendentes(p ? p.total : 0);
  }

  /** Abre um grupo e fecha os outros; "alternar" fecha se já estiver aberto. */
  function abrirGrupo(grupo, alternar) {
    const abrir = !(alternar && grupo && grupo.classList.contains('aberto'));
    EG.$$('.menu-grupo').forEach((g) => {
      const aberto = abrir && g === grupo;
      g.classList.toggle('aberto', aberto);
      g.querySelector('.menu-grupo-titulo').setAttribute('aria-expanded', String(aberto));
    });
  }

  /** Destaca e abre o grupo da página atual. */
  function marcarGrupo(id) {
    const item = EG.$(`.menu-item[data-pagina="${id}"]`);
    const grupo = item ? item.closest('.menu-grupo') : null;
    EG.$$('.menu-grupo').forEach((g) => g.classList.toggle('tem-ativo', g === grupo));
    if (grupo) abrirGrupo(grupo, false);
  }

  /** Número ao lado de um item do menu (some quando zero). */
  EG.contadorMenu = function (pagina, total, titulo) {
    const item = EG.$(`.menu-item[data-pagina="${pagina}"]`);
    if (!item) return;
    let c = item.querySelector('.contador');
    if (!total) { if (c) c.remove(); return; }
    if (!c) {
      c = document.createElement('span');
      c.className = 'contador';
      item.appendChild(c);
    }
    c.textContent = total;
    c.title = titulo || '';
  };

  /** Contador de cadastros pendentes no item "Usuários" do menu (só admin). */
  EG.atualizarPendentes = function (total) {
    if (EG.estado.colegio && EG.estado.colegio.pendentes) EG.estado.colegio.pendentes.total = total;
    const item = EG.$('.menu-item[data-pagina="usuarios"]');
    if (!item) return;
    // Com o grupo fechado, o número aparece no título para o aviso não sumir
    const titulo = item.closest('.menu-grupo') && item.closest('.menu-grupo').querySelector('.menu-grupo-titulo .contador');
    if (titulo) {
      titulo.hidden = !total;
      titulo.textContent = total || '';
      titulo.title = total ? `${total} cadastro(s) aguardando aprovação` : '';
    }
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
    return EG.navegar(id || paginaInicial(), true);
  }

  /* Conteúdo novo entra suave; a classe sai depois que a página terminou de montar. */
  let tEntrada = null, navAtual = 0;
  function animarEntrada(el, render) {
    const minha = ++navAtual;
    clearTimeout(tEntrada);
    el.classList.remove('entrando'); void el.offsetWidth; el.classList.add('entrando');
    const fim = () => { if (minha === navAtual) tEntrada = setTimeout(() => el.classList.remove('entrando'), 700); };
    return render.then(fim, fim);
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
    marcarGrupo(id);
    const titulo = EG.$('#titulo');
    if (titulo.textContent !== item.rotulo) {
      titulo.textContent = item.rotulo;
      titulo.classList.remove('troca'); void titulo.offsetWidth; titulo.classList.add('troca');
    }
    fecharMenuMobile();

    const el = EG.$('#conteudo');
    el.onclick = null; // cada módulo registra os próprios eventos
    el.onkeydown = null;
    el.onchange = null;
    el.oninput = null;
    const mod = EG.modulos[id];
    if (item.pronto && mod) {
      el.innerHTML = EG.esqueleto(true);
      let render;
      try { render = Promise.resolve(mod.render(el)); } catch (e) { render = Promise.reject(e); }
      return animarEntrada(el, render.catch((e) => {
        el.innerHTML = `<div class="card"><div class="msg-erro">${EG.esc(e.message)}</div>
          <button class="btn btn-secundario" data-action="ir" data-pagina="${id}"><i class="ti ti-refresh"></i> Tentar novamente</button></div>`;
      }));
    }
    el.innerHTML = `<div class="card em-breve"><i class="ti ${item.icone}"></i><h2>${EG.esc(item.rotulo)}</h2>
      <p>Este módulo está sendo migrado para a nova versão do EduGest e será liberado nas próximas etapas.</p></div>`;
    return Promise.resolve();
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

  /* ---------- Trocar de colégio ---------- */
  /** Passa a usar outro colégio (seletor da barra lateral e Gestão de Colégios). */
  EG.trocarColegio = async function (id, pagina) {
    try {
      EG.carregando(true, 'Alternando colégio...');
      await EG.api('PUT', '/me/colegio-atual', { colegioId: id });
      history.replaceState(null, '', '#/' + (pagina || 'dashboard'));
      await EG.carregarSessao(id);
      EG.toast('Colégio alternado');
    } catch (err) {
      EG.carregando(false);
      EG.toast(err.message, 'erro');
      montarSeletor();
    }
  };
  EG.$('#seletorColegio').addEventListener('change', (e) => EG.trocarColegio(Number(e.target.value)));

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
    else if (acao === 'grupo') abrirGrupo(b.closest('.menu-grupo'), true);
    else if (acao === 'menu-abrir') { EG.$('#sidebar').classList.add('aberta'); EG.$('.sidebar-fundo').classList.add('aberto'); }
    else if (acao === 'menu-fechar') fecharMenuMobile();
    else if (acao === 'tema') EG.alternarTema();
    else if (acao === 'menu-usuario') dd.hidden = !dd.hidden;
    else if (acao === 'sair') sair('logout');
  });
})(window.EG);
