'use strict';
/* Criação de colégio com tudo que ele precisa para começar a funcionar. */
const { codigoConvite } = require('../utils/codigos');
const { hojeSP } = require('../utils/datas');
const v = require('../utils/validar');

const DISCIPLINAS_PADRAO = ['Português', 'Matemática', 'História', 'Geografia', 'Ciências', 'Inglês', 'Ed. Física', 'Artes'];

/**
 * Cria o colégio, a configuração inicial, as disciplinas padrão e
 * vincula o usuário como admin ativo. Deve rodar dentro de transação.
 * tornarAtual: false mantém o colégio em uso pelo usuário (o proprietário
 * cadastra vários colégios sem trocar de colégio a cada um).
 * @returns {Promise<number>} id do colégio
 */
async function criarColegio(conn, { nome, usuarioId, cnpj = null, telefone = null, endereco = null, tornarAtual = true }) {
  let colegioId = null;
  for (let tentativa = 0; tentativa < 5 && !colegioId; tentativa++) {
    try {
      const [r] = await conn.query(
        `INSERT INTO colegios (nome, cnpj, telefone, endereco, codigo_convite, criado_por)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [nome, cnpj, telefone, endereco, codigoConvite(), usuarioId]
      );
      colegioId = r.insertId;
    } catch (e) {
      // Colisão do código de convite (raríssima): tenta outro
      if (e.code !== 'ER_DUP_ENTRY' || tentativa === 4) throw e;
    }
  }

  const ano = Number(hojeSP().slice(0, 4));
  await conn.query('INSERT INTO config_colegio (colegio_id, ano_letivo) VALUES (?, ?)', [colegioId, ano]);

  await conn.query(
    'INSERT INTO disciplinas (colegio_id, nome, ordem) VALUES ?',
    [DISCIPLINAS_PADRAO.map((d, i) => [colegioId, d, i + 1])]
  );

  await conn.query(
    `INSERT INTO usuario_colegio (usuario_id, colegio_id, perfil, status, aprovado_em)
     VALUES (?, ?, 'admin', 'ativo', NOW())`,
    [usuarioId, colegioId]
  );
  if (tornarAtual) await conn.query('UPDATE usuarios SET colegio_atual_id = ? WHERE id = ?', [colegioId, usuarioId]);

  return colegioId;
}

/**
 * Dados cadastrais do colégio (mesma regra para o admin do colégio em
 * PUT /colegios/atual e para o proprietário em PUT /proprietario/colegios/:id).
 * @returns {{nome, cnpj, telefone, email, endereco, whatsapp_notif}}
 */
function lerDadosColegio(body) {
  return {
    nome: v.texto(body.nome, 'Nome do colégio', { max: 120, min: 3, obrigatorio: true }),
    cnpj: v.cnpj(body.cnpj),
    telefone: v.telefone(body.telefone),
    email: v.email(body.email),
    endereco: v.texto(body.endereco, 'Endereço', { max: 200 }),
    whatsapp_notif: v.telefone(body.whatsappNotif, 'WhatsApp para notificações')
  };
}

/** Grava os dados lidos por lerDadosColegio. */
async function salvarDadosColegio(query, colegioId, d) {
  await query(
    `UPDATE colegios SET nome = ?, cnpj = ?, telefone = ?, email = ?, endereco = ?, whatsapp_notif = ?
      WHERE id = ?`,
    [d.nome, d.cnpj, d.telefone, d.email, d.endereco, d.whatsapp_notif, colegioId]
  );
}

module.exports = { criarColegio, lerDadosColegio, salvarDadosColegio, DISCIPLINAS_PADRAO };
