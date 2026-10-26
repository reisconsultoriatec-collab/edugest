/* =====================================================================
 *  EduGest — Portal do Responsável
 *  Início · Boletim · Frequência · Financeiro, para cada filho vinculado,
 *  e os Comunicados do colégio para a família.
 *  A API só devolve dados dos alunos ligados a este usuário.
 * ===================================================================== */
'use strict';
(function (EG) {
  const est = {};
  const estCom = { filtro: 'todos', abrir: null };
  let portal = null;

  /** Número de comunicados que pedem atenção (menu e Início). */
  EG.atualizarComunicadosPortal = async function () {
    try {
      const r = await EG.api('GET', '/portal/comunicados/pendentes');
      EG.contadorMenu('portal-comunicados', r.atencao, r.atencao ? `${r.atencao} comunicado(s) para ler` : '');
      return r;
    } catch (e) { return null; }
  };

  const pct = (n) => (n === null || n === undefined ? '—' : `${String(Number(n).toFixed(1)).replace('.', ',').replace(',0', '')}%`);
  const nota = (n) => (n === null || n === undefined ? '—' : String(Number(n).toFixed(1)).replace('.', ','));
  const SIT_MENS = {
    pendente: ['Em aberto', 'selo-info'], vencida: ['Vencida', 'selo-erro'], paga: ['Paga', 'selo-ok'], isenta: ['Isenta', 'selo-roxo']
  };

  async function carregarPortal(forcar) {
    EG.filtrosDaSessao(est, { alunoId: null, turmaId: {}, ano: null });
    if (!portal || forcar || portal._chave !== EG.chaveSessao()) {
      portal = await EG.api('GET', '/portal');
      portal._chave = EG.chaveSessao();
    }
    if (!portal.alunos.some((a) => a.id === est.alunoId)) est.alunoId = portal.alunos.length ? portal.alunos[0].id : null;
    return portal;
  }
  const alunoAtual = () => portal.alunos.find((a) => a.id === est.alunoId);

  /* ---------- Cabeçalho com os filhos ---------- */
  function cabecalho(titulo, extra = '') {
    const a = alunoAtual();
    return `<div class="card portal-cab no-print">
      <div class="portal-filhos">
        ${portal.alunos.length > 1
          ? portal.alunos.map((x) => `<button class="chip ${x.id === est.alunoId ? 'ativo' : ''}" data-action="filho" data-id="${x.id}">${EG.esc(x.nome.split(' ')[0])}</button>`).join('')
          : ''}
        <button class="chip" data-action="adicionar-filho" title="Acompanhar outro aluno com o código de acesso"><i class="ti ti-plus"></i> Adicionar aluno</button>
      </div>
      <div class="portal-aluno">
        <div class="avatar" style="width:44px;height:44px;font-size:16px">${EG.esc(EG.iniciais(a.nome))}</div>
        <div style="flex:1;min-width:180px"><strong style="font-size:16px">${EG.esc(a.nome)}</strong>
          <div class="sub">${a.turma ? `${EG.esc(a.turma.nome)} · ${EG.esc(a.turma.serie)} · ano letivo ${a.turma.anoLetivo}` : 'Sem turma no momento'} · RA ${EG.esc(a.ra)}</div></div>
        ${extra}
      </div>
      ${titulo ? `<div class="card-titulo" style="margin-top:14px">${titulo}</div>` : ''}
    </div>`;
  }

  const semFilhos = () => `<div class="card em-breve"><i class="ti ti-users"></i><h2>Nenhum aluno vinculado</h2>
    <p>Use o código de acesso que o colégio enviou (começa com PAI) para acompanhar o aluno.</p>
    <button class="btn btn-primario" data-action="adicionar-filho" style="margin-top:16px"><i class="ti ti-plus"></i> Adicionar aluno</button></div>`;

  const seletorTurma = (turmas) => (turmas.length > 1
    ? `<select class="select" data-filtro="turma" style="width:auto">${turmas.map((t) => `<option value="${t.id}" ${t.id === est.turmaId[est.alunoId] ? 'selected' : ''}>${EG.esc(t.nome)} · ${t.anoLetivo}${t.atual ? ' (atual)' : ''}</option>`).join('')}</select>`
    : '');

  function kpi(icone, fundo, cor, rotulo, valor, obs) {
    return `<div class="kpi"><div class="kpi-icone" style="background:${fundo};color:${cor}"><i class="ti ${icone}"></i></div>
      <div><div class="kpi-rotulo">${rotulo}</div><div class="kpi-valor" style="font-size:20px">${valor}</div><div class="kpi-obs">${obs}</div></div></div>`;
  }

  /* ---------- Documentos ---------- */
  const abrirDoc = (corpo) => EG.abrirDepois(async () => {
    const r = await EG.api('POST', '/portal/documentos', corpo);
    return new URL(r.url, location.origin).href;
  }, 'Abrir PDF');

  /* ---------- Adicionar outro filho ---------- */
  function modalAdicionar(el, recarregar) {
    const m = EG.modal({
      titulo: 'Acompanhar outro aluno',
      largura: 460,
      corpo: `<p class="card-desc" style="margin:0 0 14px">Digite o código de acesso do aluno enviado pelo colégio. Ele começa com <strong>PAI</strong> e tem mais 6 letras ou números.</p>
        <div class="campo"><label>Código de acesso</label><input class="input" name="codigoAcesso" maxlength="9" placeholder="PAI000000" style="text-transform:uppercase;letter-spacing:2px;font-weight:600"></div>
        <div class="campo"><label>Parentesco</label><select class="select" name="parentesco">${['Mãe', 'Pai', 'Avó', 'Avô', 'Tia', 'Tio', 'Responsável legal', 'Outro'].map((p) => `<option>${p}</option>`).join('')}</select></div>`,
      botoes: [
        { texto: 'Cancelar', acao: () => m.fechar() },
        { texto: 'Adicionar', classe: 'btn-primario', icone: 'ti-plus', acao: async () => {
          const d = EG.lerForm(m.el);
          d.codigoAcesso = d.codigoAcesso.toUpperCase();
          const r = await EG.api('POST', '/conta/registrar-responsavel', d);
          m.fechar();
          if (r.colegio.id !== EG.estado.colegioId) {
            EG.toast(`${r.aluno.nome} é do ${r.colegio.nome}. ${r.status === 'ativo' ? 'Troque o colégio no seletor para acompanhar.' : 'Seu acesso a esse colégio aguarda aprovação.'}`, 'info');
            return;
          }
          await carregarPortal(true);
          est.alunoId = r.aluno.id;
          EG.toast(`${r.aluno.nome} adicionado(a)`);
          await recarregar();
        } }
      ]
    });
  }

  /* ---------- Eventos comuns ---------- */
  function ligar(el, recarregar) {
    el.onclick = async (ev) => {
      const b = ev.target.closest('[data-action]');
      if (!b || !el.contains(b)) return;
      try {
        if (b.dataset.action === 'ir' && b.dataset.comunicado) estCom.abrir = Number(b.dataset.comunicado); // a navegação segue no shell
        else if (b.dataset.action === 'filho') { est.alunoId = Number(b.dataset.id); await EG.guarda(b, recarregar); }
        else if (b.dataset.action === 'adicionar-filho') modalAdicionar(el, recarregar);
        else if (b.dataset.action === 'imprimir') window.print();
        else if (b.dataset.action === 'whats-escola') EG.abrirWhatsApp(portal.colegio.whatsapp, `Olá! Sou responsável por ${alunoAtual() ? alunoAtual().nome : 'um(a) aluno(a)'}.`);
        else if (b.dataset.action === 'doc') {
          await EG.guarda(b, () => abrirDoc(b.dataset.tipo === 'mensalidade'
            ? { tipo: 'mensalidade', id: Number(b.dataset.id) }
            : { tipo: b.dataset.tipo, alunoId: est.alunoId, ano: Number(b.dataset.ano) }));
        }
      } catch (e) { EG.toast(e.message, 'erro'); }
    };
    el.onchange = async (ev) => {
      const f = ev.target.dataset.filtro;
      if (!f) return;
      if (f === 'turma') est.turmaId[est.alunoId] = Number(ev.target.value);
      if (f === 'ano') est.ano = Number(ev.target.value);
      try { await recarregar(); } catch (e) { EG.toast(e.message, 'erro'); }
    };
  }

  function registrar(id, desenhar) {
    EG.registrarModulo(id, {
      async render(el) {
        await carregarPortal(false);
        const recarregar = async () => {
          if (!alunoAtual()) { el.innerHTML = semFilhos(); return; }
          el.innerHTML = await desenhar();
        };
        await recarregar();
        ligar(el, recarregar);
      }
    });
  }

  /* =====================================================================
   *  Início
   * ===================================================================== */
  registrar('portal', async () => {
    const [r, com] = await Promise.all([
      EG.api('GET', `/portal/alunos/${est.alunoId}/resumo`),
      EG.atualizarComunicadosPortal()
    ]);
    const nome = (EG.estado.me.usuario.nome || '').split(' ')[0];
    const fr = r.frequencia; const nt = r.notas; const fi = r.financeiro;
    const alertas = [];
    if (com && com.atencao) {
      const partes = [];
      if (com.naoLidos) partes.push(com.naoLidos === 1 ? '1 comunicado novo do colégio' : `${com.naoLidos} comunicados novos do colégio`);
      if (com.aguardandoCiencia) partes.push(`${com.aguardandoCiencia} aguardando a sua confirmação de ciência`);
      alertas.push(['ti-speakerphone', 'info', partes.join(' · ') + '.', 'portal-comunicados', 'Ler agora']);
    }
    if (fi.vencidas) alertas.push(['ti-alert-triangle', 'erro', `${fi.vencidas} mensalidade(s) em atraso, total de ${EG.moeda(fi.valorVencido)}.`, 'portal-financeiro', 'Ver financeiro']);
    if (fr && fr.percentual !== null && fr.percentual < fr.minima) alertas.push(['ti-calendar-x', 'erro', `Frequência de ${pct(fr.percentual)}, abaixo do mínimo de ${fr.minima}%.`, 'portal-frequencia', 'Ver frequência']);
    if (nt && nt.abaixo.length) alertas.push(['ti-chart-arrows', 'aviso', `Média abaixo de ${nota(nt.mediaAprovacao)} em: ${nt.abaixo.join(', ')}.`, 'portal-boletim', 'Ver boletim']);
    const temWhats = !!portal.colegio.whatsapp;
    return `
      <div class="card" style="background:linear-gradient(135deg,#1A2744,#2D3F63);color:#fff;border:none">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div class="fonte-titulo" style="font-size:20px;font-weight:700">Olá, ${EG.esc(nome)}!</div>
            <div style="opacity:.8;font-size:13px">${EG.esc(portal.colegio.nome)}${portal.colegio.telefone ? ' · ' + EG.esc(portal.colegio.telefone) : ''}</div>
          </div>
          ${temWhats ? '<button class="btn btn-whats" data-action="whats-escola"><i class="ti ti-brand-whatsapp"></i> Falar com o colégio</button>' : ''}
        </div>
      </div>
      ${cabecalho('')}
      <div class="grade-kpi">
        ${kpi('ti-calendar-check', 'var(--ok-bg)', 'var(--ok)', 'Frequência', fr && fr.percentual !== null ? pct(fr.percentual) : '—',
          fr && fr.aulas ? `${fr.faltas} falta(s) · mínimo ${fr.minima}%` : 'nenhuma aula registrada ainda')}
        ${kpi('ti-chart-bar', 'var(--info-bg)', 'var(--info)', 'Média geral', nt && nt.mediaGeral !== null ? nota(nt.mediaGeral) : '—',
          nt && nt.disciplinasComNota ? (nt.abaixo.length ? `${nt.abaixo.length} disciplina(s) abaixo de ${nota(nt.mediaAprovacao)}` : `todas acima de ${nota(nt.mediaAprovacao)}`) : 'nenhuma nota lançada ainda')}
        ${kpi('ti-receipt', fi.vencidas ? 'var(--erro-bg)' : 'var(--ok-bg)', fi.vencidas ? 'var(--erro)' : 'var(--ok)', 'Mensalidades',
          fi.vencidas ? `${fi.vencidas} em atraso` : 'Em dia', fi.vencidas ? EG.moeda(fi.valorVencido) : (fi.ultimaPaga ? `última paga: ${EG.nomeRef(fi.ultimaPaga.referencia)}` : 'nenhuma paga ainda'))}
        ${kpi('ti-calendar-due', 'var(--roxo-bg)', 'var(--roxo)', 'Próxima mensalidade', fi.proxima ? EG.moeda(fi.proxima.valor) : '—',
          fi.proxima ? `${EG.nomeRef(fi.proxima.referencia)} · vence ${EG.data(fi.proxima.vencimento)}` : 'nenhuma em aberto')}
      </div>
      ${alertas.length ? `<div class="card"><div class="card-cab"><div class="card-titulo"><i class="ti ti-bell"></i> Atenção</div></div>
        ${alertas.map(([ic, tipo, txt, pag, rot]) => `<div class="portal-alerta ${tipo}"><i class="ti ${ic}"></i><span>${EG.esc(txt)}</span>
          <button class="btn btn-secundario btn-pequeno" data-action="ir" data-pagina="${pag}">${rot}</button></div>`).join('')}</div>` : ''}
      ${com && com.ultimos.length ? `<div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-speakerphone"></i> Comunicados</div>
          <button class="btn btn-secundario btn-pequeno" data-action="ir" data-pagina="portal-comunicados">Ver todos</button></div>
        <ul class="lista-atividade">${com.ultimos.map((c) => `<li style="cursor:pointer" data-action="ir" data-pagina="portal-comunicados" data-comunicado="${c.id}">
          ${EG.seloTipoComunicado(c.tipo)}
          <span>${c.lidoEm ? EG.esc(c.titulo) : `<strong>${EG.esc(c.titulo)}</strong> <span class="selo selo-aviso">Novo</span>`}
            ${c.exigeCiencia && !c.cienteEm ? ' <span class="selo selo-erro">Confirme a ciência</span>' : ''}</span>
          <span class="quando">${EG.data(c.criadoEm)}</span></li>`).join('')}</ul>
      </div>` : ''}
      <div class="linha-2" style="gap:20px">
        <div class="card" style="margin:0">
          <div class="card-cab"><div class="card-titulo"><i class="ti ti-receipt"></i> Pagamento</div></div>
          ${fi.proxima || fi.vencidas
            ? `<p class="card-desc">${fi.vencidas ? 'Há mensalidade em atraso. ' : ''}Abra a cobrança para pagar com PIX (QR Code ou copia e cola).</p>
               ${(() => {
                 // Em atraso vem primeiro: a mais antiga
                 const alvo = fi.atrasada || fi.proxima;
                 return alvo ? `<button class="btn btn-primario" data-action="doc" data-tipo="mensalidade" data-id="${alvo.id}"><i class="ti ti-qrcode"></i> Pagar ${EG.nomeRef(alvo.referencia)} · ${EG.moeda(alvo.valor)}${fi.atrasada ? ' (em atraso)' : ''}</button>` : '';
               })()}
               <button class="btn btn-secundario" data-action="ir" data-pagina="portal-financeiro" style="margin-top:8px"><i class="ti ti-list"></i> Todas as mensalidades</button>`
            : '<div class="vazio"><i class="ti ti-mood-happy"></i>Nenhuma mensalidade em aberto</div>'}
        </div>
        <div class="card" style="margin:0">
          <div class="card-cab"><div class="card-titulo"><i class="ti ti-calendar-x"></i> Últimas faltas</div></div>
          ${r.ultimasFaltas.length ? `<ul class="lista-atividade">${r.ultimasFaltas.map((x) => `<li><i class="ti ti-point-filled" style="color:${x.justificada ? 'var(--aviso)' : 'var(--erro)'};font-size:10px"></i>
            <span>${EG.esc(x.disciplina || 'Chamada do dia')}${x.justificada ? ' <span class="selo selo-aviso">justificada</span>' : ''}</span><span class="quando">${EG.data(x.data)}</span></li>`).join('')}</ul>`
            : '<div class="vazio"><i class="ti ti-mood-happy"></i>Nenhuma falta registrada</div>'}
        </div>
      </div>`;
  });

  /* =====================================================================
   *  Boletim
   * ===================================================================== */
  registrar('portal-boletim', async () => {
    const q = est.turmaId[est.alunoId] ? `?turmaId=${est.turmaId[est.alunoId]}` : '';
    const r = await EG.api('GET', `/portal/alunos/${est.alunoId}/boletim${q}`);
    if (r.boletim) est.turmaId[est.alunoId] = r.boletim.turma.id;
    return `${cabecalho('<i class="ti ti-report"></i> Boletim escolar',
      `${seletorTurma(r.turmas)}${r.boletim ? '<button class="btn btn-secundario" data-action="imprimir"><i class="ti ti-printer"></i> Imprimir / PDF</button>' : ''}`)}
      ${r.boletim ? EG.htmlBoletim(r.boletim) : '<div class="card"><div class="vazio"><i class="ti ti-report"></i>O aluno ainda não está em uma turma.</div></div>'}`;
  });

  /* =====================================================================
   *  Frequência
   * ===================================================================== */
  registrar('portal-frequencia', async () => {
    const q = est.turmaId[est.alunoId] ? `?turmaId=${est.turmaId[est.alunoId]}` : '';
    const r = await EG.api('GET', `/portal/alunos/${est.alunoId}/frequencia${q}`);
    if (!r.turma) return `${cabecalho('<i class="ti ti-calendar-check"></i> Frequência')}<div class="card"><div class="vazio">O aluno ainda não está em uma turma.</div></div>`;
    est.turmaId[est.alunoId] = r.turma.id;
    const t = r.total;
    const abaixo = t.percentual !== null && t.percentual < r.minima;
    const barra = (p) => `<div class="medidor-linha"><div class="medidor"><span style="width:${p || 0}%"></span></div><span>${pct(p)}</span></div>`;
    return `${cabecalho('<i class="ti ti-calendar-check"></i> Frequência', seletorTurma(r.turmas))}
      <div class="grade-kpi">
        ${kpi('ti-calendar-check', abaixo ? 'var(--erro-bg)' : 'var(--ok-bg)', abaixo ? 'var(--erro)' : 'var(--ok)', 'Frequência', pct(t.percentual), `mínimo exigido: ${r.minima}%`)}
        ${kpi('ti-school', 'var(--info-bg)', 'var(--info)', 'Aulas registradas', t.aulas, `${t.presencas} presença(s)`)}
        ${kpi('ti-calendar-x', 'var(--erro-bg)', 'var(--erro)', 'Faltas', t.faltas, 'sem justificativa')}
        ${kpi('ti-file-certificate', 'var(--aviso-bg)', 'var(--aviso-tx)', 'Justificadas', t.justificadas, 'não reduzem a frequência')}
      </div>
      ${abaixo ? `<div class="msg-erro">A frequência está abaixo do mínimo de ${r.minima}% exigido para aprovação. Converse com a coordenação.</div>` : ''}
      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-book"></i> Por disciplina</div></div>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Disciplina</th><th class="num">Aulas</th><th class="num">Faltas</th><th class="num">Justificadas</th><th style="width:30%">Frequência</th></tr></thead>
          <tbody>${r.disciplinas.map((d) => `<tr><td><strong>${EG.esc(d.nome)}</strong></td><td class="num">${d.aulas}</td><td class="num">${d.faltas}</td><td class="num">${d.justificadas}</td><td>${barra(d.percentual)}</td></tr>`).join('')
            || '<tr><td colspan="5"><div class="vazio">Nenhuma aula registrada ainda</div></td></tr>'}</tbody>
        </table></div>
      </div>
      ${r.meses.length > 1 ? `<div class="card"><div class="card-cab"><div class="card-titulo"><i class="ti ti-calendar-stats"></i> Mês a mês</div></div>
        <div class="tabela-wrap"><table><thead><tr><th>Mês</th><th class="num">Aulas</th><th class="num">Faltas</th><th style="width:40%">Frequência</th></tr></thead>
        <tbody>${r.meses.map((m) => `<tr><td>${EG.MESES[Number(m.referencia.slice(5, 7)) - 1]}/${m.referencia.slice(0, 4)}</td><td class="num">${m.aulas}</td><td class="num">${m.faltas + m.justificadas}</td><td>${barra(m.percentual)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-list"></i> Faltas e o que foi dado na aula</div></div>
        ${r.ausencias.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Disciplina</th><th>Conteúdo da aula</th></tr></thead>
          <tbody>${r.ausencias.map((x) => `<tr><td style="white-space:nowrap">${EG.data(x.data)}${x.justificada ? '<br><span class="selo selo-aviso">justificada</span>' : ''}</td>
            <td>${EG.esc(x.disciplina)}</td><td><span class="sub">${EG.esc(x.conteudo || '—')}</span></td></tr>`).join('')}</tbody></table></div>`
          : '<div class="vazio"><i class="ti ti-mood-happy"></i>Nenhuma falta nesta turma</div>'}
      </div>`;
  });

  /* =====================================================================
   *  Financeiro
   * ===================================================================== */
  registrar('portal-financeiro', async () => {
    const r = await EG.api('GET', `/portal/alunos/${est.alunoId}/financeiro${est.ano ? `?ano=${est.ano}` : ''}`);
    est.ano = r.ano;
    const s = r.resumo;
    const temPagas = r.itens.some((m) => m.situacao === 'paga');
    const temAbertas = r.itens.some((m) => m.situacao === 'pendente' || m.situacao === 'vencida');
    return `${cabecalho('<i class="ti ti-receipt"></i> Mensalidades',
      `<select class="select" data-filtro="ano" style="width:auto">${r.anos.map((a) => `<option ${a === r.ano ? 'selected' : ''}>${a}</option>`).join('')}</select>`)}
      <div class="grade-kpi">
        ${kpi('ti-clock', 'var(--info-bg)', 'var(--info)', 'Em aberto', EG.moeda(s.valorAberto), `${s.abertas} mensalidade(s)`)}
        ${kpi('ti-alert-triangle', s.vencidas ? 'var(--erro-bg)' : 'var(--ok-bg)', s.vencidas ? 'var(--erro)' : 'var(--ok)', 'Em atraso', EG.moeda(s.valorVencido), s.vencidas ? `${s.vencidas} mensalidade(s)` : 'nenhuma')}
        ${kpi('ti-circle-check', 'var(--ok-bg)', 'var(--ok)', `Pago em ${r.ano}`, EG.moeda(s.valorPago), `${s.pagas} mensalidade(s)`)}
        ${kpi('ti-discount-2', 'var(--roxo-bg)', 'var(--roxo)', 'Descontos', EG.moeda(s.descontos), 'bolsas e descontos no ano')}
      </div>
      <div class="card">
        <div class="card-cab">
          <div class="card-titulo"><i class="ti ti-list"></i> ${r.ano}</div>
          <div class="acoes-topo">
            ${temAbertas ? `<button class="btn btn-secundario" data-action="doc" data-tipo="carne" data-ano="${r.ano}"><i class="ti ti-file-type-pdf"></i> Carnê ${r.ano}</button>` : ''}
            ${temPagas ? `<button class="btn btn-secundario" data-action="doc" data-tipo="declaracao" data-ano="${r.ano}" title="Pagamentos feitos no ano, para o Imposto de Renda"><i class="ti ti-file-certificate"></i> Declaração para o IR</button>` : ''}
          </div>
        </div>
        ${r.pixConfigurado ? '' : '<p class="card-desc">Para pagar, abra a cobrança em PDF ou fale com a secretaria do colégio.</p>'}
        <div class="tabela-wrap"><table>
          <thead><tr><th>Referência</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
          <tbody>${r.itens.map((m) => {
            const sit = SIT_MENS[m.situacao] || SIT_MENS.pendente;
            const aberta = m.situacao === 'pendente' || m.situacao === 'vencida';
            return `<tr>
              <td><strong>${EG.MESES[Number(m.referencia.slice(5, 7)) - 1]}</strong></td>
              <td style="white-space:nowrap">${EG.data(m.vencimento)}</td>
              <td class="num">${m.desconto > 0 ? `<small class="sub"><s>${EG.moeda(m.valorBruto)}</s></small><br>` : ''}<strong>${EG.moeda(m.valor)}</strong>
                ${m.bolsa ? `<br><small class="sub">${EG.esc(m.bolsa.tipo)}</small>` : ''}</td>
              <td><span class="selo ${sit[1]}">${sit[0]}</span>
                ${m.situacao === 'vencida' ? `<br><small class="sub">há ${m.diasAtraso} dia(s)</small>` : ''}
                ${m.situacao === 'paga' ? `<br><small class="sub">em ${EG.data(m.dataPagamento)}${m.formaPagamento ? ' · ' + EG.esc(m.formaPagamento) : ''}</small>` : ''}</td>
              <td class="acoes">${aberta ? `<button class="btn btn-primario btn-pequeno" data-action="doc" data-tipo="mensalidade" data-id="${m.id}"><i class="ti ti-qrcode"></i> ${r.pixConfigurado ? 'Pagar com PIX' : '2ª via'}</button>`
                : m.situacao === 'paga' ? `<button class="btn btn-secundario btn-pequeno" data-action="doc" data-tipo="mensalidade" data-id="${m.id}"><i class="ti ti-receipt"></i> Recibo</button>` : ''}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="5"><div class="vazio"><i class="ti ti-receipt"></i>Nenhuma mensalidade neste ano</div></td></tr>'}</tbody>
        </table></div>
        <p class="sub" style="margin-top:10px">Pagou agora? A baixa aparece aqui assim que o colégio confirmar o recebimento.</p>
      </div>`;
  });
  /* =====================================================================
   *  Comunicados (da família toda, não de um filho só)
   * ===================================================================== */
  function cartaoComunicado(c, aberto) {
    const novo = !c.lidoEm;
    const falta = c.exigeCiencia && !c.cienteEm;
    const selos = EG.seloTipoComunicado(c.tipo)
      + (c.fixado ? '<span class="selo selo-aviso"><i class="ti ti-pin"></i> Fixado</span>' : '')
      + (novo ? '<span class="selo selo-aviso">Novo</span>' : '')
      + (falta ? '<span class="selo selo-erro"><i class="ti ti-checks"></i> Confirme a ciência</span>' : '');
    let acoes = '';
    if (!aberto) acoes += `<button class="btn ${novo ? 'btn-primario' : 'btn-secundario'} btn-pequeno" data-com="ler"><i class="ti ti-eye"></i> ${novo ? 'Ler comunicado' : 'Abrir'}</button>`;
    if (aberto && falta) acoes += '<button class="btn btn-primario btn-pequeno" data-com="ciente"><i class="ti ti-checks"></i> Estou ciente</button>';
    if (c.cienteEm) acoes += `<span class="com-ciente"><i class="ti ti-circle-check"></i> Ciente em ${EG.dataHora(c.cienteEm)}</span>`;
    if (aberto) acoes += '<button class="btn btn-secundario btn-pequeno" data-com="fechar"><i class="ti ti-chevron-up"></i> Recolher</button>';
    return `<div class="com-item tipo-${c.tipo} ${novo ? 'novo' : ''}" data-id="${c.id}">
      <div class="com-selos">${selos}</div>
      <div class="com-titulo">${EG.esc(c.titulo)}</div>
      <div class="com-meta">Para: ${EG.esc(c.para.join(', '))}${c.autor ? ' · ' + EG.esc(c.autor) : ''} · ${EG.dataHora(c.criadoEm)}${c.atualizadoEm ? ' (atualizado)' : ''}</div>
      <div class="com-texto ${aberto ? '' : 'resumo'}">${EG.esc(c.mensagem)}</div>
      <div class="com-acoes">${acoes}</div></div>`;
  }

  EG.registrarModulo('portal-comunicados', {
    async render(el) {
      await carregarPortal(false);
      if (!portal.alunos.length) { el.innerHTML = semFilhos(); ligar(el, async () => EG.recarregarPagina()); return; }
      const lista = (await EG.api('GET', '/portal/comunicados')).itens;
      const abertos = new Set();

      async function marcarLido(c) {
        if (c.lidoEm) return;
        const r = await EG.api('POST', `/portal/comunicados/${c.id}/lido`);
        c.lidoEm = r.lidoEm;
        EG.atualizarComunicadosPortal();
      }
      function desenhar() {
        const naoLidos = lista.filter((c) => !c.lidoEm).length;
        const ciencia = lista.filter((c) => c.exigeCiencia && !c.cienteEm).length;
        const filtrada = lista.filter((c) => estCom.filtro === 'todos' || (estCom.filtro === 'nao' ? !c.lidoEm : c.exigeCiencia && !c.cienteEm));
        el.innerHTML = `<div class="card">
          <div class="card-cab"><div class="card-titulo"><i class="ti ti-speakerphone"></i> Comunicados do ${EG.esc(portal.colegio.nome)}</div></div>
          <div class="filtros">
            ${[['todos', `Todos (${lista.length})`], ['nao', `Não lidos (${naoLidos})`], ['ciencia', `Aguardando ciência (${ciencia})`]]
              .map(([v, r]) => `<button class="chip ${estCom.filtro === v ? 'ativo' : ''}" data-filtro-com="${v}">${r}</button>`).join('')}
          </div>
          ${filtrada.length ? filtrada.map((c) => cartaoComunicado(c, abertos.has(c.id))).join('')
            : `<div class="vazio"><i class="ti ti-mood-happy"></i>${lista.length ? 'Nada pendente por aqui' : 'Nenhum comunicado no momento'}</div>`}
        </div>`;
      }

      // Veio de um comunicado da Início: abre e marca como lido
      if (estCom.abrir) {
        const alvo = lista.find((c) => c.id === estCom.abrir);
        estCom.abrir = null;
        if (alvo) { estCom.filtro = 'todos'; abertos.add(alvo.id); await marcarLido(alvo).catch(() => {}); }
      }
      desenhar();
      if (abertos.size) { const card = el.querySelector(`.com-item[data-id="${[...abertos][0]}"]`); if (card) card.scrollIntoView({ block: 'start' }); }

      el.onclick = (ev) => {
        const f = ev.target.closest('[data-filtro-com]');
        if (f) { estCom.filtro = f.dataset.filtroCom; desenhar(); return; }
        const b = ev.target.closest('[data-com]');
        if (!b) return;
        const c = lista.find((x) => x.id === Number(b.closest('[data-id]').dataset.id));
        EG.guarda(b, async () => {
          try {
            if (b.dataset.com === 'ler') { abertos.add(c.id); await marcarLido(c); }
            else if (b.dataset.com === 'fechar') abertos.delete(c.id);
            else if (b.dataset.com === 'ciente') {
              const r = await EG.api('POST', `/portal/comunicados/${c.id}/ciente`);
              c.lidoEm = r.lidoEm; c.cienteEm = r.cienteEm;
              EG.toast('Obrigado! Sua ciência foi registrada.');
              EG.atualizarComunicadosPortal();
            }
            desenhar();
          } catch (e) { EG.toast(e.message, 'erro'); }
        });
      };
    }
  });
})(window.EG);
