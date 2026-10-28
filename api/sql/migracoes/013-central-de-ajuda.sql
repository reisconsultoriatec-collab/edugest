-- =====================================================================
--  EduGest — migração 013: Central de ajuda
--  usuario_ajuda: o que cada pessoa já leu no manual e os tours que fez
--  (vale em qualquer computador ou celular). Só acrescenta.
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS usuario_ajuda (
  usuario_id  INT UNSIGNED NOT NULL,
  chave       VARCHAR(60)  NOT NULL COMMENT 'artigo:<id>, tour:<id> ou preferências da ajuda',
  feito_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, chave),
  CONSTRAINT fk_uajuda_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
