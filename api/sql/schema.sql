-- =====================================================================
--  EduGest — Schema MySQL 9  |  Reis Tecnologia
--  Banco: edugest  |  utf8mb4  |  Fuso: America/Sao_Paulo (-03:00)
--
--  Regras gerais:
--   * Toda tabela de negócio tem colegio_id (isolamento multi-colégio).
--   * Perfil e status do usuário são POR COLÉGIO (tabela usuario_colegio).
--   * CPF/RG são gravados criptografados (AES-256-GCM) pela API.
--   * "Vencido" não é gravado: é mensalidade pendente com vencimento < hoje.
--   * Notas ficam presas à turma, e a turma tem ano_letivo.
--
--  Carga:  executar como root dentro do banco edugest (ver GUIA-FASE1.md)
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '-03:00';

-- ---------------------------------------------------------------------
-- COLÉGIOS E USUÁRIOS
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS colegios (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome              VARCHAR(120) NOT NULL,
  cnpj              VARCHAR(18)  NULL,
  telefone          VARCHAR(20)  NULL,
  email             VARCHAR(120) NULL,
  endereco          VARCHAR(200) NULL,
  codigo_convite    CHAR(10)     NOT NULL COMMENT 'Código para equipe se vincular ao colégio',
  whatsapp_notif    VARCHAR(20)  NULL     COMMENT 'Recebe aviso de novos cadastros',
  criado_por        INT UNSIGNED NULL     COMMENT 'usuarios.id (sem FK para evitar ciclo)',
  ativo             TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_colegios_codigo (codigo_convite)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS usuarios (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  firebase_uid      VARCHAR(128) NOT NULL,
  nome              VARCHAR(100) NOT NULL,
  email             VARCHAR(160) NOT NULL,
  colegio_atual_id  INT UNSIGNED NULL     COMMENT 'Último colégio selecionado',
  tour_concluido    TINYINT(1)   NOT NULL DEFAULT 0,
  ultimo_acesso     DATETIME     NULL,
  ultimo_ip         VARCHAR(45)  NULL,
  criado_em         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_usuarios_uid (firebase_uid),
  UNIQUE KEY uk_usuarios_email (email),
  CONSTRAINT fk_usuarios_colegio FOREIGN KEY (colegio_atual_id) REFERENCES colegios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS usuario_colegio (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id        INT UNSIGNED NOT NULL,
  colegio_id        INT UNSIGNED NOT NULL,
  perfil            ENUM('admin','professor','financeiro','responsavel') NOT NULL,
  status            ENUM('pendente','ativo','bloqueado') NOT NULL DEFAULT 'pendente',
  modulos           JSON         NULL     COMMENT 'NULL = módulos padrão do perfil',
  aprovado_por      INT UNSIGNED NULL,
  aprovado_em       DATETIME     NULL,
  criado_em         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_uc_usuario_colegio (usuario_id, colegio_id),
  KEY idx_uc_colegio_status (colegio_id, status),
  CONSTRAINT fk_uc_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_uc_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS config_colegio (
  colegio_id          INT UNSIGNED      NOT NULL,
  ano_letivo          SMALLINT UNSIGNED NOT NULL,
  valor_mensalidade   DECIMAL(10,2)     NOT NULL DEFAULT 0.00,
  dia_vencimento      TINYINT UNSIGNED  NOT NULL DEFAULT 10,
  media_aprovacao     DECIMAL(4,2)      NOT NULL DEFAULT 6.00,
  frequencia_minima   TINYINT UNSIGNED  NOT NULL DEFAULT 75 COMMENT 'Percentual mínimo de presença',
  timeout_sessao_min  SMALLINT UNSIGNED NOT NULL DEFAULT 15 COMMENT '0 = desativado',
  atualizado_em       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (colegio_id),
  CONSTRAINT fk_config_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT ck_config_dia CHECK (dia_vencimento BETWEEN 1 AND 28),
  CONSTRAINT ck_config_media CHECK (media_aprovacao BETWEEN 0 AND 10),
  CONSTRAINT ck_config_freq CHECK (frequencia_minima <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- PEDAGÓGICO
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS disciplinas (
  id          INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  colegio_id  INT UNSIGNED      NOT NULL,
  nome        VARCHAR(60)       NOT NULL,
  ordem       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ativo       TINYINT(1)        NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uk_disciplinas_nome (colegio_id, nome),
  CONSTRAINT fk_disciplinas_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS turmas (
  id          INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  colegio_id  INT UNSIGNED      NOT NULL,
  ano_letivo  SMALLINT UNSIGNED NOT NULL,
  nome        VARCHAR(50)       NOT NULL,
  serie       VARCHAR(30)       NOT NULL,
  periodo     ENUM('matutino','vespertino','integral','noturno') NOT NULL DEFAULT 'matutino',
  capacidade  SMALLINT UNSIGNED NOT NULL DEFAULT 35,
  sala        VARCHAR(30)       NULL,
  ativo       TINYINT(1)        NOT NULL DEFAULT 1,
  criado_em   DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_turmas_nome_ano (colegio_id, ano_letivo, nome),
  CONSTRAINT fk_turmas_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS professores (
  id             INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  colegio_id     INT UNSIGNED      NOT NULL,
  usuario_id     INT UNSIGNED      NULL     COMMENT 'Login do professor, se tiver',
  nome           VARCHAR(100)      NOT NULL,
  cpf_cript      VARCHAR(255)      NULL,
  telefone       VARCHAR(20)       NULL,
  email          VARCHAR(160)      NULL,
  carga_horaria  SMALLINT UNSIGNED NULL     COMMENT 'Horas semanais',
  status         ENUM('ativo','inativo') NOT NULL DEFAULT 'ativo',
  criado_em      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_professores_colegio (colegio_id, status),
  CONSTRAINT fk_professores_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT fk_professores_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS professor_disciplina (
  professor_id   INT UNSIGNED NOT NULL,
  disciplina_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (professor_id, disciplina_id),
  CONSTRAINT fk_pd_professor  FOREIGN KEY (professor_id)  REFERENCES professores (id) ON DELETE CASCADE,
  CONSTRAINT fk_pd_disciplina FOREIGN KEY (disciplina_id) REFERENCES disciplinas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS alunos (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id       INT UNSIGNED NOT NULL,
  ra               VARCHAR(20)  NOT NULL,
  nome             VARCHAR(100) NOT NULL,
  nascimento       DATE         NULL,
  cpf_cript        VARCHAR(255) NULL,
  rg_cript         VARCHAR(255) NULL,
  endereco         VARCHAR(200) NULL,
  turma_id         INT UNSIGNED NULL,
  status           ENUM('ativo','inativo','transferido') NOT NULL DEFAULT 'ativo',
  codigo_acesso    CHAR(9)      NOT NULL COMMENT 'PAI + 6 caracteres, para o responsável',
  resp_nome        VARCHAR(100) NULL,
  resp_parentesco  VARCHAR(20)  NULL,
  resp_telefone    VARCHAR(20)  NULL,
  resp_email       VARCHAR(160) NULL,
  criado_em        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_alunos_ra (colegio_id, ra),
  UNIQUE KEY uk_alunos_codigo (codigo_acesso),
  KEY idx_alunos_turma (turma_id, status),
  KEY idx_alunos_nome (colegio_id, nome),
  CONSTRAINT fk_alunos_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT fk_alunos_turma   FOREIGN KEY (turma_id)   REFERENCES turmas (id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS responsavel_aluno (
  usuario_id   INT UNSIGNED NOT NULL,
  aluno_id     INT UNSIGNED NOT NULL,
  colegio_id   INT UNSIGNED NOT NULL,
  parentesco   VARCHAR(20)  NULL,
  criado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, aluno_id),
  KEY idx_ra_aluno (aluno_id),
  CONSTRAINT fk_ra_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_ra_aluno   FOREIGN KEY (aluno_id)   REFERENCES alunos (id)   ON DELETE CASCADE,
  CONSTRAINT fk_ra_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS grade_horaria (
  id             INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  colegio_id     INT UNSIGNED     NOT NULL,
  turma_id       INT UNSIGNED     NOT NULL,
  dia_semana     TINYINT UNSIGNED NOT NULL COMMENT '1 = segunda ... 6 = sábado',
  horario        TIME             NOT NULL,
  disciplina_id  INT UNSIGNED     NULL,
  professor_id   INT UNSIGNED     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_grade_slot (turma_id, dia_semana, horario),
  KEY idx_grade_professor (professor_id, dia_semana, horario),
  CONSTRAINT fk_grade_colegio    FOREIGN KEY (colegio_id)    REFERENCES colegios (id)    ON DELETE CASCADE,
  CONSTRAINT fk_grade_turma      FOREIGN KEY (turma_id)      REFERENCES turmas (id)      ON DELETE CASCADE,
  CONSTRAINT fk_grade_disciplina FOREIGN KEY (disciplina_id) REFERENCES disciplinas (id) ON DELETE SET NULL,
  CONSTRAINT fk_grade_professor  FOREIGN KEY (professor_id)  REFERENCES professores (id) ON DELETE SET NULL,
  CONSTRAINT ck_grade_dia CHECK (dia_semana BETWEEN 1 AND 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS diarios (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id     INT UNSIGNED NOT NULL,
  turma_id       INT UNSIGNED NOT NULL,
  data           DATE         NOT NULL,
  disciplina_id  INT UNSIGNED NULL     COMMENT 'NULL = chamada do dia (Ed. Infantil / Fund. I)',
  professor_id   INT UNSIGNED NULL,
  conteudo       TEXT         NULL,
  criado_por     INT UNSIGNED NULL,
  criado_em      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_diarios_turma_data (turma_id, data),
  CONSTRAINT fk_diarios_colegio    FOREIGN KEY (colegio_id)    REFERENCES colegios (id)    ON DELETE CASCADE,
  CONSTRAINT fk_diarios_turma      FOREIGN KEY (turma_id)      REFERENCES turmas (id)      ON DELETE CASCADE,
  CONSTRAINT fk_diarios_disciplina FOREIGN KEY (disciplina_id) REFERENCES disciplinas (id) ON DELETE SET NULL,
  CONSTRAINT fk_diarios_professor  FOREIGN KEY (professor_id)  REFERENCES professores (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS frequencias (
  diario_id   INT UNSIGNED NOT NULL,
  aluno_id    INT UNSIGNED NOT NULL,
  colegio_id  INT UNSIGNED NOT NULL,
  status      ENUM('P','F','J') NOT NULL COMMENT 'Presente / Falta / Justificada',
  PRIMARY KEY (diario_id, aluno_id),
  KEY idx_freq_aluno (aluno_id, status),
  CONSTRAINT fk_freq_diario  FOREIGN KEY (diario_id)  REFERENCES diarios (id)  ON DELETE CASCADE,
  CONSTRAINT fk_freq_aluno   FOREIGN KEY (aluno_id)   REFERENCES alunos (id)   ON DELETE CASCADE,
  CONSTRAINT fk_freq_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS notas (
  id             INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  colegio_id     INT UNSIGNED     NOT NULL,
  turma_id       INT UNSIGNED     NOT NULL COMMENT 'A turma carrega o ano letivo',
  aluno_id       INT UNSIGNED     NOT NULL,
  disciplina_id  INT UNSIGNED     NOT NULL,
  bimestre       TINYINT UNSIGNED NOT NULL,
  n1             DECIMAL(4,2)     NULL,
  n2             DECIMAL(4,2)     NULL,
  trabalho       DECIMAL(4,2)     NULL,
  atualizado_por INT UNSIGNED     NULL,
  atualizado_em  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_notas (aluno_id, turma_id, disciplina_id, bimestre),
  KEY idx_notas_turma (turma_id, disciplina_id, bimestre),
  CONSTRAINT fk_notas_colegio    FOREIGN KEY (colegio_id)    REFERENCES colegios (id)    ON DELETE CASCADE,
  CONSTRAINT fk_notas_turma      FOREIGN KEY (turma_id)      REFERENCES turmas (id)      ON DELETE CASCADE,
  CONSTRAINT fk_notas_aluno      FOREIGN KEY (aluno_id)      REFERENCES alunos (id)      ON DELETE CASCADE,
  CONSTRAINT fk_notas_disciplina FOREIGN KEY (disciplina_id) REFERENCES disciplinas (id) ON DELETE CASCADE,
  CONSTRAINT ck_notas_bimestre CHECK (bimestre BETWEEN 1 AND 4),
  CONSTRAINT ck_notas_n1   CHECK (n1 IS NULL OR n1 BETWEEN 0 AND 10),
  CONSTRAINT ck_notas_n2   CHECK (n2 IS NULL OR n2 BETWEEN 0 AND 10),
  CONSTRAINT ck_notas_trab CHECK (trabalho IS NULL OR trabalho BETWEEN 0 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS eventos (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id  INT UNSIGNED NOT NULL,
  titulo      VARCHAR(150) NOT NULL,
  data        DATE         NOT NULL,
  data_fim    DATE         NULL,
  tipo        ENUM('evento','feriado','reuniao','conselho','bimestre','prova','recesso') NOT NULL DEFAULT 'evento',
  descricao   VARCHAR(500) NULL,
  criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_eventos_data (colegio_id, data),
  CONSTRAINT fk_eventos_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- FINANCEIRO
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bolsas (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id       INT UNSIGNED NOT NULL,
  aluno_id         INT UNSIGNED NOT NULL,
  tipo             VARCHAR(40)  NOT NULL,
  percentual       DECIMAL(5,2) NOT NULL,
  vigencia_inicio  DATE         NULL,
  vigencia_fim     DATE         NULL COMMENT 'NULL = indeterminada',
  motivo           VARCHAR(500) NULL,
  ativo            TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bolsas_aluno (aluno_id, ativo),
  CONSTRAINT fk_bolsas_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT fk_bolsas_aluno   FOREIGN KEY (aluno_id)   REFERENCES alunos (id)   ON DELETE CASCADE,
  CONSTRAINT ck_bolsas_pct CHECK (percentual > 0 AND percentual <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mensalidades (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  colegio_id       INT UNSIGNED  NOT NULL,
  aluno_id         INT UNSIGNED  NOT NULL,
  referencia       CHAR(7)       NOT NULL COMMENT 'AAAA-MM',
  vencimento       DATE          NOT NULL,
  valor_bruto      DECIMAL(10,2) NOT NULL,
  desconto         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  valor            DECIMAL(10,2) NOT NULL COMMENT 'valor_bruto - desconto',
  bolsa_id         INT UNSIGNED  NULL,
  status           ENUM('pendente','pago','cancelado') NOT NULL DEFAULT 'pendente',
  data_pagamento   DATE          NULL,
  forma_pagamento  VARCHAR(30)   NULL,
  criado_em        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_mens_aluno_ref (aluno_id, referencia),
  KEY idx_mens_colegio_status (colegio_id, status, vencimento),
  KEY idx_mens_referencia (colegio_id, referencia),
  CONSTRAINT fk_mens_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT fk_mens_aluno   FOREIGN KEY (aluno_id)   REFERENCES alunos (id)   ON DELETE RESTRICT,
  CONSTRAINT fk_mens_bolsa   FOREIGN KEY (bolsa_id)   REFERENCES bolsas (id)   ON DELETE SET NULL,
  CONSTRAINT ck_mens_valor CHECK (valor >= 0 AND desconto >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS contas_pagar (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  colegio_id       INT UNSIGNED  NOT NULL,
  descricao        VARCHAR(150)  NOT NULL,
  categoria        VARCHAR(40)   NOT NULL DEFAULT 'Outros',
  fornecedor       VARCHAR(100)  NULL,
  valor            DECIMAL(10,2) NOT NULL,
  vencimento       DATE          NOT NULL,
  recorrencia      ENUM('nenhuma','mensal','trimestral','anual') NOT NULL DEFAULT 'nenhuma',
  status           ENUM('pendente','pago','cancelado') NOT NULL DEFAULT 'pendente',
  data_pagamento   DATE          NULL,
  obs              VARCHAR(500)  NULL,
  criado_em        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_contas_colegio_status (colegio_id, status, vencimento),
  CONSTRAINT fk_contas_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT ck_contas_valor CHECK (valor > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS contas_banco (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id  INT UNSIGNED NOT NULL,
  nome        VARCHAR(100) NOT NULL,
  banco       VARCHAR(60)  NULL,
  agencia     VARCHAR(20)  NULL,
  conta       VARCHAR(20)  NULL,
  tipo        ENUM('corrente','poupanca','pagamento') NOT NULL DEFAULT 'corrente',
  ativo       TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_cbanco_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS lancamentos_bancarios (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  colegio_id        INT UNSIGNED  NOT NULL,
  conta_banco_id    INT UNSIGNED  NOT NULL,
  chave_importacao  VARCHAR(255)  NOT NULL COMMENT 'FITID do OFX ou hash da linha do CSV',
  data              DATE          NOT NULL,
  descricao         VARCHAR(200)  NOT NULL,
  tipo              ENUM('credito','debito') NOT NULL,
  valor             DECIMAL(12,2) NOT NULL COMMENT 'Sempre positivo; o sinal está em tipo',
  status            ENUM('pendente','conciliado') NOT NULL DEFAULT 'pendente',
  vinculo_tipo      ENUM('mensalidade','conta','manual') NULL,
  mensalidade_id    INT UNSIGNED  NULL,
  conta_pagar_id    INT UNSIGNED  NULL,
  categoria         VARCHAR(40)   NULL,
  obs               VARCHAR(200)  NULL,
  conciliado_por    INT UNSIGNED  NULL,
  conciliado_em     DATETIME      NULL,
  importado_em      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_lanc_chave (conta_banco_id, chave_importacao),
  KEY idx_lanc_colegio_status (colegio_id, status, data),
  CONSTRAINT fk_lanc_colegio     FOREIGN KEY (colegio_id)     REFERENCES colegios (id)     ON DELETE CASCADE,
  CONSTRAINT fk_lanc_conta_banco FOREIGN KEY (conta_banco_id) REFERENCES contas_banco (id) ON DELETE CASCADE,
  CONSTRAINT fk_lanc_mensalidade FOREIGN KEY (mensalidade_id) REFERENCES mensalidades (id) ON DELETE SET NULL,
  CONSTRAINT fk_lanc_conta_pagar FOREIGN KEY (conta_pagar_id) REFERENCES contas_pagar (id) ON DELETE SET NULL,
  CONSTRAINT ck_lanc_valor CHECK (valor >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- CAPTAÇÃO E COMUNICAÇÃO
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS leads (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id        INT UNSIGNED NOT NULL,
  nome_aluno        VARCHAR(100) NOT NULL,
  serie_pretendida  VARCHAR(30)  NULL,
  responsavel       VARCHAR(100) NULL,
  telefone          VARCHAR(20)  NULL,
  email             VARCHAR(160) NULL,
  origem            VARCHAR(30)  NULL,
  etapa             ENUM('lead','visita','proposta','matriculado','perdido') NOT NULL DEFAULT 'lead',
  obs               VARCHAR(500) NULL,
  criado_em         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_leads_etapa (colegio_id, etapa),
  CONSTRAINT fk_leads_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS comunicados (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id     INT UNSIGNED NOT NULL,
  titulo         VARCHAR(150) NOT NULL,
  tipo           ENUM('aviso','circular','evento') NOT NULL DEFAULT 'aviso',
  destinatarios  VARCHAR(30)  NOT NULL DEFAULT 'todos' COMMENT 'todos | infantil | fundamental1 | fundamental2 | medio',
  mensagem       TEXT         NOT NULL,
  publicado_por  INT UNSIGNED NULL,
  criado_em      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_com_colegio (colegio_id, criado_em),
  CONSTRAINT fk_com_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- AUDITORIA
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS atividades (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id  INT UNSIGNED    NOT NULL,
  usuario_id  INT UNSIGNED    NULL,
  acao        VARCHAR(255)    NOT NULL,
  criado_em   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ativ_colegio (colegio_id, criado_em),
  CONSTRAINT fk_ativ_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT fk_ativ_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS log_seguranca (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id   INT UNSIGNED    NULL,
  usuario_id   INT UNSIGNED    NULL,
  email        VARCHAR(160)    NULL,
  tipo         ENUM('login_ok','login_falha','logout','timeout','cadastro','admin') NOT NULL,
  detalhes     VARCHAR(255)    NULL,
  ip           VARCHAR(45)     NULL,
  dispositivo  VARCHAR(120)    NULL,
  criado_em    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_log_colegio (colegio_id, criado_em),
  KEY idx_log_tipo (tipo, criado_em),
  KEY idx_log_email (email, criado_em),
  CONSTRAINT fk_log_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT fk_log_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
