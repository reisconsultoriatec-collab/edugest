/* =====================================================================
 *  EduGest — Contas a Pagar
 *  Pagamento de conta recorrente já lança a próxima.
 * ===================================================================== */
'use strict';
(function (EG) {
  const SIT = { a_vencer: ['A vencer', 'selo-info'], vencida: ['Vencida', 'selo-erro'], paga: ['Paga', 'selo-ok'], cancelada: ['Cancelada', 'selo-neutro'] };
  const RECORRENCIA = { nenhuma: 'Não se repete', mensal: 'Mensal', trimestral: 'Trimestral', anual: 'Anual' };
  let dados = null;
  const filtro = {};

  async function carregar() {
    const q = new URLSearchParams();
    if (filtro.mes) q.set('mes', filtro.mes);
    if (filtro.categoria) q.set('categoria', filtro.categoria);
    if (filtro.busca) q.set('busca', filtro.busca);
    dados = await EG.api('GET', '/contas?' + q.toString());
  }

  function opcoesMes() {
    const atual = EG.mesAtualSP();
    const [a, m] = atual.split('-').map(Number);
    const meses = [];
    for (let i = -6; i <= 6; i++) {
      const t = a * 12 + (m - 1) + i;
      meses.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`);
    }
    if (filtro.mes && !meses.includes(filtro.mes)) meses.push(filtro.mes);
    return '<option value="">Todos os meses</option>' + meses.sort().reverse()
      .map((x) => `<option value="${x}" ${x === filtro.mes ? 'selected' : ''}>${EG.nomeRef(x)}${x === atual ? ' (atual)' : ''}</option>`).join('');
  }

  function render(el) {
    const r = dados.resumo;
    const qtd = (k) => (k ? (r.quantidade[k] || 0) : dados.itens.length);
    const lista = dados.itens.filter((c) => !filtro.status || c.situacao === filtro.status);
    el.innerHTML = `
      <div class="grade-kpi">
        ${kpi('ti-clock', 'var(--info-bg)', 'var(--info)', 'A pagar', EG.moeda(r.aPagar), `${qtd('a_vencer')} conta(s) a vencer`)}
        ${kpi('ti-alert-triangle', 'var(--erro-bg)', 'var(--erro)', 'Vencidas', EG.moeda(r.vencidas), `${qtd('vencida')} conta(s) em atraso`)}
        ${kpi('ti-circle-check', 'var(--ok-bg)', 'var(--ok)', 'Pagas', EG.moeda(r.pagas), `${qtd('paga')} conta(s) paga(s)`)}
      </div>
      <div class="card">
        <div class="card-cab">
          <div class="card-titulo"><i class="ti ti-file-invoice"></i> Contas a pagar</div>
          <div class="acoes-topo"><button class="btn btn-primario" data-action="nova"><i class="ti ti-plus"></i> Nova conta</button></div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
          <select class="select" data-filtro="mes" style="width:auto;min-width:170px">${opcoesMes()}</select>
          <select class="select" data-filtro="categoria" style="width:auto;min-width:170px"><option value="">Todas as categorias</option>
            ${dados.categorias.map((c) => `<option ${c === filtro.categoria ? 'selected' : ''}>${EG.esc(c)}</option>`).join('')}</select>
          <input class="input" data-filtro="busca" placeholder="Buscar descrição ou fornecedor..." value="${EG.esc(filtro.busca)}" style="flex:1;min-width:200px">
        </div>
        <div class="filtros">${[['', 'Todas'], ['a_vencer', 'A vencer'], ['vencida', 'Vencidas'], ['paga', 'Pagas']]
          .map(([k, rot]) => `<button class="chip ${filtro.status === k ? 'ativo' : ''}" data-action="status" data-status="${k}">${rot} (${qtd(k)})</button>`).join('')}</div>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Descrição</th><th>Categoria</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th></th></tr></thead>
          <tbody>${lista.map((c) => {
            const s = SIT[c.situacao] || SIT.a_vencer;
            const aberta = c.situacao === 'a_vencer' || c.situacao === 'vencida';
            return `<tr data-id="${c.id}">
              <td><strong>${EG.esc(c.descricao)}</strong>${c.recorrencia !== 'nenhuma' ? ` <i class="ti ti-repeat" title="${RECORRENCIA[c.recorrencia]}" style="color:var(--muted)"></i>` : ''}
                ${c.fornecedor ? `<br><small>${EG.esc(c.fornecedor)}</small>` : ''}</td>
              <td><span class="selo selo-neutro">${EG.esc(c.categoria)}</span></td>
              <td style="white-space:nowrap">${EG.data(c.vencimento)}${c.situacao === 'vencida' ? `<br><small class="sub">há ${c.diasAtraso} dia(s)</small>` : ''}</td>
              <td style="white-space:nowrap"><strong>${EG.moeda(c.valor)}</strong></td>
              <td><span class="selo ${s[1]}">${s[0]}</span>${c.situacao === 'paga' ? `<br><small class="sub">em ${EG.data(c.dataPagamento)}</small>` : ''}</td>
              <td class="acoes">${aberta ? '<button class="btn btn-primario btn-pequeno" data-action="pagar"><i class="ti ti-check"></i> Pagar</button>'
                : c.situacao === 'paga' ? '<button class="btn btn-secundario btn-pequeno" data-action="estornar"><i class="ti ti-arrow-back-up"></i> Estornar</button>' : ''}
                <button class="btn-icone" data-action="editar" title="Editar"><i class="ti ti-edit"></i></button>
                <button class="btn-icone perigo" data-action="excluir" title="Excluir"><i class="ti ti-trash"></i></button></td>
            </tr>`;
          }).join('') || `<tr><td colspan="6"><div class="vazio"><i class="ti ti-file-invoice"></i>${dados.itens.length ? 'Nenhuma conta nesta situação' : 'Nenhuma conta neste período'}</div></td></tr>`}</tbody>
        </table></div>
      </div>`;
  }

  function kpi(icone, fundo, cor, rotulo, valor, obs) {
    return `<div class="kpi"><div class="kpi-icone" style="background:${fundo};color:${cor}"><i class="ti ${icone}"></i></div>
      <div><div class="kpi-rotulo">${rotulo}</div><div class="kpi-valor" style="font-size:20px">${valor}</div><div class="kpi-obs">${EG.esc(obs)}</div></div></div>`;
  }

  function modalConta(c, el) {
    const nova = !c;
    c = c || { categoria: 'Outros', recorrencia: 'nenhuma', vencimento: EG.hojeSP() };
    const cats = dados.categorias.includes(c.categoria) ? dados.categorias : [c.categoria, ...dados.categorias];
    const m = EG.modal({
      titulo: nova ? 'Nova conta a pagar' : 'Editar conta',
      largura: 560,
      corpo: `
        <div class="campo"><label>Descrição *</label><input class="input" name="descricao" maxlength="150" value="${EG.esc(c.descricao)}" placeholder="Ex.: Conta de energia"></div>
        <div class="linha-2">
          <div class="campo"><label>Categoria</label><select class="select" name="categoria">${EG.opcoes(cats.map((x) => ({ value: x, label: x })), c.categoria)}</select></div>
          <div class="campo"><label>Fornecedor</label><input class="input" name="fornecedor" maxlength="100" value="${EG.esc(c.fornecedor)}"></div>
        </div>
        <div class="linha-3">
          <div class="campo"><label>Valor (R$) *</label><input class="input" name="valor" inputmode="decimal" value="${EG.valorCampo(c.valor)}"></div>
          <div class="campo"><label>Vencimento *</label><input class="input" type="date" name="vencimento" value="${EG.esc(c.vencimento)}"></div>
          <div class="campo"><label>Repetição</label><select class="select" name="recorrencia">${EG.opcoes(Object.entries(RECORRENCIA).map(([k, r]) => ({ value: k, label: r })), c.recorrencia)}</select></div>
        </div>
        <div class="campo"><label>Observações</label><input class="input" name="obs" maxlength="500" value="${EG.esc(c.obs)}"></div>
        <div class="msg-info" style="margin:0">Conta que se repete: ao registrar o pagamento, a próxima já é lançada automaticamente.</div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Salvar', classe: 'btn-primario', icone: 'ti-device-floppy', acao: async () => {
          const d = EG.lerForm(m.el);
          d.valor = EG.lerDinheiro(d.valor);
          if (!d.valor) throw EG.erro('Informe um valor válido.');
          if (nova) await EG.api('POST', '/contas', d); else await EG.api('PUT', `/contas/${c.id}`, d);
          m.fechar(); EG.toast(nova ? 'Conta cadastrada' : 'Conta atualizada');
          await carregar(); render(el);
        } }
      ]
    });
  }

  function modalPagar(c, el) {
    const m = EG.modal({
      titulo: 'Pagar conta',
      largura: 440,
      corpo: `
        <div class="codigo-box" style="margin-bottom:14px"><div><strong>${EG.esc(c.descricao)}</strong><br>
          <span class="sub">${EG.moeda(c.valor)} · vencimento ${EG.data(c.vencimento)}</span></div></div>
        <div class="campo"><label>Data do pagamento</label><input class="input" type="date" name="dataPagamento" max="${EG.hojeSP()}" value="${EG.hojeSP()}"></div>
        ${c.recorrencia !== 'nenhuma' ? `<div class="msg-info" style="margin:0"><i class="ti ti-repeat"></i> Conta ${RECORRENCIA[c.recorrencia].toLowerCase()}: a próxima será lançada automaticamente.</div>` : ''}`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Confirmar pagamento', classe: 'btn-primario', icone: 'ti-check', acao: async () => {
          const r = await EG.api('POST', `/contas/${c.id}/pagar`, EG.lerForm(m.el));
          m.fechar();
          EG.toast(r.proxima ? `Conta paga · próxima lançada para ${EG.data(r.proxima.vencimento)}` : 'Conta paga');
          await carregar(); render(el);
        } }
      ]
    });
  }

  EG.registrarModulo('contas', {
    async render(el) {
      EG.filtrosDaSessao(filtro, { mes: EG.mesAtualSP(), categoria: '', busca: '', status: '' });
      await carregar();
      render(el);
      el.onclick = async (ev) => {
        const b = ev.target.closest('[data-action]');
        if (!b || !el.contains(b)) return;
        const tr = b.closest('[data-id]');
        const c = tr ? dados.itens.find((x) => x.id === Number(tr.dataset.id)) : null;
        try {
          switch (b.dataset.action) {
            case 'nova': modalConta(null, el); break;
            case 'editar': modalConta(c, el); break;
            case 'pagar': modalPagar(c, el); break;
            case 'status': filtro.status = b.dataset.status; render(el); break;
            case 'estornar':
              if (!(await EG.confirmar(`Estornar o pagamento de "${c.descricao}"?\n\nA conta volta a ficar em aberto.`, { textoOk: 'Estornar' }))) return;
              await EG.api('POST', `/contas/${c.id}/estornar`); EG.toast('Pagamento estornado');
              await carregar(); render(el); break;
            case 'excluir':
              if (!(await EG.confirmar(`Excluir a conta "${c.descricao}" (${EG.moeda(c.valor)})?${c.situacao === 'paga' ? '\n\nEsta conta já foi paga: a exclusão altera o fluxo de caixa.' : ''}`, { perigo: true, textoOk: 'Excluir' }))) return;
              await EG.api('DELETE', `/contas/${c.id}`); EG.toast('Conta excluída');
              await carregar(); render(el); break;
            default: break;
          }
        } catch (e) { EG.toast(e.message, 'erro'); }
      };
      el.onchange = async (ev) => {
        const f = ev.target.dataset.filtro;
        if (f !== 'mes' && f !== 'categoria') return;
        filtro[f] = ev.target.value;
        try { await carregar(); render(el); } catch (e) { EG.toast(e.message, 'erro'); }
      };
      let espera = null;
      el.oninput = (ev) => {
        if (!ev.target.matches('[data-filtro="busca"]')) return;
        clearTimeout(espera);
        espera = setTimeout(async () => {
          filtro.busca = ev.target.value.trim();
          try {
            await carregar(); render(el);
            const x = EG.$('[data-filtro="busca"]', el); x.focus(); x.setSelectionRange(x.value.length, x.value.length);
          } catch (e) { EG.toast(e.message, 'erro'); }
        }, 350);
      };
    }
  });
})(window.EG);
