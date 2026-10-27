-- =====================================================================
--  EduGest — migração 011: troca de senha no log de segurança
--  Acrescenta o tipo 'senha_redefinida' ao log (registrado quando a pessoa
--  cria uma senha nova pelo link do e-mail, na página conta.html).
--  Só acrescenta um valor no fim da lista: não apaga nem altera registros
--  e pode rodar mais de uma vez sem erro.
-- =====================================================================
SET NAMES utf8mb4;

ALTER TABLE log_seguranca
  MODIFY COLUMN tipo ENUM('login_ok','login_falha','logout','timeout','cadastro','admin','senha_redefinida') NOT NULL;
