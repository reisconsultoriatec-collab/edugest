/* =====================================================================
 *  EduGest — Descontos e Bolsas
 *  Toda alteração recalcula as mensalidades em aberto do aluno.
 * ===================================================================== */
'use strict';
(function (EG) {
  const TIPOS = ['Bolsa integral', 'Bolsa parcial', 'Desconto irmão', 'Desconto pontualidade', 'Convênio', 'Funcionário', 'Outro'];
  const SIT = { vigente: ['Vigente', 'selo-ok'], futura: ['Futura', 'selo-info'], encerrada: ['Encerrada', 'selo-neutro'], inativa: ['Inativa', 'selo-neutro'] };
  let dados = null;
  let filtroSit = 'vigente';

  const pct = (n) => `${String(Number(n)).replace('.', ',')}%`;

  function render(el) {
    const r = dados.resumo;
    const lista = dados.itens.filter((b) => !filtroSit || b.situacao === filtroSit);
    const qtd = (k) => dados.itens.filter((b) => !k || b.situacao === k).length;
    el.innerHTML = `
      <div class="grade-kpi">
        ${kpi('ti-users', 'var(--roxo-bg)', 'var(--roxo)', 'Alunos com bolsa', r.bolsistas, 'bolsas vigentes hoje')}
        ${kpi('ti-percentage', 'var(--info-bg)', 'var(--info)', 'Desconto médio', pct(r.descontoMedio), 'entre os bolsistas')}
        ${kpi('ti-cash-off', 'var(--aviso-bg)', 'var(--aviso)', 'Impacto mensal', EG.moeda(r.impactoMensal), `sobre ${EG.moeda(r.valorMensalidade)} por aluno`)}
        ${kpi('ti-star', 'var(--ok-bg)', 'var(--ok)', 'Bolsas integrais', r.integrais, 'isentos de mensalidade')}
      </div>
      <div class="card">
        <div class="card-cab">
          <div class="card-titulo"><i class="ti ti-discount-2"></i> Descontos e bolsas</div>
          <div class="acoes-topo"><button class="btn btn-primario" data-action="nova"><i class="ti ti-plus"></i> Nova bolsa</button></div>
        </div>
        <p class="card-desc">As mensalidades em aberto do aluno são recalculadas automaticamente a cada alteração; as já pagas não mudam. Se houver mais de uma bolsa vigente, vale a de maior percentual.</p>
        <div class="filtros">
          ${[['vigente', 'Vigentes'], ['futura', 'Futuras'], ['encerrada', 'Encerradas'], ['inativa', 'Inativas'], ['', 'Todas']]
            .map(([k, rot]) => `<button class="chip ${filtroSit === k ? 'ativo' : ''}" data-action="filtro" data-sit="${k}">${rot} (${qtd(k)})</button>`).join('')}
        </div>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Aluno</th><th>Tipo</th><th>Desconto</th><th>Vigência</th><th>Situação</th><th>Motivo</th><th></th></tr></thead>
          <tbody>${lista.map((b) => `<tr data-id="${b.id}">
            <td><strong>${EG.esc(b.aluno)}</strong><br><small>${EG.esc(b.ra)}${b.turma ? ' · ' + EG.esc(b.turma) : ''}${b.alunoStatus !== 'ativo' ? ' · ' + EG.esc(b.alunoStatus) : ''}</small></td>
            <td>${EG.esc(b.tipo)}</td>
            <td><strong>${pct(b.percentual)}</strong></td>
            <td style="white-space:nowrap">${b.vigenciaInicio ? EG.data(b.vigenciaInicio) : 'sem início'} → ${b.vigenciaFim ? EG.data(b.vigenciaFim) : 'indeterminada'}</td>
            <td><span class="selo ${SIT[b.situacao][1]}">${SIT[b.situacao][0]}</span></td>
            <td><span class="sub">${EG.esc(b.motivo || '—')}</span></td>
            <td class="acoes"><button class="btn-icone" data-action="editar" title="Editar"><i class="ti ti-edit"></i></button>
              <button class="btn-icone perigo" data-action="excluir" title="Excluir"><i class="ti ti-trash"></i></button></td>
          </tr>`).join('') || `<tr><td colspan="7"><div class="vazio"><i class="ti ti-discount-2"></i>${dados.itens.length ? 'Nenhuma bolsa nesta situação' : 'Nenhuma bolsa cadastrada'}</div></td></tr>`}</tbody>
        </table></div>
      </div>`;
  }

  function kpi(icone, fundo, cor, rotulo, valor, obs) {
    return `<div class="kpi"><div class="kpi-icone" style="background:${fundo};color:${cor}"><i class="ti ${icone}"></i></div>
      <div><div class="kpi-rotulo">${rotulo}</div><div class="kpi-valor" style="font-size:20px">${EG.esc(valor)}</div><div class="kpi-obs">${EG.esc(obs)}</div></div></div>`;
  }

  async function modalBolsa(b, el) {
    const nova = !b;
    const alunos = nova ? await EG.api('GET', '/financeiro/alunos') : [];
    b = b || { tipo: 'Bolsa parcial', vigenciaInicio: EG.hojeSP().slice(0, 4) + '-01-01', ativo: true };
    const tipos = TIPOS.includes(b.tipo) ? TIPOS : [b.tipo, ...TIPOS];
    const m = EG.modal({
      titulo: nova ? 'Nova bolsa ou desconto' : `Bolsa · ${b.aluno}`,
      largura: 560,
      corpo: `
        ${nova ? `<div class="campo"><label>Aluno *</label><select class="select" name="alunoId"><option value="">Selecione o aluno</option>
          ${alunos.map((a) => `<option value="${a.id}">${EG.esc(a.nome)}${a.turma ? ' — ' + EG.esc(a.turma) : ''}</option>`).join('')}</select></div>` : ''}
        <div class="linha-2">
          <div class="campo"><label>Tipo</label><select class="select" name="tipo">${EG.opcoes(tipos.map((t) => ({ value: t, label: t })), b.tipo)}</select></div>
          <div class="campo"><label>Desconto (%) *</label><input class="input" name="percentual" inputmode="decimal" value="${b.percentual ? String(b.percentual).replace('.', ',') : ''}" placeholder="Ex.: 50"></div>
        </div>
        <div class="linha-2">
          <div class="campo"><label>Vigência a partir de</label><input class="input" type="date" name="vigenciaInicio" value="${EG.esc(b.vigenciaInicio)}"></div>
          <div class="campo"><label>Até</label><input class="input" type="date" name="vigenciaFim" value="${EG.esc(b.vigenciaFim)}"><small>Em branco = indeterminada</small></div>
        </div>
        <div class="campo"><label>Motivo / observação</label><input class="input" name="motivo" maxlength="500" value="${EG.esc(b.motivo)}"></div>
        ${nova ? '' : `<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" data-ativo ${b.ativo ? 'checked' : ''} style="accent-color:var(--amber)"> Bolsa ativa</label>`}`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Salvar', classe: 'btn-primario', icone: 'ti-device-floppy', acao: async () => {
          const d = EG.lerForm(m.el);
          const p = EG.lerDinheiro(d.percentual);
          if (!p || p > 100) throw EG.erro('Informe um percentual entre 0,01 e 100.');
          const corpo = { ...d, percentual: p };
          if (!nova) corpo.ativo = m.el.querySelector('[data-ativo]').checked;
          if (nova && !d.alunoId) throw EG.erro('Selecione o aluno.');
          const r = nova ? await EG.api('POST', '/bolsas', corpo) : await EG.api('PUT', `/bolsas/${b.id}`, corpo);
          m.fechar();
          EG.toast(`Bolsa salva${r.mensalidadesAtualizadas ? ` · ${r.mensalidadesAtualizadas} mensalidade(s) em aberto recalculada(s)` : ''}`);
          dados = await EG.api('GET', '/bolsas'); render(el);
        } }
      ]
    });
  }

  EG.registrarModulo('bolsas', {
    async render(el) {
      dados = await EG.api('GET', '/bolsas');
      render(el);
      el.onclick = async (ev) => {
        const b = ev.target.closest('[data-action]');
        if (!b || !el.contains(b)) return;
        const tr = b.closest('[data-id]');
        const bolsa = tr ? dados.itens.find((x) => x.id === Number(tr.dataset.id)) : null;
        try {
          if (b.dataset.action === 'filtro') { filtroSit = b.dataset.sit; render(el); }
          else if (b.dataset.action === 'nova') await modalBolsa(null, el);
          else if (b.dataset.action === 'editar') await modalBolsa(bolsa, el);
          else if (b.dataset.action === 'excluir') {
            const ok = await EG.confirmar(`Excluir a bolsa "${bolsa.tipo}" (${pct(bolsa.percentual)}) de ${bolsa.aluno}?\n\nAs mensalidades em aberto do aluno voltam a ser cobradas sem este desconto. As já pagas não mudam.`, { perigo: true, textoOk: 'Excluir' });
            if (!ok) return;
            const r = await EG.api('DELETE', `/bolsas/${bolsa.id}`);
            EG.toast(`Bolsa excluída${r.mensalidadesAtualizadas ? ` · ${r.mensalidadesAtualizadas} mensalidade(s) recalculada(s)` : ''}`);
            dados = await EG.api('GET', '/bolsas'); render(el);
          }
        } catch (e) { EG.toast(e.message, 'erro'); }
      };
    }
  });
})(window.EG);
