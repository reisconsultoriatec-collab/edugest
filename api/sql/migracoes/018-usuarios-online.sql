-- =====================================================================
--  018 — Usuários online (Sistema › Usuários online, só administradores)
--  Cada aba aberta do EduGest manda um sinal por minuto; quem deu sinal
--  nos últimos 2 minutos está online. Guarda só o necessário: quem, em
--  qual colégio, aparelho/navegador, se está mexendo e desde quando.
--  Não guarda a tela nem o IP. Linhas com mais de 2 dias são apagadas
--  pela própria API. Idempotente.
-- =====================================================================
CREATE TABLE IF NOT EXISTS sessoes_online (
  id             CHAR(24)     NOT NULL COMMENT 'Aba do navegador (aleatório)',
  usuario_id     INT UNSIGNED NOT NULL,
  colegio_id     INT UNSIGNED NOT NULL,
  perfil         ENUM('admin','professor','financeiro','responsavel') NOT NULL,
  dispositivo    VARCHAR(80)  NULL     COMMENT 'Ex.: Computador · Chrome / Windows',
  ativo          TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'Mexeu na tela nos últimos 5 minutos',
  inicio         DATETIME     NOT NULL,
  ultimo_sinal   DATETIME     NOT NULL,
  encerrada_em   DATETIME     NULL     COMMENT 'Sessão encerrada por um administrador',
  encerrada_por  INT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_online_colegio (colegio_id, ultimo_sinal),
  KEY idx_online_usuario (usuario_id, colegio_id),
  KEY idx_online_sinal (ultimo_sinal),
  CONSTRAINT fk_online_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_online_colegio FOREIGN KEY (colegio_id) REFERENCES colegios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
