'use strict';
/* =====================================================================
 *  Usuários online
 *
 *  Cada aba aberta do EduGest manda um sinal por minuto (POST
 *  /api/presenca/sinal) com um código aleatório da aba e se a pessoa
 *  mexeu na tela nos últimos 5 minutos. Quem deu sinal nos últimos
 *  2 minutos está online; fechar a aba ou sair apaga a linha na hora.
 *
 *  Não guarda a tela em uso nem o IP. O administrador vê a equipe com
 *  nome e os responsáveis só como número. "Encerrar sessão" marca as abas
 *  da pessoa naquele colégio; no próximo sinal (até 1 minuto) ela sai.
 *
 *  As contas ficam em funções sem banco (montarOnline), testáveis.
 * ===================================================================== */
const { query, queryUm } = require('../db');
const { HttpErro } = require('../middleware/erros');
const { dispositivo } = require('../utils/auditoria');

const ONLINE_SEG = 120;     // sem sinal há mais de 2 minutos = fora do sistema
const INTERVALO_SEG = 60;   // de quanto em quanto tempo o navegador manda o sinal
const GUARDA_DIAS = 2;      // linhas mais antigas que isso são apagadas
const ABA = /^[a-f0-9]{24}$/;

/** 'AAAA-MM-DD HH:MM:SS' menos n segundos (relógio de São Paulo, sem fuso). */
function menosSegundos(agora, n) {
  const d = new Date(`${agora.replace(' ', 'T')}Z`);
  return new Date(d.getTime() - n * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

/** "Computador · Chrome / Windows", "Celular · Safari / iOS" */
function aparelho(ua) {
  const s = String(ua || '');
  const tipo = /iPad|Tablet/i.test(s) ? 'Tablet' : /Mobi|iPhone|Android/i.test(s) ? 'Celular' : 'Computador';
  return `${tipo} · ${dispositivo(s)}`.slice(0, 80);
}

const dt = (x) => (x ? String(x).slice(0, 19) : null);

/**
 * Junta as abas por pessoa. sessoes: linhas online do colégio; equipe: vínculos
 * ativos de equipe (para "visto por último"). Sem banco: testável.
 */
function montarOnline({ sessoes, equipe, euId, proprietario }) {
  const porPessoa = new Map();
  sessoes.forEach((s) => {
    if (!porPessoa.has(s.usuario_id)) {
      porPessoa.set(s.usuario_id, { usuarioId: s.usuario_id, nome: s.nome, email: s.email, perfil: s.perfil, abas: 0, ativo: false, desde: null, ultimoSinal: null, aparelhos: [] });
    }
    const p = porPessoa.get(s.usuario_id);
    p.abas += 1;
    p.ativo = p.ativo || !!Number(s.ativo);
    const ini = dt(s.inicio); const ult = dt(s.ultimo_sinal);
    if (!p.desde || ini < p.desde) p.desde = ini;
    if (!p.ultimoSinal || ult > p.ultimoSinal) p.ultimoSinal = ult;
    if (s.dispositivo && !p.aparelhos.includes(s.dispositivo)) p.aparelhos.push(s.dispositivo);
  });
  const pessoas = [...porPessoa.values()];
  const familias = pessoas.filter((p) => p.perfil === 'responsavel');
  const equipeOn = pessoas.filter((p) => p.perfil !== 'responsavel')
    .map((p) => ({
      ...p,
      voce: p.usuarioId === euId,
      podeEncerrar: p.usuarioId !== euId && (p.perfil !== 'admin' || !!proprietario)
    }))
    .sort((a, b) => (b.ativo - a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const online = new Set(pessoas.map((p) => p.usuarioId));
  const fora = equipe.filter((e) => !online.has(e.id))
    .map((e) => ({ usuarioId: e.id, nome: e.nome, perfil: e.perfil, vistoEm: dt(e.visto) || dt(e.ultimo_acesso) }))
    .sort((a, b) => ((b.vistoEm || '') > (a.vistoEm || '') ? 1 : (b.vistoEm || '') < (a.vistoEm || '') ? -1 : a.nome.localeCompare(b.nome, 'pt-BR')));
  const porPerfil = { admin: 0, professor: 0, financeiro: 0, responsavel: 0 };
  pessoas.forEach((p) => { porPerfil[p.perfil] = (porPerfil[p.perfil] || 0) + 1; });
  return {
    total: pessoas.length,
    porPerfil,
    equipe: equipeOn,
    ativos: equipeOn.filter((p) => p.ativo).length,
    responsaveis: { online: familias.length, ativos: familias.filter((p) => p.ativo).length },
    fora
  };
}

/* ---------------- Banco ---------------- */
async function limpar(agora) {
  await query('DELETE FROM sessoes_online WHERE ultimo_sinal < ?', [menosSegundos(agora, GUARDA_DIAS * 86400)]);
}

/** Sinal de uma aba. Devolve { encerrada } (true = um administrador encerrou a sessão). */
async function sinal({ aba, usuarioId, colegioId, perfil, ativo, ua, agora }) {
  if (!ABA.test(String(aba || ''))) throw new HttpErro(400, 'Aba inválida', 'validacao');
  const r = await queryUm('SELECT usuario_id, encerrada_em FROM sessoes_online WHERE id = ?', [aba]);
  if (r && Number(r.usuario_id) !== usuarioId) throw new HttpErro(409, 'Aba inválida', 'aba');
  if (r && r.encerrada_em) return { encerrada: true };
  const disp = aparelho(ua);
  if (r) {
    // trocou de colégio na mesma aba: começa a contar de novo
    await query(
      `UPDATE sessoes_online SET inicio = CASE WHEN colegio_id = ? THEN inicio ELSE ? END, colegio_id = ?, perfil = ?, ativo = ?, dispositivo = ?, ultimo_sinal = ?
        WHERE id = ?`,
      [colegioId, agora, colegioId, perfil, ativo ? 1 : 0, disp, agora, aba]);
  } else {
    await query(
      `INSERT INTO sessoes_online (id, usuario_id, colegio_id, perfil, dispositivo, ativo, inicio, ultimo_sinal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [aba, usuarioId, colegioId, perfil, disp, ativo ? 1 : 0, agora, agora]);
  }
  if (Math.random() < 0.02) limpar(agora).catch(() => {}); // de vez em quando, sem esperar
  return { encerrada: false };
}

/** Fechou a aba ou saiu: some da lista na hora. */
async function saida({ aba, usuarioId }) {
  if (!ABA.test(String(aba || ''))) return;
  await query('DELETE FROM sessoes_online WHERE id = ? AND usuario_id = ?', [aba, usuarioId]);
}

/** Quantas pessoas estão online no colégio (contador do topo do administrador). */
async function contar(colegioId, agora) {
  const r = await queryUm(
    'SELECT COUNT(DISTINCT usuario_id) AS n FROM sessoes_online WHERE colegio_id = ? AND encerrada_em IS NULL AND ultimo_sinal >= ?',
    [colegioId, menosSegundos(agora, ONLINE_SEG)]);
  return Number(r && r.n) || 0;
}

async function listar(colegioId, { agora, euId, proprietario }) {
  await limpar(agora);
  const limite = menosSegundos(agora, ONLINE_SEG);
  const [sessoes, equipe] = await Promise.all([
    query(`SELECT s.usuario_id, s.perfil, s.ativo, s.inicio, s.ultimo_sinal, s.dispositivo, u.nome, u.email
             FROM sessoes_online s JOIN usuarios u ON u.id = s.usuario_id
            WHERE s.colegio_id = ? AND s.encerrada_em IS NULL AND s.ultimo_sinal >= ?`, [colegioId, limite]),
    query(`SELECT u.id, u.nome, u.ultimo_acesso, uc.perfil,
                  (SELECT MAX(so.ultimo_sinal) FROM sessoes_online so WHERE so.usuario_id = u.id AND so.colegio_id = uc.colegio_id) AS visto
             FROM usuario_colegio uc JOIN usuarios u ON u.id = uc.usuario_id
            WHERE uc.colegio_id = ? AND uc.status = 'ativo' AND uc.perfil <> 'responsavel'`, [colegioId])
  ]);
  return { agora, intervaloSeg: INTERVALO_SEG, onlineSeg: ONLINE_SEG, ...montarOnline({ sessoes, equipe, euId, proprietario }) };
}

/** Encerra as abas da pessoa neste colégio (ela sai no próximo sinal, em até 1 minuto). */
async function encerrar(colegioId, alvoId, { agora, euId, proprietario }) {
  if (alvoId === euId) throw new HttpErro(400, 'Para sair, use "Sair" no menu do seu nome', 'proprio_usuario');
  const v = await queryUm(
    `SELECT uc.perfil, u.nome FROM usuario_colegio uc JOIN usuarios u ON u.id = uc.usuario_id
      WHERE uc.usuario_id = ? AND uc.colegio_id = ?`, [alvoId, colegioId]);
  if (!v) throw new HttpErro(404, 'Usuário não encontrado neste colégio', 'nao_encontrado');
  if (v.perfil === 'responsavel') throw new HttpErro(400, 'Sessões de responsáveis não são encerradas por aqui', 'perfil');
  if (v.perfil === 'admin' && !proprietario) throw new HttpErro(403, 'Só o proprietário do sistema encerra a sessão de outro administrador', 'perfil');
  const r = await query(
    `UPDATE sessoes_online SET encerrada_em = ?, encerrada_por = ?
      WHERE usuario_id = ? AND colegio_id = ? AND encerrada_em IS NULL AND ultimo_sinal >= ?`,
    [agora, euId, alvoId, colegioId, menosSegundos(agora, ONLINE_SEG)]);
  const n = Number(r.affectedRows) || 0;
  if (!n) throw new HttpErro(409, `${v.nome} não está online agora`, 'fora');
  return { nome: v.nome, abas: n };
}

module.exports = {
  ONLINE_SEG, INTERVALO_SEG, GUARDA_DIAS,
  menosSegundos, aparelho, montarOnline, sinal, saida, contar, listar, encerrar, limpar
};
