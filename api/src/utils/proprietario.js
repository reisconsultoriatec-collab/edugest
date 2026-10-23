'use strict';
/* =====================================================================
 *  Proprietário do sistema (Reis Tecnologia)
 *
 *  Só o proprietário cadastra colégios novos e administra a lista de
 *  colégios. Quem é o proprietário fica no .env do servidor — nunca no
 *  banco —, assim nenhum administrador de colégio consegue se promover
 *  pelo sistema:
 *
 *      PROPRIETARIO_EMAILS=dono@exemplo.com           (vários: separe por vírgula)
 *
 *  O e-mail precisa estar CONFIRMADO no Firebase (email_verified) para
 *  as funções de proprietário serem liberadas.
 * ===================================================================== */

/** Lido a cada chamada: muda com um restart, sem cache escondido. */
function emailsProprietario() {
  return String(process.env.PROPRIETARIO_EMAILS || '')
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {{email:string, emailVerificado:boolean}} firebase  req.firebase
 * @returns {'ativo'|'verificar'|null}
 *   ativo     → é o proprietário e o e-mail está confirmado
 *   verificar → é o e-mail do proprietário, mas falta confirmar o e-mail
 *   null      → não é o proprietário
 */
function situacaoProprietario(firebase) {
  const email = firebase && firebase.email ? String(firebase.email).toLowerCase() : '';
  if (!email || !emailsProprietario().includes(email)) return null;
  return firebase.emailVerificado ? 'ativo' : 'verificar';
}

const ehProprietario = (firebase) => situacaoProprietario(firebase) === 'ativo';

module.exports = { emailsProprietario, situacaoProprietario, ehProprietario };
