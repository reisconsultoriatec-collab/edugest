/* =====================================================================
 *  EduGest — Comunicados (equipe)   [módulo comunicados]
 *  Publicar para o colégio todo, segmentos ou turmas · fixar · pedir
 *  ciência · quem leu no portal · avisar pelo WhatsApp.
 *  Professor: publica só para as turmas em que leciona.
 * ===================================================================== */
'use strict';
(function (EG) {
  // [rótulo, classe do selo, ícone]
  const TIPOS = {
    aviso: ['Aviso', 'selo-info', 'ti-info-circle'],
    circular: ['Circular', 'selo-roxo', 'ti-file-text'],
    evento: ['Evento', 'selo-ok', 'ti-calendar-event'],
    urgente: ['Urgente', 'selo-erro', 'ti-alert-triangle']
  };
  const seloTipo = (t) => {
    const x = TIPOS[t] || [t, 'selo-neutro', 'ti-point'];
    return `<span class="selo ${x[1]}"><i class="ti ${x[2]}"></i> ${x[0]}</span>`;
  };
  EG.seloTipoComunicado = seloTipo; // usado no portal e no dashboard

  const est = {};
  let opcoes = null;
  let itens = [];

  /* ---------- Cartões da lista ---------- */
  function medidor(rotulo, n, total) {
    const pct = total ? Math.round((n / total) * 100) : 0;
    return `<div class="medidor-linha" title="${rotulo}: ${n} de ${total}"><div class="medidor"><span style="width:${pct}%"></span></div><span>${n}/${total}</span></div>`;
  }
  function blocoLeitura(c) {
    const l = c.leitura;
    if (!l.destinatarios) return '<div class="com-leitura"><small>Nenhum responsável com acesso ao portal neste público</small></div>';
    return `<div class="com-leitura"><div>Lido por ${l.lidos} de ${l.destinatarios}</div>${medidor('Leram', l.lidos, l.destinatarios)}
      ${l.cientes !== null ? `<div style="margin-top:6px">Cientes: ${l.cientes} de ${l.destinatarios}</div>${medidor('Cientes', l.cientes, l.destinatarios)}` : ''}</div>`;
  }
  function selos(c) {
    return seloTipo(c.tipo)
      + (c.fixado && !c.expirado ? '<span class="selo selo-aviso"><i class="ti ti-pin"></i> Fixado</span>' : '')
      + (c.exigeCiencia ? '<span class="selo selo-neutro"><i class="ti ti-checks"></i> Pede ciência</span>' : '')
      + (c.expirado ? '<span class="selo selo-neutro">Expirado</span>' : '');
  }
  const meta = (c) => `<i class="ti ti-users"></i> ${EG.esc(c.publico)} · ${EG.esc(c.autor || '—')} · ${EG.dataHora(c.criadoEm)}${c.atualizadoEm ? ' (editado)' : ''}`
    + (c.expiraEm ? ` · ${c.expirado ? 'expirou em' : 'no ar até'} ${EG.data(c.expiraEm)}` : '');

  function cartao(c) {
    return `<div class="com-item tipo-${c.tipo}" data-id="${c.id}">
      <div class="com-cab"><div>
          <div class="com-selos">${selos(c)}</div>
          <div class="com-titulo">${EG.esc(c.titulo)}</div>
          <div class="com-meta">${meta(c)}</div>
        </div>${blocoLeitura(c)}</div>
      <div class="com-texto resumo">${EG.esc(c.mensagem)}</div>
      <div class="com-acoes">
        <button class="btn btn-secundario btn-pequeno" data-action="ver"><i class="ti ti-eye"></i> ${c.podeEditar ? 'Ver e leituras' : 'Ver'}</button>
        ${c.podeEditar ? `<button class="btn btn-whats btn-pequeno" data-action="whats"><i class="ti ti-brand-whatsapp"></i> WhatsApp</button>
          <button class="btn btn-secundario btn-pequeno" data-action="editar"><i class="ti ti-pencil"></i> Editar</button>
          <button class="btn-icone perigo" data-action="excluir" title="Excluir"><i class="ti ti-trash"></i></button>` : ''}
      </div></div>`;
  }

  async function carregarLista(el) {
    const q = new URLSearchParams({ situacao: est.situacao });
    if (est.tipo) q.set('tipo', est.tipo);
    if (est.busca) q.set('busca', est.busca);
    itens = (await EG.api('GET', '/comunicados?' + q)).itens;
    const vazio = est.tipo || est.busca || est.situacao !== 'ativos'
      ? '<div class="vazio"><i class="ti ti-search"></i>Nenhum comunicado encontrado</div>'
      : `<div class="vazio"><i class="ti ti-speakerphone"></i>Nenhum comunicado no ar<br>
          <button class="btn btn-primario" data-action="novo" style="margin-top:14px"><i class="ti ti-plus"></i> Publicar o primeiro</button></div>`;
    el.querySelector('[data-lista]').innerHTML = itens.length ? itens.map(cartao).join('') : vazio;
  }

  /* ---------- Publicar / editar ---------- */
  const ALCANCES = [['todos', 'Colégio todo', 'ti-building'], ['segmentos', 'Segmentos', 'ti-stack-2'], ['turmas', 'Turmas', 'ti-layout-grid']];

  function modalForm(el, c) {
    const editando = !!c;
    c = c || {
      titulo: '', mensagem: '', tipo: 'aviso', alcance: opcoes.restrito ? 'turmas' : 'todos',
      segmentos: [], turmas: opcoes.restrito && opcoes.turmas.length === 1 ? [{ id: opcoes.turmas[0].id }] : [],
      fixado: false, exigeCiencia: false, expiraEm: null
    };
    const turmasSel = new Set(c.turmas.map((t) => t.id));
    const hoje = EG.hojeSP();
    const m = EG.modal({
      titulo: editando ? 'Editar comunicado' : 'Novo comunicado',
      largura: 680,
      corpo: `
        ${opcoes.restrito && !opcoes.vinculado ? '<div class="msg-erro" style="margin-bottom:14px">Seu login ainda não está ligado a um cadastro de professor. Peça ao administrador (Sistema › Usuários).</div>' : ''}
        <div class="campo"><label>Título *</label><input class="input" name="titulo" maxlength="150" value="${EG.esc(c.titulo)}" placeholder="Ex.: Reunião de pais e mestres"></div>
        <div class="linha-2">
          <div class="campo"><label>Tipo</label><select class="select" name="tipo">${Object.entries(TIPOS).map(([v, [r]]) => `<option value="${v}" ${v === c.tipo ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
          <div class="campo"><label>No ar até (opcional)</label><input class="input" type="date" name="expiraEm" value="${EG.esc(c.expiraEm || '')}" ${editando ? '' : `min="${hoje}"`}>
            <small>Depois dessa data, some do portal.</small></div>
        </div>
        <div class="campo"><label>Mensagem *</label><textarea class="textarea" name="mensagem" rows="7" maxlength="5000">${EG.esc(c.mensagem)}</textarea>
          <small data-contador></small></div>
        <div class="campo"><label>Para quem</label>
          <div class="opcoes-publico">${ALCANCES.map(([v, r, i]) => {
            const bloqueado = opcoes.restrito && v !== 'turmas';
            return `<button type="button" class="chip ${c.alcance === v ? 'ativo' : ''}" data-alcance="${v}" ${bloqueado ? 'disabled title="Professor publica só para as turmas em que leciona" style="opacity:.45;cursor:not-allowed"' : ''}><i class="ti ${i}"></i> ${r}</button>`;
          }).join('')}</div>
          <input type="hidden" name="alcance" value="${c.alcance}">
          <div data-bloco="todos" ${c.alcance === 'todos' ? '' : 'hidden'}><small>Todas as famílias com aluno ativo no colégio.</small></div>
          <div data-bloco="segmentos" ${c.alcance === 'segmentos' ? '' : 'hidden'}>
            ${opcoes.segmentos.length ? `<div class="lista-check">${opcoes.segmentos.map((s) => `<label><input type="checkbox" name="segmentos" value="${s.id}" ${c.segmentos.includes(s.id) ? 'checked' : ''}> ${EG.esc(s.nome)} <small>(${s.turmas} turma${s.turmas > 1 ? 's' : ''})</small></label>`).join('')}</div>
              <small>O segmento vem da série de cada turma.</small>` : '<small>Nenhuma turma ativa cadastrada.</small>'}
          </div>
          <div data-bloco="turmas" ${c.alcance === 'turmas' ? '' : 'hidden'}>
            ${opcoes.turmas.length ? `<div class="lista-check">${opcoes.turmas.map((t) => `<label><input type="checkbox" name="turmas" value="${t.id}" ${turmasSel.has(t.id) ? 'checked' : ''}> ${EG.esc(t.nome)}</label>`).join('')}</div>
              ${opcoes.turmas.length > 1 ? '<button type="button" class="auth-link" data-marcar-turmas style="margin-top:6px">Marcar todas</button>' : ''}`
              : `<small>${opcoes.restrito ? 'Nenhuma turma atribuída a você. Peça ao administrador (Turmas › atribuições).' : 'Nenhuma turma ativa cadastrada.'}</small>`}
          </div>
        </div>
        <label style="display:flex;gap:10px;align-items:flex-start;margin:4px 0 10px;cursor:pointer"><input type="checkbox" name="fixado" ${c.fixado ? 'checked' : ''} style="margin-top:3px">
          <span><strong>Fixar no topo</strong><br><small style="color:var(--muted)">Aparece primeiro no portal enquanto estiver no ar.</small></span></label>
        <label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer"><input type="checkbox" name="exigeCiencia" ${c.exigeCiencia ? 'checked' : ''} style="margin-top:3px">
          <span><strong>Pedir confirmação de ciência</strong><br><small style="color:var(--muted)">O responsável clica em "Estou ciente" (ex.: circular de passeio, mudança de horário).</small></span></label>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: editando ? 'Salvar' : 'Publicar', classe: 'btn-primario', icone: editando ? 'ti-device-floppy' : 'ti-send', acao: async () => {
          const d = EG.lerForm(m.el);
          const corpo = {
            titulo: d.titulo, mensagem: d.mensagem, tipo: d.tipo, alcance: d.alcance, expiraEm: d.expiraEm || null,
            segmentos: d.segmentos || [], turmas: (d.turmas || []).map(Number),
            fixado: m.el.querySelector('[name=fixado]').checked, exigeCiencia: m.el.querySelector('[name=exigeCiencia]').checked
          };
          if (!corpo.titulo || corpo.titulo.trim().length < 3) throw EG.erro('Informe o título.');
          if (!corpo.mensagem || corpo.mensagem.trim().length < 3) throw EG.erro('Escreva a mensagem.');
          if (corpo.alcance === 'segmentos' && !corpo.segmentos.length) throw EG.erro('Escolha pelo menos um segmento.');
          if (corpo.alcance === 'turmas' && !corpo.turmas.length) throw EG.erro('Escolha pelo menos uma turma.');
          const r = editando ? await EG.api('PUT', `/comunicados/${c.id}`, corpo) : await EG.api('POST', '/comunicados', corpo);
          m.fechar();
          await carregarLista(el);
          if (editando) EG.toast('Comunicado salvo');
          else { EG.toast('Comunicado publicado no portal'); await abrirDetalhe(el, r.id, 'whats'); }
        } }
      ]
    });

    const contar = () => { const t = m.el.querySelector('[name=mensagem]'); m.el.querySelector('[data-contador]').textContent = `${t.value.length}/5000 caracteres`; };
    contar();
    m.el.querySelector('[name=mensagem]').addEventListener('input', contar);
    m.el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-alcance]');
      if (b && !b.disabled) {
        m.el.querySelectorAll('[data-alcance]').forEach((x) => x.classList.toggle('ativo', x === b));
        m.el.querySelector('[name=alcance]').value = b.dataset.alcance;
        m.el.querySelectorAll('[data-bloco]').forEach((bl) => { bl.hidden = bl.dataset.bloco !== b.dataset.alcance; });
      }
      if (ev.target.closest('[data-marcar-turmas]')) {
        const caixas = [...m.el.querySelectorAll('[name=turmas]')];
        const todas = caixas.every((x) => x.checked);
        caixas.forEach((x) => { x.checked = !todas; });
      }
    });
  }

  /* ---------- Detalhe: mensagem · leitura · WhatsApp ---------- */
  function textoWhats(c) {
    return `📢 *${EG.estado.colegio.nome}*\n*${c.titulo}*${c.tipo === 'urgente' ? ' ⚠️' : ''}\n\n${c.mensagem}\n\n`
      + (c.exigeCiencia
        ? `✅ Por favor, confirme que está ciente no Portal do Responsável: ${location.origin}`
        : `Veja também no Portal do Responsável: ${location.origin}`);
  }

  async function abrirDetalhe(el, id, abaInicial) {
    const c = await EG.api('GET', `/comunicados/${id}`);
    let aba = c.podeEditar ? (abaInicial || 'msg') : 'msg';
    let filtroLeitura = 'todos';
    let soNaoLeram = true;
    const enviados = new Set();
    let texto = textoWhats(c);

    const m = EG.modal({
      titulo: c.titulo,
      largura: 780,
      corpo: '<div data-det></div>',
      botoes: [
        ...(c.podeEditar ? [{ texto: 'Editar', icone: 'ti-pencil', acao: () => { m.fechar(); modalForm(el, c); } }] : []),
        { texto: 'Fechar', classe: 'btn-primario', acao: () => m.fechar() }
      ]
    });
    const caixa = m.el.querySelector('[data-det]');

    function abaMensagem() {
      return `<div class="com-selos">${selos(c)}</div>
        <div class="com-meta">${meta(c)}</div>
        <div class="com-texto">${EG.esc(c.mensagem)}</div>`;
    }
    function abaLeitura() {
      const lista = c.leituras || [];
      if (!lista.length) {
        return `<div class="vazio"><i class="ti ti-users"></i>Nenhum responsável com acesso ao portal neste público ainda.<br>
          <small>Os responsáveis entram com o código PAI de cada aluno (ficha do aluno). Enquanto isso, use o WhatsApp.</small></div>`;
      }
      const leram = lista.filter((x) => x.lidoEm).length;
      const filtrada = lista.filter((x) => filtroLeitura === 'todos' || (filtroLeitura === 'leram' ? x.lidoEm : !x.lidoEm));
      return `<div class="filtros">
          ${[['todos', `Todos (${lista.length})`], ['nao', `Não leram (${lista.length - leram})`], ['leram', `Leram (${leram})`]]
            .map(([v, r]) => `<button class="chip ${filtroLeitura === v ? 'ativo' : ''}" data-filtro-leitura="${v}">${r}</button>`).join('')}
        </div>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Responsável</th><th>Aluno(s)</th><th>Leu em</th>${c.exigeCiencia ? '<th>Ciente em</th>' : ''}</tr></thead>
          <tbody>${filtrada.map((x) => `<tr><td>${EG.esc(x.nome)}<br><small>${EG.esc(x.email)}</small></td><td>${EG.esc(x.alunos.join(', '))}</td>
            <td>${x.lidoEm ? EG.dataHora(x.lidoEm) : '<span class="selo selo-aviso">Não leu</span>'}</td>
            ${c.exigeCiencia ? `<td>${x.cienteEm ? `<span class="com-ciente"><i class="ti ti-circle-check"></i> ${EG.dataHora(x.cienteEm)}</span>` : '—'}</td>` : ''}</tr>`).join('')
            || `<tr><td colspan="4"><div class="vazio">Ninguém nesta lista</div></td></tr>`}</tbody>
        </table></div>`;
    }
    function abaWhats() {
      const fams = (c.familias || []).filter((f) => !soNaoLeram || !f.lido);
      return `<div class="campo"><label>Mensagem</label><textarea class="textarea" rows="8" data-msg>${EG.esc(texto)}</textarea>
          <small>Você pode ajustar o texto antes de enviar.</small></div>
        <div class="com-acoes" style="margin:0 0 14px">
          <button class="btn btn-secundario btn-pequeno" data-copiar><i class="ti ti-copy"></i> Copiar para o grupo da turma</button>
          <label style="display:flex;gap:6px;align-items:center;font-size:13px;cursor:pointer"><input type="checkbox" data-so-nao-leram ${soNaoLeram ? 'checked' : ''}> Só quem ainda não leu no portal</label>
        </div>
        ${fams.length ? fams.map((f) => {
          const i = c.familias.indexOf(f);
          const sit = f.lido ? '<span class="selo selo-ok">Leu no portal</span>'
            : f.temPortal ? '<span class="selo selo-aviso">Não leu</span>' : '<span class="selo selo-neutro">Sem acesso ao portal</span>';
          return `<div class="familia"><div><strong>${EG.esc(f.nome || 'Responsável')}</strong> ${sit}<br>
              <small style="color:var(--muted)">${EG.esc(f.alunos.join(', '))} · ${EG.esc(f.telefone)}</small></div>
            <button class="btn ${enviados.has(i) ? 'btn-secundario' : 'btn-whats'} btn-pequeno" data-enviar="${i}"><i class="ti ${enviados.has(i) ? 'ti-check' : 'ti-brand-whatsapp'}"></i> ${enviados.has(i) ? 'Enviado' : 'Enviar'}</button></div>`;
        }).join('') : `<div class="vazio"><i class="ti ti-mood-happy"></i>${(c.familias || []).length ? 'Todas as famílias com telefone já leram no portal' : 'Nenhum telefone de responsável neste público'}</div>`}
        ${c.semTelefone ? `<p class="card-desc" style="margin:12px 0 0"><i class="ti ti-alert-circle"></i> ${c.semTelefone} aluno(s) do público sem telefone do responsável na ficha.</p>` : ''}`;
    }

    function desenhar() {
      const l = c.leitura;
      const abas = [['msg', 'Mensagem']];
      if (c.podeEditar) abas.push(['leitura', `Leitura (${l.lidos}/${l.destinatarios})`], ['whats', 'WhatsApp']);
      const msgAtual = caixa.querySelector('[data-msg]');
      if (msgAtual) texto = msgAtual.value;
      caixa.innerHTML = `${abas.length > 1 ? `<div class="abas">${abas.map(([v, r]) => `<button class="aba ${aba === v ? 'ativa' : ''}" data-aba="${v}">${r}</button>`).join('')}</div>` : ''}
        ${aba === 'leitura' ? abaLeitura() : aba === 'whats' ? abaWhats() : abaMensagem()}`;
    }
    desenhar();

    caixa.addEventListener('click', (ev) => {
      const t = ev.target;
      const bAba = t.closest('[data-aba]');
      if (bAba) { aba = bAba.dataset.aba; desenhar(); return; }
      const bF = t.closest('[data-filtro-leitura]');
      if (bF) { filtroLeitura = bF.dataset.filtroLeitura; desenhar(); return; }
      if (t.closest('[data-copiar]')) { EG.copiar(caixa.querySelector('[data-msg]').value, 'Mensagem copiada. Cole no grupo da turma.'); return; }
      const bE = t.closest('[data-enviar]');
      if (bE) {
        const i = Number(bE.dataset.enviar);
        EG.abrirWhatsApp(c.familias[i].telefone, caixa.querySelector('[data-msg]').value);
        enviados.add(i);
        desenhar();
      }
    });
    caixa.addEventListener('change', (ev) => {
      if (ev.target.matches('[data-so-nao-leram]')) { soNaoLeram = ev.target.checked; desenhar(); }
    });
  }

  /* ---------- Tela ---------- */
  EG.registrarModulo('comunicados', {
    async render(el) {
      EG.filtrosDaSessao(est, { tipo: '', situacao: 'ativos', busca: '' });
      opcoes = await EG.api('GET', '/comunicados/opcoes');
      el.innerHTML = `<div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-speakerphone"></i> Comunicados</div>
          <button class="btn btn-primario" data-action="novo"><i class="ti ti-plus"></i> Novo comunicado</button></div>
        <p class="card-desc">Aparecem no Portal do Responsável das famílias do público escolhido, e você acompanha quem leu.
          ${opcoes.restrito ? 'Como professor, você publica para as turmas em que leciona.' : ''}</p>
        <div class="filtros">
          <button class="chip ${!est.tipo ? 'ativo' : ''}" data-tipo="">Todos</button>
          ${Object.entries(TIPOS).map(([v, [r]]) => `<button class="chip ${est.tipo === v ? 'ativo' : ''}" data-tipo="${v}">${r}</button>`).join('')}
          <select class="select" data-situacao style="width:auto">
            ${[['ativos', 'No ar'], ['expirados', 'Expirados'], ['todos', 'Todos']].map(([v, r]) => `<option value="${v}" ${est.situacao === v ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
          <input class="input" data-busca placeholder="Buscar no título ou na mensagem" value="${EG.esc(est.busca)}" style="max-width:280px">
        </div>
        <div data-lista><div class="vazio"><div class="spinner pequeno" style="margin:0 auto"></div></div></div>
      </div>`;
      await carregarLista(el);

      let espera = null;
      el.oninput = (ev) => {
        if (!ev.target.matches('[data-busca]')) return;
        clearTimeout(espera);
        espera = setTimeout(() => { est.busca = ev.target.value.trim(); carregarLista(el).catch((e) => EG.toast(e.message, 'erro')); }, 300);
      };
      el.onchange = (ev) => {
        if (!ev.target.matches('[data-situacao]')) return;
        est.situacao = ev.target.value;
        carregarLista(el).catch((e) => EG.toast(e.message, 'erro'));
      };
      el.onclick = (ev) => {
        const chip = ev.target.closest('[data-tipo]');
        if (chip && el.contains(chip)) {
          est.tipo = chip.dataset.tipo;
          el.querySelectorAll('[data-tipo]').forEach((x) => x.classList.toggle('ativo', x === chip));
          carregarLista(el).catch((e) => EG.toast(e.message, 'erro'));
          return;
        }
        const b = ev.target.closest('[data-action]');
        if (!b || !el.contains(b)) return;
        const acao = b.dataset.action;
        if (acao === 'novo') { modalForm(el, null); return; }
        const card = b.closest('[data-id]');
        const c = card && itens.find((x) => x.id === Number(card.dataset.id));
        if (!c) return;
        EG.guarda(b, async () => {
          try {
            if (acao === 'ver') await abrirDetalhe(el, c.id, 'msg');
            else if (acao === 'whats') await abrirDetalhe(el, c.id, 'whats');
            else if (acao === 'editar') modalForm(el, c);
            else if (acao === 'excluir') {
              const ok = await EG.confirmar(`Excluir o comunicado "${c.titulo}"?\n\nEle sai do portal das famílias e as leituras registradas são apagadas.`,
                { titulo: 'Excluir comunicado', textoOk: 'Excluir', perigo: true });
              if (!ok) return;
              await EG.api('DELETE', `/comunicados/${c.id}`);
              EG.toast('Comunicado excluído');
              await carregarLista(el);
            }
          } catch (e) { EG.toast(e.message, 'erro'); }
        });
      };
    }
  });
})(window.EG);
