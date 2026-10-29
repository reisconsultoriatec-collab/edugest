-- =====================================================================
--  016 — Painel da Direção: percentual de alerta da presença em sala
--  definido pela direção de cada colégio (padrão 60%).
--  Idempotente: só cria a coluna se ainda não existir.
-- =====================================================================
SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'config_colegio' AND column_name = 'alerta_presenca');
SET @sql := IF(@existe = 0,
  'ALTER TABLE config_colegio ADD COLUMN alerta_presenca TINYINT UNSIGNED NOT NULL DEFAULT 60 COMMENT ''Painel da Direção: turma abaixo deste % de presença no dia fica em alerta'' AFTER frequencia_minima',
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
