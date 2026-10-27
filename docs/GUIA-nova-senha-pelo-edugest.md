# EduGest — "Esqueci minha senha" pela página do EduGest

Reis Tecnologia · front 1.17.0 · API 1.17.0

## O que muda

| Antes | Agora |
|---|---|
| O link do e-mail abria a página genérica do Firebase | Abre `edugest.reisconsultoriatec.com/conta.html`, no visual do EduGest |
| Aceitava senha de 6 caracteres | Exige a regra do cadastro: 8 caracteres, uma letra maiúscula e um número |
| A troca não aparecia no Log de Segurança | Fica registrada como **Senha redefinida** (com data, IP e aparelho) |

O que **não** muda: o código do link continua sendo gerado e conferido pelo Firebase, vale por pouco tempo e uma vez só. A senha nova vai direto para o Firebase e não passa pela API nem fica no banco.

A mesma página também trata o link de **confirmação de e-mail** (o Firebase usa um endereço só para todos os e-mails de conta).

---

## 1. Atualizar o servidor

```bash
~/atualizar-edugest.sh
```

O script aplica a migração **011** (pede a senha do root do MySQL). Ela só acrescenta o tipo "senha_redefinida" ao log de segurança: não apaga nem altera registros.

Confira:

```bash
curl -s http://127.0.0.1:3001/api/health; echo
```

Deve mostrar `"versao":"1.17.0"`.

Abra no navegador `https://edugest.reisconsultoriatec.com/conta.html`. Deve aparecer **"Link incompleto"**. Isso confirma que a página está publicada.

Até aqui **nada mudou para os usuários**: o e-mail continua levando à página do Firebase.

## 2. Anotar como está hoje (para poder voltar)

No [console do Firebase](https://console.firebase.google.com/), projeto **edugest-80e0f**:

1. **Authentication → Templates → Redefinição de senha** (Password reset) → ícone de lápis.
2. Tire um print da tela: remetente, assunto, mensagem e o **URL de ação** (*Customize action URL*). O padrão é `https://edugest-80e0f.firebaseapp.com/__/auth/action`.

## 3. Ligar a página nova

1. **Authentication → Configurações → Domínios autorizados**: adicione `edugest.reisconsultoriatec.com` (só o domínio, sem `https://` e sem barra no fim). **Faça isto antes do passo 3**: o URL de ação precisa usar um domínio que o projeto reconhece.
2. **Configurações do projeto → Geral → Nome público**: `EduGest`. É o nome que aparece no e-mail.
3. **Authentication → Templates → Redefinição de senha → lápis**:
   - **Nome do remetente**: `EduGest`
   - **Assunto**: `Crie uma nova senha no EduGest`
   - **Mensagem** (copie só as linhas que começam com `<p>`):

     ```
     <p>Olá,</p>
     <p>Recebemos um pedido para criar uma nova senha no EduGest para a conta <b>%EMAIL%</b>.</p>
     <p><a href="%LINK%">Criar nova senha</a></p>
     <p>O link vale por pouco tempo e só pode ser usado uma vez.</p>
     <p>Se você não fez esse pedido, ignore este e-mail: a sua senha continua a mesma.</p>
     <p>EduGest · Reis Tecnologia</p>
     ```

   - Clique em **Personalizar URL de ação** (*Customize action URL*) e informe:
     `https://edugest.reisconsultoriatec.com/conta.html`
   - **Salvar**.

> O URL de ação vale para todos os modelos de e-mail (redefinição de senha e confirmação de e-mail). A página nova trata os dois.

### Se o console der "Ocorreu um erro ao atualizar o URL acionável"

Salve o remetente, o assunto e a mensagem normalmente (botão **Salvar** do modelo) e deixe o URL de ação como está. Depois, no servidor:

```bash
cd ~/edugest-api
node scripts/url-acao.js ver       # mostra como está agora
node scripts/url-acao.js ligar     # passa a usar a página do EduGest
```

O script altera só esse campo, pelo serviço oficial do Firebase e com a chave do próprio servidor. Antes de ligar, ele confere se `conta.html` está no ar e guarda o valor atual em `~/.edugest-url-acao-anterior`. Se o Firebase recusar, ele mostra o motivo exato.

## 4. Testar

1. Na tela de acesso, digite o e-mail de uma conta de teste e clique em **Esqueci minha senha**.
2. No e-mail recebido, o link deve começar com `https://edugest.reisconsultoriatec.com/conta.html`. Confira também a caixa de spam.
3. Crie a senha nova. A página mostra as regras sendo cumpridas e, no fim, **Senha alterada**.
4. Clique em **Entrar no EduGest**: o e-mail já vem preenchido. Entre com a senha nova; a antiga não entra mais.
5. Como administrador, abra **Sistema → Log de Segurança**: deve aparecer **Senha redefinida**.
6. Abra o mesmo link de novo: deve aparecer **"Este link não vale mais"**.

## 5. Voltar como estava (se algo der errado)

**Para todos os usuários, pelo servidor (se ligou pelo script):**

```bash
cd ~/edugest-api && node scripts/url-acao.js desligar
```

Volta exatamente ao valor guardado antes de ligar.

**Para todos os usuários, pelo console (2 minutos):**

1. Console do Firebase → **Authentication → Templates → Redefinição de senha → lápis → Personalizar URL de ação**.
2. Apague o endereço e salve. Se o console não aceitar o campo vazio, coloque o padrão `https://edugest-80e0f.firebaseapp.com/__/auth/action`.
3. Se quiser, volte também o assunto e a mensagem do print do passo 2.

A partir daí os e-mails novos voltam a abrir a página do Firebase, como antes.

**Para uma pessoa só, na hora:** se a página do EduGest der algum erro inesperado, ela mostra o botão **"Usar a página padrão do Firebase"**, que abre a página antiga com o mesmo link.

**Importante:** não apague `conta.html` do servidor, mesmo voltando a configuração. Links já enviados por e-mail continuam apontando para ela.

---

## Segurança da página

- O código do link sai da barra de endereço assim que a página abre (não fica no histórico nem em prints).
- A página não repassa o endereço a outros sites (`referrer: no-referrer`) e não aparece em buscadores (`noindex`).
- Não funciona dentro de moldura (iframe) de outro site, para ninguém capturar a senha digitada.
- O registro no Log de Segurança só é aceito com login: a página entra com a senha nova, registra e sai em seguida.
- Mensagens neutras: pedir o link para um e-mail que não existe mostra a mesma resposta, sem revelar quem tem conta.
