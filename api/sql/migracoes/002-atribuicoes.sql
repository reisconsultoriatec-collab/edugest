-- =====================================================================
--  EduGest — migração 002: atribuição de aulas (turma × disciplina → professor)
--  Define quais turmas e disciplinas cada professor vê no diário e nas notas.
--  Aplicada automaticamente pelo deploy/atualizar-edugest.sh
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS atribuicoes (
  colegio_id     INT UNSIGNED NOT NULL,
  turma_id       INT UNSIGNED NOT NULL,
  disciplina_id  INT UNSIGNED NOT NULL,
  professor_id   INT UNSIGNED NOT NULL,
  atualizado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (turma_id, disciplina_id),
  KEY idx_atrib_professor (professor_id),
  KEY idx_atrib_disciplina (disciplina_id),
  KEY idx_atrib_colegio (colegio_id),
  CONSTRAINT fk_atrib_colegio    FOREIGN KEY (colegio_id)    REFERENCES colegios (id)    ON DELETE CASCADE,
  CONSTRAINT fk_atrib_turma      FOREIGN KEY (turma_id)      REFERENCES turmas (id)      ON DELETE CASCADE,
  CONSTRAINT fk_atrib_disciplina FOREIGN KEY (disciplina_id) REFERENCES disciplinas (id) ON DELETE CASCADE,
  CONSTRAINT fk_atrib_professor  FOREIGN KEY (professor_id)  REFERENCES professores (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
