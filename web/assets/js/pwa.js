/* =====================================================================
 *  EduGest — aplicativo instalável (PWA)
 *  · Registra o service worker (sw.js): página amigável sem internet.
 *  · "Instalar o aplicativo" no menu do usuário quando o navegador
 *    permite (Android, Chrome e Edge) e o passo a passo no iPhone.
 *  · No celular, um convite discreto, uma vez por aparelho.
 * ===================================================================== */
'use strict';
(function (EG) {
  const CHAVE_DISPENSA = 'edugest_instalar_dispensado';
  let pedido = null; // evento beforeinstallprompt guardado para quando a pessoa clicar

  const instalado = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const celular = () => (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) || /android|iphone|ipad|mobile/i.test(navigator.userAgent);
  const dispensado = () => { try { return !!localStorage.getItem(CHAVE_DISPENSA); } catch (e) { return true; } };
  const dispensar = () => { try { localStorage.setItem(CHAVE_DISPENSA, String(Date.now())); } catch (e) { /* sem armazenamento: só não lembra */ } };

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { /* segue como site */ }); });
  }

  /** Pode oferecer a instalação? (já instalado: não) */
  EG.podeInstalar = () => !instalado() && (!!pedido || ios());
  EG.appInstalado = instalado;

  function atualizarMenu() {
    const b = EG.$ && EG.$('#usuarioDropdown [data-action="instalar-app"]');
    if (b) b.hidden = !EG.podeInstalar();
  }

  function passosIphone() {
    EG.modal({
      titulo: 'Instalar o EduGest no iPhone',
      largura: 440,
      corpo: `<ol class="aj-passos">
          <li>No <strong>Safari</strong>, toque no botão <strong>Compartilhar</strong> (o quadrado com a seta para cima), na barra de baixo.</li>
          <li>Role e toque em <strong>Adicionar à Tela de Início</strong>.</li>
          <li>Toque em <strong>Adicionar</strong>. O ícone do EduGest aparece junto dos seus aplicativos.</li>
        </ol>
        <p class="sub">No Chrome do iPhone o caminho é parecido: menu Compartilhar › Adicionar à Tela de Início.</p>`
    });
  }

  EG.instalarApp = async function () {
    esconderConvite();
    if (pedido) {
      const p = pedido;
      pedido = null;
      p.prompt();
      try {
        const r = await p.userChoice;
        if (r && r.outcome === 'accepted') dispensar();
      } catch (e) { /* o navegador fechou a janela */ }
      atualizarMenu();
    } else if (ios()) passosIphone();
    else if (EG.abrirAjuda) EG.abrirAjuda({ artigo: 'app-instalar', cat: 'comecar' });
  };

  /* ---------- Convite no celular (uma vez por aparelho) ---------- */
  let tConvite = null;
  function esconderConvite() { const el = document.getElementById('avisoInstalar'); if (el) el.remove(); }
  function mostrarConvite() {
    if (!EG.podeInstalar() || dispensado() || document.getElementById('avisoInstalar')) return;
    const app = document.getElementById('app');
    // só com o sistema aberto, sem tour, janela ou aviso de versão na frente
    if (!app || app.hidden || (EG.tour && EG.tour.ativo) || document.querySelector('#modais .modal-fundo')
      || !document.getElementById('avisoVersao').hidden) { agendarConvite(60000); return; }
    const el = document.createElement('div');
    el.id = 'avisoInstalar';
    el.className = 'aviso-versao aviso-instalar';
    el.setAttribute('role', 'status');
    el.innerHTML = `<i class="ti ti-device-mobile-down" aria-hidden="true"></i>
      <span>Instale o EduGest no celular: abre direto da tela inicial, como um aplicativo.</span>
      <button class="btn btn-primario" data-action="instalar-app">${ios() ? 'Como instalar' : 'Instalar'}</button>
      <button class="aviso-versao-fechar" data-action="instalar-depois" title="Agora não" aria-label="Agora não"><i class="ti ti-x"></i></button>`;
    document.body.appendChild(el);
  }
  function agendarConvite(ms) {
    if (!celular() || instalado() || dispensado()) return;
    clearTimeout(tConvite);
    tConvite = setTimeout(mostrarConvite, ms || EG.pwaConviteMs || 30000);
  }

  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault(); // o navegador não mostra o próprio aviso; oferecemos no menu e no convite
    pedido = ev;
    atualizarMenu();
    agendarConvite();
  });
  window.addEventListener('appinstalled', () => {
    pedido = null;
    dispensar();
    esconderConvite();
    atualizarMenu();
    if (EG.toast) EG.toast('EduGest instalado! Abra pelo ícone na tela inicial.');
  });

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-action="instalar-app"], [data-action="instalar-depois"]');
    if (!b) return;
    const dd = document.getElementById('usuarioDropdown');
    if (dd) dd.hidden = true;
    if (b.dataset.action === 'instalar-app') EG.instalarApp();
    else { dispensar(); esconderConvite(); }
  });

  /* Depois do login: menu do usuário e, no iPhone (que não avisa), o convite */
  EG.iniciarPwa = function () {
    atualizarMenu();
    if (ios() && !instalado()) agendarConvite();
  };
})(window.EG);
