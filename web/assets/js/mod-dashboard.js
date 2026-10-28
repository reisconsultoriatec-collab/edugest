/* EduGest — Dashboard: indicadores, o que pede atenção hoje e atividade recente
 *  Cartões que carregam depois da página (não atrasam a abertura):
 *   · Financeiro do mês (Mensalidades/Contas) · Pendências pedagógicas (Diário/Notas)
 *   · Alunos que precisam de atenção (Boletim/Notas/Diário) — escopo do professor na API */
'use strict';
(function (EG) {
  EG.registrarModulo('dashboard', {
    async render(el) {
      const e = EG.estado;
      const col = e.colegio;
      const ehProfessor = e.perfil === 'professor' && EG.pode('grade');
      const [atividades, r, com, agenda, minha, funil] = await Promise.all([
        EG.api('GET', '/colegios/atual/atividades?limite=3'),
        EG.api('GET', '/colegios/atual/resumo'),
        EG.pode('comunicados') ? EG.api('GET', '/comunicados/recentes?limite=5').catch(() => null) : null,
        EG.pode('calendario') ? EG.api('GET', '/calendario/proximos?dias=30&limite=6').catch(() => null) : null,
        ehProfessor ? EG.api('GET', '/grade/minha').catch(() => null) : null,
        EG.pode('funil') && e.perfil !== 'professor' ? EG.api('GET', '/funil/resumo').catch(() => null) : null
      ]);
      const nome = (e.me.usuario.nome || '').split(' ')[0];
      if (r.pendentes) EG.atualizarPendentes(r.pendentes.total);
      if (r.privacidade && EG.atualizarPrivacidade) EG.atualizarPrivacidade(r.privacidade.abertas);
      // "Inadimplentes" abre as mensalidades vencidas de todos os meses
      // (este clique roda antes da navegação, que fica no document)
      el.onclick = (ev) => {
        if (ev.target.closest('[data-preset="inadimplentes"]')) {
          EG.filtroInicialMensalidades = { referencia: '', turmaId: '', busca: '', status: 'vencida' };
        }
        const b = ev.target.closest('[data-dash-acao]');
        if (b && el.contains(b)) acaoDoPainel(b);
      };
      const temFin = EG.pode('mensalidades') || EG.pode('contas');
      const temPed = EG.pode('diario') || EG.pode('notas');
      const temAten = EG.pode('boletim') || EG.pode('notas') || EG.pode('diario');

      el.innerHTML = `
        ${avisoPendentes(r.pendentes)}
        ${avisoPrivacidade(r.privacidade)}
        <div class="card" style="background:linear-gradient(135deg,#1A2744,#2D3F63);color:#fff;border:none">
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <div class="avatar" style="width:56px;height:56px;font-size:22px">${EG.esc(EG.iniciais(e.me.usuario.nome))}</div>
            <div style="flex:1;min-width:200px">
              <div class="fonte-titulo" style="font-size:20px;font-weight:700">Olá, ${EG.esc(nome)}!</div>
              <div style="opacity:.8;font-size:13px">${EG.esc(col.nome)} · ${EG.esc(EG.PERFIS[e.perfil] || e.perfil)} · Ano letivo ${EG.esc(col.config.anoLetivo)}</div>
            </div>
          </div>
        </div>

        <div class="grade-kpi">
          ${kpi('ti-users', 'var(--info-bg)', 'var(--info)', 'Alunos ativos', r.alunos,
            r.alunosSemTurma ? `${r.alunosSemTurma} sem turma` : 'todos com turma', 'alunos')}
          ${kpi('ti-user-check', 'var(--roxo-bg)', 'var(--roxo)', 'Professores ativos', r.professores, 'corpo docente', 'professores')}
          ${kpi('ti-layout-grid', 'var(--ok-bg)', 'var(--ok)', 'Turmas ativas', r.turmas, `ano letivo ${r.anoLetivo}`, 'turmas')}
          ${kpi('ti-alert-triangle', 'var(--erro-bg)', 'var(--erro)', 'Inadimplentes', r.inadimplentes, 'com mensalidade vencida', 'mensalidades', 'inadimplentes')}
        </div>

        ${e.perfil === 'admin' ? '<div data-dash-implantacao></div>' : ''}
        ${temFin || temPed ? `<div class="dash-par ${temFin && temPed ? 'dash-par-2' : ''}">
          ${temFin ? esqueleto('financeiro') : ''}${temPed ? esqueleto('pedagogico') : ''}</div>` : ''}
        ${temAten ? esqueleto('atencao') : ''}
        ${minha && minha.vinculado && minha.total ? cardAulasHoje(minha) : ''}
        ${funil && (funil.novos || funil.contatosHoje || funil.atrasados || funil.visitasHoje) ? cardFunil(funil) : ''}
        ${agenda || com ? `<div class="${agenda && com ? 'linha-2' : ''}" style="gap:20px;align-items:start;margin-bottom:20px">
          ${agenda ? cardAgenda(agenda.itens, !!com) : ''}
          ${com ? cardComunicados(com.itens, !!agenda) : ''}
        </div>` : ''}
        <div class="card" data-dash-bloco="atividade">
          <div class="card-cab"><div class="card-titulo"><i class="ti ti-clock"></i> Atividade recente</div>
            ${atividades.length ? '<button class="btn btn-secundario btn-pequeno" data-dash-acao="atividades">Ver todas</button>' : ''}</div>
          ${atividades.length ? `<ul class="lista-atividade">${atividades.map(itemAtividade).join('')}</ul>`
          : '<div class="vazio" style="padding:20px"><i class="ti ti-clock"></i>Nenhuma atividade ainda</div>'}
        </div>`;
      // Cartões que dependem de contas maiores: entram quando ficam prontos
      if (temFin) preencher(el, 'financeiro', EG.api('GET', '/painel/financeiro').then(cardFinanceiro));
      if (temPed) preencher(el, 'pedagogico', EG.api('GET', '/painel/pedagogico').then(cardPedagogico));
      if (temAten) preencher(el, 'atencao', EG.api('GET', '/painel/atencao').then(cardAtencao));
      // Administrador: o que ainda falta configurar no colégio (some quando tudo estiver pronto)
      const impl = el.querySelector('[data-dash-implantacao]');
      if (impl && EG.cartaoImplantacao) {
        EG.cartaoImplantacao().then((html) => { if (impl.isConnected) { if (html) impl.outerHTML = html; else impl.remove(); } }).catch(() => impl.remove());
      }
    }
  });

  /* =================== Cartões do painel =================== */
  const TITULOS = {
    financeiro: ['ti-coin', () => `Financeiro de ${EG.MESES[Number(EG.hojeSP().slice(5, 7)) - 1].toLowerCase()}`],
    pedagogico: ['ti-clipboard-check', () => 'Pendências pedagógicas'],
    atencao: ['ti-user-exclamation', () => 'Alunos que precisam de atenção']
  };
  const cab = (qual, direita = '') => `<div class="card-cab"><div class="card-titulo"><i class="ti ${TITULOS[qual][0]}"></i> ${TITULOS[qual][1]()}</div>${direita}</div>`;
  function esqueleto(qual) {
    return `<div class="card dash-cartao" data-dash="${qual}" aria-busy="true">${cab(qual)}
      <div class="dash-esq"><i class="brilho"></i><i class="brilho"></i><i class="brilho"></i></div></div>`;
  }
  /** Troca o esqueleto pelo cartão; se der erro (ou não houver nada a mostrar), some. */
  function preencher(el, qual, promessa) {
    const alvo = () => el.querySelector(`[data-dash="${qual}"]`);
    promessa.then((html) => {
      const a = alvo(); if (!a) return;
      if (html) a.outerHTML = html; else a.remove();
      ajustarPar(el);
    }).catch(() => { const a = alvo(); if (a) a.remove(); ajustarPar(el); });
  }
  /** Se um dos dois cartões lado a lado sumir, o outro ocupa a largura toda. */
  function ajustarPar(el) {
    const par = el.querySelector('.dash-par');
    if (!par) return;
    const n = par.children.length;
    if (!n) par.remove(); else par.classList.toggle('dash-par-2', n === 2);
  }

  const hojeISO = () => EG.hojeSP();
  function diaRel(d) {
    const h = hojeISO();
    const ontem = new Date(`${h}T12:00:00Z`); ontem.setUTCDate(ontem.getUTCDate() - 1);
    if (d === h) return 'hoje';
    if (d === ontem.toISOString().slice(0, 10)) return 'ontem';
    return EG.data(d).slice(0, 5);
  }
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const botao = (acao, rotulo, extra = '', classe = 'btn-secundario') => `<button class="btn ${classe} btn-pequeno" data-dash-acao="${acao}" ${extra}>${rotulo}</button>`;

  /* ---------- Financeiro do mês ---------- */
  function cardFinanceiro(f) {
    const partes = [];
    const m = f.mensalidades;
    if (m) {
      const pct = m.percentual === null ? 0 : Math.max(0, Math.min(100, m.percentual));
      partes.push(m.quantidade ? `<div class="dash-bloco">
          <div class="dash-rotulo">Mensalidades que vencem no mês</div>
          <div class="dash-meta"><span><strong class="dash-valor">${EG.moeda(m.recebido)}</strong> recebido de ${EG.moeda(m.previsto)}</span><strong>${m.percentual}%</strong></div>
          <div class="dash-medidor" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Recebido no mês"><span style="width:${pct}%"></span></div>
          <div class="dash-obs">${m.pagas} de ${plural(m.quantidade, 'mensalidade paga', 'mensalidades pagas')} · falta receber ${EG.moeda(m.falta)}</div>
          <div class="dash-obs">Entrou no caixa no mês (inclui atrasadas): <strong>${EG.moeda(m.entradasNoMes)}</strong></div>
        </div>` : `<div class="dash-bloco"><div class="dash-rotulo">Mensalidades que vencem no mês</div>
          <div class="dash-obs">Nenhuma mensalidade vence neste mês.${m.entradasNoMes ? ` Entrou no caixa: <strong>${EG.moeda(m.entradasNoMes)}</strong>.` : ''}</div></div>`);
      partes.push(`<div class="dash-bloco dash-linha ${m.atraso.valor ? 'dash-alerta' : ''}">
          <div><div class="dash-rotulo">Em atraso</div>
            ${m.atraso.valor ? `<strong class="dash-valor">${EG.moeda(m.atraso.valor)}</strong>
              <div class="dash-obs">${plural(m.atraso.mensalidades, 'mensalidade', 'mensalidades')} de ${plural(m.atraso.alunos, 'aluno', 'alunos')}</div>`
              : '<div class="dash-obs"><i class="ti ti-circle-check" style="color:var(--ok)"></i> Nenhuma mensalidade vencida</div>'}</div>
          ${m.atraso.valor && EG.pode('mensalidades') ? botao('vencidas', 'Cobrar') : ''}
        </div>`);
    }
    const c = f.contas;
    if (c) {
      partes.push(`<div class="dash-bloco">
          <div class="dash-meta"><span class="dash-rotulo" style="margin:0">Contas a pagar · próximos 7 dias</span>
            ${c.proximas.quantidade ? `<strong>${EG.moeda(c.proximas.valor)}</strong>` : ''}</div>
          ${c.proximas.quantidade ? `<ul class="dash-lista">${c.proximas.itens.map((x) => `<li>
              <span class="dash-data">${diaRel(x.vencimento)}</span>
              <span class="dash-txt"><span>${EG.esc(x.descricao)}${x.fornecedor ? ` <span class="sub">· ${EG.esc(x.fornecedor)}</span>` : ''}</span></span>
              <span class="dash-num">${EG.moeda(x.valor)}</span></li>`).join('')}</ul>
            ${c.proximas.quantidade > c.proximas.itens.length ? `<div class="dash-obs">e mais ${c.proximas.quantidade - c.proximas.itens.length}</div>` : ''}`
          : '<div class="dash-obs">Nenhuma conta vence nos próximos 7 dias.</div>'}
          ${c.vencidas.quantidade ? `<div class="dash-obs dash-erro"><i class="ti ti-alert-triangle"></i> ${plural(c.vencidas.quantidade, 'conta vencida', 'contas vencidas')}: ${EG.moeda(c.vencidas.valor)}</div>` : ''}
        </div>`);
    }
    const links = [EG.pode('mensalidades') ? botao('ir:mensalidades', 'Mensalidades') : '', EG.pode('contas') ? botao('ir:contas', 'Contas a pagar') : ''].join('');
    return `<div class="card dash-cartao" data-dash="financeiro">${cab('financeiro', `<div class="dash-acoes">${links}</div>`)}${partes.join('')}</div>`;
  }

  /* ---------- Pendências pedagógicas ---------- */
  function cardPedagogico(p) {
    if (p.vinculado === false) {
      return `<div class="card dash-cartao" data-dash="pedagogico">${cab('pedagogico')}
        <div class="msg-info">O seu login ainda não está ligado a um cadastro de professor. Peça à coordenação para fazer a ligação em Professores; aí as suas chamadas e notas aparecem aqui.</div></div>`;
    }
    const blocos = [];
    const ch = p.chamadas;
    if (ch) {
      const lista = ch.turmas.slice(0, 5);
      blocos.push(`<div class="dash-bloco">
        <div class="dash-meta"><span class="dash-rotulo" style="margin:0">Chamada · últimos ${ch.dias} dias</span>
          ${ch.total ? `<span class="selo selo-aviso">${plural(ch.total, 'pendente', 'pendentes')}</span>` : ''}</div>
        ${ch.total ? `<ul class="dash-lista">${lista.map((t) => {
          const a = t.aulas[0];
          const det = t.aulas.slice(0, 3).map((x) => `${diaRel(x.data)}${x.inicio ? ' ' + x.inicio : ''}${x.disciplina ? ' ' + EG.esc(x.disciplina) : ''}`).join(', ');
          return `<li><span class="dash-txt"><strong>${EG.esc(t.turma)}</strong>
              <small class="sub">${t.semGrade ? plural(t.total, 'dia sem chamada', 'dias sem chamada') : plural(t.total, 'aula sem chamada', 'aulas sem chamada')} · ${det}${t.total > 3 ? '…' : ''}</small></span>
            ${EG.pode('diario') ? botao('chamada', 'Lançar', `data-turma="${t.turmaId}" data-data="${a.data}" data-disciplina="${a.disciplinaId || ''}"`) : ''}</li>`;
        }).join('')}</ul>${ch.turmas.length > lista.length ? `<div class="dash-obs">e mais ${plural(ch.turmas.length - lista.length, 'turma', 'turmas')}</div>` : ''}`
        : '<div class="dash-obs"><i class="ti ti-circle-check" style="color:var(--ok)"></i> Todas as chamadas em dia</div>'}
      </div>`);
    }
    if (p.notas) {
      if (!p.notas.length) {
        blocos.push(`<div class="dash-bloco"><div class="dash-rotulo">Notas do bimestre</div>
          <div class="dash-obs"><i class="ti ti-circle-check" style="color:var(--ok)"></i> Nenhuma nota pendente por enquanto</div></div>`);
      }
      p.notas.forEach((b) => {
        const lista = b.pendentes.slice(0, 6);
        blocos.push(`<div class="dash-bloco">
          <div class="dash-meta"><span class="dash-rotulo" style="margin:0">Notas do ${b.bimestre}º bimestre · ${b.situacao === 'encerrado' ? 'terminou' : 'termina'} em ${EG.data(b.fim).slice(0, 5)}</span>
            <span class="selo ${b.situacao === 'encerrado' ? 'selo-erro' : 'selo-aviso'}">${plural(b.pendentes.length, 'pendente', 'pendentes')}</span></div>
          <ul class="dash-lista">${lista.map((x) => `<li>
            <span class="dash-txt"><span><strong>${EG.esc(x.turma)}</strong> · ${EG.esc(x.disciplina)}</span>
              <small class="sub">${x.professor && EG.estado.perfil !== 'professor' ? `${EG.esc(x.professor)} · ` : ''}${x.lancados} de ${plural(x.alunos, 'aluno', 'alunos')} com nota</small></span>
            ${EG.pode('notas') ? botao('notas', 'Lançar', `data-turma="${x.turmaId}" data-disciplina="${x.disciplinaId}" data-bimestre="${b.bimestre}"`) : ''}</li>`).join('')}</ul>
          ${b.pendentes.length > lista.length ? `<div class="dash-obs">e mais ${b.pendentes.length - lista.length}</div>` : ''}
        </div>`);
      });
      if (!p.calendarioDefinido) {
        blocos.push(`<div class="dash-obs">Os bimestres não estão no Calendário: as datas seguem a divisão padrão (fev–abr, mai–jul, ago–set, out–dez).
          ${EG.pode('calendario') && EG.estado.perfil !== 'professor' ? ' <button class="link-sutil" data-action="ir" data-pagina="calendario">Definir bimestres</button>' : ''}</div>`);
      }
    }
    return `<div class="card dash-cartao" data-dash="pedagogico">${cab('pedagogico')}${blocos.join('')}</div>`;
  }

  /* ---------- Alunos que precisam de atenção ---------- */
  let ultimaAtencao = null;
  function linhasAtencao(lista, c) {
    return lista.map((a) => `<tr>
      <td><strong>${EG.esc(a.nome)}</strong><br><small class="sub">${EG.esc(a.turma)} · RA ${EG.esc(a.ra)}</small></td>
      <td style="white-space:nowrap" data-rotulo="Frequência"${a.frequencia ? '' : ' data-vazio'}>${a.frequencia
        ? `<span class="${a.freqAbaixo ? 'dash-erro' : ''}">${String(a.frequencia.percentual).replace('.', ',')}%</span><br> <small class="sub">${plural(a.frequencia.faltas, 'falta', 'faltas')} em ${a.frequencia.aulas} aulas</small>`
        : '<span class="sub">—</span>'}</td>
      <td data-rotulo="Abaixo da média"${a.disciplinasAbaixo.length ? '' : ' data-vazio'}>${a.disciplinasAbaixo.length ? a.disciplinasAbaixo.map((d) => `<span class="dash-chip">${EG.esc(d.nome)} <strong>${EG.fmtNota(d.media)}</strong></span>`).join(' ') : '<span class="sub">—</span>'}</td>
      <td class="dash-acoes-linha">
        ${EG.pode('boletim') ? `<button class="btn-icone" title="Abrir o boletim" aria-label="Abrir o boletim de ${EG.esc(a.nome)}" data-dash-acao="boletim" data-turma="${a.turmaId}" data-aluno="${a.id}"><i class="ti ti-report"></i></button>` : ''}
        ${a.respTelefone ? `<button class="btn-icone" title="WhatsApp do responsável" aria-label="WhatsApp do responsável de ${EG.esc(a.nome)}" data-dash-acao="whats" data-aluno="${a.id}"><i class="ti ti-brand-whatsapp"></i></button>` : ''}
      </td></tr>`).join('');
  }
  function tabelaAtencao(lista, c) {
    return `<div class="tabela-wrap"><table class="dash-tabela">
      <thead><tr><th>Aluno</th><th>Frequência</th><th>Abaixo da média (${EG.fmtNota(c.mediaAprovacao)})</th><th></th></tr></thead>
      <tbody>${linhasAtencao(lista, c)}</tbody></table></div>`;
  }
  function cardAtencao(r) {
    ultimaAtencao = r;
    const c = r.criterios;
    const resumo = r.total
      ? [r.porFrequencia ? plural(r.porFrequencia, 'pela frequência', 'pela frequência') : '', r.porMedia ? plural(r.porMedia, 'pela média', 'pela média') : ''].filter(Boolean).join(' · ')
      : '';
    return `<div class="card dash-cartao" data-dash="atencao">
      ${cab('atencao', r.total > 6 ? botao('atencao-todos', `Ver todos (${r.total})`) : '')}
      <p class="card-desc">Frequência abaixo de ${c.frequenciaMinima}% (a partir de ${c.minimoAulas} aulas registradas) ou média abaixo de ${EG.fmtNota(c.mediaAprovacao)} em alguma disciplina, pelas notas lançadas até agora.${r.total ? ` <strong>${plural(r.total, 'aluno', 'alunos')}</strong>: ${resumo}.` : ''}</p>
      ${r.total ? tabelaAtencao(r.alunos.slice(0, 6), c)
        : '<div class="dash-obs"><i class="ti ti-circle-check" style="color:var(--ok)"></i> Nenhum aluno abaixo da média ou da frequência mínima até agora.</div>'}
    </div>`;
  }

  /* ---------- Atividade recente ---------- */
  function itemAtividade(a) {
    return `<li><i class="ti ti-point-filled" style="color:var(--amber);font-size:10px"></i>
      <span>${a.autor ? `<strong style="color:var(--amber-d)">${EG.esc(a.autor)}</strong> · ` : ''}${EG.esc(a.acao)}</span>
      <span class="quando">${EG.dataHora(a.data)}</span></li>`;
  }
  async function todasAtividades() {
    const est = { autor: '', ultimo: null, fim: false };
    const autores = await EG.api('GET', '/colegios/atual/atividades/autores').catch(() => []);
    const m = EG.modal({
      titulo: 'Atividade recente',
      largura: 720,
      corpo: `<div class="campo" style="max-width:320px"><label for="ativAutor">Pessoa</label>
          <select class="select" id="ativAutor" data-ativ-autor><option value="">Todas</option>
            ${autores.map((a) => `<option value="${a.id}">${EG.esc(a.nome)} (${a.atividades})</option>`).join('')}</select></div>
        <ul class="lista-atividade" data-ativ-lista></ul>
        <div style="text-align:center;margin-top:12px"><button class="btn btn-secundario btn-pequeno" data-ativ-mais hidden>Carregar mais</button></div>`,
      botoes: [{ texto: 'Fechar', acao: () => m.fechar() }]
    });
    const lista = m.el.querySelector('[data-ativ-lista]');
    const mais = m.el.querySelector('[data-ativ-mais]');
    async function carregar(reiniciar) {
      if (reiniciar) { est.ultimo = null; est.fim = false; lista.innerHTML = ''; }
      const q = `limite=30${est.ultimo ? `&antes=${est.ultimo}` : ''}${est.autor ? `&autor=${est.autor}` : ''}`;
      const itens = await EG.api('GET', `/colegios/atual/atividades?${q}`);
      lista.insertAdjacentHTML('beforeend', itens.map(itemAtividade).join(''));
      if (itens.length) est.ultimo = itens[itens.length - 1].id;
      est.fim = itens.length < 30;
      mais.hidden = est.fim;
      if (!lista.children.length) lista.innerHTML = '<li class="sub">Nenhuma atividade</li>';
    }
    m.el.querySelector('[data-ativ-autor]').addEventListener('change', (ev) => { est.autor = ev.target.value; carregar(true).catch((e) => m.erro(e.message)); });
    mais.addEventListener('click', () => EG.guarda(mais, () => carregar(false).catch((e) => m.erro(e.message))));
    await carregar(true);
  }

  /* ---------- Cliques dos cartões ---------- */
  function acaoDoPainel(b) {
    const a = b.dataset.dashAcao;
    const d = b.dataset;
    if (a === 'atividades') todasAtividades().catch((e) => EG.toast(e.message, 'erro'));
    else if (a === 'vencidas') { EG.filtroInicialMensalidades = { referencia: '', turmaId: '', busca: '', status: 'vencida' }; EG.navegar('mensalidades'); }
    else if (a.startsWith('ir:')) EG.navegar(a.slice(3));
    else if (a === 'chamada') EG.abrirCom('diario', { turmaId: Number(d.turma), data: d.data, disciplinaId: d.disciplina ? Number(d.disciplina) : null });
    else if (a === 'notas') EG.abrirCom('notas', { turmaId: Number(d.turma), disciplinaId: Number(d.disciplina), bimestre: Number(d.bimestre) });
    else if (a === 'boletim') { EG.fecharModais(); EG.abrirCom('boletim', { turmaId: Number(d.turma), alunoId: Number(d.aluno) }); }
    else if (a === 'whats') {
      const al = ultimaAtencao && ultimaAtencao.alunos.find((x) => x.id === Number(d.aluno));
      if (!al) return;
      const col = EG.estado.colegio ? EG.estado.colegio.nome : 'colégio';
      const nomeResp = al.respNome ? `, ${al.respNome.split(' ')[0]}` : '';
      EG.abrirWhatsApp(al.respTelefone, `Olá${nomeResp}! Aqui é do ${col}. Gostaríamos de conversar sobre o acompanhamento de ${al.nome.split(' ')[0]}. Quando podemos falar?`);
    } else if (a === 'atencao-todos' && ultimaAtencao) {
      const r = ultimaAtencao;
      const m = EG.modal({
        titulo: `Alunos que precisam de atenção (${r.total})`, largura: 900,
        corpo: `<p class="sub" style="margin-bottom:12px">Frequência abaixo de ${r.criterios.frequenciaMinima}% ou média abaixo de ${EG.fmtNota(r.criterios.mediaAprovacao)} em alguma disciplina.</p>${tabelaAtencao(r.alunos, r.criterios)}`,
        botoes: [{ texto: 'Fechar', acao: () => m.fechar() }]
      });
      m.el.addEventListener('click', (ev) => { const x = ev.target.closest('[data-dash-acao]'); if (x) acaoDoPainel(x); });
    }
  }

  /** Captação: o que pede atenção hoje no funil de matrículas. */
  function cardFunil(f) {
    const item = (n, rot, cor) => (n ? `<div class="funil-dash-item"><strong style="color:${cor}">${n}</strong><span>${rot}</span></div>` : '');
    return `<div class="card">
      <div class="card-cab"><div class="card-titulo"><i class="ti ti-filter"></i> Captação de alunos</div>
        <button class="btn btn-secundario btn-pequeno" data-action="ir" data-pagina="funil">Abrir o funil</button></div>
      <div class="funil-dash">
        ${item(f.novos, 'novo(s) interessado(s)', 'var(--info)')}
        ${item(f.contatosHoje, 'contato(s) para hoje', 'var(--amber-d)')}
        ${item(f.atrasados, 'contato(s) atrasado(s)', 'var(--erro)')}
        ${item(f.visitasHoje, 'visita(s) hoje', 'var(--roxo)')}
        <div class="funil-dash-item"><strong>${f.ativos}</strong><span>em andamento</span></div>
      </div></div>`;
  }

  /** Últimos comunicados no ar, com quantos responsáveis já leram. */
  function cardComunicados(itens, lado) {
    return `<div class="card" style="${lado ? 'margin:0' : ''}">
      <div class="card-cab"><div class="card-titulo"><i class="ti ti-speakerphone"></i> Últimos comunicados</div>
        <button class="btn btn-secundario btn-pequeno" data-action="ir" data-pagina="comunicados">${itens.length ? 'Ver todos' : 'Publicar'}</button></div>
      ${itens.length ? `<ul class="lista-atividade">${itens.map((c) => `<li>
          ${EG.seloTipoComunicado(c.tipo)}
          <span>${EG.esc(c.titulo)}<br><small class="sub">${EG.esc(c.publico)}${c.leitura.destinatarios ? ` · lido por ${c.leitura.lidos} de ${c.leitura.destinatarios}` : ''}</small></span>
          <span class="quando">${EG.data(c.criadoEm)}</span></li>`).join('')}</ul>`
        : '<div class="vazio"><i class="ti ti-speakerphone"></i>Nenhum comunicado no ar</div>'}
    </div>`;
  }

  /** Professor: as aulas de hoje pela grade horária. */
  function cardAulasHoje(m) {
    return `<div class="card">
      <div class="card-cab"><div class="card-titulo"><i class="ti ti-clock-hour-3"></i> Suas aulas hoje</div>
        <button class="btn btn-secundario btn-pequeno" data-action="ir" data-pagina="grade">Minha grade</button></div>
      ${m.hoje.length ? `<ul class="lista-atividade">${m.hoje.map((a) => `<li><span class="selo selo-info">${a.inicio}–${a.fim}</span>
          <span><strong>${EG.esc(a.turma)}</strong> · ${EG.esc(a.disciplina || '—')}</span></li>`).join('')}</ul>`
        : '<div class="vazio" style="padding:20px"><i class="ti ti-mood-happy"></i>Nenhuma aula na grade hoje</div>'}
    </div>`;
  }

  /** Próximos eventos do calendário (30 dias). */
  function cardAgenda(itens, lado) {
    return `<div class="card" style="${lado ? 'margin:0' : ''}">
      <div class="card-cab"><div class="card-titulo"><i class="ti ti-calendar-event"></i> Próximos eventos</div>
        <button class="btn btn-secundario btn-pequeno" data-action="ir" data-pagina="calendario">Calendário</button></div>
      ${itens.length ? `<ul class="lista-atividade">${itens.map((e) => `<li>
          ${EG.cal.tag(e.tipo)}
          <span>${EG.esc(e.titulo)}<br><small class="sub">${EG.esc(e.publico)}${e.lugar ? ' · ' + EG.esc(e.lugar) : ''}</small></span>
          <span class="quando">${EG.data(e.data).slice(0, 5)}${e.dataFim ? ' a ' + EG.data(e.dataFim).slice(0, 5) : ''}${e.horaInicio ? ' · ' + e.horaInicio : ''}</span></li>`).join('')}</ul>`
        : '<div class="vazio"><i class="ti ti-calendar"></i>Nada marcado para os próximos 30 dias</div>'}
    </div>`;
  }

  /** Alerta de cadastros aguardando aprovação (só chega preenchido para o admin). */
  function avisoPendentes(p) {
    if (!p || !p.total) return '';
    const partes = [];
    if (p.responsaveis) partes.push(`${p.responsaveis} ${p.responsaveis === 1 ? 'responsável de aluno' : 'responsáveis de alunos'}`);
    if (p.equipe) partes.push(`${p.equipe} da equipe`);
    return `<div class="pendente-item" style="margin-bottom:20px">
      <span class="avatar"><i class="ti ti-user-exclamation"></i></span>
      <div class="pendente-info">
        <strong>${p.total === 1 ? '1 cadastro aguardando' : `${p.total} cadastros aguardando`} a sua aprovação</strong>
        <span class="sub">${EG.esc(partes.join(' e '))} · essas pessoas só acessam o sistema depois de aprovadas</span>
      </div>
      <button class="btn btn-primario" data-action="ir" data-pagina="usuarios"><i class="ti ti-user-check"></i> Revisar agora</button>
    </div>`;
  }

  /** Pedidos de privacidade (LGPD) das famílias aguardando resposta (só o admin recebe). */
  function avisoPrivacidade(p) {
    if (!p || !p.abertas) return '';
    const prazo = p.atrasadas ? `${p.atrasadas} com o prazo de 15 dias vencido` : p.proximoPrazo ? `responder até ${EG.data(p.proximoPrazo)}` : '';
    return `<div class="pendente-item ${p.atrasadas ? 'pendente-urgente' : ''}" style="margin-bottom:20px">
      <span class="avatar"><i class="ti ti-user-shield"></i></span>
      <div class="pendente-info">
        <strong>${p.abertas === 1 ? '1 pedido de privacidade' : `${p.abertas} pedidos de privacidade`} aguardando resposta</strong>
        <span class="sub">Pedidos das famílias pela LGPD (cópia, correção, exclusão de dados...)${prazo ? ' · ' + EG.esc(prazo) : ''}</span>
      </div>
      <button class="btn btn-primario" data-action="ir" data-pagina="lgpd"><i class="ti ti-message-reply"></i> Responder</button>
    </div>`;
  }

  function kpi(icone, fundo, cor, rotulo, valor, obs, modulo, preset) {
    const link = modulo && EG.pode(modulo)
      ? ` data-action="ir" data-pagina="${modulo}"${preset ? ` data-preset="${preset}"` : ''} style="cursor:pointer"` : '';
    return `<div class="kpi"${link}><div class="kpi-icone" style="background:${fundo};color:${cor}"><i class="ti ${icone}"></i></div>
      <div><div class="kpi-rotulo">${rotulo}</div><div class="kpi-valor">${EG.esc(valor)}</div><div class="kpi-obs">${EG.esc(obs)}</div></div></div>`;
  }
})(window.EG);
