/* =====================================================================
 *  EduGest — Documentos (secretaria)   [módulo documentos]
 *  Emitir (declarações e histórico escolar) · Emitidos (livro de registro,
 *  2ª via, WhatsApp, cancelamento) · Histórico escolar (anos do aluno) ·
 *  Modelos (textos ajustados pelo colégio).
 * ===================================================================== */
'use strict';
(function (EG) {
  const TIPOS = { matricula: 'Matrícula', frequencia: 'Frequência', transferencia: 'Transferência', conclusao: 'Conclusão', contrato: 'Contrato', historico: 'Histórico escolar', livre: 'Modelo do colégio' };
  const ONDE = { ficha: 'ficha do aluno', turma: 'turma do aluno', diario: 'Diário de Classe', config: 'Configurações', emissao: 'campos da emissão', auto: '' };
  const est = {};
  let opcoes = null;
  let previa = null;       // última prévia (POST /previa)
  let textoProprio = null; // texto ajustado só para este documento (null = texto do modelo)
  let ultimo = null;       // último documento emitido nesta tela
  let pendente = null;     // vindo de outra tela (ex.: matrícula no Funil): { alunoId, modelo }
  let espera = null;

  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const frase = (s) => { const t = String(s || '').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
  const negrito = (s) => EG.esc(s).replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  const absoluta = (u) => new URL(u, location.origin).href;
  const aluno = (id) => opcoes.alunos.find((a) => String(a.id) === String(id));
  const modelo = (ref) => opcoes.modelos.find((m) => m.ref === String(ref));

  function opcoesAlunos(filtro, atual) {
    const f = semAcento(filtro).trim();
    const lista = opcoes.alunos.filter((a) => String(a.id) === String(atual) || !f || semAcento(a.nome).includes(f) || String(a.ra).includes(f));
    const op = (a) => `<option value="${a.id}" ${String(a.id) === String(atual) ? 'selected' : ''}>${EG.esc(a.nome)} — ${a.turma ? EG.esc(a.turma) : 'sem turma'}</option>`;
    const grupo = (rot, l) => (l.length ? `<optgroup label="${rot}">${l.map(op).join('')}</optgroup>` : '');
    return `<option value="">${lista.length ? 'Selecione o aluno' : 'Nenhum aluno encontrado'}</option>`
      + grupo('Ativos', lista.filter((a) => a.status === 'ativo')) + grupo('Transferidos e inativos', lista.filter((a) => a.status !== 'ativo'));
  }

  function seletorAluno(chave, atual) {
    return `<div class="campo"><label>Aluno</label>
      <div class="doc-busca"><input class="input" data-filtro-aluno="${chave}" placeholder="Buscar por nome ou RA" autocomplete="off">
      <select class="select" data-aluno="${chave}">${opcoesAlunos('', atual)}</select></div></div>`;
  }

  function avisoTopo() {
    if (opcoes.pendencias.length) {
      return `<div class="msg-aviso no-print"><strong>Para os documentos saírem completos, falta:</strong> ${opcoes.pendencias.map(EG.esc).join(' · ')}.
        ${opcoes.admin ? '<button class="btn btn-secundario btn-pequeno" data-acao="ir-config" style="margin-left:6px"><i class="ti ti-settings"></i> Configurar</button>' : 'Peça ao administrador para completar em Configurações.'}</div>`;
    }
    if (!opcoes.logo && opcoes.admin) {
      return '<div class="msg-info no-print">Dica: envie o logotipo do colégio em <strong>Configurações → Logotipo e documentos oficiais</strong>. Ele sai no cabeçalho das declarações, do histórico e das cobranças. <button class="btn btn-secundario btn-pequeno" data-acao="ir-config" style="margin-left:6px"><i class="ti ti-photo"></i> Enviar logotipo</button></div>';
    }
    return '';
  }

  function abas() {
    const lista = [['emitir', 'Emitir', 'ti-file-plus'], ['emitidos', 'Emitidos', 'ti-book'], ['historico', 'Histórico escolar', 'ti-school'], ['modelos', 'Modelos', 'ti-template']];
    return `<div class="abas no-print">${lista.map(([v, r, i]) => `<button class="aba ${est.aba === v ? 'ativa' : ''}" data-aba="${v}"><i class="ti ${i}"></i> ${r}</button>`).join('')}</div>`;
  }

  async function desenhar(el) {
    el.querySelector('[data-topo]').innerHTML = avisoTopo();
    el.querySelector('[data-abas]').innerHTML = abas();
    const corpo = el.querySelector('[data-corpo]');
    corpo.innerHTML = EG.esqueleto();
    if (est.aba === 'emitir') desenharEmitir(corpo);
    else if (est.aba === 'emitidos') await desenharEmitidos(corpo);
    else if (est.aba === 'historico') await desenharHistorico(corpo);
    else await desenharModelos(corpo);
  }

  /* =====================================================================
   *  Emitir
   * ===================================================================== */
  function desenharEmitir(corpo) {
    if (!modelo(est.modelo)) est.modelo = 'matricula';
    const m = modelo(est.modelo);
    const hoje = EG.hojeSP();
    corpo.innerHTML = `
      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-file-certificate"></i> Emitir documento</div></div>
        <div class="linha-2">
          ${seletorAluno('emitir', est.alunoId)}
          <div class="campo"><label>Documento</label><select class="select" data-modelo>
            <optgroup label="Modelos do sistema">${opcoes.modelos.filter((x) => x.chave !== 'livre').map((x) => `<option value="${x.ref}" ${x.ref === m.ref ? 'selected' : ''}>${EG.esc(x.rotulo)}${x.personalizado ? ' (ajustado)' : ''}</option>`).join('')}</optgroup>
            ${opcoes.modelos.some((x) => x.chave === 'livre') ? `<optgroup label="Modelos do colégio">${opcoes.modelos.filter((x) => x.chave === 'livre').map((x) => `<option value="${x.ref}" ${x.ref === m.ref ? 'selected' : ''}>${EG.esc(frase(x.rotulo))}</option>`).join('')}</optgroup>` : ''}
          </select></div>
        </div>
        <div data-campos>
          ${m.chave === 'historico' ? `
            <div class="campo"><label>Observação deste histórico (opcional)</label>
              <textarea class="textarea" data-campo="observacao" rows="2" maxlength="1500" placeholder="Sai em Observações, junto com o texto do modelo">${EG.esc(est.observacao || '')}</textarea></div>` : `
            <div class="${m.chave === 'transferencia' ? 'linha-3' : ''}">
              <div class="campo"><label>Finalidade (opcional)</label><input class="input" data-campo="finalidade" maxlength="150" value="${EG.esc(est.finalidade || '')}" placeholder="os devidos fins — ex.: fins de estágio"></div>
              ${m.chave === 'transferencia' ? `
              <div class="campo"><label>Data da transferência</label><input class="input" type="date" data-campo="dataSaida" max="${hoje}" value="${EG.esc(est.dataSaida || hoje)}"></div>
              <div class="campo"><label>Escola de destino (opcional)</label><input class="input" data-campo="destino" maxlength="120" value="${EG.esc(est.destino || '')}" placeholder="Ex.: E.E. Prof. João Silva"></div>` : ''}
            </div>
            ${m.chave === 'contrato' ? `<div class="linha-3">
              <div class="campo"><label>Valor da mensalidade (R$)</label><input class="input" data-campo="valor" inputmode="decimal" value="${EG.esc(est.valor || EG.valorCampo(EG.estado.colegio.config.valorMensalidade))}"></div>
              <div class="campo"><label>Nº de parcelas</label><input class="input" type="number" data-campo="parcelas" min="1" max="12" value="${EG.esc(est.parcelas || 12)}"></div>
              <div class="campo"><label>Dia do vencimento</label><input class="input" type="number" data-campo="diaVencimento" min="1" max="28" value="${EG.esc(est.diaVencimento || EG.estado.colegio.config.diaVencimento || 10)}"></div>
            </div>` : ''}`}
        </div>
        <div data-resultado>${ultimo ? blocoUltimo() : ''}</div>
        <div data-previa>${est.alunoId ? '' : '<div class="vazio"><i class="ti ti-file-search"></i>Escolha o aluno para ver o documento</div>'}</div>
      </div>`;
    if (est.alunoId) carregarPrevia(corpo);
  }

  function lerCampos(corpo) {
    const c = {};
    EG.$$('[data-campo]', corpo).forEach((i) => { c[i.dataset.campo] = i.value.trim(); });
    est.finalidade = c.finalidade || ''; est.destino = c.destino || ''; est.dataSaida = c.dataSaida || ''; est.observacao = c.observacao || '';
    if ('valor' in c) { est.valor = c.valor; est.parcelas = c.parcelas; est.diaVencimento = c.diaVencimento; }
    return c;
  }

  function corpoPedido(corpo) {
    const c = lerCampos(corpo);
    return {
      modelo: est.modelo, alunoId: Number(est.alunoId),
      campos: {
        finalidade: c.finalidade || null, destino: c.destino || null, dataSaida: c.dataSaida || null,
        ...('valor' in c ? { valor: EG.lerDinheiro(c.valor), parcelas: c.parcelas || null, diaVencimento: c.diaVencimento || null } : {})
      },
      observacao: c.observacao || null,
      texto: textoProprio === null ? undefined : textoProprio
    };
  }

  function agendarPrevia(corpo, ms = 450) {
    clearTimeout(espera);
    espera = setTimeout(() => carregarPrevia(corpo), ms);
  }

  async function carregarPrevia(corpo) {
    const alvo = corpo.querySelector('[data-previa]');
    if (!alvo) return;
    if (!est.alunoId) { alvo.innerHTML = '<div class="vazio"><i class="ti ti-file-search"></i>Escolha o aluno para ver o documento</div>'; return; }
    const pedido = corpoPedido(corpo);
    const chave = JSON.stringify(pedido);
    alvo.dataset.pedido = chave;
    try {
      const r = await EG.api('POST', '/secretaria/previa', pedido);
      if (alvo.dataset.pedido !== chave) return; // chegou uma prévia mais nova
      previa = r;
      alvo.innerHTML = r.tipo === 'historico' ? previaHistorico(r) : previaDeclaracao(r);
    } catch (e) {
      alvo.innerHTML = `<div class="msg-erro">${EG.esc(e.message)}</div>`;
    }
  }

  function blocoAvisos(r) {
    const partes = [];
    if (r.faltando.length) {
      const a = aluno(est.alunoId);
      const ficha = r.faltando.some((f) => f.onde === 'ficha') && EG.pode('alunos') && a;
      partes.push(`<div class="msg-aviso"><strong>Faltam dados:</strong> ${r.faltando.map((f) => `${EG.esc(f.rotulo.toLowerCase())}${ONDE[f.onde] ? ` <span class="sub">(${ONDE[f.onde]})</span>` : ''}`).join(' · ')}.
        No documento sai "—" ${r.tipo === 'historico' ? 'nesses campos' : 'no lugar'}.${ficha ? ' <button class="btn btn-secundario btn-pequeno" data-acao="abrir-ficha"><i class="ti ti-user-edit"></i> Completar a ficha</button>' : ''}</div>`);
    }
    if (r.desconhecidas.length) partes.push(`<div class="msg-erro">Variável desconhecida no texto: ${r.desconhecidas.map(EG.esc).join(', ')}. Corrija o texto antes de emitir.</div>`);
    r.avisos.forEach((a) => partes.push(`<div class="msg-info">${EG.esc(a)}</div>`));
    return partes.join('');
  }

  function botoesEmitir() {
    const a = aluno(est.alunoId);
    return `<div class="doc-acoes">
      <span class="sub">Ao emitir, o documento recebe número e código de validação e fica no livro de registro.</span>
      <button class="btn btn-whats" data-acao="emitir-whats" title="${a && a.respTelefone ? `Para ${EG.esc(a.respNome || 'o responsável')}: ${EG.esc(a.respTelefone)}` : 'Sem telefone do responsável: escolha o contato no WhatsApp'}"><i class="ti ti-brand-whatsapp"></i> Emitir e enviar</button>
      <button class="btn btn-primario" data-acao="emitir-pdf"><i class="ti ti-file-type-pdf"></i> Emitir e abrir PDF</button>
    </div>`;
  }

  function previaDeclaracao(r) {
    const t = r.transferencia;
    const texto = textoProprio === null ? r.texto : textoProprio;
    return `${blocoAvisos(r)}
      ${t ? `<div class="doc-transf">
        <div class="rotulo"><i class="ti ti-arrows-exchange"></i> Ao emitir esta transferência</div>
        <label class="check"><input type="checkbox" data-transf="marcar" ${t.status === 'transferido' ? '' : 'checked'}> Mudar a situação do aluno para <strong>Transferido</strong> ${t.status === 'transferido' ? '<span class="sub">(já está transferido)</span>' : `<span class="sub">(hoje: ${EG.esc(t.status)})</span>`}</label>
        ${t.mensalidadesFuturas ? `<label class="check"><input type="checkbox" data-transf="cancelar"> Cancelar ${t.mensalidadesFuturas} mensalidade(s) em aberto depois de ${EG.nomeRef(t.dataSaida.slice(0, 7))} (${EG.moeda(t.totalFuturo)})</label>` : '<span class="sub">Não há mensalidades em aberto depois do mês da transferência.</span>'}
      </div>` : ''}
      <div class="doc-papel">
        <div class="doc-papel-titulo">${EG.esc(r.titulo)}</div>
        ${String(texto).split(/\n\s*\n/).filter((p) => p.trim()).map((p) => `<p>${negrito(p.trim()).replace(/\n/g, '<br>')}</p>`).join('')}
      </div>
      <details class="doc-ajuste" ${textoProprio !== null ? 'open' : ''}>
        <summary><i class="ti ti-pencil"></i> Ajustar o texto só deste documento${textoProprio !== null ? ' <span class="selo selo-aviso">ajustado</span>' : ''}</summary>
        <textarea class="textarea" data-texto-proprio rows="7" maxlength="8000">${EG.esc(texto)}</textarea>
        <div class="doc-ajuste-rodape"><span class="sub">Use **texto** para negrito e uma linha em branco entre parágrafos. Para mudar o modelo de vez, use a aba Modelos.</span>
          ${textoProprio !== null ? '<button class="btn btn-secundario btn-pequeno" data-acao="texto-modelo"><i class="ti ti-arrow-back-up"></i> Voltar ao texto do modelo</button>' : ''}</div>
      </details>
      ${botoesEmitir()}`;
  }

  function tabelaHistorico(r) {
    const m = r.matriz;
    if (!m.colunas.length) return '<div class="vazio"><i class="ti ti-school-off"></i>Nenhum ano letivo para este aluno ainda</div>';
    const cel = (v) => (v === null || v === undefined || v === '' ? '<span class="sub">—</span>' : EG.esc(v));
    return `<div class="tabela-wrap"><table class="doc-hist">
      <thead><tr><th>Componentes curriculares</th>${m.colunas.map((c) => `<th class="num">${EG.esc(c.serie)}<br><small>${c.ano}</small></th>`).join('')}</tr></thead>
      <tbody>${m.linhas.map((l) => `<tr><td>${EG.esc(l.disciplina)}</td>${l.notas.map((n) => `<td class="num">${cel(n)}</td>`).join('')}</tr>`).join('')}
        <tr class="doc-hist-tot"><td>Carga horária anual (h)</td>${m.colunas.map((c) => `<td class="num">${cel(c.cargaHoraria)}</td>`).join('')}</tr>
        <tr class="doc-hist-tot"><td>Dias letivos</td>${m.colunas.map((c) => `<td class="num">${cel(c.diasLetivos)}</td>`).join('')}</tr>
        <tr class="doc-hist-tot"><td>Frequência</td>${m.colunas.map((c) => `<td class="num">${cel(c.frequencia)}</td>`).join('')}</tr>
        <tr class="doc-hist-tot"><td>Resultado</td>${m.colunas.map((c) => `<td class="num">${cel(c.resultado)}</td>`).join('')}</tr>
      </tbody></table></div>`;
  }

  function previaHistorico(r) {
    return `${blocoAvisos(r)}
      <div class="doc-papel">
        <div class="doc-papel-titulo">${EG.esc(r.titulo)}</div>
        <div class="doc-ident">${r.identificacao.map(([k, val]) => `<div><span>${EG.esc(k)}</span><strong>${val ? EG.esc(val) : '—'}</strong></div>`).join('')}</div>
        ${tabelaHistorico(r)}
        ${r.observacoes.length ? `<div class="rotulo" style="margin-top:14px">Observações</div>${r.observacoes.map((o) => `<p>${negrito(o)}</p>`).join('')}` : ''}
      </div>
      <div class="doc-acoes" style="justify-content:flex-start;margin-top:-4px">
        <button class="btn btn-secundario btn-pequeno" data-acao="editar-historico"><i class="ti ti-edit"></i> Anos anteriores e ajustes do histórico</button>
      </div>
      ${botoesEmitir()}`;
  }

  function blocoUltimo() {
    const u = ultimo;
    return `<div class="doc-emitido">
      <i class="ti ti-circle-check"></i>
      <div><strong>Documento nº ${EG.esc(u.numero)} emitido</strong> — ${EG.esc(frase(u.titulo))} de ${EG.esc(u.aluno.nome)}.
        <br><span class="sub">Código de validação ${EG.esc(u.codigo)}${u.efeitos && u.efeitos.transferido ? ` · aluno marcado como transferido${u.efeitos.mensalidadesCanceladas ? ` · ${u.efeitos.mensalidadesCanceladas} mensalidade(s) cancelada(s)` : ''}` : ''}</span></div>
      <button class="btn btn-secundario btn-pequeno" data-acao="pdf-ultimo"><i class="ti ti-file-type-pdf"></i> PDF</button>
    </div>`;
  }

  function textoWhats(doc, link) {
    const validade = link.expira ? new Date(link.expira).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
    return `📄 *${frase(doc.titulo)}*\n\n🏫 ${EG.estado.colegio.nome}\n👤 Aluno(a): *${doc.aluno}*\n🔢 Documento nº ${doc.numero}\n\n`
      + `Abra o PDF:\n${absoluta(link.url)}\n${validade ? `_(link válido até ${validade})_\n` : ''}`
      + `\nA autenticidade pode ser conferida pelo QR Code do documento (código ${doc.codigo}).`;
  }

  async function emitir(corpo, el, whats) {
    if (!previa || !est.alunoId) throw EG.erro('Escolha o aluno e o documento');
    if (previa.desconhecidas && previa.desconhecidas.length) throw EG.erro('Corrija as variáveis desconhecidas antes de emitir');
    const pedido = corpoPedido(corpo);
    const t = previa.transferencia;
    if (previa.tipo === 'transferencia') {
      const marcar = !!(corpo.querySelector('[data-transf="marcar"]') || {}).checked;
      const cancelar = !!(corpo.querySelector('[data-transf="cancelar"]') || {}).checked;
      pedido.transferir = { marcar, cancelarMensalidades: marcar && cancelar };
      const efeitos = [marcar ? 'o aluno passa a constar como Transferido (sai das chamadas da turma)' : null,
        marcar && cancelar ? `${t.mensalidadesFuturas} mensalidade(s) futura(s) serão canceladas` : null].filter(Boolean);
      if (efeitos.length && !(await EG.confirmar(`Ao emitir esta declaração de transferência:\n\n• ${efeitos.join('\n• ')}\n\nContinuar?`, { titulo: 'Transferência', textoOk: 'Emitir' }))) return;
    }
    const a = aluno(est.alunoId);
    let emitido = null;
    const gerar = async () => {
      emitido = await EG.api('POST', '/secretaria/emitir', pedido);
      const link = await EG.api('POST', `/secretaria/emitidos/${emitido.id}/link`, { enviar: whats });
      return whats
        ? EG.urlWhatsApp(a && a.respTelefone, textoWhats({ titulo: emitido.titulo, aluno: emitido.aluno.nome, numero: emitido.numero, codigo: emitido.codigo }, link))
        : absoluta(link.url);
    };
    try {
      await EG.abrirDepois(gerar, whats ? 'Abrir WhatsApp' : 'Abrir PDF');
    } finally {
      if (emitido) {
        ultimo = emitido;
        EG.toast(`Documento nº ${emitido.numero} emitido`);
        if (emitido.efeitos && emitido.efeitos.transferido) opcoes = await EG.api('GET', '/secretaria/opcoes');
        // cada emissão é um pedido: limpa finalidade, destino, observação e texto ajustado
        textoProprio = null; est.finalidade = ''; est.destino = ''; est.observacao = ''; est.dataSaida = ''; est.valor = ''; est.parcelas = ''; est.diaVencimento = '';
        desenharEmitir(corpo);
      }
    }
  }

  /* =====================================================================
   *  Emitidos (livro de registro)
   * ===================================================================== */
  async function desenharEmitidos(corpo) {
    const ano = est.ano || EG.hojeSP().slice(0, 4);
    const q = new URLSearchParams({ ano });
    if (est.tipo) q.set('tipo', est.tipo);
    if (est.situacao) q.set('situacao', est.situacao);
    if (est.busca) q.set('busca', est.busca);
    const r = await EG.api('GET', `/secretaria/emitidos?${q}`);
    const anos = [...new Set([Number(EG.hojeSP().slice(0, 4)), ...r.anos])].sort((x, y) => y - x);
    corpo.innerHTML = `
      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-book"></i> Livro de registro</div>
          <span class="sub">${r.documentos.length} documento(s)</span></div>
        <div class="doc-filtros">
          <select class="select" data-filtro="ano">${anos.map((x) => `<option ${String(x) === String(ano) ? 'selected' : ''}>${x}</option>`).join('')}</select>
          <select class="select" data-filtro="tipo"><option value="">Todos os documentos</option>${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${est.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <select class="select" data-filtro="situacao"><option value="">Válidos e cancelados</option><option value="validos" ${est.situacao === 'validos' ? 'selected' : ''}>Só válidos</option><option value="cancelados" ${est.situacao === 'cancelados' ? 'selected' : ''}>Só cancelados</option></select>
          <input class="input" data-filtro="busca" value="${EG.esc(est.busca || '')}" placeholder="Aluno, RA, nº ou código" autocomplete="off">
        </div>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Nº</th><th>Emissão</th><th>Documento</th><th>Aluno</th><th>Emitido por</th><th>Situação</th><th></th></tr></thead>
          <tbody>${r.documentos.map((d) => `<tr data-doc="${d.id}">
            <td><code>${EG.esc(d.numero)}</code></td>
            <td>${EG.dataHora(d.emitidoEm)}</td>
            <td><strong>${EG.esc(frase(d.titulo))}</strong>${d.finalidade ? `<br><small>Para ${EG.esc(d.finalidade)}</small>` : ''}</td>
            <td>${EG.esc(d.aluno)}${d.ra ? `<br><small>RA ${EG.esc(d.ra)}</small>` : ''}</td>
            <td>${EG.esc(d.emitidoPor || '—')}</td>
            <td>${d.cancelado ? `<span class="selo selo-erro" title="${EG.esc(`${d.motivo || ''} · ${d.canceladoPor || ''} em ${EG.dataHora(d.canceladoEm)}`)}">Cancelado</span>` : '<span class="selo selo-ok">Válido</span>'}
              <br><small title="Código de validação">${EG.esc(d.codigo)}</small></td>
            <td class="acoes">
              <button class="btn-icone" data-acao="pdf" title="Abrir PDF (2ª via)"><i class="ti ti-file-type-pdf"></i></button>
              ${d.cancelado ? '' : '<button class="btn-icone" data-acao="whats" title="Enviar por WhatsApp"><i class="ti ti-brand-whatsapp"></i></button>'}
              ${r.podeCancelar && !d.cancelado ? '<button class="btn-icone perigo" data-acao="cancelar" title="Cancelar documento"><i class="ti ti-file-x"></i></button>' : ''}
            </td>
          </tr>`).join('') || `<tr><td colspan="7"><div class="vazio"><i class="ti ti-book-off"></i>${est.busca || est.tipo || est.situacao ? 'Nenhum documento com esses filtros' : `Nenhum documento emitido em ${ano}`}</div></td></tr>`}</tbody>
        </table></div>
      </div>`;
    corpo._docs = r.documentos;
  }

  async function modalCancelar(d, corpo) {
    const m = EG.modal({
      titulo: `Cancelar documento nº ${d.numero}`,
      largura: 480,
      corpo: `<p class="card-desc" style="margin-top:0">${EG.esc(frase(d.titulo))} de <strong>${EG.esc(d.aluno)}</strong>. O documento continua no livro de registro, e quem conferir o QR Code verá que ele foi <strong>cancelado</strong>. Isso não pode ser desfeito.</p>
        <div class="campo"><label>Motivo *</label><textarea class="textarea" name="motivo" rows="3" maxlength="200" placeholder="Ex.: emitido com a finalidade errada"></textarea></div>`,
      botoes: [
        { texto: 'Voltar', acao: () => m.fechar() },
        { texto: 'Cancelar documento', classe: 'btn-perigo', icone: 'ti-file-x', acao: async () => {
          await EG.api('POST', `/secretaria/emitidos/${d.id}/cancelar`, { motivo: m.el.querySelector('[name=motivo]').value.trim() });
          m.fechar(); EG.toast(`Documento nº ${d.numero} cancelado`);
          await desenharEmitidos(corpo);
        } }
      ]
    });
  }

  /* =====================================================================
   *  Histórico escolar (anos do aluno)
   * ===================================================================== */
  async function desenharHistorico(corpo) {
    const id = est.histAlunoId || est.alunoId;
    corpo.innerHTML = `
      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-school"></i> Histórico escolar do aluno</div></div>
        <p class="card-desc">Os anos feitos no EduGest entram sozinhos (médias do boletim, frequência do diário, dias letivos do calendário e carga horária da grade). Inclua aqui os anos cursados antes, em outras escolas, e ajuste o que for preciso.</p>
        <div style="max-width:520px">${seletorAluno('historico', id)}</div>
        <div data-hist>${id ? '<div class="vazio"><div class="spinner pequeno" style="margin:0 auto"></div></div>' : '<div class="vazio"><i class="ti ti-user-search"></i>Escolha o aluno</div>'}</div>
      </div>`;
    if (id) await carregarHistorico(corpo, id);
  }

  async function carregarHistorico(corpo, id) {
    est.histAlunoId = String(id);
    const alvo = corpo.querySelector('[data-hist]');
    const r = await EG.api('GET', `/secretaria/historico/${id}`);
    corpo._hist = r;
    const stat = (rot, val, auto) => `<div><span>${rot}</span><strong>${val === null || val === undefined || val === '' ? '—' : EG.esc(val)}</strong>${auto !== undefined && auto !== null && String(auto) !== String(val) ? `<small>automático: ${EG.esc(auto)}</small>` : ''}</div>`;
    alvo.innerHTML = `
      <div class="doc-acoes" style="justify-content:space-between;margin:4px 0 12px">
        <span class="sub">${r.anos.length} ano(s) no histórico de ${EG.esc(r.aluno.nome)}</span>
        <span style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-secundario" data-acao="ano-novo"><i class="ti ti-plus"></i> Incluir ano anterior</button>
          <button class="btn btn-primario" data-acao="emitir-historico"><i class="ti ti-file-certificate"></i> Emitir histórico</button>
        </span>
      </div>
      ${r.anos.map((a, i) => `<div class="doc-ano" data-ano="${i}">
        <div class="doc-ano-cab">
          <div><strong>${a.ano} · ${EG.esc(a.serie)}</strong>
            <span class="selo ${a.origem === 'sistema' ? 'selo-info' : 'selo-roxo'}">${a.origem === 'sistema' ? 'EduGest' : 'Digitado'}</span>
            ${a.ajustado ? '<span class="selo selo-aviso">ajustado</span>' : ''}
            <br><small class="sub">${EG.esc(a.escola || '—')}${a.cidade ? ` · ${EG.esc(a.cidade)}${a.uf ? `/${EG.esc(a.uf)}` : ''}` : ''}${a.turma ? ` · turma ${EG.esc(a.turma)}` : ''}</small></div>
          <div style="display:flex;gap:6px">
            ${a.origem === 'sistema' ? '<button class="btn btn-secundario btn-pequeno" data-acao="ano-ajustar"><i class="ti ti-adjustments"></i> Ajustar</button>'
              : '<button class="btn btn-secundario btn-pequeno" data-acao="ano-editar"><i class="ti ti-edit"></i> Editar</button><button class="btn-icone perigo" data-acao="ano-excluir" title="Excluir"><i class="ti ti-trash"></i></button>'}
          </div>
        </div>
        <div class="doc-ano-stats">
          ${stat('Carga horária (h)', a.cargaHoraria, a.automatico && a.automatico.cargaHoraria)}
          ${stat('Dias letivos', a.diasLetivos, a.automatico && a.automatico.diasLetivos)}
          ${stat('Frequência', a.frequencia === null || a.frequencia === undefined ? '' : `${String(a.frequencia).replace('.', ',')}%`)}
          ${stat('Resultado', a.resultado, a.automatico && a.automatico.resultado)}
        </div>
        <div class="doc-ano-notas">${a.disciplinas.length ? a.disciplinas.map((d) => `<span>${EG.esc(d.nome)} <strong>${EG.esc(d.nota || '—')}</strong></span>`).join('') : '<span class="sub">Sem notas</span>'}</div>
        ${a.observacao ? `<div class="sub" style="margin-top:6px"><i class="ti ti-note"></i> ${EG.esc(a.observacao)}</div>` : ''}
      </div>`).join('') || '<div class="vazio"><i class="ti ti-school-off"></i>Este aluno ainda não tem notas no EduGest. Inclua os anos cursados antes.</div>'}`;
  }

  function linhaDisc(d) {
    d = d || {};
    return `<div class="doc-disc" data-disc><input class="input" data-d="nome" maxlength="60" placeholder="Disciplina" value="${EG.esc(d.nome)}">
      <input class="input" data-d="nota" maxlength="12" placeholder="Nota" value="${EG.esc(d.nota)}">
      <button type="button" class="btn-icone perigo" data-rem-disc title="Remover"><i class="ti ti-x"></i></button></div>`;
  }

  function modalAnoManual(corpo, a) {
    const h = corpo._hist;
    const novo = !a;
    a = a || { ano: '', serie: '', escola: '', cidade: '', uf: '', disciplinas: h.disciplinas.map((n) => ({ nome: n, nota: '' })) };
    const m = EG.modal({
      titulo: novo ? 'Incluir ano anterior' : `${a.ano} · ${a.serie}`,
      largura: 720,
      corpo: `
        <div class="linha-3">
          <div class="campo"><label>Ano *</label><input class="input" type="number" name="ano" min="1950" max="${Number(EG.hojeSP().slice(0, 4)) + 1}" value="${EG.esc(a.ano)}"></div>
          <div class="campo"><label>Série *</label><input class="input" name="serie" maxlength="40" list="docSeries" value="${EG.esc(a.serie)}"><datalist id="docSeries">${EG.SERIES.map((s) => `<option>${s}</option>`).join('')}</datalist></div>
          <div class="campo"><label>Resultado</label><input class="input" name="resultado" maxlength="30" list="docResultados" value="${EG.esc(a.resultado)}" placeholder="Aprovado"><datalist id="docResultados">${h.resultados.map((s) => `<option>${s}</option>`).join('')}</datalist></div>
        </div>
        <div class="linha-3">
          <div class="campo" style="grid-column:span 1"><label>Escola *</label><input class="input" name="escola" maxlength="120" value="${EG.esc(a.escola)}"></div>
          <div class="campo"><label>Cidade</label><input class="input" name="cidade" maxlength="60" value="${EG.esc(a.cidade)}"></div>
          <div class="campo"><label>UF</label><select class="select" name="uf"><option value="">—</option>${EG.UFS.map((u) => `<option ${a.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        </div>
        <div class="linha-3">
          <div class="campo"><label>Carga horária (h)</label><input class="input" type="number" name="cargaHoraria" min="0" max="9999" value="${EG.esc(a.cargaHoraria ?? '')}"></div>
          <div class="campo"><label>Dias letivos</label><input class="input" type="number" name="diasLetivos" min="0" max="366" value="${EG.esc(a.diasLetivos ?? '')}"></div>
          <div class="campo"><label>Frequência (%)</label><input class="input" name="frequencia" inputmode="decimal" value="${EG.esc(a.frequencia === null || a.frequencia === undefined ? '' : String(a.frequencia).replace('.', ','))}" placeholder="Ex.: 96,5"></div>
        </div>
        <div class="rotulo" style="margin-top:6px">Notas ou conceitos <span class="sub" style="text-transform:none;font-weight:400">(disciplinas sem nota não entram no histórico)</span></div>
        <div data-discs>${a.disciplinas.map(linhaDisc).join('')}</div>
        <button type="button" class="btn btn-secundario btn-pequeno" data-add-disc><i class="ti ti-plus"></i> Adicionar disciplina</button>
        <div class="campo" style="margin-top:12px"><label>Observação</label><input class="input" name="observacao" maxlength="300" value="${EG.esc(a.observacao)}" placeholder="Sai nas observações do histórico"></div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: novo ? 'Incluir' : 'Salvar', classe: 'btn-primario', icone: 'ti-device-floppy', acao: async () => {
          const d = EG.lerForm(m.el);
          d.disciplinas = EG.$$('[data-disc]', m.el).map((l) => ({ nome: l.querySelector('[data-d="nome"]').value.trim(), nota: l.querySelector('[data-d="nota"]').value.trim() })).filter((x) => x.nome && x.nota);
          if (novo) await EG.api('POST', `/secretaria/historico/${h.aluno.id}/anos`, d);
          else await EG.api('PUT', `/secretaria/historico/${h.aluno.id}/anos/${a.id}`, d);
          m.fechar(); EG.toast(novo ? 'Ano incluído no histórico' : 'Ano atualizado');
          await carregarHistorico(corpo, h.aluno.id);
        } }
      ]
    });
    m.el.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-add-disc]')) { m.el.querySelector('[data-discs]').insertAdjacentHTML('beforeend', linhaDisc()); m.el.querySelector('[data-discs]').lastElementChild.querySelector('input').focus(); }
      const rem = ev.target.closest('[data-rem-disc]');
      if (rem) rem.closest('[data-disc]').remove();
    });
  }

  function modalAjuste(corpo, a) {
    const h = corpo._hist;
    const au = a.automatico || {};
    const m = EG.modal({
      titulo: `Ajustar ${a.ano} · ${a.serie}`,
      largura: 560,
      corpo: `<p class="card-desc" style="margin-top:0">Deixe em branco para usar o valor calculado pelo EduGest.</p>
        <div class="linha-2">
          <div class="campo"><label>Carga horária (h)</label><input class="input" type="number" name="cargaHoraria" min="0" max="9999" value="${a.ajustado && a.cargaHoraria !== au.cargaHoraria ? EG.esc(a.cargaHoraria ?? '') : ''}" placeholder="${au.cargaHoraria ?? 'sem grade horária'}">
            <small>Automático: aulas da grade × semanas letivas.</small></div>
          <div class="campo"><label>Dias letivos</label><input class="input" type="number" name="diasLetivos" min="0" max="366" value="${a.ajustado && a.diasLetivos !== au.diasLetivos ? EG.esc(a.diasLetivos ?? '') : ''}" placeholder="${au.diasLetivos ?? 'sem bimestres'}">
            <small>Automático: bimestres e feriados do calendário.</small></div>
        </div>
        <div class="campo"><label>Resultado</label><select class="select" name="resultado">
          <option value="">Automático (${EG.esc(au.resultado || '—')})</option>
          ${h.resultados.map((s) => `<option ${a.ajustado && a.resultado === s && s !== au.resultado ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="campo"><label>Observação</label><input class="input" name="observacao" maxlength="300" value="${EG.esc(a.observacao)}" placeholder="Ex.: aprovado em conselho de classe"></div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Salvar', classe: 'btn-primario', icone: 'ti-device-floppy', acao: async () => {
          await EG.api('PUT', `/secretaria/historico/${h.aluno.id}/turmas/${a.turmaId}`, EG.lerForm(m.el));
          m.fechar(); EG.toast('Histórico ajustado');
          await carregarHistorico(corpo, h.aluno.id);
        } }
      ]
    });
  }

  /* =====================================================================
   *  Modelos
   * ===================================================================== */
  async function desenharModelos(corpo) {
    const r = await EG.api('GET', '/secretaria/modelos');
    corpo._modelos = r;
    const resumo = (t) => EG.esc(String(t).replace(/\*\*/g, '').replace(/\s+/g, ' ').slice(0, 190)) + (String(t).length > 190 ? '…' : '');
    corpo.innerHTML = `
      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-template"></i> Modelos de documento</div>
          <button class="btn btn-primario" data-acao="modelo-novo"><i class="ti ti-plus"></i> Novo modelo</button></div>
        <p class="card-desc">O colégio pode ajustar o texto de cada modelo do sistema (e voltar ao padrão quando quiser) ou criar os seus, como uma declaração de comparecimento. As variáveis entre chaves, como {aluno} e {serie}, são preenchidas na hora de emitir.</p>
        <div class="doc-modelos">${r.modelos.map((m) => `<div class="doc-modelo" data-ref="${m.ref}">
          <div class="doc-modelo-cab"><strong>${EG.esc(m.chave === 'livre' ? frase(m.titulo) : m.rotulo)}</strong>
            ${m.chave === 'livre' ? '<span class="selo selo-roxo">do colégio</span>' : m.personalizado ? '<span class="selo selo-aviso">ajustado</span>' : '<span class="selo selo-neutro">padrão</span>'}</div>
          <p>${m.chave === 'historico' ? '<em>Observações:</em> ' : ''}${resumo(m.texto)}</p>
          <div class="doc-modelo-acoes">
            <button class="btn btn-secundario btn-pequeno" data-acao="modelo-editar"><i class="ti ti-edit"></i> ${m.chave === 'historico' ? 'Editar observações' : 'Editar'}</button>
            ${m.chave !== 'livre' && m.personalizado ? '<button class="btn btn-secundario btn-pequeno" data-acao="modelo-padrao"><i class="ti ti-arrow-back-up"></i> Voltar ao padrão</button>' : ''}
            ${m.chave === 'livre' ? '<button class="btn-icone perigo" data-acao="modelo-excluir" title="Excluir modelo"><i class="ti ti-trash"></i></button>' : ''}
          </div>
        </div>`).join('')}</div>
      </div>`;
  }

  function modalModelo(corpo, m) {
    const r = corpo._modelos;
    const novo = !m;
    const hist = m && m.chave === 'historico';
    m = m || { ref: null, chave: 'livre', titulo: '', texto: r.textoNovo };
    const primeiro = est.alunoId || (opcoes.alunos.find((a) => a.status === 'ativo') || opcoes.alunos[0] || {}).id || '';
    const md = EG.modal({
      titulo: novo ? 'Novo modelo' : `Editar: ${m.chave === 'livre' ? frase(m.titulo) : m.rotulo}`,
      largura: 820,
      corpo: `
        <div class="campo"><label>Título impresso *</label><input class="input" name="titulo" maxlength="120" value="${EG.esc(m.titulo)}" placeholder="Ex.: DECLARAÇÃO DE COMPARECIMENTO"></div>
        <div class="campo"><label>${hist ? 'Observações impressas no histórico *' : 'Texto *'}</label>
          <textarea class="textarea doc-editor" name="texto" rows="${hist ? 4 : 9}" maxlength="6000">${EG.esc(m.texto)}</textarea>
          <small>**texto** sai em negrito · linha em branco separa parágrafos · trechos entre [[ e ]] somem quando uma variável de dentro está vazia, ex.: [[, nascido(a) em {nascimento}]]</small></div>
        <div class="rotulo">Variáveis — clique para inserir</div>
        <div class="doc-vars">${r.variaveis.map((v) => `<button type="button" class="chip" data-var="${v.chave}" title="${EG.esc(v.rotulo)}">{${v.chave}}</button>`).join('')}</div>
        <div class="doc-modelo-previa">
          <div class="doc-acoes" style="justify-content:flex-start;margin:0 0 8px">
            <span class="rotulo" style="margin:0">Prévia com o aluno</span>
            <select class="select" data-previa-aluno style="max-width:320px">${opcoesAlunos('', primeiro).replace('<option value="">Selecione o aluno</option>', '')}</select>
            <button type="button" class="btn btn-secundario btn-pequeno" data-ver-previa><i class="ti ti-eye"></i> Atualizar prévia</button>
          </div>
          <div data-previa-modelo></div>
        </div>
        ${!novo && m.chave !== 'livre' ? `<details class="doc-ajuste"><summary>Ver o texto padrão do sistema</summary><p class="sub" style="white-space:pre-wrap">${EG.esc(m.textoPadrao)}</p></details>` : ''}`,
      botoes: [
        { texto: 'Cancelar', acao: () => md.fechar() },
        { texto: novo ? 'Criar modelo' : 'Salvar modelo', classe: 'btn-primario', icone: 'ti-device-floppy', acao: async () => {
          const d = EG.lerForm(md.el);
          const corpoReq = { titulo: d.titulo, texto: md.el.querySelector('[name=texto]').value };
          if (novo) await EG.api('POST', '/secretaria/modelos', corpoReq);
          else await EG.api('PUT', `/secretaria/modelos/${m.ref}`, corpoReq);
          md.fechar(); EG.toast(novo ? 'Modelo criado' : 'Modelo salvo');
          opcoes = await EG.api('GET', '/secretaria/opcoes');
          await desenharModelos(corpo);
        } }
      ]
    });
    const area = md.el.querySelector('[name=texto]');
    const verPrevia = async () => {
      const alvo = md.el.querySelector('[data-previa-modelo]');
      const alunoId = md.el.querySelector('[data-previa-aluno]').value;
      if (!alunoId) { alvo.innerHTML = '<div class="vazio">Cadastre um aluno para ver a prévia</div>'; return; }
      try {
        const p = await EG.api('POST', '/secretaria/previa', {
          modelo: novo ? 'matricula' : m.ref, alunoId: Number(alunoId), titulo: md.el.querySelector('[name=titulo]').value || undefined, texto: area.value
        });
        if (hist) {
          alvo.innerHTML = `${p.desconhecidas.length ? `<div class="msg-erro">Variável desconhecida: ${p.desconhecidas.map(EG.esc).join(', ')}</div>` : ''}
            <div class="doc-papel pequeno"><div class="doc-papel-titulo">${EG.esc(p.titulo)}</div><div class="rotulo">Observações</div>${p.observacoes.map((o) => `<p>${negrito(o)}</p>`).join('') || '<p class="sub">—</p>'}</div>`;
        } else {
          alvo.innerHTML = `${p.desconhecidas.length ? `<div class="msg-erro">Variável desconhecida: ${p.desconhecidas.map(EG.esc).join(', ')}</div>` : ''}
            <div class="doc-papel pequeno"><div class="doc-papel-titulo">${EG.esc(p.titulo)}</div>${p.texto.split(/\n\s*\n/).map((x) => `<p>${negrito(x).replace(/\n/g, '<br>')}</p>`).join('')}</div>`;
        }
      } catch (e) { alvo.innerHTML = `<div class="msg-erro">${EG.esc(e.message)}</div>`; }
    };
    md.el.addEventListener('click', (ev) => {
      const v = ev.target.closest('[data-var]');
      if (v) {
        const ins = `{${v.dataset.var}}`;
        const i = area.selectionStart ?? area.value.length; const f = area.selectionEnd ?? i;
        area.value = area.value.slice(0, i) + ins + area.value.slice(f);
        area.focus(); area.selectionStart = area.selectionEnd = i + ins.length;
      }
      if (ev.target.closest('[data-ver-previa]')) verPrevia();
    });
    md.el.querySelector('[data-previa-aluno]').addEventListener('change', verPrevia);
    verPrevia();
  }

  /* =====================================================================
   *  Registro e eventos
   * ===================================================================== */
  /** Abre Documentos → Emitir já com o aluno e o modelo escolhidos (ex.: contrato depois da matrícula). */
  EG.abrirEmissao = function (alunoId, modelo, campos) {
    pendente = { alunoId, modelo, campos: campos || {} };
    EG.navegar('documentos');
  };

  EG.registrarModulo('documentos', {
    async render(el) {
      EG.filtrosDaSessao(est, { aba: 'emitir', alunoId: '', modelo: 'matricula', ano: '', tipo: '', situacao: '', busca: '', histAlunoId: '', finalidade: '', destino: '', dataSaida: '', observacao: '' });
      previa = null; textoProprio = null; ultimo = null;
      if (pendente) {
        Object.assign(est, { aba: 'emitir', alunoId: String(pendente.alunoId), modelo: pendente.modelo, finalidade: '', valor: '', parcelas: '', diaVencimento: '' }, pendente.campos);
        pendente = null;
      }
      opcoes = await EG.api('GET', '/secretaria/opcoes');
      el.innerHTML = '<div data-topo></div><div data-abas></div><div data-corpo></div>';
      await desenhar(el);
      const corpo = el.querySelector('[data-corpo]');
      const erro = (e) => EG.toast(e.message, 'erro');

      el.oninput = (ev) => {
        const t = ev.target;
        if (t.matches('[data-filtro-aluno]')) {
          const sel = corpo.querySelector(`[data-aluno="${t.dataset.filtroAluno}"]`);
          const atual = t.dataset.filtroAluno === 'emitir' ? est.alunoId : est.histAlunoId;
          sel.innerHTML = opcoesAlunos(t.value, atual);
          const visiveis = EG.$$('option[value]:not([value=""])', sel);
          if (visiveis.length === 1 && String(visiveis[0].value) !== String(atual)) { sel.value = visiveis[0].value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
        } else if (t.matches('[data-campo]')) {
          agendarPrevia(corpo);
        } else if (t.matches('[data-texto-proprio]')) {
          textoProprio = t.value;
          const papel = corpo.querySelector('.doc-papel');
          if (papel && previa) {
            papel.innerHTML = `<div class="doc-papel-titulo">${EG.esc(previa.titulo)}</div>${t.value.split(/\n\s*\n/).filter((p) => p.trim()).map((p) => `<p>${negrito(p.trim()).replace(/\n/g, '<br>')}</p>`).join('')}`;
          }
          agendarPrevia(corpo, 900);
        } else if (t.matches('[data-filtro="busca"]')) {
          est.busca = t.value.trim();
          clearTimeout(espera);
          espera = setTimeout(() => desenharEmitidos(corpo).then(() => {
            const i = corpo.querySelector('[data-filtro="busca"]'); i.focus(); i.selectionStart = i.selectionEnd = i.value.length;
          }).catch(erro), 400);
        }
      };

      el.onchange = async (ev) => {
        const t = ev.target;
        try {
          if (t.matches('[data-aluno="emitir"]')) {
            est.alunoId = t.value; textoProprio = null; ultimo = null;
            const res = corpo.querySelector('[data-resultado]'); if (res) res.innerHTML = '';
            await carregarPrevia(corpo); if (!t.value) desenharEmitir(corpo);
          } else if (t.matches('[data-modelo]')) { est.modelo = t.value; textoProprio = null; ultimo = null; desenharEmitir(corpo); }
          else if (t.matches('[data-aluno="historico"]')) { if (t.value) await carregarHistorico(corpo, t.value); }
          else if (t.matches('[data-filtro="ano"], [data-filtro="tipo"], [data-filtro="situacao"]')) { est[t.dataset.filtro] = t.value; await desenharEmitidos(corpo); }
          else if (t.matches('[data-campo="dataSaida"]')) agendarPrevia(corpo, 0);
        } catch (e) { erro(e); }
      };

      el.onclick = async (ev) => {
        const t = ev.target;
        const aba = t.closest('[data-aba]');
        if (aba) { est.aba = aba.dataset.aba; desenhar(el).catch(erro); return; }
        const b = t.closest('[data-acao]');
        if (!b) return;
        const acao = b.dataset.acao;
        try {
          if (acao === 'ir-config') { EG.navegar('config'); return; }
          if (acao === 'emitir-pdf' || acao === 'emitir-whats') { await EG.guarda(b, () => emitir(corpo, el, acao === 'emitir-whats')); return; }
          if (acao === 'texto-modelo') { textoProprio = null; await carregarPrevia(corpo); return; }
          if (acao === 'abrir-ficha') { await EG.abrirFichaAluno(Number(est.alunoId), () => carregarPrevia(corpo)); return; }
          if (acao === 'pdf-ultimo') {
            await EG.abrirDepois(async () => absoluta((await EG.api('POST', `/secretaria/emitidos/${ultimo.id}/link`, {})).url), 'Abrir PDF');
            return;
          }
          if (acao === 'editar-historico') { est.histAlunoId = est.alunoId; est.aba = 'historico'; await desenhar(el); return; }
          if (acao === 'emitir-historico') { est.alunoId = est.histAlunoId; est.modelo = 'historico'; est.aba = 'emitir'; textoProprio = null; ultimo = null; await desenhar(el); return; }
          // livro de registro
          const linha = b.closest('[data-doc]');
          if (linha) {
            const d = corpo._docs.find((x) => String(x.id) === linha.dataset.doc);
            if (acao === 'pdf') await EG.abrirDepois(async () => absoluta((await EG.api('POST', `/secretaria/emitidos/${d.id}/link`, {})).url), 'Abrir PDF');
            else if (acao === 'whats') {
              if (!d.respTelefone) EG.toast(`${d.aluno} não tem telefone do responsável cadastrado — escolha o contato no WhatsApp.`, 'info');
              await EG.abrirDepois(async () => EG.urlWhatsApp(d.respTelefone, textoWhats(d, await EG.api('POST', `/secretaria/emitidos/${d.id}/link`, { enviar: true }))), 'Abrir WhatsApp');
            } else if (acao === 'cancelar') await modalCancelar(d, corpo);
            return;
          }
          // histórico
          const ano = b.closest('[data-ano]');
          if (acao === 'ano-novo') { modalAnoManual(corpo, null); return; }
          if (ano) {
            const a = corpo._hist.anos[Number(ano.dataset.ano)];
            if (acao === 'ano-ajustar') modalAjuste(corpo, a);
            else if (acao === 'ano-editar') modalAnoManual(corpo, a);
            else if (acao === 'ano-excluir') {
              if (!(await EG.confirmar(`Excluir ${a.ano} (${a.serie}) do histórico de ${corpo._hist.aluno.nome}?`, { perigo: true, textoOk: 'Excluir' }))) return;
              await EG.api('DELETE', `/secretaria/historico/${corpo._hist.aluno.id}/anos/${a.id}`);
              EG.toast('Ano excluído do histórico');
              await carregarHistorico(corpo, corpo._hist.aluno.id);
            }
            return;
          }
          // modelos
          const card = b.closest('[data-ref]');
          if (acao === 'modelo-novo') { modalModelo(corpo, null); return; }
          if (card) {
            const m = corpo._modelos.modelos.find((x) => x.ref === card.dataset.ref);
            if (acao === 'modelo-editar') modalModelo(corpo, m);
            else if (acao === 'modelo-padrao') {
              if (!(await EG.confirmar(`Voltar "${m.rotulo}" ao texto padrão do sistema? O texto ajustado pelo colégio será descartado.`, { textoOk: 'Voltar ao padrão' }))) return;
              await EG.api('DELETE', `/secretaria/modelos/${m.ref}`);
              EG.toast('Modelo voltou ao padrão');
              opcoes = await EG.api('GET', '/secretaria/opcoes');
              await desenharModelos(corpo);
            } else if (acao === 'modelo-excluir') {
              if (!(await EG.confirmar(`Excluir o modelo "${frase(m.titulo)}"? Documentos já emitidos com ele continuam no livro de registro.`, { perigo: true, textoOk: 'Excluir' }))) return;
              await EG.api('DELETE', `/secretaria/modelos/${m.ref}`);
              EG.toast('Modelo excluído');
              opcoes = await EG.api('GET', '/secretaria/opcoes');
              await desenharModelos(corpo);
            }
          }
        } catch (e) { erro(e); }
      };
    }
  });
})(window.EG);
