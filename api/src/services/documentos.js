'use strict';
/* =====================================================================
 *  Documentos financeiros em PDF.
 *
 *  Cada tipo tem:
 *    carregar(dados) → busca no banco e confere se o documento faz sentido
 *                      (lança DocErro com mensagem para quem abriu o link)
 *    gerar(carregado) → { pdf: Buffer, nome: 'arquivo.pdf' }
 *
 *  Tipos (chave "k" do link):
 *    m  mensalidade: cobrança se em aberto, recibo se paga
 *    c  carnê do aluno no ano (mensalidades em aberto)
 *    l  lote do mês (por turma ou todas), para imprimir
 *    d  declaração anual de pagamentos (IR)
 *    x  PDF de teste da chave PIX (R$ 1,00)
 * ===================================================================== */
const { query, queryUm } = require('../db');
const { decifrar } = require('../utils/crypto');
const { hojeSP, agoraSP } = require('../utils/datas');
const L = require('../pdf/layouts');

class DocErro extends Error {
  constructor(mensagem, status = 410) {
    super(mensagem);
    this.status = status;
  }
}

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

function emitidoEm() {
  const [d, h] = agoraSP().split(' ');
  return `${d.split('-').reverse().join('/')} às ${h.slice(0, 5)}`;
}

async function carregarEscola(colegioId) {
  const c = await queryUm(
    `SELECT c.nome, c.cnpj, c.telefone, c.email, c.endereco,
            cfg.pix_tipo, cfg.pix_chave, cfg.pix_beneficiario, cfg.cidade, cfg.cobranca_instrucoes, cfg.link_validade_dias
       FROM colegios c LEFT JOIN config_colegio cfg ON cfg.colegio_id = c.id
      WHERE c.id = ? AND c.ativo = 1`,
    [colegioId]
  );
  if (!c) throw new DocErro('Colégio não encontrado.', 404);
  return {
    escola: { nome: c.nome, cnpj: c.cnpj, telefone: c.telefone, email: c.email, endereco: c.endereco },
    cobranca: {
      pix: c.pix_tipo && c.pix_chave && c.cidade
        ? { chave: c.pix_chave, beneficiario: c.pix_beneficiario || c.nome, cidade: c.cidade }
        : null,
      instrucoes: c.cobranca_instrucoes,
      cidade: c.cidade,
      validadeDias: c.link_validade_dias || 30
    }
  };
}

const SELECT_MENS = `
  SELECT m.id, m.aluno_id, m.referencia, m.vencimento, m.valor_bruto, m.desconto, m.valor, m.valor_pago,
         m.status, m.data_pagamento, m.forma_pagamento, m.obs_pagamento,
         a.nome AS aluno, a.ra, a.resp_nome, t.nome AS turma,
         b.tipo AS bolsa_tipo, b.percentual AS bolsa_pct
    FROM mensalidades m
    JOIN alunos a ON a.id = m.aluno_id
    LEFT JOIN turmas t ON t.id = a.turma_id
    LEFT JOIN bolsas b ON b.id = m.bolsa_id`;

const item = (m) => ({
  id: m.id,
  alunoId: m.aluno_id,
  aluno: m.aluno,
  ra: m.ra,
  turma: m.turma,
  resp: m.resp_nome,
  referencia: m.referencia,
  vencimento: m.vencimento,
  valorBruto: m.valor_bruto,
  desconto: m.desconto,
  valor: m.valor,
  valorPago: m.valor_pago,
  status: m.status,
  dataPagamento: m.data_pagamento,
  formaPagamento: m.forma_pagamento,
  obsPagamento: m.obs_pagamento,
  bolsaTipo: m.bolsa_tipo,
  bolsaPct: m.bolsa_pct
});

const ABERTA = "m.status = 'pendente' AND m.valor > 0";

const TIPOS = {
  /* ---------- Mensalidade (cobrança ou recibo) ---------- */
  m: {
    async carregar({ c, i }) {
      const m = await queryUm(`${SELECT_MENS} WHERE m.id = ? AND m.colegio_id = ?`, [i, c]);
      if (!m) throw new DocErro('Esta mensalidade não existe mais. Fale com o colégio.', 404);
      if (m.status === 'cancelado') throw new DocErro('Esta mensalidade foi cancelada pelo colégio. Não há valor a pagar.');
      if (m.status === 'pendente' && Number(m.valor) === 0) throw new DocErro('Esta mensalidade é isenta (bolsa integral). Não há valor a pagar.');
      return { ...(await carregarEscola(c)), colegioId: c, item: item(m) };
    },
    gerar(d) {
      const it = d.item;
      if (it.status === 'pago') {
        return { pdf: L.pdfRecibo({ ...d, emitidoEm: emitidoEm() }), nome: `recibo-${it.referencia}-${slug(it.aluno)}.pdf` };
      }
      return {
        pdf: L.pdfCobrancas({ ...d, itens: [it], titulo: `Mensalidade ${L.nomeRef(it.referencia)} - ${it.aluno}` }),
        nome: `mensalidade-${it.referencia}-${slug(it.aluno)}.pdf`
      };
    }
  },

  /* ---------- Carnê do ano ---------- */
  c: {
    async carregar({ c, i, a }) {
      const aluno = await queryUm('SELECT nome FROM alunos WHERE id = ? AND colegio_id = ?', [i, c]);
      if (!aluno) throw new DocErro('Aluno não encontrado. Fale com o colégio.', 404);
      const linhas = await query(
        `${SELECT_MENS} WHERE m.colegio_id = ? AND m.aluno_id = ? AND m.referencia LIKE ? AND ${ABERTA} ORDER BY m.referencia`,
        [c, i, `${a}-%`]
      );
      if (!linhas.length) throw new DocErro(`Não há mensalidades em aberto de ${a} para ${aluno.nome}.`);
      return { ...(await carregarEscola(c)), colegioId: c, itens: linhas.map(item), aluno: aluno.nome, ano: a };
    },
    gerar(d) {
      return { pdf: L.pdfCobrancas({ ...d, titulo: `Carnê ${d.ano} - ${d.aluno}` }), nome: `carne-${d.ano}-${slug(d.aluno)}.pdf` };
    }
  },

  /* ---------- Lote do mês ---------- */
  l: {
    async carregar({ c, r, t }) {
      const cond = ['m.colegio_id = ?', 'm.referencia = ?', ABERTA];
      const params = [c, r];
      let turma = null;
      if (t) {
        turma = await queryUm('SELECT nome FROM turmas WHERE id = ? AND colegio_id = ?', [t, c]);
        if (!turma) throw new DocErro('Turma não encontrada.', 404);
        cond.push('a.turma_id = ?'); params.push(t);
      }
      const linhas = await query(`${SELECT_MENS} WHERE ${cond.join(' AND ')} ORDER BY t.nome, a.nome LIMIT 1500`, params);
      if (!linhas.length) {
        throw new DocErro(`Não há mensalidades em aberto de ${L.nomeRef(r)}${turma ? ` na turma ${turma.nome}` : ''}.`);
      }
      return { ...(await carregarEscola(c)), colegioId: c, itens: linhas.map(item), referencia: r, turma: turma && turma.nome };
    },
    gerar(d) {
      return {
        pdf: L.pdfCobrancas({ ...d, titulo: `Mensalidades ${L.nomeRef(d.referencia)}${d.turma ? ` - ${d.turma}` : ''}` }),
        nome: `mensalidades-${d.referencia}${d.turma ? `-${slug(d.turma)}` : ''}.pdf`
      };
    }
  },

  /* ---------- Declaração anual (IR) ---------- */
  d: {
    async carregar({ c, i, a }) {
      const al = await queryUm(
        `SELECT a.nome, a.ra, a.cpf_cript, a.resp_nome, a.resp_cpf_cript, t.nome AS turma
           FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id
          WHERE a.id = ? AND a.colegio_id = ?`,
        [i, c]
      );
      if (!al) throw new DocErro('Aluno não encontrado. Fale com o colégio.', 404);
      const pagos = await query(
        `${SELECT_MENS} WHERE m.colegio_id = ? AND m.aluno_id = ? AND m.status = 'pago'
            AND m.data_pagamento BETWEEN ? AND ? ORDER BY m.data_pagamento, m.referencia`,
        [c, i, `${a}-01-01`, `${a}-12-31`]
      );
      if (!pagos.length) throw new DocErro(`Não há pagamentos registrados em ${a} para ${al.nome}.`);
      const hoje = hojeSP();
      const aberto = await queryUm(
        `SELECT COUNT(*) AS n FROM mensalidades m
          WHERE m.colegio_id = ? AND m.aluno_id = ? AND m.referencia LIKE ? AND ${ABERTA} AND m.vencimento < ?`,
        [c, i, `${a}-%`, hoje]
      );
      return {
        ...(await carregarEscola(c)),
        ano: a,
        hoje,
        quitado: Number(aberto.n) === 0,
        aluno: {
          nome: al.nome, ra: al.ra, turma: al.turma, resp: al.resp_nome,
          cpf: decifrar(al.cpf_cript), respCpf: decifrar(al.resp_cpf_cript)
        },
        pagamentos: pagos.map(item)
      };
    },
    gerar(d) {
      return { pdf: L.pdfDeclaracao({ ...d, emitidoEm: emitidoEm() }), nome: `declaracao-pagamentos-${d.ano}-${slug(d.aluno.nome)}.pdf` };
    }
  },

  /* ---------- Teste da chave PIX ---------- */
  x: {
    async carregar({ c }) {
      const e = await carregarEscola(c);
      if (!e.cobranca.pix) throw new DocErro('Configure e salve a chave PIX antes de gerar o PDF de teste.', 409);
      const hoje = hojeSP();
      return {
        ...e,
        colegioId: c,
        item: {
          id: 0, txid: 'EGTESTE', aluno: 'Aluno de teste', ra: '0000', turma: 'Teste', resp: 'Responsável de teste',
          referencia: hoje.slice(0, 7), vencimento: hoje, valorBruto: 1, desconto: 0, valor: 1
        }
      };
    },
    gerar(d) {
      return { pdf: L.pdfCobrancas({ ...d, itens: [d.item], titulo: 'Teste da chave PIX' }), nome: 'teste-pix.pdf' };
    }
  }
};

module.exports = { TIPOS, DocErro, carregarEscola };
