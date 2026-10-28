/* =====================================================================
 *  EduGest — acesso: login, cadastro, completar cadastro, pendente
 * ===================================================================== */
'use strict';
(function (EG) {
  const tela = () => EG.$('#telaAuth');

  const MSG_FIREBASE = {
    'auth/invalid-email': 'E-mail inválido.',
    'auth/user-disabled': 'Esta conta foi desativada.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/invalid-login-credentials': 'E-mail ou senha incorretos.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/email-already-in-use': 'Este e-mail já tem conta. Use a aba "Entrar" com a sua senha.',
    'auth/weak-password': 'Senha fraca: use pelo menos 8 caracteres, com uma letra maiúscula e um número.',
    'auth/password-does-not-meet-requirements': 'Senha fraca: use pelo menos 8 caracteres, com uma letra maiúscula e um número.',
    'auth/network-request-failed': 'Sem conexão. Verifique sua internet.'
  };
  const msgFirebase = (e) => MSG_FIREBASE[e && e.code] || 'Não foi possível concluir. Tente novamente.';
  const ERROS_SENHA = ['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'];

  function validarSenha(s) {
    if (!s || s.length < 8 || !/[A-Z]/.test(s) || !/\d/.test(s)) {
      throw EG.erro('A senha precisa ter pelo menos 8 caracteres, com uma letra maiúscula e um número.');
    }
  }
  function exigir(valor, msg) { if (!valor) throw EG.erro(msg); }

  /* ---------- Moldura das telas ----------
   * Painel do colégio à esquerda (some no celular) e cartão de acesso à direita.
   * O painel é montado uma vez; trocar de aba só troca o conteúdo do cartão. */
  const RECURSOS = [
    ['ti-notebook', 'Sala de aula em dia', 'Chamada, notas, boletim e grade horária lançados pelo próprio professor.'],
    ['ti-receipt', 'Financeiro sem planilha', 'Mensalidades com PIX, carnê, conciliação bancária e relatórios.'],
    ['ti-file-certificate', 'Secretaria digital', 'Declarações, histórico escolar e contrato com QR Code de validação.'],
    ['ti-home-heart', 'Família por perto', 'Portal do responsável com boletim, comunicados e cobranças.']
  ];
  function estrutura() {
    return `
      <section class="auth-lado">
        <div class="auth-lado-marca">${EG.logo('clara')}<span>EduGest</span></div>
        <div class="auth-lado-texto">
          <h1>Seu colégio organizado, da matrícula ao boletim.</h1>
          <p>Gestão escolar completa para a secretaria, a sala de aula, o financeiro e as famílias.</p>
          <ul class="auth-recursos">${RECURSOS.map(([i, t, d]) => `
            <li><span class="auth-recurso-icone"><i class="ti ${i}"></i></span><div><strong>${t}</strong><small>${d}</small></div></li>`).join('')}
          </ul>
        </div>
        <div class="auth-lado-rodape">Reis Tecnologia</div>
      </section>
      <div class="auth-direita"><div class="auth-card" id="authCard"></div></div>`;
  }
  function moldura(conteudo) {
    return `
      <div class="auth-card-marca">
        <div class="auth-card-nome">${EG.logo()}<span>EduGest</span></div>
        <p>Gestão Educacional</p>
      </div>
      <div class="msg-erro" id="authErro" hidden></div>
      ${conteudo}
      <div class="auth-seguro"><i class="ti ti-lock"></i> Conexão segura e dados protegidos</div>
      <div class="auth-rodape">v${EG.VERSAO.split('.').slice(0, 2).join('.')} Reis Tecnologia © ${new Date().getFullYear()}</div>`;
  }
  /** Coloca o conteúdo no cartão. Na 1ª vez (ou voltando do sistema) monta a tela inteira, com a entrada animada. */
  function preencher(html) {
    const t = tela();
    let card = EG.$('#authCard', t);
    if (!card) {
      t.innerHTML = estrutura();
      t.classList.remove('entrando'); void t.offsetWidth; t.classList.add('entrando');
      clearTimeout(preencher._t);
      preencher._t = setTimeout(() => t.classList.remove('entrando'), 1400);
      card = EG.$('#authCard', t);
    } else {
      card.classList.remove('troca'); void card.offsetWidth; card.classList.add('troca');
    }
    card.innerHTML = moldura(html);
  }
  function mostrarErro(msg) {
    const el = EG.$('#authErro');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }
  EG.mostrarErroAuth = mostrarErro;

  /* ---------- Formulários ---------- */
  const formLogin = () => `
    <form data-form="login" novalidate>
      <div class="campo"><label for="lEmail">E-mail</label>
        <input class="input" type="email" name="email" id="lEmail" autocomplete="username" maxlength="160" placeholder="seu@email.com"></div>
      <div class="campo"><label for="lSenha">Senha</label>${EG.campoSenha('senha', 'lSenha', 'current-password', 'Digite sua senha')}</div>
      <button class="btn btn-primario btn-bloco" type="submit"><i class="ti ti-login"></i> Entrar</button>
      <button class="auth-link" type="button" data-action="esqueci"><i class="ti ti-key"></i> Esqueci minha senha</button>
    </form>`;

  /* Equipe entra sempre pelo código do colégio. Colégio novo só o
   * proprietário do sistema cadastra (Sistema › Gestão de Colégios). */
  const camposEquipe = () => `
    <div class="msg-info"><i class="ti ti-key"></i> Peça o <strong>código do colégio</strong> ao administrador da sua escola. Seu acesso é liberado depois da aprovação dele.</div>
    <div class="campo"><label>Código do colégio</label>
      <input class="input" name="codigoConvite" maxlength="20" autocomplete="off" style="text-transform:uppercase;letter-spacing:1px"></div>`;

  const camposNovoColegio = () => `
    <div class="msg-info"><i class="ti ti-building-plus"></i> Exclusivo do proprietário do sistema. Você será o administrador do colégio novo.</div>
    <div class="campo"><label>Nome do colégio</label>
      <input class="input" name="colegioNome" maxlength="120" placeholder="Ex.: Colégio Nova Geração"></div>`;

  /** Abas Equipe / Responsável (+ Novo colégio, só para o proprietário). */
  function tipoValido(tipo) {
    const dono = !!(EG.estado.me && EG.estado.me.proprietario);
    return tipo === 'responsavel' || (tipo === 'novo' && dono) ? tipo : 'equipe';
  }
  function abasTipo(tela, tipo) {
    const tipos = [['equipe', 'Equipe do colégio'], ['responsavel', 'Sou responsável']];
    if (EG.estado.me && EG.estado.me.proprietario) tipos.push(['novo', 'Novo colégio']);
    return `<div class="abas">${tipos.map(([t, rot]) =>
      `<button class="aba ${t === tipo ? 'ativa' : ''}" data-action="tipo" data-tela="${tela}" data-tipo="${t}">${rot}</button>`).join('')}</div>`;
  }
  /** Proprietário com e-mail ainda não confirmado: explica como liberar o cadastro de colégios. */
  const avisoDono = () => (EG.estado.me && EG.estado.me.proprietarioVerificar
    ? `<div class="msg-info" style="margin-bottom:12px"><i class="ti ti-mail-check"></i> Proprietário do sistema: confirme o seu e-mail pelo link enviado
        e depois <strong>saia e entre de novo</strong> para liberar o cadastro de colégios.</div>` : '');
  const camposDoTipo = (tipo) => (tipo === 'responsavel' ? camposResponsavel() : tipo === 'novo' ? camposNovoColegio() : camposEquipe());

  const camposResponsavel = () => `
    <div class="msg-info"><i class="ti ti-info-circle"></i> Peça na secretaria o <strong>código de acesso</strong> do aluno (começa com PAI).</div>
    <div class="linha-2">
      <div class="campo"><label>Código de acesso</label>
        <input class="input" name="codigoAcesso" maxlength="9" autocomplete="off" placeholder="PAI123ABC" style="text-transform:uppercase;letter-spacing:1px"></div>
      <div class="campo"><label>Parentesco</label>
        <select class="select" name="parentesco"><option>Mãe</option><option>Pai</option><option>Avó/Avô</option><option>Tio(a)</option><option>Responsável legal</option><option>Outro</option></select></div>
    </div>`;

  const camposConta = (prefixo) => `
    <div class="campo"><label>Seu nome completo</label><input class="input" name="nome" maxlength="100" autocomplete="name"></div>
    <div class="campo"><label>E-mail</label><input class="input" type="email" name="email" maxlength="160" autocomplete="username" placeholder="seu@email.com"></div>
    <div class="campo"><label for="${prefixo}Senha">Senha</label>${EG.campoSenha('senha', prefixo + 'Senha', 'new-password')}
      <small>Mínimo de 8 caracteres, com uma letra maiúscula e um número.</small></div>`;

  /* ---------- Telas ---------- */
  EG.mostrarAuth = function (qual, extra) {
    extra = extra || {};
    EG.$('#app').hidden = true;
    if (tela().hidden) tela().innerHTML = ''; // voltando do sistema: monta de novo, com a entrada animada
    tela().hidden = false;
    EG.carregando(false);

    if (qual === 'login' || qual === 'cadastro' || qual === 'responsavel') {
      preencher(`
        <div class="abas">
          <button class="aba ${qual === 'login' ? 'ativa' : ''}" data-action="aba" data-aba="login">Entrar</button>
          <button class="aba ${qual === 'cadastro' ? 'ativa' : ''}" data-action="aba" data-aba="cadastro">Criar conta</button>
          <button class="aba ${qual === 'responsavel' ? 'ativa' : ''}" data-action="aba" data-aba="responsavel">Sou responsável</button>
        </div>
        ${qual === 'login' ? formLogin() : ''}
        ${qual === 'cadastro' ? `<form data-form="cadastro" novalidate>${camposConta('c')}${camposEquipe()}
          <button class="btn btn-primario btn-bloco" type="submit"><i class="ti ti-user-plus"></i> Criar conta</button></form>` : ''}
        ${qual === 'responsavel' ? `<form data-form="responsavel" novalidate>${camposConta('r')}${camposResponsavel()}
          <button class="btn btn-primario btn-bloco" type="submit"><i class="ti ti-user-heart"></i> Criar conta de responsável</button></form>` : ''}`);
    } else if (qual === 'completar') {
      const nome = (extra.dados && extra.dados.nome) || (EG.auth.currentUser && EG.auth.currentUser.displayName) || '';
      const tipo = tipoValido(extra.tipo);
      preencher(`
        <p style="color:var(--text-2);font-size:13px;margin-bottom:14px;text-align:center">
          Conta <strong>${EG.esc(EG.auth.currentUser ? EG.auth.currentUser.email : '')}</strong> criada. Falta concluir o cadastro no EduGest.</p>
        ${avisoDono()}${abasTipo('completar', tipo)}
        <form data-form="completar" data-tipo="${tipo}" novalidate>
          <div class="campo"><label>Seu nome completo</label><input class="input" name="nome" maxlength="100" value="${EG.esc(nome)}"></div>
          ${camposDoTipo(tipo)}
          <button class="btn btn-primario btn-bloco" type="submit"><i class="ti ti-check"></i> Concluir cadastro</button>
        </form>
        <button class="auth-link" data-action="sair">Sair e usar outra conta</button>`);
      if (extra.dados) {
        ['colegioNome', 'codigoConvite', 'codigoAcesso'].forEach((k) => {
          const c = EG.$(`[name="${k}"]`, tela());
          if (c && extra.dados[k]) c.value = extra.dados[k];
        });
      }
    } else if (qual === 'pendente') {
      const c = extra.colegio || {};
      let wa = null;
      try { wa = sessionStorage.getItem('edugest_wa_' + c.id); } catch (e) { wa = null; }
      preencher(`
        <div class="auth-status">
          <div class="icone-grande" style="background:var(--aviso-bg);color:var(--aviso)"><i class="ti ti-clock-pause"></i></div>
          <h3>Aguardando aprovação</h3>
          <p>Seu cadastro em <strong>${EG.esc(c.nome)}</strong> foi recebido. O administrador do colégio precisa aprovar o seu acesso.</p>
          ${wa ? `<button class="btn btn-whats btn-bloco" data-action="avisar-admin" data-tel="${EG.esc(wa)}" data-colegio="${EG.esc(c.nome)}" style="margin-bottom:10px"><i class="ti ti-brand-whatsapp"></i> Avisar o administrador pelo WhatsApp</button>` : ''}
          <button class="btn btn-primario btn-bloco" data-action="verificar" style="margin-bottom:10px"><i class="ti ti-refresh"></i> Verificar novamente</button>
          <button class="auth-link" data-action="sair">Sair</button>
        </div>`);
    } else if (qual === 'bloqueado') {
      const c = extra.colegio || {};
      preencher(`
        <div class="auth-status">
          <div class="icone-grande" style="background:var(--erro-bg);color:var(--erro)"><i class="ti ti-lock"></i></div>
          <h3>Acesso bloqueado</h3>
          <p>Seu acesso a <strong>${EG.esc(c.nome)}</strong> está bloqueado. Fale com o administrador do colégio.</p>
          <button class="btn btn-secundario btn-bloco" data-action="sair"><i class="ti ti-logout"></i> Sair</button>
        </div>`);
    } else if (qual === 'sem-colegio') {
      // Já tem cadastro, mas nenhum colégio ativo (acesso removido/recusado ou colégio desativado)
      const tipo = tipoValido(extra.tipo);
      preencher(`
        <div class="auth-status" style="margin-bottom:6px">
          <div class="icone-grande" style="background:var(--info-bg);color:var(--info)"><i class="ti ti-building"></i></div>
          <h3>Nenhum colégio vinculado</h3>
          <p>Informe o código abaixo ou peça ao administrador do colégio para vincular o seu e-mail em <strong>Sistema › Usuários</strong>.</p>
        </div>
        ${avisoDono()}${abasTipo('sem-colegio', tipo)}
        <form data-form="vincular" data-tipo="${tipo}" novalidate>
          ${camposDoTipo(tipo)}
          <button class="btn btn-primario btn-bloco" type="submit"><i class="ti ${tipo === 'novo' ? 'ti-building-plus' : 'ti-send'}"></i> ${tipo === 'novo' ? 'Cadastrar colégio' : 'Solicitar acesso'}</button>
        </form>
        <button class="auth-link" data-action="sair">Sair</button>`);
    } else if (qual === 'erro') {
      preencher(`
        <div class="auth-status">
          <div class="icone-grande" style="background:var(--erro-bg);color:var(--erro)"><i class="ti ti-plug-connected-x"></i></div>
          <h3>Não foi possível carregar</h3>
          <p>${EG.esc(extra.mensagem || 'Erro de comunicação com o servidor.')}</p>
          <button class="btn btn-primario btn-bloco" data-action="verificar" style="margin-bottom:10px"><i class="ti ti-refresh"></i> Tentar novamente</button>
          <button class="auth-link" data-action="sair">Sair</button>
        </div>`);
    }
    if (extra.erro) mostrarErro(extra.erro);
    const primeiro = EG.$('input:not([type=hidden])', tela());
    if (primeiro && !primeiro.value) primeiro.focus();
  };

  /* ---------- Sessão ---------- */
  EG.aoMudarLogin = async function (user) {
    if (EG._fluxoCadastro) return; // o cadastro conduz o próprio fluxo
    // Saiu, expirou ou entrou com outra conta (inclusive em outra aba do
    // mesmo navegador): nenhuma janela da sessão anterior fica aberta
    EG.fecharModais();
    if (!user) {
      if (EG.pararSessao) EG.pararSessao();
      if (EG.pararTopo) EG.pararTopo();
      EG.estado.me = null; EG.estado.colegioId = null; EG.estado.colegio = null;
      EG.mostrarAuth('login');
      return;
    }
    await EG.carregarSessao();
  };

  /** Lê /me, escolhe o colégio e decide a tela. */
  EG.carregarSessao = async function (preferirId) {
    EG.carregando(true, 'Verificando o seu acesso...', 22);
    try {
      const me = await EG.api('GET', '/me');
      EG.estado.me = me;
      if (!me.cadastrado) { EG.mostrarAuth('completar'); return; }
      const lista = me.colegios || [];
      if (!lista.length) { EG.mostrarAuth('sem-colegio'); return; }

      const pref = preferirId || me.usuario.colegioAtualId;
      const c = lista.find((x) => x.id === pref && x.status === 'ativo')
        || lista.find((x) => x.status === 'ativo')
        || lista.find((x) => x.id === pref)
        || lista[0];

      if (c.status === 'pendente') { EG.estado.colegioId = null; EG.mostrarAuth('pendente', { colegio: c }); return; }
      if (c.status !== 'ativo') { EG.estado.colegioId = null; EG.mostrarAuth('bloqueado', { colegio: c }); return; }
      await EG.entrarApp(c);
    } catch (e) {
      if (e.status === 401) { EG.mostrarAuth('login', { erro: e.message }); return; }
      EG.mostrarAuth('erro', { mensagem: e.message });
    }
  };

  /** Envia o cadastro do EduGest (depois que a conta do Firebase existe). */
  async function enviarRegistro(tipo, d) {
    if (tipo === 'responsavel') {
      const codigo = (d.codigoAcesso || '').toUpperCase();
      if (!/^PAI[A-Z0-9]{6}$/.test(codigo)) throw EG.erro('Código de acesso inválido: PAI + 6 caracteres.');
      const r = await EG.api('POST', '/conta/registrar-responsavel', { nome: d.nome, codigoAcesso: codigo, parentesco: d.parentesco });
      guardarWhats(r);
      return r;
    }
    const corpo = { nome: d.nome };
    if (tipo === 'novo') { // só o proprietário do sistema (a API confere)
      exigir(d.colegioNome, 'Informe o nome do colégio.');
      corpo.colegioNome = d.colegioNome;
    } else {
      exigir(d.codigoConvite, 'Informe o código do colégio.');
      corpo.codigoConvite = d.codigoConvite.toUpperCase();
    }
    const r = await EG.api('POST', '/conta/registrar', corpo);
    guardarWhats(r);
    return r;
  }
  function guardarWhats(r) {
    if (r && r.whatsappAdmin) {
      try { sessionStorage.setItem('edugest_wa_' + r.colegio.id, r.whatsappAdmin); } catch (e) { /* sem storage */ }
    }
  }

  async function cadastrar(tipo, d) {
    exigir(d.nome && d.nome.length >= 3, 'Informe o seu nome completo.');
    exigir(d.email, 'Informe o e-mail.');
    validarSenha(d.senha);
    if (tipo === 'equipe') exigir(d.codigoConvite, 'Informe o código do colégio.');
    if (tipo === 'responsavel') exigir(d.codigoAcesso, 'Informe o código de acesso do aluno.');

    EG._fluxoCadastro = true;
    EG.carregando(true, 'Criando conta...');
    try {
      let cred;
      try { cred = await EG.auth.createUserWithEmailAndPassword(d.email, d.senha); } catch (e) { throw EG.erro(msgFirebase(e)); }
      cred.user.updateProfile({ displayName: d.nome }).catch(() => {});
      cred.user.sendEmailVerification().catch(() => {});
      await enviarRegistro(tipo, d);
      EG._fluxoCadastro = false;
      EG.toast('Conta criada! Enviamos um link de confirmação para o seu e-mail.');
      await EG.carregarSessao();
    } catch (e) {
      EG._fluxoCadastro = false;
      EG.carregando(false);
      // Conta do Firebase já existe: corrige o código sem recriar a conta
      if (EG.auth.currentUser) EG.mostrarAuth('completar', { erro: e.message, tipo, dados: d });
      else mostrarErro(e.message);
    }
  }

  /** Quem já tem cadastro e ficou sem colégio: pede acesso pelo código (ou o proprietário cadastra um). */
  async function vincular(tipo, d) {
    let r;
    if (tipo === 'novo') {
      exigir(d.colegioNome && d.colegioNome.length >= 3, 'Informe o nome do colégio.');
      r = await EG.api('POST', '/proprietario/colegios', { nome: d.colegioNome });
      await EG.carregarSessao(r.id);
      return;
    }
    if (tipo === 'responsavel') {
      r = await enviarRegistro('responsavel', d);
    } else {
      exigir(d.codigoConvite, 'Informe o código do colégio.');
      r = await EG.api('POST', '/conta/entrar-colegio', { codigoConvite: d.codigoConvite.toUpperCase() });
      guardarWhats(r);
    }
    await EG.carregarSessao(r.colegio.id);
  }

  /* ---------- Eventos ---------- */
  document.addEventListener('submit', async (ev) => {
    const form = ev.target.closest('#telaAuth form[data-form]');
    if (!form) return;
    ev.preventDefault();
    mostrarErro('');
    const d = EG.lerForm(form);
    const btn = form.querySelector('[type=submit]');
    const tipoForm = form.dataset.form;

    await EG.guarda(btn, async () => {
      try {
        if (tipoForm === 'login') {
          exigir(d.email && d.senha, 'Informe e-mail e senha.');
          EG._loginManual = true;
          try {
            await EG.auth.signInWithEmailAndPassword(d.email, d.senha);
          } catch (e) {
            EG._loginManual = false;
            if (ERROS_SENHA.includes(e.code)) EG.api('POST', '/conta/falha-login', { email: d.email }, { semToken: true }).catch(() => {});
            throw EG.erro(msgFirebase(e));
          }
        } else if (tipoForm === 'cadastro') {
          await cadastrar('equipe', d);
        } else if (tipoForm === 'responsavel') {
          await cadastrar('responsavel', d);
        } else if (tipoForm === 'completar') {
          exigir(d.nome && d.nome.length >= 3, 'Informe o seu nome completo.');
          EG.carregando(true, 'Concluindo cadastro...');
          try { await enviarRegistro(form.dataset.tipo, d); } finally { EG.carregando(false); }
          await EG.carregarSessao();
        } else if (tipoForm === 'vincular') {
          await vincular(form.dataset.tipo, d);
        }
      } catch (e) {
        mostrarErro(e.message);
      }
    });
  });

  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('#telaAuth [data-action]');
    if (!b) return;
    const acao = b.dataset.action;
    if (acao === 'aba') EG.mostrarAuth(b.dataset.aba);
    else if (acao === 'tipo') {
      // Troca de aba sem perder o nome já digitado
      const nome = EG.$('#telaAuth [name=nome]');
      EG.mostrarAuth(b.dataset.tela, { tipo: b.dataset.tipo, dados: nome && nome.value ? { nome: nome.value } : null });
    }
    else if (acao === 'esqueci') {
      const email = (EG.$('#lEmail').value || '').trim();
      if (!email) { mostrarErro('Digite o seu e-mail no campo acima e clique de novo em "Esqueci minha senha".'); return; }
      try { await EG.auth.sendPasswordResetEmail(email); } catch (e) { /* mesma resposta para não revelar contas */ }
      mostrarErro('');
      EG.toast('Se este e-mail tiver conta, você vai receber o link para criar uma nova senha.', 'info');
    } else if (acao === 'verificar') {
      await EG.carregarSessao();
    } else if (acao === 'avisar-admin') {
      const nome = EG.estado.me && EG.estado.me.usuario ? EG.estado.me.usuario.nome : '';
      const email = EG.auth.currentUser ? EG.auth.currentUser.email : '';
      EG.abrirWhatsApp(b.dataset.tel,
        `🔔 *Novo cadastro no EduGest — ${b.dataset.colegio}*\n\n👤 ${nome}\n📧 ${email}\n\nAguardando aprovação na tela *Usuários*.`);
    } else if (acao === 'sair') {
      EG.auth.signOut();
    }
  });
})(window.EG);
