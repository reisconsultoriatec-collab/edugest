/* =====================================================================
 *  EduGest — Usuários do colégio  [admin]
 *  Pendentes · Equipe e responsáveis · Vincular por e-mail
 * ===================================================================== */
'use strict';
(function (EG) {
  // Espelho de src/utils/modulos.js da API
  const MODULOS = [
    { grupo: 'Principal', itens: [['dashboard', 'Dashboard']] },
    { grupo: 'Pedagógico', itens: [['alunos', 'Alunos'], ['professores', 'Professores'], ['turmas', 'Turmas e Séries'], ['diario', 'Diário de Classe'],
      ['notas', 'Notas e Médias'], ['boletim', 'Boletim'], ['calendario', 'Calendário'], ['grade', 'Grade Horária'], ['documentos', 'Documentos']] },
    { grupo: 'Financeiro', itens: [['mensalidades', 'Mensalidades'], ['contas', 'Contas a Pagar'], ['fluxo', 'Fluxo de Caixa'], ['bolsas', 'Descontos e Bolsas'],
      ['relatorios', 'Relatórios'], ['conciliacao', 'Conciliação Bancária']] },
    { grupo: 'Captação e comunicação', itens: [['funil', 'Funil de Matrículas'], ['comunicados', 'Comunicados']] }
  ];
  const PADRAO = {
    professor: ['dashboard', 'alunos', 'turmas', 'diario', 'notas', 'boletim', 'calendario', 'grade', 'comunicados'],
    financeiro: ['dashboard', 'mensalidades', 'contas', 'fluxo', 'bolsas', 'relatorios', 'conciliacao']
  };
  const SELO_PERFIL = { admin: 'selo-aviso', professor: 'selo-info', financeiro: 'selo-ok', responsavel: 'selo-roxo' };
  const SELO_STATUS = { ativo: 'selo-ok', pendente: 'selo-aviso', bloqueado: 'selo-erro' };

  let usuarios = [];

  /* ---------- Blocos de formulário ---------- */
  function checksModulos(marcados) {
    return `<div class="checks">${MODULOS.map((g) => `<div class="grupo">${g.grupo}</div>` +
      g.itens.map(([id, rot]) => `<label><input type="checkbox" name="modulos" value="${id}" ${marcados.includes(id) ? 'checked' : ''}> ${rot}</label>`).join('')).join('')}</div>`;
  }
  function seletorPerfil(atual) {
    return `<select class="select" name="perfil" data-perfil>
      ${['professor', 'financeiro', 'admin'].map((p) => `<option value="${p}" ${p === atual ? 'selected' : ''}>${EG.PERFIS[p]}</option>`).join('')}</select>`;
  }
  function blocoModulos(perfil, marcados) {
    return `<div data-bloco-modulos ${perfil === 'admin' ? 'hidden' : ''} style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap">
        <span class="rotulo" style="margin:0">Módulos que poderá acessar</span>
        <span><button type="button" class="btn btn-secundario btn-pequeno" data-marcar="padrao">Padrão do perfil</button>
        <button type="button" class="btn btn-secundario btn-pequeno" data-marcar="todos">Todos</button>
        <button type="button" class="btn btn-secundario btn-pequeno" data-marcar="nenhum">Nenhum</button></span>
      </div>${checksModulos(marcados)}</div>
      <div data-aviso-admin class="msg-info" ${perfil === 'admin' ? '' : 'hidden'} style="margin-top:10px">O administrador acessa todos os módulos, as configurações e a gestão de usuários.</div>`;
  }
  /** Liga troca de perfil e botões Padrão/Todos/Nenhum dentro do modal. */
  function ligarModulos(m) {
    const sel = m.el.querySelector('[data-perfil]');
    const aplicar = (lista) => EG.$$('[name=modulos]', m.el).forEach((c) => { c.checked = lista.includes(c.value); });
    if (sel) sel.addEventListener('change', () => {
      const admin = sel.value === 'admin';
      m.el.querySelector('[data-bloco-modulos]').hidden = admin;
      m.el.querySelector('[data-aviso-admin]').hidden = !admin;
      if (!admin) aplicar(PADRAO[sel.value] || []);
    });
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-marcar]');
      if (!b) return;
      const todos = MODULOS.flatMap((g) => g.itens.map(([id]) => id));
      const perfil = sel ? sel.value : 'professor';
      aplicar(b.dataset.marcar === 'todos' ? todos : b.dataset.marcar === 'nenhum' ? [] : (PADRAO[perfil] || []));
    });
  }
  function lerPerfilModulos(m) {
    const d = EG.lerForm(m.el);
    const corpo = {};
    if (d.perfil) corpo.perfil = d.perfil;
    if (corpo.perfil !== 'admin' && m.el.querySelector('[name=modulos]')) {
      if (!d.modulos || !d.modulos.length) throw EG.erro('Selecione pelo menos um módulo.');
      corpo.modulos = d.modulos;
    }
    return corpo;
  }

  /* ---------- Render ---------- */
  async function carregar(el) {
    usuarios = await EG.api('GET', '/usuarios');
    const pend = usuarios.filter((u) => u.status === 'pendente');
    const outros = usuarios.filter((u) => u.status !== 'pendente');
    EG.atualizarPendentes(pend.length);
    const codigo = EG.estado.colegio.codigoConvite;

    el.innerHTML = `
      ${pend.length ? `<div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-clock-pause" style="color:var(--aviso)"></i> Cadastros aguardando aprovação (${pend.length})</div></div>
        ${pend.map((u) => `<div class="pendente-item" data-id="${u.id}">
          <span class="avatar">${EG.esc(EG.iniciais(u.nome))}</span>
          <div class="pendente-info"><strong>${EG.esc(u.nome)}</strong>
            <span class="sub">${EG.esc(u.email)} · ${EG.esc(EG.PERFIS[u.perfil])}${u.alunos.length ? ' de ' + EG.esc(u.alunos.join(', ')) : ''} · desde ${EG.dataHora(u.desde)}</span></div>
          <button class="btn btn-primario btn-pequeno" data-action="aprovar"><i class="ti ti-check"></i> Aprovar</button>
          <button class="btn btn-perigo btn-pequeno" data-action="rejeitar"><i class="ti ti-x"></i> Rejeitar</button>
        </div>`).join('')}
      </div>` : ''}

      <div class="card">
        <div class="card-cab">
          <div class="card-titulo"><i class="ti ti-users-group"></i> Usuários do colégio</div>
          <button class="btn btn-primario" data-action="vincular"><i class="ti ti-user-plus"></i> Vincular por e-mail</button>
        </div>
        <div class="codigo-box" style="margin-bottom:16px">
          <span class="sub" style="width:100%">Código para a equipe se cadastrar:</span>
          <code>${EG.esc(codigo)}</code>
          <button class="btn btn-secundario btn-pequeno" data-action="copiar-convite"><i class="ti ti-copy"></i> Copiar</button>
        </div>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Nome</th><th>Perfil</th><th>Status</th><th>Acesso</th><th>Último acesso</th><th></th></tr></thead>
          <tbody>${outros.map(linha).join('') || '<tr><td colspan="6"><div class="vazio">Nenhum usuário</div></td></tr>'}</tbody>
        </table></div>
      </div>`;
  }

  function linha(u) {
    const acesso = u.perfil === 'admin' ? '<span class="sub">Acesso total</span>'
      : u.perfil === 'responsavel' ? `<span class="sub">${u.alunos.length ? 'Aluno(s): ' + EG.esc(u.alunos.join(', ')) : 'Portal'}</span>`
        : `<span class="sub">${u.modulos.length} módulo(s)${u.modulosPersonalizados ? ' · personalizado' : ''}</span>`;
    const acoes = u.voce ? '<span class="sub">você</span>' : `
      <button class="btn-icone" data-action="editar" title="Perfil, módulos e bloqueio"><i class="ti ti-adjustments"></i></button>
      <button class="btn-icone perigo" data-action="remover" title="Remover do colégio"><i class="ti ti-user-minus"></i></button>`;
    return `<tr data-id="${u.id}">
      <td><strong>${EG.esc(u.nome)}</strong><br><small>${EG.esc(u.email)}</small></td>
      <td><span class="selo ${SELO_PERFIL[u.perfil] || 'selo-neutro'}">${EG.esc(EG.PERFIS[u.perfil] || u.perfil)}</span></td>
      <td><span class="selo ${SELO_STATUS[u.status] || 'selo-neutro'}">${EG.esc(EG.STATUS[u.status] || u.status)}</span></td>
      <td>${acesso}</td>
      <td>${u.ultimoAcesso ? EG.dataHora(u.ultimoAcesso) : '<span class="sub">nunca</span>'}</td>
      <td class="acoes">${acoes}</td></tr>`;
  }

  /* ---------- Ações ---------- */
  function modalAprovar(u, el) {
    const equipe = u.perfil !== 'responsavel';
    const m = EG.modal({
      titulo: `Aprovar ${u.nome}`,
      corpo: `<p class="card-desc" style="margin:0 0 14px">${EG.esc(u.email)}</p>
        ${equipe ? `<div class="campo"><label>Perfil</label>${seletorPerfil(u.perfil)}</div>${blocoModulos(u.perfil, PADRAO[u.perfil] || [])}`
          : `<div class="msg-info">Responsável por: <strong>${EG.esc(u.alunos.join(', ') || '—')}</strong>. Terá acesso apenas ao portal do responsável.</div>`}`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Aprovar acesso', classe: 'btn-primario', icone: 'ti-check', acao: async () => {
          await EG.api('POST', `/usuarios/${u.id}/aprovar`, equipe ? lerPerfilModulos(m) : {});
          m.fechar(); EG.toast(`${u.nome} aprovado(a)`); carregar(el);
        } }
      ]
    });
    if (equipe) ligarModulos(m);
  }

  function modalEditar(u, el) {
    const equipe = u.perfil !== 'responsavel';
    const m = EG.modal({
      titulo: `Acesso de ${u.nome}`,
      corpo: `<p class="card-desc" style="margin:0 0 14px">${EG.esc(u.email)}</p>
        <div class="linha-2">
          ${equipe ? `<div class="campo"><label>Perfil</label>${seletorPerfil(u.perfil)}</div>` : ''}
          <div class="campo"><label>Status</label><select class="select" name="status">
            <option value="ativo" ${u.status === 'ativo' ? 'selected' : ''}>Ativo</option>
            <option value="bloqueado" ${u.status === 'bloqueado' ? 'selected' : ''}>Bloqueado</option></select></div>
        </div>
        ${equipe ? blocoModulos(u.perfil, u.modulos) : ''}`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Salvar', classe: 'btn-primario', icone: 'ti-device-floppy', acao: async () => {
          const corpo = equipe ? lerPerfilModulos(m) : {};
          corpo.status = EG.lerForm(m.el).status;
          await EG.api('PUT', `/usuarios/${u.id}`, corpo);
          m.fechar(); EG.toast('Acesso atualizado'); carregar(el);
        } }
      ]
    });
    if (equipe) ligarModulos(m);
  }

  function modalVincular(el) {
    const m = EG.modal({
      titulo: 'Vincular usuário por e-mail',
      corpo: `<div class="msg-info">A pessoa precisa já ter conta no EduGest (de outro colégio ou criada pela tela de cadastro). O acesso fica ativo na hora.</div>
        <div class="linha-2">
          <div class="campo"><label>E-mail *</label><input class="input" type="email" name="email" maxlength="160"></div>
          <div class="campo"><label>Perfil</label>${seletorPerfil('professor')}</div>
        </div>
        ${blocoModulos('professor', PADRAO.professor)}`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Vincular', classe: 'btn-primario', icone: 'ti-user-plus', acao: async () => {
          const corpo = lerPerfilModulos(m);
          corpo.email = EG.lerForm(m.el).email;
          const r = await EG.api('POST', '/usuarios/vincular', corpo);
          m.fechar(); EG.toast(`${r.nome} vinculado(a)`); carregar(el);
        } }
      ]
    });
    ligarModulos(m);
  }

  async function aoClicar(ev, el) {
    const b = ev.target.closest('[data-action]');
    if (!b || !el.contains(b)) return;
    const caixa = b.closest('[data-id]');
    const u = caixa ? usuarios.find((x) => x.id === Number(caixa.dataset.id)) : null;
    const acao = b.dataset.action;
    try {
      if (acao === 'aprovar') modalAprovar(u, el);
      else if (acao === 'editar') modalEditar(u, el);
      else if (acao === 'vincular') modalVincular(el);
      else if (acao === 'copiar-convite') EG.copiar(EG.estado.colegio.codigoConvite, 'Código copiado!');
      else if (acao === 'rejeitar') {
        if (!(await EG.confirmar(`Rejeitar o cadastro de ${u.nome}?\n\nA pessoa perde o vínculo com o colégio e precisará se cadastrar de novo.`, { perigo: true, textoOk: 'Rejeitar' }))) return;
        await EG.api('POST', `/usuarios/${u.id}/rejeitar`);
        EG.toast('Cadastro rejeitado'); carregar(el);
      } else if (acao === 'remover') {
        if (!(await EG.confirmar(`Remover ${u.nome} deste colégio?\n\nO acesso é encerrado imediatamente. A conta continua existindo e pode ser vinculada de novo depois.`, { perigo: true, textoOk: 'Remover' }))) return;
        await EG.api('DELETE', `/usuarios/${u.id}`);
        EG.toast('Usuário removido'); carregar(el);
      }
    } catch (e) {
      EG.toast(e.message, 'erro');
    }
  }

  EG.registrarModulo('usuarios', {
    async render(el) {
      await carregar(el);
      el.onclick = (ev) => aoClicar(ev, el);
    }
  });
})(window.EG);
