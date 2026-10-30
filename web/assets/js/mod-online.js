/* =====================================================================
 *  EduGest — Usuários online   [administrador]
 *  Quem da equipe está conectado agora (ativo ou ausente), há quanto
 *  tempo e em qual aparelho; os responsáveis aparecem só no total.
 *  A tela em uso não é registrada. Atualiza sozinha a cada 30 segundos.
 *  "Encerrar sessão": a pessoa sai em até 1 minuto (outro administrador:
 *  só o proprietário do sistema).
 * ===================================================================== */
'use strict';
(function (EG) {
  const ATUALIZA_MS = 30 * 1000;
  const PERFIL_SELO = { admin: 'selo-aviso', professor: 'selo-info', financeiro: 'selo-ok' };
  const est = { el: null, dados: null, timer: null, foraTodos: false };
  const esc = (s) => EG.esc(s);

  /* ---------- Horários (relógio do servidor, sem depender do relógio do aparelho) ---------- */
  const ms = (s) => Date.parse(`${String(s).replace(' ', 'T')}Z`);
  function duracao(desde, agora) {
    const min = Math.max(0, Math.round((ms(agora) - ms(desde)) / 60000));
    if (min < 1) return 'menos de 1 min';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  function visto(quando, agora) {
    if (!quando) return 'sem acesso registrado';
    const hora = quando.slice(11, 16);
    const dia = quando.slice(0, 10), hoje = agora.slice(0, 10);
    const ontem = new Date(ms(`${hoje} 12:00:00`) - 86400000).toISOString().slice(0, 10);
    if (dia === hoje) return `hoje às ${hora} (há ${duracao(quando, agora)})`;
    if (dia === ontem) return `ontem às ${hora}`;
    return `${EG.data(quando).slice(0, 5)} às ${hora}`;
  }

  async function carregar() {
    est.dados = await EG.api('GET', '/presenca/online');
    if (EG.atualizarContadorOnline) EG.atualizarContadorOnline(est.dados.total);
  }

  function kpi(icone, fundo, cor, rotulo, valor, obs, attr = '') {
    return `<div class="kpi" ${attr}><div class="kpi-icone" style="background:${fundo};color:${cor}"><i class="ti ${icone}"></i></div>
      <div><div class="kpi-rotulo">${rotulo}</div><div class="kpi-valor">${valor}</div><div class="kpi-obs">${obs}</div></div></div>`;
  }

  function linhaOnline(p, agora) {
    const situacao = p.ativo
      ? '<span class="on-situacao ativa"><i class="ti ti-circle-filled"></i> Ativa</span>'
      : '<span class="on-situacao ausente"><i class="ti ti-moon"></i> Ausente</span>';
    const acao = p.voce ? '<span class="selo selo-neutro">Você</span>'
      : p.podeEncerrar ? `<button class="btn btn-secundario btn-pequeno on-encerrar" data-action="encerrar" data-id="${p.usuarioId}"><i class="ti ti-logout"></i> Encerrar sessão</button>`
        : '<span class="sub" title="Só o proprietário do sistema encerra a sessão de outro administrador">—</span>';
    return `<tr data-usuario="${p.usuarioId}">
      <td data-rotulo="Pessoa"><div class="on-pessoa"><span class="avatar on-avatar">${esc(EG.iniciais(p.nome))}</span>
        <span><strong>${esc(p.nome)}</strong><small class="sub">${esc(p.email || '')}</small></span></div></td>
      <td data-rotulo="Perfil"><span class="selo ${PERFIL_SELO[p.perfil] || 'selo-neutro'}">${esc(EG.PERFIS[p.perfil] || p.perfil)}</span></td>
      <td data-rotulo="Situação">${situacao}</td>
      <td data-rotulo="Conectada há"><span class="on-num">${duracao(p.desde, agora)}</span><small class="sub">desde ${p.desde.slice(11, 16)}</small></td>
      <td data-rotulo="Aparelho">${p.aparelhos.map((a) => `<div class="on-aparelho"><i class="ti ${/^Celular|^Tablet/.test(a) ? 'ti-device-mobile' : 'ti-device-desktop'}"></i> ${esc(a)}</div>`).join('')}
        ${p.abas > 1 ? `<small class="sub">${p.abas} abas abertas</small>` : ''}</td>
      <td class="acoes">${acao}</td>
    </tr>`;
  }

  function desenhar() {
    const el = est.el; const d = est.dados;
    if (!el || !el.isConnected || !d) return;
    const pp = d.porPerfil;
    const ausentes = d.equipe.length - d.ativos;
    const fora = est.foraTodos ? d.fora : d.fora.slice(0, 12);
    el.innerHTML = `
      <div class="card on-cab">
        <div class="card-cab" style="margin-bottom:0">
          <div><div class="card-titulo"><i class="ti ti-access-point"></i> Usuários online</div>
            <p class="sub" style="margin-top:4px" data-on-hora>Atualiza sozinho a cada 30 segundos · atualizado às ${esc(d.agora.slice(11, 19))}</p></div>
          <button class="btn btn-secundario btn-pequeno" data-action="atualizar"><i class="ti ti-refresh"></i> Atualizar</button>
        </div>
      </div>
      <div class="grade-kpi">
        ${kpi('ti-access-point', 'var(--ok-bg)', 'var(--ok)', 'Online agora', d.total, d.total === 1 ? '1 pessoa conectada' : `${d.total} pessoas conectadas`, 'data-on-total')}
        ${kpi('ti-users-group', 'var(--info-bg)', 'var(--info)', 'Equipe', d.equipe.length,
          d.equipe.length ? `${d.ativos} ativa${d.ativos === 1 ? '' : 's'} · ${ausentes} ausente${ausentes === 1 ? '' : 's'}` : 'ninguém da equipe agora')}
        ${kpi('ti-home-heart', 'var(--roxo-bg)', 'var(--roxo)', 'Famílias no portal', d.responsaveis.online,
          d.responsaveis.online ? `${d.responsaveis.ativos} mexendo agora · sem nomes, só o total` : 'nenhuma família agora')}
        ${kpi('ti-id-badge-2', 'var(--aviso-bg)', 'var(--aviso)', 'Por perfil', `${pp.admin + pp.professor + pp.financeiro}`,
          `${pp.admin} admin. · ${pp.professor} prof. · ${pp.financeiro} financ.`)}
      </div>
      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-users"></i> Equipe conectada agora</div></div>
        ${d.equipe.length ? `<div class="tabela-wrap"><table class="on-tabela">
          <thead><tr><th>Pessoa</th><th>Perfil</th><th>Situação</th><th>Conectada há</th><th>Aparelho</th><th></th></tr></thead>
          <tbody>${d.equipe.map((p) => linhaOnline(p, d.agora)).join('')}</tbody></table></div>`
        : '<div class="vazio"><i class="ti ti-plug-off"></i>Ninguém da equipe conectado agora</div>'}
        <p class="on-nota"><strong>Ativa</strong>: mexeu na tela nos últimos 5 minutos. <strong>Ausente</strong>: com o EduGest aberto, mas parada.
          Some da lista quem fecha o sistema ou fica 2 minutos sem sinal. A tela que cada pessoa usa não é registrada.</p>
      </div>
      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-clock-hour-4"></i> Equipe fora do sistema</div></div>
        ${d.fora.length ? `<ul class="on-fora">${fora.map((p) => `<li><span class="avatar on-avatar apagado">${esc(EG.iniciais(p.nome))}</span>
            <span class="on-fora-nome"><strong>${esc(p.nome)}</strong>
              <small class="sub">${esc(EG.PERFIS[p.perfil] || p.perfil)} · ${p.vistoEm ? 'visto por último ' : ''}${esc(visto(p.vistoEm, d.agora))}</small></span></li>`).join('')}</ul>
          ${d.fora.length > 12 ? `<button class="btn btn-secundario btn-pequeno" data-action="fora-todos">${est.foraTodos ? 'Mostrar menos' : `Mostrar todos (${d.fora.length})`}</button>` : ''}`
        : '<div class="vazio"><i class="ti ti-mood-happy"></i>Toda a equipe está conectada</div>'}
      </div>`;
  }

  async function atualizar(manual) {
    if (!est.el || !est.el.isConnected || EG.$('#app').hidden) { parar(); return; }
    try { await carregar(); desenhar(); if (manual) EG.toast('Lista atualizada'); }
    catch (e) { if (manual) EG.toast(e.message, 'erro'); }
  }
  function parar() { clearInterval(est.timer); est.timer = null; }

  async function encerrar(id) {
    const p = est.dados.equipe.find((x) => x.usuarioId === id);
    if (!p) return;
    const ok = await EG.confirmar(`Encerrar a sessão de ${p.nome}?\n\nEla sai do EduGest em até 1 minuto, em ${p.abas > 1 ? `todas as ${p.abas} abas abertas` : 'todos os aparelhos conectados'} neste colégio, e pode entrar de novo com a senha.\n\nPara impedir o acesso, bloqueie a pessoa em Sistema › Usuários.`,
      { titulo: 'Encerrar sessão', textoOk: 'Encerrar sessão', perigo: true });
    if (!ok) return;
    try {
      await EG.api('POST', `/presenca/encerrar/${id}`);
      EG.toast(`Sessão de ${p.nome} encerrada`);
      await atualizar(false);
    } catch (e) { EG.toast(e.message, 'erro'); await atualizar(false); }
  }

  EG.registrarModulo('online', {
    async render(el) {
      parar();
      est.el = el; est.foraTodos = false;
      await carregar();
      desenhar();
      est.timer = setInterval(() => atualizar(false), ATUALIZA_MS);
      el.onclick = (ev) => {
        const b = ev.target.closest('[data-action]');
        if (!b || !el.contains(b)) return;
        if (b.dataset.action === 'atualizar') EG.guarda(b, () => atualizar(true));
        else if (b.dataset.action === 'encerrar') encerrar(Number(b.dataset.id));
        else if (b.dataset.action === 'fora-todos') { est.foraTodos = !est.foraTodos; desenhar(); }
      };
    },
    sair() { parar(); est.el = null; }
  });
})(window.EG);
