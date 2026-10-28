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
  inep              VARCHAR(12)  NULL,
  uf                CHAR(2)      NULL,
  ato_autorizacao   VARCHAR(300) NULL     COMMENT 'Ato de autorização/credenciamento (sai nos documentos)',
  diretor_nome      VARCHAR(100) NULL,
  diretor_registro  VARCHAR(40)  NULL,
  secretario_nome   VARCHAR(100) NULL,
  secretario_registro VARCHAR(40) NULL,
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
  pix_tipo            VARCHAR(10)       NULL     COMMENT 'cpf, cnpj, celular, email ou aleatoria',
  pix_chave           VARCHAR(80)       NULL,
  pix_beneficiario    VARCHAR(60)       NULL     COMMENT 'Nome exibido no PIX',
  cidade              VARCHAR(60)       NULL     COMMENT 'Cidade do PIX e dos documentos',
  encarregado_nome    VARCHAR(100)      NULL     COMMENT 'Encarregado de dados (LGPD)',
  encarregado_email   VARCHAR(160)      NULL,
  encarregado_telefone VARCHAR(20)      NULL,
  cobranca_instrucoes VARCHAR(300)      NULL     COMMENT 'Texto impresso nas cobranças',
  link_validade_dias  SMALLINT UNSIGNED NOT NULL DEFAULT 30 COMMENT 'Validade dos links enviados por WhatsApp',
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
  mae_nome         VARCHAR(100) NULL,
  pai_nome         VARCHAR(100) NULL,
  naturalidade     VARCHAR(60)  NULL,
  naturalidade_uf  CHAR(2)      NULL,
  nacionalidade    VARCHAR(40)  NULL,
  data_matricula   DATE         NULL,
  data_saida       DATE         NULL,
  turma_id         INT UNSIGNED NULL,
  status           ENUM('ativo','inativo','transferido','concluido') NOT NULL DEFAULT 'ativo',
  importacao_id    INT UNSIGNED NULL     COMMENT 'Planilha de onde veio o cadastro (desfazer importação)',
  codigo_acesso    CHAR(9)      NOT NULL COMMENT 'PAI + 6 caracteres, para o responsável',
  resp_nome        VARCHAR(100) NULL,
  resp_parentesco  VARCHAR(20)  NULL,
  resp_cpf_cript   VARCHAR(255) NULL     COMMENT 'CPF do responsável financeiro (AES-256-GCM)',
  resp_telefone    VARCHAR(20)  NULL,
  resp_email       VARCHAR(160) NULL,
  criado_em        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_alunos_ra (colegio_id, ra),
  UNIQUE KEY uk_alunos_codigo (codigo_acesso),
  KEY idx_alunos_turma (turma_id, status),
  KEY idx_alunos_nome (colegio_id, nome),
  KEY idx_alunos_importacao (importacao_id),
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

CREATE TABLE IF NOT EXISTS autorizados_retirada (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id       INT UNSIGNED NOT NULL,
  aluno_id         INT UNSIGNED NOT NULL,
  nome             VARCHAR(100) NOT NULL,
  parentesco       VARCHAR(30)  NULL,
  documento_cript  VARCHAR(255) NULL COMMENT 'RG ou CPF, criptografado pela API',
  telefone         VARCHAR(20)  NULL,
  criado_em        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_autorizados_aluno (aluno_id),
  CONSTRAINT fk_autorizados_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT fk_autorizados_aluno   FOREIGN KEY (aluno_id)   REFERENCES alunos (id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Aulas e intervalos de cada turno (a grade usa os horários do turno da turma)
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
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id       INT UNSIGNED NOT NULL,
  titulo           VARCHAR(150) NOT NULL,
  data             DATE         NOT NULL,
  data_fim         DATE         NULL,
  hora_inicio      TIME         NULL,
  hora_fim         TIME         NULL,
  lugar            VARCHAR(120) NULL,
  tipo             ENUM('evento','feriado','recesso','prova','reuniao','conselho','bimestre','letivo') NOT NULL DEFAULT 'evento',
  alcance          ENUM('todos','segmentos','turmas') NOT NULL DEFAULT 'todos',
  segmentos        VARCHAR(80)  NULL,
  visivel_familias TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '0 = só a equipe vê (ex.: conselho de classe)',
  descricao        VARCHAR(1000) NULL,
  criado_por       INT UNSIGNED NULL,
  criado_em        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_por   INT UNSIGNED NULL,
  atualizado_em    DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_eventos_data (colegio_id, data),
  CONSTRAINT fk_eventos_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Turmas de um evento com alcance = 'turmas'
CREATE TABLE IF NOT EXISTS evento_turmas (
  evento_id  INT UNSIGNED NOT NULL,
  turma_id   INT UNSIGNED NOT NULL,
  PRIMARY KEY (evento_id, turma_id),
  KEY idx_evt_turma (turma_id),
  CONSTRAINT fk_evt_evento FOREIGN KEY (evento_id) REFERENCES eventos (id) ON DELETE CASCADE,
  CONSTRAINT fk_evt_turma  FOREIGN KEY (turma_id)  REFERENCES turmas (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Início e fim de cada bimestre do ano letivo (dias letivos, bimestre atual)
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
  virada_id        INT UNSIGNED  NULL COMMENT 'Gerada pela virada do ano (desfazer)',
  status           ENUM('pendente','pago','cancelado') NOT NULL DEFAULT 'pendente',
  data_pagamento   DATE          NULL,
  valor_pago       DECIMAL(10,2) NULL COMMENT 'Valor recebido na baixa (juros, multa ou acordo)',
  forma_pagamento  VARCHAR(30)   NULL,
  obs_pagamento    VARCHAR(200)  NULL,
  criado_em        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_mens_aluno_ref (aluno_id, referencia),
  KEY idx_mens_colegio_status (colegio_id, status, vencimento),
  KEY idx_mens_referencia (colegio_id, referencia),
  KEY idx_mens_pagamento (colegio_id, data_pagamento),
  KEY idx_mens_virada (virada_id),
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
  KEY idx_contas_pagamento (colegio_id, data_pagamento),
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

-- Cada arquivo de extrato importado (permite desfazer a importação)
CREATE TABLE IF NOT EXISTS importacoes_extrato (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  colegio_id       INT UNSIGNED  NOT NULL,
  conta_banco_id   INT UNSIGNED  NOT NULL,
  arquivo          VARCHAR(150)  NOT NULL,
  formato          ENUM('ofx','csv') NOT NULL,
  periodo_inicio   DATE          NULL,
  periodo_fim      DATE          NULL,
  saldo_final      DECIMAL(12,2) NULL COMMENT 'Saldo informado pelo banco no OFX',
  saldo_data       DATE          NULL,
  qtd_lancamentos  INT UNSIGNED  NOT NULL DEFAULT 0,
  qtd_duplicados   INT UNSIGNED  NOT NULL DEFAULT 0,
  importado_por    INT UNSIGNED  NULL,
  importado_em     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_imp_conta (colegio_id, conta_banco_id, importado_em),
  CONSTRAINT fk_imp_colegio     FOREIGN KEY (colegio_id)     REFERENCES colegios (id)     ON DELETE CASCADE,
  CONSTRAINT fk_imp_conta_banco FOREIGN KEY (conta_banco_id) REFERENCES contas_banco (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS lancamentos_bancarios (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  colegio_id        INT UNSIGNED  NOT NULL,
  conta_banco_id    INT UNSIGNED  NOT NULL,
  importacao_id     INT UNSIGNED  NULL,
  chave_importacao  VARCHAR(255)  NOT NULL COMMENT 'FITID do OFX ou hash da linha do CSV',
  data              DATE          NOT NULL,
  descricao         VARCHAR(200)  NOT NULL,
  tipo              ENUM('credito','debito') NOT NULL,
  valor             DECIMAL(12,2) NOT NULL COMMENT 'Sempre positivo; o sinal está em tipo',
  status            ENUM('pendente','conciliado') NOT NULL DEFAULT 'pendente',
  vinculo_tipo      ENUM('mensalidade','conta','manual') NULL,
  mensalidade_id    INT UNSIGNED  NULL,
  conta_pagar_id    INT UNSIGNED  NULL,
  acao_baixa        ENUM('nenhuma','baixou','criou') NOT NULL DEFAULT 'nenhuma' COMMENT 'O que a conciliação fez (revertido ao desfazer)',
  categoria         VARCHAR(40)   NULL,
  obs               VARCHAR(200)  NULL,
  conciliado_por    INT UNSIGNED  NULL,
  conciliado_em     DATETIME      NULL,
  importado_em      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_lanc_chave (conta_banco_id, chave_importacao),
  KEY idx_lanc_colegio_status (colegio_id, status, data),
  KEY idx_lanc_conta_data (conta_banco_id, status, data),
  CONSTRAINT fk_lanc_colegio     FOREIGN KEY (colegio_id)     REFERENCES colegios (id)     ON DELETE CASCADE,
  CONSTRAINT fk_lanc_importacao  FOREIGN KEY (importacao_id)  REFERENCES importacoes_extrato (id) ON DELETE SET NULL,
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
  nascimento        DATE         NULL,
  serie_pretendida  VARCHAR(40)  NULL,
  ano_pretendido    SMALLINT UNSIGNED NULL,
  turno_pretendido  VARCHAR(20)  NULL,
  responsavel       VARCHAR(100) NULL,
  telefone          VARCHAR(20)  NULL,
  email             VARCHAR(160) NULL,
  origem            VARCHAR(40)  NULL,
  etapa             ENUM('lead','visita','proposta','matriculado','perdido') NOT NULL DEFAULT 'lead',
  obs               VARCHAR(500) NULL,
  proximo_contato   DATE         NULL,
  visita_em         DATETIME     NULL,
  motivo_perda      VARCHAR(60)  NULL,
  aluno_id          INT UNSIGNED NULL     COMMENT 'Aluno criado na matrícula',
  via_formulario    TINYINT(1)   NOT NULL DEFAULT 0,
  consentimento_em  DATETIME     NULL     COMMENT 'Aceite do contato no formulário público (LGPD)',
  visto_em          DATETIME     NULL     COMMENT 'Quando a equipe abriu o cadastro',
  etapa_em          DATETIME     NULL     COMMENT 'Desde quando está na etapa atual',
  criado_por        INT UNSIGNED NULL,
  atualizado_por    INT UNSIGNED NULL,
  criado_em         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_leads_etapa (colegio_id, etapa),
  KEY idx_leads_contato (colegio_id, proximo_contato),
  CONSTRAINT fk_leads_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT fk_leads_aluno   FOREIGN KEY (aluno_id)   REFERENCES alunos (id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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

CREATE TABLE IF NOT EXISTS comunicados (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id     INT UNSIGNED NOT NULL,
  titulo         VARCHAR(150) NOT NULL,
  tipo           ENUM('aviso','circular','evento','urgente') NOT NULL DEFAULT 'aviso',
  alcance        ENUM('todos','segmentos','turmas') NOT NULL DEFAULT 'todos',
  segmentos      VARCHAR(80)  NULL COMMENT 'Lista separada por vírgula: infantil,fundamental1,fundamental2,medio,eja,outros',
  mensagem       TEXT         NOT NULL,
  fixado         TINYINT(1)   NOT NULL DEFAULT 0,
  exige_ciencia  TINYINT(1)   NOT NULL DEFAULT 0,
  expira_em      DATE         NULL COMMENT 'Último dia em que aparece no portal',
  publicado_por  INT UNSIGNED NULL,
  criado_em      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_por INT UNSIGNED NULL,
  atualizado_em  DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_com_colegio (colegio_id, criado_em),
  CONSTRAINT fk_com_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Turmas de um comunicado com alcance = 'turmas'
CREATE TABLE IF NOT EXISTS comunicado_turmas (
  comunicado_id  INT UNSIGNED NOT NULL,
  turma_id       INT UNSIGNED NOT NULL,
  PRIMARY KEY (comunicado_id, turma_id),
  KEY idx_comt_turma (turma_id),
  CONSTRAINT fk_comt_comunicado FOREIGN KEY (comunicado_id) REFERENCES comunicados (id) ON DELETE CASCADE,
  CONSTRAINT fk_comt_turma      FOREIGN KEY (turma_id)      REFERENCES turmas (id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Leitura (e ciência) dos responsáveis no portal
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

-- ---------------------------------------------------------------------
-- DOCUMENTOS ESCOLARES (secretaria)
-- ---------------------------------------------------------------------

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
  tipo         ENUM('login_ok','login_falha','logout','timeout','cadastro','admin','privacidade') NOT NULL,
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

-- ---------------------------------------------------------------------
-- Importação de alunos e virada do ano letivo (migração 012)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS importacoes_alunos (
  id           INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  colegio_id   INT UNSIGNED      NOT NULL,
  arquivo      VARCHAR(160)      NULL,
  total        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  feita_por    INT UNSIGNED      NULL,
  feita_em     DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  desfeita_em  DATETIME          NULL,
  desfeita_por INT UNSIGNED      NULL,
  PRIMARY KEY (id),
  KEY idx_impal_colegio (colegio_id, feita_em),
  CONSTRAINT fk_impal_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS viradas (
  id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  colegio_id          INT UNSIGNED      NOT NULL,
  ano_de              SMALLINT UNSIGNED NOT NULL,
  ano_para            SMALLINT UNSIGNED NOT NULL,
  ano_letivo_anterior SMALLINT UNSIGNED NOT NULL COMMENT 'Configuração antes da virada (para desfazer)',
  valor_anterior      DECIMAL(10,2)     NULL,
  valor_novo          DECIMAL(10,2)     NULL,
  resumo              TEXT              NULL     COMMENT 'JSON com os totais',
  feita_por           INT UNSIGNED      NULL,
  feita_em            DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  desfeita_em         DATETIME          NULL,
  desfeita_por        INT UNSIGNED      NULL,
  PRIMARY KEY (id),
  KEY idx_viradas_colegio (colegio_id, feita_em),
  CONSTRAINT fk_viradas_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS virada_turmas (
  virada_id        INT UNSIGNED NOT NULL,
  turma_id         INT UNSIGNED NOT NULL,
  turma_origem_id  INT UNSIGNED NULL,
  criada           TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = criada pela virada (desfazer apaga)',
  PRIMARY KEY (virada_id, turma_id),
  CONSTRAINT fk_vturmas_virada FOREIGN KEY (virada_id) REFERENCES viradas (id) ON DELETE CASCADE,
  CONSTRAINT fk_vturmas_turma  FOREIGN KEY (turma_id)  REFERENCES turmas (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS virada_alunos (
  virada_id          INT UNSIGNED NOT NULL,
  aluno_id           INT UNSIGNED NOT NULL,
  acao               ENUM('promover','reter','concluir','sair','enturmar') NOT NULL,
  turma_origem_id    INT UNSIGNED NULL,
  turma_destino_id   INT UNSIGNED NULL,
  status_origem      VARCHAR(20)  NOT NULL,
  status_destino     VARCHAR(20)  NOT NULL,
  data_saida_origem  DATE         NULL,
  situacao           VARCHAR(30)  NULL     COMMENT 'Situação calculada pelas notas e frequência',
  resultado          VARCHAR(40)  NULL     COMMENT 'Resultado do ano (vai para o histórico)',
  PRIMARY KEY (virada_id, aluno_id),
  KEY idx_valunos_aluno (aluno_id),
  KEY idx_valunos_origem (turma_origem_id),
  CONSTRAINT fk_valunos_virada  FOREIGN KEY (virada_id)        REFERENCES viradas (id) ON DELETE CASCADE,
  CONSTRAINT fk_valunos_aluno   FOREIGN KEY (aluno_id)         REFERENCES alunos (id)  ON DELETE CASCADE,
  CONSTRAINT fk_valunos_origem  FOREIGN KEY (turma_origem_id)  REFERENCES turmas (id)  ON DELETE SET NULL,
  CONSTRAINT fk_valunos_destino FOREIGN KEY (turma_destino_id) REFERENCES turmas (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Central de ajuda: artigos lidos e tours feitos por pessoa (migração 013)
CREATE TABLE IF NOT EXISTS usuario_ajuda (
  usuario_id  INT UNSIGNED NOT NULL,
  chave       VARCHAR(60)  NOT NULL COMMENT 'artigo:<id>, tour:<id> ou preferências da ajuda',
  feito_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, chave),
  CONSTRAINT fk_uajuda_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- LGPD: aceite dos termos e pedidos dos titulares (migração 014)
CREATE TABLE IF NOT EXISTS termos_aceites (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id  INT UNSIGNED NOT NULL,
  versao      VARCHAR(20)  NOT NULL,
  colegio_id  INT UNSIGNED NULL COMMENT 'Colégio aberto quando aceitou',
  perfil      VARCHAR(20)  NULL,
  aceito_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip          VARCHAR(45)  NULL,
  dispositivo VARCHAR(60)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_termos_usuario_versao (usuario_id, versao),
  CONSTRAINT fk_termos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS solicitacoes_titular (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id         INT UNSIGNED NOT NULL,
  usuario_id         INT UNSIGNED NULL,
  solicitante_nome   VARCHAR(100) NOT NULL,
  solicitante_email  VARCHAR(160) NULL,
  aluno_id           INT UNSIGNED NULL,
  aluno_nome         VARCHAR(100) NULL,
  tipo               ENUM('acesso','correcao','exclusao','portabilidade','revogacao','informacao','outro') NOT NULL,
  descricao          TEXT         NOT NULL,
  status             ENUM('aberta','em_andamento','concluida','recusada') NOT NULL DEFAULT 'aberta',
  resposta           TEXT         NULL,
  respondida_por     INT UNSIGNED NULL,
  respondida_em      DATETIME     NULL,
  criada_em          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  prazo              DATE         NOT NULL COMMENT '15 dias (art. 19 da LGPD)',
  PRIMARY KEY (id),
  KEY idx_sol_colegio (colegio_id, status, criada_em),
  KEY idx_sol_usuario (usuario_id),
  CONSTRAINT fk_sol_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE,
  CONSTRAINT fk_sol_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT fk_sol_aluno FOREIGN KEY (aluno_id) REFERENCES alunos (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
