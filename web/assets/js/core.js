/* =====================================================================
 *  EduGest — núcleo do front  ·  Reis Tecnologia
 *  Firebase (só login), chamada à API, escape, toast, modal, tema.
 *  Regra de ouro: todo texto vindo de dados passa por EG.esc() antes
 *  de entrar em innerHTML. Ações usam data-action (sem onclick inline).
 * ===================================================================== */
'use strict';
window.EG = window.EG || {};

(function (EG) {
  firebase.initializeApp({
    apiKey: 'AIzaSyBErShvBxrx1PMbTQURzcSl_-RbEDKlbYg',
    authDomain: 'edugest-80e0f.firebaseapp.com',
    projectId: 'edugest-80e0f',
    storageBucket: 'edugest-80e0f.firebasestorage.app',
    messagingSenderId: '1058401021320',
    appId: '1:1058401021320:web:a715d74d6b6b65219f1e3d'
  });
  EG.auth = firebase.auth();
  EG.auth.languageCode = 'pt';

  EG.API_BASE = '/api';

  EG.estado = {
    me: null,          // resposta de GET /api/me
    colegioId: null,   // colégio atual
    colegio: null,     // resposta de GET /api/colegios/atual
    perfil: null,
    modulos: []
  };

  /* ---------- Utilidades ---------- */
  const MAPA_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  EG.esc = (s) => (s === null || s === undefined ? '' : String(s).replace(/[&<>"']/g, (c) => MAPA_ESC[c]));
  EG.$ = (sel, el) => (el || document).querySelector(sel);
  EG.$$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  EG.iniciais = (nome) => String(nome || '?').trim().charAt(0).toUpperCase() || '?';

  /** 'AAAA-MM-DD HH:MM:SS' → 'DD/MM/AAAA HH:MM' (sem conversão de fuso) */
  EG.dataHora = (s) => {
    if (!s) return '—';
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!m) return EG.esc(s);
    return `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` ${m[4]}:${m[5]}` : '');
  };
  EG.data = (s) => EG.dataHora(s).slice(0, 10);
  EG.moeda = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  EG.PERFIS = { admin: 'Administrador', professor: 'Professor', financeiro: 'Financeiro', responsavel: 'Responsável' };
  EG.STATUS = { ativo: 'Ativo', pendente: 'Pendente', bloqueado: 'Bloqueado' };

  /* ---------- Chamada à API ---------- */
  EG.erro = (mensagem, codigo, status) => {
    const e = new Error(mensagem);
    e.codigo = codigo;
    e.status = status;
    return e;
  };

  /**
   * EG.api('GET', '/me') · EG.api('POST', '/usuarios/vincular', {...})
   * Lança Error com a mensagem amigável que a API devolveu.
   */
  EG.api = async function (metodo, caminho, corpo, opcoes) {
    opcoes = opcoes || {};
    const headers = {};
    const u = EG.auth.currentUser;
    if (u && !opcoes.semToken) headers.Authorization = 'Bearer ' + (await u.getIdToken());
    if (EG.estado.colegioId) headers['X-Colegio-Id'] = String(EG.estado.colegioId);
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';

    let resp;
    try {
      resp = await fetch(EG.API_BASE + caminho, {
        method: metodo,
        headers,
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined
      });
    } catch (e) {
      throw EG.erro('Sem conexão com o servidor. Verifique sua internet.', 'rede', 0);
    }
    if (resp.status === 204) return null;
    let dados = null;
    try { dados = await resp.json(); } catch (e) { dados = null; }
    if (!resp.ok) {
      if (resp.status === 401 && u) {
        // Token expirado ou sessão inválida: volta ao login
        setTimeout(() => EG.auth.signOut(), 1500);
      }
      throw EG.erro((dados && dados.erro) || 'Erro inesperado. Tente novamente.', dados && dados.codigo, resp.status);
    }
    return dados;
  };

  /* ---------- Carregando ---------- */
  EG.carregando = function (ativo, msg) {
    EG.$('#carregandoMsg').textContent = msg || 'Carregando...';
    EG.$('#carregando').classList.toggle('aberto', !!ativo);
  };

  /* ---------- Toast ---------- */
  EG.toast = function (msg, tipo) {
    const t = document.createElement('div');
    t.className = 'toast' + (tipo === 'erro' ? ' erro' : '');
    const icone = tipo === 'erro' ? 'ti-alert-circle' : tipo === 'info' ? 'ti-info-circle' : 'ti-circle-check';
    t.innerHTML = `<i class="ti ${icone}"></i><span></span>`;
    t.querySelector('span').textContent = msg;
    EG.$('#toasts').appendChild(t);
    setTimeout(() => t.remove(), tipo === 'erro' ? 6000 : 3500);
  };

  /* ---------- Modal ---------- */
  /**
   * EG.modal({ titulo, corpo (HTML), largura, botoes: [{ texto, classe, acao(modal) }] })
   * acao pode ser async; se lançar erro, o modal mostra o erro e continua aberto.
   * Retorna { el, fechar }.
   */
  EG.modal = function ({ titulo, corpo, botoes, largura, aoFechar }) {
    const fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    fundo.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" style="${largura ? 'max-width:' + largura + 'px' : ''}">
        <div class="modal-cab"><h3></h3><button class="btn-icone" data-fechar aria-label="Fechar"><i class="ti ti-x"></i></button></div>
        <div class="modal-corpo"><div class="msg-erro" data-erro hidden></div>${corpo || ''}</div>
        <div class="modal-rodape"></div>
      </div>`;
    fundo.querySelector('h3').textContent = titulo || '';
    const rodape = fundo.querySelector('.modal-rodape');
    const caixaErro = fundo.querySelector('[data-erro]');
    const m = {
      el: fundo,
      fechar() { fundo.remove(); document.removeEventListener('keydown', esc); if (aoFechar) aoFechar(); },
      erro(msg) { caixaErro.textContent = msg; caixaErro.hidden = !msg; if (msg) caixaErro.scrollIntoView({ block: 'nearest' }); }
    };
    const esc = (e) => { if (e.key === 'Escape') m.fechar(); };
    document.addEventListener('keydown', esc);
    fundo.querySelector('[data-fechar]').addEventListener('click', m.fechar);
    fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) m.fechar(); });

    (botoes || [{ texto: 'Fechar', classe: 'btn-secundario', acao: () => m.fechar() }]).forEach((b) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.classe || 'btn-secundario');
      btn.innerHTML = b.icone ? `<i class="ti ${b.icone}"></i>` : '';
      btn.appendChild(document.createTextNode(b.texto));
      btn.addEventListener('click', () => EG.guarda(btn, async () => {
        m.erro('');
        try { await b.acao(m); } catch (e) { m.erro(e.message); }
      }));
      rodape.appendChild(btn);
    });
    EG.$('#modais').appendChild(fundo);
    const primeiro = fundo.querySelector('.modal-corpo input, .modal-corpo select');
    if (primeiro) setTimeout(() => primeiro.focus(), 50);
    return m;
  };

  /** Confirmação: resolve true/false. */
  EG.confirmar = function (mensagem, { titulo = 'Confirmar', textoOk = 'Confirmar', perigo = false } = {}) {
    return new Promise((resolve) => {
      let respondeu = false;
      const m = EG.modal({
        titulo,
        corpo: `<p style="line-height:1.55;white-space:pre-line">${EG.esc(mensagem)}</p>`,
        largura: 440,
        aoFechar: () => { if (!respondeu) resolve(false); },
        botoes: [
          { texto: 'Cancelar', classe: 'btn-secundario', acao: () => m.fechar() },
          { texto: textoOk, classe: perigo ? 'btn-perigo' : 'btn-primario', acao: () => { respondeu = true; m.fechar(); resolve(true); } }
        ]
      });
    });
  };

  /* ---------- Proteção contra duplo clique ---------- */
  const emAndamento = new WeakSet();
  EG.guarda = async function (btn, fn) {
    if (btn && emAndamento.has(btn)) return;
    let html = '';
    if (btn) {
      emAndamento.add(btn);
      html = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner pequeno"></span> Aguarde...';
    }
    try { return await fn(); } finally {
      if (btn) { emAndamento.delete(btn); btn.disabled = false; btn.innerHTML = html; }
    }
  };

  /* ---------- Formulários ---------- */
  /** Lê os campos [name] de um container para um objeto. */
  EG.lerForm = function (el) {
    const o = {};
    EG.$$('[name]', el).forEach((c) => {
      if (c.type === 'checkbox') {
        if (!o[c.name]) o[c.name] = [];
        if (c.checked) o[c.name].push(c.value);
      } else o[c.name] = c.value.trim();
    });
    return o;
  };

  EG.mascaraTelefone = function (el) {
    let d = el.value.replace(/\D/g, '').slice(0, 11);
    if (d.length > 10) d = d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    else if (d.length > 6) d = d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    else if (d.length > 2) d = d.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    el.value = d;
  };
  // CNPJ numérico ou alfanumérico (jul/2026)
  EG.mascaraCNPJ = function (el) {
    let c = el.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14);
    c = c.replace(/^(.{2})(.{1,3})?(.{1,3})?(.{1,4})?(.{1,2})?$/, (_, a, b, d, e, f) =>
      a + (b ? '.' + b : '') + (d ? '.' + d : '') + (e ? '/' + e : '') + (f ? '-' + f : ''));
    el.value = c;
  };
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches && t.matches('[data-mascara="telefone"]')) EG.mascaraTelefone(t);
    if (t.matches && t.matches('[data-mascara="cnpj"]')) EG.mascaraCNPJ(t);
  });

  // Mostrar/ocultar senha
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action="ver-senha"]');
    if (!b) return;
    const inp = b.parentElement.querySelector('input');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    b.querySelector('i').className = 'ti ' + (inp.type === 'password' ? 'ti-eye' : 'ti-eye-off');
  });

  EG.campoSenha = (nome, id, autocomplete) => `
    <div class="senha"><input class="input" type="password" name="${nome}" id="${id}" autocomplete="${autocomplete}" maxlength="128">
    <button type="button" data-action="ver-senha" tabindex="-1" aria-label="Mostrar senha"><i class="ti ti-eye"></i></button></div>`;

  /* ---------- Tema ---------- */
  EG.aplicarTema = function (tema) {
    document.documentElement.setAttribute('data-theme', tema);
    const i = EG.$('#iconeTema');
    if (i) i.className = 'ti ' + (tema === 'dark' ? 'ti-sun' : 'ti-moon');
    try { localStorage.setItem('edugest_tema', tema); } catch (e) { /* sem storage */ }
  };
  EG.alternarTema = () => EG.aplicarTema(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');

  /* ---------- Copiar ---------- */
  EG.copiar = async function (texto, msg) {
    try { await navigator.clipboard.writeText(texto); EG.toast(msg || 'Copiado!'); } catch (e) { EG.toast('Não foi possível copiar', 'erro'); }
  };

  /* ---------- WhatsApp ---------- */
  EG.abrirWhatsApp = function (telefone, texto) {
    let d = String(telefone || '').replace(/\D/g, '');
    if (d && !d.startsWith('55')) d = '55' + d;
    window.open('https://wa.me/' + (d.length >= 12 ? d : '') + '?text=' + encodeURIComponent(texto), '_blank', 'noopener');
  };

  /* ---------- Registro de módulos ---------- */
  EG.modulos = {};   // id → { titulo, render(el) }
  EG.registrarModulo = (id, def) => { EG.modulos[id] = def; };

  /* ---------- Partida ---------- */
  EG.iniciar = function () {
    let tema = 'light';
    try { tema = localStorage.getItem('edugest_tema') || 'light'; } catch (e) { /* sem storage */ }
    EG.aplicarTema(tema);
    EG.auth.onAuthStateChanged((user) => EG.aoMudarLogin(user));
  };
})(window.EG);
