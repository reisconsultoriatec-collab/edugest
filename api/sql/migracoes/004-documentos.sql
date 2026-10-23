-- =====================================================================
--  EduGest — migração 004: documentos de cobrança
--  - config_colegio: chave PIX, beneficiário, cidade, instruções impressas
--    nas cobranças e validade dos links enviados por WhatsApp
--  - alunos.resp_cpf_cript: CPF do responsável financeiro (criptografado),
--    usado na declaração anual de pagamentos (Imposto de Renda)
--  Escrita para poder rodar mais de uma vez sem erro.
-- =====================================================================
SET NAMES utf8mb4;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'config_colegio' AND column_name = 'pix_tipo');
SET @sql := IF(@existe = 0, 'ALTER TABLE config_colegio ADD COLUMN pix_tipo VARCHAR(10) NULL COMMENT ''cpf, cnpj, celular, email ou aleatoria'' AFTER timeout_sessao_min', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'config_colegio' AND column_name = 'pix_chave');
SET @sql := IF(@existe = 0, 'ALTER TABLE config_colegio ADD COLUMN pix_chave VARCHAR(80) NULL AFTER pix_tipo', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'config_colegio' AND column_name = 'pix_beneficiario');
SET @sql := IF(@existe = 0, 'ALTER TABLE config_colegio ADD COLUMN pix_beneficiario VARCHAR(60) NULL COMMENT ''Nome exibido no PIX'' AFTER pix_chave', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'config_colegio' AND column_name = 'cidade');
SET @sql := IF(@existe = 0, 'ALTER TABLE config_colegio ADD COLUMN cidade VARCHAR(60) NULL COMMENT ''Cidade do PIX e dos documentos'' AFTER pix_beneficiario', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'config_colegio' AND column_name = 'cobranca_instrucoes');
SET @sql := IF(@existe = 0, 'ALTER TABLE config_colegio ADD COLUMN cobranca_instrucoes VARCHAR(300) NULL COMMENT ''Texto impresso nas cobranças'' AFTER cidade', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'config_colegio' AND column_name = 'link_validade_dias');
SET @sql := IF(@existe = 0, 'ALTER TABLE config_colegio ADD COLUMN link_validade_dias SMALLINT UNSIGNED NOT NULL DEFAULT 30 COMMENT ''Validade dos links enviados por WhatsApp'' AFTER cobranca_instrucoes', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'alunos' AND column_name = 'resp_cpf_cript');
SET @sql := IF(@existe = 0, 'ALTER TABLE alunos ADD COLUMN resp_cpf_cript VARCHAR(255) NULL COMMENT ''CPF do responsável financeiro (AES-256-GCM)'' AFTER resp_parentesco', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
