-- =====================================================================
--  EduGest — migração 014: LGPD
--  - config_colegio: encarregado pelo tratamento de dados (DPO) do colégio
--  - termos_aceites: quem aceitou cada versão dos termos de uso e da
--    política de privacidade (data, IP e dispositivo)
--  - solicitacoes_titular: pedidos dos titulares (acesso, correção,
--    exclusão, portabilidade...) com prazo e resposta do colégio
--  - log_seguranca: novo tipo "privacidade"
--  Só acrescenta. Pode rodar mais de uma vez.
-- =====================================================================
SET NAMES utf8mb4;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'config_colegio' AND column_name = 'encarregado_nome');
SET @sql := IF(@existe = 0, 'ALTER TABLE config_colegio
  ADD COLUMN encarregado_nome VARCHAR(100) NULL COMMENT ''Encarregado de dados (LGPD)'' AFTER cidade,
  ADD COLUMN encarregado_email VARCHAR(160) NULL AFTER encarregado_nome,
  ADD COLUMN encarregado_telefone VARCHAR(20) NULL AFTER encarregado_email', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

CREATE TABLE IF NOT EXISTS termos_aceites (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id  INT UNSIGNED NOT NULL,
  versao      VARCHAR(20)  NOT NULL,
  colegio_id  INT UNSIGNED NULL COMMENT 'Colégio aberto quando aceitou',
  perfil      VARCHAR(20)  NULL,
  aceito_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip          VARCHAR(45)  NULL,
  dispositivo VARCHAR(60)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_termos_usuario_versao (usuario_id, versao),
  CONSTRAINT fk_termos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS solicitacoes_titular (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id         INT UNSIGNED NOT NULL,
  usuario_id         INT UNSIGNED NULL,
  solicitante_nome   VARCHAR(100) NOT NULL,
  solicitante_email  VARCHAR(160) NULL,
  aluno_id           INT UNSIGNED NULL,
  aluno_nome         VARCHAR(100) NULL,
  tipo               ENUM('acesso','correcao','exclusao','portabilidade','revogacao','informacao','outro') NOT NULL,
  descricao          TEXT         NOT NULL,
  status             ENUM('aberta','em_andamento','concluida','recusada') NOT NULL DEFAULT 'aberta',
  resposta           TEXT         NULL,
  respondida_por     INT UNSIGNED NULL,
  respondida_em      DATETIME     NULL,
  criada_em          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  prazo              DATE         NOT NULL COMMENT '15 dias (art. 19 da LGPD)',
  PRIMARY KEY (id),
  KEY idx_sol_colegio (colegio_id, status, criada_em),
  KEY idx_sol_usuario (usuario_id),
  CONSTRAINT fk_sol_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT fk_sol_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT fk_sol_aluno FOREIGN KEY (aluno_id) REFERENCES alunos (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE log_seguranca MODIFY COLUMN tipo ENUM('login_ok','login_falha','logout','timeout','cadastro','admin','privacidade') NOT NULL;
