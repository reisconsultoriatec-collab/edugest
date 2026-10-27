/* =====================================================================
 *  EduGest — página dos links enviados por e-mail (conta.html)
 *  Criar nova senha · confirmar e-mail · desfazer troca de e-mail.
 *
 *  Segurança:
 *  - O código do link é gerado, validado e invalidado pelo Firebase; vale
 *    por pouco tempo e uma vez só. A senha nova vai direto ao Firebase:
 *    não passa pela API do EduGest nem fica no banco.
 *  - O código sai da barra de endereço assim que a página abre e não é
 *    enviado a outros sites (meta referrer no-referrer).
 *  - A página não funciona dentro de moldura (iframe) de outro site.
 *  - Plano B: em erro inesperado, um botão abre a página padrão do
 *    Firebase com o mesmo link, como era antes.
 * ===================================================================== */
'use strict';
(function (EG) {
  const cartao = EG.$('#cartao');

  // 1) Lê o link e já tira o código da barra de endereço (não fica no histórico nem em prints)
  const q = new URLSearchParams(location.search);
  const modo = q.get('mode') || '';
  const codigo = q.get('oobCode') || '';
  const idioma = q.get('lang') || 'pt-BR';
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* segue */ }

  const REGRAS = [
    ['Pelo menos 8 caracteres', (s) => s.length >= 8],
    ['Uma letra maiúscula', (s) => /[A-Z]/.test(s)],
    ['Um número', (s) => /\d/.test(s)]
  ];
  const LINK_INVALIDO = ['auth/expired-action-code', 'auth/invalid-action-code'];
  const MSG = {
    'auth/user-disabled': 'Esta conta foi desativada. Fale com o administrador do colégio.',
    'auth/user-not-found': 'Não encontramos esta conta. Ela pode ter sido removida.',
    'auth/weak-password': 'Senha fraca: use pelo menos 8 caracteres, com uma letra maiúscula e um número.',
    'auth/network-request-failed': 'Sem conexão. Verifique sua internet e tente de novo.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  };
  const msg = (e) => MSG[e && e.code] || 'Não foi possível concluir agora.';

  /* ---------- Moldura ---------- */
  const marca = `<div class="auth-card-marca"><div class="auth-card-nome">${EG.logo()}<span>EduGest</span></div><p>Gestão Educacional</p></div>`;
  const rodape = () => `<div class="auth-seguro"><i class="ti ti-lock"></i> Conexão segura e dados protegidos</div>
    <div class="auth-rodape">v${EG.VERSAO.split('.').slice(0, 2).join('.')} Reis Tecnologia © ${new Date().getFullYear()}</div>`;
  function mostrar(html) {
    cartao.innerHTML = marca + html + rodape();
    cartao.classList.remove('troca'); void cartao.offsetWidth; cartao.classList.add('troca');
  }
  const CORES = { ok: ['--ok-bg', '--ok'], erro: ['--erro-bg', '--erro'], aviso: ['--aviso-bg', '--aviso'], info: ['--info-bg', '--info'] };
  /** Tela de resultado. texto já vem escapado (pode ter <strong>). */
  function resultado({ cor, icone, titulo, texto, botoes }) {
    const [fundo, frente] = CORES[cor];
    mostrar(`<div class="auth-status">
        <div class="icone-grande" style="background:var(${fundo});color:var(${frente})"><i class="ti ${icone}"></i></div>
        <h3>${EG.esc(titulo)}</h3><p>${texto}</p>
        <div class="conta-botoes">${botoes || irParaAcesso('Ir para a tela de acesso')}</div>
      </div>`);
  }
  const irParaAcesso = (rotulo, secundario) =>
    `<a class="btn ${secundario ? 'btn-secundario' : 'btn-primario'} btn-bloco" href="index.html"><i class="ti ti-login"></i> ${EG.esc(rotulo)}</a>`;

  /** Plano B: a página padrão do Firebase com o mesmo link (como funcionava antes). */
  function paginaPadrao() {
    const o = EG.auth.app && EG.auth.app.options ? EG.auth.app.options : {};
    const p = new URLSearchParams({ mode: modo, oobCode: codigo, apiKey: o.apiKey || '', lang: idioma });
    return `https://${o.authDomain}/__/auth/action?${p.toString()}`;
  }
  const botaoPlanoB = () => `<a class="btn btn-secundario btn-bloco" href="${EG.esc(paginaPadrao())}" rel="noreferrer"><i class="ti ti-external-link"></i> Usar a página padrão do Firebase</a>`;

  function erroInesperado(e, tentarDeNovo) {
    resultado({
      cor: 'erro', icone: 'ti-alert-triangle', titulo: 'Não foi possível concluir',
      texto: `${MSG[e && e.code] ? EG.esc(MSG[e.code]) + ' ' : ''}Tente de novo ou use a página padrão do Firebase, que faz a mesma coisa.`,
      botoes: `<button class="btn btn-primario btn-bloco" type="button" data-acao="tentar"><i class="ti ti-refresh"></i> Tentar de novo</button>${botaoPlanoB()}`
    });
    const b = EG.$('[data-acao="tentar"]', cartao);
    if (b) b.addEventListener('click', tentarDeNovo);
  }

  /* ---------- Criar nova senha ---------- */
  async function novaSenha() {
    let email;
    try {
      email = await EG.auth.verifyPasswordResetCode(codigo);
    } catch (e) {
      if (LINK_INVALIDO.includes(e.code)) {
        resultado({
          cor: 'aviso', icone: 'ti-clock-off', titulo: 'Este link não vale mais',
          texto: 'O link para criar uma nova senha vale por pouco tempo e só pode ser usado uma vez. Peça outro na tela de acesso: digite o seu e-mail e clique em <strong>Esqueci minha senha</strong>.',
          botoes: irParaAcesso('Pedir um novo link')
        });
      } else if (MSG[e.code] && e.code !== 'auth/network-request-failed') {
        resultado({ cor: 'erro', icone: 'ti-user-off', titulo: 'Não foi possível continuar', texto: EG.esc(msg(e)) });
      } else erroInesperado(e, iniciar);
      return;
    }

    mostrar(`
      <h3 class="conta-titulo">Criar nova senha</h3>
      <p class="conta-sub">Conta <strong>${EG.esc(email)}</strong></p>
      <div class="msg-erro" id="contaErro" hidden></div>
      <form id="formSenha" novalidate>
        <input type="email" name="email" value="${EG.esc(email)}" autocomplete="username" hidden>
        <div class="campo"><label for="nSenha">Nova senha</label>${EG.campoSenha('senha', 'nSenha', 'new-password', 'Digite a nova senha')}</div>
        <ul class="regras-senha" id="regras">${REGRAS.map(([t]) => `<li><i class="ti ti-circle"></i> ${t}</li>`).join('')}
          <li data-igual hidden><i class="ti ti-circle"></i> As duas senhas iguais</li></ul>
        <div class="campo"><label for="nSenha2">Repita a nova senha</label>${EG.campoSenha('senha2', 'nSenha2', 'new-password', 'Digite de novo')}</div>
        <button class="btn btn-primario btn-bloco" type="submit"><i class="ti ti-check"></i> Salvar nova senha</button>
      </form>`);

    const form = EG.$('#formSenha', cartao);
    const s1 = EG.$('#nSenha', cartao);
    const s2 = EG.$('#nSenha2', cartao);
    const itens = EG.$$('#regras li', cartao);
    const marcar = (li, ok) => { li.classList.toggle('ok', ok); li.querySelector('i').className = 'ti ' + (ok ? 'ti-circle-check' : 'ti-circle'); };
    const conferir = () => {
      REGRAS.forEach(([, teste], i) => marcar(itens[i], teste(s1.value)));
      const igual = itens[REGRAS.length];
      igual.hidden = !s2.value;
      marcar(igual, !!s2.value && s1.value === s2.value);
    };
    form.addEventListener('input', conferir);
    s1.focus();

    const erro = (m) => { const el = EG.$('#contaErro', cartao); el.textContent = m || ''; el.hidden = !m; };
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      erro('');
      const senha = s1.value;
      if (!REGRAS.every(([, teste]) => teste(senha))) { erro('A senha precisa ter pelo menos 8 caracteres, com uma letra maiúscula e um número.'); s1.focus(); return; }
      if (senha !== s2.value) { erro('As duas senhas não são iguais. Digite de novo.'); s2.focus(); return; }
      await EG.guarda(form.querySelector('[type=submit]'), async () => {
        try {
          await EG.auth.confirmPasswordReset(codigo, senha);
        } catch (e) {
          if (LINK_INVALIDO.includes(e.code)) { await novaSenha(); return; }
          if (e.code === 'auth/weak-password' || e.code === 'auth/too-many-requests') { erro(msg(e)); return; }
          erroInesperado(e, iniciar);
          return;
        }
        await registrarTroca(email, senha);
        try { sessionStorage.setItem('edugest_email_login', email); } catch (e) { /* sem storage */ }
        resultado({
          cor: 'ok', icone: 'ti-circle-check', titulo: 'Senha alterada',
          texto: 'Pronto! Use a nova senha para entrar no EduGest.',
          botoes: irParaAcesso('Entrar no EduGest')
        });
      });
    });
  }

  /**
   * Registra a troca no log de segurança do colégio: entra com a senha nova
   * (o registro só é aceito com login) e sai logo em seguida. Se falhar,
   * não atrapalha: a senha já foi trocada no Firebase.
   */
  async function registrarTroca(email, senha) {
    try {
      await EG.auth.signInWithEmailAndPassword(email, senha);
      await EG.api('POST', '/conta/evento', { tipo: 'senha_redefinida' });
    } catch (e) { /* registro complementar */ }
    try { await EG.auth.signOut(); } catch (e) { /* segue */ }
  }

  /* ---------- Confirmar e-mail ---------- */
  async function confirmarEmail() {
    try {
      await EG.auth.applyActionCode(codigo);
    } catch (e) {
      if (LINK_INVALIDO.includes(e.code)) {
        resultado({
          cor: 'aviso', icone: 'ti-mail-off', titulo: 'Link já usado ou expirado',
          texto: 'Se o seu e-mail já foi confirmado, é só entrar. Se não, entre no EduGest e peça um novo link de confirmação.'
        });
      } else erroInesperado(e, iniciar);
      return;
    }
    // Quem está com o EduGest aberto neste navegador já recebe a confirmação na sessão
    try {
      const u = await usuarioAtual();
      if (u) { await u.reload(); await u.getIdToken(true); }
    } catch (e) { /* segue */ }
    resultado({
      cor: 'ok', icone: 'ti-mail-check', titulo: 'E-mail confirmado',
      texto: 'Obrigado! Seu e-mail foi confirmado. Se o EduGest já estava aberto, saia e entre de novo para atualizar.',
      botoes: irParaAcesso('Ir para o EduGest')
    });
  }
  /** Espera o Firebase dizer se há alguém conectado neste navegador (no máximo 3 s). */
  function usuarioAtual() {
    return new Promise((ok) => {
      let feito = false;
      const fim = (u) => { if (!feito) { feito = true; ok(u || null); } };
      setTimeout(() => fim(EG.auth.currentUser), 3000);
      EG.auth.onAuthStateChanged(fim);
    });
  }

  /* ---------- Desfazer troca de e-mail / confirmar e-mail novo ---------- */
  async function recuperarEmail() {
    let antigo;
    try {
      const info = await EG.auth.checkActionCode(codigo);
      antigo = info && info.data ? info.data.email : '';
      await EG.auth.applyActionCode(codigo);
    } catch (e) {
      if (LINK_INVALIDO.includes(e.code)) resultado({ cor: 'aviso', icone: 'ti-mail-off', titulo: 'Link já usado ou expirado', texto: 'Este link não vale mais. Se precisar, fale com o administrador do colégio.' });
      else erroInesperado(e, iniciar);
      return;
    }
    resultado({
      cor: 'ok', icone: 'ti-mail-check', titulo: 'E-mail da conta restaurado',
      texto: `O e-mail da sua conta voltou a ser <strong>${EG.esc(antigo)}</strong>. Se você não pediu a troca, crie uma nova senha agora.`,
      botoes: `<button class="btn btn-primario btn-bloco" type="button" data-acao="nova-senha"><i class="ti ti-key"></i> Enviar link para nova senha</button>${irParaAcesso('Ir para a tela de acesso', true)}`
    });
    const b = EG.$('[data-acao="nova-senha"]', cartao);
    b.addEventListener('click', () => EG.guarda(b, async () => {
      try { await EG.auth.sendPasswordResetEmail(antigo); } catch (e) { /* mesma resposta */ }
      EG.toast('Enviamos o link para criar uma nova senha para o seu e-mail.', 'info');
    }));
  }
  async function emailAlterado() {
    try {
      await EG.auth.applyActionCode(codigo);
    } catch (e) {
      if (LINK_INVALIDO.includes(e.code)) resultado({ cor: 'aviso', icone: 'ti-mail-off', titulo: 'Link já usado ou expirado', texto: 'Este link não vale mais.' });
      else erroInesperado(e, iniciar);
      return;
    }
    resultado({ cor: 'ok', icone: 'ti-mail-check', titulo: 'E-mail alterado', texto: 'Pronto! Entre no EduGest usando o novo e-mail.' });
  }

  /* ---------- Partida ---------- */
  async function iniciar() {
    mostrar('<div class="auth-status"><div class="spinner pequeno" style="margin:12px auto 14px"></div><p>Verificando o link...</p></div>');
    if (!codigo) {
      resultado({
        cor: 'erro', icone: 'ti-link-off', titulo: 'Link incompleto',
        texto: 'Este endereço não tem as informações necessárias. Abra o link exatamente como chegou no seu e-mail ou peça um novo na tela de acesso.'
      });
      return;
    }
    if (modo === 'resetPassword') await novaSenha();
    else if (modo === 'verifyEmail') await confirmarEmail();
    else if (modo === 'recoverEmail') await recuperarEmail();
    else if (modo === 'verifyAndChangeEmail') await emailAlterado();
    else resultado({ cor: 'erro', icone: 'ti-link-off', titulo: 'Link não reconhecido', texto: 'Abra o link exatamente como chegou no seu e-mail ou peça um novo na tela de acesso.' });
  }

  // Dentro de moldura (iframe) de outro site, não continua: evita que alguém capture a senha digitada
  if (window.top !== window.self) {
    mostrar('<div class="auth-status"><p>Por segurança, abra este link diretamente no navegador.</p></div>');
    return;
  }
  try {
    const tema = localStorage.getItem('edugest_tema');
    if (tema) EG.aplicarTema(tema);
  } catch (e) { /* sem storage */ }
  iniciar();
})(window.EG);
