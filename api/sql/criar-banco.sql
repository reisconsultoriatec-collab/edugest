-- =====================================================================
--  EduGest — criação do banco e do usuário da aplicação
--  Executar como root no MySQL do container (ver GUIA-FASE1.md)
--  TROQUE a senha abaixo antes de executar e guarde-a para o .env
-- =====================================================================

CREATE DATABASE IF NOT EXISTS edugest
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

-- '%' é necessário porque a API conecta pela ponte do Docker.
-- O MySQL continua acessível só pela própria máquina (porta presa em 127.0.0.1).
CREATE USER IF NOT EXISTS 'edugest_user'@'%' IDENTIFIED BY 'TROQUE_POR_UMA_SENHA_FORTE';

-- Só leitura e escrita de dados: o usuário da API não pode alterar tabelas.
GRANT SELECT, INSERT, UPDATE, DELETE ON edugest.* TO 'edugest_user'@'%';

FLUSH PRIVILEGES;
