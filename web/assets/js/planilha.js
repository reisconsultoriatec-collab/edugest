/* =====================================================================
 *  EduGest — leitura de planilhas no navegador (sem bibliotecas)
 *  · Excel .xlsx: abre o zip com DecompressionStream, lê a 1ª aba,
 *    textos compartilhados e datas (pelo formato da célula).
 *  · CSV: separador ; , ou TAB; UTF-8 ou Windows-1252 (Excel em português).
 *  EG.lerPlanilha(file) → { nome, cabecalho: [..], linhas: [{ linha, celulas: [..] }] }
 *  A 1ª linha não vazia é o cabeçalho; linhas totalmente vazias são puladas.
 * ===================================================================== */
'use strict';
(function (EG) {
  const erro = (msg) => EG.erro(msg);

  /* ---------- ZIP (xlsx) ---------- */
  async function inflar(dados) {
    if (typeof DecompressionStream === 'undefined') throw erro('Este navegador não abre arquivos Excel. Salve a planilha como CSV ou atualize o navegador.');
    const ds = new DecompressionStream('deflate-raw');
    const resp = new Response(new Blob([dados]).stream().pipeThrough(ds));
    return new Uint8Array(await resp.arrayBuffer());
  }
  function lerZip(buf) {
    const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let fim = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    }
    if (fim < 0) throw erro('O arquivo não parece ser uma planilha do Excel (.xlsx).');
    const total = v.getUint16(fim + 10, true);
    let p = v.getUint32(fim + 16, true);
    const arquivos = new Map();
    const dec = new TextDecoder();
    for (let n = 0; n < total; n++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const metodo = v.getUint16(p + 10, true);
      const tam = v.getUint32(p + 20, true);
      const nomeLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), comLen = v.getUint16(p + 32, true);
      const local = v.getUint32(p + 42, true);
      const nome = dec.decode(buf.subarray(p + 46, p + 46 + nomeLen));
      arquivos.set(nome, { metodo, tam, local });
      p += 46 + nomeLen + extraLen + comLen;
    }
    return {
      tem: (nome) => arquivos.has(nome),
      async texto(nome) {
        const a = arquivos.get(nome);
        if (!a) return null;
        const ini = a.local + 30 + v.getUint16(a.local + 26, true) + v.getUint16(a.local + 28, true);
        const bruto = buf.subarray(ini, ini + a.tam);
        const dados = a.metodo === 0 ? bruto : a.metodo === 8 ? await inflar(bruto) : null;
        if (!dados) throw erro('Formato de compactação não suportado nesta planilha.');
        return new TextDecoder('utf-8').decode(dados);
      }
    };
  }
  const xml = (txt) => new DOMParser().parseFromString(txt, 'application/xml');
  const porTag = (no, tag) => Array.from(no.getElementsByTagNameNS('*', tag));

  /** Índice da coluna a partir da referência da célula ('C12' → 2). */
  function coluna(ref) {
    const letras = String(ref || '').replace(/\d+/g, '').toUpperCase();
    let n = 0;
    for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  /** Número serial do Excel → 'AAAA-MM-DD'. */
  function dataExcel(serial) {
    const ms = Math.round((Number(serial) - 25569) * 86400000);
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : String(serial);
  }
  /** Quais estilos de célula são datas (formatos nativos 14–22, 45–47 ou formato com d/m/a). */
  function estilosDeData(stylesTxt) {
    const datas = new Set();
    if (!stylesTxt) return datas;
    const doc = xml(stylesTxt);
    const custom = new Map(porTag(doc, 'numFmt').map((f) => [Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') || '']));
    const ehData = (id) => {
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
      const cod = (custom.get(id) || '').replace(/"[^"]*"|\[[^\]]*\]/g, '').toLowerCase();
      return /[dmy]/.test(cod) && !/0/.test(cod.replace(/[dmy]/g, ''));
    };
    const xfs = porTag(doc, 'cellXfs')[0];
    if (xfs) porTag(xfs, 'xf').forEach((xf, i) => { if (ehData(Number(xf.getAttribute('numFmtId') || 0))) datas.add(i); });
    return datas;
  }
  async function lerXlsx(buf) {
    const z = lerZip(buf);
    const wb = xml(await z.texto('xl/workbook.xml') || '');
    const aba = porTag(wb, 'sheet')[0];
    if (!aba) throw erro('A planilha não tem nenhuma aba.');
    const rid = aba.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || aba.getAttribute('r:id');
    let caminho = 'xl/worksheets/sheet1.xml';
    const rels = await z.texto('xl/_rels/workbook.xml.rels');
    if (rels) {
      const rel = porTag(xml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid);
      if (rel) {
        const alvo = rel.getAttribute('Target');
        caminho = alvo.startsWith('/') ? alvo.slice(1) : 'xl/' + alvo.replace(/^\.\//, '');
      }
    }
    const compartilhados = [];
    const ss = await z.texto('xl/sharedStrings.xml');
    if (ss) porTag(xml(ss), 'si').forEach((si) => compartilhados.push(porTag(si, 't').map((t) => t.textContent).join('')));
    const datas = estilosDeData(await z.texto('xl/styles.xml'));
    const sheet = xml(await z.texto(caminho) || '');
    const linhas = [];
    porTag(sheet, 'row').forEach((row, k) => {
      const num = Number(row.getAttribute('r')) || k + 1;
      const cel = [];
      porTag(row, 'c').forEach((c, j) => {
        const idx = c.getAttribute('r') ? coluna(c.getAttribute('r')) : j;
        const tipo = c.getAttribute('t');
        const vEl = porTag(c, 'v')[0];
        let valor = vEl ? vEl.textContent : '';
        if (tipo === 's') valor = compartilhados[Number(valor)] || '';
        else if (tipo === 'inlineStr') valor = porTag(c, 't').map((t) => t.textContent).join('');
        else if (tipo === 'b') valor = valor === '1' ? 'Sim' : 'Não';
        else if (valor !== '' && datas.has(Number(c.getAttribute('s') || 0)) && !Number.isNaN(Number(valor))) valor = dataExcel(valor);
        else if (valor !== '' && /^-?\d+(\.\d+)?(E[+-]?\d+)?$/i.test(valor)) {
          const n = Number(valor);
          valor = String(n); // CPF e telefone gravados como número voltam sem notação científica
        }
        cel[idx] = String(valor).trim();
      });
      linhas.push({ linha: num, celulas: Array.from(cel, (x) => x || '') });
    });
    return linhas;
  }

  /* ---------- CSV ---------- */
  function decodificar(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }
  function lerCsv(txt) {
    txt = txt.replace(/^﻿/, '');
    const primeira = txt.split(/\r?\n/).find((l) => l.trim()) || '';
    const conta = (ch) => primeira.split(ch).length - 1;
    const sep = [';', ',', '\t'].sort((a, b) => conta(b) - conta(a))[0];
    const linhas = [];
    let campo = '', atual = [], aspas = false, num = 1, ini = 1;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (aspas) {
        if (ch === '"' && txt[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') aspas = false; else { if (ch === '\n') num++; campo += ch; }
      } else if (ch === '"' && campo === '') aspas = true;
      else if (ch === sep) { atual.push(campo.trim()); campo = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && txt[i + 1] === '\n') i++;
        atual.push(campo.trim()); linhas.push({ linha: ini, celulas: atual }); atual = []; campo = ''; num++; ini = num;
      } else campo += ch;
    }
    if (campo !== '' || atual.length) { atual.push(campo.trim()); linhas.push({ linha: ini, celulas: atual }); }
    return linhas;
  }

  EG.lerPlanilha = async function (arquivo) {
    if (!arquivo) throw erro('Escolha um arquivo.');
    if (arquivo.size > 8 * 1024 * 1024) throw erro('Arquivo grande demais (máximo de 8 MB).');
    const nome = arquivo.name || 'planilha';
    const ext = nome.toLowerCase().split('.').pop();
    const buf = new Uint8Array(await arquivo.arrayBuffer());
    let linhas;
    if (ext === 'xlsx' || (buf[0] === 0x50 && buf[1] === 0x4b)) linhas = await lerXlsx(buf);
    else if (ext === 'xls') throw erro('Arquivo .xls (Excel antigo): abra no Excel e use "Salvar como" → Pasta de Trabalho do Excel (.xlsx) ou CSV.');
    else linhas = lerCsv(decodificar(buf));
    const cheias = linhas.filter((l) => l.celulas.some((c) => String(c || '').trim()));
    if (!cheias.length) throw erro('A planilha está vazia.');
    const [cab, ...dados] = cheias;
    if (!dados.length) throw erro('A planilha só tem o cabeçalho. Coloque um aluno por linha, abaixo dos títulos das colunas.');
    return { nome, cabecalho: cab.celulas.map((c) => String(c || '').trim()), linhas: dados };
  };
})(window.EG);
