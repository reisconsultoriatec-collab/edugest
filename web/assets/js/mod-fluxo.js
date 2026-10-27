/* =====================================================================
 *  EduGest — Fluxo de Caixa
 *  Realizado por data de pagamento; previsto pelo vencimento em aberto.
 *  Gráfico: colunas agrupadas (entradas × saídas) por mês, SVG próprio.
 *  Paleta validada (CVD e contraste) nos temas claro e escuro.
 * ===================================================================== */
'use strict';
(function (EG) {
  let dados = null;
  let ano = null;

  const compacto = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
  };

  function escala(max) {
    if (!max) return { topo: 1000, passo: 250 };
    const bruto = max / 4;
    const mag = 10 ** Math.floor(Math.log10(bruto));
    const passo = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((p) => p >= bruto);
    return { topo: passo * Math.ceil(max / passo), passo };
  }

  /** Coluna com topo arredondado (4px) e base reta. */
  function coluna(x, y, w, h) {
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  function grafico() {
    const W = 760; const H = 260;
    const m = { e: 64, d: 12, t: 14, b: 30 };
    const pw = W - m.e - m.d; const ph = H - m.t - m.b;
    const max = Math.max(...dados.meses.map((x) => Math.max(x.entradas, x.saidas)));
    const { topo, passo } = escala(max);
    const y = (v) => m.t + ph - (v / topo) * ph;
    const banda = pw / 12;
    const larg = Math.min(24, (banda - 16) / 2);
    let svg = '';
    for (let v = 0; v <= topo + 1e-9; v += passo) {
      svg += `<line x1="${m.e}" x2="${W - m.d}" y1="${y(v)}" y2="${y(v)}" class="g-grade"/>`
        + `<text x="${m.e - 8}" y="${y(v) + 4}" text-anchor="end" class="g-eixo">${compacto(v)}</text>`;
    }
    dados.meses.forEach((x, i) => {
      const x0 = m.e + i * banda;
      const par = larg * 2 + 2;
      const xi = x0 + (banda - par) / 2;
      svg += `<rect x="${x0}" y="${m.t}" width="${banda}" height="${ph}" class="g-faixa" data-mes="${i}"/>`;
      svg += `<path d="${coluna(xi, y(x.entradas), larg, y(0) - y(x.entradas))}" class="g-entradas"/>`;
      svg += `<path d="${coluna(xi + larg + 2, y(x.saidas), larg, y(0) - y(x.saidas))}" class="g-saidas"/>`;
      svg += `<text x="${x0 + banda / 2}" y="${H - 10}" text-anchor="middle" class="g-eixo ${dados.mesAtual === i + 1 ? 'g-atual' : ''}">${x.nome}</text>`;
    });
    svg += `<line x1="${m.e}" x2="${W - m.d}" y1="${y(0)}" y2="${y(0)}" class="g-base"/>`;
    return `<div class="grafico" data-grafico>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entradas e saídas por mês em ${dados.ano}. Os valores estão na tabela abaixo.">${svg}</svg>
      <div class="g-dica" hidden></div></div>`;
  }

  function kpi(icone, fundo, cor, rotulo, valor, obs) {
    return `<div class="kpi"><div class="kpi-icone" style="background:${fundo};color:${cor}"><i class="ti ${icone}"></i></div>
      <div><div class="kpi-rotulo">${rotulo}</div><div class="kpi-valor" style="font-size:20px">${valor}</div><div class="kpi-obs">${EG.esc(obs)}</div></div></div>`;
  }

  function lista(titulo, icone, itens, vazio) {
    return `<div class="card" style="margin:0"><div class="card-cab"><div class="card-titulo"><i class="ti ${icone}"></i> ${titulo}</div></div>
      ${itens.length ? `<ul class="lista-atividade">${itens.map((x) => `<li>
        <span><strong>${EG.esc(x.descricao)}</strong><br><small class="sub">${EG.data(x.data)}${x.detalhe ? ' · ' + EG.esc(x.detalhe) : ''}</small></span>
        <span class="quando" style="font-size:13px;color:var(--text);font-weight:600">${EG.moeda(x.valor)}</span></li>`).join('')}</ul>`
        : `<div class="vazio">${vazio}</div>`}</div>`;
  }

  function render(el) {
    const t = dados.totais;
    const mesA = dados.mesAtual ? dados.meses[dados.mesAtual - 1] : null;
    const neg = (v) => (v < 0 ? 'nota-baixa' : '');
    const kpis = mesA
      ? kpi('ti-arrow-down-left', 'var(--info-bg)', 'var(--info)', `Entradas em ${EG.MESES[mesA.mes - 1].toLowerCase()}`, EG.moeda(mesA.entradas), 'mensalidades recebidas')
        + kpi('ti-arrow-up-right', 'var(--aviso-bg)', 'var(--aviso-tx)', `Saídas em ${EG.MESES[mesA.mes - 1].toLowerCase()}`, EG.moeda(mesA.saidas), 'contas pagas')
        + kpi('ti-scale', 'var(--ok-bg)', 'var(--ok)', 'Saldo do mês', `<span class="${neg(mesA.saldo)}">${EG.moeda(mesA.saldo)}</span>`, 'entradas − saídas')
        + kpi('ti-calendar-stats', 'var(--roxo-bg)', 'var(--roxo)', `Saldo de ${dados.ano}`, `<span class="${neg(t.saldo)}">${EG.moeda(t.saldo)}</span>`, `${EG.moeda(t.entradas)} − ${EG.moeda(t.saidas)}`)
      : kpi('ti-arrow-down-left', 'var(--info-bg)', 'var(--info)', `Entradas em ${dados.ano}`, EG.moeda(t.entradas), 'mensalidades recebidas')
        + kpi('ti-arrow-up-right', 'var(--aviso-bg)', 'var(--aviso-tx)', `Saídas em ${dados.ano}`, EG.moeda(t.saidas), 'contas pagas')
        + kpi('ti-scale', 'var(--ok-bg)', 'var(--ok)', `Saldo de ${dados.ano}`, `<span class="${neg(t.saldo)}">${EG.moeda(t.saldo)}</span>`, 'entradas − saídas')
        + kpi('ti-hourglass', 'var(--roxo-bg)', 'var(--roxo)', 'Em aberto no ano', EG.moeda(t.previstoEntradas - t.previstoSaidas), 'a receber − a pagar');

    el.innerHTML = `
      <div class="grade-kpi">${kpis}</div>
      <div class="card">
        <div class="card-cab">
          <div class="card-titulo"><i class="ti ti-chart-bar"></i> Entradas e saídas · ${dados.ano}</div>
          <select class="select" data-filtro="ano" style="width:auto">${dados.anos.map((a) => `<option ${a === dados.ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
        </div>
        <div class="g-legenda"><span><i class="g-chave g-entradas"></i> Entradas (mensalidades recebidas)</span><span><i class="g-chave g-saidas"></i> Saídas (contas pagas)</span></div>
        <div class="tabela-wrap">${grafico()}</div>
      </div>
      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-table"></i> Mês a mês</div></div>
        <p class="card-desc">Realizado pela data de pagamento. Previsto: valores em aberto pelo vencimento.</p>
        <div class="tabela-wrap"><table class="tabela-fluxo">
          <thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo</th><th>Acumulado</th><th>A receber</th><th>A pagar</th></tr></thead>
          <tbody>${dados.meses.map((x) => `<tr class="${dados.mesAtual === x.mes ? 'linha-atual' : ''}">
            <td><strong>${EG.MESES[x.mes - 1]}</strong></td><td>${EG.moeda(x.entradas)}</td><td>${EG.moeda(x.saidas)}</td>
            <td class="${neg(x.saldo)}">${EG.moeda(x.saldo)}</td><td class="${neg(x.saldoAcumulado)}">${EG.moeda(x.saldoAcumulado)}</td>
            <td class="sub">${EG.moeda(x.previstoEntradas)}</td><td class="sub">${EG.moeda(x.previstoSaidas)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td><strong>Total</strong></td><td><strong>${EG.moeda(t.entradas)}</strong></td><td><strong>${EG.moeda(t.saidas)}</strong></td>
            <td class="${neg(t.saldo)}"><strong>${EG.moeda(t.saldo)}</strong></td><td></td>
            <td><strong>${EG.moeda(t.previstoEntradas)}</strong></td><td><strong>${EG.moeda(t.previstoSaidas)}</strong></td></tr></tfoot>
        </table></div>
      </div>
      <div class="linha-2" style="gap:20px">
        ${lista('Últimos recebimentos', 'ti-arrow-down-left', dados.ultimasEntradas, 'Nenhum recebimento no ano')}
        ${lista('Últimos pagamentos', 'ti-arrow-up-right', dados.ultimasSaidas, 'Nenhum pagamento no ano')}
      </div>`;
    ligarDica(el);
  }

  /** Dica ao passar o mouse (ou tocar) em um mês do gráfico. */
  function ligarDica(el) {
    const caixa = EG.$('[data-grafico]', el);
    if (!caixa) return;
    const dica = caixa.querySelector('.g-dica');
    const mostrar = (ev) => {
      const faixa = ev.target.closest('[data-mes]');
      EG.$$('.g-faixa', caixa).forEach((f) => f.classList.toggle('ativa', f === faixa));
      if (!faixa) { dica.hidden = true; return; }
      const x = dados.meses[Number(faixa.dataset.mes)];
      dica.innerHTML = `<strong>${EG.MESES[x.mes - 1]} de ${dados.ano}</strong>
        <div><i class="g-chave g-entradas"></i> Entradas <b>${EG.moeda(x.entradas)}</b></div>
        <div><i class="g-chave g-saidas"></i> Saídas <b>${EG.moeda(x.saidas)}</b></div>
        <div class="g-dica-saldo">Saldo <b>${EG.moeda(x.saldo)}</b></div>`;
      dica.hidden = false;
      const r = caixa.getBoundingClientRect();
      const fr = faixa.getBoundingClientRect();
      const cx = fr.left + fr.width / 2 - r.left;
      dica.style.left = `${Math.min(Math.max(cx - dica.offsetWidth / 2, 4), r.width - dica.offsetWidth - 4)}px`;
    };
    caixa.addEventListener('mousemove', mostrar);
    caixa.addEventListener('click', mostrar);
    caixa.addEventListener('mouseleave', () => {
      dica.hidden = true;
      EG.$$('.g-faixa', caixa).forEach((f) => f.classList.remove('ativa'));
    });
  }

  EG.registrarModulo('fluxo', {
    async render(el) {
      dados = await EG.api('GET', '/fluxo' + (ano ? `?ano=${ano}` : ''));
      ano = dados.ano;
      render(el);
      el.onchange = async (ev) => {
        if (ev.target.dataset.filtro !== 'ano') return;
        ano = Number(ev.target.value);
        try { dados = await EG.gerando(el, 'Gerando o fluxo de caixa...', () => EG.api('GET', `/fluxo?ano=${ano}`)); render(el); } catch (e) { EG.toast(e.message, 'erro'); }
      };
    }
  });
})(window.EG);
