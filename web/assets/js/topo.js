/* =====================================================================
 *  EduGest — topo do sistema
 *  · Indicador de conexão: conectado há quanto tempo, contagem nos 2
 *    minutos finais antes de encerrar por inatividade e "Sem conexão"
 *    quando a internet ou o servidor caem.
 *  · Botão ⟳: atualiza os dados da tela atual (pergunta antes se há
 *    alterações não salvas) e "Recarregar o sistema" no menu do usuário.
 *  · Aviso de nova versão: depois de uma atualização no servidor, quem
 *    está com o sistema aberto vê "Há uma nova versão do EduGest".
 * ===================================================================== */
'use strict';
(function (EG) {
  const AVISO_INATIVIDADE_MS = 2 * 60 * 1000;   // contagem aparece nos 2 minutos finais
  const PING_MS = 60 * 1000;                    // confere o servidor a cada minuto
  const PING_FORA_MS = 10 * 1000;               // sem conexão: tenta de novo a cada 10 s
  const VERSAO_MS = 5 * 60 * 1000;              // procura versão nova a cada 5 minutos
  const VERSAO_ADIAR_MS = 30 * 60 * 1000;       // "Depois": volta a avisar em 30 minutos

  let ligado = false, conectado = true, tRelogio = null, tPing = null, tVersao = null;
  let ultimaVersao = 0, adiadoAte = 0, alterada = false;

  const chip = () => EG.$('#statusConexao');
  const appVisivel = () => ligado && !EG.$('#app').hidden;

  /* ---------- Tempo conectado ---------- */
  /** Início da sessão: o login no Firebase (não zera com F5); sem essa informação, a 1ª entrada nesta aba. */
  function inicioSessao() {
    const u = EG.auth.currentUser;
    const meta = u && u.metadata && u.metadata.lastSignInTime;
    const t = meta ? Date.parse(meta) : NaN;
    if (Number.isFinite(t)) return t;
    const chave = 'edugest_inicio_' + (u ? u.uid : '');
    try {
      let s = Number(sessionStorage.getItem(chave));
      if (!s) { s = Date.now(); sessionStorage.setItem(chave, String(s)); }
      return s;
    } catch (e) {
      return EG._inicioSessao || (EG._inicioSessao = Date.now());
    }
  }
  /** 'agora' · 'há 12 min' · 'há 1h 05min' · 'há 2 dias' */
  function ha(ms) {
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h}h ${String(min % 60).padStart(2, '0')}min`;
    const d = Math.floor(h / 24);
    return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  }
  const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const dataHora = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  /** Redesenha o indicador (roda a cada segundo; só mexe no DOM quando muda). */
  function desenhar() {
    const el = chip();
    if (!el || !appVisivel()) return;
    const restante = EG.sessaoRestante ? EG.sessaoRestante() : null;
    const limite = EG.sessaoLimiteMin ? EG.sessaoLimiteMin() : 0;
    let estado, html, dica;
    if (!conectado) {
      estado = 'offline';
      html = '<span class="tempo">Sem conexão</span>';
      dica = 'Não foi possível falar com o servidor. Verifique a internet: o sistema tenta de novo sozinho. Clique para tentar agora.';
    } else if (restante !== null && restante <= AVISO_INATIVIDADE_MS) {
      estado = 'expirando';
      html = `<span class="conexao-rotulo">Encerra em</span> <span class="tempo">${mmss(restante)}</span>`;
      dica = 'Sua sessão vai ser encerrada por inatividade. Clique em qualquer lugar do sistema para continuar conectado.';
    } else {
      const inicio = inicioSessao();
      estado = 'ok';
      html = `<span class="conexao-rotulo">Conectado</span> <span class="tempo">${ha(Date.now() - inicio)}</span>`;
      dica = `Conectado desde ${dataHora(inicio)}.\n` + (limite ? `Encerra após ${limite} min sem uso.` : 'Sem encerramento por inatividade.');
    }
    if (el.dataset.estado !== estado) { el.className = 'status-conexao ' + estado; el.dataset.estado = estado; }
    const txt = el.querySelector('.status-texto');
    if (txt.innerHTML !== html) txt.innerHTML = html;
    if (el.title !== dica) { el.title = dica; el.setAttribute('aria-label', dica); }
  }

  /* ---------- Conexão ---------- */
  /** Chamado pelas chamadas à API, pelo ping e pelos eventos do navegador. */
  EG.avisarConexao = function (ok) {
    if (!ligado || ok === conectado) return;
    conectado = ok;
    if (ok) EG.toast('Conexão restabelecida');
    else EG.toast('Sem conexão com o servidor. Verifique a internet.', 'erro');
    desenhar();
    agendarPing();
  };
  /** Uma chamada falhou: confere o servidor antes de avisar (evita alarme por uma falha isolada). */
  let conferindo = null;
  EG.suspeitarConexao = function () {
    if (!ligado || !conectado || conferindo) return;
    conferindo = ping(true).finally(() => { conferindo = null; });
  };
  async function ping(forcar) {
    if (!appVisivel() || (document.hidden && !forcar)) return agendarPing();
    try {
      const r = await fetch(EG.API_BASE + '/health', { cache: 'no-store' });
      EG.avisarConexao(r.ok);
    } catch (e) {
      EG.avisarConexao(false);
    }
    agendarPing();
  }
  function agendarPing() {
    clearTimeout(tPing);
    if (ligado) tPing = setTimeout(ping, conectado ? PING_MS : PING_FORA_MS);
  }
  window.addEventListener('offline', () => EG.avisarConexao(false));
  window.addEventListener('online', () => { if (ligado) ping(true); });

  /* ---------- Alterações não salvas na tela ---------- */
  // Conta como alteração: digitar ou escolher em campos de cadastro (com name), áreas de texto,
  // notas e a chamada do diário. Filtros, buscas e seleções de lista não contam.
  const IGNORAR = '[data-filtro], [data-busca], [type="search"], [data-sel], [data-sel-todos]';
  function marcar(ev) {
    const t = ev.target;
    if (!t || !t.closest || t.closest(IGNORAR)) return;
    if (t.matches('textarea, .nota, [name]') && t.matches('input, select, textarea')) alterada = true;
  }
  const conteudo = EG.$('#conteudo');
  if (conteudo) {
    conteudo.addEventListener('input', marcar);
    conteudo.addEventListener('change', marcar);
    conteudo.addEventListener('click', (ev) => { if (ev.target.closest && ev.target.closest('.att')) alterada = true; });
  }
  /** Gravação feita ou tela nova: nada pendente. Na troca de tela (trocandoTela), tira antes o
   *  foco do campo, porque o navegador avisa "change" ao sair dele e isso marcaria a tela de novo. */
  EG.limparAlteracoes = (trocandoTela) => {
    const ativo = document.activeElement;
    if (trocandoTela && ativo && conteudo && conteudo.contains(ativo) && ativo.matches('input, select, textarea')) ativo.blur();
    alterada = false;
  };
  EG.telaAlterada = () => alterada;
  async function podeDescartar(acao) {
    if (!alterada) return true;
    return EG.confirmar(`Há alterações não salvas nesta tela. Se ${acao} agora, elas serão perdidas.`,
      { titulo: 'Alterações não salvas', textoOk: 'Descartar e continuar', perigo: true });
  }

  /* ---------- Atualizar a tela / recarregar o sistema ---------- */
  async function atualizarTela(btn) {
    if (btn.disabled || !(await podeDescartar('atualizar'))) return;
    const icone = btn.querySelector('i');
    btn.disabled = true;
    icone.classList.add('girando');
    try {
      await Promise.all([
        EG.recarregarPagina(),
        ping(true),
        verificarVersao(true),
        EG.estado.perfil !== 'responsavel' && EG.atualizarFunil ? Promise.resolve(EG.atualizarFunil()).catch(() => {}) : null,
        EG.estado.perfil === 'responsavel' && EG.atualizarComunicadosPortal ? Promise.resolve(EG.atualizarComunicadosPortal()).catch(() => {}) : null
      ]);
    } finally {
      btn.disabled = false;
      icone.classList.remove('girando');
    }
  }
  async function recarregarSistema() {
    if (!(await podeDescartar('recarregar'))) return;
    location.reload();
  }

  /* ---------- Aviso de nova versão ---------- */
  // A versão é o número que vai nos endereços dos arquivos do index.html (?v=…):
  // compara o que este navegador carregou com o que o servidor está entregando agora.
  const versaoDe = (texto) => { const m = String(texto || '').match(/assets\/js\/core\.js\?v=([\w.-]+)/); return m ? m[1] : ''; };
  const versaoCarregada = () => {
    const s = document.querySelector('script[src*="assets/js/core.js"]');
    return s ? versaoDe(s.getAttribute('src')) : '';
  };
  async function verificarVersao(forcar) {
    if (!appVisivel() || (!forcar && document.hidden)) return;
    if (!forcar && Date.now() - ultimaVersao < 60 * 1000) return;
    ultimaVersao = Date.now();
    try {
      const r = await fetch('index.html?nv=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const nova = versaoDe(await r.text());
      const atual = versaoCarregada();
      if (nova && atual && nova !== atual && Date.now() >= adiadoAte) mostrarAviso(nova);
    } catch (e) { /* sem conexão: o indicador já mostra */ }
  }
  EG.verificarVersao = verificarVersao;
  function mostrarAviso(nova) {
    const el = EG.$('#avisoVersao');
    if (!el || !el.hidden) return;
    el.dataset.versao = nova;
    el.hidden = false;
  }
  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-action]');
    if (!b) return;
    const acao = b.dataset.action;
    if (acao === 'atualizar-tela') atualizarTela(b);
    else if (acao === 'recarregar-sistema') { EG.$('#usuarioDropdown').hidden = true; recarregarSistema(); }
    else if (acao === 'versao-atualizar') recarregarSistema();
    else if (acao === 'versao-depois') { EG.$('#avisoVersao').hidden = true; adiadoAte = Date.now() + VERSAO_ADIAR_MS; }
    else if (acao === 'status-conexao' && !conectado) ping(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !ligado) return;
    desenhar();
    verificarVersao(false);
    if (!conectado) ping(true);
  });

  /* ---------- Liga / desliga com a sessão ---------- */
  EG.iniciarTopo = function () {
    ligado = true;
    conectado = navigator.onLine !== false;
    const el = chip();
    if (el) el.hidden = false;
    clearInterval(tRelogio);
    tRelogio = setInterval(desenhar, 1000);
    desenhar();
    agendarPing();
    clearInterval(tVersao);
    tVersao = setInterval(() => verificarVersao(false), VERSAO_MS);
  };
  EG.pararTopo = function () {
    ligado = false;
    clearInterval(tRelogio); clearTimeout(tPing); clearInterval(tVersao);
    const el = chip();
    if (el) el.hidden = true;
    const aviso = EG.$('#avisoVersao');
    if (aviso) aviso.hidden = true;
  };
})(window.EG);
