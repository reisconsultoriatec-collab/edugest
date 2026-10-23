'use strict';
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'edugest',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  timezone: '-03:00',
  dateStrings: true,      // DATE/DATETIME voltam como texto, sem conversão de fuso
  decimalNumbers: true    // DECIMAL volta como número
});

// Toda conexão nova trabalha no horário de São Paulo
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '-03:00'");
});

/** Executa uma consulta e devolve as linhas (ou o resultado do INSERT/UPDATE). */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Primeira linha ou null. */
async function queryUm(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/**
 * Executa várias operações numa transação.
 * Uso: await transacao(async (conn) => { await conn.query(...); });
 */
async function transacao(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await fn(conn);
    await conn.commit();
    return resultado;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function verificarConexao() {
  await pool.query('SELECT 1');
}

module.exports = { pool, query, queryUm, transacao, verificarConexao };
