/* =====================================================================
 *  EduGest — "estou online"
 *  Cada aba aberta manda um sinal por minuto (POST /api/presenca/sinal)
 *  com um código aleatório da aba e se a pessoa mexeu na tela nos
 *  últimos 5 minutos. Não manda a tela em uso.
 *  · Fechou a aba ou saiu: avisa na hora (/presenca/saida).
 *  · O sinal NÃO conta como uso: o tempo de inatividade continua valendo.
 *  · Usa fetch direto (não EG.api): não mexe na barra de carregamento,
 *    no aviso de alterações não salvas nem no indicador de conexão.
 *  · Administrador: a resposta traz quantos estão online (contador do topo).
 *  · Sessão encerrada por um administrador, ou acesso bloqueado: sai
 *    do sistema e explica o motivo.
 * ===================================================================== */
'use strict';
(function (EG) {
  const INTERVALO_MS = 60 * 1000;
  const ATIVO_MS = 5 * 60 * 1000;
  const SAI_SE = ['bloqueado', 'sem_vinculo', 'pendente'];
  let aba = null, timer = null, enviando = false, ultimoEnvio = 0, token = null, ligado = false;
  let ultimoToque = Date.now();

  const novaAba = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  ['mousedown', 'keydown', 'touchstart', 'touchmove', 'wheel'].forEach((t) => document.addEventListener(t, () => { ultimoToque = Date.now(); }, { passive: true, capture: true }));

  function cabecalhos() {
    const h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    if (EG.estado.colegioId) h['X-Colegio-Id'] = String(EG.estado.colegioId);
    return h;
  }

  async function enviar() {
    if (!ligado || enviando || !EG.estado.colegioId || EG.$('#app').hidden) return;
    const u = EG.auth.currentUser;
    if (!u) return;
    enviando = true; ultimoEnvio = Date.now();
    try {
      token = await u.getIdToken();
      const ativo = document.visibilityState === 'visible' && Date.now() - ultimoToque < ATIVO_MS;
      if (!ligado || !aba) return null;
      const resp = await fetch(EG.API_BASE + '/presenca/sinal', { method: 'POST', headers: cabecalhos(), body: JSON.stringify({ aba, ativo }) });
      let dados = null;
      try { dados = await resp.json(); } catch (e) { dados = null; }
      if (!ligado) return;
      if (resp.ok && dados && dados.encerrada) return sairComAviso('O administrador do colégio encerrou a sua sessão. Para continuar, entre de novo com a sua senha.');
      if (resp.status === 403 && dados && SAI_SE.includes(dados.codigo)) return sairComAviso(dados.erro || 'O seu acesso a este colégio mudou.');
      if (resp.status === 409 && dados && dados.codigo === 'aba') { aba = novaAba(); return null; }
      if (resp.ok && dados) contador(dados.online);
    } catch (e) {
      /* sem conexão: o indicador do topo já avisa; tenta de novo no próximo minuto */
    } finally {
      enviando = false;
    }
    return null;
  }

  /** Contador "N online" no topo (só administrador). */
  function contador(n) {
    const b = EG.$('#onlineContador');
    if (!b) return;
    const mostra = EG.estado.perfil === 'admin' && typeof n === 'number';
    b.hidden = !mostra;
    if (mostra) {
      b.querySelector('[data-online-n]').textContent = String(n);
      b.title = `${n} ${n === 1 ? 'pessoa conectada' : 'pessoas conectadas'} agora · ver quem está online`;
    }
  }
  EG.atualizarContadorOnline = contador;

  function sairComAviso(msg) {
    EG.pararPresenca(false);
    if (EG.pararSessao) EG.pararSessao();
    EG.auth.signOut().finally(() => {
      history.replaceState(null, '', location.pathname);
      // depois que a tela de entrada aparece (ela fecha as janelas abertas)
      setTimeout(() => EG.modal({
        titulo: 'Sessão encerrada',
        largura: 420,
        corpo: `<div class="auth-status"><div class="icone-grande" style="background:var(--aviso-bg);color:var(--aviso)"><i class="ti ti-logout"></i></div><p>${EG.esc(msg)}</p></div>`
      }), 700);
    });
  }

  /** Chamado ao entrar no colégio (e ao trocar de colégio). */
  EG.iniciarPresenca = function () {
    if (!aba) aba = novaAba();
    ligado = true;
    clearInterval(timer);
    timer = setInterval(enviar, INTERVALO_MS);
    enviar();
  };

  /** Para de mandar sinal; avisando=true tira da lista na hora (saída normal). */
  EG.pararPresenca = async function (avisando) {
    const tinha = ligado && aba;
    const antiga = aba;
    ligado = false;
    aba = null; // a próxima entrada é uma sessão nova (a encerrada pelo administrador fica para trás)
    clearInterval(timer); timer = null;
    contador(null);
    if (avisando && tinha && token) {
      try { await fetch(EG.API_BASE + '/presenca/saida', { method: 'POST', headers: cabecalhos(), body: JSON.stringify({ aba: antiga }), keepalive: true }); } catch (e) { /* expira sozinho em 2 minutos */ }
    }
  };

  // Voltou para a aba: confere logo (o navegador atrasa os relógios das abas escondidas)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - ultimoEnvio > 20 * 1000) enviar();
  });
  // Fechou a aba, recarregou ou saiu do site: some da lista na hora
  window.addEventListener('pagehide', () => {
    if (!ligado || !aba || !token) return;
    try { fetch(EG.API_BASE + '/presenca/saida', { method: 'POST', headers: cabecalhos(), body: JSON.stringify({ aba }), keepalive: true }); } catch (e) { /* expira sozinho */ }
  });
  // Voltou pelo botão "voltar" do navegador (página guardada em memória): marca de novo
  window.addEventListener('pageshow', (ev) => { if (ev.persisted && ligado) enviar(); });
})(window.EG);
