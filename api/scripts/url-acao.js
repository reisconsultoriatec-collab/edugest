'use strict';
/* =====================================================================
 *  Liga ou desliga a página do EduGest (conta.html) nos links de e-mail
 *  do Firebase — o mesmo campo "URL de ação" do console, alterado pelo
 *  serviço oficial do Firebase (Identity Toolkit) com a chave do servidor.
 *
 *    cd ~/edugest-api
 *    node scripts/url-acao.js ver        mostra como está agora
 *    node scripts/url-acao.js ligar      links passam a abrir <site>/conta.html
 *    node scripts/url-acao.js desligar   volta ao que era antes de ligar
 *
 *  Segurança:
 *  - Altera só esse campo (updateMask); modelos, remetente e textos ficam.
 *  - Antes de ligar, guarda o valor atual em ~/.edugest-url-acao-anterior
 *    e confere se a página conta.html está no ar.
 *  - Se o Firebase recusar, mostra o motivo que ele devolveu.
 * ===================================================================== */
const path = require('path');
const fs = require('fs');
const os = require('os');

process.chdir(path.join(__dirname, '..')); // .env e chave do Firebase ficam na pasta da API
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const BACKUP = path.join(os.homedir(), '.edugest-url-acao-anterior');
const PAGINA = 'conta.html';

function siteBase() {
  const url = process.env.URL_PUBLICA || (process.env.CORS_ORIGINS || '').split(',')[0] || 'https://edugest.reisconsultoriatec.com';
  return url.trim().replace(/\/+$/, '');
}

function projeto() {
  const arquivo = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT || './firebase-service-account.json');
  return require(arquivo).project_id;
}

async function chamar(metodo, url, corpo) {
  const admin = require('../src/firebase');
  const { access_token: token } = await admin.app().options.credential.getAccessToken();
  const resp = await fetch(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const e = dados && dados.error ? dados.error : {};
    throw new Error(`O Firebase recusou (${resp.status} ${e.status || ''}): ${e.message || 'sem detalhes'}`);
  }
  return dados;
}

const urlConfig = (id) => `https://identitytoolkit.googleapis.com/admin/v2/projects/${id}/config`;

async function lerAtual(id) {
  const c = await chamar('GET', urlConfig(id));
  const envio = (c.notification && c.notification.sendEmail) || {};
  return { callbackUri: envio.callbackUri || '', modelo: envio.resetPasswordTemplate || {} };
}

async function gravar(id, valor) {
  await chamar('PATCH', `${urlConfig(id)}?updateMask=notification.sendEmail.callbackUri`,
    { notification: { sendEmail: { callbackUri: valor } } });
}

const descrever = (id, uri) => uri || `(padrão do Firebase: https://${id}.firebaseapp.com/__/auth/action)`;

async function paginaNoAr(url) {
  try {
    const r = await fetch(url, { redirect: 'follow' });
    const html = await r.text();
    return r.ok && html.includes('assets/js/conta.js');
  } catch (e) {
    return false;
  }
}

(async () => {
  const acao = process.argv[2];
  if (!['ver', 'ligar', 'desligar'].includes(acao)) {
    console.log('Uso: node scripts/url-acao.js ver | ligar | desligar');
    process.exit(1);
  }
  const id = projeto();
  const alvo = `${siteBase()}/${PAGINA}`;
  const atual = await lerAtual(id);

  if (acao === 'ver') {
    console.log(`Projeto:       ${id}`);
    console.log(`URL de ação:   ${descrever(id, atual.callbackUri)}`);
    if (atual.modelo.subject) console.log(`Assunto (nova senha): ${atual.modelo.subject}`);
    console.log(atual.callbackUri === alvo ? 'Situação:      LIGADO (página do EduGest)' : 'Situação:      desligado (página do Firebase)');
    if (fs.existsSync(BACKUP)) console.log(`Valor guardado para voltar: ${descrever(id, JSON.parse(fs.readFileSync(BACKUP, 'utf8')).callbackUri)}`);
    return;
  }

  if (acao === 'ligar') {
    if (atual.callbackUri === alvo) { console.log(`Já está ligado: ${alvo}`); return; }
    if (!(await paginaNoAr(alvo))) {
      console.error(`!! A página ${alvo} não respondeu como esperado.`);
      console.error('   Rode ~/atualizar-edugest.sh e confira se ela abre no navegador. Nada foi alterado.');
      process.exit(1);
    }
    fs.writeFileSync(BACKUP, JSON.stringify({ callbackUri: atual.callbackUri, salvoEm: new Date().toISOString() }, null, 2));
    console.log(`Valor anterior guardado em ${BACKUP}: ${descrever(id, atual.callbackUri)}`);
    await gravar(id, alvo);
    const depois = await lerAtual(id);
    console.log(depois.callbackUri === alvo ? `✓ Ligado. Os próximos e-mails abrem ${alvo}` : `!! O Firebase respondeu, mas o valor ficou: ${descrever(id, depois.callbackUri)}`);
    return;
  }

  // desligar
  let anterior = '';
  if (fs.existsSync(BACKUP)) anterior = JSON.parse(fs.readFileSync(BACKUP, 'utf8')).callbackUri || '';
  if (anterior === alvo) anterior = '';
  await gravar(id, anterior);
  const depois = await lerAtual(id);
  console.log(`✓ Desligado. URL de ação agora: ${descrever(id, depois.callbackUri)}`);
  console.log('  Os próximos e-mails voltam a abrir a página do Firebase. Não apague conta.html: links já enviados apontam para ela.');
})().catch((e) => {
  console.error('!! ' + e.message);
  process.exit(1);
});
