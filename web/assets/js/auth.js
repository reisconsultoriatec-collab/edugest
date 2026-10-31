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
  /* ---------- Frase do painel, escrita a lápis ----------
   * Cada letra é traçada (contorno dourado) no ritmo do lápis e depois se preenche de branco;
   * no fim o lápis sublinha "completa" e sai. Leitores de tela leem a frase inteira (so-leitor).
   * Celular (painel escondido) e "reduzir movimento": a frase aparece pronta, sem lápis. */
  const FRASE = 'Gestão escolar completa para a secretaria, a sala de aula, o financeiro e as famílias.';
  const DESTAQUE = 'completa';
  const LAPIS = `<svg viewBox="0 0 120 22" aria-hidden="true">
      <path d="M7 8.2 22 3v16L7 13.8z" fill="#F3D2A6"/><path d="M0 11 7 8.2v5.6z" fill="#1E293B"/>
      <rect x="22" y="3" width="72" height="16" fill="#F59E0B"/><rect x="22" y="3" width="72" height="5" fill="#FCD34D"/>
      <rect x="22" y="14" width="72" height="5" fill="#D97706"/>
      <rect x="94" y="2.5" width="11" height="17" fill="#CBD5E1"/><path d="M97.5 2.5v17M101 2.5v17" stroke="#94A3B8" stroke-width="1"/>
      <path d="M105 2.5h7a5 5 0 0 1 5 5v7a5 5 0 0 1-5 5h-7z" fill="#F9A8B8"/></svg>`;
  function fraseHtml() {
    return FRASE.split(' ').map((p) => {
      const letras = [...p].map((c) => `<span class="esc-l">${EG.esc(c)}</span>`).join('');
      return p === DESTAQUE
        ? `<span class="esc-p esc-destaque">${letras}<svg class="esc-risco" viewBox="0 0 200 14" preserveAspectRatio="none"><path d="M3 9C45 5 90 4 130 6S185 9 197 5" pathLength="1"/></svg></span>`
        : `<span class="esc-p">${letras}</span>`;
    }).join(' ');
  }

  let escrita = { quadro: 0, espera: 0 };
  function escreverFrase(t) {
    cancelAnimationFrame(escrita.quadro); clearTimeout(escrita.espera);
    const h1 = EG.$('.auth-titulo', t), caixa = EG.$('.auth-lado-texto', t), lapis = EG.$('.lapis', t);
    if (!h1 || !caixa || !lapis) return;
    const letras = [...h1.querySelectorAll('.esc-l')];
    const risco = EG.$('.esc-risco', h1), traco = risco && risco.querySelector('path');
    const mov = lapis.firstElementChild;
    const terminar = () => {
      cancelAnimationFrame(escrita.quadro); clearTimeout(escrita.espera);
      letras.forEach((l) => { l.style.clipPath = ''; });
      if (traco) traco.style.strokeDashoffset = '';
      h1.classList.add('escrito'); lapis.classList.remove('visivel');
    };
    let reduzir = false;
    try { reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* segue */ }
    if (reduzir || !caixa.offsetParent || !letras.length) return terminar();

    // Roteiro (montado já com a fonte carregada): em cada letra o lápis primeiro se desloca
    // (espaço, vírgula, troca de linha) e depois escreve
    let passos = [];
    const roteiro = () => {
      const r0 = letras.map((l) => l.getBoundingClientRect());
      passos = letras.map((l, i) => {
        const anterior = i ? letras[i - 1].textContent : '';
        const novaLinha = i > 0 && r0[i].top - r0[i - 1].top > 4;
        const novaPalavra = i > 0 && !l.previousElementSibling;
        let desloca = i === 0 || novaLinha ? 420 : novaPalavra ? 70 : 0;
        if (novaPalavra && anterior === ',') desloca += 200;
        return { desloca, escreve: 12 + r0[i].width * 0.95 + Math.random() * 10, novaLinha, novaPalavra };
      });
    };
    const suave = (f) => (f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2);
    const ponta = (r, b, direita) => ({ x: (direita ? r.right : r.left) - b.left, y: r.top + r.height * 0.8 - b.top });
    const por = (p, sobe = 0, gira = 0) => {
      lapis.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      mov.style.transform = `translateY(${(-sobe).toFixed(1)}px) rotate(${gira.toFixed(2)}deg)`;
    };
    const entre = (a, c, f) => ({ x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f });
    const noRisco = (b, f) => {
      const rr = risco.getBoundingClientRect(); const pt = traco.getPointAtLength(f * traco.getTotalLength());
      return { x: rr.left + (pt.x / 200) * rr.width - b.left, y: rr.top + (pt.y / 14) * rr.height - b.top };
    };
    let i = 0, tempo = 0, fase = 'letras', ultimo = null, deOnde = null;
    const DURA = { chega: 380, risca: 520, sai: 480 };

    function quadro(agora) {
      if (!h1.isConnected || t.hidden) return terminar();
      tempo += ultimo === null ? 0 : Math.min(agora - ultimo, 50); // aba escondida: continua de onde parou
      ultimo = agora;
      const b = caixa.getBoundingClientRect();
      if (fase === 'letras') {
        for (;;) {
          const p = passos[i], r = letras[i].getBoundingClientRect();
          const ini = ponta(r, b, false), fim = ponta(r, b, true);
          if (tempo < p.desloca) { // indo até o começo da letra
            const f = tempo / p.desloca;
            const de = i ? ponta(letras[i - 1].getBoundingClientRect(), b, true) : { x: ini.x + 34, y: ini.y - 40 };
            por(entre(de, ini, i === 0 || p.novaLinha ? suave(f) : f), (p.novaLinha ? 12 : p.novaPalavra ? 4 : 0) * Math.sin(f * Math.PI));
            break;
          }
          const g = (tempo - p.desloca) / p.escreve;
          if (g < 1) { // escrevendo a letra, da esquerda para a direita
            letras[i].classList.add('traco');
            letras[i].style.clipPath = `inset(-35% ${((1 - g) * 100).toFixed(1)}% -35% -12%)`;
            por(entre(ini, fim, g), 2.5 * Math.sin(g * Math.PI), -2 * Math.sin(g * Math.PI));
            break;
          }
          letras[i].style.clipPath = ''; letras[i].classList.add('traco', 'feito'); // computador lento: a letra pode passar inteira num quadro só
          tempo -= p.desloca + p.escreve; i += 1;
          if (i >= letras.length) { fase = risco ? 'chega' : 'sai'; deOnde = fim; break; }
        }
      }
      if (fase === 'chega') { // vai até o começo do sublinhado
        const f = Math.min(1, tempo / DURA.chega);
        por(entre(deOnde, noRisco(b, 0), suave(f)), 10 * Math.sin(f * Math.PI));
        if (f >= 1) { tempo -= DURA.chega; fase = 'risca'; }
      }
      if (fase === 'risca') { // sublinha "completa"
        const f = Math.min(1, tempo / DURA.risca);
        traco.style.strokeDashoffset = String(1 - f);
        por(noRisco(b, f), 0, -1.5 * Math.sin(f * Math.PI));
        if (f >= 1) { tempo -= DURA.risca; fase = 'sai'; deOnde = noRisco(b, 1); }
      }
      if (fase === 'sai') { // levanta e some
        const f = Math.min(1, tempo / DURA.sai);
        if (!lapis.classList.contains('saindo')) { lapis.classList.add('saindo'); lapis.classList.remove('visivel'); }
        por(entre(deOnde, { x: deOnde.x + 30, y: deOnde.y - 38 }, suave(f)));
        if (f >= 1) return terminar();
      }
      escrita.quadro = requestAnimationFrame(quadro);
    }

    h1.classList.remove('escrito'); lapis.classList.remove('saindo');
    // espera a fonte e a entrada da tela; começa no máximo em 1,5 s
    const fontes = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((ok) => setTimeout(ok, 1500))]) : Promise.resolve();
    const comeco = Date.now();
    fontes.then(() => {
      escrita.espera = setTimeout(() => {
        if (!h1.isConnected) return;
        if (!caixa.offsetParent) return terminar();
        roteiro();
        lapis.classList.add('visivel');
        escrita.quadro = requestAnimationFrame(quadro);
      }, Math.max(0, 650 - (Date.now() - comeco)));
    });
  }

  function estrutura() {
    return `
      <section class="auth-lado">
        <div class="auth-lado-marca">${EG.logo('clara')}<span>EduGest</span></div>
        <div class="auth-lado-texto">
          <h1 class="auth-titulo"><span class="so-leitor">${FRASE}</span><span class="esc" aria-hidden="true">${fraseHtml()}</span></h1>
          <div class="lapis" aria-hidden="true"><div class="lapis-mov">${LAPIS}</div></div>
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
      <div class="auth-rodape">v${EG.VERSAO.split('.').slice(0, 2).join('.')} Reis Tecnologia © ${new Date().getFullYear()}
        · <a href="termos.html" target="_blank" rel="noopener">Termos de uso</a> · <a href="privacidade.html" target="_blank" rel="noopener">Privacidade</a></div>`;
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
      escreverFrase(t);
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
      if (EG.pararPresenca) EG.pararPresenca(false);
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
