'use strict';
/* Criação de colégio com tudo que ele precisa para começar a funcionar. */
const { codigoConvite } = require('../utils/codigos');
const { hojeSP } = require('../utils/datas');

const DISCIPLINAS_PADRAO = ['Português', 'Matemática', 'História', 'Geografia', 'Ciências', 'Inglês', 'Ed. Física', 'Artes'];

/**
 * Cria o colégio, a configuração inicial, as disciplinas padrão e
 * vincula o usuário como admin ativo. Deve rodar dentro de transação.
 * @returns {Promise<number>} id do colégio
 */
async function criarColegio(conn, { nome, usuarioId, cnpj = null, telefone = null, endereco = null }) {
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
  await conn.query('UPDATE usuarios SET colegio_atual_id = ? WHERE id = ?', [colegioId, usuarioId]);

  return colegioId;
}

module.exports = { criarColegio, DISCIPLINAS_PADRAO };
