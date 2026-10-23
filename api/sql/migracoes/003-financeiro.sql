-- =====================================================================
--  EduGest — migração 003: financeiro
--  - mensalidades.valor_pago: valor efetivamente recebido na baixa
--    (pode diferir do valor por juros/multa ou acordo)
--  - mensalidades.obs_pagamento: observação da baixa
--  - índices por data de pagamento (fluxo de caixa)
--  Escrita para poder rodar mais de uma vez sem erro.
-- =====================================================================
SET NAMES utf8mb4;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'mensalidades' AND column_name = 'valor_pago');
SET @sql := IF(@existe = 0, 'ALTER TABLE mensalidades ADD COLUMN valor_pago DECIMAL(10,2) NULL AFTER data_pagamento', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'mensalidades' AND column_name = 'obs_pagamento');
SET @sql := IF(@existe = 0, 'ALTER TABLE mensalidades ADD COLUMN obs_pagamento VARCHAR(200) NULL AFTER forma_pagamento', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.statistics
                 WHERE table_schema = DATABASE() AND table_name = 'mensalidades' AND index_name = 'idx_mens_pagamento');
SET @sql := IF(@existe = 0, 'ALTER TABLE mensalidades ADD KEY idx_mens_pagamento (colegio_id, data_pagamento)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.statistics
                 WHERE table_schema = DATABASE() AND table_name = 'contas_pagar' AND index_name = 'idx_contas_pagamento');
SET @sql := IF(@existe = 0, 'ALTER TABLE contas_pagar ADD KEY idx_contas_pagamento (colegio_id, data_pagamento)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
