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

  /** O usuário atual tem o módulo? (admin tem todos) */
  EG.pode = (modulo) => EG.estado.perfil === 'admin' || (EG.estado.modulos || []).includes(modulo);

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
  EG.mascaraCPF = function (el) {
    let d = el.value.replace(/\D/g, '').slice(0, 11);
    if (d.length > 9) d = d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    else if (d.length > 6) d = d.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    else if (d.length > 3) d = d.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    el.value = d;
  };
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches && t.matches('[data-mascara="telefone"]')) EG.mascaraTelefone(t);
    if (t.matches && t.matches('[data-mascara="cnpj"]')) EG.mascaraCNPJ(t);
    if (t.matches && t.matches('[data-mascara="cpf"]')) EG.mascaraCPF(t);
  });

  /**
   * Exclusão em duas etapas: confirma; se a API responder que há registros
   * vinculados (codigo tem_vinculos), mostra o aviso dela e confirma de novo.
   * Retorna true se excluiu.
   */
  EG.excluirComConfirmacao = async function (url, pergunta) {
    if (!(await EG.confirmar(pergunta, { perigo: true, textoOk: 'Excluir' }))) return false;
    try {
      await EG.api('DELETE', url);
      return true;
    } catch (e) {
      if (e.codigo !== 'tem_vinculos') throw e;
      if (!(await EG.confirmar(e.message + '\n\nDeseja excluir mesmo assim?', { titulo: 'Atenção', perigo: true, textoOk: 'Excluir mesmo assim' }))) return false;
      await EG.api('DELETE', url + (url.includes('?') ? '&' : '?') + 'forcar=1');
      return true;
    }
  };

  /** Opções de <select> a partir de [{value, label}] com o atual marcado. */
  EG.opcoes = (lista, atual) => lista.map((o) =>
    `<option value="${EG.esc(o.value)}" ${String(o.value) === String(atual ?? '') ? 'selected' : ''}>${EG.esc(o.label)}</option>`).join('');

  /* ---------- Pedagógico ---------- */
  const fmtDiaSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  /** 'AAAA-MM-DD' de hoje no horário de São Paulo. */
  EG.hojeSP = () => fmtDiaSP.format(new Date());
  /** Bimestre provável pela data de hoje (fev–abr 1º, mai–jul 2º, ago–set 3º, out–dez 4º). */
  EG.bimestreAtual = () => {
    const m = Number(EG.hojeSP().slice(5, 7));
    return m <= 4 ? 1 : m <= 7 ? 2 : m <= 9 ? 3 : 4;
  };
  /** Mesmas regras da API: média das notas lançadas, 1 casa. */
  EG.arred1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
  EG.mediaNotas = (lista) => {
    const vals = lista.filter((x) => x !== null && x !== undefined && x !== '').map(Number);
    return vals.length ? EG.arred1(vals.reduce((s, x) => s + x, 0) / vals.length) : null;
  };
  EG.fmtNota = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  /** Lê nota digitada ("7,5", "7.5", "") → número ou null; NaN se inválida. */
  EG.lerNota = (txt) => {
    const s = String(txt || '').trim().replace(',', '.');
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 && n <= 10 ? Math.round(n * 100) / 100 : NaN;
  };

  /**
   * Identifica usuário + colégio atuais. Os módulos guardam filtros entre
   * telas; quando a chave muda (outro login ou outro colégio), recomeçam.
   */
  EG.chaveSessao = () => `${EG.estado.colegioId}:${EG.estado.me && EG.estado.me.usuario ? EG.estado.me.usuario.id : ''}`;
  EG.filtrosDaSessao = function (obj, padrao) {
    if (obj._chave !== EG.chaveSessao()) Object.assign(obj, padrao, { _chave: EG.chaveSessao() });
    return obj;
  };

  /* ---------- Financeiro ---------- */
  EG.MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  EG.MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  /** 'AAAA-MM' do mês atual em São Paulo. */
  EG.mesAtualSP = () => EG.hojeSP().slice(0, 7);
  /** 'AAAA-MM' → 'Out/2026' */
  EG.nomeRef = (ref) => (ref ? `${EG.MESES_CURTOS[Number(ref.slice(5, 7)) - 1]}/${ref.slice(0, 4)}` : '—');
  /** Valor digitado ("1.234,56", "850", "850.5") → número; null se vazio; NaN se inválido. */
  EG.lerDinheiro = (txt) => {
    let s = String(txt ?? '').trim().replace(/[R$\s]/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
  };
  /** Número → texto para campo de valor ("850,00"). */
  EG.valorCampo = (n) => (n === null || n === undefined ? '' : Number(n).toFixed(2).replace('.', ','));
  EG.FORMAS_PAGAMENTO = ['PIX', 'Boleto', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Transferência', 'Outro'];

  /** Turmas e disciplinas permitidas no diário/notas/boletim. */
  EG.opcoesPedagogicas = () => EG.api('GET', '/pedagogico/opcoes');

  /** Mensagem quando não há turma disponível (professor sem atribuição etc.). */
  EG.semTurmas = function (op) {
    if (op.restrito && !op.vinculado) {
      return `<div class="card em-breve"><i class="ti ti-link-off"></i><h2>Login não vinculado</h2>
        <p>Seu login ainda não está vinculado a um cadastro de professor. Peça ao administrador para fazer o vínculo em
        <strong>Usuários</strong> (botão de acesso, campo "Cadastro de professor").</p></div>`;
    }
    if (op.restrito) {
      return `<div class="card em-breve"><i class="ti ti-school-off"></i><h2>Nenhuma turma atribuída</h2>
        <p>Ainda não há aulas atribuídas a você. Peça ao administrador para indicar suas disciplinas em <strong>Turmas e Séries → Professores</strong>.</p></div>`;
    }
    return `<div class="card em-breve"><i class="ti ti-layout-grid"></i><h2>Nenhuma turma cadastrada</h2>
      <p>Cadastre as turmas em <strong>Turmas e Séries</strong> para começar.</p></div>`;
  };

  /** <option> de turmas agrupadas por ano letivo. */
  EG.opcoesTurmas = function (turmas, atual, { incluirInativas = false, vazio = 'Selecione a turma' } = {}) {
    const lista = turmas.filter((t) => incluirInativas || t.ativo || t.id === Number(atual));
    const grupos = {};
    lista.forEach((t) => { (grupos[t.anoLetivo] = grupos[t.anoLetivo] || []).push(t); });
    return `<option value="">${EG.esc(vazio)}</option>` + Object.keys(grupos).sort((a, b) => b - a).map((ano) =>
      `<optgroup label="${ano}">${grupos[ano].map((t) =>
        `<option value="${t.id}" ${String(t.id) === String(atual) ? 'selected' : ''}>${EG.esc(t.nome)}${t.ativo ? '' : ' (inativa)'}</option>`).join('')}</optgroup>`).join('');
  };

  EG.SERIES = ['Berçário', 'Maternal I', 'Maternal II', 'Infantil I', 'Infantil II', 'Infantil III',
    '1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano', '6º Ano', '7º Ano', '8º Ano', '9º Ano',
    '1ª Série EM', '2ª Série EM', '3ª Série EM', 'EJA', 'Outra'];
  EG.PERIODOS = { matutino: 'Matutino', vespertino: 'Vespertino', integral: 'Integral', noturno: 'Noturno' };

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
  EG.urlWhatsApp = function (telefone, texto) {
    let d = String(telefone || '').replace(/\D/g, '');
    if (d && !d.startsWith('55')) d = '55' + d;
    return 'https://wa.me/' + (d.length >= 12 ? d : '') + '?text=' + encodeURIComponent(texto);
  };
  EG.abrirWhatsApp = function (telefone, texto) {
    window.open(EG.urlWhatsApp(telefone, texto), '_blank', 'noopener');
  };

  /**
   * Abre uma nova aba cujo endereço só fica pronto depois de uma chamada à API.
   * A aba é aberta já no clique (senão o navegador bloqueia como pop-up) e
   * recebe o endereço quando ele chega. Se o pop-up for bloqueado mesmo assim,
   * mostra um botão para abrir.
   */
  EG.abrirDepois = async function (gerarUrl, rotulo) {
    const aba = window.open('', '_blank');
    if (aba) {
      try {
        aba.document.title = 'Abrindo...';
        aba.document.body.innerHTML = '<p style="font-family:system-ui,sans-serif;color:#64748b;padding:24px">Preparando o documento...</p>';
      } catch (e) { /* aba de outra origem */ }
    }
    let url;
    try {
      url = await gerarUrl();
    } catch (e) {
      if (aba) aba.close();
      throw e;
    }
    if (aba && !aba.closed) {
      aba.opener = null;
      aba.location.replace(url);
      return;
    }
    const m = EG.modal({
      titulo: 'Pronto',
      largura: 420,
      corpo: `<p class="card-desc" style="margin:0 0 14px">O navegador bloqueou a abertura automática. Clique no botão abaixo.</p>
        <a class="btn btn-primario" href="${EG.esc(url)}" target="_blank" rel="noopener" data-fechar><i class="ti ti-external-link"></i> ${EG.esc(rotulo || 'Abrir')}</a>`,
      botoes: [{ texto: 'Fechar', acao: () => m.fechar() }]
    });
    m.el.querySelector('[data-fechar]').addEventListener('click', () => setTimeout(() => m.fechar(), 100));
  };

  /* ---------- Documentos em PDF (link assinado) ---------- */
  /** Pede à API o link do PDF. enviar=true → validade longa (WhatsApp). */
  EG.linkDocumento = async function (corpo, enviar) {
    const r = await EG.api('POST', '/documentos/link', { ...corpo, enviar: !!enviar });
    r.url = new URL(r.url, location.origin).href;
    return r;
  };
  EG.abrirDocumento = (corpo) => EG.abrirDepois(async () => (await EG.linkDocumento(corpo, false)).url, 'Abrir PDF');
  /** Abre o WhatsApp com a mensagem montada a partir do link (texto(link) → string). */
  EG.enviarDocumentoWhatsApp = (telefone, corpo, texto) => EG.abrirDepois(async () => {
    const r = await EG.linkDocumento(corpo, true);
    return EG.urlWhatsApp(telefone, texto(r));
  }, 'Abrir WhatsApp');

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
