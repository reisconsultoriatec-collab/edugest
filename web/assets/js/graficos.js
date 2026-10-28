/* =====================================================================
 *  EduGest — gráficos em SVG (sem biblioteca), usados no Painel da Direção
 *
 *  Regras de desenho: colunas e barras com no máximo 24 px de espessura,
 *  ponta arredondada (4 px) e base reta; linhas de 2 px com ponto final
 *  de 8 px e anel da cor do fundo; grade fina e discreta; separação de
 *  2 px entre segmentos empilhados; texto sempre nas cores de texto.
 *  Cores: variáveis --g-* (claro e escuro em app.css), paleta validada
 *  para daltonismo (azul, laranja, verde-água).
 *
 *  Cada gráfico desenha na largura e altura do elemento e guarda os
 *  parâmetros em el._graf para redesenhar (EG.graf.redesenhar(el)).
 *  Dicas (tooltip): passar o mouse ou focar a coluna/ponto.
 * ===================================================================== */
'use strict';
(function (EG) {
  const NS = 'http://www.w3.org/2000/svg';
  const COR = { s1: 'var(--g-s1)', s2: 'var(--g-s2)', s3: 'var(--g-s3)', neutro: 'var(--g-neutro)', trilho: 'var(--g-trilho)' };
  const cor = (c) => COR[c] || c || COR.s1;
  const esc = (s) => EG.esc(s);

  /* ---------- Escala "redonda" ---------- */
  function escala(max, min = 0, passos = 4) {
    if (!(max > min)) max = min + 1;
    const bruto = (max - min) / passos;
    const pot = 10 ** Math.floor(Math.log10(bruto));
    const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) || bruto;
    const topo = Math.ceil(max / passo) * passo;
    const base = Math.floor(min / passo) * passo;
    const ticks = [];
    for (let v = base; v <= topo + passo / 2; v += passo) ticks.push(Math.round(v * 1e6) / 1e6);
    return { min: base, max: topo, ticks };
  }
  /** 1.234 → "1,2 mil" · 1.500.000 → "1,5 mi" */
  EG.compacto = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (a >= 1e3) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  };

  /* ---------- Formas ---------- */
  function coluna(x, yBase, yTopo, w, raio) { // ponta de cima arredondada, base reta
    const h = yBase - yTopo;
    if (h <= 0.5) return '';
    const r = Math.min(raio, w / 2, h);
    return `M${x},${yBase}V${yTopo + r}Q${x},${yTopo} ${x + r},${yTopo}H${x + w - r}Q${x + w},${yTopo} ${x + w},${yTopo + r}V${yBase}Z`;
  }
  function barra(xBase, xFim, y, h, raio) { // ponta da direita arredondada
    const w = xFim - xBase;
    if (w <= 0.5) return '';
    const r = Math.min(raio, h / 2, w);
    return `M${xBase},${y}H${xFim - r}Q${xFim},${y} ${xFim},${y + r}V${y + h - r}Q${xFim},${y + h} ${xFim - r},${y + h}H${xBase}Z`;
  }

  /* ---------- Dica (tooltip) ---------- */
  let dica = null, alvoFoco = null;
  function posicionar(x, y) {
    const b = dica.getBoundingClientRect();
    const px = Math.min(window.innerWidth - b.width - 8, Math.max(8, x + 14));
    const py = y - b.height - 12 < 8 ? y + 18 : y - b.height - 12;
    dica.style.left = `${px}px`; dica.style.top = `${py}px`;
  }
  function mostrarDica(ev, titulo, linhas) {
    if (!dica) { dica = document.createElement('div'); dica.className = 'g-dica'; dica.setAttribute('role', 'tooltip'); document.body.appendChild(dica); }
    dica.replaceChildren();
    const t = document.createElement('div'); t.className = 'g-dica-titulo'; t.textContent = titulo; dica.appendChild(t);
    linhas.forEach((l) => {
      const row = document.createElement('div'); row.className = 'g-dica-linha';
      if (l.cor) { const k = document.createElement('span'); k.className = 'g-dica-chave'; k.style.background = cor(l.cor); row.appendChild(k); }
      const v = document.createElement('strong'); v.textContent = l.valor; row.appendChild(v);
      const n = document.createElement('span'); n.textContent = l.nome; row.appendChild(n);
      dica.appendChild(row);
    });
    dica.hidden = false;
    const porTeclado = ev.clientX === undefined || ev.type === 'focus' || ev.type === 'focusin';
    alvoFoco = porTeclado ? ev.target : null;
    if (porTeclado) { const r = ev.target.getBoundingClientRect(); posicionar(r.left + r.width / 2, r.top); }
    else posicionar(ev.clientX, ev.clientY);
  }
  function esconderDica() { if (dica) dica.hidden = true; alvoFoco = null; }
  // Rolando a página: a dica do mouse some; a do teclado (foco) acompanha o item
  window.addEventListener('scroll', () => {
    if (!dica || dica.hidden) return;
    if (alvoFoco && alvoFoco === document.activeElement && alvoFoco.isConnected) {
      const r = alvoFoco.getBoundingClientRect(); posicionar(r.left + r.width / 2, r.top);
    } else esconderDica();
  }, { passive: true });

  /** Liga os alvos [data-g] de um SVG às dicas. */
  function ligarDicas(svg, conteudo, aoEntrar, aoSair) {
    const alvo = (ev) => ev.target.closest && ev.target.closest('[data-g]');
    const mostrar = (ev) => {
      const a = alvo(ev); if (!a) return;
      const c = conteudo(Number(a.dataset.g));
      if (c) mostrarDica(ev, c.titulo, c.linhas);
      if (aoEntrar) aoEntrar(Number(a.dataset.g));
    };
    const sair = () => { esconderDica(); if (aoSair) aoSair(); };
    svg.addEventListener('pointermove', mostrar);
    svg.addEventListener('pointerleave', sair);
    svg.addEventListener('focusin', mostrar);
    svg.addEventListener('focusout', sair);
  }

  /* ---------- Base comum: tamanho, fonte, eixo Y ---------- */
  function base(el, alturaFixa) {
    const W = Math.max(260, Math.floor(el.clientWidth));
    const H = alturaFixa || Math.max(150, Math.floor(el.clientHeight) || 220);
    const fonte = parseFloat(getComputedStyle(el).fontSize) || 12;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'g-svg');
    return { W, H, fonte, svg };
  }
  function eixoY(g, { esq, dir, topo, baseY, s, fmt, fonte }) {
    const y = (v) => baseY - ((v - s.min) / (s.max - s.min)) * (baseY - topo);
    let html = '';
    s.ticks.forEach((t) => {
      const yy = y(t);
      html += `<line x1="${esq}" x2="${dir}" y1="${yy}" y2="${yy}" class="${t === 0 ? 'g-eixo' : 'g-grade'}"/>`;
      html += `<text x="${esq - 6}" y="${yy}" dy="0.32em" text-anchor="end" class="g-tick" font-size="${fonte * 0.85}">${esc(fmt(t))}</text>`;
    });
    g.insertAdjacentHTML('beforeend', html);
    return y;
  }
  const larguraTexto = (txt, fonte) => String(txt).length * fonte * 0.56;
  function margemEsq(s, fmt, fonte) { return Math.ceil(Math.max(...s.ticks.map((t) => larguraTexto(fmt(t), fonte * 0.85)))) + 12; }
  function rotulosX(categorias, xCentro, baseY, fonte, largBanda) {
    // Pula rótulos quando não cabem (mantém o primeiro e o último)
    const cabe = Math.max(1, Math.ceil(larguraTexto('Mmm', fonte * 0.85) / Math.max(1, largBanda)));
    return categorias.map((c, i) => (i % cabe === 0 || i === categorias.length - 1
      ? `<text x="${xCentro(i)}" y="${baseY + fonte * 1.3}" text-anchor="middle" class="g-tick" font-size="${fonte * 0.85}">${esc(c)}</text>` : '')).join('');
  }

  /* ---------- Colunas (empilhadas ou agrupadas) ---------- */
  function colunas(el, p) {
    el._graf = { tipo: 'colunas', p };
    const { W, H, fonte, svg } = base(el);
    const n = p.categorias.length;
    const empilhar = !!p.empilhar;
    const tot = p.categorias.map((_, i) => (empilhar
      ? p.series.reduce((s, se) => s + Math.max(0, se.valores[i] || 0), 0)
      : Math.max(0, ...p.series.map((se) => se.valores[i] || 0))));
    const s = escala(Math.max(...tot, p.minimoEixo || 0));
    const fmt = p.formatoEixo || EG.compacto;
    const esq = margemEsq(s, fmt, fonte); const dir = W - 8; const topo = fonte; const baseY = H - fonte * 2;
    const g = document.createElementNS(NS, 'g'); svg.appendChild(g);
    const y = eixoY(g, { esq, dir, topo, baseY, s, fmt, fonte });
    const banda = (dir - esq) / n;
    const grupos = empilhar ? 1 : p.series.length;
    const larg = Math.min(24, (banda * 0.7 - (grupos - 1) * 2) / grupos);
    const xCentro = (i) => esq + banda * i + banda / 2;
    let html = '';
    for (let i = 0; i < n; i++) {
      html += `<g class="g-cat" data-g="${i}" tabindex="0">`;
      html += `<rect x="${esq + banda * i}" y="${topo}" width="${banda}" height="${baseY - topo}" class="g-alvo"/>`;
      if (empilhar) {
        let acum = 0;
        const vis = p.series.map((se) => Math.max(0, se.valores[i] || 0));
        const ultimo = vis.reduce((u, v, k) => (v > 0 ? k : u), -1);
        p.series.forEach((se, k) => {
          const v = vis[k]; if (!v) return;
          const yb = y(acum) - (acum > 0 ? 1 : 0); const yt = y(acum + v) + (k === ultimo ? 0 : 1);
          acum += v;
          const x = xCentro(i) - larg / 2;
          html += k === ultimo ? `<path d="${coluna(x, yb, yt, larg, 4)}" fill="${cor(se.cor)}" class="g-marca"/>`
            : (yb - yt > 0.5 ? `<rect x="${x}" y="${yt}" width="${larg}" height="${yb - yt}" fill="${cor(se.cor)}" class="g-marca"/>` : '');
        });
      } else {
        p.series.forEach((se, k) => {
          const v = se.valores[i];
          if (v === null || v === undefined) return;
          const x = xCentro(i) - (grupos * larg + (grupos - 1) * 2) / 2 + k * (larg + 2);
          html += `<path d="${coluna(x, y(0), y(Math.max(0, v)), larg, 4)}" fill="${cor(se.cor)}" class="g-marca"/>`;
        });
      }
      if (p.destaque === i) html += `<line x1="${xCentro(i)}" x2="${xCentro(i)}" y1="${baseY + 3}" y2="${baseY + 7}" class="g-eixo"/>`;
      html += '</g>';
    }
    html += rotulosX(p.categorias, xCentro, baseY, fonte, banda);
    g.insertAdjacentHTML('beforeend', html);
    el.replaceChildren(svg);
    ligarDicas(svg, (i) => ({
      titulo: p.rotulosDica ? p.rotulosDica[i] : p.categorias[i],
      linhas: [...p.series.map((se) => ({ cor: se.cor, nome: se.nome, valor: (p.formato || EG.compacto)(se.valores[i] || 0) })), ...(p.extraDica ? p.extraDica(i) : [])]
    }), (i) => {
      svg.classList.add('g-foco');
      svg.querySelectorAll('.g-cat').forEach((c) => c.classList.toggle('ativo', Number(c.dataset.g) === i));
    }, () => { svg.classList.remove('g-foco'); svg.querySelectorAll('.g-cat.ativo').forEach((c) => c.classList.remove('ativo')); });
  }

  /* ---------- Linha (uma série) ---------- */
  function linha(el, p) {
    el._graf = { tipo: 'linha', p };
    const { W, H, fonte, svg } = base(el);
    const n = p.categorias.length;
    const vals = p.valores;
    const validos = vals.filter((v) => v !== null && v !== undefined);
    const s = escala(Math.max(p.minimoEixo || 0, ...(validos.length ? validos : [1]), p.alvo ? p.alvo.valor : 0));
    const fmt = p.formatoEixo || EG.compacto;
    const fmtV = p.formato || fmt;
    const esq = margemEsq(s, fmt, fonte);
    const ultimoI = vals.reduce((u, v, i) => (v !== null && v !== undefined ? i : u), -1);
    const dir = W - Math.max(16, larguraTexto(ultimoI >= 0 ? fmtV(vals[ultimoI]) : '', fonte) + 10);
    const topo = fonte; const baseY = H - fonte * 2;
    const g = document.createElementNS(NS, 'g'); svg.appendChild(g);
    const y = eixoY(g, { esq, dir, topo, baseY, s, fmt, fonte });
    const banda = (dir - esq) / n;
    const x = (i) => esq + banda * i + banda / 2;
    let html = '';
    if (p.alvo) {
      const ya = y(p.alvo.valor);
      html += `<line x1="${esq}" x2="${dir}" y1="${ya}" y2="${ya}" class="g-alvo-linha"/>
        <text x="${esq + 4}" y="${ya - 4}" class="g-tick" font-size="${fonte * 0.8}">${esc(p.alvo.rotulo)}</text>`;
    }
    // Trechos contínuos (sem dado = sem linha)
    const trechos = []; let atual = [];
    vals.forEach((v, i) => { if (v === null || v === undefined) { if (atual.length) trechos.push(atual); atual = []; } else atual.push(i); });
    if (atual.length) trechos.push(atual);
    trechos.forEach((t) => {
      const d = t.map((i, k) => `${k ? 'L' : 'M'}${x(i)},${y(vals[i])}`).join('');
      if (p.area && t.length > 1) html += `<path d="${d}L${x(t[t.length - 1])},${y(s.min)}L${x(t[0])},${y(s.min)}Z" fill="${cor(p.cor)}" class="g-area"/>`;
      html += `<path d="${d}" fill="none" stroke="${cor(p.cor)}" class="g-linha"/>`;
      if (t.length === 1) html += `<circle cx="${x(t[0])}" cy="${y(vals[t[0]])}" r="4" fill="${cor(p.cor)}" class="g-ponto"/>`;
    });
    if (ultimoI >= 0) {
      html += `<circle cx="${x(ultimoI)}" cy="${y(vals[ultimoI])}" r="4.5" fill="${cor(p.cor)}" class="g-ponto"/>
        <text x="${x(ultimoI) + 8}" y="${y(vals[ultimoI])}" dy="0.32em" class="g-valor" font-size="${fonte * 0.95}">${esc(fmtV(vals[ultimoI]))}</text>`;
    }
    html += `<line class="g-mira" y1="${topo}" y2="${baseY}" x1="0" x2="0" visibility="hidden"/>`;
    for (let i = 0; i < n; i++) html += `<rect x="${esq + banda * i}" y="${topo}" width="${banda}" height="${baseY - topo}" class="g-alvo" data-g="${i}" tabindex="0"/>`;
    html += rotulosX(p.categorias, x, baseY, fonte, banda);
    g.insertAdjacentHTML('beforeend', html);
    el.replaceChildren(svg);
    const mira = svg.querySelector('.g-mira');
    ligarDicas(svg, (i) => ({
      titulo: p.rotulosDica ? p.rotulosDica[i] : p.categorias[i],
      linhas: [{ cor: p.cor, nome: p.nome, valor: vals[i] === null || vals[i] === undefined ? 'sem dado' : fmtV(vals[i]) }]
    }), (i) => { mira.setAttribute('x1', x(i)); mira.setAttribute('x2', x(i)); mira.setAttribute('visibility', 'visible'); }, () => mira.setAttribute('visibility', 'hidden'));
  }

  /* ---------- Barras horizontais (com trilho opcional e linha de referência) ---------- */
  function barras(el, p) {
    el._graf = { tipo: 'barras', p };
    const itens = p.itens;
    const fonte = parseFloat(getComputedStyle(el).fontSize) || 12;
    const linhaH = Math.max(fonte * 2.3, 26);
    const altura = Math.ceil(Math.max(60, itens.length * linhaH + (p.referencia ? fonte * 1.8 : 4)));
    el.style.height = `${altura}px`;
    el.classList.add('g-barras');
    const { W, H, svg } = base(el, altura);
    const max = p.max || Math.max(1, ...itens.map((i) => Math.max(i.valor || 0, i.total || 0)));
    const fmt = p.formato || EG.compacto;
    const larguraRotulo = Math.min(W * 0.38, Math.max(...itens.map((i) => larguraTexto(i.rotulo, fonte))) + 10);
    const larguraValor = Math.max(...itens.map((i) => larguraTexto(i.texto || fmt(i.valor), fonte * 0.95))) + 12;
    const esq = larguraRotulo; const dir = W - larguraValor; const topo = 2;
    const x = (v) => esq + (Math.max(0, Math.min(v, max)) / max) * (dir - esq);
    const esp = Math.min(18, linhaH * 0.55);
    let html = '';
    itens.forEach((it, i) => {
      const yc = topo + linhaH * i + linhaH / 2;
      html += `<g class="g-cat" data-g="${i}" tabindex="0"><rect x="0" y="${yc - linhaH / 2}" width="${W}" height="${linhaH}" class="g-alvo"/>`;
      html += `<text x="${esq - 8}" y="${yc}" dy="0.32em" text-anchor="end" class="g-rotulo" font-size="${fonte}">${esc(it.rotulo)}</text>`;
      if (it.total) html += `<path d="${barra(esq, x(it.total), yc - esp / 2, esp, 4)}" fill="${cor('trilho')}"/>`;
      html += `<path d="${barra(esq, x(it.valor || 0), yc - esp / 2, esp, 4)}" fill="${cor(it.cor || p.cor)}" class="g-marca"/>`;
      const xt = Math.max(x(it.valor || 0), it.total ? x(it.total) : 0) + 6;
      html += `<text x="${xt}" y="${yc}" dy="0.32em" class="g-valor${it.alerta ? ' g-alerta' : ''}" font-size="${fonte * 0.95}">${esc(it.texto || fmt(it.valor))}</text></g>`;
    });
    if (p.referencia) {
      const xr = x(p.referencia.valor);
      html += `<line x1="${xr}" x2="${xr}" y1="0" y2="${H - fonte * 1.4}" class="g-alvo-linha"/>
        <text x="${xr}" y="${H - fonte * 0.3}" text-anchor="middle" class="g-tick" font-size="${fonte * 0.8}">${esc(p.referencia.rotulo)}</text>`;
    }
    svg.insertAdjacentHTML('beforeend', html);
    el.replaceChildren(svg);
    ligarDicas(svg, (i) => ({ titulo: itens[i].rotulo, linhas: itens[i].dica || [{ cor: itens[i].cor || p.cor, nome: p.nome || '', valor: itens[i].texto || fmt(itens[i].valor) }] }));
  }

  EG.graf = {
    colunas, linha, barras, escala,
    redesenhar(el) { const g = el && el._graf; if (g) ({ colunas, linha, barras })[g.tipo](el, g.p); },
    esconderDica
  };
})(window.EG);
