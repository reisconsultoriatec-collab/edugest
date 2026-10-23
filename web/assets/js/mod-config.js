/* =====================================================================
 *  EduGest — Configurações do colégio  [admin]
 *  Dados cadastrais · Parâmetros · Disciplinas · Código de convite
 * ===================================================================== */
'use strict';
(function (EG) {
  async function recarregarColegio() {
    EG.estado.colegio = await EG.api('GET', '/colegios/atual');
    return EG.estado.colegio;
  }

  function opcoesTimeout(atual) {
    const ops = [[5, '5 minutos'], [10, '10 minutos'], [15, '15 minutos'], [30, '30 minutos'], [60, '60 minutos'], [120, '2 horas'], [0, 'Desativado']];
    if (!ops.some(([v]) => v === atual)) ops.unshift([atual, atual + ' minutos']);
    return ops.map(([v, t]) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${t}</option>`).join('');
  }

  function render(el, c) {
    const cfg = c.config;
    el.innerHTML = `
      <div class="card" data-bloco="dados">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-building"></i> Dados do colégio</div></div>
        <div class="linha-2">
          <div class="campo"><label>Nome do colégio *</label><input class="input" name="nome" maxlength="120" value="${EG.esc(c.nome)}"></div>
          <div class="campo"><label>CNPJ</label><input class="input" name="cnpj" data-mascara="cnpj" maxlength="18" autocomplete="off" value="${EG.esc(c.cnpj)}"></div>
        </div>
        <div class="linha-2">
          <div class="campo"><label>Telefone</label><input class="input" name="telefone" data-mascara="telefone" maxlength="15" value="${EG.esc(c.telefone)}"></div>
          <div class="campo"><label>E-mail</label><input class="input" type="email" name="email" maxlength="160" value="${EG.esc(c.email)}"></div>
        </div>
        <div class="campo"><label>Endereço</label><input class="input" name="endereco" maxlength="200" value="${EG.esc(c.endereco)}"></div>
        <div class="campo"><label><i class="ti ti-brand-whatsapp" style="color:#25D366"></i> WhatsApp para avisos de novos cadastros</label>
          <input class="input" name="whatsappNotif" data-mascara="telefone" maxlength="15" value="${EG.esc(c.whatsappNotif)}" style="max-width:240px">
          <small>Quem se cadastrar pelo código do colégio poderá avisar este número para pedir aprovação.</small></div>
        <button class="btn btn-primario" data-action="salvar-dados"><i class="ti ti-device-floppy"></i> Salvar dados</button>
      </div>

      <div class="card" data-bloco="config">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-adjustments"></i> Parâmetros</div></div>
        <div class="linha-3">
          <div class="campo"><label>Ano letivo</label><input class="input" type="number" name="anoLetivo" min="2000" max="2100" value="${EG.esc(cfg.anoLetivo)}"></div>
          <div class="campo"><label>Mensalidade padrão (R$)</label><input class="input" type="number" name="valorMensalidade" min="0" step="0.01" value="${EG.esc(cfg.valorMensalidade)}"></div>
          <div class="campo"><label>Dia de vencimento</label><input class="input" type="number" name="diaVencimento" min="1" max="28" value="${EG.esc(cfg.diaVencimento)}"></div>
        </div>
        <div class="linha-3">
          <div class="campo"><label>Média para aprovação</label><input class="input" type="number" name="mediaAprovacao" min="0" max="10" step="0.1" value="${EG.esc(cfg.mediaAprovacao)}"></div>
          <div class="campo"><label>Frequência mínima (%)</label><input class="input" type="number" name="frequenciaMinima" min="0" max="100" value="${EG.esc(cfg.frequenciaMinima)}"></div>
          <div class="campo"><label>Encerrar sessão inativa após</label><select class="select" name="timeoutSessaoMin">${opcoesTimeout(cfg.timeoutSessaoMin)}</select></div>
        </div>
        <button class="btn btn-primario" data-action="salvar-config"><i class="ti ti-device-floppy"></i> Salvar parâmetros</button>
      </div>

      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-book"></i> Disciplinas</div></div>
        <p class="card-desc">Disciplina com notas lançadas não pode ser excluída — desative para tirá-la das listas.</p>
        <div id="listaDisciplinas">${c.disciplinas.map(linhaDisciplina).join('') || '<div class="vazio">Nenhuma disciplina</div>'}</div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <input class="input" id="novaDisciplina" maxlength="60" placeholder="Nova disciplina" style="max-width:300px">
          <button class="btn btn-secundario" data-action="add-disciplina"><i class="ti ti-plus"></i> Adicionar</button>
        </div>
      </div>

      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-key"></i> Código do colégio</div></div>
        <p class="card-desc">Compartilhe com a equipe para que se cadastrem no colégio. Cada cadastro precisa da sua aprovação em <strong>Usuários</strong>.</p>
        <div class="codigo-box">
          <code id="codigoConvite">${EG.esc(c.codigoConvite)}</code>
          <button class="btn btn-secundario btn-pequeno" data-action="copiar-convite"><i class="ti ti-copy"></i> Copiar</button>
          <button class="btn btn-secundario btn-pequeno" data-action="regenerar-convite"><i class="ti ti-refresh"></i> Gerar novo</button>
        </div>
      </div>`;
  }

  function linhaDisciplina(d) {
    return `<div class="disciplina-linha ${d.ativo ? '' : 'inativa'}" data-id="${d.id}">
      <i class="ti ti-grip-vertical" style="color:var(--muted)"></i>
      <input class="input" value="${EG.esc(d.nome)}" maxlength="60" data-nome-original="${EG.esc(d.nome)}">
      ${d.ativo ? '' : '<span class="selo selo-neutro">inativa</span>'}
      <button class="btn-icone" data-action="renomear-disciplina" title="Salvar nome"><i class="ti ti-check"></i></button>
      <button class="btn-icone" data-action="alternar-disciplina" data-ativo="${d.ativo ? 1 : 0}" title="${d.ativo ? 'Desativar' : 'Reativar'}">
        <i class="ti ${d.ativo ? 'ti-eye-off' : 'ti-eye'}"></i></button>
      <button class="btn-icone perigo" data-action="excluir-disciplina" title="Excluir"><i class="ti ti-trash"></i></button>
    </div>`;
  }

  async function aoClicar(ev, el) {
    const b = ev.target.closest('[data-action]');
    if (!b || !el.contains(b)) return;
    const acao = b.dataset.action;
    const linha = b.closest('.disciplina-linha');
    const idDisc = linha ? Number(linha.dataset.id) : null;

    await EG.guarda(b, async () => {
      try {
        if (acao === 'salvar-dados') {
          await EG.api('PUT', '/colegios/atual', EG.lerForm(b.closest('[data-bloco]')));
          const c = await recarregarColegio();
          // Atualiza o nome no seletor
          const item = (EG.estado.me.colegios || []).find((x) => x.id === EG.estado.colegioId);
          if (item) { item.nome = c.nome; const o = EG.$(`#seletorColegio option[value="${c.id}"]`); if (o) o.textContent = c.nome; }
          EG.toast('Dados do colégio salvos');
        } else if (acao === 'salvar-config') {
          const d = EG.lerForm(b.closest('[data-bloco]'));
          await EG.api('PUT', '/colegios/atual/config', d);
          const c = await recarregarColegio();
          EG.iniciarSessao(c.config.timeoutSessaoMin);
          EG.toast('Parâmetros salvos');
        } else if (acao === 'add-disciplina') {
          const inp = EG.$('#novaDisciplina');
          if (!inp.value.trim()) { inp.focus(); return; }
          await EG.api('POST', '/colegios/atual/disciplinas', { nome: inp.value.trim() });
          render(el, await recarregarColegio());
          EG.toast('Disciplina adicionada');
        } else if (acao === 'renomear-disciplina') {
          const inp = linha.querySelector('input');
          if (inp.value.trim() === inp.dataset.nomeOriginal) return;
          await EG.api('PUT', `/colegios/atual/disciplinas/${idDisc}`, { nome: inp.value.trim() });
          render(el, await recarregarColegio());
          EG.toast('Disciplina renomeada');
        } else if (acao === 'alternar-disciplina') {
          await EG.api('PUT', `/colegios/atual/disciplinas/${idDisc}`, { ativo: b.dataset.ativo !== '1' });
          render(el, await recarregarColegio());
        } else if (acao === 'excluir-disciplina') {
          const nome = linha.querySelector('input').dataset.nomeOriginal;
          if (!(await EG.confirmar(`Excluir a disciplina "${nome}"?`, { perigo: true, textoOk: 'Excluir' }))) return;
          await EG.api('DELETE', `/colegios/atual/disciplinas/${idDisc}`);
          render(el, await recarregarColegio());
          EG.toast('Disciplina excluída');
        } else if (acao === 'copiar-convite') {
          EG.copiar(EG.estado.colegio.codigoConvite, 'Código copiado!');
        } else if (acao === 'regenerar-convite') {
          const ok = await EG.confirmar('Gerar um novo código?\n\nO código atual deixa de funcionar imediatamente. Quem ainda não se cadastrou vai precisar do código novo.', { textoOk: 'Gerar novo código' });
          if (!ok) return;
          const r = await EG.api('POST', '/colegios/atual/convite/regenerar');
          EG.estado.colegio.codigoConvite = r.codigoConvite;
          EG.$('#codigoConvite').textContent = r.codigoConvite;
          EG.toast('Novo código gerado');
        }
      } catch (e) {
        EG.toast(e.message, 'erro');
      }
    });
  }

  EG.registrarModulo('config', {
    async render(el) {
      render(el, await recarregarColegio());
      el.onclick = (ev) => aoClicar(ev, el);
      el.onkeydown = (ev) => {
        if (ev.key === 'Enter' && ev.target.id === 'novaDisciplina') EG.$('[data-action="add-disciplina"]', el).click();
      };
    }
  });
})(window.EG);
