/* =====================================================================
 *  EduGest — Privacidade (LGPD)
 *  · Aceite dos termos de uso e da política de privacidade: todo mundo,
 *    uma vez por versão, antes de usar o sistema.
 *  · Portal: "Privacidade e meus dados" — quem cuida dos dados, cópia
 *    dos dados, pedidos ao colégio e encerrar o próprio acesso.
 *  · Administrador: "Privacidade (LGPD)" — encarregado, pedidos dos
 *    titulares, cópia dos dados de um aluno e limpeza da captação.
 * ===================================================================== */
'use strict';
(function (EG) {
  const esc = (s) => EG.esc(s);
  const SITUACAO = {
    aberta: ['Aberta', 'selo-aviso'], em_andamento: ['Em andamento', 'selo-info'],
    concluida: ['Concluída', 'selo-ok'], recusada: ['Recusada', 'selo-erro']
  };
  const selo = (s) => { const x = SITUACAO[s.status] || [s.statusRotulo || s.status, 'selo-neutro']; return `<span class="selo ${x[1]}">${esc(x[0])}</span>`; };
  const aberto = (s) => s.status === 'aberta' || s.status === 'em_andamento';
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const slug = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

  /** Baixa um objeto como arquivo .json (legível no bloco de notas). */
  EG.baixarJson = function (nome, dados) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  /* =================== Aceite dos termos =================== */
  let aceiteAberto = null;
  /** Mostra os termos (janela que só fecha aceitando ou saindo). Resolve quando aceitos. */
  EG.exigirTermos = function () {
    const me = EG.estado.me;
    const t = me && me.termos;
    if (!t || t.aceito) return Promise.resolve(true);
    if (aceiteAberto) return aceiteAberto;
    aceiteAberto = new Promise((ok) => {
      const resp = EG.estado.perfil === 'responsavel';
      const col = (EG.estado.colegio && EG.estado.colegio.nome) || 'O colégio';
      EG.modal({
        titulo: 'Termos de uso e privacidade',
        largura: 580,
        fixo: true,
        aoFechar: () => { aceiteAberto = null; },
        corpo: `<div class="termos-aceite">
          <p>Para usar o EduGest, leia e aceite como o sistema trata os dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018). Em resumo:</p>
          <ul class="termos-pontos">
            <li><i class="ti ti-building"></i><span><strong>${esc(col)}</strong> decide sobre os dados (é o controlador). A <strong>Reis Tecnologia</strong> fornece o sistema e trata os dados só a serviço do colégio (é a operadora).</span></li>
            <li><i class="ti ti-school"></i><span>Os dados servem à vida escolar: matrícula, notas, frequência, mensalidades, documentos e comunicação com as famílias. <strong>Nada é vendido nem usado para propaganda.</strong></span></li>
            <li><i class="ti ti-lock"></i><span>Cada pessoa vê só o que o perfil permite. CPF e RG ficam criptografados, a conexão é segura e os acessos ficam registrados.</span></li>
            <li><i class="ti ti-user-check"></i><span>${resp
              ? 'Você pode pedir ao colégio para saber quais dados ele tem, corrigir, excluir e outros, em <strong>Privacidade e meus dados</strong>, no menu.'
              : 'Use os dados das famílias só para o trabalho no colégio: não copie para fora do sistema, não repasse a terceiros e não compartilhe a sua senha.'}</span></li>
          </ul>
          <p class="termos-links"><a href="termos.html" target="_blank" rel="noopener"><i class="ti ti-file-text"></i> Termos de uso</a>
            <a href="privacidade.html" target="_blank" rel="noopener"><i class="ti ti-shield-lock"></i> Política de privacidade</a></p>
          <label class="termos-check"><input type="checkbox" data-termos-ok>
            <span>Li e concordo com os Termos de uso e a Política de privacidade (versão ${esc(t.versao)}).</span></label>
        </div>`,
        botoes: [
          {
            texto: 'Sair',
            acao: async () => {
              try { await EG.api('POST', '/conta/evento', { tipo: 'logout' }); } catch (e) { /* segue */ }
              await EG.auth.signOut(); // a troca de login fecha as janelas
            }
          },
          {
            texto: 'Aceitar e continuar', classe: 'btn-primario', icone: 'ti-check',
            acao: async (m) => {
              if (!m.el.querySelector('[data-termos-ok]').checked) throw EG.erro('Marque "Li e concordo" para continuar.');
              me.termos = await EG.api('POST', '/me/termos', { versao: t.versao });
              m.fechar();
              ok(true);
            }
          }
        ]
      });
    });
    return aceiteAberto;
  };

  /* =================== Portal: Privacidade e meus dados =================== */
  const DICA_PEDIDO = {
    acesso: ['Ex.: quero saber quais dados do meu filho o colégio guarda e para quê.', 'O colégio confere e responde dentro do prazo, aqui em Meus pedidos.'],
    correcao: ['Ex.: o nome da mãe está escrito errado; o certo é Maria de Souza Lima.', ''],
    exclusao: ['Ex.: quero que apaguem o telefone antigo e a autorização de retirada da tia Ana.',
      'Matrícula, notas, frequência, histórico e registros financeiros a escola é obrigada por lei a guardar. O colégio explica o que pode ser apagado.'],
    portabilidade: ['Ex.: vamos mudar de escola e precisamos dos dados para levar.', 'Documentos oficiais (histórico, transferência) são pedidos à secretaria.'],
    revogacao: ['Ex.: não quero mais receber mensagens pelo WhatsApp.', ''],
    informacao: ['Ex.: com quais empresas ou órgãos os dados são compartilhados?', ''],
    outro: ['Descreva o que você precisa.', '']
  };

  async function paginaPortal(el) {
    const [r, p] = await Promise.all([EG.api('GET', '/portal/privacidade'), EG.api('GET', '/portal')]);
    const enc = r.encarregado;
    const filhos = p.alunos || [];
    const contato = [enc.contatoEmail ? `<a href="mailto:${esc(enc.contatoEmail)}">${esc(enc.contatoEmail)}</a>` : '',
      enc.contatoTelefone ? `<span class="priv-tel">${esc(enc.contatoTelefone)}</span>` : ''].filter(Boolean).join(' · ');
    const pedidos = r.solicitacoes || [];
    el.innerHTML = `
      <div class="card" data-bloco="quem">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-shield-lock"></i> Quem cuida dos seus dados</div></div>
        <p class="card-desc">Os dados de vocês no EduGest pertencem ao colégio e são usados só para a vida escolar, como manda a Lei Geral de Proteção de Dados (LGPD).</p>
        <div class="priv-papeis">
          <div class="priv-papel"><span class="priv-papel-icone"><i class="ti ti-building"></i></span>
            <div><small>Controlador: decide sobre os dados</small><strong>${esc(enc.colegio)}</strong></div></div>
          <div class="priv-papel"><span class="priv-papel-icone"><i class="ti ti-user-shield"></i></span>
            <div><small>Encarregado de dados do colégio</small><strong>${esc(enc.nome || 'Secretaria do colégio')}</strong>
              ${contato ? `<span class="sub">${contato}</span>` : '<span class="sub">Fale com a secretaria</span>'}</div></div>
          <div class="priv-papel"><span class="priv-papel-icone"><i class="ti ti-cloud-lock"></i></span>
            <div><small>Operadora: fornece o sistema</small><strong>Reis Tecnologia</strong><span class="sub">Trata os dados só a serviço do colégio</span></div></div>
        </div>
        <p class="priv-termos"><span>${r.termos.aceito
          ? `<i class="ti ti-circle-check"></i> Você aceitou os termos (versão ${esc(r.termos.versao)}) em ${EG.dataHora(r.termos.aceitoEm)}.`
          : '<i class="ti ti-info-circle"></i> Termos ainda não aceitos nesta versão.'}</span>
          <a href="termos.html" target="_blank" rel="noopener">Termos de uso</a> · <a href="privacidade.html" target="_blank" rel="noopener">Política de privacidade</a></p>
      </div>

      <div class="card" data-bloco="pedir">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-message-plus"></i> Fazer um pedido ao colégio</div></div>
        <p class="card-desc">Pela LGPD, você pode pedir ao colégio, sobre você e sobre ${filhos.length === 1 ? 'o aluno' : 'os alunos'}:</p>
        <ul class="priv-direitos">
          <li><i class="ti ti-list-search"></i><span>Saber quais dados o colégio tem e para quê</span></li>
          <li><i class="ti ti-pencil"></i><span>Corrigir dados errados ou desatualizados</span></li>
          <li><i class="ti ti-trash"></i><span>Excluir o que a escola não é obrigada a guardar</span></li>
          <li><i class="ti ti-file-export"></i><span>Receber uma cópia dos dados</span></li>
          <li><i class="ti ti-share"></i><span>Saber com quem os dados são compartilhados</span></li>
          <li><i class="ti ti-message-off"></i><span>Deixar de receber mensagens</span></li>
        </ul>
        <div class="priv-linha-acao">
          <button class="btn btn-primario" data-action="novo-pedido"><i class="ti ti-plus"></i> Fazer um pedido</button>
          <span class="sub">O colégio responde em até ${r.prazoDias} dias, e a resposta aparece em Meus pedidos.</span>
        </div>
      </div>

      <div class="card" data-bloco="pedidos">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-list-check"></i> Meus pedidos</div></div>
        ${pedidos.length ? `<div class="priv-pedidos">${pedidos.map(cartaoPedido).join('')}</div>`
          : '<div class="vazio" style="padding:24px"><i class="ti ti-message-circle"></i>Nenhum pedido feito</div>'}
      </div>

      <div class="card priv-perigo" data-bloco="encerrar">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-door-exit"></i> Encerrar meu acesso ao portal</div></div>
        <p class="card-desc">Você deixa de acompanhar ${filhos.length === 1 ? 'o aluno' : 'os alunos'} por aqui. Os registros escolares (matrícula, notas, frequência, mensalidades e documentos) continuam com o colégio, que é obrigado por lei a guardá-los. Para voltar, basta usar de novo o código de acesso (PAI).</p>
        <button class="btn btn-perigo" data-action="encerrar-acesso"><i class="ti ti-door-exit"></i> Encerrar meu acesso</button>
      </div>`;

    el.onclick = async (ev) => {
      const b = ev.target.closest('[data-action]');
      if (!b || !el.contains(b)) return;
      const acao = b.dataset.action;
      if (acao === 'novo-pedido') novoPedido(r, filhos, el);
      else if (acao === 'encerrar-acesso') encerrarAcesso(filhos);
    };
  }

  function cartaoPedido(s) {
    const prazo = aberto(s) ? ` · o colégio responde até ${EG.data(s.prazo)}` : '';
    return `<div class="priv-pedido">
      <div class="priv-pedido-cab"><strong>${esc(s.tipoRotulo)}</strong>${selo(s)}</div>
      <div class="sub">Pedido nº ${s.id} · feito em ${EG.data(s.criadaEm)}${s.aluno ? ` · sobre ${esc(s.aluno)}` : ''}${prazo}</div>
      <p class="priv-texto">${esc(s.descricao)}</p>
      ${s.resposta ? `<div class="priv-resposta"><small>Resposta do colégio${s.respondidaEm ? ` em ${EG.data(s.respondidaEm)}` : ''}</small><p class="priv-texto">${esc(s.resposta)}</p></div>` : ''}
    </div>`;
  }

  function novoPedido(r, filhos, el) {
    const tipos = Object.entries(r.tipos);
    const m = EG.modal({
      titulo: 'Fazer um pedido ao colégio',
      largura: 520,
      corpo: `
        <div class="campo"><label for="pedTipo">O que você precisa?</label>
          <select class="select" id="pedTipo" data-campo="tipo">${tipos.map(([k, rot]) => `<option value="${k}">${esc(rot)}</option>`).join('')}</select></div>
        ${filhos.length ? `<div class="campo"><label for="pedAluno">Sobre</label>
          <select class="select" id="pedAluno" data-campo="aluno">${filhos.map((a) => `<option value="${a.id}">${esc(a.nome)}</option>`).join('')}
            <option value="">Os meus dados (responsável)</option></select></div>` : ''}
        <div class="campo"><label for="pedTexto">Descreva o pedido</label>
          <textarea class="textarea" id="pedTexto" data-campo="descricao" rows="5" maxlength="2000"></textarea>
          <small data-dica-pedido></small></div>
        <div class="msg-info">O colégio tem até ${r.prazoDias} dias para responder. A resposta aparece aqui, em <strong>Meus pedidos</strong>.</div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        {
          texto: 'Enviar pedido', classe: 'btn-primario', icone: 'ti-send',
          acao: async () => {
            const q = (c) => m.el.querySelector(`[data-campo="${c}"]`);
            const descricao = q('descricao').value.trim();
            if (descricao.length < 10) throw EG.erro('Descreva o pedido (pelo menos 10 caracteres).');
            await EG.api('POST', '/portal/solicitacoes', { tipo: q('tipo').value, alunoId: q('aluno') && q('aluno').value ? Number(q('aluno').value) : null, descricao });
            m.fechar();
            EG.toast('Pedido enviado ao colégio');
            await paginaPortal(el);
          }
        }
      ]
    });
    const tipo = m.el.querySelector('[data-campo="tipo"]');
    const dica = () => {
      const [ex, obs] = DICA_PEDIDO[tipo.value] || ['', ''];
      m.el.querySelector('[data-campo="descricao"]').placeholder = ex;
      m.el.querySelector('[data-dica-pedido]').textContent = obs;
    };
    tipo.addEventListener('change', dica);
    dica();
  }

  function encerrarAcesso(filhos) {
    const nomes = filhos.map((a) => a.nome.split(' ')[0]).join(', ');
    const m = EG.modal({
      titulo: 'Encerrar meu acesso ao portal',
      largura: 500,
      corpo: `<p>Ao confirmar:</p>
        <ul class="priv-lista">
          <li>você deixa de ver ${nomes ? `<strong>${esc(nomes)}</strong>` : 'os alunos'} no portal e sai deste colégio;</li>
          <li>os registros escolares continuam com o colégio, que é obrigado por lei a guardá-los;</li>
          <li>os seus pedidos de privacidade em aberto continuam valendo;</li>
          <li>a sua conta (e-mail e senha) continua existindo e pode ser usada com outro código de acesso.</li>
        </ul>
        <div class="campo"><label for="encConf">Para confirmar, digite <strong>ENCERRAR</strong></label>
          <input class="input" id="encConf" data-campo="confirmacao" autocomplete="off"></div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        {
          texto: 'Encerrar meu acesso', classe: 'btn-perigo', icone: 'ti-door-exit',
          acao: async () => {
            const conf = m.el.querySelector('[data-campo="confirmacao"]').value.trim().toUpperCase();
            if (conf !== 'ENCERRAR') throw EG.erro('Digite ENCERRAR para confirmar.');
            await EG.api('POST', '/portal/encerrar-acesso', { confirmacao: conf });
            m.fechar();
            EG.toast('Acesso ao portal encerrado');
            history.replaceState(null, '', location.pathname);
            await EG.carregarSessao();
          }
        }
      ]
    });
  }

  EG.registrarModulo('portal-privacidade', { render: paginaPortal });

  /* =================== Administrador: Privacidade (LGPD) =================== */
  const est = { filtro: 'abertas' };
  let dados = null;
  const DICA_RESPOSTA = {
    acesso: 'Baixe a cópia dos dados (botões acima) e entregue à família por um meio seguro: em mãos, impressa, ou por e-mail para o endereço da conta. Na resposta, conte como e quando foi entregue.',
    correcao: 'Corrija o cadastro (em Alunos, por exemplo) e conte na resposta o que mudou.',
    exclusao: 'Matrícula, notas, frequência, histórico e registros financeiros a escola precisa guardar por obrigação legal: explique isso na resposta. Telefones, e-mails, autorizados a buscar e dados da captação podem ser apagados.',
    portabilidade: 'Baixe a cópia dos dados do aluno (arquivo JSON) e entregue à família. Documentos oficiais, como histórico e transferência, saem em Documentos.',
    revogacao: 'Faça o ajuste pedido (por exemplo, parar de enviar WhatsApp) e responda confirmando. O que é obrigação legal ou do contrato continua.',
    informacao: 'Explique com quem os dados são compartilhados: o EduGest (Reis Tecnologia, operadora), o serviço de login (Google Firebase), a hospedagem do sistema e os órgãos a que o colégio é obrigado a informar, como o Censo Escolar.',
    outro: ''
  };

  function kpi(icone, fundo, cor, rotulo, valor, obs, alvo) {
    return `<div class="kpi"${alvo ? ` data-action="rolar" data-alvo="${alvo}" style="cursor:pointer"` : ''}><div class="kpi-icone" style="background:${fundo};color:${cor}"><i class="ti ${icone}"></i></div>
      <div><div class="kpi-rotulo">${rotulo}</div><div class="kpi-valor">${esc(valor)}</div><div class="kpi-obs">${esc(obs)}</div></div></div>`;
  }

  async function paginaAdmin(el) {
    dados = await EG.api('GET', '/lgpd');
    EG.atualizarPrivacidade(dados.contagem.abertas);
    desenharAdmin(el);
  }

  function desenharAdmin(el) {
    const r = dados;
    const enc = r.encarregado;
    const c = r.contagem;
    const ac = r.aceites;
    const lista = r.solicitacoes.filter((s) => est.filtro === 'todos' || aberto(s));
    el.innerHTML = `
      <div class="grade-kpi">
        ${kpi('ti-message-question', c.atrasadas ? 'var(--erro-bg)' : 'var(--aviso-bg)', c.atrasadas ? 'var(--erro)' : 'var(--aviso)', 'Pedidos em aberto', c.abertas,
          c.atrasadas ? `${c.atrasadas} com prazo vencido` : c.proximoPrazo ? `próximo prazo: ${EG.data(c.proximoPrazo)}` : 'nenhum aguardando resposta', 'pedidos')}
        ${kpi('ti-file-check', 'var(--ok-bg)', 'var(--ok)', 'Aceite dos termos', `${ac.aceitaram} de ${ac.total}`, `responsáveis: ${ac.responsaveisAceitaram} de ${ac.responsaveis}`)}
        ${kpi('ti-user-shield', enc.nome ? 'var(--info-bg)' : 'var(--erro-bg)', enc.nome ? 'var(--info)' : 'var(--erro)', 'Encarregado de dados',
          enc.nome ? 'Definido' : 'Falta definir', enc.nome || 'exigido pela LGPD (art. 41)', 'encarregado')}
        ${kpi('ti-filter-off', 'var(--roxo-bg)', 'var(--roxo)', 'Captação antiga', r.captacao.perdidosAntigos, `perdidos há mais de ${r.captacao.meses} meses`, 'captacao')}
      </div>

      <div class="card" data-bloco="encarregado">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-user-shield"></i> Encarregado pelo tratamento de dados</div></div>
        <p class="card-desc">Quem recebe os pedidos das famílias e fala com a ANPD em nome do colégio (art. 41 da LGPD). Pode ser alguém da direção ou da secretaria. O nome e o contato aparecem para as famílias no portal; se o colégio tiver site, publique lá também.</p>
        <div class="linha-3">
          <div class="campo"><label for="encNome">Nome</label><input class="input" id="encNome" name="nome" maxlength="100" value="${esc(enc.nome)}" placeholder="Ex.: Maria da Silva (direção)"></div>
          <div class="campo"><label for="encEmail">E-mail</label><input class="input" id="encEmail" name="email" type="email" maxlength="160" value="${esc(enc.email)}" placeholder="privacidade@colegio.com.br"></div>
          <div class="campo"><label for="encTel">Telefone <span class="sub">(opcional)</span></label><input class="input" id="encTel" name="telefone" maxlength="15" value="${esc(enc.telefone)}" placeholder="(11) 99999-9999" data-mascara="telefone"></div>
        </div>
        <button class="btn btn-primario" data-action="salvar-encarregado"><i class="ti ti-device-floppy"></i> Salvar encarregado</button>
      </div>

      <div class="card" data-bloco="pedidos">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-message-question"></i> Pedidos dos titulares</div></div>
        <p class="card-desc">O que as famílias pedem pelo portal (art. 18 da LGPD). O prazo para responder é de ${r.prazoDias} dias; a resposta aparece para a família no portal.</p>
        <div class="filtros">
          <button class="chip ${est.filtro === 'abertas' ? 'ativo' : ''}" data-action="filtro-pedidos" data-f="abertas">Em aberto (${c.abertas})</button>
          <button class="chip ${est.filtro === 'todos' ? 'ativo' : ''}" data-action="filtro-pedidos" data-f="todos">Todos (${r.solicitacoes.length})</button>
        </div>
        ${lista.length ? `<div class="tabela-wrap"><table>
          <thead><tr><th>Pedido</th><th>Quem pediu</th><th>Feito em</th><th>Prazo</th><th>Situação</th><th></th></tr></thead>
          <tbody>${lista.map((s) => `<tr data-id="${s.id}">
            <td><strong>${esc(s.tipoRotulo)}</strong><br><small class="sub">${s.aluno ? `Aluno: ${esc(s.aluno)} · ` : ''}${esc(s.descricao.length > 90 ? s.descricao.slice(0, 90) + '…' : s.descricao)}</small></td>
            <td>${esc(s.solicitante)}<br><small class="sub">${esc(s.solicitanteEmail || '')}</small></td>
            <td style="white-space:nowrap">${EG.data(s.criadaEm)}</td>
            <td style="white-space:nowrap${s.atrasada ? ';color:var(--erro);font-weight:600' : ''}">${aberto(s) ? EG.data(s.prazo) + (s.atrasada ? '<br><small>vencido</small>' : '') : '—'}</td>
            <td>${selo(s)}</td>
            <td><button class="btn ${aberto(s) ? 'btn-primario' : 'btn-secundario'} btn-pequeno" data-action="responder" data-id="${s.id}">${aberto(s) ? 'Responder' : 'Ver'}</button></td>
          </tr>`).join('')}</tbody></table></div>`
          : `<div class="vazio" style="padding:24px"><i class="ti ti-mood-check"></i>${est.filtro === 'abertas' ? 'Nenhum pedido aguardando resposta' : 'Nenhum pedido recebido'}</div>`}
      </div>

      <div class="card" data-bloco="exportar">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-file-download"></i> Cópia dos dados de um aluno</div></div>
        <p class="card-desc">Para atender um pedido de acesso ou de portabilidade: um arquivo com o cadastro (CPF e RG abertos), responsáveis, autorizados a buscar, notas, frequência, mensalidades, documentos emitidos e anos anteriores. Cada cópia fica registrada no log de segurança.</p>
        <div class="campo" style="max-width:420px"><label for="privBusca">Aluno</label>
          <input class="input" id="privBusca" data-busca="lgpd-aluno" placeholder="Digite o nome ou o RA" autocomplete="off"></div>
        <div data-area="busca-aluno"></div>
      </div>

      <div class="card" data-bloco="captacao">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-filter-off"></i> Captação: interessados que não se matricularam</div></div>
        <p class="card-desc">Guardar por muito tempo o contato de quem não virou aluno não tem finalidade. Apague de tempos em tempos quem está como <strong>perdido</strong> no Funil de Matrículas há mais de ${r.captacao.meses} meses.</p>
        <div class="priv-linha">
          <span><strong>${plural(r.captacao.perdidosAntigos, 'interessado perdido', 'interessados perdidos')}</strong> há mais de ${r.captacao.meses} meses</span>
          <button class="btn btn-perigo" data-action="limpar-captacao" ${r.captacao.perdidosAntigos ? '' : 'disabled'}><i class="ti ti-trash"></i> Apagar</button>
        </div>
      </div>

      <div class="card" data-bloco="protecao">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-shield-check"></i> O que o EduGest já faz pela proteção dos dados</div>
          <button class="btn btn-secundario btn-pequeno" data-aj-artigo="lgpd-visao"><i class="ti ti-help"></i> A LGPD no colégio</button></div>
        <ul class="priv-checklist">
          <li><i class="ti ti-check"></i><span>CPF e RG de alunos, responsáveis e autorizados a buscar ficam guardados com criptografia.</span></li>
          <li><i class="ti ti-check"></i><span>Cada pessoa da equipe vê só os módulos liberados; o responsável vê só os próprios filhos.</span></li>
          <li><i class="ti ti-check"></i><span>Entradas, senhas erradas, ações de administrador e de privacidade ficam no <button class="link-sutil priv-link" data-action="ir" data-pagina="seguranca">Log de segurança</button>, que não pode ser apagado.</span></li>
          <li><i class="ti ti-check"></i><span>O aceite dos termos fica registrado com data, IP e dispositivo de cada pessoa.</span></li>
          <li><i class="ti ti-check"></i><span>O formulário de interesse da captação pede o consentimento da família.</span></li>
          <li><i class="ti ti-check"></i><span>Conexão segura (HTTPS) e sessão encerrada por inatividade.</span></li>
        </ul>
      </div>`;

    el.querySelector('[data-mascara="telefone"]').addEventListener('input', (ev) => EG.mascaraTelefone(ev.target));
    let tBusca = null;
    el.querySelector('[data-busca="lgpd-aluno"]').addEventListener('input', (ev) => {
      clearTimeout(tBusca);
      tBusca = setTimeout(() => buscarAluno(el, ev.target.value.trim()), 300);
    });

    el.onclick = async (ev) => {
      const b = ev.target.closest('[data-action]');
      if (!b || !el.contains(b)) return;
      const acao = b.dataset.action;
      if (acao === 'filtro-pedidos') { est.filtro = b.dataset.f; desenharAdmin(el); }
      else if (acao === 'rolar') { const alvo = el.querySelector(`[data-bloco="${b.dataset.alvo}"]`); if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else if (acao === 'salvar-encarregado') {
        await EG.guarda(b, async () => {
          try {
            const box = el.querySelector('[data-bloco="encarregado"]');
            dados.encarregado = await EG.api('PUT', '/lgpd/encarregado', EG.lerForm(box));
            EG.toast('Encarregado salvo. As famílias já veem o contato no portal.');
            desenharAdmin(el);
          } catch (e) { EG.toast(e.message, 'erro'); }
        });
      } else if (acao === 'responder') responder(el, Number(b.dataset.id));
      else if (acao === 'baixar-aluno') {
        await EG.guarda(b, () => baixarAluno(Number(b.dataset.id), b.dataset.nome).catch((e) => EG.toast(e.message, 'erro')));
      } else if (acao === 'limpar-captacao') limparCaptacao(el);
    };
  }

  async function baixarAluno(id, nome) {
    const d = await EG.api('GET', `/lgpd/alunos/${id}/exportar`);
    EG.baixarJson(`dados-${slug(nome || d.aluno.nome) || 'aluno'}-${EG.hojeSP()}.json`, d);
    EG.toast('Arquivo baixado. Ele tem dados pessoais: entregue só ao titular e apague do computador depois.');
  }

  async function buscarAluno(el, termo) {
    const area = el.querySelector('[data-area="busca-aluno"]');
    if (!area) return;
    if (termo.length < 2) { area.innerHTML = ''; return; }
    try {
      const lista = await EG.api('GET', `/alunos?busca=${encodeURIComponent(termo)}`);
      if (!area.isConnected) return;
      area.innerHTML = lista.length ? `<ul class="priv-resultados">${lista.slice(0, 8).map((a) => `<li>
          <span><strong>${esc(a.nome)}</strong><br><small class="sub">RA ${esc(a.ra)}${a.turma ? ' · ' + esc(a.turma) : ''} · ${esc(a.status)}</small></span>
          <button class="btn btn-secundario btn-pequeno" data-action="baixar-aluno" data-id="${a.id}" data-nome="${esc(a.nome)}"><i class="ti ti-file-download"></i> Baixar dados</button></li>`).join('')}</ul>
          ${lista.length > 8 ? `<small class="sub">Mostrando 8 de ${lista.length}. Digite mais do nome para filtrar.</small>` : ''}`
        : '<div class="sub" style="padding:8px 0">Nenhum aluno encontrado</div>';
    } catch (e) { area.innerHTML = `<div class="msg-erro">${esc(e.message)}</div>`; }
  }

  function responder(el, id) {
    const s = dados.solicitacoes.find((x) => x.id === id);
    if (!s) return;
    const dica = DICA_RESPOSTA[s.tipo];
    const m = EG.modal({
      titulo: `Pedido nº ${s.id}: ${s.tipoRotulo}`,
      largura: 600,
      corpo: `<dl class="priv-detalhe">
          <dt>Quem pediu</dt><dd>${esc(s.solicitante)}${s.solicitanteEmail ? ` · <a href="mailto:${esc(s.solicitanteEmail)}">${esc(s.solicitanteEmail)}</a>` : ''}</dd>
          ${s.aluno ? `<dt>Aluno</dt><dd>${esc(s.aluno)}</dd>` : ''}
          <dt>Feito em</dt><dd>${EG.dataHora(s.criadaEm)}</dd>
          <dt>Prazo</dt><dd${s.atrasada ? ' style="color:var(--erro);font-weight:600"' : ''}>${EG.data(s.prazo)}${s.atrasada ? ' (vencido)' : ''}</dd>
          ${s.respondidaEm ? `<dt>Última resposta</dt><dd>${EG.dataHora(s.respondidaEm)}${s.respondidaPor ? ' · ' + esc(s.respondidaPor) : ''}</dd>` : ''}
        </dl>
        <div class="priv-citacao priv-texto">${esc(s.descricao)}</div>
        ${dica ? `<div class="msg-info">${dica}</div>` : ''}
        ${s.solicitanteId || s.alunoId ? `<p class="priv-baixar">
          ${s.solicitanteId ? `<button class="btn btn-secundario btn-pequeno" data-modal="baixar-solicitante"><i class="ti ti-file-download"></i> Dados de quem pediu (e filhos)</button>` : ''}
          ${s.alunoId ? `<button class="btn btn-secundario btn-pequeno" data-modal="baixar"><i class="ti ti-file-download"></i> Dados de ${esc(s.aluno)}</button>` : ''}</p>` : ''}
        <div class="campo"><label for="respSit">Situação</label>
          <select class="select" id="respSit" data-campo="status">${Object.entries(SITUACAO).map(([k, [rot]]) => `<option value="${k}" ${k === s.status ? 'selected' : ''}>${rot}</option>`).join('')}</select></div>
        <div class="campo"><label for="respTexto">Resposta para a família</label>
          <textarea class="textarea" id="respTexto" data-campo="resposta" rows="5" maxlength="4000" placeholder="Ex.: Corrigimos o nome da mãe no cadastro do aluno em ${EG.data(EG.hojeSP())}.">${esc(s.resposta || '')}</textarea>
          <small>A família vê este texto no portal. Obrigatória para concluir ou recusar.</small></div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        {
          texto: 'Salvar resposta', classe: 'btn-primario', icone: 'ti-send',
          acao: async () => {
            const q = (c) => m.el.querySelector(`[data-campo="${c}"]`).value;
            const n = await EG.api('PUT', `/lgpd/solicitacoes/${s.id}`, { status: q('status'), resposta: q('resposta') });
            m.fechar();
            EG.toast(n.status === 'concluida' ? 'Pedido concluído. A família vê a resposta no portal.' : 'Pedido atualizado');
            await paginaAdmin(el);
          }
        }
      ]
    });
    const bx = m.el.querySelector('[data-modal="baixar"]');
    if (bx) bx.addEventListener('click', () => EG.guarda(bx, () => baixarAluno(s.alunoId, s.aluno).catch((e) => m.erro(e.message))));
    const bs = m.el.querySelector('[data-modal="baixar-solicitante"]');
    if (bs) bs.addEventListener('click', () => EG.guarda(bs, async () => {
      try {
        const d = await EG.api('GET', `/lgpd/solicitacoes/${s.id}/exportar`);
        EG.baixarJson(`dados-${slug(s.solicitante) || 'responsavel'}-pedido-${s.id}-${EG.hojeSP()}.json`, d);
        EG.toast('Arquivo baixado. Ele tem dados pessoais: entregue só ao titular e apague do computador depois.');
      } catch (e) { m.erro(e.message); }
    }));
  }

  function limparCaptacao(el) {
    const n = dados.captacao.perdidosAntigos;
    const m = EG.modal({
      titulo: 'Apagar interessados antigos',
      largura: 480,
      corpo: `<p>Vão ser apagados de vez <strong>${plural(n, 'interessado', 'interessados')}</strong> marcados como <strong>perdido</strong> no Funil de Matrículas há mais de ${dados.captacao.meses} meses, com nome, telefone, e-mail e anotações.</p>
        <p class="sub">Quem está em andamento no funil ou foi perdido há menos tempo não muda. Não dá para desfazer.</p>
        <div class="campo"><label for="capConf">Para confirmar, digite <strong>APAGAR</strong></label>
          <input class="input" id="capConf" data-campo="confirmacao" autocomplete="off"></div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        {
          texto: 'Apagar', classe: 'btn-perigo', icone: 'ti-trash',
          acao: async () => {
            const conf = m.el.querySelector('[data-campo="confirmacao"]').value.trim().toUpperCase();
            if (conf !== 'APAGAR') throw EG.erro('Digite APAGAR para confirmar.');
            const r = await EG.api('POST', '/lgpd/captacao/limpar', { confirmacao: conf });
            m.fechar();
            EG.toast(r.apagados ? `${plural(r.apagados, 'interessado apagado', 'interessados apagados')}` : 'Nada para apagar');
            await paginaAdmin(el);
          }
        }
      ]
    });
  }

  EG.registrarModulo('lgpd', { render: paginaAdmin });

  /** Pedidos LGPD em aberto: número no menu (só administrador). */
  EG.atualizarPrivacidade = function (abertas) {
    const col = EG.estado.colegio;
    if (!col || EG.estado.perfil !== 'admin') return;
    col.privacidade = { ...(col.privacidade || {}), abertas };
    EG.contadorMenu('lgpd', abertas, abertas ? `${abertas} pedido(s) de privacidade aguardando resposta` : '');
    if (EG.atualizarPendentes) EG.atualizarPendentes(col.pendentes ? col.pendentes.total : 0);
  };
})(window.EG);
