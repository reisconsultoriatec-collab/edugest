/* =====================================================================
 *  EduGest — importar alunos por planilha (Excel .xlsx ou CSV)
 *  1. Planilha  2. Colunas  3. Conferência  4. Pronto
 *  A planilha é lida no navegador (planilha.js); a API confere cada
 *  linha (simular) e só grava as linhas sem erro. Importações podem ser
 *  desfeitas enquanto os alunos não tiverem movimento.
 *  EG.importarAlunos(aoTerminar)
 * ===================================================================== */
'use strict';
(function (EG) {
  /* Campos do EduGest e os títulos de coluna que costumam aparecer nas planilhas das escolas */
  const CAMPOS = [
    ['nome', 'Nome do aluno', ['nome do aluno', 'nome', 'aluno', 'aluno a', 'nome completo', 'estudante', 'nome do estudante', 'nome aluno']],
    ['nascimento', 'Data de nascimento', ['data de nascimento', 'nascimento', 'data nascimento', 'dt nascimento', 'dt nasc', 'nasc', 'data de nasc']],
    ['turma', 'Turma', ['turma', 'classe', 'sala', 'serie turma', 'turma serie']],
    ['cpf', 'CPF do aluno', ['cpf do aluno', 'cpf aluno', 'cpf']],
    ['rg', 'RG do aluno', ['rg do aluno', 'rg', 'identidade']],
    ['ra', 'RA (se a escola já tiver)', ['ra', 'registro do aluno', 'numero de matricula', 'n matricula', 'matricula']],
    ['respNome', 'Nome do responsável', ['nome do responsavel', 'responsavel', 'responsavel financeiro', 'nome responsavel', 'responsavel legal']],
    ['respParentesco', 'Parentesco', ['parentesco', 'grau de parentesco', 'vinculo']],
    ['respCpf', 'CPF do responsável', ['cpf do responsavel', 'cpf responsavel', 'cpf resp', 'cpf do responsavel financeiro']],
    ['respTelefone', 'Telefone do responsável', ['telefone do responsavel', 'telefone', 'celular', 'whatsapp', 'fone', 'contato', 'telefone responsavel']],
    ['respEmail', 'E-mail do responsável', ['e mail do responsavel', 'email do responsavel', 'e mail', 'email']],
    ['endereco', 'Endereço', ['endereco', 'endereco completo', 'logradouro']],
    ['maeNome', 'Nome da mãe', ['nome da mae', 'mae', 'filiacao mae']],
    ['paiNome', 'Nome do pai', ['nome do pai', 'pai', 'filiacao pai']],
    ['naturalidade', 'Naturalidade (cidade)', ['naturalidade', 'cidade de nascimento', 'natural de']],
    ['naturalidadeUf', 'UF de nascimento', ['uf de nascimento', 'uf nascimento', 'uf', 'estado de nascimento']],
    ['nacionalidade', 'Nacionalidade', ['nacionalidade']],
    ['dataMatricula', 'Data de matrícula', ['data de matricula', 'data matricula', 'matriculado em']]
  ];
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const letra = (i) => { let s = ''; i += 1; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

  /** Liga cada campo a uma coluna: primeiro títulos iguais, depois títulos que contêm o nome. */
  function mapearAutomatico(cabecalho) {
    const cab = cabecalho.map(norm);
    const usado = new Set();
    const mapa = {};
    const tentar = (igual) => CAMPOS.forEach(([campo, , sin]) => {
      if (mapa[campo] !== undefined) return;
      for (const s of sin) {
        const i = cab.findIndex((c, k) => !usado.has(k) && c && (igual ? c === s : (` ${c} `).includes(` ${s} `)));
        if (i >= 0) { mapa[campo] = i; usado.add(i); return; }
      }
    });
    tentar(true);
    tentar(false);
    return mapa;
  }

  const SITUACAO = { ok: ['selo-ok', 'Pronta'], erro: ['selo-erro', 'Com erro'], duplicado: ['selo-aviso', 'Duplicada'] };

  EG.importarAlunos = function (aoTerminar) {
    const ano = EG.estado.colegio.config.anoLetivo;
    let planilha = null, mapa = {}, conferencia = null, filtroConf = '', importou = false;
    const m = EG.modal({
      titulo: 'Importar alunos por planilha',
      largura: 900,
      corpo: '<div data-imp></div>',
      botoes: [],
      aoFechar: () => { if (importou && aoTerminar) aoTerminar(); }
    });
    m.el.querySelector('.modal-rodape').hidden = true;
    const area = m.el.querySelector('[data-imp]');
    const passos = (n) => `<ol class="imp-passos">${['Planilha', 'Colunas', 'Conferência', 'Pronto'].map((p, i) =>
      `<li class="${i + 1 === n ? 'atual' : i + 1 < n ? 'feito' : ''}"><span>${i + 1 < n ? '<i class="ti ti-check"></i>' : i + 1}</span> ${p}</li>`).join('')}</ol>`;
    const rodape = (botoes) => `<div class="imp-rodape">${botoes}</div>`;

    /* ---------- 1. Planilha ---------- */
    async function passo1() {
      m.erro('');
      area.innerHTML = `${passos(1)}
        <label class="zona-arquivo" data-zona>
          <i class="ti ti-file-spreadsheet"></i>
          <strong>Escolha a planilha (Excel .xlsx ou CSV)</strong>
          <small>ou arraste o arquivo para cá</small>
          <input type="file" accept=".xlsx,.csv,.txt" hidden data-arquivo>
        </label>
        <div class="msg-info" style="margin-top:14px">
          Um aluno por linha, com os títulos das colunas na primeira linha. Só o <strong>nome</strong> é obrigatório.
          A <strong>turma</strong> precisa estar escrita igual ao nome cadastrado em Turmas e Séries (${ano}). Datas no formato DD/MM/AAAA.
          O RA e o código de acesso dos responsáveis são gerados pelo EduGest.
        </div>
        <button class="link-sutil" data-imp-acao="modelo"><i class="ti ti-download"></i> Baixar planilha modelo</button>
        <div data-historico></div>
        ${rodape('<button class="btn btn-secundario" data-imp-acao="fechar">Fechar</button>')}`;
      const zona = area.querySelector('[data-zona]');
      const input = area.querySelector('[data-arquivo]');
      input.addEventListener('change', () => abrir(input.files[0]));
      zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('sobre'); });
      zona.addEventListener('dragleave', () => zona.classList.remove('sobre'));
      zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('sobre'); abrir(e.dataTransfer.files[0]); });
      historico();
    }
    async function historico() {
      const caixa = area.querySelector('[data-historico]');
      if (!caixa) return;
      let lista = [];
      try { lista = await EG.api('GET', '/alunos/importacoes'); } catch (e) { return; }
      if (!lista.length || !area.contains(caixa)) return;
      caixa.innerHTML = `<div class="rotulo" style="margin:18px 0 8px">Importações anteriores</div>
        <div class="imp-historico">${lista.slice(0, 5).map((i) => `<div class="imp-hist-item">
          <div><strong>${EG.esc(i.arquivo || 'Planilha')}</strong> <span class="sub">${i.total} aluno(s), ${EG.dataHora(i.feitaEm)}${i.por ? ` por ${EG.esc(i.por)}` : ''}</span>
            ${i.desfeitaEm ? `<br><small>Desfeita em ${EG.dataHora(i.desfeitaEm)}</small>` : i.bloqueio ? `<br><small title="Desfazer não está disponível">Não dá para desfazer: ${EG.esc(i.bloqueio)}</small>` : ''}</div>
          ${i.podeDesfazer ? `<button class="btn btn-secundario btn-pequeno" data-imp-acao="desfazer" data-id="${i.id}" data-total="${i.restantes}"><i class="ti ti-arrow-back-up"></i> Desfazer</button>` : ''}
        </div>`).join('')}</div>`;
    }
    async function abrir(arquivo) {
      if (!arquivo) return;
      m.erro('');
      const zona = area.querySelector('[data-zona]');
      zona.classList.add('lendo');
      zona.querySelector('strong').textContent = 'Lendo a planilha...';
      try {
        planilha = await EG.lerPlanilha(arquivo);
        mapa = mapearAutomatico(planilha.cabecalho);
        passo2();
      } catch (e) {
        m.erro(e.message);
        zona.classList.remove('lendo');
        zona.querySelector('strong').textContent = 'Escolha a planilha (Excel .xlsx ou CSV)';
      }
    }

    /* ---------- 2. Colunas ---------- */
    function exemplo(i) {
      if (i === undefined || i === '') return '';
      const l = planilha.linhas.find((x) => String(x.celulas[i] || '').trim());
      const v = l ? String(l.celulas[i]) : '';
      return v.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1'); // data do Excel no formato daqui
    }
    function passo2() {
      m.erro('');
      const opcoes = (sel) => `<option value="">— não importar —</option>` + planilha.cabecalho.map((c, i) =>
        `<option value="${i}" ${String(sel) === String(i) ? 'selected' : ''}>${letra(i)}: ${EG.esc(c || '(sem título)')}</option>`).join('');
      const ligadas = new Set(Object.values(mapa).map(Number));
      const soltas = planilha.cabecalho.map((c, i) => [c, i]).filter(([c, i]) => c && !ligadas.has(i)).map(([c]) => c);
      area.innerHTML = `${passos(2)}
        <p class="card-desc" style="margin:0 0 12px">Arquivo <strong>${EG.esc(planilha.nome)}</strong> com ${planilha.linhas.length} linha(s). Confira em qual coluna está cada informação.</p>
        <div class="tabela-wrap"><table class="imp-mapa">
          <thead><tr><th>No EduGest</th><th>Coluna da planilha</th><th>Exemplo da planilha</th></tr></thead>
          <tbody>${CAMPOS.map(([campo, rot]) => `<tr>
            <td>${EG.esc(rot)}${campo === 'nome' ? ' <span class="texto-erro">*</span>' : ''}</td>
            <td><select class="select" data-mapa="${campo}">${opcoes(mapa[campo])}</select></td>
            <td class="sub" data-exemplo="${campo}">${EG.esc(exemplo(mapa[campo]))}</td></tr>`).join('')}</tbody>
        </table></div>
        ${soltas.length ? `<p class="sub" style="margin-top:10px">Colunas que ficam de fora: ${soltas.map(EG.esc).join(', ')}.</p>` : ''}
        ${rodape(`<button class="btn btn-secundario" data-imp-acao="voltar1"><i class="ti ti-arrow-left"></i> Outra planilha</button>
          <button class="btn btn-primario" data-imp-acao="conferir"><i class="ti ti-list-check"></i> Conferir ${planilha.linhas.length} linha(s)</button>`)}`;
      area.querySelectorAll('[data-mapa]').forEach((s) => s.addEventListener('change', () => {
        const campo = s.dataset.mapa;
        if (s.value === '') delete mapa[campo]; else mapa[campo] = Number(s.value);
        area.querySelector(`[data-exemplo="${campo}"]`).textContent = exemplo(mapa[campo]);
      }));
    }
    function linhasParaApi() {
      return planilha.linhas.map((l) => {
        const o = { linha: l.linha };
        CAMPOS.forEach(([campo]) => { if (mapa[campo] !== undefined) o[campo] = String(l.celulas[mapa[campo]] || '').trim(); });
        return o;
      });
    }

    /* ---------- 3. Conferência ---------- */
    async function conferir(btn) {
      if (mapa.nome === undefined) { m.erro('Escolha a coluna com o nome do aluno.'); return; }
      m.erro('');
      await EG.guarda(btn, async () => {
        try {
          conferencia = await EG.api('POST', '/alunos/importar', { simular: true, linhas: linhasParaApi() });
          filtroConf = conferencia.erros || conferencia.duplicados ? 'problema' : '';
          passo3();
        } catch (e) { m.erro(e.message); }
      });
    }
    function passo3() {
      const c = conferencia;
      const lista = c.linhas.filter((l) => !filtroConf || (filtroConf === 'problema' ? l.situacao !== 'ok' : l.situacao === filtroConf));
      area.innerHTML = `${passos(3)}
        <div class="imp-resumo">
          <div class="imp-num ok"><strong>${c.ok}</strong><span>prontas para importar</span></div>
          <div class="imp-num aviso"><strong>${c.duplicados}</strong><span>já cadastradas ou repetidas</span></div>
          <div class="imp-num erro"><strong>${c.erros}</strong><span>com erro</span></div>
        </div>
        ${c.erros || c.duplicados ? '<p class="sub" style="margin:4px 0 12px">As linhas com erro e as duplicadas ficam de fora. Se quiser, corrija a planilha e importe de novo depois: o que já entrou é reconhecido como duplicado.</p>' : ''}
        <div class="filtros">${[['', 'Todas'], ['problema', 'Com problema'], ['ok', 'Prontas']].map(([k, r]) =>
          `<button class="chip ${filtroConf === k ? 'ativo' : ''}" data-imp-acao="filtro" data-filtro-conf="${k}">${r}</button>`).join('')}</div>
        <div class="tabela-wrap imp-lista"><table>
          <thead><tr><th class="num">Linha</th><th>Aluno</th><th>Turma</th><th>Situação</th></tr></thead>
          <tbody>${lista.slice(0, 500).map((l) => `<tr>
            <td class="num">${l.linha}</td><td>${EG.esc(l.nome || '—')}</td><td>${EG.esc(l.turma || '—')}</td>
            <td><span class="selo ${SITUACAO[l.situacao][0]}">${SITUACAO[l.situacao][1]}</span>${l.mensagens.length ? `<br><small>${l.mensagens.map(EG.esc).join('<br>')}</small>` : ''}</td>
          </tr>`).join('') || '<tr><td colspan="4"><div class="vazio">Nada neste filtro</div></td></tr>'}</tbody>
        </table></div>
        ${lista.length > 500 ? `<p class="sub">Mostrando 500 de ${lista.length} linhas.</p>` : ''}
        ${rodape(`<button class="btn btn-secundario" data-imp-acao="voltar2"><i class="ti ti-arrow-left"></i> Colunas</button>
          ${c.erros || c.duplicados ? '<button class="btn btn-secundario" data-imp-acao="baixar-conferencia"><i class="ti ti-file-spreadsheet"></i> Baixar a conferência</button>' : ''}
          <button class="btn btn-primario" data-imp-acao="importar" ${c.ok ? '' : 'disabled'}><i class="ti ti-upload"></i> Importar ${c.ok} aluno(s)</button>`)}`;
    }

    /* ---------- 4. Pronto ---------- */
    let resultado = null;
    async function importar(btn) {
      m.erro('');
      await EG.guarda(btn, async () => {
        try {
          resultado = await EG.api('POST', '/alunos/importar', { arquivo: planilha.nome, linhas: linhasParaApi() });
          importou = true;
          passo4();
        } catch (e) { m.erro(e.message); }
      });
    }
    function passo4() {
      const r = resultado;
      area.innerHTML = `${passos(4)}
        <div class="auth-status" style="padding:10px 0 4px">
          <div class="icone-grande" style="background:var(--ok-bg);color:var(--ok)"><i class="ti ti-users-plus"></i></div>
          <h3>${r.importados} aluno(s) cadastrado(s)</h3>
          <p>${r.ignoradas.length ? `${r.ignoradas.length} linha(s) ficaram de fora (com erro ou já cadastradas).` : 'Todas as linhas da planilha entraram.'}
            Cada aluno recebeu RA e código de acesso para o portal do responsável.</p>
        </div>
        <div class="msg-info">Baixe a lista com os códigos para entregar às famílias. Se algo não saiu como esperado, a importação pode ser desfeita
          (em Alunos › Importar planilha) enquanto os alunos não tiverem mensalidades, notas ou chamada.</div>
        ${rodape(`<button class="btn btn-secundario" data-imp-acao="baixar-codigos"><i class="ti ti-download"></i> Baixar lista com RA e códigos</button>
          <button class="btn btn-primario" data-imp-acao="fechar"><i class="ti ti-check"></i> Concluir</button>`)}`;
    }

    area.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-imp-acao]');
      if (!b) return;
      const acao = b.dataset.impAcao;
      if (acao === 'fechar') m.fechar();
      else if (acao === 'modelo') {
        EG.baixarCsv('modelo-importacao-alunos.csv', CAMPOS.map(([, rot]) => rot),
          [['Ana Clara Souza', '10/05/2016', `4º Ano A`, '', '', '', 'Maria Souza', 'Mãe', '', '(11) 98765-4321', 'maria@email.com', 'Rua das Flores, 100', 'Maria Souza', 'João Souza', 'Itapevi', 'SP', 'Brasileira', '01/02/' + ano]]);
      } else if (acao === 'desfazer') {
        if (!(await EG.confirmar(`Apagar os ${b.dataset.total} aluno(s) cadastrados por esta importação?\n\nUse quando a planilha entrou errada. Os outros alunos não são afetados.`,
          { titulo: 'Desfazer importação', textoOk: 'Desfazer importação', perigo: true }))) return;
        await EG.guarda(b, async () => {
          try {
            const r = await EG.api('POST', `/alunos/importacoes/${b.dataset.id}/desfazer`);
            EG.toast(`Importação desfeita: ${r.removidos} cadastro(s) removido(s)`);
            importou = true;
            historico();
          } catch (e) { m.erro(e.message); }
        });
      } else if (acao === 'voltar1') { planilha = null; passo1(); }
      else if (acao === 'voltar2') passo2();
      else if (acao === 'conferir') conferir(b);
      else if (acao === 'filtro') { filtroConf = b.dataset.filtroConf; passo3(); }
      else if (acao === 'baixar-conferencia') {
        EG.baixarCsv(`conferencia-${planilha.nome.replace(/\.\w+$/, '')}.csv`, ['Linha', 'Aluno', 'Turma', 'Situação', 'Detalhes'],
          conferencia.linhas.map((l) => [l.linha, l.nome, l.turma || '', SITUACAO[l.situacao][1], l.mensagens.join('; ')]));
      } else if (acao === 'importar') importar(b);
      else if (acao === 'baixar-codigos') {
        EG.baixarCsv(`codigos-de-acesso-${EG.hojeSP()}.csv`, ['Aluno', 'RA', 'Turma', 'Responsável', 'Telefone', 'Código de acesso'],
          resultado.alunos.map((a) => [a.nome, a.ra, a.turma || '', a.respNome || '', a.respTelefone || '', a.codigoAcesso]));
      }
    });
    passo1();
  };
})(window.EG);
