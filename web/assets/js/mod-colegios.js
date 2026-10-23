/* =====================================================================
 *  EduGest — Gestão de Colégios   [somente o proprietário do sistema]
 *  Todos os colégios do sistema · cadastrar · convite para o diretor ·
 *  desativar / reativar · entrar no colégio.
 *
 *  Os parâmetros de cada colégio continuam com o administrador do próprio
 *  colégio (Sistema › Configurações).
 * ===================================================================== */
'use strict';
(function (EG) {
  let dados = null;
  let busca = '';

  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  function kpi(icone, cor, fundo, rotulo, valor, obs) {
    return `<div class="kpi"><div class="kpi-icone" style="background:${fundo};color:${cor}"><i class="ti ${icone}"></i></div>
      <div><div class="kpi-rotulo">${rotulo}</div><div class="kpi-valor">${EG.esc(valor)}</div><div class="kpi-obs">${EG.esc(obs)}</div></div></div>`;
  }

  /* ---------- E-mail do proprietário ainda não confirmado ---------- */
  function telaVerificar(el) {
    const email = EG.auth.currentUser ? EG.auth.currentUser.email : '';
    el.innerHTML = `<div class="card" style="max-width:560px;margin:0 auto">
      <div class="auth-status">
        <div class="icone-grande" style="background:var(--aviso-bg);color:var(--aviso)"><i class="ti ti-mail-check"></i></div>
        <h3>Confirme o seu e-mail</h3>
        <p>A Gestão de Colégios só é liberada com o e-mail do proprietário confirmado.<br>
          Abra o link de confirmação enviado para <strong>${EG.esc(email)}</strong> e depois clique em <strong>Já confirmei</strong>.</p>
        <button class="btn btn-primario btn-bloco" data-action="ja-confirmei" style="margin-bottom:10px"><i class="ti ti-check"></i> Já confirmei</button>
        <button class="btn btn-secundario btn-bloco" data-action="reenviar"><i class="ti ti-send"></i> Reenviar o link</button>
      </div></div>`;
    el.onclick = (ev) => {
      const b = ev.target.closest('[data-action]');
      if (!b || !el.contains(b)) return;
      EG.guarda(b, async () => {
        const u = EG.auth.currentUser;
        try {
          if (b.dataset.action === 'reenviar') {
            await u.sendEmailVerification();
            EG.toast(`Link enviado para ${u.email}. Confira também a caixa de spam.`, 'info');
          } else {
            await u.reload();
            if (!u.emailVerified) { EG.toast('O e-mail ainda não foi confirmado. Abra o link enviado e tente de novo.', 'erro'); return; }
            await u.getIdToken(true); // token novo, já com o e-mail confirmado
            await EG.carregarSessao(EG.estado.colegioId);
            EG.toast('E-mail confirmado. Gestão de Colégios liberada!');
          }
        } catch (e) {
          EG.toast(e && e.code === 'auth/too-many-requests' ? 'Muitas tentativas. Aguarde alguns minutos.' : 'Não foi possível concluir. Tente novamente.', 'erro');
        }
      });
    };
  }

  /* ---------- Lista ---------- */
  function linha(c) {
    const atual = c.id === EG.estado.colegioId;
    const meu = c.meuVinculo;
    const podeEntrar = c.ativo && meu && meu.status === 'ativo' && !atual;
    const admins = c.administradores.length
      ? c.administradores.map((a) => `<div>${EG.esc(a.nome)}${a.voce ? ' <small>(você)</small>' : ''}${a.status !== 'ativo' ? ` <span class="selo selo-neutro">${EG.esc((EG.STATUS[a.status] || a.status).toLowerCase())}</span>` : ''}<br><small>${EG.esc(a.email)}</small></div>`).join('')
      : '<small>Nenhum administrador</small>';
    return `<tr data-id="${c.id}" ${c.ativo ? '' : 'style="opacity:.6"'}>
      <td><strong>${EG.esc(c.nome)}</strong>${atual ? ' <span class="selo selo-info">em uso</span>' : ''}<br>
        <small>${c.cnpj ? EG.esc(c.cnpj) + ' · ' : ''}desde ${EG.data(c.criadoEm)}</small></td>
      <td>${admins}${c.pendentes ? `<div style="margin-top:4px"><span class="selo selo-aviso">${c.pendentes} aguardando aprovação</span></div>` : ''}</td>
      <td class="num">${c.equipe}<br><small>${c.responsaveis} resp.</small></td>
      <td class="num">${c.alunos}</td>
      <td style="white-space:nowrap"><code>${EG.esc(c.codigoConvite)}</code></td>
      <td><span class="selo ${c.ativo ? 'selo-ok' : 'selo-erro'}">${c.ativo ? 'Ativo' : 'Desativado'}</span></td>
      <td class="acoes">
        ${podeEntrar ? '<button class="btn-icone" data-action="entrar" title="Entrar neste colégio"><i class="ti ti-login-2"></i></button>' : ''}
        ${c.ativo ? '<button class="btn-icone" data-action="convite" title="Convite para o diretor (código do colégio)"><i class="ti ti-send"></i></button>' : ''}
        ${c.ativo
          ? '<button class="btn-icone perigo" data-action="desativar" title="Desativar colégio"><i class="ti ti-power"></i></button>'
          : '<button class="btn-icone" data-action="reativar" title="Reativar colégio"><i class="ti ti-power"></i></button>'}
      </td></tr>`;
  }

  function corpoTabela() {
    const q = semAcento(busca);
    const lista = dados.colegios.filter((c) => !q || semAcento([c.nome, c.cnpj, c.codigoConvite,
      ...c.administradores.map((a) => a.nome + ' ' + a.email)].join(' ')).includes(q));
    return lista.map(linha).join('') ||
      `<tr><td colspan="7"><div class="vazio"><i class="ti ti-building-community"></i>${q ? 'Nenhum colégio encontrado' : 'Nenhum colégio cadastrado'}</div></td></tr>`;
  }

  async function carregar(el) {
    dados = await EG.api('GET', '/proprietario/colegios');
    const t = dados.totais;
    el.innerHTML = `
      <div class="grade-kpi">
        ${kpi('ti-building-community', 'var(--info)', 'var(--info-bg)', 'Colégios ativos', t.ativos, `${t.colegios} cadastrado(s) no sistema`)}
        ${kpi('ti-users', 'var(--ok)', 'var(--ok-bg)', 'Alunos ativos', t.alunos, 'somando os colégios ativos')}
      </div>
      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-building-community"></i> Colégios do sistema</div>
          <button class="btn btn-primario" data-action="novo"><i class="ti ti-building-plus"></i> Novo colégio</button></div>
        <p class="card-desc">Exclusivo do proprietário do sistema: só você cadastra colégios. Os parâmetros de cada colégio (dados, ano letivo,
          mensalidade, PIX...) ficam com o administrador do próprio colégio, em <strong>Sistema › Configurações</strong>.</p>
        <div class="filtros"><input class="input" data-busca placeholder="Buscar por nome, CNPJ, código ou administrador" value="${EG.esc(busca)}" style="max-width:380px"></div>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Colégio</th><th>Administradores</th><th class="num">Equipe</th><th class="num">Alunos</th><th>Código</th><th>Situação</th><th></th></tr></thead>
          <tbody data-corpo>${corpoTabela()}</tbody>
        </table></div>
      </div>`;
  }

  /* ---------- Convite para o diretor ---------- */
  function mensagemConvite(c) {
    return `Olá! O *${c.nome}* já está no EduGest.\n\n` +
      `1. Acesse ${location.origin}\n` +
      '2. Clique em *Criar conta*\n' +
      `3. Informe o código do colégio: *${c.codigoConvite}*\n\n` +
      'Assim que você concluir o cadastro, eu libero o seu acesso como administrador.\n\nReis Tecnologia';
  }

  function modalConvite(c, recemCriado) {
    const msg = mensagemConvite(c);
    const m = EG.modal({
      titulo: recemCriado ? 'Colégio cadastrado!' : `Convite — ${c.nome}`,
      largura: 560,
      corpo: `
        ${recemCriado ? `<div class="msg-info" style="margin-bottom:14px"><i class="ti ti-circle-check"></i> <strong>${EG.esc(c.nome)}</strong> foi criado e você é o administrador dele.</div>` : ''}
        <p class="card-desc" style="margin:0 0 10px">Para entregar o colégio ao diretor:</p>
        <ol style="margin:0 0 14px 18px;line-height:1.7;font-size:13px">
          <li>Envie a mensagem abaixo (com o código <code>${EG.esc(c.codigoConvite)}</code>).</li>
          <li>O diretor cria a conta em <strong>Criar conta</strong> usando o código.</li>
          <li>Entre no colégio e aprove o cadastro em <strong>Sistema › Usuários</strong>, com o perfil <strong>Administrador</strong>.</li>
        </ol>
        <div class="campo"><label>Mensagem</label><textarea class="textarea" rows="9" readonly>${EG.esc(msg)}</textarea></div>`,
      botoes: [
        { texto: 'Copiar', icone: 'ti-copy', acao: () => EG.copiar(msg, 'Mensagem copiada') },
        { texto: 'WhatsApp', classe: 'btn-whats', icone: 'ti-brand-whatsapp', acao: () => EG.abrirWhatsApp('', msg) },
        ...(recemCriado ? [{ texto: 'Entrar no colégio', classe: 'btn-primario', icone: 'ti-login-2', acao: async () => { m.fechar(); await EG.trocarColegio(c.id, 'config'); } }] : [])
      ]
    });
  }

  /* ---------- Cadastrar ---------- */
  function modalNovo(el) {
    const m = EG.modal({
      titulo: 'Cadastrar novo colégio',
      corpo: `<p class="card-desc" style="margin:0 0 14px">Cada colégio tem dados totalmente separados. Você fica como administrador
          do colégio novo para liberar o acesso do diretor.</p>
        <div class="campo"><label>Nome do colégio *</label><input class="input" name="nome" maxlength="120"></div>
        <div class="linha-2">
          <div class="campo"><label>CNPJ</label><input class="input" name="cnpj" data-mascara="cnpj" maxlength="18" autocomplete="off"></div>
          <div class="campo"><label>Telefone</label><input class="input" name="telefone" data-mascara="telefone" maxlength="15"></div>
        </div>
        <div class="campo"><label>Endereço</label><input class="input" name="endereco" maxlength="200"></div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Cadastrar colégio', classe: 'btn-primario', icone: 'ti-building-plus', acao: async () => {
          const d = EG.lerForm(m.el);
          if (!d.nome || d.nome.trim().length < 3) throw EG.erro('Informe o nome do colégio.');
          const r = await EG.api('POST', '/proprietario/colegios', d);
          m.fechar();
          busca = '';
          // Recarrega a sessão para o colégio novo aparecer no seletor (a lista se redesenha sozinha)
          await EG.carregarSessao(EG.estado.colegioId);
          modalConvite(r, true);
        } }
      ]
    });
  }

  /* ---------- Desativar / reativar ---------- */
  async function mudarSituacao(c, ativo) {
    const ok = await EG.confirmar(ativo
      ? `Reativar o colégio "${c.nome}"?\n\nA equipe e os responsáveis voltam a entrar normalmente.`
      : `Desativar o colégio "${c.nome}"?\n\nNinguém do colégio (equipe e responsáveis) conseguirá entrar, e os links de documentos enviados param de abrir, até você reativar.\n\nNenhum dado é apagado.`,
    { titulo: ativo ? 'Reativar colégio' : 'Desativar colégio', textoOk: ativo ? 'Reativar' : 'Desativar', perigo: !ativo });
    if (!ok) return;
    await EG.api('PUT', `/proprietario/colegios/${c.id}/situacao`, { ativo });
    // Desativou o colégio em uso: a sessão escolhe outro (ou mostra "sem colégio")
    await EG.carregarSessao(!ativo && c.id === EG.estado.colegioId ? undefined : EG.estado.colegioId);
    EG.toast(ativo ? `Colégio "${c.nome}" reativado` : `Colégio "${c.nome}" desativado`);
  }

  EG.registrarModulo('colegios', {
    async render(el) {
      const me = EG.estado.me || {};
      if (!me.proprietario) { telaVerificar(el); return; }
      await carregar(el);
      el.oninput = (ev) => {
        if (!ev.target.matches('[data-busca]')) return;
        busca = ev.target.value;
        el.querySelector('[data-corpo]').innerHTML = corpoTabela();
      };
      el.onclick = (ev) => {
        const b = ev.target.closest('[data-action]');
        if (!b || !el.contains(b)) return;
        const acao = b.dataset.action;
        if (acao === 'novo') { modalNovo(el); return; }
        const tr = b.closest('tr[data-id]');
        const c = tr && dados.colegios.find((x) => x.id === Number(tr.dataset.id));
        if (!c) return;
        EG.guarda(b, async () => {
          try {
            if (acao === 'entrar') await EG.trocarColegio(c.id);
            else if (acao === 'convite') modalConvite(c, false);
            else if (acao === 'desativar') await mudarSituacao(c, false);
            else if (acao === 'reativar') await mudarSituacao(c, true);
          } catch (e) { EG.toast(e.message, 'erro'); }
        });
      };
    }
  });
})(window.EG);
