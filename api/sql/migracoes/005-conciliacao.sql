-- =====================================================================
--  EduGest — migração 005: conciliação bancária
--  - importacoes_extrato: cada arquivo importado (período, saldo do banco,
--    quem importou) — permite desfazer uma importação errada
--  - lancamentos_bancarios.importacao_id: de qual importação veio
--  - lancamentos_bancarios.acao_baixa: o que a conciliação fez no sistema
--      nenhuma = só vinculou (a baixa já existia)
--      baixou  = deu baixa na mensalidade / pagou a conta
--      criou   = criou uma conta a pagar já paga
--    (ao desfazer a conciliação, isso é revertido)
--  Escrita para poder rodar mais de uma vez sem erro.
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS importacoes_extrato (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  colegio_id       INT UNSIGNED  NOT NULL,
  conta_banco_id   INT UNSIGNED  NOT NULL,
  arquivo          VARCHAR(150)  NOT NULL,
  formato          ENUM('ofx','csv') NOT NULL,
  periodo_inicio   DATE          NULL,
  periodo_fim      DATE          NULL,
  saldo_final      DECIMAL(12,2) NULL COMMENT 'Saldo informado pelo banco no OFX',
  saldo_data       DATE          NULL,
  qtd_lancamentos  INT UNSIGNED  NOT NULL DEFAULT 0,
  qtd_duplicados   INT UNSIGNED  NOT NULL DEFAULT 0,
  importado_por    INT UNSIGNED  NULL,
  importado_em     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_imp_conta (colegio_id, conta_banco_id, importado_em),
  CONSTRAINT fk_imp_colegio     FOREIGN KEY (colegio_id)     REFERENCES colegios (id)     ON DELETE CASCADE,
  CONSTRAINT fk_imp_conta_banco FOREIGN KEY (conta_banco_id) REFERENCES contas_banco (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'lancamentos_bancarios' AND column_name = 'importacao_id');
SET @sql := IF(@existe = 0, 'ALTER TABLE lancamentos_bancarios ADD COLUMN importacao_id INT UNSIGNED NULL AFTER conta_banco_id', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'lancamentos_bancarios' AND column_name = 'acao_baixa');
SET @sql := IF(@existe = 0, 'ALTER TABLE lancamentos_bancarios ADD COLUMN acao_baixa ENUM(''nenhuma'',''baixou'',''criou'') NOT NULL DEFAULT ''nenhuma'' AFTER conta_pagar_id', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.table_constraints
                 WHERE table_schema = DATABASE() AND table_name = 'lancamentos_bancarios' AND constraint_name = 'fk_lanc_importacao');
SET @sql := IF(@existe = 0, 'ALTER TABLE lancamentos_bancarios ADD CONSTRAINT fk_lanc_importacao FOREIGN KEY (importacao_id) REFERENCES importacoes_extrato (id) ON DELETE SET NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.statistics
                 WHERE table_schema = DATABASE() AND table_name = 'lancamentos_bancarios' AND index_name = 'idx_lanc_conta_data');
SET @sql := IF(@existe = 0, 'ALTER TABLE lancamentos_bancarios ADD KEY idx_lanc_conta_data (conta_banco_id, status, data)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
