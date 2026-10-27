/* =====================================================================
 *  EduGest — Configurações do colégio  [admin]
 *  Dados cadastrais · Logotipo e documentos oficiais · Parâmetros ·
 *  Cobrança e PIX · Disciplinas · Convite
 * ===================================================================== */
'use strict';
(function (EG) {
  async function recarregarColegio() {
    EG.estado.colegio = await EG.api('GET', '/colegios/atual');
    return EG.estado.colegio;
  }

  function opcoesTimeout(atual) {
    const ops = [[5, '5 minutos'], [10, '10 minutos'], [15, '15 minutos'], [30, '30 minutos'], [60, '60 minutos'], [120, '2 horas'], [0, 'Desativado']];
    if (!ops.some(([v]) => v === atual)) ops.unshift([atual, atual + ' minutos']);
    return ops.map(([v, t]) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${t}</option>`).join('');
  }

  const TIPOS_PIX = [['', 'Sem PIX nas cobranças'], ['cnpj', 'CNPJ'], ['cpf', 'CPF'], ['celular', 'Celular'], ['email', 'E-mail'], ['aleatoria', 'Chave aleatória']];
  const EXEMPLO_PIX = { cnpj: '00.000.000/0000-00', cpf: '000.000.000-00', celular: '(11) 99999-9999', email: 'financeiro@colegio.com.br', aleatoria: '123e4567-e89b-12d3-a456-426614174000', '': '' };

  function blocoCobranca(c) {
    const b = c.cobranca || {};
    const dias = [7, 15, 30, 60, 90];
    if (!dias.includes(b.linkValidadeDias)) dias.push(b.linkValidadeDias);
    return `
      <div class="card" data-bloco="cobranca">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-qrcode"></i> Cobrança e PIX</div></div>
        <p class="card-desc">Os PDFs de mensalidade, carnê e lote saem com QR Code PIX e "copia e cola" desta chave, já com o valor de cada parcela. O dinheiro cai direto na conta do colégio; a baixa continua pelo botão <strong>Receber</strong>.</p>
        <div class="linha-2">
          <div class="campo"><label>Tipo da chave PIX</label><select class="select" name="pixTipo" data-pix-tipo>${TIPOS_PIX.map(([v, r]) => `<option value="${v}" ${(b.pixTipo || '') === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
          <div class="campo"><label>Chave PIX</label><input class="input" name="pixChave" maxlength="80" autocomplete="off" value="${EG.esc(b.pixChave)}" placeholder="${EG.esc(EXEMPLO_PIX[b.pixTipo || ''])}" ${b.pixTipo ? '' : 'disabled'}></div>
        </div>
        <div class="linha-2">
          <div class="campo"><label>Nome do beneficiário</label><input class="input" name="pixBeneficiario" maxlength="60" value="${EG.esc(b.pixBeneficiario)}" placeholder="${EG.esc(c.nome)}">
            <small>Nome que aparece no QR Code. Em branco, usa o nome do colégio.</small></div>
          <div class="campo"><label>Cidade</label><input class="input" name="cidade" maxlength="60" value="${EG.esc(b.cidade)}" placeholder="Ex.: Itapevi">
            <small>Obrigatória no PIX; também aparece na data dos recibos.</small></div>
        </div>
        <div class="campo"><label>Instruções impressas nas cobranças</label>
          <textarea class="textarea" name="instrucoes" maxlength="300" rows="2" placeholder="Ex.: Após o vencimento, multa de 2% e juros de 1% ao mês.">${EG.esc(b.instrucoes)}</textarea></div>
        <div class="campo" style="max-width:320px"><label>Validade dos links enviados por WhatsApp</label>
          <select class="select" name="linkValidadeDias">${dias.map((d) => `<option value="${d}" ${d === b.linkValidadeDias ? 'selected' : ''}>${d} dias</option>`).join('')}</select>
          <small>Depois disso, o link deixa de abrir e é preciso enviar outro.</small></div>
        <div class="msg-aviso">Antes de mandar cobranças, gere o <strong>PDF de teste</strong> e leia o QR Code com o app do seu banco: confira se aparece o nome do colégio e o valor de R$ 1,00. Não precisa concluir o pagamento.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primario" data-action="salvar-cobranca"><i class="ti ti-device-floppy"></i> Salvar cobrança</button>
          <button class="btn btn-secundario" data-action="teste-pix" ${b.pixConfigurado ? '' : 'disabled title="Salve a chave PIX primeiro"'}><i class="ti ti-file-type-pdf"></i> PDF de teste (R$ 1,00)</button>
        </div>
      </div>`;
  }

  /* ---------- Logotipo e documentos oficiais ---------- */
  /** Arquivo escolhido → JPEG reduzido (até 600 × 300), fundo branco no lugar do transparente. */
  async function prepararLogo(arquivo) {
    if (!/^image\/(png|jpeg|webp)$/.test(arquivo.type)) throw EG.erro('Use uma imagem PNG, JPG ou WEBP');
    if (arquivo.size > 8 * 1024 * 1024) throw EG.erro('Imagem muito grande (máximo 8 MB)');
    const url = URL.createObjectURL(arquivo);
    try {
      const im = await new Promise((ok, falha) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => falha(EG.erro('Não foi possível ler esta imagem'));
        i.src = url;
      });
      const k = Math.min(1, 600 / im.naturalWidth, 300 / im.naturalHeight);
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(im.naturalWidth * k));
      cv.height = Math.max(1, Math.round(im.naturalHeight * k));
      const cx = cv.getContext('2d');
      cx.fillStyle = '#ffffff';
      cx.fillRect(0, 0, cv.width, cv.height);
      cx.drawImage(im, 0, 0, cv.width, cv.height);
      let dados = cv.toDataURL('image/jpeg', 0.92);
      if (dados.length > 500000) dados = cv.toDataURL('image/jpeg', 0.75);
      return dados;
    } finally { URL.revokeObjectURL(url); }
  }

  async function carregarBlocoDocumentos(el) {
    const bloco = el.querySelector('[data-bloco="documentos"]');
    if (!bloco) return;
    const [c, logo] = await Promise.all([
      EG.api('GET', '/secretaria/cabecalho'),
      EG.api('GET', '/secretaria/logo').catch(() => null)
    ]);
    const v = (x) => `value="${EG.esc(x)}"`;
    bloco.innerHTML = `
      <div class="card-cab"><div class="card-titulo"><i class="ti ti-certificate"></i> Logotipo e documentos oficiais</div></div>
      <p class="card-desc">Saem no cabeçalho e nas assinaturas das declarações e do histórico escolar (menu <strong>Documentos</strong>). O logotipo aparece também nas cobranças, recibos e carnês.</p>
      <div class="logo-box">
        <div class="logo-previa" data-logo-previa>${logo ? `<img src="${logo.imagem}" alt="Logotipo do colégio">` : '<span><i class="ti ti-photo"></i>Sem logotipo</span>'}</div>
        <div>
          <input type="file" accept="image/png,image/jpeg,image/webp" data-logo-arquivo hidden>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-secundario" data-action="logo-enviar"><i class="ti ti-upload"></i> ${logo ? 'Trocar logotipo' : 'Enviar logotipo'}</button>
            ${logo ? '<button class="btn btn-secundario" data-action="logo-remover"><i class="ti ti-trash"></i> Remover</button>' : ''}
          </div>
          <small class="sub" style="display:block;margin-top:6px">PNG, JPG ou WEBP. A imagem é reduzida automaticamente; fundo transparente fica branco. Prefira o logotipo na horizontal ou quadrado.</small>
        </div>
      </div>
      <div class="linha-2">
        <div class="campo"><label>Código INEP</label><input class="input" name="inep" maxlength="8" inputmode="numeric" ${v(c.inep)} placeholder="8 números"></div>
        <div class="campo"><label>UF do colégio</label><select class="select" name="uf"><option value="">—</option>${EG.UFS.map((u) => `<option ${c.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      </div>
      <div class="campo"><label>Ato de autorização / credenciamento</label>
        <textarea class="textarea" name="atoAutorizacao" rows="2" maxlength="300" placeholder="Ex.: Portaria da Diretoria de Ensino de 12/03/2010, publicada no DOE de 13/03/2010">${EG.esc(c.atoAutorizacao)}</textarea></div>
      <div class="linha-2">
        <div class="campo"><label>Diretor(a)</label><input class="input" name="diretorNome" maxlength="100" ${v(c.diretorNome)}></div>
        <div class="campo"><label>Registro do(a) diretor(a)</label><input class="input" name="diretorRegistro" maxlength="40" ${v(c.diretorRegistro)} placeholder="Ex.: RG 12.345.678-9"></div>
      </div>
      <div class="linha-2">
        <div class="campo"><label>Secretário(a) escolar</label><input class="input" name="secretarioNome" maxlength="100" ${v(c.secretarioNome)}></div>
        <div class="campo"><label>Registro do(a) secretário(a)</label><input class="input" name="secretarioRegistro" maxlength="40" ${v(c.secretarioRegistro)} placeholder="Ex.: RG 98.765.432-1"></div>
      </div>
      <p class="sub" style="margin:-2px 0 12px">A cidade que sai na data dos documentos é a do bloco <strong>Cobrança e PIX</strong>${c.cidade ? ` (hoje: ${EG.esc(c.cidade)})` : ' — ainda não preenchida'}.</p>
      <button class="btn btn-primario" data-action="salvar-documentos"><i class="ti ti-device-floppy"></i> Salvar dados dos documentos</button>`;
  }

  function render(el, c) {
    const cfg = c.config;
    el.innerHTML = `
      <div class="card" data-bloco="dados">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-building"></i> Dados do colégio</div></div>
        <div class="linha-2">
          <div class="campo"><label>Nome do colégio *</label><input class="input" name="nome" maxlength="120" value="${EG.esc(c.nome)}"></div>
          <div class="campo"><label>CNPJ</label><input class="input" name="cnpj" data-mascara="cnpj" maxlength="18" autocomplete="off" value="${EG.esc(c.cnpj)}"></div>
        </div>
        <div class="linha-2">
          <div class="campo"><label>Telefone</label><input class="input" name="telefone" data-mascara="telefone" maxlength="15" value="${EG.esc(c.telefone)}"></div>
          <div class="campo"><label>E-mail</label><input class="input" type="email" name="email" maxlength="160" value="${EG.esc(c.email)}"></div>
        </div>
        <div class="campo"><label>Endereço</label><input class="input" name="endereco" maxlength="200" value="${EG.esc(c.endereco)}"></div>
        <div class="campo"><label><i class="ti ti-brand-whatsapp" style="color:#25D366"></i> WhatsApp para avisos de novos cadastros</label>
          <input class="input" name="whatsappNotif" data-mascara="telefone" maxlength="15" value="${EG.esc(c.whatsappNotif)}" style="max-width:240px">
          <small>Quem se cadastrar pelo código do colégio poderá avisar este número para pedir aprovação.</small></div>
        <button class="btn btn-primario" data-action="salvar-dados"><i class="ti ti-device-floppy"></i> Salvar dados</button>
      </div>

      <div class="card" data-bloco="documentos"><div class="vazio"><div class="spinner pequeno" style="margin:0 auto"></div></div></div>

      <div class="card" data-bloco="config">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-adjustments"></i> Parâmetros</div></div>
        <div class="linha-3">
          <div class="campo"><label>Ano letivo</label><input class="input" type="number" name="anoLetivo" min="2000" max="2100" value="${EG.esc(cfg.anoLetivo)}"></div>
          <div class="campo"><label>Mensalidade padrão (R$)</label><input class="input" type="number" name="valorMensalidade" min="0" step="0.01" value="${EG.esc(cfg.valorMensalidade)}"></div>
          <div class="campo"><label>Dia de vencimento</label><input class="input" type="number" name="diaVencimento" min="1" max="28" value="${EG.esc(cfg.diaVencimento)}"></div>
        </div>
        <div class="linha-3">
          <div class="campo"><label>Média para aprovação</label><input class="input" type="number" name="mediaAprovacao" min="0" max="10" step="0.1" value="${EG.esc(cfg.mediaAprovacao)}"></div>
          <div class="campo"><label>Frequência mínima (%)</label><input class="input" type="number" name="frequenciaMinima" min="0" max="100" value="${EG.esc(cfg.frequenciaMinima)}"></div>
          <div class="campo"><label>Encerrar sessão inativa após</label><select class="select" name="timeoutSessaoMin">${opcoesTimeout(cfg.timeoutSessaoMin)}</select></div>
        </div>
        <button class="btn btn-primario" data-action="salvar-config"><i class="ti ti-device-floppy"></i> Salvar parâmetros</button>
      </div>
      ${blocoCobranca(c)}

      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-book"></i> Disciplinas</div></div>
        <p class="card-desc">Disciplina com notas lançadas não pode ser excluída — desative para tirá-la das listas.</p>
        <div id="listaDisciplinas">${c.disciplinas.map(linhaDisciplina).join('') || '<div class="vazio">Nenhuma disciplina</div>'}</div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <input class="input" id="novaDisciplina" maxlength="60" placeholder="Nova disciplina" style="max-width:300px">
          <button class="btn btn-secundario" data-action="add-disciplina"><i class="ti ti-plus"></i> Adicionar</button>
        </div>
      </div>

      <div class="card">
        <div class="card-cab"><div class="card-titulo"><i class="ti ti-key"></i> Código do colégio</div></div>
        <p class="card-desc">Compartilhe com a equipe para que se cadastrem no colégio. Cada cadastro precisa da sua aprovação em <strong>Usuários</strong>.</p>
        <div class="codigo-box">
          <code id="codigoConvite">${EG.esc(c.codigoConvite)}</code>
          <button class="btn btn-secundario btn-pequeno" data-action="copiar-convite"><i class="ti ti-copy"></i> Copiar</button>
          <button class="btn btn-secundario btn-pequeno" data-action="regenerar-convite"><i class="ti ti-refresh"></i> Gerar novo</button>
        </div>
      </div>`;
    carregarBlocoDocumentos(el).catch((e) => {
      const b = el.querySelector('[data-bloco="documentos"]');
      if (b) b.innerHTML = `<div class="msg-erro">Não foi possível carregar o logotipo e os dados dos documentos: ${EG.esc(e.message)}</div>`;
    });
  }

  function linhaDisciplina(d) {
    return `<div class="disciplina-linha ${d.ativo ? '' : 'inativa'}" data-id="${d.id}">
      <i class="ti ti-grip-vertical" style="color:var(--muted)"></i>
      <input class="input" value="${EG.esc(d.nome)}" maxlength="60" data-nome-original="${EG.esc(d.nome)}">
      ${d.ativo ? '' : '<span class="selo selo-neutro">inativa</span>'}
      <button class="btn-icone" data-action="renomear-disciplina" title="Salvar nome"><i class="ti ti-check"></i></button>
      <button class="btn-icone" data-action="alternar-disciplina" data-ativo="${d.ativo ? 1 : 0}" title="${d.ativo ? 'Desativar' : 'Reativar'}">
        <i class="ti ${d.ativo ? 'ti-eye-off' : 'ti-eye'}"></i></button>
      <button class="btn-icone perigo" data-action="excluir-disciplina" title="Excluir"><i class="ti ti-trash"></i></button>
    </div>`;
  }

  async function aoClicar(ev, el) {
    const b = ev.target.closest('[data-action]');
    if (!b || !el.contains(b)) return;
    const acao = b.dataset.action;
    const linha = b.closest('.disciplina-linha');
    const idDisc = linha ? Number(linha.dataset.id) : null;

    await EG.guarda(b, async () => {
      try {
        if (acao === 'salvar-dados') {
          await EG.api('PUT', '/colegios/atual', EG.lerForm(b.closest('[data-bloco]')));
          const c = await recarregarColegio();
          // Atualiza o nome no seletor
          const item = (EG.estado.me.colegios || []).find((x) => x.id === EG.estado.colegioId);
          if (item) { item.nome = c.nome; const o = EG.$(`#seletorColegio option[value="${c.id}"]`); if (o) o.textContent = c.nome; }
          EG.toast('Dados do colégio salvos');
        } else if (acao === 'salvar-config') {
          const d = EG.lerForm(b.closest('[data-bloco]'));
          await EG.api('PUT', '/colegios/atual/config', d);
          const c = await recarregarColegio();
          EG.iniciarSessao(c.config.timeoutSessaoMin);
          EG.toast('Parâmetros salvos');
        } else if (acao === 'salvar-cobranca') {
          const d = EG.lerForm(b.closest('[data-bloco]'));
          await EG.api('PUT', '/colegios/atual/cobranca', d);
          render(el, await recarregarColegio());
          EG.toast(d.pixTipo ? 'Cobrança salva. Gere o PDF de teste para conferir o QR Code.' : 'Cobrança salva (sem PIX)');
        } else if (acao === 'salvar-documentos') {
          const r = await EG.api('PUT', '/secretaria/cabecalho', EG.lerForm(b.closest('[data-bloco]')));
          await carregarBlocoDocumentos(el);
          EG.toast(r.pendencias.length ? `Salvo. Ainda falta: ${r.pendencias.join(', ')}` : 'Dados dos documentos salvos');
        } else if (acao === 'logo-enviar') {
          EG.$('[data-logo-arquivo]', el).click();
        } else if (acao === 'logo-remover') {
          if (!(await EG.confirmar('Remover o logotipo? Os PDFs passam a sair sem ele.', { perigo: true, textoOk: 'Remover' }))) return;
          await EG.api('DELETE', '/secretaria/logo');
          await carregarBlocoDocumentos(el);
          EG.toast('Logotipo removido');
        } else if (acao === 'teste-pix') {
          await EG.abrirDocumento({ tipo: 'teste' });
        } else if (acao === 'add-disciplina') {
          const inp = EG.$('#novaDisciplina');
          if (!inp.value.trim()) { inp.focus(); return; }
          await EG.api('POST', '/colegios/atual/disciplinas', { nome: inp.value.trim() });
          render(el, await recarregarColegio());
          EG.toast('Disciplina adicionada');
        } else if (acao === 'renomear-disciplina') {
          const inp = linha.querySelector('input');
          if (inp.value.trim() === inp.dataset.nomeOriginal) return;
          await EG.api('PUT', `/colegios/atual/disciplinas/${idDisc}`, { nome: inp.value.trim() });
          render(el, await recarregarColegio());
          EG.toast('Disciplina renomeada');
        } else if (acao === 'alternar-disciplina') {
          await EG.api('PUT', `/colegios/atual/disciplinas/${idDisc}`, { ativo: b.dataset.ativo !== '1' });
          render(el, await recarregarColegio());
        } else if (acao === 'excluir-disciplina') {
          const nome = linha.querySelector('input').dataset.nomeOriginal;
          if (!(await EG.confirmar(`Excluir a disciplina "${nome}"?`, { perigo: true, textoOk: 'Excluir' }))) return;
          await EG.api('DELETE', `/colegios/atual/disciplinas/${idDisc}`);
          render(el, await recarregarColegio());
          EG.toast('Disciplina excluída');
        } else if (acao === 'copiar-convite') {
          EG.copiar(EG.estado.colegio.codigoConvite, 'Código copiado!');
        } else if (acao === 'regenerar-convite') {
          const ok = await EG.confirmar('Gerar um novo código?\n\nO código atual deixa de funcionar imediatamente. Quem ainda não se cadastrou vai precisar do código novo.', { textoOk: 'Gerar novo código' });
          if (!ok) return;
          const r = await EG.api('POST', '/colegios/atual/convite/regenerar');
          EG.estado.colegio.codigoConvite = r.codigoConvite;
          EG.$('#codigoConvite').textContent = r.codigoConvite;
          EG.toast('Novo código gerado');
        }
      } catch (e) {
        EG.toast(e.message, 'erro');
      }
    });
  }

  EG.registrarModulo('config', {
    async render(el) {
      render(el, await recarregarColegio());
      el.onclick = (ev) => aoClicar(ev, el);
      el.onchange = async (ev) => {
        if (ev.target.matches('[data-logo-arquivo]')) {
          const arq = ev.target.files && ev.target.files[0];
          ev.target.value = '';
          if (!arq) return;
          const btn = EG.$('[data-action="logo-enviar"]', el);
          await EG.guarda(btn, async () => {
            try {
              const imagem = await prepararLogo(arq);
              await EG.api('PUT', '/secretaria/logo', { imagem });
              await carregarBlocoDocumentos(el);
              EG.toast('Logotipo salvo. Ele já sai nos documentos e nas cobranças.');
            } catch (e) { EG.toast(e.message, 'erro'); }
          });
          return;
        }
        if (!ev.target.matches('[data-pix-tipo]')) return;
        const chave = EG.$('[name="pixChave"]', el);
        chave.disabled = !ev.target.value;
        chave.placeholder = EXEMPLO_PIX[ev.target.value] || '';
        if (!ev.target.value) chave.value = '';
      };
      el.onkeydown = (ev) => {
        if (ev.key === 'Enter' && ev.target.id === 'novaDisciplina') EG.$('[data-action="add-disciplina"]', el).click();
      };
    }
  });
})(window.EG);
