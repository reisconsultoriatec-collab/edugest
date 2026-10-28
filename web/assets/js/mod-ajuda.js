/* =====================================================================
 *  EduGest — Central de ajuda (manual do sistema)
 *  · Artigos por assunto, com busca, "comece por aqui" do perfil e o que
 *    a pessoa já leu (fica no servidor: vale em qualquer aparelho).
 *  · Ajuda da tela atual (botão ? do topo) e "Mostrar na tela" (tour).
 *  · Implantação: lista do que configurar no colégio (administrador),
 *    com o que já foi feito, também no Dashboard.
 *  · Primeiro acesso: convite para o tour guiado; manual em PDF.
 *  O conteúdo está em ajuda-conteudo.js (EG.AJUDA).
 * ===================================================================== */
'use strict';
(function (EG) {
  const A = () => EG.AJUDA;
  const est = { cat: '', artigo: '', busca: '', todos: false, tela: '' };
  let marcas = null;      // { 'artigo:x': data, ... } do usuário logado
  let marcasDe = null;    // id do usuário dessas marcas
  let implantacao = null; // resposta de /colegios/atual/implantacao

  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const fmt = (s) => EG.esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\{\{(.+?)\}\}/g, '<span class="aj-botao">$1</span>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
  const usuarioId = () => (EG.estado.me && EG.estado.me.usuario ? EG.estado.me.usuario.id : null);
  const ehDono = () => !!(EG.estado.me && (EG.estado.me.proprietario || EG.estado.me.proprietarioVerificar));
  const PERFIL_NOME = { admin: 'Administrador', professor: 'Professor', financeiro: 'Financeiro', responsavel: 'Responsável', equipe: 'Equipe', proprietario: 'Proprietário do sistema' };

  /* ---------------- Marcas (lido, tour feito) ---------------- */
  async function carregarMarcas() {
    if (marcas && marcasDe === usuarioId()) return marcas;
    try { marcas = (await EG.api('GET', '/me/ajuda')).marcados || {}; } catch (e) { marcas = {}; }
    marcasDe = usuarioId();
    return marcas;
  }
  function marcar(chave, feito = true) {
    if (!marcas) marcas = {};
    if (feito) { if (marcas[chave]) return; marcas[chave] = EG.hojeSP(); } else delete marcas[chave];
    EG.api('PUT', '/me/ajuda', { chave, feito }).catch(() => { /* só o progresso; tenta de novo na próxima */ });
  }
  const lido = (id) => !!(marcas && marcas['artigo:' + id]);

  /* ---------------- Quem vê cada artigo ---------------- */
  function doPerfil(a) {
    const p = EG.estado.perfil;
    if (p === 'responsavel') return !!(a.perfis && a.perfis.includes('responsavel'));
    if (a.perfis && a.perfis.includes('proprietario')) return ehDono();
    if (p === 'admin') return true;
    if (a.perfis && !a.perfis.some((x) => x === p || x === 'equipe')) return false;
    if (a.tela && EG.paginaPermitida && !EG.paginaPermitida(a.tela)) return false;
    return true;
  }
  // Responsável vê só o que é dele; a equipe pode abrir os artigos de outros perfis
  const todos = () => est.todos && EG.estado.perfil !== 'responsavel';
  const artigos = () => A().artigos.filter((a) => todos() || doPerfil(a));
  const artigo = (id) => A().artigos.find((a) => a.id === id);
  const categoria = (id) => A().categorias.find((c) => c.id === id);

  function buscar(termo) {
    const palavras = semAcento(termo).split(/\s+/).filter((p) => p.length > 1);
    if (!palavras.length) return [];
    return artigos().map((a) => {
      const titulo = semAcento(a.titulo), extra = semAcento((a.palavras || []).join(' ') + ' ' + a.resumo);
      const corpo = semAcento(JSON.stringify(a.corpo));
      let pontos = 0;
      for (const p of palavras) {
        const n = (titulo.includes(p) ? 6 : 0) + (extra.includes(p) ? 3 : 0) + (corpo.includes(p) ? 1 : 0);
        if (!n) return null; // todas as palavras precisam aparecer
        pontos += n;
      }
      return { a, pontos };
    }).filter(Boolean).sort((x, y) => y.pontos - x.pontos).map((x) => x.a);
  }

  /* ---------------- Desenho ---------------- */
  function bloco([tipo, conteudo]) {
    if (tipo === 'p') return `<p>${fmt(conteudo)}</p>`;
    if (tipo === 'h') return `<h4>${fmt(conteudo)}</h4>`;
    if (tipo === 'passos') return `<ol class="aj-passos">${conteudo.map((x) => `<li>${fmt(x)}</li>`).join('')}</ol>`;
    if (tipo === 'lista') return `<ul class="aj-lista">${conteudo.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul>`;
    if (tipo === 'dica') return `<div class="aj-nota dica"><i class="ti ti-bulb"></i><div>${fmt(conteudo)}</div></div>`;
    if (tipo === 'atencao') return `<div class="aj-nota atencao"><i class="ti ti-alert-triangle"></i><div>${fmt(conteudo)}</div></div>`;
    if (tipo === 'onde') return `<div class="aj-onde"><i class="ti ti-map-pin"></i> <span>Onde fica: <strong>${fmt(conteudo)}</strong></span></div>`;
    if (tipo === 'tabela') {
      const [cab, ...linhas] = conteudo;
      return `<div class="tabela-wrap"><table class="aj-tabela"><thead><tr>${cab.map((c) => `<th>${fmt(c)}</th>`).join('')}</tr></thead>
        <tbody>${linhas.map((l) => `<tr>${l.map((c) => `<td>${fmt(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    return '';
  }
  const corpoArtigo = (a) => a.corpo.map(bloco).join('');
  const selosPerfis = (a) => (a.perfis || []).filter((p) => PERFIL_NOME[p]).map((p) => `<span class="selo selo-neutro">${PERFIL_NOME[p]}</span>`).join(' ');

  function itemLista(a) {
    const c = categoria(a.cat);
    return `<button class="aj-item" data-aj-artigo="${a.id}">
      <i class="ti ${lido(a.id) ? 'ti-circle-check-filled aj-lido' : (c ? c.icone : 'ti-file-text')}"></i>
      <span><strong>${EG.esc(a.titulo)}</strong><small>${EG.esc(a.resumo)}</small></span>
      <i class="ti ti-chevron-right aj-seta"></i></button>`;
  }

  function cabecalho() {
    const lista = artigos().filter((a) => doPerfil(a));
    const lidos = lista.filter((a) => lido(a.id)).length;
    const pct = lista.length ? Math.round((lidos / lista.length) * 100) : 0;
    return `<div class="card aj-cab">
      <div class="aj-cab-linha">
        <div class="aj-cab-txt"><h2><i class="ti ti-lifebuoy"></i> Central de ajuda</h2>
          <p>O manual do EduGest: para que serve cada tela, passo a passo e as dúvidas mais comuns.</p></div>
        <div class="aj-cab-acoes">
          <button class="btn btn-primario" data-aj="tour"><i class="ti ti-route"></i> Fazer o tour guiado</button>
          <button class="btn btn-secundario" data-aj="manual"><i class="ti ti-printer"></i> Manual em PDF</button>
        </div>
      </div>
      <label class="aj-busca"><i class="ti ti-search"></i>
        <input type="search" data-busca placeholder="O que você quer fazer? Ex.: lançar notas, gerar mensalidades, esqueci a senha" value="${EG.esc(est.busca)}" aria-label="Buscar na ajuda"></label>
      <div class="aj-progresso">
        <div class="aj-progresso-barra"><span style="width:${pct}%"></span></div>
        <span>Você leu <strong>${lidos} de ${lista.length}</strong> artigos do seu perfil</span>
        ${EG.estado.perfil !== 'responsavel' ? `<label class="aj-todos"><input type="checkbox" data-filtro="todos" ${est.todos ? 'checked' : ''}> Mostrar também os de outros perfis</label>` : ''}
      </div>
    </div>`;
  }

  function telaInicio() {
    const p = EG.estado.perfil;
    const trilha = (A().trilhas[p] || []).map(artigo).filter((a) => a && (todos() || doPerfil(a)));
    const doTela = est.tela && est.tela !== 'ajuda' ? artigos().filter((a) => a.tela === est.tela || (a.telas || []).includes(est.tela)) : [];
    const temTour = est.tela && A().tours[est.tela];
    const cats = A().categorias.map((c) => ({ c, lista: artigos().filter((a) => a.cat === c.id) })).filter((x) => x.lista.length);
    return `
      ${est.tela && (doTela.length || temTour) ? `<div class="card aj-contexto">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-pointer-question"></i> Ajuda desta tela: ${EG.esc(EG.rotuloPagina(est.tela))}</div>
          ${temTour ? `<button class="btn btn-secundario btn-pequeno" data-aj="tour-tela" data-tela="${est.tela}"><i class="ti ti-route"></i> Mostrar na tela</button>` : ''}</div>
        <div class="aj-itens">${doTela.map(itemLista).join('') || '<p class="sub">Use o tour para ver os elementos desta tela.</p>'}</div>
      </div>` : ''}
      ${p === 'admin' ? '<div data-aj-implantacao></div>' : ''}
      ${trilha.length ? `<div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-flag"></i> Comece por aqui</div>
          <span class="sub">${trilha.filter((a) => lido(a.id)).length} de ${trilha.length} lidos</span></div>
        <p class="card-desc">O essencial para o seu dia a dia${p === 'responsavel' ? '' : ', na ordem em que costuma ser usado. Ideal para quem está começando no colégio'}.</p>
        <div class="aj-itens">${trilha.map(itemLista).join('')}</div>
      </div>` : ''}
      <div class="aj-cats">${cats.map(({ c, lista }) => {
        const l = lista.filter((a) => lido(a.id)).length;
        return `<button class="aj-cat" data-aj-cat="${c.id}">
          <span class="aj-cat-icone"><i class="ti ${c.icone}"></i></span>
          <strong>${EG.esc(c.titulo)}</strong><small>${EG.esc(c.desc)}</small>
          <span class="aj-cat-rodape">${lista.length} artigo(s)${l ? ` · ${l} lido(s)` : ''}</span></button>`;
      }).join('')}</div>`;
  }

  function telaCategoria() {
    const c = categoria(est.cat);
    const lista = artigos().filter((a) => a.cat === est.cat);
    return `<div class="card">
      <button class="link-sutil aj-voltar" data-aj="inicio"><i class="ti ti-arrow-left"></i> Central de ajuda</button>
      <div class="card-cab" style="margin-top:8px"><div class="card-titulo"><i class="ti ${c.icone}"></i> ${EG.esc(c.titulo)}</div></div>
      <p class="card-desc">${EG.esc(c.desc)}</p>
      ${est.cat === 'implantacao' && EG.estado.perfil === 'admin' ? '<div data-aj-implantacao data-completo></div>' : ''}
      <div class="aj-itens">${lista.map(itemLista).join('') || '<div class="vazio">Nenhum artigo para o seu perfil neste assunto</div>'}</div>
    </div>`;
  }

  function telaBusca() {
    const r = buscar(est.busca);
    return `<div class="card">
      <div class="card-cab"><div class="card-titulo"><i class="ti ti-search"></i> ${r.length} resultado(s) para "${EG.esc(est.busca)}"</div>
        <button class="link-sutil" data-aj="limpar-busca">Limpar a busca</button></div>
      <div class="aj-itens">${r.map(itemLista).join('') || `<div class="vazio"><i class="ti ti-mood-empty"></i>Nada encontrado. Tente outras palavras${todos() || EG.estado.perfil === 'responsavel' ? '' : ' ou marque "Mostrar também os de outros perfis"'}.</div>`}</div>
    </div>`;
  }

  function telaArtigo() {
    const a = artigo(est.artigo);
    if (!a) { est.artigo = ''; return telaInicio(); }
    const c = categoria(a.cat);
    const podeIr = a.tela && EG.paginaPermitida(a.tela);
    const temTour = a.tela && A().tours[a.tela] && podeIr;
    const rel = (a.relacionados || []).map(artigo).filter((x) => x && (todos() || doPerfil(x)));
    const lista = artigos().filter((x) => x.cat === a.cat);
    const pos = lista.indexOf(a);
    const prox = pos >= 0 ? lista[pos + 1] : null;
    return `<article class="card aj-artigo">
      <nav class="aj-trilha"><button class="link-sutil" data-aj="inicio">Central de ajuda</button> ›
        <button class="link-sutil" data-aj-cat="${a.cat}">${EG.esc(c ? c.titulo : '')}</button></nav>
      <h2>${EG.esc(a.titulo)}</h2>
      <p class="aj-resumo">${fmt(a.resumo)}</p>
      ${a.perfis ? `<div class="aj-perfis">Para: ${selosPerfis(a)}</div>` : ''}
      ${podeIr || temTour ? `<div class="aj-acoes-artigo">
        ${podeIr ? `<button class="btn btn-secundario btn-pequeno" data-aj="ir" data-tela="${a.tela}"><i class="ti ti-external-link"></i> Abrir ${EG.esc(EG.rotuloPagina(a.tela))}</button>` : ''}
        ${temTour ? `<button class="btn btn-secundario btn-pequeno" data-aj="tour-tela" data-tela="${a.tela}"><i class="ti ti-route"></i> Mostrar na tela</button>` : ''}
      </div>` : ''}
      <div class="aj-corpo">${corpoArtigo(a)}</div>
      ${rel.length ? `<div class="aj-rel"><div class="rotulo">Veja também</div><div class="aj-itens">${rel.map(itemLista).join('')}</div></div>` : ''}
      <div class="aj-artigo-rodape">
        <span class="sub"><i class="ti ti-circle-check"></i> Marcado como lido</span>
        ${prox ? `<button class="btn btn-secundario btn-pequeno" data-aj-artigo="${prox.id}">Próximo: ${EG.esc(prox.titulo)} <i class="ti ti-arrow-right"></i></button>` : ''}
      </div>
    </article>`;
  }

  /* ---------------- Implantação do colégio (administrador) ---------------- */
  async function carregarImplantacao() {
    try { implantacao = await EG.api('GET', '/colegios/atual/implantacao'); } catch (e) { implantacao = null; }
    return implantacao;
  }
  function htmlImplantacao(r, completo) {
    if (!r) return '';
    const itens = A().implantacao.map((x) => ({ ...x, feito: !!r.itens[x.id] }));
    const pct = Math.round((r.feitos / r.total) * 100);
    const pend = itens.filter((x) => !x.feito);
    const linha = (x) => `<li class="${x.feito ? 'feito' : ''}">
      <i class="ti ${x.feito ? 'ti-circle-check-filled' : 'ti-circle'}"></i>
      <span><strong>${EG.esc(x.titulo)}</strong><small>${fmt(x.texto)}</small></span>
      <span class="aj-impl-acoes">
        ${x.artigo ? `<button class="link-sutil" data-aj-artigo="${x.artigo}">Como fazer</button>` : ''}
        ${!x.feito && x.pagina && EG.paginaPermitida(x.pagina) ? `<button class="btn btn-secundario btn-pequeno" data-aj="ir" data-tela="${x.pagina}">Abrir</button>` : ''}
      </span></li>`;
    const fases = [...new Set(itens.map((x) => x.fase))];
    return `<div class="${completo ? '' : 'card '}aj-impl">
      <div class="card-cab"><div class="card-titulo"><i class="ti ti-checklist"></i> Implantação do colégio</div>
        <span class="aj-impl-num">${r.feitos} de ${r.total}</span></div>
      <div class="aj-progresso-barra grande"><span style="width:${pct}%"></span></div>
      ${!completo ? `<p class="card-desc" style="margin:10px 0">${pend.length ? `Próximos passos para deixar o colégio pronto para usar (ano letivo ${r.anoLetivo}):` : 'Tudo configurado. 🎉'}</p>
        <ul class="aj-impl-lista">${pend.slice(0, 4).map(linha).join('')}</ul>
        <button class="link-sutil" data-aj="ver-implantacao">Ver a lista completa e o passo a passo</button>`
      : fases.map((f) => `<div class="rotulo aj-fase">${EG.esc(f)}</div><ul class="aj-impl-lista">${itens.filter((x) => x.fase === f).map(linha).join('')}</ul>`).join('')}
    </div>`;
  }
  async function desenharImplantacao(el) {
    const alvo = EG.$('[data-aj-implantacao]', el);
    if (!alvo) return;
    const r = implantacao || await carregarImplantacao();
    if (!alvo.isConnected) return;
    const completo = alvo.hasAttribute('data-completo');
    if (!r || (!completo && r.feitos === r.total)) { alvo.remove(); return; }
    alvo.innerHTML = htmlImplantacao(r, completo);
  }

  /** Cartão do Dashboard (administrador): some quando tudo estiver feito ou se a pessoa ocultar. */
  EG.cartaoImplantacao = async function () {
    if (EG.estado.perfil !== 'admin') return '';
    await carregarMarcas();
    if (marcas['pref:implantacao-oculta']) return '';
    const r = await carregarImplantacao();
    if (!r || r.feitos === r.total) return '';
    return htmlImplantacao(r, false).replace('<span class="aj-impl-num">',
      '<span class="aj-impl-cab-dir"><button class="link-sutil" data-aj="ocultar-implantacao" title="Esconder do Dashboard (continua na Central de ajuda)">Ocultar</button><span class="aj-impl-num">');
  };

  /* ---------------- Tours ---------------- */
  function passosDaTela(id, soResumo) {
    const t = A().tours[id];
    if (!t) return [];
    return t.filter((p) => !soResumo || p.g).map((p) => ({ pagina: id, ...p }));
  }
  function tourGeral() {
    const resp = EG.estado.perfil === 'responsavel';
    const ini = resp ? A().tourInicio.responsavel : A().tourInicio.equipe;
    const ordem = resp ? A().ordemPortal : A().ordemEquipe;
    const meio = ordem.filter((id) => EG.paginaPermitida(id)).flatMap((id) => passosDaTela(id, true));
    return [...ini, ...meio, ...A().tourFim];
  }
  function iniciarTourGeral() {
    EG.tour.iniciar(tourGeral(), {
      id: 'geral',
      aoTerminar(concluiu) {
        if (concluiu) {
          marcar('tour:geral');
          EG.toast('Tour concluído! A Central de ajuda fica no botão ? do topo.');
        } else EG.toast('Você pode retomar o tour quando quiser pelo menu do seu usuário.', 'info');
      }
    });
  }
  function tourDaTela(id) {
    const passos = passosDaTela(id, false);
    if (!passos.length) return;
    EG.tour.iniciar(passos, { id, aoTerminar: (ok) => { if (ok) marcar('tour:' + id); } });
  }
  EG.tourGuiado = iniciarTourGeral;

  /* ---------------- Primeiro acesso ---------------- */
  let mostrouBoasVindas = false;
  EG.boasVindas = function () {
    const me = EG.estado.me;
    if (mostrouBoasVindas || !me || !me.usuario || me.usuario.tourConcluido || EG.tour.ativo || EG.$('#app').hidden) return;
    if (EG.$('#modais .modal-fundo')) return; // outra janela aberta: fica para o próximo acesso
    mostrouBoasVindas = true;
    me.usuario.tourConcluido = true;
    EG.api('PUT', '/me/tour').catch(() => {});
    const nome = (me.usuario.nome || '').split(' ')[0];
    const resp = EG.estado.perfil === 'responsavel';
    const passos = tourGeral().length;
    const m = EG.modal({
      titulo: '',
      largura: 520,
      corpo: `<div class="boas-vindas">
        <div class="boas-vindas-marca">${EG.logo ? EG.logo('grande') : ''}</div>
        <h2>Bem-vindo(a) ao EduGest, ${EG.esc(nome)}!</h2>
        <p>${resp ? 'Aqui você acompanha a vida escolar do seu filho: boletim, faltas, mensalidades, comunicados e o calendário do colégio.'
          : 'Vamos mostrar onde fica cada coisa. São poucos minutos e você pode sair a qualquer momento.'}</p>
        <ul class="boas-vindas-lista">
          <li><i class="ti ti-route"></i><span><strong>Tour guiado</strong> passa pelas telas que você usa e mostra os botões principais (${passos} passos).</span></li>
          <li><i class="ti ti-lifebuoy"></i><span><strong>Central de ajuda</strong> é o manual do sistema, com passo a passo e perguntas frequentes. Fica no botão <span class="aj-botao">?</span> do topo${resp ? '' : ' e no menu, para estudar quando quiser'}.</span></li>
          ${EG.estado.perfil === 'admin' ? '<li><i class="ti ti-checklist"></i><span><strong>Implantação</strong>: a lista do que configurar no colégio, na ordem certa, aparece no Dashboard.</span></li>' : ''}
        </ul></div>`,
      botoes: [
        { texto: 'Agora não', acao: () => { m.fechar(); EG.toast('O tour e o manual ficam no botão ? do topo e no menu do seu usuário.', 'info'); } },
        { texto: 'Começar o tour', classe: 'btn-primario', icone: 'ti-route', acao: () => { m.fechar(); iniciarTourGeral(); } }
      ]
    });
  };

  /* ---------------- Manual em PDF (impressão do navegador) ---------------- */
  function imprimirManual() {
    const lista = artigos();
    const cats = A().categorias.map((c) => ({ c, itens: lista.filter((a) => a.cat === c.id) })).filter((x) => x.itens.length);
    const colegio = EG.estado.colegio ? EG.estado.colegio.nome : '';
    const quem = todos() ? 'todos os perfis' : `perfil ${(PERFIL_NOME[EG.estado.perfil] || EG.estado.perfil).toLowerCase()}`;
    let box = EG.$('#manualImpressao');
    if (!box) { box = document.createElement('div'); box.id = 'manualImpressao'; document.body.appendChild(box); }
    box.innerHTML = `<div class="manual-capa">
        <div class="manual-marca">${EG.logo ? EG.logo('') : ''} <strong>EduGest</strong></div>
        <h1>Manual do sistema</h1>
        <p>${EG.esc(colegio)}<br>${EG.esc(quem)} · versão ${EG.esc(EG.VERSAO || '')} · ${EG.data(EG.hojeSP())}</p>
        <div class="manual-indice"><h3>Conteúdo</h3><ol>${cats.map(({ c, itens }) => `<li><strong>${EG.esc(c.titulo)}</strong>
          <ul>${itens.map((a) => `<li>${EG.esc(a.titulo)}</li>`).join('')}</ul></li>`).join('')}</ol></div>
        <p class="manual-rodape">Reis Tecnologia · edugest.reisconsultoriatec.com</p>
      </div>
      ${cats.map(({ c, itens }) => `<section class="manual-cat"><h2>${EG.esc(c.titulo)}</h2><p class="manual-desc">${EG.esc(c.desc)}</p>
        ${itens.map((a) => `<div class="manual-artigo"><h3>${EG.esc(a.titulo)}</h3><p class="aj-resumo">${fmt(a.resumo)}</p>${corpoArtigo(a)}</div>`).join('')}</section>`).join('')}`;
    document.body.classList.add('imprimindo-manual');
    const limpar = () => { document.body.classList.remove('imprimindo-manual'); box.innerHTML = ''; window.removeEventListener('afterprint', limpar); };
    window.addEventListener('afterprint', limpar);
    setTimeout(() => { window.print(); setTimeout(limpar, 1500); }, 60);
  }

  /* ---------------- Tela ---------------- */
  let raiz = null;
  function desenhar() {
    if (!raiz || !raiz.isConnected) return;
    const corpo = est.busca.trim().length >= 2 ? telaBusca() : est.artigo ? telaArtigo() : est.cat ? telaCategoria() : telaInicio();
    const cab = EG.$('[data-aj-cab]', raiz);
    if (!cab.innerHTML) cab.innerHTML = cabecalho();
    else {
      const progresso = EG.$('.aj-progresso', cab);
      const novo = document.createElement('div'); novo.innerHTML = cabecalho();
      progresso.replaceWith(EG.$('.aj-progresso', novo));
    }
    EG.$('[data-aj-corpo]', raiz).innerHTML = corpo;
    desenharImplantacao(raiz);
  }
  function abrirArtigo(id) {
    const a = artigo(id);
    if (!a) return;
    est.artigo = id; est.cat = a.cat; est.busca = '';
    const campo = EG.$('[data-busca]', raiz);
    if (campo) campo.value = '';
    marcar('artigo:' + id);
    desenhar();
    raiz.scrollIntoView({ block: 'start' });
    window.scrollTo({ top: 0 });
  }

  async function aoClicar(ev) {
    const t = ev.target;
    const art = t.closest('[data-aj-artigo]');
    if (art) { abrirArtigo(art.dataset.ajArtigo); return; }
    const cat = t.closest('[data-aj-cat]');
    if (cat) { est.cat = cat.dataset.ajCat; est.artigo = ''; est.busca = ''; EG.$('[data-busca]', raiz).value = ''; desenhar(); window.scrollTo({ top: 0 }); return; }
    const b = t.closest('[data-aj]');
    if (!b) return;
    const acao = b.dataset.aj;
    if (acao === 'inicio') { est.cat = ''; est.artigo = ''; desenhar(); }
    else if (acao === 'limpar-busca') { est.busca = ''; EG.$('[data-busca]', raiz).value = ''; desenhar(); }
    else if (acao === 'tour') iniciarTourGeral();
    else if (acao === 'tour-tela') tourDaTela(b.dataset.tela);
    else if (acao === 'manual') imprimirManual();
    else if (acao === 'ir') EG.navegar(b.dataset.tela);
    else if (acao === 'ver-implantacao') { est.cat = 'implantacao'; est.artigo = ''; desenhar(); }
  }

  EG.registrarModulo('ajuda', {
    async render(el) {
      raiz = el;
      if (EG.ajudaInicial) { Object.assign(est, { cat: '', artigo: '', busca: '' }, EG.ajudaInicial); EG.ajudaInicial = null; }
      else est.tela = '';
      await carregarMarcas();
      implantacao = null;
      el.innerHTML = '<div data-aj-cab></div><div data-aj-corpo></div>';
      desenhar();
      if (est.artigo) marcar('artigo:' + est.artigo);
      el.onclick = aoClicar;
      el.onchange = (ev) => { if (ev.target.matches('[data-filtro="todos"]')) { est.todos = ev.target.checked; desenhar(); } };
      let espera = null;
      el.oninput = (ev) => {
        if (!ev.target.matches('[data-busca]')) return;
        clearTimeout(espera);
        espera = setTimeout(() => { est.busca = ev.target.value; desenhar(); }, 200);
      };
    }
  });

  /** Abre a Central: { tela } = ajuda daquela tela; { artigo } = direto no artigo. */
  EG.abrirAjuda = function (opcoes) {
    EG.ajudaInicial = { tela: '', cat: '', artigo: '', ...(opcoes || {}) };
    if (EG.paginaAtual && EG.paginaAtual() === 'ajuda' && raiz && raiz.isConnected) {
      Object.assign(est, { busca: '' }, EG.ajudaInicial); EG.ajudaInicial = null;
      if (est.artigo) marcar('artigo:' + est.artigo);
      desenhar();
      return;
    }
    EG.navegar('ajuda');
  };

  /* Botões do topo, do menu do usuário e do cartão do Dashboard */
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('#app [data-action="ajuda"], #app [data-action="ajuda-central"], #app [data-action="tour"], #app [data-aj="ocultar-implantacao"], #app [data-aj="ver-implantacao"], #app [data-aj-artigo], #app [data-aj="ir"]');
    if (!b || (raiz && raiz.contains(b))) return; // dentro da Central, quem trata é a própria tela
    const dd = EG.$('#usuarioDropdown');
    if (dd) dd.hidden = true;
    if (b.dataset.action === 'ajuda') {
      const tela = EG.paginaAtual ? EG.paginaAtual() : '';
      EG.abrirAjuda({ tela: tela && tela !== 'ajuda' ? tela : '' });
    } else if (b.dataset.action === 'ajuda-central') EG.abrirAjuda({});
    else if (b.dataset.action === 'tour') iniciarTourGeral();
    else if (b.dataset.aj === 'ocultar-implantacao') {
      marcar('pref:implantacao-oculta');
      const card = b.closest('.aj-impl');
      if (card) card.remove();
      EG.toast('Lista de implantação oculta. Ela continua na Central de ajuda › Implantação do colégio.', 'info');
    } else if (b.dataset.aj === 'ver-implantacao') EG.abrirAjuda({ cat: 'implantacao' });
    else if (b.dataset.ajArtigo) EG.abrirAjuda({ artigo: b.dataset.ajArtigo, cat: (artigo(b.dataset.ajArtigo) || {}).cat || '' });
    else if (b.dataset.aj === 'ir') EG.navegar(b.dataset.tela);
  });
})(window.EG);
