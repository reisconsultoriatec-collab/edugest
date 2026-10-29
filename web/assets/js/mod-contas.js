/* =====================================================================
 *  EduGest — Contas a Pagar
 *  Pagamento de conta recorrente já lança a próxima.
 *  Categorias: cada colégio cadastra e renomeia as suas (botão Categorias
 *  e "+ Nova" na janela da conta). Renomear leva junto as contas.
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
          <div class="acoes-topo"><button class="btn btn-secundario" data-action="categorias"><i class="ti ti-tags"></i> Categorias</button>
            <button class="btn btn-primario" data-action="nova"><i class="ti ti-plus"></i> Nova conta</button></div>
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
          <div class="campo"><label class="rotulo-com-acao">Categoria <button type="button" class="link-sutil" data-nova-categoria><i class="ti ti-plus"></i> Nova</button></label>
            <select class="select" name="categoria">${EG.opcoes(cats.map((x) => ({ value: x, label: x })), c.categoria)}</select>
            <div class="cat-nova" data-cat-nova hidden><input class="input" maxlength="40" placeholder="Nome da nova categoria" data-cat-nome>
              <button type="button" class="btn btn-primario btn-pequeno" data-cat-criar><i class="ti ti-check"></i> Criar</button>
              <button type="button" class="btn-icone" data-cat-cancelar title="Cancelar" aria-label="Cancelar"><i class="ti ti-x"></i></button></div></div>
          <div class="campo"><label>Fornecedor</label><input class="input" name="fornecedor" maxlength="100" value="${EG.esc(c.fornecedor)}"></div>
        </div>
        <div class="linha-3">
          <div class="campo"><label>Valor (R$) *</label><input class="input" name="valor" inputmode="decimal" value="${EG.valorCampo(c.valor)}"></div>
          <div class="campo"><label>Vencimento *</label><input class="input" type="date" name="vencimento" value="${EG.esc(c.vencimento)}"></div>
          <div class="campo"><label>Repetição</label><select class="select" name="recorrencia">${EG.opcoes(Object.entries(RECORRENCIA).map(([k, r]) => ({ value: k, label: r })), c.recorrencia)}</select></div>
        </div>
        <div class="campo"><label>Observações</label><input class="input" name="obs" maxlength="500" value="${EG.esc(c.obs)}"></div>
        <div class="msg-info" style="margin:0">Conta que se repete: ao registrar o pagamento, a próxima já é lançada automaticamente.</div>`,
      aoFechar: () => { if (criouCategoria) { carregar().then(() => render(el)).catch(() => {}); } },
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
    // "+ Nova" categoria sem sair da conta
    let criouCategoria = false;
    const caixa = m.el.querySelector('[data-cat-nova]'); const nome = m.el.querySelector('[data-cat-nome]'); const sel = m.el.querySelector('[name="categoria"]');
    const abrir = (sim) => { caixa.hidden = !sim; if (sim) { nome.value = ''; nome.focus(); } };
    const criar = async () => {
      const btn = m.el.querySelector('[data-cat-criar]');
      await EG.guarda(btn, async () => {
        m.erro('');
        try {
          const nova = await EG.api('POST', '/contas/categorias', { nome: nome.value });
          criouCategoria = true;
          dados.categorias = [...dados.categorias.filter((x) => x !== 'Outros'), nova.nome].sort((a, b) => a.localeCompare(b, 'pt-BR')).concat(dados.categorias.includes('Outros') ? ['Outros'] : []);
          const atual = sel.value;
          sel.innerHTML = EG.opcoes([...new Set([atual, ...dados.categorias])].filter(Boolean).map((x) => ({ value: x, label: x })), nova.nome);
          abrir(false); EG.toast(`Categoria "${nova.nome}" criada`);
        } catch (e) { m.erro(e.message); nome.focus(); }
      });
    };
    m.el.querySelector('[data-nova-categoria]').addEventListener('click', () => abrir(caixa.hidden));
    m.el.querySelector('[data-cat-cancelar]').addEventListener('click', () => abrir(false));
    m.el.querySelector('[data-cat-criar]').addEventListener('click', criar);
    nome.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); criar(); }
      if (ev.key === 'Escape') { ev.stopPropagation(); abrir(false); }
    });
  }

  /* ---------------- Categorias: cadastrar, renomear e excluir ---------------- */
  function modalCategorias(el) {
    let lista = []; let editando = null; let excluindo = null; let mudou = false;
    const renomeadas = {};
    const m = EG.modal({
      titulo: 'Categorias das contas',
      largura: 560,
      corpo: `<p class="sub" style="margin:0 0 12px">As categorias aparecem na conta, nos filtros, nos relatórios e no fluxo de caixa.
          Renomear muda também as contas que já usam a categoria.</p>
        <div class="cat-add"><input class="input" maxlength="40" placeholder="Nova categoria (ex.: Uniformes)" data-cat-add-nome>
          <button class="btn btn-primario" data-cat-acao="adicionar"><i class="ti ti-plus"></i> Adicionar</button></div>
        <div class="cat-lista" data-cat-lista><div class="sub" style="padding:12px 0">Carregando...</div></div>`,
      aoFechar: () => {
        if (!mudou) return;
        if (filtro.categoria && renomeadas[filtro.categoria]) filtro.categoria = renomeadas[filtro.categoria];
        carregar().then(() => {
          if (filtro.categoria && !dados.categorias.includes(filtro.categoria)) { filtro.categoria = ''; return carregar(); }
          return null;
        }).then(() => render(el)).catch((e) => EG.toast(e.message, 'erro'));
      }
    });
    const caixa = m.el.querySelector('[data-cat-lista]'); const campoNovo = m.el.querySelector('[data-cat-add-nome]');
    const usoTexto = (n) => (n ? `${n} conta${n === 1 ? '' : 's'}` : 'sem contas');
    function desenhar() {
      caixa.innerHTML = lista.map((c) => {
        if (editando === c.id) {
          return `<div class="cat-linha editando" data-cat-id="${c.id}">
            <input class="input" maxlength="40" value="${EG.esc(c.nome)}" data-cat-renomear aria-label="Novo nome de ${EG.esc(c.nome)}">
            <button class="btn btn-primario btn-pequeno" data-cat-acao="salvar"><i class="ti ti-check"></i> Salvar</button>
            <button class="btn-icone" data-cat-acao="cancelar" title="Cancelar" aria-label="Cancelar"><i class="ti ti-x"></i></button>
            ${c.contas ? `<small class="cat-aviso">${c.contas === 1 ? 'A conta desta categoria passa' : `As ${c.contas} contas desta categoria passam`} a usar o novo nome.</small>` : ''}</div>`;
        }
        if (excluindo === c.id) {
          return `<div class="cat-linha confirmando" data-cat-id="${c.id}"><span>Excluir <strong>${EG.esc(c.nome)}</strong>?</span>
            <button class="btn btn-perigo btn-pequeno" data-cat-acao="confirmar-exclusao"><i class="ti ti-trash"></i> Excluir</button>
            <button class="btn btn-secundario btn-pequeno" data-cat-acao="cancelar">Cancelar</button></div>`;
        }
        const podeExcluir = !c.fixa && !c.contas;
        return `<div class="cat-linha" data-cat-id="${c.id}">
          <span class="cat-nome">${EG.esc(c.nome)}${c.fixa ? ' <span class="selo selo-neutro" title="Usada quando nenhuma categoria é escolhida">fixa</span>' : ''}</span>
          <span class="cat-uso">${usoTexto(c.contas)}</span>
          ${c.fixa ? '<span class="cat-acoes"></span>' : `<span class="cat-acoes">
            <button class="btn-icone" data-cat-acao="editar" title="Renomear" aria-label="Renomear ${EG.esc(c.nome)}"><i class="ti ti-pencil"></i></button>
            <button class="btn-icone perigo" data-cat-acao="excluir" ${podeExcluir ? '' : 'disabled'}
              title="${podeExcluir ? 'Excluir' : `Em uso em ${usoTexto(c.contas)}: para excluir, mude a categoria dessas contas ou renomeie`}" aria-label="Excluir ${EG.esc(c.nome)}"><i class="ti ti-trash"></i></button></span>`}
        </div>`;
      }).join('');
      const inp = caixa.querySelector('[data-cat-renomear]');
      if (inp) { inp.focus(); inp.select(); }
    }
    async function recarregar() { lista = (await EG.api('GET', '/contas/categorias')).categorias; desenhar(); }
    async function adicionar(btn) {
      await EG.guarda(btn, async () => {
        m.erro('');
        try {
          const c = await EG.api('POST', '/contas/categorias', { nome: campoNovo.value });
          mudou = true; campoNovo.value = ''; EG.toast(`Categoria "${c.nome}" criada`);
          await recarregar(); campoNovo.focus();
        } catch (e) { m.erro(e.message); campoNovo.focus(); }
      });
    }
    async function salvar(btn, id) {
      const c = lista.find((x) => x.id === id); const novo = caixa.querySelector('[data-cat-renomear]').value;
      await EG.guarda(btn, async () => {
        m.erro('');
        try {
          const r = await EG.api('PUT', `/contas/categorias/${id}`, { nome: novo });
          mudou = true; renomeadas[c.nome] = r.nome; editando = null;
          EG.toast(r.antes === r.nome ? 'Nada mudou' : `Categoria renomeada para "${r.nome}"${r.contas ? ` · ${r.contas} conta(s) atualizada(s)` : ''}`);
          await recarregar();
        } catch (e) { m.erro(e.message); }
      });
    }
    m.el.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-cat-acao]'); if (!b || b.disabled) return;
      const linha = b.closest('[data-cat-id]'); const id = linha ? Number(linha.dataset.catId) : null;
      const acao = b.dataset.catAcao;
      if (acao === 'adicionar') return adicionar(b);
      if (acao === 'editar') { editando = id; excluindo = null; m.erro(''); return desenhar(); }
      if (acao === 'excluir') { excluindo = id; editando = null; m.erro(''); return desenhar(); }
      if (acao === 'cancelar') { editando = null; excluindo = null; return desenhar(); }
      if (acao === 'salvar') return salvar(b, id);
      if (acao === 'confirmar-exclusao') {
        const c = lista.find((x) => x.id === id);
        return EG.guarda(b, async () => {
          try {
            await EG.api('DELETE', `/contas/categorias/${id}`);
            mudou = true; excluindo = null; EG.toast(`Categoria "${c.nome}" excluída`); await recarregar();
          } catch (e) { m.erro(e.message); excluindo = null; desenhar(); }
        });
      }
      return null;
    });
    m.el.addEventListener('keydown', (ev) => {
      if (ev.target === campoNovo && ev.key === 'Enter') { ev.preventDefault(); adicionar(m.el.querySelector('[data-cat-acao="adicionar"]')); }
      if (ev.target.matches('[data-cat-renomear]')) {
        if (ev.key === 'Enter') { ev.preventDefault(); salvar(caixa.querySelector('[data-cat-acao="salvar"]'), editando); }
        if (ev.key === 'Escape') { ev.stopPropagation(); editando = null; desenhar(); }
      }
    });
    recarregar().catch((e) => m.erro(e.message));
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
            case 'categorias': modalCategorias(el); break;
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
