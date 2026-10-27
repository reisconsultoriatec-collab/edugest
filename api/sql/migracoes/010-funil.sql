-- =====================================================================
--  EduGest — migração 010: funil de matrículas
--  - leads: data de nascimento, ano e turno pretendidos, próximo contato,
--    visita agendada, motivo da perda, aluno criado na matrícula, origem
--    pelo formulário público (com data do consentimento), quando a equipe
--    viu o cadastro e desde quando está na etapa atual
--  - lead_interacoes: histórico de contatos, anotações e mudanças de etapa
--  - funil_config: formulário público de interesse (link do colégio)
--  Escrita para poder rodar mais de uma vez sem erro.
-- =====================================================================
SET NAMES utf8mb4;

-- Série e origem com nomes um pouco maiores
ALTER TABLE leads MODIFY COLUMN serie_pretendida VARCHAR(40) NULL;
ALTER TABLE leads MODIFY COLUMN origem VARCHAR(40) NULL;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'nascimento');
SET @sql := IF(@existe = 0, 'ALTER TABLE leads ADD COLUMN nascimento DATE NULL AFTER nome_aluno', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'ano_pretendido');
SET @sql := IF(@existe = 0, 'ALTER TABLE leads ADD COLUMN ano_pretendido SMALLINT UNSIGNED NULL AFTER serie_pretendida', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'turno_pretendido');
SET @sql := IF(@existe = 0, 'ALTER TABLE leads ADD COLUMN turno_pretendido VARCHAR(20) NULL AFTER ano_pretendido', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'proximo_contato');
SET @sql := IF(@existe = 0, 'ALTER TABLE leads ADD COLUMN proximo_contato DATE NULL AFTER obs', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'visita_em');
SET @sql := IF(@existe = 0, 'ALTER TABLE leads ADD COLUMN visita_em DATETIME NULL AFTER proximo_contato', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'motivo_perda');
SET @sql := IF(@existe = 0, 'ALTER TABLE leads ADD COLUMN motivo_perda VARCHAR(60) NULL AFTER visita_em', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'aluno_id');
SET @sql := IF(@existe = 0, 'ALTER TABLE leads ADD COLUMN aluno_id INT UNSIGNED NULL AFTER motivo_perda', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'via_formulario');
SET @sql := IF(@existe = 0, 'ALTER TABLE leads ADD COLUMN via_formulario TINYINT(1) NOT NULL DEFAULT 0 AFTER aluno_id', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'consentimento_em');
SET @sql := IF(@existe = 0, 'ALTER TABLE leads ADD COLUMN consentimento_em DATETIME NULL AFTER via_formulario', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'visto_em');
SET @sql := IF(@existe = 0, 'ALTER TABLE leads ADD COLUMN visto_em DATETIME NULL AFTER consentimento_em', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'etapa_em');
SET @sql := IF(@existe = 0, 'ALTER TABLE leads ADD COLUMN etapa_em DATETIME NULL AFTER visto_em', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'criado_por');
SET @sql := IF(@existe = 0, 'ALTER TABLE leads ADD COLUMN criado_por INT UNSIGNED NULL AFTER etapa_em', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'atualizado_por');
SET @sql := IF(@existe = 0, 'ALTER TABLE leads ADD COLUMN atualizado_por INT UNSIGNED NULL AFTER criado_por', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

UPDATE leads SET etapa_em = COALESCE(etapa_em, atualizado_em, criado_em) WHERE etapa_em IS NULL;

SET @existe := (SELECT COUNT(*) FROM information_schema.table_constraints
                 WHERE table_schema = DATABASE() AND table_name = 'leads' AND constraint_name = 'fk_leads_aluno');
SET @sql := IF(@existe = 0, 'ALTER TABLE leads ADD CONSTRAINT fk_leads_aluno FOREIGN KEY (aluno_id) REFERENCES alunos (id) ON DELETE SET NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.statistics
                 WHERE table_schema = DATABASE() AND table_name = 'leads' AND index_name = 'idx_leads_contato');
SET @sql := IF(@existe = 0, 'ALTER TABLE leads ADD KEY idx_leads_contato (colegio_id, proximo_contato)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- histórico de contatos ----------
CREATE TABLE IF NOT EXISTS lead_interacoes (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id    INT UNSIGNED NOT NULL,
  lead_id       INT UNSIGNED NOT NULL,
  tipo          ENUM('nota','contato','etapa','sistema') NOT NULL DEFAULT 'nota',
  texto         VARCHAR(600) NOT NULL,
  usuario_id    INT UNSIGNED NULL,
  usuario_nome  VARCHAR(100) NULL,
  criado_em     DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_interacoes_lead (lead_id, criado_em),
  CONSTRAINT fk_interacao_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT fk_interacao_lead    FOREIGN KEY (lead_id)    REFERENCES leads (id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------- formulário público ----------
CREATE TABLE IF NOT EXISTS funil_config (
  colegio_id     INT UNSIGNED NOT NULL,
  ativo          TINYINT(1)   NOT NULL DEFAULT 0,
  token          CHAR(16)     NOT NULL COMMENT 'Parte do link público (trocar o link invalida o antigo)',
  titulo         VARCHAR(120) NULL,
  mensagem       VARCHAR(500) NULL,
  atualizado_por INT UNSIGNED NULL,
  atualizado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (colegio_id),
  UNIQUE KEY uk_funil_token (token),
  CONSTRAINT fk_funil_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
