-- =====================================================================
--  EduGest — migração 001: pessoas autorizadas a retirar o aluno
--  Aplicada automaticamente pelo deploy/atualizar-edugest.sh
--  (pode ser executada mais de uma vez sem efeito colateral)
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS autorizados_retirada (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id       INT UNSIGNED NOT NULL,
  aluno_id         INT UNSIGNED NOT NULL,
  nome             VARCHAR(100) NOT NULL,
  parentesco       VARCHAR(30)  NULL,
  documento_cript  VARCHAR(255) NULL COMMENT 'RG ou CPF, criptografado pela API',
  telefone         VARCHAR(20)  NULL,
  criado_em        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_autorizados_aluno (aluno_id),
  CONSTRAINT fk_autorizados_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT fk_autorizados_aluno   FOREIGN KEY (aluno_id)   REFERENCES alunos (id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
