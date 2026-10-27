/* =====================================================================
 *  EduGest — Relatórios financeiros
 *  Inadimplência por turma · Ranking de inadimplentes · Receita prevista
 *  × recebida · DRE simplificado · Impacto de bolsas.
 *  Cada relatório exporta CSV (abre no Excel) e imprime / salva em PDF.
 * ===================================================================== */
'use strict';
(function (EG) {
  const ABAS = [
    ['inadimplencia', 'Inadimplência por turma', 'ti-alert-triangle'],
    ['inadimplentes', 'Inadimplentes', 'ti-list-numbers'],
    ['receita', 'Receita prevista × recebida', 'ti-target-arrow'],
    ['dre', 'DRE simplificado', 'ti-scale'],
    ['bolsas', 'Bolsas e descontos', 'ti-discount-2']
  ];
  const estado = {};
  let dados = null;
  let turmas = [];

  const pct = (n) => `${String(Number(n || 0).toFixed(1)).replace('.', ',')}%`;
  const medidor = (p) => `<div class="medidor" role="img" aria-label="${pct(p)}"><span style="width:${Math.max(0, Math.min(100, Number(p) || 0))}%"></span></div>`;
  const neg = (v) => (v < 0 ? 'nota-baixa' : '');

  function kpi(icone, fundo, cor, rotulo, valor, obs) {
    return `<div class="kpi"><div class="kpi-icone" style="background:${fundo};color:${cor}"><i class="ti ${icone}"></i></div>
      <div><div class="kpi-rotulo">${rotulo}</div><div class="kpi-valor" style="font-size:20px">${valor}</div><div class="kpi-obs">${EG.esc(obs)}</div></div></div>`;
  }

  const selAno = () => `<select class="select" data-filtro="ano" style="width:auto">${(dados.anos || [estado.ano]).map((a) => `<option ${a === dados.ano ? 'selected' : ''}>${a}</option>`).join('')}</select>`;

  /* ---------- Carregar ---------- */
  async function carregar() {
    const q = new URLSearchParams();
    if (['receita', 'dre', 'bolsas'].includes(estado.aba)) q.set('ano', estado.ano);
    if (estado.aba === 'dre' && estado.mes) q.set('mes', estado.mes);
    if (estado.aba === 'inadimplentes' && estado.turmaId) q.set('turmaId', estado.turmaId);
    dados = await EG.api('GET', `/relatorios/${estado.aba}?${q.toString()}`);
  }

  /* ---------- Relatórios ---------- */
  const R = {
    inadimplencia: {
      periodo: () => `Posição em ${EG.data(dados.hoje)}`,
      html() {
        const r = dados.resumo;
        return `
          <div class="grade-kpi">
            ${kpi('ti-alert-triangle', 'var(--erro-bg)', 'var(--erro)', 'Valor em atraso', EG.moeda(r.valorAtraso), `${r.vencidas} mensalidade(s) vencida(s)`)}
            ${kpi('ti-percentage', 'var(--aviso-bg)', 'var(--aviso-tx)', 'Inadimplência', pct(r.percentual), `do valor vencido (${EG.moeda(r.vencidoTotal)})`)}
            ${kpi('ti-users', 'var(--info-bg)', 'var(--info)', 'Alunos inadimplentes', r.inadimplentes, `de ${r.alunosAtivos} aluno(s) ativo(s)`)}
            ${kpi('ti-clock-exclamation', 'var(--roxo-bg)', 'var(--roxo)', 'Há mais de 90 dias', EG.moeda(dados.faixas[3].valor), `${dados.faixas[3].qtd} mensalidade(s)`)}
          </div>
          <div class="card">
            <div class="card-cab"><div class="card-titulo"><i class="ti ti-hourglass"></i> Faixas de atraso</div></div>
            <div class="tabela-wrap"><table>
              <thead><tr><th>Atraso</th><th class="num">Mensalidades</th><th class="num">Valor</th><th style="width:34%">Parte do atraso</th></tr></thead>
              <tbody>${dados.faixas.map((x) => `<tr><td>${x.rotulo}</td><td class="num">${x.qtd}</td><td class="num"><strong>${EG.moeda(x.valor)}</strong></td>
                <td><div class="medidor-linha">${medidor(x.percentual)}<span>${pct(x.percentual)}</span></div></td></tr>`).join('')}</tbody>
            </table></div>
          </div>
          <div class="card">
            <div class="card-cab"><div class="card-titulo"><i class="ti ti-layout-grid"></i> Por turma</div></div>
            <p class="card-desc">Inadimplência = valor em atraso ÷ tudo o que já venceu (pago ou não) na turma.</p>
            <div class="tabela-wrap"><table>
              <thead><tr><th>Turma</th><th class="num">Alunos ativos</th><th class="num">Inadimplentes</th><th class="num">Vencidas</th><th class="num">Em atraso</th><th style="width:26%">Inadimplência</th></tr></thead>
              <tbody>${dados.turmas.map((t) => `<tr><td><strong>${EG.esc(t.turma)}</strong></td><td class="num">${t.alunosAtivos}</td><td class="num">${t.inadimplentes}</td>
                <td class="num">${t.vencidas}</td><td class="num"><strong>${EG.moeda(t.valorAtraso)}</strong></td>
                <td><div class="medidor-linha">${medidor(t.percentual)}<span>${pct(t.percentual)}</span></div></td></tr>`).join('')
                || '<tr><td colspan="6"><div class="vazio"><i class="ti ti-mood-happy"></i>Nenhuma turma com mensalidades vencidas</div></td></tr>'}</tbody>
            </table></div>
          </div>`;
      },
      csv() {
        return {
          nome: `inadimplencia-por-turma-${dados.hoje}.csv`,
          cab: ['Turma', 'Alunos ativos', 'Inadimplentes', 'Mensalidades vencidas', 'Valor em atraso', 'Vencido total', '% inadimplência'],
          linhas: dados.turmas.map((t) => [t.turma, t.alunosAtivos, t.inadimplentes, t.vencidas, t.valorAtraso, t.vencidoTotal, t.percentual])
            .concat([[], ['Faixa de atraso', 'Mensalidades', 'Valor', '% do atraso']], dados.faixas.map((x) => [x.rotulo, x.qtd, x.valor, x.percentual]))
        };
      }
    },

    inadimplentes: {
      periodo: () => `Posição em ${EG.data(dados.hoje)}${estado.turmaId ? ' · ' + ((turmas.find((t) => t.id === Number(estado.turmaId)) || {}).nome || '') : ''}`,
      filtros: () => `<select class="select" data-filtro="turma" style="width:auto;min-width:180px">${EG.opcoesTurmas(turmas, estado.turmaId, { vazio: 'Todas as turmas' })}</select>`,
      html() {
        const r = dados.resumo;
        const ver = EG.pode('mensalidades');
        return `
          <div class="grade-kpi">
            ${kpi('ti-users', 'var(--info-bg)', 'var(--info)', 'Alunos inadimplentes', r.alunos, 'com mensalidade vencida')}
            ${kpi('ti-alert-triangle', 'var(--erro-bg)', 'var(--erro)', 'Total em atraso', EG.moeda(r.total), `${r.vencidas} mensalidade(s)`)}
          </div>
          <div class="card">
            <div class="card-cab"><div class="card-titulo"><i class="ti ti-list-numbers"></i> Maiores dívidas primeiro</div></div>
            <div class="tabela-wrap"><table>
              <thead><tr><th class="num">#</th><th>Aluno</th><th>Responsável</th><th>Meses em atraso</th><th>Desde</th><th class="num">Total</th>${ver ? '<th class="no-print"></th>' : ''}</tr></thead>
              <tbody>${dados.itens.map((x) => `<tr>
                <td class="num"><strong>${x.posicao}</strong></td>
                <td><strong>${EG.esc(x.aluno)}</strong><br><small>${EG.esc(x.ra)}${x.turma ? ' · ' + EG.esc(x.turma) : ''}${x.alunoStatus !== 'ativo' ? ' · ' + EG.esc(x.alunoStatus) : ''}</small></td>
                <td>${EG.esc(x.respNome || '—')}${x.respTelefone ? `<br><small>${EG.esc(x.respTelefone)}</small>` : ''}</td>
                <td>${x.vencidas}<br><small class="sub">${x.referencias.map(EG.nomeRef).join(', ')}</small></td>
                <td style="white-space:nowrap">${EG.data(x.maisAntiga)}<br><small class="sub">há ${x.diasAtraso} dia(s)</small></td>
                <td class="num" style="white-space:nowrap"><strong>${EG.moeda(x.total)}</strong></td>
                ${ver ? `<td class="acoes no-print"><button class="btn btn-secundario btn-pequeno" data-action="ir" data-pagina="mensalidades" data-ver-aluno="${EG.esc(x.ra)}" title="Abrir as mensalidades vencidas"><i class="ti ti-receipt"></i> Ver</button></td>` : ''}
              </tr>`).join('') || `<tr><td colspan="7"><div class="vazio"><i class="ti ti-mood-happy"></i>Nenhum aluno com mensalidade vencida</div></td></tr>`}</tbody>
            </table></div>
          </div>`;
      },
      csv() {
        return {
          nome: `inadimplentes-${dados.hoje}.csv`,
          cab: ['Posição', 'Aluno', 'RA', 'Turma', 'Situação do aluno', 'Responsável', 'Telefone', 'Mensalidades vencidas', 'Meses', 'Atraso desde', 'Dias de atraso', 'Total'],
          linhas: dados.itens.map((x) => [x.posicao, x.aluno, x.ra, x.turma || '', x.alunoStatus, x.respNome || '', x.respTelefone || '', x.vencidas,
            x.referencias.map(EG.nomeRef).join(' '), EG.data(x.maisAntiga), x.diasAtraso, x.total])
        };
      }
    },

    receita: {
      periodo: () => `Ano ${dados.ano} · por mês de referência`,
      filtros: selAno,
      html() {
        const t = dados.totais;
        return `
          <div class="grade-kpi">
            ${kpi('ti-target-arrow', 'var(--info-bg)', 'var(--info)', `Previsto em ${dados.ano}`, EG.moeda(t.previsto), `${t.qtd} mensalidade(s), já com descontos`)}
            ${kpi('ti-circle-check', 'var(--ok-bg)', 'var(--ok)', 'Recebido', EG.moeda(t.recebido), `${pct(t.percentual)} das parcelas previstas`)}
            ${kpi('ti-alert-triangle', 'var(--erro-bg)', 'var(--erro)', 'Em atraso', EG.moeda(t.emAtraso), 'vencidas e não pagas')}
            ${kpi('ti-clock', 'var(--roxo-bg)', 'var(--roxo)', 'A vencer', EG.moeda(t.aVencer), 'ainda no prazo')}
          </div>
          <div class="card">
            <div class="card-cab"><div class="card-titulo"><i class="ti ti-table"></i> Mês a mês</div></div>
            <p class="card-desc">Por mês de referência da mensalidade. "Recebido" inclui juros e multas cobrados; o percentual considera só o valor das parcelas pagas.</p>
            <div class="tabela-wrap"><table class="tabela-fluxo">
              <thead><tr><th>Mês</th><th>Mensalidades</th><th>Previsto</th><th>Recebido</th><th>Em atraso</th><th>A vencer</th><th style="width:20%;text-align:left">Recebido / previsto</th></tr></thead>
              <tbody>${dados.meses.map((x) => `<tr class="${dados.mesAtual === x.mes ? 'linha-atual' : ''}">
                <td><strong>${EG.MESES[x.mes - 1]}</strong></td><td>${x.qtd}</td><td>${EG.moeda(x.previsto)}</td><td>${EG.moeda(x.recebido)}</td>
                <td class="${x.emAtraso > 0 ? 'nota-baixa' : 'sub'}">${EG.moeda(x.emAtraso)}</td><td class="sub">${EG.moeda(x.aVencer)}</td>
                <td style="text-align:left">${x.previsto > 0 ? `<div class="medidor-linha">${medidor(x.percentual)}<span>${pct(x.percentual)}</span></div>` : '<span class="sub">—</span>'}</td></tr>`).join('')}</tbody>
              <tfoot><tr><td><strong>Total</strong></td><td><strong>${t.qtd}</strong></td><td><strong>${EG.moeda(t.previsto)}</strong></td><td><strong>${EG.moeda(t.recebido)}</strong></td>
                <td><strong>${EG.moeda(t.emAtraso)}</strong></td><td><strong>${EG.moeda(t.aVencer)}</strong></td>
                <td style="text-align:left"><div class="medidor-linha">${medidor(t.percentual)}<span><strong>${pct(t.percentual)}</strong></span></div></td></tr></tfoot>
            </table></div>
            ${t.descontos > 0 ? `<p class="card-desc" style="margin:12px 0 0">Sem os descontos de bolsas, o previsto seria ${EG.moeda(t.bruto)} (${EG.moeda(t.descontos)} em descontos).</p>` : ''}
          </div>`;
      },
      csv() {
        return {
          nome: `receita-prevista-recebida-${dados.ano}.csv`,
          cab: ['Mês', 'Mensalidades', 'Valor bruto', 'Descontos', 'Previsto', 'Recebido', 'Em atraso', 'A vencer', '% recebido'],
          linhas: dados.meses.map((x) => [EG.MESES[x.mes - 1], x.qtd, x.bruto, x.descontos, x.previsto, x.recebido, x.emAtraso, x.aVencer, x.percentual])
            .concat([['Total', dados.totais.qtd, dados.totais.bruto, dados.totais.descontos, dados.totais.previsto, dados.totais.recebido, dados.totais.emAtraso, dados.totais.aVencer, dados.totais.percentual]])
        };
      }
    },

    dre: {
      periodo: () => (dados.mes ? `${EG.MESES[dados.mes - 1]} de ${dados.ano}` : `Ano de ${dados.ano}`) + ' · pela data de pagamento',
      filtros: () => `${selAno()}<select class="select" data-filtro="mes" style="width:auto">
          <option value="">Ano inteiro</option>${EG.MESES.map((n, i) => `<option value="${i + 1}" ${Number(estado.mes) === i + 1 ? 'selected' : ''}>${n}</option>`).join('')}</select>`,
      html() {
        const d = dados;
        const a = d.anterior;
        const variacao = d.resultado - a.resultado;
        const linha = (rotulo, valor, p, cls = '') => `<tr class="${cls}"><td>${rotulo}</td><td class="num">${valor}</td><td class="num sub">${p === null || p === undefined ? '' : pct(p)}</td></tr>`;
        return `
          <div class="grade-kpi">
            ${kpi('ti-arrow-down-left', 'var(--info-bg)', 'var(--info)', 'Receitas', EG.moeda(d.receitas.total), `${d.receitas.qtd} mensalidade(s) recebida(s)`)}
            ${kpi('ti-arrow-up-right', 'var(--aviso-bg)', 'var(--aviso-tx)', 'Despesas', EG.moeda(d.despesas.total), `${d.despesas.qtd} conta(s) paga(s)`)}
            ${kpi('ti-scale', 'var(--ok-bg)', 'var(--ok)', 'Resultado', `<span class="${neg(d.resultado)}">${EG.moeda(d.resultado)}</span>`, d.margem === null ? 'sem receitas no período' : `margem de ${pct(d.margem)}`)}
            ${a.receitas || a.despesas
              ? kpi('ti-arrows-diff', 'var(--roxo-bg)', 'var(--roxo)', `Comparado a ${a.periodo}`, `<span class="${neg(variacao)}">${variacao >= 0 ? '+' : ''}${EG.moeda(variacao)}</span>`, `resultado anterior ${EG.moeda(a.resultado)}`)
              : kpi('ti-arrows-diff', 'var(--roxo-bg)', 'var(--roxo)', `Comparado a ${a.periodo}`, '—', `sem movimento em ${a.periodo}`)}
          </div>
          <div class="card">
            <div class="card-cab"><div class="card-titulo"><i class="ti ti-scale"></i> Demonstrativo · ${EG.esc(d.periodo)}</div></div>
            <div class="tabela-wrap"><table class="tabela-dre">
              <thead><tr><th>Descrição</th><th class="num">Valor</th><th class="num">% da receita</th></tr></thead>
              <tbody>
                ${linha('<strong>RECEITAS</strong>', `<strong>${EG.moeda(d.receitas.total)}</strong>`, d.receitas.total > 0 ? 100 : null, 'dre-grupo')}
                ${d.receitas.porForma.map((x) => linha(`<span class="dre-item">Mensalidades · ${EG.esc(x.forma)} <small class="sub">(${x.qtd})</small></span>`, EG.moeda(x.total), x.percentual)).join('')
                  || linha('<span class="dre-item sub">Nenhuma mensalidade recebida no período</span>', '', null)}
                ${linha('<strong>(−) DESPESAS</strong>', `<strong>${EG.moeda(d.despesas.total)}</strong>`, d.receitas.total > 0 ? (d.despesas.total / d.receitas.total) * 100 : null, 'dre-grupo')}
                ${d.despesas.porCategoria.map((x) => linha(`<span class="dre-item">${EG.esc(x.categoria)} <small class="sub">(${x.qtd})</small></span>`, EG.moeda(x.total), d.receitas.total > 0 ? x.percentual : null)).join('')
                  || linha('<span class="dre-item sub">Nenhuma conta paga no período</span>', '', null)}
                ${linha('<strong>(=) RESULTADO</strong>', `<strong class="${neg(d.resultado)}">${EG.moeda(d.resultado)}</strong>`, d.margem, 'dre-resultado')}
              </tbody>
            </table></div>
            <p class="card-desc" style="margin:12px 0 0">Regime de caixa: receitas pela data em que a mensalidade foi recebida e despesas pela data em que a conta foi paga.</p>
          </div>`;
      },
      csv() {
        const d = dados;
        return {
          nome: `dre-${d.ano}${d.mes ? '-' + String(d.mes).padStart(2, '0') : ''}.csv`,
          cab: ['Grupo', 'Descrição', 'Quantidade', 'Valor', '% da receita'],
          linhas: [['Receitas', 'Total de receitas', d.receitas.qtd, d.receitas.total, d.receitas.total > 0 ? 100 : '']]
            .concat(d.receitas.porForma.map((x) => ['Receitas', `Mensalidades - ${x.forma}`, x.qtd, x.total, x.percentual]))
            .concat([['Despesas', 'Total de despesas', d.despesas.qtd, d.despesas.total, '']])
            .concat(d.despesas.porCategoria.map((x) => ['Despesas', x.categoria, x.qtd, x.total, d.receitas.total > 0 ? x.percentual : '']))
            .concat([['Resultado', d.periodo, '', d.resultado, d.margem === null ? '' : d.margem], ['Resultado anterior', d.anterior.periodo, '', d.anterior.resultado, '']])
        };
      }
    },

    bolsas: {
      periodo: () => `Ano ${dados.ano} · mensalidades geradas`,
      filtros: selAno,
      html() {
        const r = dados.resumo;
        return `
          <div class="grade-kpi">
            ${kpi('ti-users', 'var(--roxo-bg)', 'var(--roxo)', 'Alunos com desconto', r.bolsistas, `${r.integrais} com bolsa integral`)}
            ${kpi('ti-discount-2', 'var(--info-bg)', 'var(--info)', 'Descontos concedidos', EG.moeda(r.descontoConcedido), 'nas mensalidades geradas')}
            ${kpi('ti-star', 'var(--aviso-bg)', 'var(--aviso-tx)', 'Bolsas integrais', EG.moeda(r.integraisEstimado), 'estimado pela mensalidade padrão')}
            ${kpi('ti-percentage', 'var(--erro-bg)', 'var(--erro)', 'Impacto total', EG.moeda(r.total), `${pct(r.percentual)} da receita sem descontos`)}
          </div>
          <div class="card">
            <div class="card-cab"><div class="card-titulo"><i class="ti ti-category"></i> Por tipo</div></div>
            <div class="tabela-wrap"><table>
              <thead><tr><th>Tipo</th><th class="num">Alunos</th><th class="num">Mensalidades</th><th class="num">Desconto</th><th style="width:28%">Parte do impacto</th></tr></thead>
              <tbody>${dados.porTipo.map((t) => `<tr><td><strong>${EG.esc(t.tipo)}</strong></td><td class="num">${t.alunos}</td><td class="num">${t.mensalidades}</td>
                <td class="num"><strong>${EG.moeda(t.desconto)}</strong></td><td><div class="medidor-linha">${medidor(t.percentual)}<span>${pct(t.percentual)}</span></div></td></tr>`).join('')
                || '<tr><td colspan="5"><div class="vazio"><i class="ti ti-discount-2"></i>Nenhum desconto no ano</div></td></tr>'}</tbody>
            </table></div>
          </div>
          <div class="card">
            <div class="card-cab"><div class="card-titulo"><i class="ti ti-user"></i> Por aluno</div></div>
            ${r.integraisEstimado > 0 ? `<p class="card-desc">Bolsa de 100% não gera mensalidade; o valor é estimado multiplicando a mensalidade padrão (${EG.moeda(dados.valorPadrao)}) pelos meses em que o colégio cobrou e a bolsa estava vigente.</p>` : ''}
            <div class="tabela-wrap"><table>
              <thead><tr><th>Aluno</th><th>Tipo</th><th class="num">Desconto</th><th class="num">Mensalidades</th><th class="num">Valor no ano</th></tr></thead>
              <tbody>${dados.alunos.map((x) => `<tr><td><strong>${EG.esc(x.aluno)}</strong>${x.turma ? `<br><small>${EG.esc(x.turma)}${x.alunoStatus !== 'ativo' ? ' · ' + EG.esc(x.alunoStatus) : ''}</small>` : ''}</td>
                <td>${EG.esc(x.tipo)}</td><td class="num">${x.percentual !== null && x.percentual !== undefined ? pct(x.percentual).replace(',0%', '%') : '—'}</td>
                <td class="num">${x.mensalidades}</td><td class="num"><strong>${EG.moeda(x.desconto)}</strong>${x.estimado ? '<br><small class="sub">estimado</small>' : ''}</td></tr>`).join('')
                || '<tr><td colspan="5"><div class="vazio">Nenhum aluno com desconto no ano</div></td></tr>'}</tbody>
            </table></div>
          </div>`;
      },
      csv() {
        return {
          nome: `bolsas-e-descontos-${dados.ano}.csv`,
          cab: ['Aluno', 'Turma', 'Situação do aluno', 'Tipo', '% desconto', 'Mensalidades', 'Valor no ano', 'Estimado'],
          linhas: dados.alunos.map((x) => [x.aluno, x.turma || '', x.alunoStatus, x.tipo, x.percentual ?? '', x.mensalidades, x.desconto, x.estimado ? 'sim' : 'não'])
        };
      }
    }
  };

  /* ---------- Tela ---------- */
  function render(el) {
    const rel = R[estado.aba];
    const titulo = ABAS.find((a) => a[0] === estado.aba)[1];
    el.innerHTML = `
      <div class="so-print relatorio-cab">
        <strong>${EG.esc(EG.estado.colegio.nome)}</strong>
        <span>${EG.esc(titulo)} · ${EG.esc(rel.periodo())}</span>
        <small>Emitido em ${EG.data(EG.hojeSP())} pelo EduGest</small>
      </div>
      <div class="card no-print">
        <div class="filtros" style="margin-bottom:12px">${ABAS.map(([id, rot, ic]) => `<button class="chip ${estado.aba === id ? 'ativo' : ''}" data-action="aba" data-aba="${id}"><i class="ti ${ic}"></i> ${rot}</button>`).join('')}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          ${rel.filtros ? rel.filtros() : ''}
          <span class="sub" style="flex:1;min-width:180px">${EG.esc(rel.periodo())}</span>
          <button class="btn btn-secundario" data-action="csv"><i class="ti ti-file-spreadsheet"></i> Exportar CSV</button>
          <button class="btn btn-secundario" data-action="imprimir"><i class="ti ti-printer"></i> Imprimir / PDF</button>
        </div>
      </div>
      <div class="relatorio-corpo" data-relatorio>${rel.html()}</div>`;
  }

  EG.registrarModulo('relatorios', {
    async render(el) {
      EG.filtrosDaSessao(estado, { aba: 'inadimplencia', ano: Number(EG.hojeSP().slice(0, 4)), mes: Number(EG.hojeSP().slice(5, 7)), turmaId: '' });
      [turmas] = await Promise.all([EG.api('GET', '/turmas').catch(() => []), carregar()]);
      render(el);
      const recarregar = async () => {
        try {
          await EG.gerando(el.querySelector('[data-relatorio]'), 'Gerando relatório...', carregar);
          render(el);
        } catch (e) { EG.toast(e.message, 'erro'); }
      };
      el.onclick = async (ev) => {
        const b = ev.target.closest('[data-action]');
        if (!b || !el.contains(b)) return;
        if (b.dataset.verAluno) {
          // Abre Mensalidades com as vencidas deste aluno (a navegação é tratada pelo shell)
          EG.filtroInicialMensalidades = { referencia: '', turmaId: '', busca: b.dataset.verAluno, status: 'vencida' };
          return;
        }
        if (b.dataset.action === 'aba') {
          estado.aba = b.dataset.aba;
          await EG.guarda(b, recarregar);
        } else if (b.dataset.action === 'csv') {
          const c = R[estado.aba].csv();
          EG.baixarCsv(c.nome, c.cab, c.linhas);
        } else if (b.dataset.action === 'imprimir') {
          window.print();
        }
      };
      el.onchange = async (ev) => {
        const f = ev.target.dataset.filtro;
        if (!f) return;
        if (f === 'ano') estado.ano = Number(ev.target.value);
        if (f === 'mes') estado.mes = ev.target.value ? Number(ev.target.value) : '';
        if (f === 'turma') estado.turmaId = ev.target.value;
        await recarregar();
      };
    }
  });
})(window.EG);
