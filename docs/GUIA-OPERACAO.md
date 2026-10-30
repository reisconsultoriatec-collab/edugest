# EduGest — Operação do servidor

Reis Tecnologia · cuidados para o sistema não sair do ar sem ninguém perceber.

## 1. Monitor de disponibilidade (UptimeRobot, gratuito)

Avisa por e-mail (ou aplicativo/Telegram) quando o EduGest para de responder.

1. Crie a conta em https://uptimerobot.com (plano Free).
2. **Add New Monitor**
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `EduGest`
   - URL: `https://edugest.reisconsultoriatec.com/api/health`
   - Monitoring Interval: **5 minutes**
3. Em **Alert Contacts**, marque o seu e-mail e clique em **Create Monitor**.

O endereço `/api/health` responde **200** quando a API e o banco estão no ar e **503** quando o banco não responde. As duas situações de problema (servidor fora do ar ou MySQL parado) geram alerta. Essa verificação não conta no limite de requisições da API.

Se o monitor acusar "fora do ar" com o sistema funcionando, a Cloudflare pode estar barrando o robô: na Cloudflare, em **Security**, libere o caminho `/api/health` (ou desative o *Bot Fight Mode*).

## 2. Tamanho dos logs (automático)

O `~/atualizar-edugest.sh` instala o **pm2-logrotate** na primeira vez que roda depois desta versão:

- cada arquivo de log fecha ao chegar em **10 MB** (e também todo dia às 3h);
- ficam os **14 últimos**, compactados; os mais antigos são apagados.

Vale para todos os sistemas do PM2 do servidor. Não muda o desempenho nem o Log de Segurança do EduGest (que fica no banco).

Para conferir:

```bash
du -sh ~/.pm2/logs          # quanto os logs ocupam
pm2 conf pm2-logrotate      # configuração em uso
```

Para desfazer: `pm2 uninstall pm2-logrotate && rm ~/.edugest-logrotate`.

## 3. Política de senha no Firebase

A tela de cadastro do EduGest já exige **8 caracteres, uma letra maiúscula e um número**. Para valer também na página de "Esqueci minha senha" do Firebase:

1. Console do Firebase › projeto `edugest-80e0f` › **Authentication** › **Settings** (Configurações) › **Password policy** (Política de senha).
2. Marque: **Require uppercase character** e **Require numeric character**; **Minimum password length: 8**.
3. Enforcement mode: **Require** (Exigir).
4. Deixe **desligado** o "forçar atualização da senha no login" — quem já tem senha continua entrando normalmente.
5. **Save**.

Se essa opção não aparecer no seu plano, não tem problema: o cadastro do EduGest continua exigindo a senha forte.

## 4. Privacidade (LGPD): termos e política

- Textos públicos: `web/termos.html` e `web/privacidade.html` (links no rodapé da tela de acesso e no formulário de interesse).
- No primeiro acesso, cada pessoa aceita a versão em vigor. O aceite fica na tabela `termos_aceites` (data, IP e dispositivo) e no Log de Segurança.
- **Mudou o texto?** Troque a versão nos três lugares, publique e atualize o servidor: `TERMOS_VERSAO` em `api/src/services/lgpd.js` e a linha "Versão …" no topo das duas páginas. No próximo acesso, todos aceitam de novo.
- Os textos são um modelo: vale a revisão de um advogado. Confira também o que depende da infraestrutura (região do servidor, Cloudflare, cópias de segurança) e ajuste o item "Com quem compartilhamos" da política se precisar.
- Cada colégio define o encarregado de dados em Sistema › Privacidade (LGPD); o item entra na lista de Implantação.

## 5. Painel da Direção numa TV

- Quem vê: o proprietário do sistema e os administradores marcados como **Alta direção** em Sistema › Usuários (coluna `usuario_colegio.direcao`, migração 015). Ninguém marca a si mesmo; a marcação e a retirada ficam no Log de Segurança.
- Use um computador (ou mini PC / TV box com navegador) ligado à TV, entre com a conta da pessoa da direção, abra o Painel da Direção e clique em **Modo TV** (tela cheia, tema escuro, relógio e rolagem automática). Esc sai.
- Com o painel aberto, a sessão **não encerra por inatividade** e os números se atualizam a cada 5 minutos. Por isso: TV só em sala da direção (não na recepção), conta de quem é da direção, e **Sair** ao desligar.
- Se a marcação for retirada com o painel aberto, a pessoa sai do painel na próxima atualização.
- No topo fica a **presença em sala** de cada turma (chamada do Diário). Turma abaixo do percentual de alerta no dia pisca em vermelho. O percentual é definido pela direção na barra do painel (coluna `config_colegio.alerta_presenca`, migração 016; padrão 60%). A velocidade da rolagem fica guardada no navegador da TV. Quem configurou o computador para "reduzir movimento" vê o alerta em vermelho, sem piscar.

## 6. Usuários online

- Tela do administrador em Sistema › Usuários online, com o contador **online** no topo. Tabela `sessoes_online` (migração 018): uma linha por aba aberta, com o perfil, o aparelho (tipo, navegador e sistema), se mexeu na tela nos últimos 5 minutos e a hora do último sinal. **Não guarda a tela em uso nem o IP.**
- Cada aba manda um sinal por minuto; sem sinal há mais de 2 minutos = fora do sistema. Fechar a aba ou clicar em Sair apaga a linha na hora. Linhas com mais de 2 dias são apagadas sozinhas.
- O sinal **não conta como uso**: o encerramento por inatividade continua valendo. Só gestos da pessoa contam (mouse, teclado, toque, roda do mouse); a página rolar sozinha não conta.
- **Encerrar sessão** marca as abas da pessoa naquele colégio; no próximo sinal (até 1 minuto) ela sai com um aviso e pode entrar de novo com a senha. Para impedir o acesso, bloqueie em Sistema › Usuários. Não vale para a própria sessão; a de outro administrador, só o proprietário. Cada encerramento fica no Log de Segurança.
- Os sinais (`/api/presenca/sinal` e `/saida`) ficam fora do limite de requisições da API, como o `/api/health`.
