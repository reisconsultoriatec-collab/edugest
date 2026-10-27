/* =====================================================================
 *  EduGest — Funil de Matrículas   [módulo funil]
 *  Quadro (arrastar entre etapas) · Lista · Números · Formulário público.
 *  Ficha do interessado com histórico de contatos, WhatsApp e matrícula
 *  (cria o aluno e, se pedido, as mensalidades do ano).
 * ===================================================================== */
'use strict';
(function (EG) {
  const COLUNAS = ['lead', 'visita', 'proposta', 'matriculado'];
  const SELO_ETAPA = { lead: 'selo-info', visita: 'selo-roxo', proposta: 'selo-aviso', matriculado: 'selo-ok', perdido: 'selo-neutro' };
  const PARENTESCOS = ['Mãe', 'Pai', 'Avó/Avô', 'Tio(a)', 'Irmão(ã)', 'Responsável legal', 'Outro'];
  const est = {};
  let opcoes = null;
  let leads = [];
  let espera = null;

  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dataCurta = (s) => (s ? `${String(s).slice(8, 10)}/${String(s).slice(5, 7)}` : '');
  const horaDe = (s) => (s && String(s).length > 10 ? String(s).slice(11, 16) : '');
  const pct = (n) => (n === null || n === undefined ? '—' : `${String(n).replace('.', ',')}%`);

  /** Atualiza o número no menu (novos + contatos de hoje + atrasados). */
  EG.atualizarFunil = async function () {
    if (!EG.pode('funil') || EG.estado.perfil === 'responsavel') return null;
    try {
      const r = await EG.api('GET', '/funil/resumo');
      const total = r.novos + r.contatosHoje + r.atrasados;
      EG.contadorMenu('funil', total, total ? `${r.novos} novo(s) · ${r.contatosHoje} contato(s) para hoje · ${r.atrasados} atrasado(s)` : '');
      return r;
    } catch (e) { return null; }
  };

  function filtrados() {
    const b = semAcento(est.busca).trim();
    const dig = String(est.busca || '').replace(/\D/g, '');
    return leads.filter((l) => (!est.origem || l.origem === est.origem) && (!est.serie || l.serie === est.serie)
      && (!est.ano || String(l.ano) === String(est.ano))
      && (!b || semAcento(l.nomeAluno).includes(b) || semAcento(l.responsavel).includes(b) || semAcento(l.email).includes(b)
        || (dig.length >= 4 && String(l.telefone || '').replace(/\D/g, '').includes(dig))));
  }

  /* ---------- Topo: filtros e resumo ---------- */
  function barraFiltros(extra = '') {
    const anos = [...new Set([opcoes.anoLetivo, opcoes.anoLetivo + 1, ...leads.map((l) => l.ano).filter(Boolean)])].sort((a, b) => b - a);
    return `<div class="funil-filtros">
      <input class="input" data-filtro="busca" value="${EG.esc(est.busca)}" placeholder="Buscar aluno, responsável ou telefone" autocomplete="off">
      <select class="select" data-filtro="ano"><option value="">Todos os anos</option>${anos.map((a) => `<option ${String(est.ano) === String(a) ? 'selected' : ''}>${a}</option>`).join('')}</select>
      <select class="select" data-filtro="serie"><option value="">Todas as séries</option>${opcoes.series.map((s) => `<option ${est.serie === s ? 'selected' : ''}>${EG.esc(s)}</option>`).join('')}</select>
      <select class="select" data-filtro="origem"><option value="">Todas as origens</option>${opcoes.origens.map((s) => `<option ${est.origem === s ? 'selected' : ''}>${EG.esc(s)}</option>`).join('')}</select>
      ${extra}
    </div>`;
  }

  function abas() {
    const lista = [['quadro', 'Quadro', 'ti-layout-kanban'], ['lista', 'Lista', 'ti-list'], ['numeros', 'Números', 'ti-chart-bar'], ['formulario', 'Formulário', 'ti-forms']];
    return `<div class="abas no-print">${lista.map(([v, r, i]) => `<button class="aba ${est.aba === v ? 'ativa' : ''}" data-aba="${v}"><i class="ti ${i}"></i> ${r}</button>`).join('')}</div>`;
  }

  async function carregar() {
    const r = await EG.api('GET', '/funil/leads');
    leads = r.leads;
  }

  async function desenhar(el) {
    el.querySelector('[data-abas]').innerHTML = abas();
    const corpo = el.querySelector('[data-corpo]');
    if (est.aba === 'quadro') desenharQuadro(corpo);
    else if (est.aba === 'lista') desenharLista(corpo);
    else if (est.aba === 'numeros') await desenharNumeros(corpo);
    else await desenharFormulario(corpo);
  }

  /* =====================================================================
   *  Quadro
   * ===================================================================== */
  function prioridade(l) {
    if (l.novo) return 0;
    if (l.contato === 'atrasado') return 1;
    if (l.contato === 'hoje') return 2;
    return 3;
  }

  function cartao(l) {
    const selos = [];
    if (l.novo) selos.push('<span class="selo selo-info">Novo</span>');
    if (l.contato === 'atrasado') selos.push(`<span class="selo selo-erro">Atrasado · ${dataCurta(l.proximoContato)}</span>`);
    else if (l.contato === 'hoje') selos.push('<span class="selo selo-aviso">Contato hoje</span>');
    else if (l.contato === 'futuro') selos.push(`<span class="selo selo-neutro">Contato ${dataCurta(l.proximoContato)}</span>`);
    if (l.etapa === 'visita' && l.visitaEm) selos.push(`<span class="selo selo-roxo">Visita ${dataCurta(l.visitaEm)}${horaDe(l.visitaEm) ? ` ${horaDe(l.visitaEm)}` : ''}</span>`);
    const ativo = l.etapa !== 'matriculado' && l.etapa !== 'perdido';
    return `<div class="funil-card ${l.novo ? 'novo' : ''}" data-lead="${l.id}" ${ativo ? 'draggable="true"' : ''} tabindex="0">
      <strong>${EG.esc(l.nomeAluno)}</strong>
      <span class="sub">${[l.serie, l.ano, l.turno ? opcoes.turnos[l.turno] : null].filter(Boolean).map(EG.esc).join(' · ') || 'série não informada'}</span>
      ${l.responsavel ? `<span class="funil-card-resp"><i class="ti ti-user"></i> ${EG.esc(l.responsavel)}</span>` : ''}
      ${selos.length ? `<div class="funil-card-selos">${selos.join('')}</div>` : ''}
      <div class="funil-card-rodape"><span>${EG.esc(l.origem || '')}${l.viaFormulario ? ' · formulário' : ''}</span>
        <span>${l.etapa === 'matriculado' ? EG.data(l.etapaEm) : l.diasNaEtapa ? `há ${l.diasNaEtapa} dia(s)` : 'hoje'}</span></div>
    </div>`;
  }

  function desenharQuadro(corpo) {
    const lista = filtrados();
    const ativos = lista.filter((l) => ['lead', 'visita', 'proposta'].includes(l.etapa));
    const perdidos = lista.filter((l) => l.etapa === 'perdido').length;
    const hoje = ativos.filter((l) => l.contato === 'hoje').length;
    const atrasados = ativos.filter((l) => l.contato === 'atrasado').length;
    const novos = ativos.filter((l) => l.novo).length;
    corpo.innerHTML = `
      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-filter"></i> Funil de matrículas</div>
          <button class="btn btn-primario" data-acao="novo"><i class="ti ti-plus"></i> Novo interessado</button></div>
        ${barraFiltros()}
        <div class="funil-resumo">
          <span><strong>${ativos.length}</strong> em andamento</span>
          ${novos ? `<span class="destaque-info"><strong>${novos}</strong> novo(s)</span>` : ''}
          ${hoje ? `<span class="destaque-aviso"><strong>${hoje}</strong> contato(s) para hoje</span>` : ''}
          ${atrasados ? `<span class="destaque-erro"><strong>${atrasados}</strong> atrasado(s)</span>` : ''}
          ${perdidos ? `<button class="link-sutil" data-acao="ver-perdidos">${perdidos} perdido(s)</button>` : ''}
        </div>
        <div class="funil-quadro">${COLUNAS.map((c) => {
          let itens = lista.filter((l) => l.etapa === c);
          if (c === 'matriculado') itens = itens.sort((a, b) => String(b.etapaEm).localeCompare(String(a.etapaEm)));
          else itens = itens.sort((a, b) => prioridade(a) - prioridade(b) || String(a.proximoContato || '9999').localeCompare(String(b.proximoContato || '9999')));
          const mostrar = c === 'matriculado' ? itens.slice(0, 12) : itens;
          return `<div class="funil-coluna" data-coluna="${c}">
            <div class="funil-coluna-cab"><span>${opcoes.etapas[c]}</span><span class="funil-conta">${itens.length}</span></div>
            <div class="funil-coluna-itens">${mostrar.map(cartao).join('') || `<div class="funil-vazio">${c === 'matriculado' ? 'Arraste aqui para matricular' : 'Nenhum'}</div>`}
              ${itens.length > mostrar.length ? `<button class="link-sutil" data-acao="ver-matriculados">+ ${itens.length - mostrar.length} na Lista</button>` : ''}</div>
          </div>`;
        }).join('')}
          <div class="funil-coluna perdido" data-coluna="perdido"><div class="funil-coluna-cab"><span>Perdido</span></div>
            <div class="funil-vazio">Arraste aqui para marcar como perdido</div></div>
        </div>
      </div>`;
  }

  /* =====================================================================
   *  Lista
   * ===================================================================== */
  function desenharLista(corpo) {
    const lista = filtrados().filter((l) => !est.etapa || l.etapa === est.etapa);
    corpo.innerHTML = `
      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-list"></i> Interessados</div>
          <span style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-secundario" data-acao="csv"><i class="ti ti-file-spreadsheet"></i> Exportar</button>
            <button class="btn btn-primario" data-acao="novo"><i class="ti ti-plus"></i> Novo interessado</button></span></div>
        ${barraFiltros(`<select class="select" data-filtro="etapa"><option value="">Todas as etapas</option>${Object.entries(opcoes.etapas).map(([k, v]) => `<option value="${k}" ${est.etapa === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
        <div class="tabela-wrap"><table>
          <thead><tr><th>Aluno</th><th>Responsável</th><th>Origem</th><th>Etapa</th><th>Próximo contato</th><th>Entrada</th><th></th></tr></thead>
          <tbody>${lista.map((l) => `<tr data-lead="${l.id}" class="${l.novo ? 'linha-atual' : ''}">
            <td><strong>${EG.esc(l.nomeAluno)}</strong><br><small>${[l.serie, l.ano].filter(Boolean).map(EG.esc).join(' · ') || '—'}</small></td>
            <td>${EG.esc(l.responsavel || '—')}${l.telefone ? `<br><small>${EG.esc(l.telefone)}</small>` : ''}</td>
            <td>${EG.esc(l.origem || '—')}${l.viaFormulario ? '<br><small>formulário</small>' : ''}</td>
            <td><span class="selo ${SELO_ETAPA[l.etapa]}">${opcoes.etapas[l.etapa]}</span>${l.motivoPerda ? `<br><small>${EG.esc(l.motivoPerda)}</small>` : ''}${l.aluno ? `<br><small>aluno: ${EG.esc(l.aluno)}</small>` : ''}</td>
            <td>${l.proximoContato ? `<span class="${l.contato === 'atrasado' ? 'texto-erro' : l.contato === 'hoje' ? 'texto-aviso' : ''}">${EG.data(l.proximoContato)}</span>` : '—'}</td>
            <td>${EG.data(l.criadoEm)}</td>
            <td class="acoes">${l.telefone ? '<button class="btn-icone" data-acao="whats" title="WhatsApp"><i class="ti ti-brand-whatsapp"></i></button>' : ''}
              <button class="btn-icone" data-acao="abrir" title="Abrir"><i class="ti ti-chevron-right"></i></button></td>
          </tr>`).join('') || `<tr><td colspan="7"><div class="vazio"><i class="ti ti-users"></i>${leads.length ? 'Nenhum interessado com esses filtros' : 'Nenhum interessado ainda. Cadastre o primeiro ou divulgue o formulário.'}</div></td></tr>`}</tbody>
        </table></div>
      </div>`;
  }

  /* =====================================================================
   *  Números
   * ===================================================================== */
  function kpi(icone, fundo, cor, rotulo, valor, obs) {
    return `<div class="kpi"><div class="kpi-icone" style="background:${fundo};color:${cor}"><i class="ti ${icone}"></i></div>
      <div><div class="kpi-rotulo">${rotulo}</div><div class="kpi-valor">${EG.esc(valor)}</div><div class="kpi-obs">${EG.esc(obs)}</div></div></div>`;
  }

  function barras(itens, { valor, rotulo, extra, cor = 'var(--amber)' }) {
    const max = Math.max(1, ...itens.map(valor));
    return `<div class="funil-barras">${itens.map((x) => `<div class="funil-barra">
      <span class="funil-barra-rot">${EG.esc(rotulo(x))}</span>
      <span class="funil-barra-trilho"><span style="width:${valor(x) ? Math.max(2, (valor(x) / max) * 100) : 0}%;background:${cor}"></span></span>
      <span class="funil-barra-val">${valor(x)}${extra ? ` <small>${extra(x)}</small>` : ''}</span></div>`).join('')}</div>`;
  }

  async function desenharNumeros(corpo) {
    corpo.innerHTML = EG.esqueleto();
    const q = est.ano ? `?ano=${est.ano}` : '';
    const r = await EG.api('GET', `/funil/indicadores${q}`);
    const anos = [...new Set([opcoes.anoLetivo, opcoes.anoLetivo + 1, ...leads.map((l) => l.ano).filter(Boolean)])].sort((a, b) => b - a);
    const etapas = ['lead', 'visita', 'proposta', 'matriculado', 'perdido'].map((k) => ({ k, nome: opcoes.etapas[k], n: r.porEtapa[k] || 0 }));
    const maxMes = Math.max(1, ...r.meses.map((m) => Math.max(m.novos, m.matriculas)));
    corpo.innerHTML = `
      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-chart-bar"></i> Números da captação</div>
          <select class="select" data-filtro="ano" style="max-width:200px"><option value="">Todos os anos</option>${anos.map((a) => `<option ${String(est.ano) === String(a) ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
        <div class="grade-kpi" style="margin-bottom:0">
          ${kpi('ti-users', 'var(--info-bg)', 'var(--info)', 'Interessados', r.total, `${r.emAndamento} em andamento`)}
          ${kpi('ti-school', 'var(--ok-bg)', 'var(--ok)', 'Matriculados', r.porEtapa.matriculado, `${r.porEtapa.perdido} perdido(s)`)}
          ${kpi('ti-percentage', 'var(--aviso-bg)', 'var(--amber-d)', 'Conversão', pct(r.conversao), 'matriculados ÷ (matriculados + perdidos)')}
          ${kpi('ti-clock', 'var(--roxo-bg)', 'var(--roxo)', 'Até a matrícula', r.diasAteMatricula === null ? '—' : `${r.diasAteMatricula} dia(s)`, 'média, do 1º contato à matrícula')}
        </div>
      </div>
      <div class="linha-2" style="gap:20px;align-items:start">
        <div class="card" style="margin:0"><div class="card-cab"><div class="card-titulo">Por etapa</div></div>
          ${barras(etapas, { valor: (x) => x.n, rotulo: (x) => x.nome })}</div>
        <div class="card" style="margin:0"><div class="card-cab"><div class="card-titulo">Por origem</div></div>
          ${r.origens.length ? barras(r.origens, { valor: (x) => x.total, rotulo: (x) => x.nome, extra: (x) => `${x.matriculados} matr. · ${pct(x.conversao)}` }) : '<div class="vazio">Sem dados</div>'}</div>
      </div>
      <div class="linha-2" style="gap:20px;align-items:start;margin-top:20px">
        <div class="card" style="margin:0"><div class="card-cab"><div class="card-titulo">Por série pretendida</div></div>
          ${r.series.length ? barras(r.series, { valor: (x) => x.total, rotulo: (x) => x.nome, extra: (x) => `${x.matriculados} matr.` }) : '<div class="vazio">Sem dados</div>'}</div>
        <div class="card" style="margin:0"><div class="card-cab"><div class="card-titulo">Motivos de perda</div></div>
          ${r.motivos.length ? barras(r.motivos, { valor: (x) => x.total, rotulo: (x) => x.nome, cor: 'var(--muted)' }) : '<div class="vazio">Nenhuma perda registrada</div>'}</div>
      </div>
      <div class="card" style="margin-top:20px"><div class="card-cab"><div class="card-titulo">Últimos 12 meses</div>
        <span class="funil-legenda"><span><i style="background:var(--info)"></i> Novos interessados</span><span><i style="background:var(--ok)"></i> Matrículas</span></span></div>
        <div class="funil-meses">${r.meses.map((m) => `<div class="funil-mes" title="${EG.nomeRef(m.mes)}: ${m.novos} novo(s), ${m.matriculas} matrícula(s)">
          <div class="funil-mes-barras">
            <span style="height:${(m.novos / maxMes) * 100}%;background:var(--info)">${m.novos ? `<b>${m.novos}</b>` : ''}</span>
            <span style="height:${(m.matriculas / maxMes) * 100}%;background:var(--ok)">${m.matriculas ? `<b>${m.matriculas}</b>` : ''}</span>
          </div><small>${EG.nomeRef(m.mes).slice(0, 3)}</small></div>`).join('')}</div>
      </div>`;
  }

  /* =====================================================================
   *  Formulário público
   * ===================================================================== */
  async function desenharFormulario(corpo) {
    const f = await EG.api('GET', '/funil/formulario');
    opcoes.formulario = f;
    const admin = opcoes.admin;
    corpo.innerHTML = `
      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-forms"></i> Formulário de interesse</div>
          <span class="selo ${f.ativo ? 'selo-ok' : 'selo-neutro'}">${f.ativo ? 'No ar' : 'Desligado'}</span></div>
        <p class="card-desc">Um link para divulgar na bio do Instagram, no site, no status do WhatsApp ou em panfletos com QR Code. Quem preencher entra no funil como <strong>Interessado</strong>, marcado como novo, e o contato é autorizado pelo próprio responsável.</p>
        ${f.url && f.ativo ? `<div class="codigo-box" style="margin-bottom:14px">
          <code style="font-size:13px;letter-spacing:0;word-break:break-all" data-link>${EG.esc(f.url)}</code>
          <button class="btn btn-secundario btn-pequeno" data-acao="copiar-link"><i class="ti ti-copy"></i> Copiar</button>
          <a class="btn btn-secundario btn-pequeno" href="${EG.esc(f.url)}" target="_blank" rel="noopener"><i class="ti ti-external-link"></i> Abrir</a>
          <button class="btn btn-whats btn-pequeno" data-acao="whats-link"><i class="ti ti-brand-whatsapp"></i> Compartilhar</button>
        </div>` : ''}
        ${admin ? `
        <label class="check-linha"><input type="checkbox" name="ativo" ${f.ativo ? 'checked' : ''}> Deixar o formulário no ar</label>
        <div class="campo"><label>Título</label><input class="input" name="titulo" maxlength="120" value="${EG.esc(f.titulo || '')}" placeholder="Quero conhecer o ${EG.esc(EG.estado.colegio.nome)}"></div>
        <div class="campo"><label>Mensagem</label><textarea class="textarea" name="mensagem" rows="3" maxlength="500" placeholder="Preencha seus dados e a nossa equipe entra em contato para apresentar a escola e agendar uma visita.">${EG.esc(f.mensagem || '')}</textarea></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primario" data-acao="salvar-form"><i class="ti ti-device-floppy"></i> Salvar</button>
          ${f.url ? '<button class="btn btn-secundario" data-acao="novo-link"><i class="ti ti-refresh"></i> Trocar o link</button>' : ''}
        </div>` : `<p class="sub">${f.ativo ? 'Só o administrador muda o formulário.' : 'O formulário está desligado. Peça ao administrador para colocá-lo no ar.'}</p>`}
        <div class="msg-info" style="margin-top:14px">Proteções: limite de envios por aparelho, campo invisível contra robôs e envios repetidos do mesmo aluno e telefone juntados no mesmo cadastro.</div>
      </div>`;
  }

  /* =====================================================================
   *  Ficha do interessado
   * ===================================================================== */
  function formLead(l) {
    l = l || {};
    const opc = (lista, atual) => lista.map((x) => `<option ${atual === x ? 'selected' : ''}>${EG.esc(x)}</option>`).join('');
    const series = l.serie && !opcoes.series.includes(l.serie) ? [l.serie, ...opcoes.series] : opcoes.series;
    return `
      <div class="linha-2">
        <div class="campo"><label>Nome do(a) aluno(a) *</label><input class="input" name="nomeAluno" maxlength="100" value="${EG.esc(l.nomeAluno)}"></div>
        <div class="campo"><label>Data de nascimento</label><input class="input" type="date" name="nascimento" value="${EG.esc(l.nascimento)}"></div>
      </div>
      <div class="linha-3">
        <div class="campo"><label>Série pretendida</label><select class="select" name="serie"><option value="">—</option>${opc(series, l.serie)}</select></div>
        <div class="campo"><label>Ano letivo</label><select class="select" name="ano"><option value="">—</option>${[opcoes.anoLetivo, opcoes.anoLetivo + 1].concat(l.ano && ![opcoes.anoLetivo, opcoes.anoLetivo + 1].includes(l.ano) ? [l.ano] : []).map((a) => `<option ${Number(l.ano || (l.id ? 0 : opcoes.anoLetivo)) === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
        <div class="campo"><label>Turno</label><select class="select" name="turno"><option value="">—</option>${Object.entries(opcoes.turnos).map(([k, v]) => `<option value="${k}" ${l.turno === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      </div>
      <div class="linha-3">
        <div class="campo"><label>Responsável</label><input class="input" name="responsavel" maxlength="100" value="${EG.esc(l.responsavel)}"></div>
        <div class="campo"><label>Telefone / WhatsApp</label><input class="input" name="telefone" data-mascara="telefone" maxlength="15" value="${EG.esc(l.telefone)}"></div>
        <div class="campo"><label>E-mail</label><input class="input" type="email" name="email" maxlength="160" value="${EG.esc(l.email)}"></div>
      </div>
      <div class="linha-2">
        <div class="campo"><label>Como conheceu o colégio</label><select class="select" name="origem"><option value="">—</option>${opc(l.origem && !opcoes.origens.includes(l.origem) ? [l.origem, ...opcoes.origens] : opcoes.origens, l.origem)}</select></div>
        <div class="campo"><label>Próximo contato</label><input class="input" type="date" name="proximoContato" value="${EG.esc(l.proximoContato)}"></div>
      </div>
      <div class="campo"><label>Observação</label><textarea class="textarea" name="obs" rows="2" maxlength="500">${EG.esc(l.obs)}</textarea></div>`;
  }

  function modalNovo(el) {
    const m = EG.modal({
      titulo: 'Novo interessado',
      largura: 680,
      corpo: formLead(null),
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Cadastrar', classe: 'btn-primario', icone: 'ti-device-floppy', acao: async () => {
          const r = await EG.api('POST', '/funil/leads', EG.lerForm(m.el));
          m.fechar(); EG.toast(`${r.nomeAluno} entrou no funil`);
          await recarregar(el);
        } }
      ]
    });
  }

  function textoWhats(l) {
    const nome = String(l.responsavel || '').split(' ')[0];
    return `Olá${nome ? `, ${nome}` : ''}! Aqui é do *${EG.estado.colegio.nome}*. Recebemos o seu interesse${l.nomeAluno ? ` na matrícula de *${l.nomeAluno}*` : ''}`
      + `${l.serie ? ` para o ${l.serie}` : ''}${l.ano ? ` em ${l.ano}` : ''}. Podemos conversar e agendar uma visita? 😊`;
  }

  const ICONE_INTERACAO = { nota: 'ti-note', contato: 'ti-phone', etapa: 'ti-arrows-right', sistema: 'ti-info-circle' };

  async function modalLead(el, id) {
    const l = await EG.api('GET', `/funil/leads/${id}`);
    const fechado = l.etapa === 'matriculado' || l.etapa === 'perdido';
    const m = EG.modal({
      titulo: l.nomeAluno,
      largura: 760,
      corpo: `
        <div class="funil-ficha-topo">
          <span class="selo ${SELO_ETAPA[l.etapa]}">${opcoes.etapas[l.etapa]}</span>
          <span class="sub">${[l.serie, l.ano, l.turno ? opcoes.turnos[l.turno] : null].filter(Boolean).map(EG.esc).join(' · ')}</span>
          ${l.motivoPerda ? `<span class="sub">· motivo: ${EG.esc(l.motivoPerda)}</span>` : ''}
          ${l.aluno ? `<span class="sub">· aluno: <strong>${EG.esc(l.aluno)}</strong></span>` : ''}
          ${l.etapa === 'visita' && l.visitaEm ? `<span class="selo selo-roxo">Visita ${EG.dataHora(l.visitaEm)}</span>` : ''}
        </div>
        <div class="funil-ficha-contato">
          <div><i class="ti ti-user"></i> ${EG.esc(l.responsavel || 'Responsável não informado')}
            ${l.telefone ? `<br><i class="ti ti-phone"></i> ${EG.esc(l.telefone)}` : ''}${l.email ? `<br><i class="ti ti-mail"></i> ${EG.esc(l.email)}` : ''}</div>
          <div class="funil-ficha-botoes">
            ${l.telefone ? `<button type="button" class="btn btn-whats btn-pequeno" data-ficha="whats"><i class="ti ti-brand-whatsapp"></i> WhatsApp</button>
            <a class="btn btn-secundario btn-pequeno" href="tel:${EG.esc(String(l.telefone).replace(/\D/g, ''))}"><i class="ti ti-phone-call"></i> Ligar</a>` : ''}
          </div>
        </div>
        ${fechado ? (l.etapa === 'perdido' ? '<div class="funil-ficha-etapas"><button type="button" class="btn btn-secundario btn-pequeno" data-mover="lead"><i class="ti ti-refresh"></i> Reabrir</button></div>' : '') : `
        <div class="funil-ficha-etapas">
          <span class="rotulo" style="margin:0">Mover para</span>
          ${['lead', 'visita', 'proposta'].map((k) => `<button type="button" class="chip ${l.etapa === k ? 'ativo' : ''}" data-mover="${k}">${opcoes.etapas[k]}</button>`).join('')}
          <button type="button" class="chip" data-mover="perdido">Perdido</button>
          ${opcoes.podeMatricular ? '<button type="button" class="btn btn-primario btn-pequeno" data-ficha="matricular" style="margin-left:auto"><i class="ti ti-school"></i> Matricular</button>' : ''}
        </div>`}
        <div class="rotulo" style="margin-top:14px">Histórico de contatos</div>
        ${fechado ? '' : `<div class="funil-anotar">
          <textarea class="textarea" data-nota rows="2" maxlength="600" placeholder="O que foi conversado? Ex.: liguei, pediu os valores e vai visitar no sábado"></textarea>
          <div class="funil-anotar-linha">
            <select class="select" data-nota-tipo><option value="contato">Contato feito</option><option value="nota">Anotação</option></select>
            <label class="sub">Próximo contato <input class="input" type="date" data-nota-proximo value="${EG.esc(l.proximoContato)}"></label>
            <button type="button" class="btn btn-secundario btn-pequeno" data-ficha="anotar"><i class="ti ti-plus"></i> Registrar</button>
          </div></div>`}
        <ul class="funil-historico">${l.interacoes.map((x) => `<li><i class="ti ${ICONE_INTERACAO[x.tipo] || 'ti-point'}"></i>
          <div><span>${EG.esc(x.texto)}</span><small>${EG.dataHora(x.em)}${x.autor ? ` · ${EG.esc(x.autor)}` : ''}</small></div></li>`).join('') || '<li class="sub">Sem registros</li>'}</ul>
        <details class="doc-ajuste" style="margin-top:12px"><summary><i class="ti ti-edit"></i> Dados do interessado</summary>
          <div data-dados style="margin-top:10px">${formLead(l)}</div>
          <div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap">
            <button type="button" class="btn btn-secundario btn-pequeno perigo" data-ficha="excluir"><i class="ti ti-trash"></i> Excluir interessado</button>
            <button type="button" class="btn btn-primario btn-pequeno" data-ficha="salvar"><i class="ti ti-device-floppy"></i> Salvar dados</button>
          </div></details>`,
      botoes: [{ texto: 'Fechar', acao: () => m.fechar() }]
    });
    const recarregarFicha = async () => { m.fechar(); await recarregar(el); await modalLead(el, id); };
    m.el.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-ficha], [data-mover]');
      if (!b) return;
      try {
        if (b.dataset.mover) {
          await EG.guarda(b, () => moverPara(el, l, b.dataset.mover, recarregarFicha));
          return;
        }
        const acao = b.dataset.ficha;
        if (acao === 'whats') EG.abrirWhatsApp(l.telefone, textoWhats(l));
        else if (acao === 'matricular') { m.fechar(); await modalMatricular(el, l); }
        else if (acao === 'anotar') {
          const texto = m.el.querySelector('[data-nota]').value.trim();
          if (!texto) { m.erro('Escreva o que foi conversado'); return; }
          await EG.guarda(b, () => EG.api('POST', `/funil/leads/${l.id}/interacoes`, {
            tipo: m.el.querySelector('[data-nota-tipo]').value, texto, proximoContato: m.el.querySelector('[data-nota-proximo]').value || null
          }));
          EG.toast('Registrado');
          await recarregarFicha();
        } else if (acao === 'salvar') {
          await EG.guarda(b, () => EG.api('PUT', `/funil/leads/${l.id}`, EG.lerForm(m.el.querySelector('[data-dados]'))));
          EG.toast('Dados salvos');
          await recarregarFicha();
        } else if (acao === 'excluir') {
          if (!(await EG.confirmar(`Excluir ${l.nomeAluno} do funil? O histórico de contatos também será apagado.`, { perigo: true, textoOk: 'Excluir' }))) return;
          await EG.api('DELETE', `/funil/leads/${l.id}`);
          m.fechar(); EG.toast('Interessado excluído');
          await recarregar(el);
        }
      } catch (e) { m.erro(e.message); }
    });
  }

  /** Mudança de etapa (pelos botões da ficha ou arrastando no quadro). */
  async function moverPara(el, l, etapa, depois) {
    if (etapa === 'matriculado') { if (opcoes.podeMatricular) await modalMatricular(el, l); else EG.toast('Para matricular é preciso ter acesso ao cadastro de alunos', 'erro'); return; }
    if (etapa === l.etapa && etapa !== 'visita') return;
    const corpo = {};
    if (etapa === 'perdido' || etapa === 'visita') {
      const ok = await new Promise((resolve) => {
        const md = EG.modal({
          titulo: etapa === 'perdido' ? `Marcar ${l.nomeAluno} como perdido` : `Visita de ${l.nomeAluno}`,
          largura: 460,
          corpo: etapa === 'perdido'
            ? `<div class="campo"><label>Motivo *</label><select class="select" name="motivo"><option value="">Escolha</option>${opcoes.motivos.map((x) => `<option>${EG.esc(x)}</option>`).join('')}</select></div>`
            : `<div class="campo"><label>Data e hora da visita (opcional)</label><input class="input" type="datetime-local" name="visitaEm" value="${EG.esc(l.visitaEm ? String(l.visitaEm).slice(0, 16).replace(' ', 'T') : '')}"></div>`,
          aoFechar: () => resolve(false),
          botoes: [
            { texto: 'Cancelar', acao: () => md.fechar() },
            { texto: etapa === 'perdido' ? 'Marcar como perdido' : 'Salvar', classe: etapa === 'perdido' ? 'btn-perigo' : 'btn-primario', acao: () => {
              const d = EG.lerForm(md.el);
              if (etapa === 'perdido' && !d.motivo) { md.erro('Escolha o motivo'); return; }
              Object.assign(corpo, d);
              resolve(true); md.fechar();
            } }
          ]
        });
      });
      if (!ok) return;
    }
    await EG.api('POST', `/funil/leads/${l.id}/etapa`, { etapa, ...corpo });
    EG.toast(`${l.nomeAluno}: ${opcoes.etapas[etapa]}`);
    if (depois) await depois(); else await recarregar(el);
  }

  /* =====================================================================
   *  Matrícula
   * ===================================================================== */
  async function modalMatricular(el, l) {
    const anoAlvo = Number(l.ano) || opcoes.anoLetivo;
    const turmas = opcoes.turmas;
    const sugerida = turmas.find((t) => t.anoLetivo === anoAlvo && t.serie === l.serie);
    const grupos = [...new Set(turmas.map((t) => t.anoLetivo))].sort((a, b) => b - a);
    const mesAtual = Number(EG.hojeSP().slice(5, 7));
    const mesIni = (t) => (t && t.anoLetivo === Number(EG.hojeSP().slice(0, 4)) ? mesAtual : 1);
    const meses = EG.MESES.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
    const m = EG.modal({
      titulo: `Matricular ${l.nomeAluno}`,
      largura: 720,
      corpo: `
        <div class="filtros" style="margin-bottom:12px">
          <button type="button" class="chip ativo" data-modo="novo">Cadastrar novo aluno</button>
          <button type="button" class="chip" data-modo="existente">Aluno já cadastrado</button>
        </div>
        <div data-bloco="novo">
          <div class="linha-2">
            <div class="campo"><label>Nome do(a) aluno(a) *</label><input class="input" name="nome" maxlength="100" value="${EG.esc(l.nomeAluno)}"></div>
            <div class="campo"><label>Data de nascimento</label><input class="input" type="date" name="nascimento" value="${EG.esc(l.nascimento)}"></div>
          </div>
          <div class="campo"><label>Turma *</label><select class="select" name="turmaId" data-turma><option value="">Escolha a turma</option>
            ${grupos.map((a) => `<optgroup label="Ano letivo ${a}">${turmas.filter((t) => t.anoLetivo === a).map((t) => `<option value="${t.id}" ${sugerida && sugerida.id === t.id ? 'selected' : ''}>${EG.esc(t.nome)} · ${EG.esc(t.serie || '')}</option>`).join('')}</optgroup>`).join('')}</select>
            ${!sugerida && l.serie ? `<small>Não há turma de ${EG.esc(l.serie)} em ${anoAlvo}. Crie em Turmas e Séries, ou escolha outra.</small>` : ''}</div>
          <div class="linha-3">
            <div class="campo"><label>Responsável</label><input class="input" name="respNome" maxlength="100" value="${EG.esc(l.responsavel)}"></div>
            <div class="campo"><label>Parentesco</label><select class="select" name="respParentesco">${PARENTESCOS.map((p) => `<option>${p}</option>`).join('')}</select></div>
            <div class="campo"><label>CPF do responsável</label><input class="input" name="respCpf" data-mascara="cpf" maxlength="14" autocomplete="off"></div>
          </div>
          <div class="linha-2">
            <div class="campo"><label>Telefone / WhatsApp</label><input class="input" name="respTelefone" data-mascara="telefone" maxlength="15" value="${EG.esc(l.telefone)}"></div>
            <div class="campo"><label>E-mail</label><input class="input" type="email" name="respEmail" maxlength="160" value="${EG.esc(l.email)}"></div>
          </div>
        </div>
        <div data-bloco="existente" hidden>
          <div class="campo"><label>Aluno *</label><select class="select" name="alunoExistenteId"><option value="">Carregando…</option></select>
            <small>Use quando o aluno já foi cadastrado em Alunos (ex.: irmão, ou cadastro feito antes).</small></div>
        </div>
        ${opcoes.podeMensalidades ? `
        <div class="doc-transf" style="margin-top:6px">
          <label><input type="checkbox" name="gerar" data-gerar checked> Gerar as mensalidades do ano letivo da turma</label>
          <div class="linha-3" data-mens>
            <div class="campo"><label>De</label><select class="select" name="mesInicial">${meses}</select></div>
            <div class="campo"><label>Até</label><select class="select" name="mesFinal">${meses}</select></div>
            <div class="campo"><label>Dia do vencimento</label><input class="input" type="number" name="diaVencimento" min="1" max="28" value="${EG.esc(opcoes.mensalidade.diaVencimento)}"></div>
          </div>
          <div class="campo" style="max-width:260px" data-mens><label>Valor da mensalidade (R$)</label><input class="input" name="valor" inputmode="decimal" value="${EG.valorCampo(opcoes.mensalidade.valor)}"></div>
          <small class="sub">Bolsas e descontos do aluno (se houver) são aplicados como em Mensalidades.</small>
        </div>` : ''}`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Matricular', classe: 'btn-primario', icone: 'ti-school', acao: async () => {
          const d = EG.lerForm(m.el);
          const existente = !m.el.querySelector('[data-bloco="existente"]').hidden;
          const corpo = existente ? { alunoExistenteId: d.alunoExistenteId || null } : {
            aluno: { nome: d.nome, nascimento: d.nascimento, turmaId: d.turmaId, respNome: d.respNome, respParentesco: d.respParentesco, respCpf: d.respCpf, respTelefone: d.respTelefone, respEmail: d.respEmail }
          };
          if (existente && !d.alunoExistenteId) throw EG.erro('Escolha o aluno');
          const gerar = m.el.querySelector('[data-gerar]');
          if (gerar && gerar.checked) {
            const valor = EG.lerDinheiro(d.valor);
            if (!valor) throw EG.erro('Informe o valor da mensalidade');
            corpo.mensalidades = { gerar: true, mesInicial: d.mesInicial, mesFinal: d.mesFinal, diaVencimento: d.diaVencimento, valor };
          }
          const r = await EG.api('POST', `/funil/leads/${l.id}/matricular`, corpo);
          m.fechar();
          await recarregar(el);
          modalMatriculado(r, corpo.mensalidades);
        } }
      ]
    });
    const ajustarMeses = () => {
      const t = turmas.find((x) => String(x.id) === m.el.querySelector('[data-turma]').value);
      const ini = m.el.querySelector('[name=mesInicial]');
      if (ini) { ini.value = String(mesIni(t)); m.el.querySelector('[name=mesFinal]').value = '12'; }
    };
    ajustarMeses();
    m.el.addEventListener('change', (ev) => {
      if (ev.target.matches('[data-turma]')) ajustarMeses();
      if (ev.target.matches('[data-gerar]')) m.el.querySelectorAll('[data-mens]').forEach((x) => { x.hidden = !ev.target.checked; });
    });
    m.el.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-modo]');
      if (!b) return;
      m.el.querySelectorAll('[data-modo]').forEach((x) => x.classList.toggle('ativo', x === b));
      const existente = b.dataset.modo === 'existente';
      m.el.querySelector('[data-bloco="novo"]').hidden = existente;
      m.el.querySelector('[data-bloco="existente"]').hidden = !existente;
      const sel = m.el.querySelector('[name=alunoExistenteId]');
      if (existente && !sel.dataset.ok) {
        try {
          const alunos = await EG.api('GET', '/alunos');
          sel.innerHTML = `<option value="">Escolha o aluno</option>${alunos.map((a) => `<option value="${a.id}">${EG.esc(a.nome)}${a.turma ? ` — ${EG.esc(a.turma)}` : ''}</option>`).join('')}`;
          sel.dataset.ok = '1';
        } catch (e) { m.erro(e.message); }
      }
    });
  }

  function modalMatriculado(r, mens) {
    const a = r.aluno;
    const m = EG.modal({
      titulo: 'Matrícula feita',
      largura: 520,
      corpo: `<div class="doc-emitido" style="margin-top:0"><i class="ti ti-circle-check"></i>
          <div><strong>${EG.esc(a.nome)}</strong> está matriculado(a)${r.turma ? ` no ${EG.esc(r.turma.nome)} (${r.turma.anoLetivo})` : ''}.
          <br><span class="sub">RA ${EG.esc(a.ra)} · código de acesso do responsável <strong>${EG.esc(a.codigoAcesso)}</strong>${r.mensalidades.geradas ? ` · ${r.mensalidades.geradas} mensalidade(s) gerada(s) (${EG.moeda(r.mensalidades.total)})` : ''}</span></div></div>
        <p class="card-desc">Próximos passos:</p>
        <div class="funil-proximos">
          <button type="button" class="btn btn-whats" data-pos="codigo"><i class="ti ti-brand-whatsapp"></i> Enviar o código do portal ao responsável</button>
          ${EG.pode('documentos') ? '<button type="button" class="btn btn-secundario" data-pos="contrato"><i class="ti ti-file-certificate"></i> Emitir o contrato de prestação de serviços</button>' : ''}
          ${EG.pode('alunos') && EG.abrirFichaAluno ? '<button type="button" class="btn btn-secundario" data-pos="ficha"><i class="ti ti-user-edit"></i> Completar a ficha do aluno</button>' : ''}
        </div>`,
      botoes: [{ texto: 'Fechar', acao: () => m.fechar() }]
    });
    m.el.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-pos]');
      if (!b) return;
      try {
        if (b.dataset.pos === 'codigo') {
          const msg = EG.mensagemCodigoAluno ? EG.mensagemCodigoAluno(a.nome, a.codigoAcesso)
            : `Código de acesso ao portal do responsável de ${a.nome}: ${a.codigoAcesso}`;
          EG.abrirWhatsApp(a.respTelefone, msg);
        } else if (b.dataset.pos === 'contrato') {
          m.fechar();
          // o contrato já sai com o valor, as parcelas e o vencimento da matrícula
          EG.abrirEmissao(a.id, 'contrato', mens ? {
            valor: EG.valorCampo(mens.valor), parcelas: String(Number(mens.mesFinal) - Number(mens.mesInicial) + 1), diaVencimento: String(mens.diaVencimento)
          } : {});
        }
        else if (b.dataset.pos === 'ficha') { m.fechar(); await EG.abrirFichaAluno(a.id); }
      } catch (e) { m.erro(e.message); }
    });
  }

  /* =====================================================================
   *  Registro e eventos
   * ===================================================================== */
  async function recarregar(el) {
    await carregar();
    await desenhar(el);
    EG.atualizarFunil();
  }

  EG.registrarModulo('funil', {
    async render(el) {
      EG.filtrosDaSessao(est, { aba: 'quadro', busca: '', ano: '', serie: '', origem: '', etapa: '' });
      [opcoes] = await Promise.all([EG.api('GET', '/funil/opcoes'), carregar()]);
      el.innerHTML = '<div data-abas></div><div data-corpo></div>';
      await desenhar(el);
      EG.atualizarFunil();
      const corpo = el.querySelector('[data-corpo]');
      const erro = (e) => EG.toast(e.message, 'erro');
      let arrastando = null;

      el.oninput = (ev) => {
        if (!ev.target.matches('[data-filtro="busca"]')) return;
        est.busca = ev.target.value;
        clearTimeout(espera);
        espera = setTimeout(() => {
          desenhar(el).then(() => { const i = corpo.querySelector('[data-filtro="busca"]'); if (i) { i.focus(); i.selectionStart = i.selectionEnd = i.value.length; } }).catch(erro);
        }, 300);
      };
      el.onchange = (ev) => {
        const t = ev.target;
        if (t.matches('[data-filtro]') && t.dataset.filtro !== 'busca') { est[t.dataset.filtro] = t.value; desenhar(el).catch(erro); }
      };
      el.onclick = async (ev) => {
        const t = ev.target;
        const aba = t.closest('[data-aba]');
        if (aba) { est.aba = aba.dataset.aba; desenhar(el).catch(erro); return; }
        const b = t.closest('[data-acao]');
        try {
          if (b) {
            const acao = b.dataset.acao;
            const linha = b.closest('[data-lead]');
            const l = linha ? leads.find((x) => String(x.id) === linha.dataset.lead) : null;
            if (acao === 'novo') modalNovo(el);
            else if (acao === 'abrir' && l) await modalLead(el, l.id);
            else if (acao === 'whats' && l) EG.abrirWhatsApp(l.telefone, textoWhats(l));
            else if (acao === 'ver-perdidos') { est.aba = 'lista'; est.etapa = 'perdido'; await desenhar(el); }
            else if (acao === 'ver-matriculados') { est.aba = 'lista'; est.etapa = 'matriculado'; await desenhar(el); }
            else if (acao === 'csv') {
              const lista = filtrados().filter((x) => !est.etapa || x.etapa === est.etapa);
              EG.baixarCsv(`funil-${EG.hojeSP()}.csv`, ['Aluno', 'Nascimento', 'Série', 'Ano', 'Turno', 'Responsável', 'Telefone', 'E-mail', 'Origem', 'Etapa', 'Motivo da perda', 'Próximo contato', 'Entrada'],
                lista.map((x) => [x.nomeAluno, EG.data(x.nascimento), x.serie, x.ano, x.turno ? opcoes.turnos[x.turno] : '', x.responsavel, x.telefone, x.email, x.origem,
                  opcoes.etapas[x.etapa], x.motivoPerda, x.proximoContato ? EG.data(x.proximoContato) : '', EG.data(x.criadoEm)]));
            } else if (acao === 'copiar-link') EG.copiar(opcoes.formulario.url, 'Link copiado!');
            else if (acao === 'whats-link') EG.abrirWhatsApp('', `Quer conhecer o *${EG.estado.colegio.nome}*? Deixe seus dados neste link e a nossa equipe entra em contato: ${opcoes.formulario.url}`);
            else if (acao === 'salvar-form') {
              const card = b.closest('.card');
              const d = { ativo: card.querySelector('[name=ativo]').checked, titulo: card.querySelector('[name=titulo]').value, mensagem: card.querySelector('[name=mensagem]').value };
              await EG.guarda(b, () => EG.api('PUT', '/funil/formulario', d));
              EG.toast(d.ativo ? 'Formulário no ar' : 'Formulário salvo (desligado)');
              await desenharFormulario(corpo);
            } else if (acao === 'novo-link') {
              if (!(await EG.confirmar('Trocar o link do formulário?\n\nO link atual para de funcionar na hora: atualize a bio, o site e os materiais que já divulgaram o endereço.', { textoOk: 'Trocar o link', perigo: true }))) return;
              await EG.api('POST', '/funil/formulario/novo-link');
              EG.toast('Link trocado');
              await desenharFormulario(corpo);
            }
            return;
          }
          const card = t.closest('.funil-card, tr[data-lead]');
          if (card) await modalLead(el, Number(card.dataset.lead));
        } catch (e) { erro(e); }
      };
      el.onkeydown = (ev) => {
        if (ev.key === 'Enter' && ev.target.matches('.funil-card')) { ev.preventDefault(); modalLead(el, Number(ev.target.dataset.lead)).catch(erro); }
      };

      // Arrastar e soltar entre as colunas
      el.ondragstart = (ev) => {
        const c = ev.target.closest && ev.target.closest('.funil-card[draggable="true"]');
        if (!c) return;
        arrastando = leads.find((x) => String(x.id) === c.dataset.lead);
        ev.dataTransfer.effectAllowed = 'move';
        try { ev.dataTransfer.setData('text/plain', c.dataset.lead); } catch (e) { /* alguns navegadores */ }
        c.classList.add('arrastando');
      };
      el.ondragend = () => { arrastando = null; EG.$$('.arrastando, .alvo', el).forEach((x) => x.classList.remove('arrastando', 'alvo')); };
      el.ondragover = (ev) => {
        const col = ev.target.closest && ev.target.closest('[data-coluna]');
        if (!col || !arrastando) return;
        ev.preventDefault();
        EG.$$('.funil-coluna.alvo', el).forEach((x) => { if (x !== col) x.classList.remove('alvo'); });
        col.classList.add('alvo');
      };
      el.ondrop = async (ev) => {
        const col = ev.target.closest && ev.target.closest('[data-coluna]');
        if (!col || !arrastando) return;
        ev.preventDefault();
        const l = arrastando; arrastando = null;
        col.classList.remove('alvo');
        if (col.dataset.coluna === l.etapa) return;
        try { await moverPara(el, l, col.dataset.coluna); } catch (e) { erro(e); }
      };
    }
  });
})(window.EG);
