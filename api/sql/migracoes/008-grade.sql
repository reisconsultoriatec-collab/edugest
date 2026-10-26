-- =====================================================================
--  EduGest — migração 008: grade horária
--  - horarios_aula: aulas e intervalos de cada turno (início e fim)
--  - grade_horaria: refeita ligada a horarios_aula (a versão anterior,
--    com o horário solto em TIME, nunca foi usada pelo sistema)
--  Escrita para poder rodar mais de uma vez sem erro.
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS horarios_aula (
  id          INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  colegio_id  INT UNSIGNED     NOT NULL,
  periodo     ENUM('matutino','vespertino','integral','noturno') NOT NULL,
  ordem       TINYINT UNSIGNED NOT NULL,
  inicio      TIME             NOT NULL,
  fim         TIME             NOT NULL,
  tipo        ENUM('aula','intervalo') NOT NULL DEFAULT 'aula',
  PRIMARY KEY (id),
  KEY idx_horario_periodo (colegio_id, periodo, ordem),
  CONSTRAINT fk_horario_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT ck_horario_fim CHECK (fim > inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Tabela antiga (sem horario_id): remove para criar a nova
SET @existe := (SELECT COUNT(*) FROM information_schema.tables
                 WHERE table_schema = DATABASE() AND table_name = 'grade_horaria');
SET @nova := (SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema = DATABASE() AND table_name = 'grade_horaria' AND column_name = 'horario_id');
SET @sql := IF(@existe = 1 AND @nova = 0, 'DROP TABLE grade_horaria', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

CREATE TABLE IF NOT EXISTS grade_horaria (
  id             INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  colegio_id     INT UNSIGNED     NOT NULL,
  turma_id       INT UNSIGNED     NOT NULL,
  dia_semana     TINYINT UNSIGNED NOT NULL COMMENT '1 = segunda ... 6 = sábado',
  horario_id     INT UNSIGNED     NOT NULL,
  disciplina_id  INT UNSIGNED     NULL,
  professor_id   INT UNSIGNED     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_grade_aula (turma_id, dia_semana, horario_id),
  KEY idx_grade_professor (professor_id, dia_semana),
  CONSTRAINT fk_grade_colegio    FOREIGN KEY (colegio_id)    REFERENCES colegios (id)      ON DELETE CASCADE,
  CONSTRAINT fk_grade_turma      FOREIGN KEY (turma_id)      REFERENCES turmas (id)        ON DELETE CASCADE,
  CONSTRAINT fk_grade_horario    FOREIGN KEY (horario_id)    REFERENCES horarios_aula (id) ON DELETE CASCADE,
  CONSTRAINT fk_grade_disciplina FOREIGN KEY (disciplina_id) REFERENCES disciplinas (id)   ON DELETE SET NULL,
  CONSTRAINT fk_grade_professor  FOREIGN KEY (professor_id)  REFERENCES professores (id)   ON DELETE SET NULL,
  CONSTRAINT ck_grade_dia CHECK (dia_semana BETWEEN 1 AND 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
