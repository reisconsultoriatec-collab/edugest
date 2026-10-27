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
  EG.VERSAO = '1.18.0';

  /** Marca do EduGest (capelo âmbar). classe: 'clara' (fundo escuro) ou 'grande'. */
  EG.logo = (classe) => `<span class="marca ${classe || ''}" aria-hidden="true"><svg viewBox="0 0 32 32">
    <path d="M16 7 4 13l12 6 12-6z" fill="#F59E0B"/><path d="M9 16v5c0 2 3.5 4 7 4s7-2 7-4v-5l-7 3.5z" fill="#F59E0B" opacity=".85"/>
    <path d="M26.5 14v6.2" stroke="#F59E0B" stroke-width="1.6" stroke-linecap="round"/></svg></span>`;

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
    // Sessão encerrada (inatividade ou saída em outra aba): nem chega a chamar a API
    if (!u && !opcoes.semToken) throw EG.erro('Sua sessão foi encerrada. Entre novamente para continuar.', 'sem_sessao', 401);
    if (u && !opcoes.semToken) headers.Authorization = 'Bearer ' + (await u.getIdToken());
    if (EG.estado.colegioId) headers['X-Colegio-Id'] = String(EG.estado.colegioId);
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';

    let resp;
    let dados = null;
    atividade(1);
    try {
      try {
        resp = await fetch(EG.API_BASE + caminho, {
          method: metodo,
          headers,
          body: corpo !== undefined ? JSON.stringify(corpo) : undefined
        });
      } catch (e) {
        if (EG.suspeitarConexao) EG.suspeitarConexao();
        throw EG.erro('Sem conexão com o servidor. Verifique sua internet.', 'rede', 0);
      }
      // Indicador do topo: 502/503/504 pode ser o servidor fora do ar (o topo confere
      // antes de avisar); qualquer outra resposta mostra que a conexão está de pé
      if (resp.status >= 502 && resp.status <= 504) { if (EG.suspeitarConexao) EG.suspeitarConexao(); }
      else if (EG.avisarConexao) EG.avisarConexao(true);
      // Gravou algo com sucesso: a tela deixa de ter alterações pendentes
      if (resp.ok && metodo !== 'GET' && EG.limparAlteracoes) EG.limparAlteracoes();
      if (resp.status === 204) return null;
      try { dados = await resp.json(); } catch (e) { dados = null; }
    } finally {
      atividade(-1);
    }
    if (!resp.ok) {
      if (resp.status === 401 && u) {
        // Token expirado ou sessão inválida: volta ao login
        setTimeout(() => EG.auth.signOut(), 1500);
      }
      throw EG.erro((dados && dados.erro) || 'Erro inesperado. Tente novamente.', dados && dados.codigo, resp.status);
    }
    return dados;
  };

  /* ---------- Barra de atividade (linha sob o topo enquanto a API trabalha) ---------- */
  let emVoo = 0, tAtividade = null;
  function atividade(delta) {
    emVoo = Math.max(0, emVoo + delta);
    const b = document.getElementById('progressoTopo');
    if (!b) return;
    clearTimeout(tAtividade);
    // só aparece se a resposta demorar; some um instante depois para não piscar entre chamadas seguidas
    tAtividade = emVoo ? setTimeout(() => b.classList.add('ativo'), 180) : setTimeout(() => b.classList.remove('ativo'), 120);
  }

  /* ---------- Carregando (tela cheia com a marca) ---------- */
  /**
   * EG.carregando(true, 'Mensagem', 40) → abre com a barra em 40%.
   * Sem o número, a barra fica em movimento contínuo. EG.carregando(false) → some suavemente.
   * Fica pelo menos MIN_MS na tela para a animação não "piscar".
   */
  const MIN_MS = 700;
  let tCarregando = null, abertoEm = 0;
  EG.carregando = function (ativo, msg, progresso) {
    const el = EG.$('#carregando');
    const txt = EG.$('#carregandoMsg');
    const barra = EG.$('#carregandoBarra');
    clearTimeout(tCarregando);
    if (ativo) {
      if (!el.classList.contains('aberto') || el.classList.contains('saindo')) abertoEm = Date.now();
      el.classList.remove('saindo');
      el.classList.add('aberto');
      const novo = msg || 'Carregando...';
      if (txt.textContent !== novo) {
        txt.textContent = novo;
        txt.classList.remove('troca'); void txt.offsetWidth; txt.classList.add('troca');
      }
      const fixa = typeof progresso === 'number';
      barra.classList.toggle('indeterminada', !fixa);
      barra.firstElementChild.style.width = fixa ? Math.max(4, Math.min(100, progresso)) + '%' : '';
      return;
    }
    if (!el.classList.contains('aberto') || el.classList.contains('saindo')) return;
    const espera = Math.max(0, MIN_MS - (Date.now() - (abertoEm || performance.timeOrigin || 0)));
    tCarregando = setTimeout(() => {
      el.classList.add('saindo');
      tCarregando = setTimeout(() => el.classList.remove('aberto', 'saindo'), 340);
    }, espera);
  };

  /** Esqueleto animado enquanto os dados chegam. pagina=true inclui a fileira de indicadores. */
  EG.esqueleto = (pagina) => `<div class="esqueleto" aria-busy="true" aria-label="Carregando">
      ${pagina ? `<div class="esq-kpis">${'<div class="esq esq-kpi"><span class="brilho esq-ico"></span><span class="esq-txt"><i class="brilho"></i><i class="brilho"></i></span></div>'.repeat(4)}</div>` : ''}
      <div class="esq esq-card"><i class="brilho esq-titulo"></i>${'<i class="brilho"></i>'.repeat(pagina ? 6 : 4)}</div>
    </div>`;

  /**
   * Mostra "Gerando..." sobre um bloco enquanto fn() trabalha (relatórios, gráficos).
   * Aparece só se demorar mais que um instante. Devolve o resultado de fn().
   */
  EG.gerando = async function (alvo, msg, fn, icone) {
    if (!alvo) return fn();
    const camada = document.createElement('div');
    camada.className = 'gerando-camada';
    camada.setAttribute('role', 'status');
    camada.innerHTML = `<div class="gerando-caixa"><span class="gerando-icone"><i class="ti ${icone || 'ti-chart-bar'}"></i></span><span></span></div>`;
    camada.querySelector('span:last-child').textContent = msg || 'Gerando relatório...';
    alvo.classList.add('gerando-alvo');
    alvo.appendChild(camada);
    try { return await fn(); } finally {
      camada.remove();
      alvo.classList.remove('gerando-alvo');
    }
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
      fechar() {
        if (!fundo.isConnected) return;
        fundo.remove(); document.removeEventListener('keydown', esc); if (aoFechar) aoFechar();
      },
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
    fundo._fechar = m.fechar;
    EG.$('#modais').appendChild(fundo);
    const primeiro = fundo.querySelector('.modal-corpo input, .modal-corpo select');
    // foco no 1º campo — a não ser que a pessoa já tenha clicado em outro campo da janela
    if (primeiro) setTimeout(() => { if (!fundo.contains(document.activeElement)) primeiro.focus(); }, 50);
    return m;
  };

  /** Fecha todas as janelas abertas (ao sair, trocar de usuário ou a sessão expirar). */
  EG.fecharModais = function () {
    EG.$$('#modais .modal-fundo').forEach((f) => (f._fechar ? f._fechar() : f.remove()));
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
  /**
   * Bimestre de hoje: pelas datas do calendário (Calendário › Definir
   * bimestres); nas férias entre dois, o que acabou de terminar. Sem datas
   * cadastradas, uma estimativa pelo mês.
   */
  EG.bimestreAtual = () => {
    const hoje = EG.hojeSP();
    const ps = ((EG.estado.colegio && EG.estado.colegio.periodos) || []).slice().sort((a, b) => a.bimestre - b.bimestre);
    if (ps.length) {
      const dentro = ps.find((p) => p.inicio <= hoje && hoje <= p.fim);
      if (dentro) return dentro.bimestre;
      const passados = ps.filter((p) => p.fim < hoje);
      return passados.length ? passados[passados.length - 1].bimestre : ps[0].bimestre;
    }
    const m = Number(hoje.slice(5, 7));
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
  EG.UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

  // Mostrar/ocultar senha
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action="ver-senha"]');
    if (!b) return;
    const inp = b.parentElement.querySelector('input');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    b.querySelector('i').className = 'ti ' + (inp.type === 'password' ? 'ti-eye' : 'ti-eye-off');
  });

  EG.campoSenha = (nome, id, autocomplete, placeholder) => `
    <div class="senha"><input class="input" type="password" name="${nome}" id="${id}" autocomplete="${autocomplete}" maxlength="128"${placeholder ? ` placeholder="${EG.esc(placeholder)}"` : ''}>
    <button type="button" data-action="ver-senha" tabindex="-1" aria-label="Mostrar senha"><i class="ti ti-eye"></i></button></div>
    <small class="caps-lock" hidden><i class="ti ti-alert-triangle"></i> Caps Lock ligado</small>`;
  // Aviso de Caps Lock ao digitar a senha
  ['keydown', 'keyup'].forEach((tipo) => document.addEventListener(tipo, (e) => {
    const t = e.target;
    if (!t.matches || !t.matches('.senha input') || typeof e.getModifierState !== 'function') return;
    const aviso = t.closest('.senha').nextElementSibling;
    if (aviso && aviso.classList.contains('caps-lock')) aviso.hidden = !e.getModifierState('CapsLock');
  }));

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

  /** Página da aba nova enquanto o PDF é gerado (estilos embutidos: a aba não tem o CSS do sistema). */
  function paginaEspera(rotulo) {
    const whats = /whats/i.test(rotulo || '');
    return `<style>
      body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;
        background:linear-gradient(135deg,#0E1730,#1A2744 50%,#22355E);color:#fff}
      .c{display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;padding:24px}
      .f{position:relative;width:72px;height:88px;border-radius:10px;background:#fff;box-shadow:0 20px 40px -12px rgba(0,0,0,.5);overflow:hidden}
      .f i{position:absolute;left:12px;right:12px;height:6px;border-radius:3px;background:#E2E8F0;animation:l 1.6s ease-in-out infinite}
      .f i:nth-child(1){top:16px;right:30px;background:#F59E0B}.f i:nth-child(2){top:30px;animation-delay:.15s}
      .f i:nth-child(3){top:42px;animation-delay:.3s}.f i:nth-child(4){top:54px;right:24px;animation-delay:.45s}.f i:nth-child(5){top:66px;animation-delay:.6s}
      @keyframes l{0%,100%{opacity:.35}50%{opacity:1}}
      strong{font-size:17px;font-weight:600}span{font-size:13px;color:rgba(255,255,255,.65)}
      @media (prefers-reduced-motion:reduce){.f i{animation:none}}
    </style><div class="c"><div class="f"><i></i><i></i><i></i><i></i><i></i></div>
      <strong>${whats ? 'Preparando a mensagem...' : 'Gerando o documento...'}</strong><span>Isso leva só alguns segundos.</span></div>`;
  }

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
        aba.document.title = 'Gerando o documento...';
        aba.document.body.innerHTML = paginaEspera(rotulo);
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

  /* ---------- Exportar CSV (abre direto no Excel em português) ---------- */
  EG.baixarCsv = function (nome, cabecalho, linhas) {
    const cel = (v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'number') return (Number.isInteger(v) ? String(v) : v.toFixed(2)).replace('.', ',');
      const s = String(v);
      return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const texto = '\uFEFF' + [cabecalho, ...linhas].map((l) => (l || []).map(cel).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
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
