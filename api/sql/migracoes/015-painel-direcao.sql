-- =====================================================================
--  EduGest — migração 015: Painel da Direção
--  usuario_colegio.direcao: administradores marcados como alta direção
--  (veem o Painel da Direção). Só acrescenta. Pode rodar mais de uma vez.
-- =====================================================================
SET NAMES utf8mb4;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'usuario_colegio' AND column_name = 'direcao');
SET @sql := IF(@existe = 0, 'ALTER TABLE usuario_colegio
  ADD COLUMN direcao TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''Alta direção: vê o Painel da Direção (só administradores)'' AFTER modulos', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
