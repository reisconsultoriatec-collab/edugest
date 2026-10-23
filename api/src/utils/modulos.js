'use strict';
/* Módulos do sistema e acesso padrão de cada perfil.
 * O admin pode personalizar por usuário (usuario_colegio.modulos). */

const MODULOS = [
  'dashboard',
  // Pedagógico
  'alunos', 'professores', 'turmas', 'diario', 'notas', 'boletim', 'calendario', 'grade', 'documentos',
  // Financeiro
  'mensalidades', 'contas', 'fluxo', 'bolsas', 'relatorios', 'conciliacao',
  // Captação e comunicação
  'funil', 'comunicados'
];

// Exclusivos do admin, nunca liberados por personalização
const MODULOS_ADMIN = ['config', 'usuarios'];

const PADRAO_POR_PERFIL = {
  professor: ['dashboard', 'alunos', 'turmas', 'diario', 'notas', 'boletim', 'calendario', 'grade', 'comunicados'],
  financeiro: ['dashboard', 'mensalidades', 'contas', 'fluxo', 'bolsas', 'relatorios', 'conciliacao'],
  responsavel: ['portal']
};

/** Lista final de módulos de um vínculo usuário × colégio. */
function modulosEfetivos(perfil, personalizados) {
  if (perfil === 'admin') return [...MODULOS, ...MODULOS_ADMIN];
  if (perfil === 'responsavel') return ['portal'];

  let lista = personalizados;
  if (typeof lista === 'string') {
    try { lista = JSON.parse(lista); } catch (e) { lista = null; }
  }
  if (Array.isArray(lista)) return lista.filter((m) => MODULOS.includes(m));
  return PADRAO_POR_PERFIL[perfil] || ['dashboard'];
}

module.exports = { MODULOS, MODULOS_ADMIN, PADRAO_POR_PERFIL, modulosEfetivos };
