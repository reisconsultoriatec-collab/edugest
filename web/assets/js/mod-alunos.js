/* =====================================================================
 *  EduGest — Alunos
 *  Lista com busca e filtros · ficha com dados do responsável
 *  Código de acesso (PAI) para o portal: copiar, enviar por WhatsApp, gerar novo
 * ===================================================================== */
'use strict';
(function (EG) {
  const STATUS = { ativo: 'Ativo', inativo: 'Inativo', transferido: 'Transferido' };
  const SELO = { ativo: 'selo-ok', inativo: 'selo-neutro', transferido: 'selo-roxo' };
  const PARENTESCOS = ['Mãe', 'Pai', 'Avó/Avô', 'Tio(a)', 'Irmão(ã)', 'Responsável legal', 'Outro'];
  const PARENTESCOS_RETIRADA = ['Pai', 'Mãe', 'Avó/Avô', 'Tio(a)', 'Irmão(ã)', 'Padrasto/Madrasta', 'Transporte escolar', 'Vizinho(a)', 'Outro'];
  const MAX_AUTORIZADOS = 6;

  /* ---------- Autorizados a retirar o aluno ---------- */
  function linhaAutorizado(p) {
    p = p || {};
    const opcoes = !p.parentesco || PARENTESCOS_RETIRADA.includes(p.parentesco) ? PARENTESCOS_RETIRADA : [p.parentesco, ...PARENTESCOS_RETIRADA];
    return `<div class="autorizado" data-autorizado>
      <input class="input" data-campo="nome" maxlength="100" placeholder="Nome completo *" value="${EG.esc(p.nome)}">
      <select class="select" data-campo="parentesco">${EG.opcoes(opcoes.map((x) => ({ value: x, label: x })), p.parentesco || 'Tio(a)')}</select>
      <input class="input" data-campo="documento" maxlength="20" placeholder="RG ou CPF" autocomplete="off" value="${EG.esc(p.documento)}">
      <input class="input" data-campo="telefone" data-mascara="telefone" maxlength="15" placeholder="Telefone" value="${EG.esc(p.telefone)}">
      <button type="button" class="btn-icone perigo" data-ficha="remover-autorizado" title="Remover"><i class="ti ti-x"></i></button>
    </div>`;
  }

  /** Lê as linhas preenchidas (linhas totalmente vazias são ignoradas). */
  function lerAutorizados(m) {
    const lista = EG.$$('[data-autorizado]', m.el).map((linha) => {
      const val = (c) => linha.querySelector(`[data-campo="${c}"]`).value.trim();
      return { nome: val('nome'), parentesco: val('parentesco'), documento: val('documento'), telefone: val('telefone') };
    }).filter((p) => p.nome || p.documento || p.telefone);
    if (lista.some((p) => p.nome.length < 3)) throw EG.erro('Informe o nome completo de cada pessoa autorizada a retirar o aluno.');
    return lista;
  }

  let alunos = [];
  let turmas = [];
  const filtro = { busca: '', status: 'ativo', turmaId: '' };

  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  async function carregarDados() {
    [alunos, turmas] = await Promise.all([EG.api('GET', '/alunos'), EG.api('GET', '/turmas')]);
  }

  function filtrados() {
    const termo = semAcento(filtro.busca);
    return alunos.filter((a) =>
      (!filtro.status || a.status === filtro.status)
      && (!filtro.turmaId || (filtro.turmaId === 'sem' ? !a.turmaId : a.turmaId === Number(filtro.turmaId)))
      && (!termo || [a.nome, a.ra, a.codigoAcesso, a.respNome].some((c) => semAcento(c).includes(termo))));
  }

  function opcoesTurmas(atual, comTodas) {
    const ano = EG.estado.colegio.config.anoLetivo;
    const ativas = turmas.filter((t) => t.ativo || t.id === Number(atual));
    const grupos = {};
    ativas.forEach((t) => { (grupos[t.anoLetivo] = grupos[t.anoLetivo] || []).push(t); });
    const anos = Object.keys(grupos).sort((a, b) => b - a);
    return (comTodas ? '<option value="">Todas as turmas</option><option value="sem">Sem turma</option>' : '<option value="">Sem turma</option>')
      + anos.map((a) => `<optgroup label="${a}${Number(a) === ano ? ' (atual)' : ''}">${grupos[a].map((t) =>
        `<option value="${t.id}" ${String(t.id) === String(atual) ? 'selected' : ''}>${EG.esc(t.nome)} — ${t.alunos}/${t.capacidade}</option>`).join('')}</optgroup>`).join('');
  }

  function render(el) {
    const lista = filtrados();
    const podeEditar = EG.pode('alunos');
    el.innerHTML = `
      <div class="card">
        <div class="card-cab">
          <div class="card-titulo"><i class="ti ti-users"></i> Alunos</div>
          ${podeEditar ? '<button class="btn btn-primario" data-action="novo"><i class="ti ti-user-plus"></i> Novo aluno</button>' : ''}
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
          <input class="input" data-filtro="busca" placeholder="Buscar por nome, RA, código ou responsável..." value="${EG.esc(filtro.busca)}" style="flex:1;min-width:220px">
          <select class="select" data-filtro="turma" style="width:auto;min-width:200px">${opcoesTurmas(filtro.turmaId, true)}</select>
        </div>
        <div class="filtros">
          <button class="chip ${!filtro.status ? 'ativo' : ''}" data-action="status" data-status="">Todos</button>
          ${Object.entries(STATUS).map(([k, r]) => `<button class="chip ${filtro.status === k ? 'ativo' : ''}" data-action="status" data-status="${k}">${r}s</button>`).join('')}
          <span class="sub" style="margin-left:auto;align-self:center">${lista.length} de ${alunos.length} aluno(s)</span>
        </div>
        <div class="tabela-wrap"><table>
          <thead><tr><th>RA</th><th>Aluno</th><th>Turma</th><th>Responsável</th><th>Código de acesso</th><th>Status</th><th></th></tr></thead>
          <tbody>${lista.map((a) => `<tr data-id="${a.id}">
            <td><code style="font-size:12px">${EG.esc(a.ra)}</code></td>
            <td><strong>${EG.esc(a.nome)}</strong>${a.nascimento ? `<br><small>${EG.data(a.nascimento)}</small>` : ''}</td>
            <td>${a.turma ? EG.esc(a.turma) : '<span class="sub">sem turma</span>'}</td>
            <td>${EG.esc(a.respNome || '—')}${a.respTelefone ? `<br><small>${EG.esc(a.respTelefone)}</small>` : ''}
              ${a.autorizadosRetirada ? `<br><small title="Pessoas autorizadas a retirar o aluno"><i class="ti ti-shield-check"></i> +${a.autorizadosRetirada} autorizado(s) a retirar</small>` : ''}</td>
            <td><code style="color:var(--amber-d);font-weight:700;letter-spacing:1px">${EG.esc(a.codigoAcesso)}</code>
              <button class="btn-icone" data-action="copiar-codigo" title="Copiar código" style="width:26px;height:26px;margin-left:4px"><i class="ti ti-copy"></i></button>
              ${a.responsaveisPortal ? `<br><small><i class="ti ti-user-check"></i> ${a.responsaveisPortal} no portal</small>` : ''}</td>
            <td><span class="selo ${SELO[a.status]}">${STATUS[a.status]}</span></td>
            <td class="acoes">${podeEditar ? `<button class="btn-icone" data-action="editar" title="Abrir ficha"><i class="ti ti-edit"></i></button>
              <button class="btn-icone perigo" data-action="excluir" title="Excluir"><i class="ti ti-trash"></i></button>` : ''}</td>
          </tr>`).join('') || `<tr><td colspan="7"><div class="vazio"><i class="ti ti-users"></i>${alunos.length ? 'Nenhum aluno encontrado com esses filtros' : 'Nenhum aluno cadastrado'}</div></td></tr>`}</tbody>
        </table></div>
      </div>`;
  }

  /* ---------- Ficha ---------- */
  /** Ficha do aluno. Aberta de outra tela (ex.: Documentos): el = null e aoSalvar é chamado depois de salvar. */
  async function modalAluno(id, el, aoSalvar) {
    const a = id ? await EG.api('GET', `/alunos/${id}`) : { status: 'ativo', nacionalidade: 'Brasileira', turmaId: filtro.turmaId && filtro.turmaId !== 'sem' ? Number(filtro.turmaId) : '' };
    const depois = async () => { if (el) { await carregarDados(); render(el); } else if (aoSalvar) await aoSalvar(); };
    const novo = !id;
    const m = EG.modal({
      titulo: novo ? 'Novo aluno' : a.nome,
      largura: 680,
      corpo: `
        <div class="rotulo" style="margin-bottom:10px"><i class="ti ti-user"></i> Dados do aluno</div>
        <div class="linha-2">
          <div class="campo"><label>Nome completo *</label><input class="input" name="nome" maxlength="100" value="${EG.esc(a.nome)}"></div>
          <div class="campo"><label>Data de nascimento</label><input class="input" type="date" name="nascimento" value="${EG.esc(a.nascimento)}"></div>
        </div>
        <div class="linha-3">
          <div class="campo"><label>CPF</label><input class="input" name="cpf" data-mascara="cpf" maxlength="14" autocomplete="off" value="${EG.esc(a.cpf)}"></div>
          <div class="campo"><label>RG</label><input class="input" name="rg" maxlength="20" autocomplete="off" value="${EG.esc(a.rg)}"></div>
          <div class="campo"><label>RA</label><input class="input" name="ra" maxlength="20" value="${EG.esc(a.ra)}" placeholder="${novo ? 'Gerado automaticamente' : ''}"></div>
        </div>
        <div class="linha-2">
          <div class="campo"><label>Turma</label><select class="select" name="turmaId">${opcoesTurmas(a.turmaId, false)}</select></div>
          <div class="campo"><label>Status</label><select class="select" name="status">${EG.opcoes(Object.entries(STATUS).map(([k, r]) => ({ value: k, label: r })), a.status)}</select></div>
        </div>
        <div class="campo"><label>Endereço</label><input class="input" name="endereco" maxlength="200" value="${EG.esc(a.endereco)}"></div>

        <div class="rotulo" style="margin:18px 0 4px;padding-top:14px;border-top:1px solid var(--border)"><i class="ti ti-file-certificate"></i> Dados para documentos</div>
        <p class="sub" style="margin-bottom:10px">Saem no histórico escolar e nas declarações emitidas em <strong>Documentos</strong>.</p>
        <div class="linha-2">
          <div class="campo"><label>Nome da mãe</label><input class="input" name="maeNome" maxlength="100" value="${EG.esc(a.maeNome)}"></div>
          <div class="campo"><label>Nome do pai</label><input class="input" name="paiNome" maxlength="100" value="${EG.esc(a.paiNome)}"></div>
        </div>
        <div class="linha-3">
          <div class="campo"><label>Naturalidade (cidade)</label><input class="input" name="naturalidade" maxlength="60" value="${EG.esc(a.naturalidade)}" placeholder="Ex.: Itapevi"></div>
          <div class="campo"><label>UF</label><select class="select" name="naturalidadeUf"><option value="">—</option>${EG.UFS.map((u) => `<option ${a.naturalidadeUf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
          <div class="campo"><label>Nacionalidade</label><input class="input" name="nacionalidade" maxlength="40" value="${EG.esc(a.nacionalidade)}" placeholder="Brasileira"></div>
        </div>
        <div class="linha-2">
          <div class="campo"><label>Data de matrícula</label><input class="input" type="date" name="dataMatricula" value="${EG.esc(a.dataMatricula)}"></div>
          <div class="campo"><label>Data de saída</label><input class="input" type="date" name="dataSaida" value="${EG.esc(a.dataSaida)}">
            <small>Preenchida ao emitir a declaração de transferência.</small></div>
        </div>

        <div class="rotulo" style="margin:18px 0 10px;padding-top:14px;border-top:1px solid var(--border)"><i class="ti ti-user-heart"></i> Responsável</div>
        <div class="linha-2">
          <div class="campo"><label>Nome do responsável</label><input class="input" name="respNome" maxlength="100" value="${EG.esc(a.respNome)}"></div>
          <div class="campo"><label>Parentesco</label><select class="select" name="respParentesco">${EG.opcoes(PARENTESCOS.map((p) => ({ value: p, label: p })), a.respParentesco || 'Mãe')}</select></div>
        </div>
        <div class="linha-3">
          <div class="campo"><label>CPF do responsável</label><input class="input" name="respCpf" data-mascara="cpf" maxlength="14" autocomplete="off" value="${EG.esc(a.respCpf)}"></div>
          <div class="campo"><label>Telefone / WhatsApp</label><input class="input" name="respTelefone" data-mascara="telefone" maxlength="15" value="${EG.esc(a.respTelefone)}"></div>
          <div class="campo"><label>E-mail</label><input class="input" type="email" name="respEmail" maxlength="160" value="${EG.esc(a.respEmail)}"></div>
        </div>
        <small class="sub" style="display:block;margin:-6px 0 4px">O CPF do responsável sai na declaração anual de pagamentos (Imposto de Renda). Fica gravado criptografado.</small>

        <div class="rotulo" style="margin:18px 0 4px;padding-top:14px;border-top:1px solid var(--border)"><i class="ti ti-shield-check"></i> Autorizados a retirar o aluno</div>
        <p class="sub" style="margin-bottom:10px">Além do responsável acima, quem mais pode buscar o aluno na escola. Na retirada, confira o documento com foto.</p>
        <div data-autorizados>${(a.autorizados || []).map(linhaAutorizado).join('')}</div>
        <button type="button" class="btn btn-secundario btn-pequeno" data-ficha="add-autorizado"><i class="ti ti-plus"></i> Adicionar pessoa autorizada</button>

        ${novo ? '<div class="msg-info" style="margin-top:6px">O <strong>RA</strong> e o <strong>código de acesso do responsável</strong> são gerados automaticamente ao salvar.</div>' : `
        <div class="rotulo" style="margin:18px 0 10px;padding-top:14px;border-top:1px solid var(--border)"><i class="ti ti-key"></i> Acesso do responsável ao portal</div>
        <div class="codigo-box">
          <code data-codigo>${EG.esc(a.codigoAcesso)}</code>
          <button type="button" class="btn btn-secundario btn-pequeno" data-ficha="copiar"><i class="ti ti-copy"></i> Copiar</button>
          <button type="button" class="btn btn-whats btn-pequeno" data-ficha="whats"><i class="ti ti-brand-whatsapp"></i> Enviar</button>
          <button type="button" class="btn btn-secundario btn-pequeno" data-ficha="novo-codigo"><i class="ti ti-refresh"></i> Gerar novo</button>
          <span class="sub" style="width:100%">${a.responsaveisPortal ? `${a.responsaveisPortal} responsável(is) já usa(m) o portal.` : 'Nenhum responsável cadastrado no portal ainda.'}</span>
        </div>`}`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: novo ? 'Cadastrar aluno' : 'Salvar', classe: 'btn-primario', icone: 'ti-device-floppy', acao: async () => {
          const d = EG.lerForm(m.el);
          d.autorizados = lerAutorizados(m);
          if (novo) {
            const r = await EG.api('POST', '/alunos', d);
            m.fechar();
            EG.toast(`${r.nome} cadastrado(a) · RA ${r.ra} · código ${r.codigoAcesso}`);
          } else {
            await EG.api('PUT', `/alunos/${id}`, d);
            m.fechar();
            EG.toast('Ficha atualizada');
          }
          await depois();
        } }
      ]
    });

    m.el.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-ficha]');
      if (!b) return;
      const codigoEl = m.el.querySelector('[data-codigo]');
      try {
        if (b.dataset.ficha === 'add-autorizado') {
          const caixa = m.el.querySelector('[data-autorizados]');
          if (caixa.children.length >= MAX_AUTORIZADOS) { m.erro(`Máximo de ${MAX_AUTORIZADOS} pessoas autorizadas por aluno.`); return; }
          caixa.insertAdjacentHTML('beforeend', linhaAutorizado());
          caixa.lastElementChild.querySelector('[data-campo="nome"]').focus();
        } else if (b.dataset.ficha === 'remover-autorizado') {
          b.closest('[data-autorizado]').remove();
          m.erro('');
        } else if (novo) {
          // As ações abaixo só existem na ficha de um aluno já cadastrado
        } else if (b.dataset.ficha === 'copiar') {
          EG.copiar(codigoEl.textContent, 'Código copiado!');
        } else if (b.dataset.ficha === 'whats') {
          const tel = m.el.querySelector('[name=respTelefone]').value;
          EG.abrirWhatsApp(tel, mensagemCodigo(a.nome, codigoEl.textContent));
        } else if (b.dataset.ficha === 'novo-codigo') {
          const ok = await EG.confirmar('Gerar um novo código de acesso?\n\nO código atual deixa de valer para novos cadastros. Responsáveis que já usam o portal continuam com acesso.', { textoOk: 'Gerar novo código' });
          if (!ok) return;
          const r = await EG.api('POST', `/alunos/${id}/novo-codigo`);
          codigoEl.textContent = r.codigoAcesso;
          EG.toast('Novo código gerado');
          await depois();
        }
      } catch (e) { m.erro(e.message); }
    });
  }

  function mensagemCodigo(nomeAluno, codigo) {
    const escola = EG.estado.colegio.nome;
    return `📚 *${escola}*\n\nOlá! Este é o código de acesso ao portal do responsável de *${nomeAluno}*:\n\n🔑 *${codigo}*\n\n`
      + `Para acessar: entre em ${location.origin}, clique em *Sou responsável* e crie sua conta usando o código acima.`;
  }

  EG.mensagemCodigoAluno = mensagemCodigo;

  /* ---------- Eventos ---------- */
  async function aoClicar(ev, el) {
    const b = ev.target.closest('[data-action]');
    if (!b || !el.contains(b)) return;
    const linha = b.closest('[data-id]');
    const a = linha ? alunos.find((x) => x.id === Number(linha.dataset.id)) : null;
    try {
      switch (b.dataset.action) {
        case 'novo': await modalAluno(null, el); break;
        case 'editar': await modalAluno(a.id, el); break;
        case 'copiar-codigo': EG.copiar(a.codigoAcesso, 'Código copiado!'); break;
        case 'status': filtro.status = b.dataset.status; render(el); break;
        case 'excluir':
          if (await EG.excluirComConfirmacao(`/alunos/${a.id}`, `Excluir o aluno ${a.nome}?\n\nSe ele apenas saiu da escola, prefira mudar o status para Inativo ou Transferido.`)) {
            EG.toast('Aluno excluído'); await carregarDados(); render(el);
          }
          break;
        default: break;
      }
    } catch (e) { EG.toast(e.message, 'erro'); }
  }

  /** Abre a ficha a partir de outra tela (precisa do módulo alunos). */
  EG.abrirFichaAluno = async function (id, aoSalvar) {
    if (!turmas.length) turmas = await EG.api('GET', '/turmas');
    return modalAluno(id, null, aoSalvar);
  };

  EG.registrarModulo('alunos', {
    async render(el) {
      EG.filtrosDaSessao(filtro, { busca: '', status: 'ativo', turmaId: '' });
      // Vindo da tela de turmas: já abre filtrado
      if (EG.filtroInicialAlunos) {
        filtro.turmaId = String(EG.filtroInicialAlunos.turmaId);
        filtro.status = '';
        EG.filtroInicialAlunos = null;
      }
      await carregarDados();
      render(el);
      el.onclick = (ev) => aoClicar(ev, el);
      el.onchange = (ev) => {
        if (ev.target.matches('[data-filtro="turma"]')) { filtro.turmaId = ev.target.value; render(el); }
      };
      let espera = null;
      el.oninput = (ev) => {
        if (!ev.target.matches('[data-filtro="busca"]')) return;
        clearTimeout(espera);
        espera = setTimeout(() => {
          filtro.busca = ev.target.value;
          const pos = ev.target.selectionStart;
          render(el);
          const campo = EG.$('[data-filtro="busca"]', el);
          campo.focus(); campo.setSelectionRange(pos, pos);
        }, 250);
      };
    }
  });
})(window.EG);
