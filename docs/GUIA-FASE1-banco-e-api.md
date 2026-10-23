# EduGest — Fase 1: banco e API na `banco-odonto`

Reis Tecnologia · Instalação do banco `edugest` e da API na porta 3001, ao lado do OdontoWorld.
Nesta fase a API ainda não é acessada pela internet (Nginx e DNS entram na Fase 4); os testes são feitos na própria máquina com `curl`.

---

## 0. Antes de começar (no seu computador)

1. **Chave do Firebase Admin** — no console do Firebase, projeto `edugest-80e0f`:
   *Configurações do projeto → Contas de serviço → Gerar nova chave privada*.
   Renomeie o arquivo baixado para `firebase-service-account.json` e coloque dentro da pasta `edugest-api`.
2. **Senha do banco** — abra `sql/criar-banco.sql` e troque `TROQUE_POR_UMA_SENHA_FORTE` por uma senha forte. Anote-a: ela vai no `.env`.

## 1. Enviar a pasta

Envie a pasta `edugest-api` inteira por SFTP para `/home/ubuntu/edugest-api` (sem `node_modules`).

## 2. Criar o banco, o usuário e as tabelas

```bash
cd ~/edugest-api
sudo docker cp sql/criar-banco.sql mysql:/tmp/criar-banco.sql
sudo docker cp sql/schema.sql      mysql:/tmp/schema.sql

# Cada comando pede a senha do root do MySQL
sudo docker exec -it mysql sh -c 'mysql -u root -p < /tmp/criar-banco.sql'
sudo docker exec -it mysql sh -c 'mysql -u root -p edugest < /tmp/schema.sql'

# Conferir: devem aparecer 24 tabelas
sudo docker exec -it mysql mysql -u root -p edugest -e "SHOW TABLES;"

# Limpar os arquivos temporários do container e tirar a senha do arquivo local
sudo docker exec mysql rm /tmp/criar-banco.sql /tmp/schema.sql
sed -i "s/IDENTIFIED BY '.*'/IDENTIFIED BY '***'/" sql/criar-banco.sql
```

## 3. Configurar o `.env`

```bash
node -v      # precisa ser 18 ou superior
cp .env.example .env

# Gera a chave de criptografia de CPF/RG
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

nano .env    # preencha DB_PASSWORD e CRYPTO_KEY
chmod 600 .env firebase-service-account.json
```

> **Importante:** guarde uma cópia da `CRYPTO_KEY` fora do servidor (gerenciador de senhas).
> Sem ela, os CPFs e RGs gravados não podem ser lidos.

## 4. Instalar e iniciar no PM2

```bash
npm install --omit=dev
pm2 start server.js --name edugest-api
pm2 save
pm2 logs edugest-api --lines 20 --nostream
```

No log devem aparecer:

```
[EduGest] MySQL conectado
[EduGest] API ouvindo em 127.0.0.1:3001
```

## 5. Testar

```bash
curl -s http://127.0.0.1:3001/api/health
# {"status":"ok","sistema":"EduGest API","versao":"1.0.0","banco":"ok","hora":"..."}

curl -s http://127.0.0.1:3001/api/me
# {"erro":"Não autenticado","codigo":"sem_token"}   ← esperado: a rota exige login
```

`pm2 list` deve mostrar `odontoworld-api` e `edugest-api` como **online**.

---

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| `CRYPTO_KEY ausente ou inválida` | `.env` sem a chave ou com tamanho diferente de 64 caracteres |
| `Não foi possível ler a chave do Firebase` | `firebase-service-account.json` fora da pasta ou com outro nome |
| `banco":"indisponivel"` / `Access denied` | senha do `.env` diferente da usada no `criar-banco.sql` |
| `ER_NO_SUCH_TABLE` | o `schema.sql` não foi carregado no banco `edugest` |
