-- =====================================================================
--  EduGest — migração 007: calendário escolar
--  - eventos: tipo "letivo" (dia letivo extra, ex.: sábado letivo),
--    horário, local, público (colégio todo, segmentos, turmas), se
--    aparece para as famílias e quem cadastrou/alterou
--  - evento_turmas: turmas de um evento com alcance = turmas
--  - periodos_letivos: início e fim de cada bimestre do ano letivo
--    (base dos dias letivos e do "bimestre atual")
--  Escrita para poder rodar mais de uma vez sem erro.
-- =====================================================================
SET NAMES utf8mb4;

ALTER TABLE eventos MODIFY COLUMN tipo ENUM('evento','feriado','recesso','prova','reuniao','conselho','bimestre','letivo') NOT NULL DEFAULT 'evento';
ALTER TABLE eventos MODIFY COLUMN descricao VARCHAR(1000) NULL;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'eventos' AND column_name = 'hora_inicio');
SET @sql := IF(@existe = 0, 'ALTER TABLE eventos ADD COLUMN hora_inicio TIME NULL AFTER data_fim', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'eventos' AND column_name = 'hora_fim');
SET @sql := IF(@existe = 0, 'ALTER TABLE eventos ADD COLUMN hora_fim TIME NULL AFTER hora_inicio', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'eventos' AND column_name = 'lugar');
SET @sql := IF(@existe = 0, 'ALTER TABLE eventos ADD COLUMN lugar VARCHAR(120) NULL AFTER hora_fim', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'eventos' AND column_name = 'alcance');
SET @sql := IF(@existe = 0, 'ALTER TABLE eventos ADD COLUMN alcance ENUM(''todos'',''segmentos'',''turmas'') NOT NULL DEFAULT ''todos'' AFTER tipo', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'eventos' AND column_name = 'segmentos');
SET @sql := IF(@existe = 0, 'ALTER TABLE eventos ADD COLUMN segmentos VARCHAR(80) NULL AFTER alcance', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'eventos' AND column_name = 'visivel_familias');
SET @sql := IF(@existe = 0, 'ALTER TABLE eventos ADD COLUMN visivel_familias TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''0 = só a equipe vê (ex.: conselho de classe)'' AFTER segmentos', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'eventos' AND column_name = 'criado_por');
SET @sql := IF(@existe = 0, 'ALTER TABLE eventos ADD COLUMN criado_por INT UNSIGNED NULL AFTER descricao', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'eventos' AND column_name = 'atualizado_por');
SET @sql := IF(@existe = 0, 'ALTER TABLE eventos ADD COLUMN atualizado_por INT UNSIGNED NULL AFTER criado_em', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'eventos' AND column_name = 'atualizado_em');
SET @sql := IF(@existe = 0, 'ALTER TABLE eventos ADD COLUMN atualizado_em DATETIME NULL AFTER atualizado_por', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

CREATE TABLE IF NOT EXISTS evento_turmas (
  evento_id  INT UNSIGNED NOT NULL,
  turma_id   INT UNSIGNED NOT NULL,
  PRIMARY KEY (evento_id, turma_id),
  KEY idx_evt_turma (turma_id),
  CONSTRAINT fk_evt_evento FOREIGN KEY (evento_id) REFERENCES eventos (id) ON DELETE CASCADE,
  CONSTRAINT fk_evt_turma  FOREIGN KEY (turma_id)  REFERENCES turmas (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS periodos_letivos (
  colegio_id  INT UNSIGNED      NOT NULL,
  ano         SMALLINT UNSIGNED NOT NULL,
  bimestre    TINYINT UNSIGNED  NOT NULL COMMENT '1 a 4',
  inicio      DATE              NOT NULL,
  fim         DATE              NOT NULL,
  PRIMARY KEY (colegio_id, ano, bimestre),
  CONSTRAINT fk_periodo_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT ck_periodo_bimestre CHECK (bimestre BETWEEN 1 AND 4),
  CONSTRAINT ck_periodo_datas CHECK (fim >= inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
