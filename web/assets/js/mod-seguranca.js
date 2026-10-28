/* EduGest — Log de segurança  [admin] */
'use strict';
(function (EG) {
  const TIPOS = {
    login_ok: { rotulo: 'Login', icone: 'ti-login', cor: 'var(--ok)' },
    login_falha: { rotulo: 'Falha de login', icone: 'ti-lock-off', cor: 'var(--erro)' },
    logout: { rotulo: 'Logout', icone: 'ti-logout', cor: 'var(--muted)' },
    timeout: { rotulo: 'Inatividade', icone: 'ti-clock-pause', cor: 'var(--aviso)' },
    cadastro: { rotulo: 'Cadastro', icone: 'ti-user-plus', cor: 'var(--info)' },
    admin: { rotulo: 'Ação de admin', icone: 'ti-shield-check', cor: 'var(--roxo)' },
    privacidade: { rotulo: 'Privacidade', icone: 'ti-user-shield', cor: 'var(--info)' }
  };
  const POR_PAGINA = 50;
  let filtro = '';
  let pagina = 1;

  async function carregar(el) {
    const q = `?limite=${POR_PAGINA}&pagina=${pagina}` + (filtro ? `&tipo=${filtro}` : '');
    const r = await EG.api('GET', '/seguranca/log' + q);
    const totalPaginas = Math.max(1, Math.ceil(r.total / POR_PAGINA));

    el.innerHTML = `<div class="card">
      <div class="card-cab"><div class="card-titulo"><i class="ti ti-shield-lock"></i> Log de segurança</div>
        <button class="btn btn-secundario btn-pequeno" data-action="atualizar"><i class="ti ti-refresh"></i> Atualizar</button></div>
      <p class="card-desc">Registro permanente de acessos e ações administrativas deste colégio. Não pode ser apagado.</p>
      <div class="filtros">
        <button class="chip ${!filtro ? 'ativo' : ''}" data-action="filtro" data-tipo="">Todos</button>
        ${Object.entries(TIPOS).map(([k, t]) => `<button class="chip ${filtro === k ? 'ativo' : ''}" data-action="filtro" data-tipo="${k}">${t.rotulo}</button>`).join('')}
      </div>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Data/hora</th><th>Evento</th><th>Usuário</th><th>Detalhes</th><th>IP / dispositivo</th></tr></thead>
        <tbody>${r.itens.map((l) => {
          const t = TIPOS[l.tipo] || { rotulo: l.tipo, icone: 'ti-point', cor: 'var(--text)' };
          return `<tr>
            <td style="white-space:nowrap">${EG.dataHora(l.data)}</td>
            <td style="white-space:nowrap;color:${t.cor}"><i class="ti ${t.icone}"></i> ${EG.esc(t.rotulo)}</td>
            <td>${EG.esc(l.usuario || '—')}<br><small>${EG.esc(l.email || '')}</small></td>
            <td>${EG.esc(l.detalhes || '')}</td>
            <td><code style="font-size:11px">${EG.esc(l.ip || '—')}</code><br><small>${EG.esc(l.dispositivo || '')}</small></td></tr>`;
        }).join('') || '<tr><td colspan="5"><div class="vazio"><i class="ti ti-shield-check"></i>Nenhum evento</div></td></tr>'}</tbody>
      </table></div>
      <div class="paginacao">
        <span>${r.total} evento(s) · página ${pagina} de ${totalPaginas}</span>
        <button class="btn btn-secundario btn-pequeno" data-action="pagina" data-p="${pagina - 1}" ${pagina <= 1 ? 'disabled' : ''}><i class="ti ti-chevron-left"></i></button>
        <button class="btn btn-secundario btn-pequeno" data-action="pagina" data-p="${pagina + 1}" ${pagina >= totalPaginas ? 'disabled' : ''}><i class="ti ti-chevron-right"></i></button>
      </div></div>`;
  }

  EG.registrarModulo('seguranca', {
    async render(el) {
      filtro = ''; pagina = 1;
      await carregar(el);
      el.onclick = async (ev) => {
        const b = ev.target.closest('[data-action]');
        if (!b || !el.contains(b)) return;
        if (b.dataset.action === 'filtro') { filtro = b.dataset.tipo; pagina = 1; }
        else if (b.dataset.action === 'pagina') pagina = Number(b.dataset.p);
        try { await carregar(el); } catch (e) { EG.toast(e.message, 'erro'); }
      };
    }
  });
})(window.EG);
