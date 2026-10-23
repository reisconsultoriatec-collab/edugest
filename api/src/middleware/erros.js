'use strict';

/** Erro com status HTTP e mensagem que pode ser mostrada ao usuário. */
class HttpErro extends Error {
  constructor(status, mensagem, codigo) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
  }
}

/** Envolve rotas async para que erros cheguem ao tratarErros (Express 4). */
const assincrono = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function naoEncontrado(req, res) {
  res.status(404).json({ erro: 'Rota não encontrada' });
}

// eslint-disable-next-line no-unused-vars
function tratarErros(err, req, res, next) {
  if (err instanceof HttpErro) {
    return res.status(err.status).json({ erro: err.message, codigo: err.codigo });
  }
  if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'Conteúdo muito grande' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido' });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Registro já existe' });
  if (err.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({ erro: 'Registro possui vínculos e não pode ser excluído' });
  }
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    return res.status(400).json({ erro: 'Valor fora do permitido' });
  }
  // Detalhe técnico só no log do servidor, nunca na resposta
  console.error('[ERRO]', req.method, req.originalUrl, err);
  return res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
}

module.exports = { HttpErro, assincrono, naoEncontrado, tratarErros };
