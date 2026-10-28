/* =====================================================================
 *  EduGest — Painel da Direção   [alta direção do colégio e proprietário]
 *  Visão do colégio no ano letivo: indicadores, finanças, alunos,
 *  pedagógico e captação, com gráficos.
 *  · Modo TV: tela cheia, tema escuro, relógio, rolagem automática que
 *    desce e sobe sozinha e atualização a cada 5 minutos.
 *  · Enquanto o painel está aberto, a sessão não encerra por inatividade;
 *    ao sair dele, volta a regra do colégio.
 * ===================================================================== */
'use strict';
(function (EG) {
  const ATUALIZA_MS = 5 * 60 * 1000;
  const CHAVE_ROLAGEM = 'edugest_direcao_rolagem';
  const est = { dados: null, el: null, timers: [], tv: false, temaAntes: null, rolagem: false, tabela: {}, obs: null };
  const esc = (s) => EG.esc(s);
  const moeda0 = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const moedaCurta = (v) => (Math.abs(v) >= 100000 ? `R$ ${EG.compacto(v)}` : moeda0(v));
  const pct = (v) => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')}%`);
  const nota = (v) => (v === null || v === undefined ? '—' : EG.fmtNota(v));
  const mesCurto = (m) => EG.MESES_CURTOS[Number(m.slice(5, 7)) - 1];
  const mesLongo = (m) => `${EG.MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
  /** "Quarta-feira, 28 de outubro" */
  const dataLonga = (d) => { const t = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const lerPref = () => { try { return localStorage.getItem(CHAVE_ROLAGEM) === '1'; } catch (e) { return false; } };
  const salvarPref = (v) => { try { localStorage.setItem(CHAVE_ROLAGEM, v ? '1' : '0'); } catch (e) { /* sem armazenamento */ } };
  const TIPOS_EVENTO = { evento: 'Evento', prova: 'Prova', reuniao: 'Reunião', conselho: 'Conselho de classe', feriado: 'Feriado', recesso: 'Recesso', letivo: 'Dia letivo extra' };
  /** A tela ainda está aberta (e a pessoa conectada)? */
  const vivo = () => !!(est.el && est.el.isConnected && !EG.$('#app').hidden);

  /* =================== Indicadores (topo) =================== */
  function tile(icone, rotulo, valor, obs, extra = '') {
    return `<div class="dir-kpi"><div class="dir-kpi-cab"><i class="ti ${icone}"></i><span>${rotulo}</span></div>
      <div class="dir-kpi-valor">${valor}</div>${extra}<div class="dir-kpi-obs">${obs}</div></div>`;
  }
  function kpis(d) {
    const k = d.kpis;
    const delta = k.inicioDoAno !== null && k.inicioDoAno !== undefined ? k.ativos - k.inicioDoAno : null;
    const rm = k.receitaMes;
    const medidor = (v) => `<div class="dir-medidor" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, v || 0)}"><span style="width:${Math.min(100, v || 0)}%"></span></div>`;
    return `<section class="dir-kpis">
      ${tile('ti-users', 'Alunos ativos', esc(k.ativos),
        `${k.ocupacao !== null ? `ocupação ${pct(k.ocupacao)} · ${plural(k.vagas, 'vaga', 'vagas')}` : 'sem capacidade definida nas turmas'}${k.semTurma ? ` · ${k.semTurma} sem turma` : ''}`,
        delta === null || (delta === 0 && !k.ativos) ? ''
          : delta === 0 ? '<div class="dir-delta igual"><i class="ti ti-minus"></i> igual a janeiro</div>'
            : `<div class="dir-delta ${delta > 0 ? 'sobe' : 'desce'}"><i class="ti ${delta > 0 ? 'ti-arrow-up-right' : 'ti-arrow-down-right'}"></i> ${delta > 0 ? '+' : ''}${delta} desde janeiro</div>`)}
      ${tile('ti-cash', `Receita de ${EG.MESES[Number(d.hoje.slice(5, 7)) - 1].toLowerCase()}`, moedaCurta(rm.recebido),
        rm.previsto ? `de ${moedaCurta(rm.previsto)} previstos (${pct(rm.percentual)})` : 'nenhuma mensalidade vence neste mês', rm.previsto ? medidor(rm.percentual) : '')}
      ${tile('ti-alert-triangle', 'Inadimplência no ano', pct(k.inadimplencia.percentual),
        `${moedaCurta(k.inadimplencia.emAberto)} em aberto · ${plural(k.inadimplencia.alunos, 'aluno', 'alunos')}`)}
      ${tile('ti-calendar-check', 'Frequência média', pct(k.frequenciaMedia), `mínimo do colégio: ${d.criterios.frequenciaMinima}%`)}
      ${tile('ti-school', 'Média geral', nota(k.mediaGeral), `aprovação com ${nota(d.criterios.mediaAprovacao)} · ${plural(k.atencao.total, 'aluno', 'alunos')} em atenção`)}
      ${tile('ti-filter', 'Conversão da captação', pct(k.captacao.conversao),
        `${plural(k.captacao.interessados, 'interessado', 'interessados')} em 12 meses · ${plural(k.captacao.matriculados, 'matrícula', 'matrículas')}`)}
    </section>`;
  }

  /* =================== Presença em sala (topo) =================== */
  const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const SEMANA_LONGA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const dow = (s) => new Date(`${s}T12:00:00Z`).getUTCDay();
  const ddmm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  const pctInteiro = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);
  function blocoPresenca(d) {
    const p = d.presenca;
    if (!p) return '';
    const r = p.resumo; const lim = p.alerta;
    const nomeDia = r.data ? (r.ehHoje ? `hoje, ${SEMANA_LONGA[dow(r.data)]} ${ddmm(r.data)}` : `${SEMANA_LONGA[dow(r.data)]} ${ddmm(r.data)} (último dia letivo)`) : '';
    const sub = !p.turmas.length ? 'Nenhuma turma no ano letivo'
      : !r.data ? 'Sem dias letivos nas últimas semanas (férias ou calendário sem bimestre)'
        : r.alunos ? `${nomeDia} · <strong>${pct(r.percentual)}</strong> dos alunos presentes (${r.presentes} de ${r.alunos}) · chamada em ${r.turmasComChamada} de ${r.turmas} turmas`
          : `${nomeDia} · nenhuma chamada lançada ${r.ehHoje ? 'ainda' : 'no dia'}`;
    // Alerta: pisca só quando é o dia de hoje (dias anteriores ficam em vermelho, parados)
    const banner = r.emAlerta.length ? `<div class="dir-pres-aviso ${r.ehHoje ? 'piscando' : ''}" role="alert">
        <i class="ti ti-alert-triangle"></i><span><strong>Presença abaixo de ${lim}% ${r.ehHoje ? 'hoje' : `em ${ddmm(r.data)}`}:</strong>
        ${r.emAlerta.map((a) => `${esc(a.turma)} (${pct(a.percentual)})`).join(' · ')}</span></div>` : '';
    const tiles = p.turmas.map((t) => {
      const dia = t.dias.length ? t.dias[t.dias.length - 1] : null;
      const tem = dia && dia.alunos;
      const local = [t.sala ? `Sala ${esc(t.sala)}` : '', t.periodo ? esc(EG.PERIODOS[t.periodo] || t.periodo) : ''].filter(Boolean).join(' · ');
      const det = tem ? [`${dia.presentes} de ${dia.alunos} presentes`, dia.faltas ? plural(dia.faltas, 'falta', 'faltas') : '', dia.justificadas ? plural(dia.justificadas, 'justificada', 'justificadas') : ''].filter(Boolean).join(' · ')
        : r.ehHoje ? 'chamada ainda não lançada' : 'sem chamada no dia';
      const mini = t.dias.map((x) => {
        const cls = [x.percentual === null ? 'vazio' : x.percentual < lim ? 'baixo' : '', x.data === p.principal ? 'atual' : ''].filter(Boolean).join(' ');
        const dica = `${SEMANA[dow(x.data)]} ${ddmm(x.data)}: ${x.alunos ? `${x.presentes} de ${x.alunos} presentes (${pct(x.percentual)})` : 'sem chamada'}`;
        return `<span class="${cls}" title="${esc(dica)}"><b>${SEMANA[dow(x.data)]}</b><em>${pctInteiro(x.percentual)}</em></span>`;
      }).join('');
      const largura = tem ? Math.min(100, dia.percentual) : 0;
      return `<div class="dir-pres-turma ${t.alerta ? `alerta ${r.ehHoje ? 'piscando' : ''}` : ''} ${tem ? '' : 'sem'}" data-presenca-turma="${t.turmaId}">
          <strong class="dir-pres-nome" title="${esc(t.turma)}">${esc(t.turma)}</strong>
          <small class="dir-pres-local">${local || '&nbsp;'}</small>
          <div class="dir-pres-valor">${tem ? pct(dia.percentual) : '—'}${t.alerta ? `<span class="dir-pres-selo"><i class="ti ti-alert-triangle"></i> abaixo de ${lim}%</span>` : ''}</div>
          <div class="dir-pres-barra" role="meter" aria-label="Presença" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${largura}"><span style="width:${largura}%"></span><i style="left:${lim}%" title="${lim}%"></i></div>
          <div class="dir-pres-obs">${det}</div>
          <div class="dir-pres-dias">${mini}</div>
        </div>`;
    }).join('');
    return `<section class="dir-card dir-presenca" data-cartao="presenca">
        <header class="dir-card-cab"><div><h3><i class="ti ti-school"></i> Presença em sala</h3><p>${sub}</p></div>
          <span class="dir-pres-regra">alerta abaixo de ${lim}%</span></header>
        ${banner}
        ${p.turmas.length && r.data ? `<div class="dir-pres-grade">${tiles}</div>
          <p class="dir-pres-nota">Aluno presente em pelo menos uma aula do dia conta como presente. Os quadradinhos mostram os últimos ${p.dias.length} dias letivos de cada turma.</p>` : ''}
      </section>`;
  }

  /* =================== Cartões dos gráficos =================== */
  const legenda = (itens) => `<div class="dir-legenda">${itens.map(([c, nome, tipo]) =>
    `<span><i class="dir-chave ${tipo === 'linha' ? 'linha' : ''}" style="--c:var(--g-${c})"></i>${esc(nome)}</span>`).join('')}</div>`;
  function cartao(id, { titulo, sub = '', leg = '', classe = '', corpo = null, altura = '' }) {
    const tab = !!est.tabela[id];
    return `<article class="dir-card ${classe}" data-cartao="${id}">
      <header class="dir-card-cab"><div><h3>${titulo}</h3>${sub ? `<p>${sub}</p>` : ''}</div>
        ${corpo === null ? `<button class="btn-icone dir-so-tela" data-acao="tabela" data-id="${id}" title="${tab ? 'Ver gráfico' : 'Ver tabela'}" aria-label="${tab ? 'Ver gráfico' : 'Ver tabela'}"><i class="ti ${tab ? 'ti-chart-bar' : 'ti-table'}"></i></button>` : ''}</header>
      ${leg}
      ${corpo !== null ? corpo : tab ? `<div class="dir-tabela" data-tabela="${id}"></div>` : `<div class="dir-grafico ${altura}" data-grafico="${id}"></div>`}
    </article>`;
  }
  const vazio = (txt) => `<div class="dir-vazio"><i class="ti ti-chart-dots"></i>${txt}</div>`;

  function montar(d) {
    const mesAt = d.hoje.slice(0, 7);
    const rec = d.receitaMensal; const flu = d.fluxoMensal;
    const temReceita = rec.some((m) => m.previsto || m.recebido);
    const saldo = d.kpis.receitaAno.entradas - d.kpis.receitaAno.saidas;
    const temFluxo = flu.some((m) => m.entradas || m.saidas);
    const temInad = d.inadimplenciaMensal.some((m) => m.percentual !== null);
    const k = d.kpis;
    return `
      ${blocoPresenca(d)}
      ${kpis(d)}
      <div class="dir-grade">
        ${cartao('receita', { titulo: 'Receita das mensalidades', classe: 'larga',
          sub: `${moedaCurta(k.receitaAno.recebido)} recebidos de ${moedaCurta(k.receitaAno.previsto)} previstos em ${d.anoLetivo} · por mês de vencimento`,
          leg: temReceita ? legenda([['s1', 'Recebido'], ['s2', 'Vencido e não pago'], ['neutro', 'A vencer']]) : '',
          corpo: temReceita ? null : vazio('Nenhuma mensalidade no ano letivo') })}
        ${cartao('fluxo', { titulo: 'Fluxo de caixa',
          sub: `Saldo no ano: <strong>${moedaCurta(saldo)}</strong> · entradas de mensalidades e contas pagas, pelo mês do pagamento`,
          leg: temFluxo ? legenda([['s1', 'Entradas'], ['s2', 'Saídas']]) : '',
          corpo: temFluxo ? null : vazio('Nenhum pagamento registrado no ano') })}
        ${cartao('inadimplencia', { titulo: 'Inadimplência por mês',
          sub: 'Do que venceu no mês, quanto ainda não foi pago', corpo: temInad ? null : vazio('Nenhuma mensalidade vencida ainda') })}
        ${cartao('alunos', { titulo: 'Alunos ativos ao longo do ano',
          sub: `${plural(k.entradasAno, 'entrada', 'entradas')} e ${plural(k.saidasAno, 'saída', 'saídas')} em ${d.anoLetivo}`,
          corpo: d.alunosMensal.some((m) => m.ativos) ? null : vazio('Nenhum aluno ativo no ano letivo') })}
        ${cartao('ocupacao', { titulo: 'Ocupação das turmas',
          sub: k.capacidade ? `${k.ativos - k.semTurma} de ${k.capacidade} vagas ocupadas (${pct(k.ocupacao)})` : 'Defina a capacidade de cada turma para ver as vagas',
          corpo: d.ocupacaoTurmas.length ? null : vazio('Nenhuma turma no ano letivo') })}
        ${cartao('frequencia', { titulo: 'Frequência por turma',
          sub: `Média do colégio: ${pct(k.frequenciaMedia)} · mínimo ${d.criterios.frequenciaMinima}%`,
          corpo: d.frequenciaTurmas.length ? null : vazio('Nenhuma chamada registrada ainda') })}
        ${cartao('medias', { titulo: 'Médias por disciplina',
          sub: `Média geral ${nota(k.mediaGeral)} · aprovação com ${nota(d.criterios.mediaAprovacao)}`,
          corpo: d.mediasDisciplinas.length ? null : vazio('Nenhuma nota lançada ainda') })}
        ${cartao('captacao', { titulo: 'Captação de alunos (12 meses)',
          sub: `Conversão ${pct(k.captacao.conversao)} · ${plural(k.captacao.emAndamento, 'interessado em andamento', 'interessados em andamento')}`,
          corpo: k.captacao.interessados ? null : vazio('Nenhum interessado nos últimos 12 meses') })}
        ${cartao('despesas', { titulo: 'Despesas pagas por categoria',
          sub: `${moedaCurta(k.receitaAno.saidas)} em ${d.anoLetivo}`, corpo: d.despesasCategorias.length ? null : vazio('Nenhuma conta paga no ano') })}
        ${cartao('atencao', { titulo: 'Alunos que precisam de atenção', corpo: blocoAtencao(d) })}
        ${cartao('agenda', { titulo: 'Próximos eventos', corpo: blocoAgenda(d) })}
      </div>
      <p class="dir-rodape">Ano letivo ${d.anoLetivo} · mês atual: ${mesLongo(mesAt)} · números do colégio todo, calculados às ${esc(String(d.geradoEm).slice(11, 16))}.</p>`;
  }

  function blocoAtencao(d) {
    const a = d.kpis.atencao;
    return `<div class="dir-numeros">
        <div><strong>${a.total}</strong><span>${a.total === 1 ? 'aluno' : 'alunos'} no total</span></div>
        <div><strong>${a.porFrequencia}</strong><span>pela frequência</span></div>
        <div><strong>${a.porMedia}</strong><span>pela média</span></div>
      </div>
      <p class="dir-obs">Frequência abaixo de ${d.criterios.frequenciaMinima}% ou média abaixo de ${nota(d.criterios.mediaAprovacao)} em alguma disciplina.</p>
      <button class="btn btn-secundario btn-pequeno dir-so-tela" data-action="ir" data-pagina="dashboard"><i class="ti ti-list-details"></i> Ver a lista no Dashboard</button>`;
  }
  function blocoAgenda(d) {
    if (!d.eventos.length) return vazio('Nada marcado no calendário');
    return `<ul class="dir-agenda">${d.eventos.map((e) => `<li>
        <span class="dir-data"><strong>${e.data.slice(8, 10)}</strong>${EG.MESES_CURTOS[Number(e.data.slice(5, 7)) - 1]}</span>
        <span><strong>${esc(e.titulo)}</strong><small>${esc(TIPOS_EVENTO[e.tipo] || e.tipo)}${e.hora ? ` · ${esc(e.hora)}` : ''}${e.dataFim && e.dataFim !== e.data ? ` · até ${EG.data(e.dataFim).slice(0, 5)}` : ''}</small></span>
      </li>`).join('')}</ul>`;
  }

  /* ---------- Desenho dos gráficos ---------- */
  function graficos(raiz, d) {
    const meses = d.receitaMensal.map((m) => mesCurto(m.mes));
    const longos = d.receitaMensal.map((m) => mesLongo(m.mes));
    const mesAtI = d.receitaMensal.findIndex((m) => m.mes === d.hoje.slice(0, 7));
    const el = (id) => raiz.querySelector(`[data-grafico="${id}"]`);
    if (el('receita')) {
      EG.graf.colunas(el('receita'), {
        categorias: meses, rotulosDica: longos, empilhar: true, destaque: mesAtI, formato: (v) => EG.moeda(v),
        series: [
          { nome: 'Recebido', cor: 's1', valores: d.receitaMensal.map((m) => m.recebido) },
          { nome: 'Vencido e não pago', cor: 's2', valores: d.receitaMensal.map((m) => m.vencido) },
          { nome: 'A vencer', cor: 'neutro', valores: d.receitaMensal.map((m) => m.emAberto) }
        ],
        extraDica: (i) => [{ nome: 'previsto', valor: EG.moeda(d.receitaMensal[i].previsto) }]
      });
    }
    if (el('fluxo')) {
      EG.graf.colunas(el('fluxo'), {
        categorias: meses, rotulosDica: longos, destaque: mesAtI, formato: (v) => EG.moeda(v),
        series: [
          { nome: 'Entradas', cor: 's1', valores: d.fluxoMensal.map((m) => m.entradas) },
          { nome: 'Saídas', cor: 's2', valores: d.fluxoMensal.map((m) => m.saidas) }
        ],
        extraDica: (i) => (d.fluxoMensal[i].saldo === null ? [] : [{ nome: 'saldo do mês', valor: EG.moeda(d.fluxoMensal[i].saldo) }])
      });
    }
    if (el('inadimplencia')) {
      EG.graf.linha(el('inadimplencia'), {
        categorias: meses, rotulosDica: longos, valores: d.inadimplenciaMensal.map((m) => m.percentual), nome: 'não pago do que venceu',
        cor: 's2', minimoEixo: 10, formatoEixo: (v) => `${v}%`, formato: pct
      });
    }
    if (el('alunos')) {
      EG.graf.linha(el('alunos'), {
        categorias: meses, rotulosDica: longos, valores: d.alunosMensal.map((m) => m.ativos), nome: 'alunos ativos', cor: 's1', area: true,
        minimoEixo: 5, formatoEixo: (v) => EG.compacto(v), formato: (v) => String(v)
      });
    }
    if (el('ocupacao')) {
      EG.graf.barras(el('ocupacao'), {
        nome: 'alunos', cor: 's1',
        itens: d.ocupacaoTurmas.map((t) => ({
          rotulo: t.turma, valor: t.alunos, total: t.capacidade || null, alerta: t.capacidade && t.alunos > t.capacidade,
          texto: t.capacidade ? `${t.alunos}/${t.capacidade}` : String(t.alunos),
          dica: [{ cor: 's1', nome: 'alunos', valor: String(t.alunos) }, ...(t.capacidade ? [{ cor: 'trilho', nome: 'vagas no total', valor: String(t.capacidade) }, { nome: 'vagas livres', valor: String(Math.max(0, t.capacidade - t.alunos)) }] : [])]
        }))
      });
    }
    if (el('frequencia')) {
      const min = d.criterios.frequenciaMinima;
      EG.graf.barras(el('frequencia'), {
        nome: 'frequência', cor: 's1', max: 100, referencia: { valor: min, rotulo: `mínimo ${min}%` },
        itens: d.frequenciaTurmas.map((t) => ({ rotulo: t.turma, valor: t.percentual, alerta: t.percentual < min,
          texto: `${pct(t.percentual)}${t.percentual < min ? ' ▼' : ''}`,
          dica: [{ cor: 's1', nome: 'frequência', valor: pct(t.percentual) }, { nome: 'registros de chamada', valor: String(t.registros) }] }))
      });
    }
    if (el('medias')) {
      const ma = d.criterios.mediaAprovacao;
      EG.graf.barras(el('medias'), {
        nome: 'média', cor: 's1', max: 10, referencia: { valor: ma, rotulo: `aprovação ${nota(ma)}` },
        itens: d.mediasDisciplinas.map((x) => ({ rotulo: x.disciplina, valor: x.media, alerta: x.media < ma,
          texto: `${nota(x.media)}${x.alunosAbaixo ? ` · ${x.alunosAbaixo} abaixo` : ''}`,
          dica: [{ cor: 's1', nome: 'média', valor: nota(x.media) }, { nome: 'alunos abaixo da média', valor: String(x.alunosAbaixo) }] }))
      });
    }
    if (el('captacao')) {
      EG.graf.barras(el('captacao'), {
        nome: 'interessados', cor: 's1',
        itens: d.captacaoEtapas.map((e) => ({ rotulo: e.rotulo, valor: e.quantidade, cor: e.etapa === 'perdido' ? 'neutro' : 's1', texto: String(e.quantidade) }))
      });
    }
    if (el('despesas')) {
      EG.graf.barras(el('despesas'), {
        nome: 'pago no ano', cor: 's1', formato: (v) => moedaCurta(v),
        itens: d.despesasCategorias.map((c) => ({ rotulo: c.nome, valor: c.valor, texto: moedaCurta(c.valor), dica: [{ cor: 's1', nome: 'pago no ano', valor: EG.moeda(c.valor) }] }))
      });
    }
    raiz.querySelectorAll('[data-tabela]').forEach((t) => { t.innerHTML = tabela(t.dataset.tabela, d); });
  }

  /* ---------- Tabelas (o mesmo dado do gráfico, sem depender de cor) ---------- */
  function tabela(id, d) {
    const t = (cab, linhas) => `<div class="tabela-wrap"><table><thead><tr>${cab.map((c, i) => `<th${i ? ' class="num"' : ''}>${c}</th>`).join('')}</tr></thead>
      <tbody>${linhas.map((l) => `<tr>${l.map((c, i) => `<td${i ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const m = (v) => (v === null || v === undefined ? '—' : EG.moeda(v));
    if (id === 'receita') return t(['Mês', 'Previsto', 'Recebido', 'Vencido', 'A vencer'], d.receitaMensal.map((x) => [mesLongo(x.mes), m(x.previsto), m(x.recebido), m(x.vencido), m(x.emAberto)]));
    if (id === 'fluxo') return t(['Mês', 'Entradas', 'Saídas', 'Saldo'], d.fluxoMensal.map((x) => [mesLongo(x.mes), m(x.entradas), m(x.saidas), m(x.saldo)]));
    if (id === 'inadimplencia') return t(['Mês', 'Não pago do que venceu'], d.inadimplenciaMensal.map((x) => [mesLongo(x.mes), pct(x.percentual)]));
    if (id === 'alunos') return t(['Mês', 'Alunos ativos'], d.alunosMensal.map((x) => [mesLongo(x.mes), x.ativos === null ? '—' : String(x.ativos)]));
    if (id === 'ocupacao') return t(['Turma', 'Alunos', 'Capacidade', 'Ocupação'], d.ocupacaoTurmas.map((x) => [x.turma, String(x.alunos), x.capacidade ? String(x.capacidade) : '—', x.capacidade ? pct(Math.round((x.alunos / x.capacidade) * 1000) / 10) : '—']));
    if (id === 'frequencia') return t(['Turma', 'Frequência', 'Registros'], d.frequenciaTurmas.map((x) => [x.turma, pct(x.percentual), String(x.registros)]));
    if (id === 'medias') return t(['Disciplina', 'Média', 'Alunos abaixo'], d.mediasDisciplinas.map((x) => [x.disciplina, nota(x.media), String(x.alunosAbaixo)]));
    if (id === 'captacao') return t(['Etapa', 'Interessados'], d.captacaoEtapas.map((x) => [x.rotulo, String(x.quantidade)]));
    if (id === 'despesas') return t(['Categoria', 'Pago no ano'], d.despesasCategorias.map((x) => [x.nome, m(x.valor)]));
    return '';
  }

  /* =================== Página =================== */
  function cabecalho(d) {
    const hora = new Date();
    return `<div class="dir-tv-cab">
        <div class="dir-tv-marca">${EG.logo ? EG.logo('clara') : ''}<div><strong>Painel da Direção</strong><span data-atualizado-tv>${esc(d.colegio || '')} · ano letivo ${d.anoLetivo} · atualizado às ${esc(String(d.geradoEm).slice(11, 16))}</span></div></div>
        <div class="dir-tv-relogio"><strong data-relogio>${hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
          <span data-data>${dataLonga(hora)}</span></div>
        <div class="dir-tv-acoes">
          <span class="dir-tv-status" data-status-rolagem></span>
          <button class="btn btn-secundario btn-pequeno" data-acao="rolagem"><i class="ti ti-player-pause"></i> Pausar rolagem</button>
          <button class="btn btn-secundario btn-pequeno" data-acao="sair-tv"><i class="ti ti-x"></i> Sair do modo TV</button>
        </div>
      </div>
      <div class="dir-cab card">
        <div><h2>Painel da Direção</h2><p class="sub" data-atualizado>${esc(d.colegio || '')} · ano letivo ${d.anoLetivo} · atualizado às ${esc(String(d.geradoEm).slice(11, 16))} · atualiza sozinho a cada 5 minutos</p></div>
        <div class="dir-cab-acoes">
          <label class="dir-alterna"><input type="checkbox" data-acao="rolagem-auto" ${est.rolagem ? 'checked' : ''}> Rolagem automática</label>
          <button class="btn btn-secundario btn-pequeno" data-acao="atualizar"><i class="ti ti-refresh"></i> Atualizar</button>
          <button class="btn btn-primario btn-pequeno" data-acao="tv"><i class="ti ti-device-tv"></i> Modo TV</button>
        </div>
      </div>`;
  }

  function desenhar(el, d) {
    el.innerHTML = `<div class="dir" data-dir>${cabecalho(d)}<div data-corpo>${montar(d)}</div></div>`;
    graficos(el, d);
    atualizarStatusRolagem();
  }

  function redesenharGraficos() {
    if (!est.el || !est.el.isConnected) return;
    est.el.querySelectorAll('[data-grafico]').forEach((g) => EG.graf.redesenhar(g));
  }

  async function recarregar(forcar) {
    if (!vivo()) { limpar(); return; }
    try {
      const d = await EG.api('GET', `/direcao/painel${forcar ? '?atualizar=1' : ''}`);
      est.dados = d;
      const corpo = est.el.querySelector('[data-corpo]');
      if (!corpo) return;
      const y = window.scrollY;
      corpo.classList.add('dir-recarregando');
      corpo.innerHTML = montar(d);
      graficos(est.el, d);
      corpo.classList.remove('dir-recarregando');
      const at = est.el.querySelector('[data-atualizado]');
      if (at) at.textContent = `${d.colegio || ''} · ano letivo ${d.anoLetivo} · atualizado às ${String(d.geradoEm).slice(11, 16)} · atualiza sozinho a cada 5 minutos`;
      const atTv = est.el.querySelector('[data-atualizado-tv]');
      if (atTv) atTv.textContent = `${d.colegio || ''} · ano letivo ${d.anoLetivo} · atualizado às ${String(d.geradoEm).slice(11, 16)}`;
      window.scrollTo(0, y);
      if (forcar) EG.toast('Painel atualizado');
    } catch (e) {
      if (e.status === 403) { limpar(); EG.navegar('dashboard'); EG.toast(e.message, 'erro'); }
    }
  }

  /* =================== Modo TV =================== */
  function entrarTV() {
    if (est.tv) return;
    est.tv = true;
    est.temaAntes = document.documentElement.getAttribute('data-theme') || 'light';
    document.documentElement.setAttribute('data-theme', 'dark'); // só na tela (não muda a preferência salva)
    document.body.classList.add('modo-tv');
    const raiz = document.documentElement;
    if (raiz.requestFullscreen) raiz.requestFullscreen().catch(() => { /* sem tela cheia: segue em janela */ });
    window.scrollTo(0, 0);
    ligarRolagem(true, true);
    setTimeout(redesenharGraficos, 350);
    mostrarCursor();
  }
  function sairTV(parando) {
    if (!est.tv) return;
    est.tv = false;
    document.body.classList.remove('modo-tv', 'cursor-oculto');
    if (est.temaAntes) document.documentElement.setAttribute('data-theme', est.temaAntes);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    if (!parando) { ligarRolagem(lerPref(), true); setTimeout(redesenharGraficos, 350); }
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && est.tv) sairTV(); });
  // Esc na tela cheia é tratado pelo navegador (sai da tela cheia → fullscreenchange acima)
  document.addEventListener('keydown', (ev) => {
    if (!est.tv) return;
    if (ev.key === 'Escape') sairTV();
    else if (ev.key === ' ') { ev.preventDefault(); ligarRolagem(!rol.ligada, true); }
  });
  // Cursor some depois de 3 s parado na TV
  let tCursor = null;
  function mostrarCursor() {
    document.body.classList.remove('cursor-oculto');
    clearTimeout(tCursor);
    if (est.tv) tCursor = setTimeout(() => { if (est.tv) document.body.classList.add('cursor-oculto'); }, 3000);
  }
  document.addEventListener('mousemove', () => { if (est.tv) mostrarCursor(); }, { passive: true });

  /* =================== Rolagem automática (desce, pausa, sobe) =================== */
  const rol = { ligada: false, dir: 1, pos: 0, pausaAte: 0, raf: 0, t0: 0, pausaUsuario: 0 };
  const PAUSA_TOPO = 12000, PAUSA_FIM = 8000, PAUSA_USUARIO = 30000;
  function velocidade() { return Math.max(25, window.innerHeight / 22); } // px/s: a tela inteira em ~22 s
  function ligarRolagem(ligar, semSalvar) {
    rol.ligada = !!ligar;
    if (!semSalvar && !est.tv) salvarPref(rol.ligada);
    est.rolagem = rol.ligada;
    cancelAnimationFrame(rol.raf); rol.raf = 0;
    if (rol.ligada) {
      rol.pausaUsuario = 0; // o clique que religou não conta como "mexeu na tela"
      rol.pos = window.scrollY; rol.dir = 1; rol.pausaAte = performance.now() + (window.scrollY < 5 ? PAUSA_TOPO / 2 : 1500);
      rol.t0 = performance.now(); rol.raf = requestAnimationFrame(passo);
    }
    atualizarStatusRolagem();
  }
  function passo(t) {
    if (!rol.ligada) return;
    if (!vivo()) { limpar(); return; }
    const dt = Math.min(100, t - rol.t0); rol.t0 = t;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const agora = performance.now();
    if (max > 8 && agora >= rol.pausaAte && agora >= rol.pausaUsuario) {
      rol.pos += rol.dir * velocidade() * (rol.dir > 0 ? 1 : 2.5) * dt / 1000;
      if (rol.pos >= max) { rol.pos = max; rol.dir = -1; rol.pausaAte = agora + PAUSA_FIM; }
      else if (rol.pos <= 0) { rol.pos = 0; rol.dir = 1; rol.pausaAte = agora + PAUSA_TOPO; }
      window.scrollTo(0, rol.pos);
    } else rol.pos = Math.min(Math.max(0, window.scrollY), Math.max(0, max));
    rol.raf = requestAnimationFrame(passo);
  }
  function interacao(ev) {
    if (!rol.ligada || !est.el || !est.el.isConnected) return;
    if (ev.type === 'keydown' && ev.key === ' ') return;
    rol.pausaUsuario = performance.now() + PAUSA_USUARIO;
    rol.pos = window.scrollY;
    atualizarStatusRolagem();
  }
  ['wheel', 'touchstart', 'mousedown', 'keydown'].forEach((t) => window.addEventListener(t, interacao, { passive: true }));
  function atualizarStatusRolagem() {
    if (!est.el) return;
    const s = est.el.querySelector('[data-status-rolagem]');
    const b = est.el.querySelector('[data-acao="rolagem"]');
    const c = est.el.querySelector('[data-acao="rolagem-auto"]');
    const pausadaPeloUsuario = rol.ligada && performance.now() < rol.pausaUsuario;
    if (s) s.textContent = !rol.ligada ? 'Rolagem parada' : pausadaPeloUsuario ? 'Rolagem retoma em 30 s' : 'Rolagem automática';
    if (b) b.innerHTML = rol.ligada ? '<i class="ti ti-player-pause"></i> Pausar rolagem' : '<i class="ti ti-player-play"></i> Rolar sozinho';
    if (c) c.checked = rol.ligada;
  }

  /* =================== Relógio, atualização e sessão =================== */
  function relogio() {
    if (!vivo()) { limpar(); return; }
    const h = new Date();
    const r = est.el.querySelector('[data-relogio]'); const dt = est.el.querySelector('[data-data]');
    if (r) r.textContent = h.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (dt) dt.textContent = dataLonga(h);
    atualizarStatusRolagem();
  }
  function limpar() {
    if (est.tv) sairTV(true);
    est.timers.forEach((t) => clearInterval(t)); est.timers = [];
    cancelAnimationFrame(rol.raf); rol.raf = 0; rol.ligada = false;
    if (est.obs) { est.obs.disconnect(); est.obs = null; }
    EG.graf.esconderDica();
  }

  EG.registrarModulo('direcao', {
    async render(el) {
      limpar();
      est.el = el;
      est.rolagem = lerPref();
      const d = await EG.api('GET', '/direcao/painel');
      est.dados = d;
      desenhar(el, d);
      // Painel aberto (inclusive numa TV): a sessão não encerra por inatividade
      if (EG.pararSessao) EG.pararSessao();
      est.timers.push(setInterval(() => recarregar(false), ATUALIZA_MS));
      est.timers.push(setInterval(relogio, 15000));
      let tRes = null, largura = el.clientWidth;
      est.obs = new ResizeObserver(() => { // só a largura importa (a altura muda quando os gráficos redesenham)
        if (el.clientWidth === largura) return;
        largura = el.clientWidth; clearTimeout(tRes); tRes = setTimeout(redesenharGraficos, 150);
      });
      est.obs.observe(el);
      if (est.rolagem) ligarRolagem(true, true);
      el.onclick = (ev) => {
        const b = ev.target.closest('[data-acao]');
        if (!b || !el.contains(b) || b.matches('input')) return;
        const a = b.dataset.acao;
        if (a === 'tv') entrarTV();
        else if (a === 'sair-tv') sairTV();
        else if (a === 'rolagem') ligarRolagem(!rol.ligada, true);
        else if (a === 'atualizar') EG.guarda(b, () => recarregar(true));
        else if (a === 'tabela') {
          est.tabela[b.dataset.id] = !est.tabela[b.dataset.id];
          const corpo = el.querySelector('[data-corpo]'); corpo.innerHTML = montar(est.dados); graficos(el, est.dados);
        }
      };
      el.onchange = (ev) => { if (ev.target.matches('[data-acao="rolagem-auto"]')) ligarRolagem(ev.target.checked, false); };
    },
    /** Saindo da tela: para tudo e devolve o encerramento por inatividade do colégio. */
    sair() {
      limpar();
      est.el = null;
      const col = EG.estado.colegio;
      if (EG.iniciarSessao && col && !EG.$('#app').hidden) EG.iniciarSessao(col.config ? col.config.timeoutSessaoMin : 15);
    }
  });
})(window.EG);
