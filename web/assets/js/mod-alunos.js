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
            <td>${EG.esc(a.respNome || '—')}${a.respTelefone ? `<br><small>${EG.esc(a.respTelefone)}</small>` : ''}</td>
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
  async function modalAluno(id, el) {
    const a = id ? await EG.api('GET', `/alunos/${id}`) : { status: 'ativo', turmaId: filtro.turmaId && filtro.turmaId !== 'sem' ? Number(filtro.turmaId) : '' };
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

        <div class="rotulo" style="margin:18px 0 10px;padding-top:14px;border-top:1px solid var(--border)"><i class="ti ti-user-heart"></i> Responsável</div>
        <div class="linha-2">
          <div class="campo"><label>Nome do responsável</label><input class="input" name="respNome" maxlength="100" value="${EG.esc(a.respNome)}"></div>
          <div class="campo"><label>Parentesco</label><select class="select" name="respParentesco">${EG.opcoes(PARENTESCOS.map((p) => ({ value: p, label: p })), a.respParentesco || 'Mãe')}</select></div>
        </div>
        <div class="linha-2">
          <div class="campo"><label>Telefone / WhatsApp</label><input class="input" name="respTelefone" data-mascara="telefone" maxlength="15" value="${EG.esc(a.respTelefone)}"></div>
          <div class="campo"><label>E-mail</label><input class="input" type="email" name="respEmail" maxlength="160" value="${EG.esc(a.respEmail)}"></div>
        </div>

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
          if (novo) {
            const r = await EG.api('POST', '/alunos', d);
            m.fechar();
            EG.toast(`${r.nome} cadastrado(a) · RA ${r.ra} · código ${r.codigoAcesso}`);
          } else {
            await EG.api('PUT', `/alunos/${id}`, d);
            m.fechar();
            EG.toast('Ficha atualizada');
          }
          await carregarDados(); render(el);
        } }
      ]
    });

    if (!novo) {
      m.el.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-ficha]');
        if (!b) return;
        const codigoEl = m.el.querySelector('[data-codigo]');
        try {
          if (b.dataset.ficha === 'copiar') EG.copiar(codigoEl.textContent, 'Código copiado!');
          else if (b.dataset.ficha === 'whats') {
            const tel = m.el.querySelector('[name=respTelefone]').value;
            EG.abrirWhatsApp(tel, mensagemCodigo(a.nome, codigoEl.textContent));
          } else if (b.dataset.ficha === 'novo-codigo') {
            const ok = await EG.confirmar('Gerar um novo código de acesso?\n\nO código atual deixa de valer para novos cadastros. Responsáveis que já usam o portal continuam com acesso.', { textoOk: 'Gerar novo código' });
            if (!ok) return;
            const r = await EG.api('POST', `/alunos/${id}/novo-codigo`);
            codigoEl.textContent = r.codigoAcesso;
            EG.toast('Novo código gerado');
            await carregarDados(); render(el);
          }
        } catch (e) { m.erro(e.message); }
      });
    }
  }

  function mensagemCodigo(nomeAluno, codigo) {
    const escola = EG.estado.colegio.nome;
    return `📚 *${escola}*\n\nOlá! Este é o código de acesso ao portal do responsável de *${nomeAluno}*:\n\n🔑 *${codigo}*\n\n`
      + `Para acessar: entre em ${location.origin}, clique em *Sou responsável* e crie sua conta usando o código acima.`;
  }

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

  EG.registrarModulo('alunos', {
    async render(el) {
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
