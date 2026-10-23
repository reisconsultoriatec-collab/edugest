'use strict';
const path = require('path');
const admin = require('firebase-admin');

const arquivo = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT || './firebase-service-account.json');

let credencial;
try {
  credencial = require(arquivo);
} catch (e) {
  console.error(`[EduGest] Não foi possível ler a chave do Firebase em ${arquivo}`);
  throw e;
}

admin.initializeApp({ credential: admin.credential.cert(credencial) });

module.exports = admin;
