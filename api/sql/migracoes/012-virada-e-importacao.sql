-- =====================================================================
--  EduGest — migração 012: virada do ano letivo e importação de alunos
--  - alunos: situação "concluido" (terminou o curso no colégio) e a
--    importação de onde veio o cadastro (para poder desfazer)
--  - importacoes_alunos: cada planilha de alunos importada
--  - viradas / virada_turmas / virada_alunos: o que cada virada fez,
--    guardando o estado anterior para poder desfazer
--  - mensalidades: virada que gerou (para poder desfazer)
--  Só acrescenta: não apaga nem altera registros. Pode rodar mais de uma vez.
-- =====================================================================
SET NAMES utf8mb4;

ALTER TABLE alunos MODIFY COLUMN status ENUM('ativo','inativo','transferido','concluido') NOT NULL DEFAULT 'ativo';

CREATE TABLE IF NOT EXISTS importacoes_alunos (
  id           INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  colegio_id   INT UNSIGNED      NOT NULL,
  arquivo      VARCHAR(160)      NULL,
  total        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  feita_por    INT UNSIGNED      NULL,
  feita_em     DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  desfeita_em  DATETIME          NULL,
  desfeita_por INT UNSIGNED      NULL,
  PRIMARY KEY (id),
  KEY idx_impal_colegio (colegio_id, feita_em),
  CONSTRAINT fk_impal_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'alunos' AND column_name = 'importacao_id');
SET @sql := IF(@existe = 0, 'ALTER TABLE alunos ADD COLUMN importacao_id INT UNSIGNED NULL AFTER status, ADD KEY idx_alunos_importacao (importacao_id)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

CREATE TABLE IF NOT EXISTS viradas (
  id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  colegio_id          INT UNSIGNED      NOT NULL,
  ano_de              SMALLINT UNSIGNED NOT NULL,
  ano_para            SMALLINT UNSIGNED NOT NULL,
  ano_letivo_anterior SMALLINT UNSIGNED NOT NULL COMMENT 'Configuração antes da virada (para desfazer)',
  valor_anterior      DECIMAL(10,2)     NULL,
  valor_novo          DECIMAL(10,2)     NULL,
  resumo              TEXT              NULL     COMMENT 'JSON com os totais',
  feita_por           INT UNSIGNED      NULL,
  feita_em            DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  desfeita_em         DATETIME          NULL,
  desfeita_por        INT UNSIGNED      NULL,
  PRIMARY KEY (id),
  KEY idx_viradas_colegio (colegio_id, feita_em),
  CONSTRAINT fk_viradas_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS virada_turmas (
  virada_id        INT UNSIGNED NOT NULL,
  turma_id         INT UNSIGNED NOT NULL,
  turma_origem_id  INT UNSIGNED NULL,
  criada           TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = criada pela virada (desfazer apaga)',
  PRIMARY KEY (virada_id, turma_id),
  CONSTRAINT fk_vturmas_virada FOREIGN KEY (virada_id) REFERENCES viradas (id) ON DELETE CASCADE,
  CONSTRAINT fk_vturmas_turma  FOREIGN KEY (turma_id)  REFERENCES turmas (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS virada_alunos (
  virada_id          INT UNSIGNED NOT NULL,
  aluno_id           INT UNSIGNED NOT NULL,
  acao               ENUM('promover','reter','concluir','sair','enturmar') NOT NULL,
  turma_origem_id    INT UNSIGNED NULL,
  turma_destino_id   INT UNSIGNED NULL,
  status_origem      VARCHAR(20)  NOT NULL,
  status_destino     VARCHAR(20)  NOT NULL,
  data_saida_origem  DATE         NULL,
  situacao           VARCHAR(30)  NULL     COMMENT 'Situação calculada pelas notas e frequência',
  resultado          VARCHAR(40)  NULL     COMMENT 'Resultado do ano (vai para o histórico)',
  PRIMARY KEY (virada_id, aluno_id),
  KEY idx_valunos_aluno (aluno_id),
  KEY idx_valunos_origem (turma_origem_id),
  CONSTRAINT fk_valunos_virada  FOREIGN KEY (virada_id)        REFERENCES viradas (id) ON DELETE CASCADE,
  CONSTRAINT fk_valunos_aluno   FOREIGN KEY (aluno_id)         REFERENCES alunos (id)  ON DELETE CASCADE,
  CONSTRAINT fk_valunos_origem  FOREIGN KEY (turma_origem_id)  REFERENCES turmas (id)  ON DELETE SET NULL,
  CONSTRAINT fk_valunos_destino FOREIGN KEY (turma_destino_id) REFERENCES turmas (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'mensalidades' AND column_name = 'virada_id');
SET @sql := IF(@existe = 0, 'ALTER TABLE mensalidades ADD COLUMN virada_id INT UNSIGNED NULL AFTER bolsa_id, ADD KEY idx_mens_virada (virada_id)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
