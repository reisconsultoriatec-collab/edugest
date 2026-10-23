/* =====================================================================
 *  EduGest — Professores
 *  Cadastro com disciplinas e vínculo com o login do sistema
 * ===================================================================== */
'use strict';
(function (EG) {
  let professores = [];
  let filtroStatus = 'ativo';

  async function carregar(el) {
    professores = await EG.api('GET', '/professores');
    const lista = professores.filter((p) => !filtroStatus || p.status === filtroStatus);
    const podeEditar = EG.pode('professores');
    el.innerHTML = `
      <div class="card">
        <div class="card-cab">
          <div class="card-titulo"><i class="ti ti-user-check"></i> Professores</div>
          ${podeEditar ? '<button class="btn btn-primario" data-action="novo"><i class="ti ti-user-plus"></i> Novo professor</button>' : ''}
        </div>
        <div class="filtros">
          <button class="chip ${filtroStatus === 'ativo' ? 'ativo' : ''}" data-action="status" data-status="ativo">Ativos</button>
          <button class="chip ${filtroStatus === 'inativo' ? 'ativo' : ''}" data-action="status" data-status="inativo">Inativos</button>
          <button class="chip ${!filtroStatus ? 'ativo' : ''}" data-action="status" data-status="">Todos</button>
          <span class="sub" style="margin-left:auto;align-self:center">${lista.length} professor(es)</span>
        </div>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Professor</th><th>Disciplinas</th><th>Turmas</th><th>Carga</th><th>Contato</th><th>Login no sistema</th><th>Status</th><th></th></tr></thead>
          <tbody>${lista.map((p) => `<tr data-id="${p.id}">
            <td><strong>${EG.esc(p.nome)}</strong></td>
            <td>${p.disciplinas.map((d) => `<span class="selo selo-info" style="margin:1px">${EG.esc(d.nome)}</span>`).join('') || '<span class="sub">—</span>'}</td>
            <td>${(p.turmas || []).map((t) => `<span class="selo selo-neutro" style="margin:1px">${EG.esc(t)}</span>`).join('') || '<span class="sub">nenhuma</span>'}</td>
            <td>${p.cargaHoraria ? EG.esc(p.cargaHoraria) + 'h/sem' : '<span class="sub">—</span>'}</td>
            <td>${EG.esc(p.telefone || '')}${p.email ? `<br><small>${EG.esc(p.email)}</small>` : ''}${!p.telefone && !p.email ? '<span class="sub">—</span>' : ''}</td>
            <td>${p.usuario ? `<i class="ti ti-link" style="color:var(--ok)"></i> ${EG.esc(p.usuario.email)}` : '<span class="sub">não vinculado</span>'}</td>
            <td><span class="selo ${p.status === 'ativo' ? 'selo-ok' : 'selo-neutro'}">${p.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
            <td class="acoes">${podeEditar ? `<button class="btn-icone" data-action="editar" title="Editar"><i class="ti ti-edit"></i></button>
              <button class="btn-icone perigo" data-action="excluir" title="Excluir"><i class="ti ti-trash"></i></button>` : ''}</td>
          </tr>`).join('') || `<tr><td colspan="8"><div class="vazio"><i class="ti ti-user-check"></i>${professores.length ? 'Nenhum professor neste filtro' : 'Nenhum professor cadastrado'}</div></td></tr>`}</tbody>
        </table></div>
      </div>`;
  }

  async function modalProfessor(id, el) {
    const [p, logins] = await Promise.all([
      id ? EG.api('GET', `/professores/${id}`) : Promise.resolve({ status: 'ativo', disciplinas: [] }),
      EG.api('GET', '/professores/usuarios-disponiveis')
    ]);
    const novo = !id;
    const marcadas = p.disciplinas.map((d) => d.id);
    const disciplinas = EG.estado.colegio.disciplinas.filter((d) => d.ativo || marcadas.includes(d.id));
    const opcoesLogin = [{ value: '', label: 'Não vincular' }].concat(logins
      .filter((u) => !u.vinculadoA || u.id === p.usuarioId)
      .map((u) => ({ value: u.id, label: `${u.nome} — ${u.email}${u.perfil === 'admin' ? ' (admin)' : ''}` })));

    const m = EG.modal({
      titulo: novo ? 'Novo professor' : p.nome,
      largura: 640,
      corpo: `
        <div class="linha-2">
          <div class="campo"><label>Nome completo *</label><input class="input" name="nome" maxlength="100" value="${EG.esc(p.nome)}"></div>
          <div class="campo"><label>CPF</label><input class="input" name="cpf" data-mascara="cpf" maxlength="14" autocomplete="off" value="${EG.esc(p.cpf)}"></div>
        </div>
        <div class="linha-3">
          <div class="campo"><label>Telefone</label><input class="input" name="telefone" data-mascara="telefone" maxlength="15" value="${EG.esc(p.telefone)}"></div>
          <div class="campo"><label>E-mail</label><input class="input" type="email" name="email" maxlength="160" value="${EG.esc(p.email)}"></div>
          <div class="campo"><label>Carga horária semanal</label><input class="input" type="number" name="cargaHoraria" min="0" max="80" value="${EG.esc(p.cargaHoraria)}"></div>
        </div>
        <div class="linha-2">
          <div class="campo"><label>Login no sistema</label><select class="select" name="usuarioId">${EG.opcoes(opcoesLogin, p.usuarioId || '')}</select>
            <small>Vincule ao login do professor para que ele veja as próprias turmas no diário e nas notas.</small></div>
          <div class="campo"><label>Status</label><select class="select" name="status">${EG.opcoes([{ value: 'ativo', label: 'Ativo' }, { value: 'inativo', label: 'Inativo' }], p.status)}</select></div>
        </div>
        <div class="rotulo" style="margin:8px 0 6px">Disciplinas que leciona</div>
        <div class="checks">${disciplinas.map((d) => `<label><input type="checkbox" name="disciplinas" value="${d.id}" ${marcadas.includes(d.id) ? 'checked' : ''}> ${EG.esc(d.nome)}</label>`).join('')
          || '<span class="sub">Cadastre as disciplinas em Configurações.</span>'}</div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: novo ? 'Cadastrar' : 'Salvar', classe: 'btn-primario', icone: 'ti-device-floppy', acao: async () => {
          const d = EG.lerForm(m.el);
          d.disciplinas = (d.disciplinas || []).map(Number);
          if (novo) await EG.api('POST', '/professores', d); else await EG.api('PUT', `/professores/${id}`, d);
          m.fechar(); EG.toast(novo ? 'Professor cadastrado' : 'Professor atualizado'); carregar(el);
        } }
      ]
    });
  }

  async function aoClicar(ev, el) {
    const b = ev.target.closest('[data-action]');
    if (!b || !el.contains(b)) return;
    const linha = b.closest('[data-id]');
    const p = linha ? professores.find((x) => x.id === Number(linha.dataset.id)) : null;
    try {
      switch (b.dataset.action) {
        case 'novo': await modalProfessor(null, el); break;
        case 'editar': await modalProfessor(p.id, el); break;
        case 'status': filtroStatus = b.dataset.status; await carregar(el); break;
        case 'excluir':
          if (await EG.excluirComConfirmacao(`/professores/${p.id}`, `Excluir o professor ${p.nome}?\n\nSe ele apenas deixou a escola, prefira mudar o status para Inativo.`)) {
            EG.toast('Professor excluído'); await carregar(el);
          }
          break;
        default: break;
      }
    } catch (e) { EG.toast(e.message, 'erro'); }
  }

  EG.registrarModulo('professores', {
    async render(el) {
      await carregar(el);
      el.onclick = (ev) => aoClicar(ev, el);
    }
  });
})(window.EG);
