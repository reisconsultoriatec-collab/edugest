/* =====================================================================
 *  EduGest — Conciliação bancária
 *  Importa o extrato (OFX/CSV), sugere o vínculo de cada lançamento com
 *  mensalidades e contas a pagar e concilia: automático (só confiança
 *  alta), aceitando a sugestão, à mão ou em lote. Desfazer reverte tudo
 *  o que a conciliação fez.
 * ===================================================================== */
'use strict';
(function (EG) {
  const ABAS = [['pendentes', 'Pendentes', 'ti-clock'], ['conciliados', 'Conciliados', 'ti-circle-check'],
    ['importacoes', 'Importações', 'ti-file-import'], ['resumo', 'Resumo', 'ti-chart-bar']];
  const TIPOS_CONTA = { corrente: 'Conta corrente', poupanca: 'Poupança', pagamento: 'Conta de pagamento' };
  const ACAO = {
    baixou: ['baixa feita pela conciliação', 'selo-info'],
    nenhuma: ['já estava baixada', 'selo-neutro'],
    criou: ['conta criada pela conciliação', 'selo-roxo']
  };
  const estado = {};
  let contas = [];
  let dados = null;
  const selecionados = new Set();

  const valor = (l) => `<span class="${l.tipo === 'credito' ? 'valor-credito' : 'valor-debito'}">${l.tipo === 'credito' ? '+' : '−'} ${EG.moeda(l.valor)}</span>`;
  const selo = (c) => (c === 'alta' ? '<span class="selo selo-ok">Alta</span>' : c === 'media' ? '<span class="selo selo-aviso">Média</span>' : '');
  const contaAtual = () => contas.find((c) => c.id === Number(estado.contaId)) || null;

  /* ---------- Carregar ---------- */
  async function carregarContas() { contas = await EG.api('GET', '/conciliacao/contas-banco'); }

  async function carregar() {
    const q = new URLSearchParams();
    if (estado.contaId) q.set('contaBancoId', estado.contaId);
    if (estado.aba === 'pendentes' || estado.aba === 'conciliados') {
      q.set('status', estado.aba === 'pendentes' ? 'pendente' : 'conciliado');
      if (estado.tipo) q.set('tipo', estado.tipo);
      if (estado.busca) q.set('busca', estado.busca);
      if (estado.aba === 'conciliados' && estado.mes) q.set('mes', estado.mes);
      dados = await EG.api('GET', '/conciliacao/lancamentos?' + q);
    } else if (estado.aba === 'importacoes') {
      dados = { itens: await EG.api('GET', '/conciliacao/importacoes?' + q) };
    } else {
      q.set('ano', estado.ano);
      dados = await EG.api('GET', '/conciliacao/resumo?' + q);
    }
    selecionados.clear();
  }

  /* ---------- Tela ---------- */
  function render(el) {
    if (!contas.length) {
      el.innerHTML = `<div class="card em-breve"><i class="ti ti-building-bank"></i><h2>Conciliação bancária</h2>
        <p>Cadastre a conta bancária do colégio para importar o extrato (OFX ou CSV) e conciliar com as mensalidades e as contas a pagar.</p>
        <button class="btn btn-primario" data-action="nova-conta" style="margin-top:16px"><i class="ti ti-plus"></i> Cadastrar conta bancária</button></div>`;
      return;
    }
    const ca = contaAtual();
    const lista = estado.contaId ? [ca] : contas.filter((c) => c.ativo);
    const pendentes = lista.reduce((s, c) => s + c.pendentes, 0);
    const total = lista.reduce((s, c) => s + c.lancamentos, 0);
    const comSaldo = lista.filter((c) => c.saldoBanco);
    const saldo = comSaldo.reduce((s, c) => s + Math.round(c.saldoBanco.valor * 100), 0) / 100;
    const ate = lista.map((c) => c.extratoAte).filter(Boolean).sort().pop();
    el.innerHTML = `
      <div class="card">
        <div class="card-cab">
          <div class="card-titulo"><i class="ti ti-building-bank"></i> Conciliação bancária</div>
          <div class="acoes-topo">
            <button class="btn btn-secundario" data-action="contas"><i class="ti ti-settings"></i> Contas bancárias</button>
            <button class="btn btn-primario" data-action="importar"><i class="ti ti-file-import"></i> Importar extrato</button>
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <select class="select" data-filtro="conta" style="width:auto;min-width:220px">
            <option value="">Todas as contas ativas</option>
            ${contas.map((c) => `<option value="${c.id}" ${Number(estado.contaId) === c.id ? 'selected' : ''}>${EG.esc(c.nome)}${c.ativo ? '' : ' (desativada)'}</option>`).join('')}
          </select>
          <span class="sub">${ate ? `Extrato importado até ${EG.data(ate)}` : 'Nenhum extrato importado ainda'}</span>
        </div>
      </div>
      <div class="grade-kpi">
        ${kpi('ti-clock', 'var(--aviso-bg)', 'var(--aviso-tx)', 'Pendentes', pendentes, 'lançamentos a conciliar')}
        ${kpi('ti-wand', 'var(--info-bg)', 'var(--info)', 'Prontos para conciliar', estado.aba === 'pendentes' && dados.resumo ? dados.resumo.automaticas : '—', 'sugestões de confiança alta')}
        ${kpi('ti-circle-check', 'var(--ok-bg)', 'var(--ok)', 'Conciliados', total - pendentes, total ? `${Math.round(((total - pendentes) / total) * 100)}% do extrato` : 'nenhum lançamento')}
        ${kpi('ti-wallet', 'var(--roxo-bg)', 'var(--roxo)', 'Saldo no banco', comSaldo.length ? EG.moeda(saldo) : '—',
          comSaldo.length ? `segundo o último extrato${comSaldo.length < lista.length ? ' (algumas contas sem saldo)' : ''}`
            : (ate ? 'o extrato em CSV não informa saldo' : 'importe o extrato (OFX traz o saldo)'))}
      </div>
      <div class="card">
        <div class="filtros" style="margin-bottom:14px">${ABAS.map(([id, rot, ic]) => `<button class="chip ${estado.aba === id ? 'ativo' : ''}" data-action="aba" data-aba="${id}"><i class="ti ${ic}"></i> ${rot}${id === 'pendentes' ? ` (${pendentes})` : ''}</button>`).join('')}</div>
        ${({ pendentes: abaPendentes, conciliados: abaConciliados, importacoes: abaImportacoes, resumo: abaResumo })[estado.aba]()}
      </div>`;
  }

  function kpi(icone, fundo, cor, rotulo, v, obs) {
    return `<div class="kpi"><div class="kpi-icone" style="background:${fundo};color:${cor}"><i class="ti ${icone}"></i></div>
      <div><div class="kpi-rotulo">${rotulo}</div><div class="kpi-valor" style="font-size:20px">${v}</div><div class="kpi-obs">${EG.esc(obs)}</div></div></div>`;
  }

  const filtrosLista = (extra = '') => `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
      <select class="select" data-filtro="tipo" style="width:auto"><option value="">Créditos e débitos</option>
        <option value="credito" ${estado.tipo === 'credito' ? 'selected' : ''}>Só créditos (entradas)</option>
        <option value="debito" ${estado.tipo === 'debito' ? 'selected' : ''}>Só débitos (saídas)</option></select>
      ${extra}
      <input class="input" data-filtro="busca" placeholder="Buscar no histórico do extrato..." value="${EG.esc(estado.busca)}" style="flex:1;min-width:200px">
      <button class="btn btn-secundario" data-action="csv"><i class="ti ti-file-spreadsheet"></i> CSV</button>
    </div>`;

  function abaPendentes() {
    const itens = dados.itens;
    const autos = dados.resumo.automaticas;
    return `
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        <p class="card-desc" style="margin:0;flex:1;min-width:240px">Mensalidade em aberto vinculada recebe a baixa com a data e o valor do extrato. Valor igual sozinho nunca é conciliado automaticamente.</p>
        <button class="btn btn-primario" data-action="automatica" ${autos ? '' : 'disabled'}><i class="ti ti-wand"></i> Conciliar automaticamente${autos ? ` (${autos})` : ''}</button>
      </div>
      ${filtrosLista()}
      <div class="barra-lote" data-lote hidden>
        <strong data-qtd-sel>0 selecionado(s)</strong>
        <button class="btn btn-secundario btn-pequeno" data-action="lote-sugestoes"><i class="ti ti-checks"></i> Aceitar sugestões</button>
        <select class="select" data-lote-categoria style="width:auto"><option value="">Classificar como...</option>
          <optgroup label="Créditos">${dados.categorias.credito.map((c) => `<option>${EG.esc(c)}</option>`).join('')}</optgroup>
          <optgroup label="Débitos">${dados.categorias.debito.map((c) => `<option>${EG.esc(c)}</option>`).join('')}</optgroup></select>
        <button class="btn btn-secundario btn-pequeno" data-action="lote-manual"><i class="ti ti-tag"></i> Aplicar</button>
        <button class="btn btn-secundario btn-pequeno perigo" data-action="lote-excluir"><i class="ti ti-trash"></i> Excluir</button>
      </div>
      <div class="tabela-wrap"><table>
        <thead><tr><th style="width:28px"><input type="checkbox" data-sel-todos aria-label="Selecionar todos"></th><th>Data</th><th>Histórico do extrato</th><th class="num">Valor</th><th>Sugestão</th><th></th></tr></thead>
        <tbody>${itens.map((l) => {
          const s = (l.sugestoes || []).find((x) => x.confianca !== 'baixa');
          return `<tr data-id="${l.id}">
            <td><input type="checkbox" data-sel value="${l.id}"></td>
            <td style="white-space:nowrap">${EG.data(l.data)}</td>
            <td>${EG.esc(l.descricao)}${estado.contaId ? '' : `<br><small class="sub">${EG.esc(l.conta)}</small>`}</td>
            <td class="num">${valor(l)}</td>
            <td>${s ? `<div class="sugestao">${selo(s.confianca)} <strong>${EG.esc(s.rotulo)}</strong>
                <small class="sub">${EG.esc(s.detalhe)}${s.tipo !== 'manual' ? ` · ${EG.moeda(s.valor)}` : ''}</small></div>`
              : '<span class="sub">Sem sugestão</span>'}</td>
            <td class="acoes">${s ? `<button class="btn btn-primario btn-pequeno" data-action="aceitar" title="Conciliar com a sugestão"><i class="ti ti-check"></i> Aceitar</button>` : ''}
              <button class="btn btn-secundario btn-pequeno" data-action="vincular"><i class="ti ti-link"></i> Vincular</button>
              <button class="btn-icone perigo" data-action="excluir" title="Excluir lançamento"><i class="ti ti-trash"></i></button></td>
          </tr>`;
        }).join('') || `<tr><td colspan="6"><div class="vazio"><i class="ti ti-mood-happy"></i>${estado.busca || estado.tipo ? 'Nenhum lançamento pendente com esse filtro' : 'Nenhum lançamento pendente. Importe o extrato para conciliar.'}</div></td></tr>`}</tbody>
      </table></div>`;
  }

  function abaConciliados() {
    return `
      ${filtrosLista(`<input class="input" type="month" data-filtro="mes" value="${EG.esc(estado.mes)}" style="width:auto" title="Mês do extrato">`)}
      <div class="tabela-wrap"><table>
        <thead><tr><th>Data</th><th>Histórico do extrato</th><th class="num">Valor</th><th>Vinculado a</th><th>Conciliado</th><th></th></tr></thead>
        <tbody>${dados.itens.map((l) => {
          const v = l.vinculo;
          const a = ACAO[v.acao] || ACAO.nenhuma;
          return `<tr data-id="${l.id}">
            <td style="white-space:nowrap">${EG.data(l.data)}</td>
            <td>${EG.esc(l.descricao)}${estado.contaId ? '' : `<br><small class="sub">${EG.esc(l.conta)}</small>`}</td>
            <td class="num">${valor(l)}</td>
            <td><strong>${EG.esc(v.rotulo || '—')}</strong>
              <br><small class="sub">${v.tipo === 'mensalidade' ? 'Mensalidade' : v.tipo === 'conta' ? `Conta a pagar${v.categoria ? ' · ' + EG.esc(v.categoria) : ''}` : 'Classificado (sem vínculo)'}${v.obs ? ' · ' + EG.esc(v.obs) : ''}</small>
              ${v.tipo !== 'manual' ? `<br><span class="selo ${a[1]}">${a[0]}</span>` : ''}</td>
            <td><small>${EG.esc(v.por || '—')}<br><span class="sub">${v.em ? EG.dataHora(v.em) : ''}</span></small></td>
            <td class="acoes"><button class="btn btn-secundario btn-pequeno" data-action="desfazer" title="Volta o lançamento para pendente e reverte o que a conciliação fez"><i class="ti ti-arrow-back-up"></i> Desfazer</button></td>
          </tr>`;
        }).join('') || '<tr><td colspan="6"><div class="vazio"><i class="ti ti-circle-check"></i>Nenhum lançamento conciliado com esse filtro</div></td></tr>'}</tbody>
      </table></div>`;
  }

  function abaImportacoes() {
    return `
      <p class="card-desc">Desfazer uma importação remove os lançamentos dela — só é possível enquanto nenhum estiver conciliado.</p>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Importado em</th><th>Arquivo</th><th>Período</th><th class="num">Lançamentos</th><th class="num">Saldo no banco</th><th></th></tr></thead>
        <tbody>${dados.itens.map((i) => `<tr data-id="${i.id}">
          <td><small>${EG.dataHora(i.importadoEm)}<br><span class="sub">${EG.esc(i.usuario || '')}</span></small></td>
          <td><strong>${EG.esc(i.arquivo)}</strong><br><small class="sub">${EG.esc(i.conta)} · ${i.formato.toUpperCase()}</small></td>
          <td style="white-space:nowrap">${EG.data(i.periodoInicio)} a ${EG.data(i.periodoFim)}</td>
          <td class="num">${i.restantes}<br><small class="sub">${i.conciliados} conciliado(s)${i.duplicados ? ` · ${i.duplicados} repetido(s) ignorado(s)` : ''}</small></td>
          <td class="num">${i.saldoFinal !== null ? `${EG.moeda(i.saldoFinal)}<br><small class="sub">${EG.data(i.saldoData)}</small>` : '<span class="sub">—</span>'}</td>
          <td class="acoes">${i.conciliados ? '' : '<button class="btn btn-secundario btn-pequeno perigo" data-action="desfazer-importacao"><i class="ti ti-trash"></i> Desfazer</button>'}</td>
        </tr>`).join('') || '<tr><td colspan="6"><div class="vazio"><i class="ti ti-file-import"></i>Nenhuma importação</div></td></tr>'}</tbody>
      </table></div>`;
  }

  function abaResumo() {
    const t = dados.totais;
    const anos = [...new Set([Number(EG.hojeSP().slice(0, 4)), Number(EG.hojeSP().slice(0, 4)) - 1, dados.ano])].sort((a, b) => b - a);
    const pc = (n) => (n === null ? '—' : `${String(n).replace('.', ',')}%`);
    return `
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
        <select class="select" data-filtro="ano" style="width:auto">${anos.map((a) => `<option ${a === dados.ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
        <span class="sub" style="flex:1">Movimento do extrato pela data do lançamento no banco.</span>
      </div>
      <div class="tabela-wrap"><table class="tabela-fluxo">
        <thead><tr><th>Mês</th><th>Lançamentos</th><th>Créditos</th><th>Débitos</th><th>Saldo do mês</th><th style="text-align:left;width:22%">Conciliado</th></tr></thead>
        <tbody>${dados.meses.filter((x) => x.lancamentos).map((x) => `<tr><td><strong>${EG.MESES[x.mes - 1]}</strong></td><td>${x.lancamentos}</td>
          <td>${EG.moeda(x.creditos)}</td><td>${EG.moeda(x.debitos)}</td><td class="${x.saldo < 0 ? 'nota-baixa' : ''}">${EG.moeda(x.saldo)}</td>
          <td style="text-align:left"><div class="medidor-linha"><div class="medidor"><span style="width:${x.percentual || 0}%"></span></div><span>${pc(x.percentual)}</span></div></td></tr>`).join('')
          || '<tr><td colspan="6"><div class="vazio">Nenhum lançamento no ano</div></td></tr>'}</tbody>
        ${t.lancamentos ? `<tfoot><tr><td><strong>Total</strong></td><td><strong>${t.lancamentos}</strong></td><td><strong>${EG.moeda(t.creditos)}</strong></td><td><strong>${EG.moeda(t.debitos)}</strong></td>
          <td class="${t.saldo < 0 ? 'nota-baixa' : ''}"><strong>${EG.moeda(t.saldo)}</strong></td><td style="text-align:left"><strong>${pc(t.percentual)}</strong></td></tr></tfoot>` : ''}
      </table></div>
      ${dados.categorias.length ? `<div class="card-titulo" style="margin:20px 0 10px"><i class="ti ti-category"></i> Conciliados por categoria</div>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Tipo</th><th>Categoria</th><th class="num">Lançamentos</th><th class="num">Total</th></tr></thead>
        <tbody>${dados.categorias.map((c) => `<tr><td>${c.tipo === 'credito' ? 'Crédito' : 'Débito'}</td><td>${EG.esc(c.categoria)}</td><td class="num">${c.qtd}</td><td class="num"><strong>${EG.moeda(c.total)}</strong></td></tr>`).join('')}</tbody>
      </table></div>` : ''}`;
  }

  /* ---------- Contas bancárias ---------- */
  function modalContas(el) {
    const m = EG.modal({
      titulo: 'Contas bancárias',
      largura: 620,
      corpo: `<div class="tabela-wrap"><table>
          <thead><tr><th>Conta</th><th class="num">Lançamentos</th><th></th></tr></thead>
          <tbody>${contas.map((c) => `<tr data-conta="${c.id}">
            <td><strong>${EG.esc(c.nome)}</strong>${c.ativo ? '' : ' <span class="selo selo-neutro">desativada</span>'}
              <br><small class="sub">${EG.esc([c.banco, c.agencia ? `ag. ${c.agencia}` : '', c.conta ? `conta ${c.conta}` : '', TIPOS_CONTA[c.tipo]].filter(Boolean).join(' · '))}</small></td>
            <td class="num">${c.lancamentos}${c.pendentes ? `<br><small class="sub">${c.pendentes} pendente(s)</small>` : ''}</td>
            <td class="acoes"><button class="btn-icone" data-conta-acao="editar" title="Editar"><i class="ti ti-edit"></i></button>
              ${c.lancamentos ? '' : '<button class="btn-icone perigo" data-conta-acao="excluir" title="Excluir"><i class="ti ti-trash"></i></button>'}</td>
          </tr>`).join('')}</tbody></table></div>`,
      botoes: [
        { texto: 'Fechar', acao: () => m.fechar() },
        { texto: 'Nova conta', classe: 'btn-primario', icone: 'ti-plus', acao: () => { m.fechar(); modalConta(null, el); } }
      ]
    });
    m.el.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-conta-acao]');
      if (!b) return;
      const c = contas.find((x) => x.id === Number(b.closest('[data-conta]').dataset.conta));
      if (b.dataset.contaAcao === 'editar') { m.fechar(); modalConta(c, el); return; }
      if (!(await EG.confirmar(`Excluir a conta ${c.nome}?`, { perigo: true, textoOk: 'Excluir' }))) return;
      try {
        await EG.api('DELETE', `/conciliacao/contas-banco/${c.id}`);
        m.fechar(); EG.toast('Conta excluída');
        if (Number(estado.contaId) === c.id) estado.contaId = '';
        await recarregarTudo(el);
      } catch (e) { EG.toast(e.message, 'erro'); }
    });
  }

  function modalConta(c, el) {
    const nova = !c;
    c = c || { tipo: 'corrente', ativo: true };
    const m = EG.modal({
      titulo: nova ? 'Nova conta bancária' : c.nome,
      largura: 520,
      corpo: `
        <div class="campo"><label>Nome da conta *</label><input class="input" name="nome" maxlength="100" value="${EG.esc(c.nome)}" placeholder="Ex.: Itaú — mensalidades"></div>
        <div class="linha-2">
          <div class="campo"><label>Banco</label><input class="input" name="banco" maxlength="60" value="${EG.esc(c.banco)}"></div>
          <div class="campo"><label>Tipo</label><select class="select" name="tipo">${EG.opcoes(Object.entries(TIPOS_CONTA).map(([value, label]) => ({ value, label })), c.tipo)}</select></div>
        </div>
        <div class="linha-2">
          <div class="campo"><label>Agência</label><input class="input" name="agencia" maxlength="20" value="${EG.esc(c.agencia)}"></div>
          <div class="campo"><label>Conta</label><input class="input" name="conta" maxlength="20" value="${EG.esc(c.conta)}"></div>
        </div>
        ${nova ? '' : `<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" data-ativo ${c.ativo ? 'checked' : ''} style="accent-color:var(--amber)"> Conta ativa (aparece na importação)</label>`}`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Salvar', classe: 'btn-primario', icone: 'ti-device-floppy', acao: async () => {
          const d = EG.lerForm(m.el);
          if (!nova) d.ativo = m.el.querySelector('[data-ativo]').checked;
          const r = nova ? await EG.api('POST', '/conciliacao/contas-banco', d) : await EG.api('PUT', `/conciliacao/contas-banco/${c.id}`, d);
          m.fechar(); EG.toast('Conta bancária salva');
          if (nova) estado.contaId = String(r.id);
          await recarregarTudo(el);
        } }
      ]
    });
  }

  /* ---------- Importar extrato ---------- */
  function paraBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function modalImportar(el) {
    const ativas = contas.filter((c) => c.ativo);
    if (!ativas.length) { EG.toast('Nenhuma conta bancária ativa', 'erro'); return; }
    let arquivo = null;
    let previa = null;
    const m = EG.modal({
      titulo: 'Importar extrato',
      largura: 760,
      corpo: `
        <div class="linha-2">
          <div class="campo"><label>Conta bancária</label><select class="select" name="contaBancoId">${ativas.map((c) => `<option value="${c.id}" ${Number(estado.contaId) === c.id ? 'selected' : ''}>${EG.esc(c.nome)}</option>`).join('')}</select></div>
          <div class="campo"><label>Arquivo do extrato</label><input class="input" type="file" data-arquivo accept=".ofx,.csv,.txt"></div>
        </div>
        <label class="zona-arquivo" data-zona><i class="ti ti-cloud-upload"></i><span>Arraste o arquivo aqui ou use o campo acima</span>
          <small>OFX (recomendado — tem identificação única e saldo) ou CSV com data, histórico e valor (ou colunas de crédito e débito).</small></label>
        <div data-previa></div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Importar', classe: 'btn-primario', icone: 'ti-file-import', acao: async () => {
          if (!previa) throw EG.erro('Escolha o arquivo do extrato.');
          if (!previa.novos) throw EG.erro('Nenhum lançamento novo para importar.');
          const dadosEnvio = corpo();
          const r = await EG.api('POST', '/conciliacao/importar', { ...dadosEnvio, simular: false });
          m.fechar();
          EG.toast(`${r.importados} lançamento(s) importado(s)${r.duplicados ? ` · ${r.duplicados} repetido(s) ignorado(s)` : ''}`);
          estado.contaId = String(dadosEnvio.contaBancoId);
          estado.aba = 'pendentes'; estado.busca = ''; estado.tipo = '';
          await recarregarTudo(el);
        } }
      ]
    });
    const btnImportar = m.el.querySelectorAll('.modal-rodape .btn')[1];
    btnImportar.disabled = true;
    const corpo = () => ({ contaBancoId: Number(m.el.querySelector('[name=contaBancoId]').value), arquivo: arquivo.nome, conteudo: arquivo.base64 });
    const caixa = m.el.querySelector('[data-previa]');

    async function prever() {
      if (!arquivo) return;
      caixa.innerHTML = '<div class="vazio"><div class="spinner pequeno" style="margin:0 auto"></div></div>';
      btnImportar.disabled = true; previa = null; m.erro('');
      try {
        previa = await EG.api('POST', '/conciliacao/importar', { ...corpo(), simular: true });
        const p = previa;
        caixa.innerHTML = `
          <div class="msg-info" style="margin-top:12px">
            <strong>${EG.esc(arquivo.nome)}</strong> · ${p.formato.toUpperCase()} · ${EG.data(p.periodo.inicio)} a ${EG.data(p.periodo.fim)}<br>
            ${p.novos} lançamento(s) novo(s)${p.duplicados ? ` · ${p.duplicados} já importado(s) antes (serão ignorados)` : ''}
            · entradas ${EG.moeda(p.creditos)} · saídas ${EG.moeda(p.debitos)}
            ${p.saldo ? `<br>Saldo informado pelo banco: <strong>${EG.moeda(p.saldo.valor)}</strong>${p.saldo.data ? ` em ${EG.data(p.saldo.data)}` : ''}` : ''}
          </div>
          <div class="tabela-wrap" style="max-height:300px;overflow:auto"><table>
            <thead><tr><th>Data</th><th>Histórico</th><th class="num">Valor</th></tr></thead>
            <tbody>${p.amostra.map((l) => `<tr class="${l.duplicado ? 'linha-apagada' : ''}"><td style="white-space:nowrap">${EG.data(l.data)}</td>
              <td>${EG.esc(l.descricao)}${l.duplicado ? ' <span class="selo selo-neutro">já importado</span>' : ''}</td><td class="num">${valor(l)}</td></tr>`).join('')}</tbody>
          </table></div>
          ${p.total > p.amostra.length ? `<p class="sub" style="margin-top:6px">Mostrando ${p.amostra.length} de ${p.total} lançamentos.</p>` : ''}`;
        btnImportar.disabled = !p.novos;
        btnImportar.lastChild.textContent = p.novos ? ` Importar ${p.novos} lançamento(s)` : ' Importar';
      } catch (e) {
        caixa.innerHTML = '';
        m.erro(e.message);
      }
    }
    function escolher(file) {
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) { m.erro('Arquivo grande demais (máximo 3 MB). Exporte um período menor.'); return; }
      const r = new FileReader();
      r.onload = () => { arquivo = { nome: file.name, base64: paraBase64(r.result) }; prever(); };
      r.onerror = () => m.erro('Não foi possível ler o arquivo.');
      r.readAsArrayBuffer(file);
    }
    m.el.querySelector('[data-arquivo]').addEventListener('change', (ev) => escolher(ev.target.files[0]));
    m.el.querySelector('[name=contaBancoId]').addEventListener('change', prever);
    const zona = m.el.querySelector('[data-zona]');
    zona.addEventListener('click', () => m.el.querySelector('[data-arquivo]').click());
    zona.addEventListener('dragover', (ev) => { ev.preventDefault(); zona.classList.add('sobre'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('sobre'));
    zona.addEventListener('drop', (ev) => { ev.preventDefault(); zona.classList.remove('sobre'); escolher(ev.dataTransfer.files[0]); });
  }

  /* ---------- Vincular à mão ---------- */
  async function modalVincular(l, el) {
    const credito = l.tipo === 'credito';
    const opcoes = credito
      ? [['mensalidade', 'Mensalidade'], ['manual', 'Outro (classificar)']]
      : [['conta', 'Conta a pagar'], ['nova_conta', 'Nova conta paga'], ['manual', 'Outro (classificar)']];
    let modo = opcoes[0][0];
    let escolhido = null;
    let candidatos = [];
    const m = EG.modal({
      titulo: 'Vincular lançamento',
      largura: 700,
      corpo: `
        <div class="codigo-box" style="margin-bottom:14px;justify-content:space-between"><div><strong>${EG.esc(l.descricao)}</strong><br>
          <span class="sub">${EG.data(l.data)} · ${credito ? 'crédito (entrada)' : 'débito (saída)'}</span></div><div style="font-size:18px;font-weight:700">${valor(l)}</div></div>
        <div class="segmentos" role="tablist">${opcoes.map(([k, r], i) => `<button type="button" class="${i ? '' : 'ativo'}" data-modo="${k}">${r}</button>`).join('')}</div>
        <div data-corpo-vinculo></div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Conciliar', classe: 'btn-primario', icone: 'ti-link', acao: async () => {
          let corpo;
          if (modo === 'mensalidade' || modo === 'conta') {
            if (!escolhido) throw EG.erro(`Escolha ${modo === 'mensalidade' ? 'a mensalidade' : 'a conta'}.`);
            corpo = { vinculo: modo, id: escolhido };
          } else {
            corpo = { vinculo: modo, ...EG.lerForm(m.el.querySelector('[data-corpo-vinculo]')) };
            if (!corpo.categoria) throw EG.erro('Escolha a categoria.');
          }
          const r = await EG.api('POST', `/conciliacao/lancamentos/${l.id}/conciliar`, corpo);
          m.fechar();
          EG.toast(r.acao === 'baixou' ? (modo === 'mensalidade' ? 'Conciliado · baixa da mensalidade registrada' : `Conciliado · conta paga${r.proxima ? ` (próxima lançada para ${EG.data(r.proxima.vencimento)})` : ''}`)
            : r.acao === 'criou' ? 'Conciliado · conta a pagar criada como paga' : 'Lançamento conciliado');
          await recarregarTudo(el);
        } }
      ]
    });
    const area = m.el.querySelector('[data-corpo-vinculo]');

    async function buscar(texto) {
      const r = await EG.api('GET', `/conciliacao/lancamentos/${l.id}/candidatos${texto ? `?busca=${encodeURIComponent(texto)}` : ''}`);
      candidatos = r.itens;
      const lista = area.querySelector('[data-candidatos]');
      if (!lista) return;
      lista.innerHTML = candidatos.map((c) => `
        <label class="candidato ${escolhido === c.id ? 'ativo' : ''}">
          <input type="radio" name="candidato" value="${c.id}" ${escolhido === c.id ? 'checked' : ''}>
          <span style="flex:1"><strong>${EG.esc(c.rotulo)}</strong> ${selo(c.confianca)}
            <br><small class="sub">${EG.esc(c.detalhe)}${c.resp ? ' · resp. ' + EG.esc(c.resp) : ''}${c.jaBaixada ? ' · só será vinculada' : ''}${c.valorDiferente ? ' · <span class="nota-baixa">valor diferente</span>' : ''}</small></span>
          <span class="num"><strong>${EG.moeda(c.valor)}</strong></span>
        </label>`).join('') || `<div class="vazio">Nada encontrado${texto ? ' com essa busca' : ''}.</div>`;
    }

    function desenhar() {
      escolhido = null;
      if (modo === 'mensalidade' || modo === 'conta') {
        area.innerHTML = `
          <input class="input" data-busca-cand placeholder="${modo === 'mensalidade' ? 'Buscar por aluno, RA ou responsável...' : 'Buscar por descrição ou fornecedor...'}" style="margin:12px 0 8px">
          <div class="candidatos" data-candidatos><div class="vazio"><div class="spinner pequeno" style="margin:0 auto"></div></div></div>
          <p class="sub" style="margin-top:8px">${modo === 'mensalidade' ? 'Mensalidade em aberto recebe a baixa com a data e o valor deste crédito. Se já foi recebida pelo botão "Receber", só fica vinculada.' : 'Conta pendente fica paga na data deste débito (o valor precisa ser igual). Se já foi paga, só fica vinculada.'}</p>`;
        let espera = null;
        area.querySelector('[data-busca-cand]').addEventListener('input', (ev) => {
          clearTimeout(espera);
          espera = setTimeout(() => buscar(ev.target.value.trim()).catch((e) => m.erro(e.message)), 300);
        });
        buscar('').catch((e) => m.erro(e.message));
      } else if (modo === 'nova_conta') {
        area.innerHTML = `
          <div class="msg-info" style="margin-top:12px">Para despesas que não estavam em Contas a Pagar (ex.: débito automático). A conta é criada já paga na data do extrato e entra no Fluxo de Caixa e no DRE.</div>
          <div class="campo"><label>Descrição *</label><input class="input" name="descricao" maxlength="150" value="${EG.esc(l.descricao.slice(0, 150))}"></div>
          <div class="linha-2">
            <div class="campo"><label>Categoria</label><select class="select" name="categoria">${dados.categoriasContas.map((c) => `<option>${EG.esc(c)}</option>`).join('')}</select></div>
            <div class="campo"><label>Fornecedor</label><input class="input" name="fornecedor" maxlength="100"></div>
          </div>`;
        area.querySelector('[name=categoria]').value = 'Outros';
      } else {
        area.innerHTML = `
          <p class="card-desc" style="margin:12px 0">Para movimentos que não são mensalidade nem conta a pagar (tarifas, transferências entre contas, aplicações...). Ficam no Resumo da conciliação, mas não entram no Fluxo de Caixa.</p>
          <div class="linha-2">
            <div class="campo"><label>Categoria *</label><select class="select" name="categoria"><option value="">Selecione</option>${dados.categorias[l.tipo].map((c) => `<option>${EG.esc(c)}</option>`).join('')}</select></div>
            <div class="campo"><label>Observação</label><input class="input" name="obs" maxlength="200"></div>
          </div>`;
      }
    }
    m.el.querySelector('.segmentos').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-modo]');
      if (!b) return;
      modo = b.dataset.modo;
      m.el.querySelectorAll('.segmentos button').forEach((x) => x.classList.toggle('ativo', x === b));
      m.erro('');
      desenhar();
    });
    area.addEventListener('change', (ev) => {
      if (ev.target.name !== 'candidato') return;
      escolhido = Number(ev.target.value);
      area.querySelectorAll('.candidato').forEach((x) => x.classList.toggle('ativo', x.contains(ev.target)));
    });
    desenhar();
  }

  /* ---------- Ações ---------- */
  async function recarregarTudo(el) {
    try {
      await carregarContas();
      if (estado.contaId && !contaAtual()) estado.contaId = '';
      if (contas.length) await carregar(); else dados = null;
      render(el);
    } catch (e) { EG.toast(e.message, 'erro'); }
  }

  function atualizarLote(el) {
    const barra = EG.$('[data-lote]', el);
    if (!barra) return;
    barra.hidden = !selecionados.size;
    barra.querySelector('[data-qtd-sel]').textContent = `${selecionados.size} selecionado(s)`;
  }

  async function aoClicar(ev, el) {
    const b = ev.target.closest('[data-action]');
    if (!b || !el.contains(b)) return;
    const tr = b.closest('tr[data-id]');
    const id = tr ? Number(tr.dataset.id) : null;
    const l = id && dados && dados.itens ? dados.itens.find((x) => x.id === id) : null;
    try {
      switch (b.dataset.action) {
        case 'aba':
          estado.aba = b.dataset.aba; estado.busca = ''; estado.tipo = '';
          await EG.guarda(b, async () => { await carregar(); render(el); });
          break;
        case 'nova-conta': modalConta(null, el); break;
        case 'contas': modalContas(el); break;
        case 'importar': modalImportar(el); break;
        case 'vincular': await modalVincular(l, el); break;
        case 'aceitar': {
          const s = l.sugestoes.find((x) => x.confianca !== 'baixa');
          await EG.guarda(b, async () => {
            const r = await EG.api('POST', `/conciliacao/lancamentos/${l.id}/conciliar`,
              s.tipo === 'manual' ? { vinculo: 'manual', categoria: s.categoria } : { vinculo: s.tipo, id: s.id });
            EG.toast(r.acao === 'baixou' ? `Conciliado · ${s.tipo === 'mensalidade' ? 'baixa registrada' : 'conta paga'}` : 'Lançamento conciliado');
            await recarregarTudo(el);
          });
          break;
        }
        case 'automatica': {
          const n = dados.resumo.automaticas;
          if (!(await EG.confirmar(`Conciliar automaticamente ${n} lançamento(s) com sugestão de confiança alta?\n\nAs mensalidades em aberto recebem a baixa com a data e o valor do extrato, e as contas ficam pagas. Você pode desfazer qualquer um depois, na aba Conciliados.`, { textoOk: 'Conciliar' }))) return;
          const r = await EG.api('POST', '/conciliacao/automatica', { contaBancoId: estado.contaId || null });
          EG.toast(`${r.conciliados} conciliado(s): ${r.mensalidades} mensalidade(s), ${r.contas} conta(s), ${r.manuais} tarifa(s)`);
          await recarregarTudo(el);
          break;
        }
        case 'excluir':
          if (!(await EG.confirmar(`Excluir este lançamento do extrato?\n\n${l.descricao} · ${EG.moeda(l.valor)}\n\nSe importar o mesmo arquivo de novo, ele volta.`, { perigo: true, textoOk: 'Excluir' }))) return;
          await EG.api('POST', '/conciliacao/lote', { ids: [l.id], acao: 'excluir' });
          EG.toast('Lançamento excluído');
          await recarregarTudo(el);
          break;
        case 'lote-sugestoes': {
          const r = await EG.api('POST', '/conciliacao/lote', { ids: [...selecionados], acao: 'sugestoes' });
          EG.toast(`${r.conciliados} conciliado(s) pelas sugestões${r.ignorados ? ` · ${r.ignorados} sem sugestão segura` : ''}`);
          await recarregarTudo(el);
          break;
        }
        case 'lote-manual': {
          const categoria = EG.$('[data-lote-categoria]', el).value;
          if (!categoria) { EG.toast('Escolha a categoria', 'erro'); return; }
          const r = await EG.api('POST', '/conciliacao/lote', { ids: [...selecionados], acao: 'manual', categoria });
          EG.toast(`${r.conciliados} classificado(s) como "${categoria}"${r.ignorados ? ` · ${r.ignorados} ignorado(s) (categoria de ${dados.categorias.credito.includes(categoria) ? 'crédito' : 'débito'})` : ''}`);
          await recarregarTudo(el);
          break;
        }
        case 'lote-excluir': {
          if (!(await EG.confirmar(`Excluir ${selecionados.size} lançamento(s) do extrato?`, { perigo: true, textoOk: 'Excluir' }))) return;
          const r = await EG.api('POST', '/conciliacao/lote', { ids: [...selecionados], acao: 'excluir' });
          EG.toast(`${r.excluidos} lançamento(s) excluído(s)`);
          await recarregarTudo(el);
          break;
        }
        case 'desfazer': {
          const v = l.vinculo;
          const efeito = v.acao === 'baixou' ? (v.tipo === 'mensalidade' ? '\n\nA baixa da mensalidade feita pela conciliação será estornada.' : '\n\nO pagamento da conta feito pela conciliação será estornado.')
            : v.acao === 'criou' ? '\n\nA conta a pagar criada pela conciliação será excluída.' : '';
          if (!(await EG.confirmar(`Desfazer a conciliação de ${l.descricao} (${EG.moeda(l.valor)})?${efeito}`, { textoOk: 'Desfazer' }))) return;
          const r = await EG.api('POST', `/conciliacao/lancamentos/${l.id}/desfazer`);
          EG.toast(`Conciliação desfeita · ${r.desfeito}`);
          await recarregarTudo(el);
          break;
        }
        case 'desfazer-importacao': {
          const i = dados.itens.find((x) => x.id === id);
          if (!(await EG.confirmar(`Desfazer a importação de ${i.arquivo}?\n\nOs ${i.restantes} lançamento(s) dela serão removidos.`, { perigo: true, textoOk: 'Desfazer importação' }))) return;
          const r = await EG.api('DELETE', `/conciliacao/importacoes/${i.id}`);
          EG.toast(`Importação desfeita · ${r.removidos} lançamento(s) removido(s)`);
          await recarregarTudo(el);
          break;
        }
        case 'csv': {
          const st = estado.aba === 'pendentes' ? 'pendentes' : 'conciliados';
          EG.baixarCsv(`extrato-${st}-${EG.hojeSP()}.csv`,
            ['Data', 'Conta', 'Histórico', 'Tipo', 'Valor', 'Situação', 'Vinculado a', 'Categoria', 'Conciliado por', 'Conciliado em'],
            dados.itens.map((x) => [EG.data(x.data), x.conta, x.descricao, x.tipo === 'credito' ? 'Crédito' : 'Débito', x.tipo === 'credito' ? x.valor : -x.valor,
              x.status === 'pendente' ? 'Pendente' : 'Conciliado', x.vinculo ? x.vinculo.rotulo : '', x.vinculo ? (x.vinculo.categoria || '') : '',
              x.vinculo ? (x.vinculo.por || '') : '', x.vinculo && x.vinculo.em ? EG.dataHora(x.vinculo.em) : '']));
          break;
        }
        default: break;
      }
    } catch (e) { EG.toast(e.message, 'erro'); }
  }

  EG.registrarModulo('conciliacao', {
    async render(el) {
      EG.filtrosDaSessao(estado, { aba: 'pendentes', contaId: '', tipo: '', busca: '', mes: '', ano: Number(EG.hojeSP().slice(0, 4)) });
      await carregarContas();
      if (estado.contaId && !contaAtual()) estado.contaId = '';
      if (contas.length) await carregar();
      render(el);
      el.onclick = (ev) => aoClicar(ev, el);
      el.onchange = async (ev) => {
        const t = ev.target;
        if (t.matches('[data-sel]')) {
          if (t.checked) selecionados.add(Number(t.value)); else selecionados.delete(Number(t.value));
          atualizarLote(el); return;
        }
        if (t.matches('[data-sel-todos]')) {
          EG.$$('[data-sel]', el).forEach((c) => { c.checked = t.checked; if (t.checked) selecionados.add(Number(c.value)); else selecionados.delete(Number(c.value)); });
          atualizarLote(el); return;
        }
        const f = t.dataset.filtro;
        if (!f || f === 'busca') return;
        if (f === 'conta') estado.contaId = t.value;
        if (f === 'tipo') estado.tipo = t.value;
        if (f === 'mes') estado.mes = t.value;
        if (f === 'ano') estado.ano = Number(t.value);
        try { await carregar(); render(el); } catch (e) { EG.toast(e.message, 'erro'); }
      };
      let espera = null;
      el.oninput = (ev) => {
        if (!ev.target.matches('[data-filtro="busca"]')) return;
        clearTimeout(espera);
        espera = setTimeout(async () => {
          estado.busca = ev.target.value.trim();
          try {
            await carregar(); render(el);
            const c = EG.$('[data-filtro="busca"]', el); c.focus(); c.setSelectionRange(c.value.length, c.value.length);
          } catch (e) { EG.toast(e.message, 'erro'); }
        }, 350);
      };
    }
  });
})(window.EG);
