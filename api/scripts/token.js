'use strict';
/* =====================================================================
 *  Gera um token do Firebase para testar a API pelo terminal.
 *
 *  Entrar:        node scripts/token.js email senha
 *  Criar conta:   node scripts/token.js email senha criar
 *
 *  Precisa de FIREBASE_WEB_API_KEY no .env (é a apiKey pública que
 *  o front usa no firebaseConfig). O token vale por 1 hora.
 * ===================================================================== */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

(async () => {
  const [email, senha, acao] = process.argv.slice(2);
  const chave = process.env.FIREBASE_WEB_API_KEY;
  if (!email || !senha) {
    console.error('Uso: node scripts/token.js <email> <senha> [criar]');
    process.exit(1);
  }
  if (!chave) {
    console.error('Falta FIREBASE_WEB_API_KEY no .env');
    process.exit(1);
  }
  const metodo = acao === 'criar' ? 'signUp' : 'signInWithPassword';
  const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${metodo}?key=${chave}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha, returnSecureToken: true })
  });
  const dados = await resp.json();
  if (!resp.ok) {
    console.error('Erro do Firebase:', dados.error && dados.error.message);
    process.exit(1);
  }
  process.stdout.write(dados.idToken);
})();
