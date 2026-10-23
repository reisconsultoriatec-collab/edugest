# EduGest — Gestão Educacional Multi-Colégio

Reis Tecnologia · https://edugest.reisconsultoriatec.com

| Pasta | Conteúdo | No servidor (`banco-odonto`) |
|---|---|---|
| `api/` | API Node.js/Express + MySQL + Firebase Auth | `~/edugest-api` · PM2 `edugest-api` · porta 3001 |
| `web/` | Front (HTML + JS por módulos) | `/var/www/edugest` |
| `deploy/` | Script de atualização do servidor | `~/atualizar-edugest.sh` |
| `docs/` | Guias de instalação e testes | — |
| `legado/` | Versão anterior em Firestore (`edugest_v2`), só para consulta | — |

## Atualizar o servidor

```bash
~/atualizar-edugest.sh
```

Baixa a versão mais recente, copia API e front, instala dependências se o `package.json` mudou e reinicia a API.

## Nunca vão para o repositório

- `api/.env` (senhas e chave de criptografia)
- `api/firebase-service-account.json`

Esses arquivos existem só no servidor e são preservados pelo script de atualização.
