# EduGest — publicar o front em edugest.reisconsultoriatec.com

Reis Tecnologia · Front v1.0.0 (login, cadastro, configurações, usuários, log de segurança)

Estrutura no servidor (mesmo padrão do OdontoWorld):

| O quê | Onde |
|---|---|
| Front (este pacote) | `/var/www/edugest` |
| API | `~/edugest-api` · PM2 `edugest-api` · porta 3001 |
| Nginx | serve o front e repassa `/api/` para a porta 3001 |

---

## 1. Enviar o front

No servidor, crie a pasta e dê permissão ao usuário `ubuntu`:

```bash
sudo mkdir -p /var/www/edugest
sudo chown -R ubuntu:ubuntu /var/www/edugest
```

Pelo SFTP, envie para `/var/www/edugest/`:

- `index.html`
- a pasta `assets` inteira (com `app.css` e a subpasta `js` com 7 arquivos)

Conferir:

```bash
find /var/www/edugest -type f | sort
```

Devem aparecer 9 arquivos: `index.html`, `assets/app.css` e 7 em `assets/js/`.

## 2. DNS na Cloudflare

No painel da Cloudflare, domínio `reisconsultoriatec.com` → **DNS → Add record**:

- Tipo: `A`
- Nome: `edugest`
- IPv4: o IP público da `banco-odonto` (o mesmo do registro `odontoworld`)
- Proxy: **ligado** (nuvem laranja), igual ao OdontoWorld

## 3. Domínio autorizado no Firebase

Console do Firebase → projeto `edugest-80e0f` → **Authentication → Settings → Authorized domains → Add domain**:
`edugest.reisconsultoriatec.com`

## 4. Nginx

A configuração do EduGest será uma cópia da do OdontoWorld, trocando domínio, pasta e porta, para usar exatamente o mesmo esquema de SSL que já funciona. Antes de criar, me envie a saída de:

```bash
ls -l /etc/nginx/sites-enabled/
sudo cat /etc/nginx/sites-enabled/*odonto*
```

Com ela eu devolvo o arquivo pronto e os comandos para ativar.

## 5. Teste no navegador

Depois do Nginx ativo, abra `https://edugest.reisconsultoriatec.com`:

1. **Criar conta** → "Novo colégio" → você entra como administrador.
2. **Configurações**: preencha os dados, os parâmetros e copie o código do colégio.
3. Numa janela anônima, crie outra conta com "Já existe" + o código → fica **aguardando aprovação**.
4. Na sua conta, **Usuários** → aprove, escolha perfil e módulos.
5. Entre com a segunda conta e veja que o menu mostra só os módulos liberados.
6. **Log de Segurança**: logins, falhas, cadastros e aprovações registrados.

Os módulos marcados "em breve" chegam nas próximas etapas.
