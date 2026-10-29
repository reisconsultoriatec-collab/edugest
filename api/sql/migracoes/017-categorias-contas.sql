-- =====================================================================
--  017 — Categorias das contas a pagar, por colégio
--  A lista de cada colégio é criada pela API no primeiro uso (categorias
--  padrão + as que o colégio já usa nas contas). Nada é apagado.
--  Idempotente.
-- =====================================================================
CREATE TABLE IF NOT EXISTS categorias_contas (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id  INT UNSIGNED NOT NULL,
  nome        VARCHAR(40)  NOT NULL,
  criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_categorias_contas_nome (colegio_id, nome),
  CONSTRAINT fk_categorias_contas_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
