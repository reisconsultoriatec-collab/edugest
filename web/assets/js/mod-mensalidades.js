/* =====================================================================
 *  EduGest — Mensalidades
 *  Geração por período (com simulação), baixa, estorno, cobrança por
 *  WhatsApp. O desconto vem sempre da bolsa vigente do aluno.
 * ===================================================================== */
'use strict';
(function (EG) {
  const SIT = {
    pendente: ['Em aberto', 'selo-info'],
    vencida: ['Vencida', 'selo-erro'],
    paga: ['Paga', 'selo-ok'],
    isenta: ['Isenta', 'selo-roxo'],
    cancelada: ['Cancelada', 'selo-neutro']
  };
  const CHIPS = [['', 'Todas'], ['pendente', 'Em aberto'], ['vencida', 'Vencidas'], ['paga', 'Pagas'], ['isenta', 'Isentas'], ['cancelada', 'Canceladas']];

  let dados = null;
  let turmas = [];
  const filtro = {};

  async function carregar() {
    const q = new URLSearchParams();
    if (filtro.referencia) q.set('referencia', filtro.referencia);
    if (filtro.turmaId) q.set('turmaId', filtro.turmaId);
    if (filtro.busca) q.set('busca', filtro.busca);
    dados = await EG.api('GET', '/mensalidades?' + q.toString());
  }

  function opcoesReferencia() {
    const refs = [...new Set([EG.mesAtualSP(), ...(dados ? dados.referencias : []), filtro.referencia].filter(Boolean))].sort().reverse();
    return `<option value="">Todas as referências</option>`
      + refs.map((r) => `<option value="${r}" ${r === filtro.referencia ? 'selected' : ''}>${EG.nomeRef(r)}</option>`).join('');
  }

  function render(el) {
    const r = dados.resumo;
    const lista = dados.itens.filter((m) => !filtro.status || m.situacao === filtro.status);
    const qtd = (k) => (k ? (r.quantidade[k] || 0) : dados.itens.length);
    el.innerHTML = `
      <div class="grade-kpi">
        ${kpi('ti-circle-check', 'var(--ok-bg)', 'var(--ok)', 'Recebido', EG.moeda(r.recebido), `${qtd('paga')} mensalidade(s) paga(s)`)}
        ${kpi('ti-clock', 'var(--info-bg)', 'var(--info)', 'A receber', EG.moeda(r.aReceber), `${qtd('pendente')} em aberto`)}
        ${kpi('ti-alert-triangle', 'var(--erro-bg)', 'var(--erro)', 'Em atraso', EG.moeda(r.emAtraso), `${r.inadimplentes} aluno(s) inadimplente(s)`)}
        ${kpi('ti-discount-2', 'var(--roxo-bg)', 'var(--roxo)', 'Descontos de bolsas', EG.moeda(r.descontos), `${qtd('isenta')} isenta(s)`)}
      </div>
      <div class="card">
        <div class="card-cab">
          <div class="card-titulo"><i class="ti ti-receipt"></i> Mensalidades</div>
          <div class="acoes-topo"><button class="btn btn-primario" data-action="gerar"><i class="ti ti-calendar-plus"></i> Gerar mensalidades</button></div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
          <select class="select" data-filtro="referencia" style="width:auto;min-width:180px">${opcoesReferencia()}</select>
          <select class="select" data-filtro="turma" style="width:auto;min-width:180px">${EG.opcoesTurmas(turmas, filtro.turmaId, { vazio: 'Todas as turmas' })}</select>
          <input class="input" data-filtro="busca" placeholder="Buscar aluno, RA ou responsável..." value="${EG.esc(filtro.busca)}" style="flex:1;min-width:200px">
        </div>
        <div class="filtros">${CHIPS.map(([k, rot]) => `<button class="chip ${filtro.status === k ? 'ativo' : ''}" data-action="status" data-status="${k}">${rot} (${qtd(k)})</button>`).join('')}</div>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Aluno</th><th>Referência</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th></th></tr></thead>
          <tbody>${lista.map(linha).join('') || `<tr><td colspan="6"><div class="vazio"><i class="ti ti-receipt"></i>${dados.itens.length ? 'Nenhuma mensalidade nesta situação' : 'Nenhuma mensalidade encontrada. Use "Gerar mensalidades".'}</div></td></tr>`}</tbody>
        </table></div>
      </div>`;
  }

  function kpi(icone, fundo, cor, rotulo, valor, obs) {
    return `<div class="kpi"><div class="kpi-icone" style="background:${fundo};color:${cor}"><i class="ti ${icone}"></i></div>
      <div><div class="kpi-rotulo">${rotulo}</div><div class="kpi-valor" style="font-size:20px">${valor}</div><div class="kpi-obs">${EG.esc(obs)}</div></div></div>`;
  }

  function linha(m) {
    const s = SIT[m.situacao] || SIT.pendente;
    const aberto = m.situacao === 'pendente' || m.situacao === 'vencida';
    const valor = m.desconto > 0
      ? `<small class="sub"><s>${EG.moeda(m.valorBruto)}</s></small><br><strong>${EG.moeda(m.valor)}</strong>
         ${m.bolsa ? `<br><small class="sub"><i class="ti ti-discount-2"></i> ${EG.esc(m.bolsa.tipo)} ${String(m.bolsa.percentual).replace('.', ',')}%</small>` : ''}`
      : `<strong>${EG.moeda(m.valor)}</strong>`;
    let detalhe = '';
    if (m.situacao === 'vencida') detalhe = `<br><small class="sub">há ${m.diasAtraso} dia(s)</small>`;
    if (m.situacao === 'paga') {
      detalhe = `<br><small class="sub">${EG.data(m.dataPagamento)} · ${EG.esc(m.formaPagamento || '')}</small>`
        + (Number(m.valorPago) !== Number(m.valor) ? `<br><small class="sub">recebido ${EG.moeda(m.valorPago)}</small>` : '');
    }
    let acoes = '';
    if (aberto) {
      acoes = `<button class="btn btn-primario btn-pequeno" data-action="pagar"><i class="ti ti-cash"></i> Receber</button>
        <button class="btn-icone" data-action="whats" title="Lembrete por WhatsApp"><i class="ti ti-brand-whatsapp"></i></button>
        <button class="btn-icone" data-action="editar" title="Alterar valor ou vencimento"><i class="ti ti-edit"></i></button>
        <button class="btn-icone" data-action="cancelar" title="Cancelar"><i class="ti ti-ban"></i></button>
        <button class="btn-icone perigo" data-action="excluir" title="Excluir"><i class="ti ti-trash"></i></button>`;
    } else if (m.situacao === 'isenta') {
      acoes = `<button class="btn-icone" data-action="editar" title="Alterar valor ou vencimento"><i class="ti ti-edit"></i></button>
        <button class="btn-icone perigo" data-action="excluir" title="Excluir"><i class="ti ti-trash"></i></button>`;
    } else if (m.situacao === 'paga') {
      acoes = '<button class="btn btn-secundario btn-pequeno" data-action="estornar" title="Desfazer o recebimento"><i class="ti ti-arrow-back-up"></i> Estornar</button>';
    } else if (m.situacao === 'cancelada') {
      acoes = `<button class="btn btn-secundario btn-pequeno" data-action="reativar"><i class="ti ti-restore"></i> Reativar</button>
        <button class="btn-icone perigo" data-action="excluir" title="Excluir"><i class="ti ti-trash"></i></button>`;
    }
    return `<tr data-id="${m.id}">
      <td><strong>${EG.esc(m.aluno)}</strong><br><small>${EG.esc(m.ra)}${m.turma ? ' · ' + EG.esc(m.turma) : ''}</small></td>
      <td>${EG.nomeRef(m.referencia)}</td>
      <td style="white-space:nowrap">${EG.data(m.vencimento)}</td>
      <td style="white-space:nowrap">${valor}</td>
      <td><span class="selo ${s[1]}">${s[0]}</span>${detalhe}</td>
      <td class="acoes">${acoes}</td>
    </tr>`;
  }

  /* ---------- Gerar ---------- */
  async function modalGerar(el) {
    const cfg = EG.estado.colegio.config;
    const alunos = await EG.api('GET', '/financeiro/alunos');
    const mes = Number(EG.mesAtualSP().slice(5, 7));
    const opMes = (sel) => EG.MESES.map((n, i) => `<option value="${i + 1}" ${i + 1 === sel ? 'selected' : ''}>${n}</option>`).join('');
    const m = EG.modal({
      titulo: 'Gerar mensalidades',
      largura: 600,
      corpo: `
        <div class="linha-3">
          <div class="campo"><label>Ano</label><input class="input" type="number" name="ano" min="2000" max="2100" value="${EG.esc(cfg.anoLetivo || EG.hojeSP().slice(0, 4))}"></div>
          <div class="campo"><label>De</label><select class="select" name="mesInicial">${opMes(mes)}</select></div>
          <div class="campo"><label>Até</label><select class="select" name="mesFinal">${opMes(mes)}</select></div>
        </div>
        <div class="linha-2">
          <div class="campo"><label>Dia de vencimento</label><input class="input" type="number" name="diaVencimento" min="1" max="28" value="${EG.esc(cfg.diaVencimento)}"></div>
          <div class="campo"><label>Valor da mensalidade (R$)</label><input class="input" name="valor" inputmode="decimal" value="${EG.valorCampo(cfg.valorMensalidade || '')}"></div>
        </div>
        <div class="linha-2">
          <div class="campo"><label>Para</label><select class="select" name="escopo" data-escopo>
            <option value="todos">Todos os alunos ativos</option><option value="turma">Uma turma</option><option value="aluno">Um aluno</option></select></div>
          <div class="campo" data-bloco="turma" hidden><label>Turma</label><select class="select" name="turmaId">${EG.opcoesTurmas(turmas, '')}</select></div>
          <div class="campo" data-bloco="aluno" hidden><label>Aluno</label><select class="select" name="alunoId"><option value="">Selecione o aluno</option>
            ${alunos.map((a) => `<option value="${a.id}">${EG.esc(a.nome)}${a.turma ? ' — ' + EG.esc(a.turma) : ''}</option>`).join('')}</select></div>
        </div>
        <div class="msg-info" style="margin:0">Os descontos das bolsas vigentes são aplicados automaticamente. Alunos com bolsa de 100% não recebem cobrança, e mensalidades que já existem não são duplicadas. Antes de gerar, você verá um resumo.</div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Continuar', classe: 'btn-primario', icone: 'ti-calculator', acao: async () => {
          const d = EG.lerForm(m.el);
          d.valor = EG.lerDinheiro(d.valor);
          if (!d.valor) throw EG.erro('Informe o valor da mensalidade.');
          const simulado = await EG.api('POST', '/mensalidades/gerar', { ...d, simular: true });
          const periodo = d.mesInicial === d.mesFinal ? `${EG.MESES[d.mesInicial - 1]}/${d.ano}`
            : `${EG.MESES_CURTOS[d.mesInicial - 1]} a ${EG.MESES_CURTOS[d.mesFinal - 1]}/${d.ano}`;
          if (!simulado.geradas) {
            throw EG.erro(`Nada a gerar para ${periodo}: ${simulado.jaExistiam} mensalidade(s) já existem e ${simulado.isentas} são isentas (bolsa de 100%).`);
          }
          const texto = `${simulado.geradas} mensalidade(s) · ${periodo} · ${simulado.alunos} aluno(s)\n\n`
            + `Valor bruto: ${EG.moeda(simulado.valorBruto)}\n`
            + `Descontos de bolsas: ${EG.moeda(simulado.descontos)} (${simulado.comDesconto} com desconto)\n`
            + `Total a receber: ${EG.moeda(simulado.total)}`
            + (simulado.jaExistiam ? `\n\n${simulado.jaExistiam} já existiam e foram mantidas.` : '')
            + (simulado.isentas ? `\n${simulado.isentas} isenta(s) por bolsa de 100% não serão geradas.` : '');
          if (!(await EG.confirmar(texto, { titulo: 'Confirmar geração', textoOk: 'Gerar mensalidades' }))) return;
          const r = await EG.api('POST', '/mensalidades/gerar', { ...d, simular: false });
          m.fechar();
          EG.toast(`${r.geradas} mensalidade(s) gerada(s)`);
          filtro.referencia = `${d.ano}-${String(d.mesInicial).padStart(2, '0')}`;
          filtro.status = '';
          await carregar(); render(el);
        } }
      ]
    });
    m.el.querySelector('[data-escopo]').addEventListener('change', (ev) => {
      EG.$$('[data-bloco]', m.el).forEach((b) => { b.hidden = b.dataset.bloco !== ev.target.value; });
    });
  }

  /* ---------- Receber ---------- */
  function modalPagar(m, el) {
    const md = EG.modal({
      titulo: 'Receber mensalidade',
      largura: 480,
      corpo: `
        <div class="codigo-box" style="margin-bottom:14px"><div><strong>${EG.esc(m.aluno)}</strong><br>
          <span class="sub">${EG.nomeRef(m.referencia)} · vencimento ${EG.data(m.vencimento)} · ${EG.moeda(m.valor)}</span></div></div>
        <div class="linha-2">
          <div class="campo"><label>Data do pagamento</label><input class="input" type="date" name="dataPagamento" max="${EG.hojeSP()}" value="${EG.hojeSP()}"></div>
          <div class="campo"><label>Forma</label><select class="select" name="formaPagamento">${EG.opcoes((dados.formas || EG.FORMAS_PAGAMENTO).map((x) => ({ value: x, label: x })), 'PIX')}</select></div>
        </div>
        <div class="campo"><label>Valor recebido (R$)</label><input class="input" name="valorPago" inputmode="decimal" value="${EG.valorCampo(m.valor)}">
          <small>Altere se houve juros, multa ou acordo.</small></div>
        <div class="campo"><label>Observação</label><input class="input" name="obs" maxlength="200"></div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => md.fechar() },
        { texto: 'Confirmar recebimento', classe: 'btn-primario', icone: 'ti-check', acao: async () => {
          const d = EG.lerForm(md.el);
          const valorPago = EG.lerDinheiro(d.valorPago);
          if (!valorPago) throw EG.erro('Informe o valor recebido.');
          await EG.api('POST', `/mensalidades/${m.id}/pagar`, { ...d, valorPago });
          md.fechar(); EG.toast('Recebimento registrado');
          await carregar(); render(el);
        } }
      ]
    });
  }

  function modalEditar(m, el) {
    const md = EG.modal({
      titulo: `Mensalidade · ${m.aluno}`,
      largura: 460,
      corpo: `
        <p class="card-desc" style="margin:0 0 14px">${EG.nomeRef(m.referencia)}</p>
        <div class="linha-2">
          <div class="campo"><label>Valor sem desconto (R$)</label><input class="input" name="valorBruto" inputmode="decimal" value="${EG.valorCampo(m.valorBruto)}"></div>
          <div class="campo"><label>Vencimento</label><input class="input" type="date" name="vencimento" value="${EG.esc(m.vencimento)}"></div>
        </div>
        <div class="msg-info" style="margin:0">O desconto da bolsa vigente no vencimento é recalculado automaticamente.</div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => md.fechar() },
        { texto: 'Salvar', classe: 'btn-primario', icone: 'ti-device-floppy', acao: async () => {
          const d = EG.lerForm(md.el);
          const valorBruto = EG.lerDinheiro(d.valorBruto);
          if (!valorBruto) throw EG.erro('Informe um valor válido.');
          const r = await EG.api('PUT', `/mensalidades/${m.id}`, { valorBruto, vencimento: d.vencimento });
          md.fechar(); EG.toast(`Mensalidade atualizada · valor final ${EG.moeda(r.valor)}`);
          await carregar(); render(el);
        } }
      ]
    });
  }

  function cobrarWhatsApp(m) {
    const vencida = m.situacao === 'vencida';
    const msg = `${vencida ? '🔴' : '🟡'} *Lembrete de mensalidade*\n\n🏫 ${EG.estado.colegio.nome}\n👤 Aluno(a): *${m.aluno}*\n`
      + `📅 Referência: ${EG.nomeRef(m.referencia)}\n💰 Valor: *${EG.moeda(m.valor)}*\n📆 Vencimento: ${EG.data(m.vencimento)}\n`
      + (vencida ? `⚠️ *Em atraso há ${m.diasAtraso} dia(s)*\n` : '')
      + `\n${vencida ? 'Pedimos a gentileza de regularizar o pagamento.' : 'Este é apenas um lembrete do próximo vencimento.'}`
      + ' Se já pagou, por favor desconsidere esta mensagem.'
      + `\n\n_${EG.estado.colegio.nome} — Financeiro_`;
    if (!m.respTelefone) EG.toast(`${m.aluno} não tem telefone do responsável cadastrado — escolha o contato no WhatsApp.`, 'info');
    EG.abrirWhatsApp(m.respTelefone, msg);
  }

  async function aoClicar(ev, el) {
    const b = ev.target.closest('[data-action]');
    if (!b || !el.contains(b)) return;
    const tr = b.closest('[data-id]');
    const m = tr ? dados.itens.find((x) => x.id === Number(tr.dataset.id)) : null;
    const desc = m ? `${m.aluno} · ${EG.nomeRef(m.referencia)}` : '';
    try {
      switch (b.dataset.action) {
        case 'gerar': await modalGerar(el); break;
        case 'status': filtro.status = b.dataset.status; render(el); break;
        case 'pagar': modalPagar(m, el); break;
        case 'editar': modalEditar(m, el); break;
        case 'whats': cobrarWhatsApp(m); break;
        case 'estornar':
          if (!(await EG.confirmar(`Estornar o recebimento de ${desc}?\n\nA mensalidade volta a ficar em aberto.`, { textoOk: 'Estornar' }))) return;
          await EG.api('POST', `/mensalidades/${m.id}/estornar`); EG.toast('Recebimento estornado');
          await carregar(); render(el); break;
        case 'cancelar':
          if (!(await EG.confirmar(`Cancelar a mensalidade de ${desc}?\n\nEla deixa de ser cobrada, mas continua no histórico. Você pode reativá-la depois.`, { textoOk: 'Cancelar mensalidade', perigo: true }))) return;
          await EG.api('POST', `/mensalidades/${m.id}/cancelar`); EG.toast('Mensalidade cancelada');
          await carregar(); render(el); break;
        case 'reativar':
          await EG.api('POST', `/mensalidades/${m.id}/reativar`); EG.toast('Mensalidade reativada');
          await carregar(); render(el); break;
        case 'excluir':
          if (!(await EG.confirmar(`Excluir a mensalidade de ${desc}?\n\nPara manter o histórico, prefira cancelar.`, { textoOk: 'Excluir', perigo: true }))) return;
          await EG.api('DELETE', `/mensalidades/${m.id}`); EG.toast('Mensalidade excluída');
          await carregar(); render(el); break;
        default: break;
      }
    } catch (e) { EG.toast(e.message, 'erro'); }
  }

  EG.registrarModulo('mensalidades', {
    async render(el) {
      EG.filtrosDaSessao(filtro, { referencia: EG.mesAtualSP(), turmaId: '', busca: '', status: '' });
      // Vindo do indicador "Inadimplentes" do Dashboard
      if (EG.filtroInicialMensalidades) {
        Object.assign(filtro, EG.filtroInicialMensalidades);
        EG.filtroInicialMensalidades = null;
      }
      [turmas] = await Promise.all([EG.api('GET', '/turmas'), carregar()]);
      render(el);
      el.onclick = (ev) => aoClicar(ev, el);
      el.onchange = async (ev) => {
        const f = ev.target.dataset.filtro;
        if (f !== 'referencia' && f !== 'turma') return;
        if (f === 'referencia') filtro.referencia = ev.target.value; else filtro.turmaId = ev.target.value;
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
            const c = EG.$('[data-filtro="busca"]', el); c.focus(); c.setSelectionRange(c.value.length, c.value.length);
          } catch (e) { EG.toast(e.message, 'erro'); }
        }, 350);
      };
    }
  });
})(window.EG);
