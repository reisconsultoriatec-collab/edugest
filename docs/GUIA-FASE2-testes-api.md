# EduGest — Fase 2, bloco 1: cadastro, colégios, usuários e segurança

Reis Tecnologia · API versão 1.1.0

## O que entrou

| Rota | Quem | Para quê |
|---|---|---|
| `POST /api/conta/registrar` | conta nova | Entra pelo código de convite (fica pendente). Colégio novo: só o proprietário do sistema |
| `POST /api/conta/entrar-colegio` | logado sem colégio | Pede acesso a um colégio pelo código (fica pendente) |
| `POST /api/conta/registrar-responsavel` | conta nova ou existente | Vincula ao aluno pelo código PAI (fica pendente) |
| `POST /api/conta/falha-login` | público | Registra senha errada no log do colégio |
| `POST /api/conta/evento` | logado | Registra login, logout e timeout |
| `PUT /api/me/colegio-atual` · `/nome` · `/tour` | logado | Trocar colégio, nome, concluir tour |
| `GET/PUT /api/me/ajuda` | logado | Central de ajuda: artigos lidos e tours feitos pela pessoa (vale em qualquer aparelho) |
| `GET /api/colegios/atual/implantacao` | admin | Lista de implantação: o que já foi configurado no colégio (só contagens) |
| `POST /api/me/termos` | logado | Aceite dos termos de uso e da política de privacidade (versão atual; grava data, IP e dispositivo). `GET /api/me` traz `termos: { versao, aceito, aceitoEm }` |
| `GET /api/portal/privacidade` · `POST /solicitacoes` · `POST /encerrar-acesso` | responsável | LGPD no portal: encarregado do colégio e meus pedidos; pedido do titular (acesso, correção, exclusão...; prazo de 15 dias corridos, até 5 em aberto); encerrar o próprio acesso (`confirmacao: "ENCERRAR"`, os registros escolares ficam). A família não baixa os dados sozinha: pede ao colégio |
| `GET /api/lgpd` · `PUT /encarregado` · `PUT /solicitacoes/:id` · `GET /solicitacoes/:id/exportar` · `GET /alunos/:id/exportar` · `POST /captacao/limpar` | admin | Privacidade (LGPD): indicadores, encarregado de dados, resposta aos pedidos (concluir ou recusar exige texto), cópia dos dados de quem pediu (responsável e filhos) ou de um aluno, e limpeza dos interessados perdidos há mais de 12 meses (`confirmacao: "APAGAR"`). Tudo vai para o log de segurança (tipo `privacidade`) |
| `GET/POST /api/proprietario/colegios` · `PUT /:id` · `PUT /:id/situacao` | proprietário (`PROPRIETARIO_EMAILS`) | Gestão de Colégios: listar, cadastrar, editar dados, desativar/reativar |
| `GET /api/proprietario/colegios/:id/pendentes` · `POST …/pendentes/:usuarioId/aprovar` · `…/rejeitar` · `POST /:id/acesso` | proprietário | Aprovar/recusar cadastros de qualquer colégio · entrar como administrador (suporte) |
| `GET /api/colegios/atual` | vínculo ativo | Dados, configuração e disciplinas |
| `PUT /api/colegios/atual` · `/atual/config` | admin | Editar dados e configuração |
| `POST /api/colegios/atual/convite/regenerar` | admin | Trocar o código de convite |
| `POST/PUT/DELETE /api/colegios/atual/disciplinas` | admin | Disciplinas (excluir só sem notas) |
| `GET /api/colegios/atual/atividades?limite=&antes=&autor=` · `/atividades/autores` | equipe (módulo dashboard) | Atividade recente: as últimas no Dashboard e o histórico completo, página a página e por pessoa |
| `GET /api/painel/financeiro` · `/pedagogico` · `/atencao` | equipe (módulo dashboard + o módulo de cada cartão) | Dashboard: mensalidades do mês (recebido × previsto), atraso e contas dos próximos 7 dias; aulas sem chamada nos últimos 7 dias letivos e notas que faltam no bimestre encerrado ou nas 2 últimas semanas do atual; alunos com frequência abaixo do mínimo (a partir de 10 aulas) ou média abaixo da de aprovação. Professor: só as turmas e disciplinas dele |
| `GET /api/direcao/painel` (`?atualizar=1` ignora o cache) | alta direção (admin marcado) ou proprietário | Painel da Direção: presença em sala por turma nos últimos 5 dias letivos (alerta abaixo de 60%), indicadores e séries do ano letivo (receita, inadimplência e fluxo por mês, alunos ativos, ocupação e frequência por turma, médias por disciplina, captação, despesas por categoria, próximos eventos). 60 s em cache por colégio. Outros perfis: 403 |
| `GET /api/usuarios` · `POST /vincular` · `/:id/aprovar` · `/:id/rejeitar` · `PUT /:id` · `DELETE /:id` | admin | Gestão de usuários. `PUT /:id` aceita `direcao` (true/false, só para administradores) para liberar o Painel da Direção |
| `GET /api/seguranca/log` | admin | Log de segurança (sem opção de apagar) |
| `GET /api/comunicados` · `/opcoes` · `/recentes` · `/:id` · `POST /` · `PUT /:id` · `DELETE /:id` | módulo comunicados | Comunicados: público (colégio todo, segmentos, turmas), fixar, ciência, leituras e WhatsApp. Professor: só as turmas dele |
| `GET /api/portal/comunicados` · `/pendentes` · `POST /:id/lido` · `POST /:id/ciente` | responsável | Comunicados da família no portal, leitura e confirmação de ciência |
| `GET /api/calendario` · `/opcoes` · `/proximos` · `/:id` · `POST /` · `PUT /:id` · `DELETE /:id` | módulo calendario | Eventos com público, horário e local. Professor: evento/prova/reunião só das turmas dele |
| `GET/PUT /api/calendario/ano-letivo` · `GET/POST /api/calendario/feriados` | coordenação (não professor) | Bimestres e dias letivos (mínimo 200) · feriados nacionais do ano |
| `GET /api/portal/calendario` · `/proximos` | responsável | Calendário da família (só eventos visíveis das turmas dos filhos) |
| `GET /api/grade/opcoes` · `/turmas/:id` · `/professores/:id` · `/minha` | módulo grade | Grade da turma, semana do professor (com carga horária) e "Suas aulas hoje". Professor: só consulta, e só a própria semana |
| `GET /api/grade/horarios` · `PUT /horarios/:periodo` · `PUT /api/grade/turmas/:id` | coordenação (não professor) | Horários de cada turno (aulas e intervalos) · montar a grade; professor em duas turmas no mesmo horário é recusado (409) |
| `GET /api/portal/alunos/:id/grade` | responsável | Horário de aulas do filho |
| `GET /api/secretaria/opcoes` · `POST /previa` · `POST /emitir` | módulo documentos | Declarações (matrícula, frequência, transferência, conclusão e modelos do colégio) e histórico escolar. Emitir grava número e código de validação; a transferência pode marcar o aluno e cancelar mensalidades futuras |
| `GET /api/secretaria/emitidos` · `POST /emitidos/:id/link` · `POST /emitidos/:id/cancelar` | módulo documentos (cancelar: admin) | Livro de registro, 2ª via idêntica, envio por WhatsApp (link que expira) e cancelamento com motivo |
| `GET/POST/PUT/DELETE /api/secretaria/modelos` | módulo documentos | Textos dos documentos (inclusive o contrato de prestação de serviços) ajustados pelo colégio ({variáveis}, **negrito**, [[trechos opcionais]]); DELETE volta ao padrão |
| `GET /api/secretaria/historico/:alunoId` · `PUT …/turmas/:turmaId` · `POST/PUT/DELETE …/anos` | módulo documentos | Anos do histórico: os do EduGest (calculados, com ajustes) e os anteriores digitados |
| `GET /api/secretaria/cabecalho` · `PUT` · `GET/PUT/DELETE /api/secretaria/logo` | módulo documentos (alterar: admin) | INEP, UF, ato de autorização, diretor(a), secretário(a) e logotipo (sai em todos os PDFs, inclusive cobranças) |
| `GET /api/funil/opcoes` · `/resumo` · `GET/POST /leads` · `GET/PUT/DELETE /leads/:id` | módulo funil | Funil de matrículas: interessados, contatos para hoje e atrasados (menu e Dashboard) |
| `POST /api/funil/leads/:id/etapa` · `/interacoes` · `/matricular` | módulo funil (matricular: + alunos; gerar mensalidades: + mensalidades) | Etapas (perdido pede motivo), histórico de contatos e matrícula: cria o aluno (ou vincula um já cadastrado) e gera as mensalidades do ano |
| `GET /api/funil/indicadores` · `GET/PUT /api/funil/formulario` · `POST /formulario/novo-link` | módulo funil (formulário: admin) | Números da captação e o formulário público de interesse |
| `GET/POST /api/publico/funil/:token` | público (envio: 8 a cada 15 min por IP) | Página `interesse.html`: o responsável preenche e entra no funil (aceite de contato, campo isca contra robôs, envios repetidos juntados) |
| `POST /api/alunos/importar` · `GET /importacoes` · `POST /importacoes/:id/desfazer` | módulo alunos | Importar alunos de planilha (Excel/CSV lidos no navegador): `simular: true` só confere (erros, duplicados por CPF, nome + nascimento ou RA, turma pelo nome no ano letivo); grava só as linhas sem erro, com RA e código PAI. Desfazer apaga os alunos da importação enquanto não tiverem mensalidades, notas, chamada ou responsável no portal |
| `GET /api/virada/previa?ano=` · `POST /api/virada` · `POST /:id/desfazer` | admin | Virada do ano letivo: turmas do ano seguinte (série seguinte, turma existente ou não continua), alunos com situação pelas notas e frequência (promover, reter, concluir, sair, decidir depois), mensalidades do ano novo e troca do ano letivo, tudo numa transação. Alunos em "decidir depois" são resolvidos depois (`?ano=` do ano anterior). Desfazer só a última, enquanto o ano novo não tiver notas, chamada, mensalidade paga ou aluno novo nas turmas criadas |
| `GET /api/publico/validar/:codigo` | público (60 consultas a cada 15 min por IP) | Página `validar.html`, aberta pelo QR Code: documento válido ou cancelado, com o nome do aluno abreviado |

Proteções: cadastro limitado a 10 tentativas por IP a cada 15 min; admin não altera nem remove o próprio acesso; o colégio nunca fica sem admin ativo; tudo filtrado pelo colégio atual.

---

## 1. Atualizar no servidor

Envie por SFTP para `/home/ubuntu/edugest-api/`, substituindo:

- `server.js` e `package.json`
- a pasta `src/` inteira
- a pasta nova `scripts/`

**Não** substitua o `.env` nem o `firebase-service-account.json`. Depois:

```bash
cd ~/edugest-api
grep -q FIREBASE_WEB_API_KEY .env || echo 'FIREBASE_WEB_API_KEY=AIzaSyBErShvBxrx1PMbTQURzcSl_-RbEDKlbYg' >> .env
pm2 restart edugest-api
pm2 logs edugest-api --lines 10 --nostream
curl -s http://127.0.0.1:3001/api/health; echo
```

O health deve mostrar `"versao":"1.1.0"`.

## 2. Roteiro de testes

Os testes criam duas contas de teste no Firebase e um "Colégio Teste" no banco. No final há a limpeza.

```bash
cd ~/edugest-api
API=http://127.0.0.1:3001/api
J='Content-Type: application/json'
```

**2.1 — Admin cria o colégio**

```bash
TA=$(node scripts/token.js admin@teste.edugest.local Teste@12345 criar)
curl -s -X POST $API/conta/registrar -H "Authorization: Bearer $TA" -H "$J" \
  -d '{"nome":"Admin Teste","colegioNome":"Colégio Teste"}'; echo
curl -s $API/colegios/atual -H "Authorization: Bearer $TA"; echo
```

Esperado: `"perfil":"admin","status":"ativo"` e, no segundo, os dados do colégio com `codigoConvite` e 8 disciplinas.
Copie o código de convite:

```bash
CONVITE=COLE_O_CODIGO_AQUI
```

**2.2 — Professor entra pelo convite e fica pendente**

```bash
TP=$(node scripts/token.js prof@teste.edugest.local Teste@12345 criar)
curl -s -X POST $API/conta/registrar -H "Authorization: Bearer $TP" -H "$J" \
  -d "{\"nome\":\"Professor Teste\",\"codigoConvite\":\"$CONVITE\"}"; echo
curl -s $API/me/acesso -H "Authorization: Bearer $TP"; echo
```

Esperado: `"status":"pendente"` e depois `"codigo":"pendente"` (acesso bloqueado até aprovar).

**2.3 — Admin lista e aprova**

```bash
curl -s $API/usuarios -H "Authorization: Bearer $TA"; echo
```

Pegue o `id` do Professor Teste:

```bash
PID=COLE_O_ID_AQUI
curl -s -X POST $API/usuarios/$PID/aprovar -H "Authorization: Bearer $TA" -H "$J" -d '{"perfil":"professor"}'; echo
curl -s $API/me/acesso -H "Authorization: Bearer $TP"; echo
```

Esperado: `"perfil":"professor"` com a lista de módulos do professor.

**2.4 — Isolamento: professor não acessa área de admin**

```bash
curl -s $API/usuarios -H "Authorization: Bearer $TP"; echo
curl -s $API/seguranca/log -H "Authorization: Bearer $TP"; echo
```

Esperado nos dois: `"codigo":"perfil"` (403).

**2.5 — Configuração com timeout desativado (0)**

```bash
curl -s -X PUT $API/colegios/atual/config -H "Authorization: Bearer $TA" -H "$J" \
  -d '{"anoLetivo":2026,"valorMensalidade":850,"diaVencimento":10,"mediaAprovacao":6,"frequenciaMinima":75,"timeoutSessaoMin":0}'; echo
curl -s $API/colegios/atual -H "Authorization: Bearer $TA" | grep -o '"timeoutSessaoMin":[0-9]*'; echo
```

Esperado: `"timeoutSessaoMin":0`.

**2.6 — Proteções do admin**

```bash
AID=$(curl -s $API/me -H "Authorization: Bearer $TA" | grep -o '"usuario":{"id":[0-9]*' | grep -o '[0-9]*$')
curl -s -X PUT $API/usuarios/$AID -H "Authorization: Bearer $TA" -H "$J" -d '{"status":"bloqueado"}'; echo
```

Esperado: `"codigo":"proprio_usuario"`.

**2.7 — Falha de login aparece no log**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/conta/falha-login -H "$J" -d '{"email":"prof@teste.edugest.local"}'
curl -s "$API/seguranca/log?limite=10" -H "Authorization: Bearer $TA"; echo
```

Esperado: `204` e, no log, eventos `login_falha`, `admin` (aprovação) e `cadastro`, com o seu IP.

## 3. Limpeza dos dados de teste

```bash
sudo docker exec -it mysql mysql -u root -p edugest -e "DELETE FROM colegios WHERE nome='Colégio Teste'; DELETE FROM log_seguranca WHERE email LIKE '%@teste.edugest.local'; DELETE FROM usuarios WHERE email LIKE '%@teste.edugest.local';"
```

No console do Firebase (*Authentication → Users*), apague as contas `admin@teste.edugest.local` e `prof@teste.edugest.local`.
