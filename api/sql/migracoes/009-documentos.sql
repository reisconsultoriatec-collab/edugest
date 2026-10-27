-- =====================================================================
--  EduGest — migração 009: documentos escolares (secretaria)
--  - colegios: INEP, UF, ato de autorização, diretor(a) e secretário(a)
--  - colegio_logos: logotipo do colégio (JPEG), usado em todos os PDFs
--  - alunos: filiação, naturalidade, nacionalidade, datas de matrícula e saída
--  - documento_modelos: textos das declarações ajustados por colégio
--    (sem linha = usa o modelo padrão do sistema)
--  - historico_anos: anos anteriores digitados e ajustes dos anos feitos
--    no EduGest (carga horária, dias letivos, resultado)
--  - documentos_emitidos: livro de registro (número, código de validação
--    e o conteúdo impresso, para a 2ª via sair idêntica)
--  Escrita para poder rodar mais de uma vez sem erro.
-- =====================================================================
SET NAMES utf8mb4;

-- ---------- colegios ----------
SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'colegios' AND column_name = 'inep');
SET @sql := IF(@existe = 0, 'ALTER TABLE colegios ADD COLUMN inep VARCHAR(12) NULL AFTER endereco', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'colegios' AND column_name = 'uf');
SET @sql := IF(@existe = 0, 'ALTER TABLE colegios ADD COLUMN uf CHAR(2) NULL AFTER inep', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'colegios' AND column_name = 'ato_autorizacao');
SET @sql := IF(@existe = 0, 'ALTER TABLE colegios ADD COLUMN ato_autorizacao VARCHAR(300) NULL AFTER uf', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'colegios' AND column_name = 'diretor_nome');
SET @sql := IF(@existe = 0, 'ALTER TABLE colegios ADD COLUMN diretor_nome VARCHAR(100) NULL AFTER ato_autorizacao', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'colegios' AND column_name = 'diretor_registro');
SET @sql := IF(@existe = 0, 'ALTER TABLE colegios ADD COLUMN diretor_registro VARCHAR(40) NULL AFTER diretor_nome', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'colegios' AND column_name = 'secretario_nome');
SET @sql := IF(@existe = 0, 'ALTER TABLE colegios ADD COLUMN secretario_nome VARCHAR(100) NULL AFTER diretor_registro', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'colegios' AND column_name = 'secretario_registro');
SET @sql := IF(@existe = 0, 'ALTER TABLE colegios ADD COLUMN secretario_registro VARCHAR(40) NULL AFTER secretario_nome', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- alunos ----------
SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'alunos' AND column_name = 'mae_nome');
SET @sql := IF(@existe = 0, 'ALTER TABLE alunos ADD COLUMN mae_nome VARCHAR(100) NULL AFTER endereco', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'alunos' AND column_name = 'pai_nome');
SET @sql := IF(@existe = 0, 'ALTER TABLE alunos ADD COLUMN pai_nome VARCHAR(100) NULL AFTER mae_nome', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'alunos' AND column_name = 'naturalidade');
SET @sql := IF(@existe = 0, 'ALTER TABLE alunos ADD COLUMN naturalidade VARCHAR(60) NULL AFTER pai_nome', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'alunos' AND column_name = 'naturalidade_uf');
SET @sql := IF(@existe = 0, 'ALTER TABLE alunos ADD COLUMN naturalidade_uf CHAR(2) NULL AFTER naturalidade', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'alunos' AND column_name = 'nacionalidade');
SET @sql := IF(@existe = 0, 'ALTER TABLE alunos ADD COLUMN nacionalidade VARCHAR(40) NULL AFTER naturalidade_uf', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'alunos' AND column_name = 'data_matricula');
SET @sql := IF(@existe = 0, 'ALTER TABLE alunos ADD COLUMN data_matricula DATE NULL AFTER nacionalidade', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'alunos' AND column_name = 'data_saida');
SET @sql := IF(@existe = 0, 'ALTER TABLE alunos ADD COLUMN data_saida DATE NULL AFTER data_matricula', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- logotipo ----------
CREATE TABLE IF NOT EXISTS colegio_logos (
  colegio_id     INT UNSIGNED      NOT NULL,
  imagem         MEDIUMBLOB        NOT NULL COMMENT 'JPEG',
  largura        SMALLINT UNSIGNED NOT NULL,
  altura         SMALLINT UNSIGNED NOT NULL,
  componentes    TINYINT UNSIGNED  NOT NULL DEFAULT 3 COMMENT '1 = tons de cinza, 3 = colorido',
  atualizado_por INT UNSIGNED      NULL,
  atualizado_em  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (colegio_id),
  CONSTRAINT fk_logo_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------- modelos de texto ----------
CREATE TABLE IF NOT EXISTS documento_modelos (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id     INT UNSIGNED NOT NULL,
  chave          VARCHAR(20)  NOT NULL COMMENT 'matricula, frequencia, transferencia, conclusao, historico ou livre',
  titulo         VARCHAR(120) NOT NULL,
  texto          TEXT         NOT NULL,
  atualizado_por INT UNSIGNED NULL,
  atualizado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_modelos_colegio (colegio_id, chave),
  CONSTRAINT fk_modelo_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------- histórico escolar ----------
CREATE TABLE IF NOT EXISTS historico_anos (
  id             INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  colegio_id     INT UNSIGNED      NOT NULL,
  aluno_id       INT UNSIGNED      NOT NULL,
  turma_id       INT UNSIGNED      NULL     COMMENT 'Preenchido = ajuste de um ano feito no EduGest',
  ano            SMALLINT UNSIGNED NOT NULL,
  serie          VARCHAR(40)       NOT NULL,
  escola         VARCHAR(120)      NULL,
  cidade         VARCHAR(60)       NULL,
  uf             CHAR(2)           NULL,
  dias_letivos   SMALLINT UNSIGNED NULL,
  carga_horaria  SMALLINT UNSIGNED NULL     COMMENT 'Horas no ano',
  frequencia     DECIMAL(5,2)      NULL     COMMENT 'Percentual',
  resultado      VARCHAR(30)       NULL,
  disciplinas    TEXT              NULL     COMMENT 'JSON [{nome, nota, ch}] dos anos digitados',
  observacao     VARCHAR(300)      NULL,
  atualizado_por INT UNSIGNED      NULL,
  atualizado_em  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hist_turma (aluno_id, turma_id),
  KEY idx_hist_aluno (aluno_id, ano),
  CONSTRAINT fk_hist_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT fk_hist_aluno   FOREIGN KEY (aluno_id)   REFERENCES alunos (id)   ON DELETE CASCADE,
  CONSTRAINT fk_hist_turma   FOREIGN KEY (turma_id)   REFERENCES turmas (id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------- livro de registro ----------
CREATE TABLE IF NOT EXISTS documentos_emitidos (
  id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  colegio_id          INT UNSIGNED      NOT NULL,
  ano                 SMALLINT UNSIGNED NOT NULL,
  numero              INT UNSIGNED      NOT NULL COMMENT 'Sequência por colégio e ano',
  codigo              CHAR(12)          NOT NULL COMMENT 'Código de validação (QR Code)',
  tipo                VARCHAR(20)       NOT NULL,
  titulo              VARCHAR(120)      NOT NULL,
  aluno_id            INT UNSIGNED      NULL,
  aluno_nome          VARCHAR(100)      NOT NULL,
  aluno_ra            VARCHAR(20)       NULL,
  finalidade          VARCHAR(150)      NULL,
  conteudo            MEDIUMTEXT        NOT NULL COMMENT 'JSON com o que foi impresso',
  emitido_por         INT UNSIGNED      NULL,
  emitido_por_nome    VARCHAR(100)      NULL,
  emitido_em          DATETIME          NOT NULL,
  cancelado_em        DATETIME          NULL,
  cancelado_por_nome  VARCHAR(100)      NULL,
  motivo_cancelamento VARCHAR(200)      NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_doc_numero (colegio_id, ano, numero),
  UNIQUE KEY uk_doc_codigo (codigo),
  KEY idx_doc_aluno (aluno_id),
  KEY idx_doc_data (colegio_id, emitido_em),
  CONSTRAINT fk_doc_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_aluno   FOREIGN KEY (aluno_id)   REFERENCES alunos (id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
