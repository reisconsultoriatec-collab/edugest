-- =====================================================================
--  EduGest — migração 006: comunicados
--  - comunicados: tipo "urgente"; público (alcance) = colégio todo,
--    segmentos (Infantil, Fundamental I/II, Médio, EJA, outras) ou
--    turmas escolhidas; fixar no topo; exigir ciência; data de expiração
--  - comunicado_turmas: turmas de um comunicado com alcance = turmas
--  - comunicado_leituras: quem leu (e quem confirmou ciência) no portal
--  A coluna antiga "destinatarios" é convertida para alcance/segmentos
--  e removida.
--  Escrita para poder rodar mais de uma vez sem erro.
-- =====================================================================
SET NAMES utf8mb4;

ALTER TABLE comunicados MODIFY COLUMN tipo ENUM('aviso','circular','evento','urgente') NOT NULL DEFAULT 'aviso';

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'comunicados' AND column_name = 'alcance');
SET @sql := IF(@existe = 0, 'ALTER TABLE comunicados ADD COLUMN alcance ENUM(''todos'',''segmentos'',''turmas'') NOT NULL DEFAULT ''todos'' AFTER tipo', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'comunicados' AND column_name = 'segmentos');
SET @sql := IF(@existe = 0, 'ALTER TABLE comunicados ADD COLUMN segmentos VARCHAR(80) NULL COMMENT ''Lista separada por vírgula: infantil,fundamental1,fundamental2,medio,eja,outros'' AFTER alcance', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- Converte a coluna antiga (todos | infantil | fundamental1 | ...) e remove
SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'comunicados' AND column_name = 'destinatarios');
SET @sql := IF(@existe = 1, 'UPDATE comunicados SET alcance = ''segmentos'', segmentos = destinatarios WHERE destinatarios <> ''todos''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@existe = 1, 'ALTER TABLE comunicados DROP COLUMN destinatarios', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'comunicados' AND column_name = 'fixado');
SET @sql := IF(@existe = 0, 'ALTER TABLE comunicados ADD COLUMN fixado TINYINT(1) NOT NULL DEFAULT 0 AFTER mensagem', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'comunicados' AND column_name = 'exige_ciencia');
SET @sql := IF(@existe = 0, 'ALTER TABLE comunicados ADD COLUMN exige_ciencia TINYINT(1) NOT NULL DEFAULT 0 AFTER fixado', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'comunicados' AND column_name = 'expira_em');
SET @sql := IF(@existe = 0, 'ALTER TABLE comunicados ADD COLUMN expira_em DATE NULL COMMENT ''Último dia em que aparece no portal'' AFTER exige_ciencia', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'comunicados' AND column_name = 'atualizado_por');
SET @sql := IF(@existe = 0, 'ALTER TABLE comunicados ADD COLUMN atualizado_por INT UNSIGNED NULL AFTER criado_em', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'comunicados' AND column_name = 'atualizado_em');
SET @sql := IF(@existe = 0, 'ALTER TABLE comunicados ADD COLUMN atualizado_em DATETIME NULL AFTER atualizado_por', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

CREATE TABLE IF NOT EXISTS comunicado_turmas (
  comunicado_id  INT UNSIGNED NOT NULL,
  turma_id       INT UNSIGNED NOT NULL,
  PRIMARY KEY (comunicado_id, turma_id),
  KEY idx_comt_turma (turma_id),
  CONSTRAINT fk_comt_comunicado FOREIGN KEY (comunicado_id) REFERENCES comunicados (id) ON DELETE CASCADE,
  CONSTRAINT fk_comt_turma      FOREIGN KEY (turma_id)      REFERENCES turmas (id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS comunicado_leituras (
  comunicado_id  INT UNSIGNED NOT NULL,
  usuario_id     INT UNSIGNED NOT NULL,
  colegio_id     INT UNSIGNED NOT NULL,
  lido_em        DATETIME     NOT NULL,
  ciente_em      DATETIME     NULL COMMENT 'Só nos comunicados que exigem ciência',
  PRIMARY KEY (comunicado_id, usuario_id),
  KEY idx_coml_usuario (usuario_id, colegio_id),
  CONSTRAINT fk_coml_comunicado FOREIGN KEY (comunicado_id) REFERENCES comunicados (id) ON DELETE CASCADE,
  CONSTRAINT fk_coml_usuario    FOREIGN KEY (usuario_id)    REFERENCES usuarios (id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
