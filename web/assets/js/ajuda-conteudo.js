/* =====================================================================
 *  EduGest — conteúdo da Central de ajuda (manual do sistema)
 *  Artigos: { id, titulo, resumo, tela?, perfis?, palavras?, corpo, relacionados? }
 *    tela   → botão "Abrir" e "Mostrar na tela"; esconde de quem não acessa a tela
 *    perfis → admin · professor · financeiro · equipe · responsavel · proprietario
 *    corpo  → ['p'|'h'|'dica'|'atencao'|'onde', texto] · ['passos'|'lista', [..]] · ['tabela', [[cab], [..]]]
 *    texto  → **negrito** · {{Botão}} · `código`
 *  Tours (ajuda-tours.js) e a lista de implantação ficam em EG.AJUDA também.
 * ===================================================================== */
'use strict';
(function (EG) {
  const categorias = [
    { id: 'comecar', titulo: 'Primeiros passos', icone: 'ti-rocket', desc: 'Entrar no sistema, conhecer a tela, os perfis de acesso e os recursos que aparecem em todas as telas.' },
    { id: 'implantacao', titulo: 'Implantação do colégio', icone: 'ti-checklist', desc: 'O que configurar, e em que ordem, para o colégio começar a usar o EduGest.' },
    { id: 'pedagogico', titulo: 'Pedagógico', icone: 'ti-school', desc: 'Turmas, professores, alunos, diário de classe, notas, boletim, calendário e grade horária.' },
    { id: 'secretaria', titulo: 'Secretaria e documentos', icone: 'ti-file-certificate', desc: 'Declarações, histórico escolar, livro de registro, modelos de documento e validação.' },
    { id: 'financeiro', titulo: 'Financeiro', icone: 'ti-coin', desc: 'Mensalidades, cobrança com PIX, bolsas, contas a pagar, fluxo de caixa, relatórios e conciliação bancária.' },
    { id: 'captacao', titulo: 'Captação e comunicação', icone: 'ti-speakerphone', desc: 'Funil de matrículas, formulário de interesse e comunicados para as famílias.' },
    { id: 'ano', titulo: 'Virada e início do ano', icone: 'ti-calendar-repeat', desc: 'Rematrícula, troca do ano letivo e importação de alunos por planilha.' },
    { id: 'sistema', titulo: 'Administração', icone: 'ti-settings', desc: 'Usuários e permissões, log de segurança e gestão de colégios.' },
    { id: 'portal', titulo: 'Portal do responsável', icone: 'ti-home-heart', desc: 'Como as famílias criam a conta e acompanham boletim, faltas, mensalidades e comunicados.' },
    { id: 'duvidas', titulo: 'Perguntas frequentes', icone: 'ti-help-circle', desc: 'Respostas rápidas para as situações mais comuns do dia a dia.' }
  ];
  const artigos = [];
  const add = (cat, lista) => lista.forEach((a) => artigos.push({ cat, ...a }));

  /* =================== PRIMEIROS PASSOS =================== */
  add('comecar', [
    {
      id: 'comecar-entrar', titulo: 'Entrar no EduGest e criar a sua conta', perfis: ['equipe'],
      resumo: 'Como entrar, criar a conta com o código do colégio e o que acontece até o administrador liberar o acesso.',
      palavras: ['login', 'cadastro', 'acesso', 'senha', 'codigo do colegio', 'convite'],
      corpo: [
        ['p', 'Cada pessoa tem o próprio login (e-mail e senha). Não compartilhe a sua senha: tudo o que é feito no sistema fica registrado com o nome de quem fez.'],
        ['h', 'Primeira vez: criar a conta'],
        ['passos', [
          'Peça ao administrador do colégio o **código do colégio** (ele fica em Sistema › Configurações e em Sistema › Usuários).',
          'Na tela de acesso, abra a aba {{Criar conta}}.',
          'Informe o código do colégio, o seu nome completo, o e-mail e uma senha com **pelo menos 8 caracteres, uma letra maiúscula e um número**.',
          'Clique em {{Criar conta}}. A tela passa a mostrar **Aguardando aprovação**.',
          'O administrador aprova o seu cadastro, escolhe o seu perfil (professor, financeiro ou administrador) e o que você pode acessar. Depois disso, clique em {{Verificar novamente}} ou entre de novo.'
        ]],
        ['h', 'Já tenho conta'],
        ['p', 'Na aba {{Entrar}}, digite o e-mail e a senha. Se esqueceu a senha, use {{Esqueci minha senha}}: chega um e-mail com o link para criar uma nova.'],
        ['dica', 'Se você já tem conta no EduGest por outro colégio, não precisa criar outra: peça ao administrador do novo colégio para **vincular o seu e-mail** em Sistema › Usuários.'],
        ['atencao', 'Pais e responsáveis criam a conta pela aba {{Sou responsável}}, com o código de acesso do aluno (começa com `PAI`). Veja "Como as famílias usam o portal".']
      ],
      relacionados: ['comecar-tela', 'comecar-perfis', 'faq-senha', 'faq-aguardando']
    },
    {
      id: 'comecar-tela', titulo: 'Conhecendo a tela do sistema', perfis: ['equipe'],
      resumo: 'Menu lateral, seletor de colégio, topo com conexão, atualizar, ajuda e o menu do seu usuário.',
      palavras: ['menu', 'navegar', 'topo', 'tema escuro', 'modo escuro'],
      corpo: [
        ['p', 'A tela tem três partes: o **menu** à esquerda, o **topo** com o nome da tela e os botões gerais, e o **conteúdo** da tela aberta.'],
        ['h', 'Menu lateral'],
        ['lista', [
          '**Principal**: o Dashboard, com os números do colégio.',
          '**Pedagógico**, **Financeiro**, **Captação**, **Comunicação** e **Sistema**: clique no nome do grupo para abrir e ver as telas. Um grupo abre por vez.',
          '**Ajuda**: esta Central de ajuda.',
          'Você só vê as telas liberadas para o seu perfil. Se precisar de outra, peça ao administrador.'
        ]],
        ['p', 'No celular, o menu fica escondido: toque no botão ☰ no canto superior esquerdo.'],
        ['h', 'Topo'],
        ['lista', [
          '**Indicador de conexão**: mostra há quanto tempo você está conectado. Fica âmbar nos 2 minutos antes de a sessão encerrar por inatividade e vermelho quando cai a conexão.',
          '{{⟳}} **Atualizar**: recarrega os dados da tela (útil quando outra pessoa acabou de lançar algo).',
          '{{?}} **Ajuda**: abre a Central de ajuda já nos artigos da tela em que você está.',
          '**Tema**: alterna entre claro e escuro.',
          '**Seu nome**: abre o menu com Central de ajuda, tour guiado, recarregar o sistema e sair.'
        ]],
        ['dica', 'Quando uma tela tem alterações ainda não salvas (notas digitadas, chamada marcada...), o sistema pergunta antes de você sair dela.']
      ],
      relacionados: ['comecar-conexao', 'comecar-colegios', 'comecar-buscas']
    },
    {
      id: 'comecar-perfis', titulo: 'Perfis de acesso: o que cada um vê', perfis: ['equipe'],
      resumo: 'Administrador, professor, financeiro e responsável, e como o administrador ajusta o acesso de cada pessoa.',
      palavras: ['permissao', 'permissoes', 'modulos', 'liberar', 'bloquear acesso'],
      corpo: [
        ['p', 'Cada pessoa tem um **perfil** em cada colégio. O perfil define o que ela acessa por padrão; o administrador pode liberar ou tirar telas (módulos) de cada pessoa.'],
        ['tabela', [
          ['Perfil', 'Acessa por padrão'],
          ['Administrador', 'Tudo, inclusive Configurações, Usuários, Log de segurança e Virada do ano letivo.'],
          ['Professor', 'Dashboard, Alunos, Turmas, Diário, Notas, Boletim, Calendário, Grade horária e Comunicados. No Diário e nas Notas, só as turmas e disciplinas atribuídas a ele.'],
          ['Financeiro', 'Dashboard, Mensalidades, Contas a pagar, Fluxo de caixa, Bolsas, Relatórios e Conciliação bancária.'],
          ['Responsável', 'Só o Portal do Responsável, com os dados dos filhos vinculados à conta.']
        ]],
        ['p', 'Exemplos de ajuste: liberar Documentos para a secretária com perfil financeiro, ou o Funil de matrículas para a coordenação.'],
        ['onde', 'Sistema › Usuários › ícone de ajustes na linha da pessoa'],
        ['atencao', 'O professor só enxerga as turmas no Diário e nas Notas depois de duas coisas: o cadastro dele em Professores estar **ligado ao login** e as disciplinas estarem **atribuídas** na turma.']
      ],
      relacionados: ['usuarios-modulos', 'turmas-professores', 'faq-professor-turma']
    },
    {
      id: 'comecar-sessao', titulo: 'Sessão, inatividade e segurança', perfis: ['equipe'],
      resumo: 'Por que o sistema sai sozinho depois de um tempo parado e como proteger o seu acesso.',
      palavras: ['saiu sozinho', 'deslogou', 'timeout', 'inatividade', 'seguranca'],
      corpo: [
        ['p', 'Para proteger os dados dos alunos, o EduGest encerra a sessão depois de um tempo **sem uso** (o padrão é 15 minutos; o administrador muda em Configurações › Parâmetros).'],
        ['lista', [
          'Nos 2 minutos finais, o indicador do topo fica âmbar com a contagem regressiva.',
          'Antes de encerrar aparece um aviso: clique em {{Continuar conectado}} para seguir.',
          'Qualquer clique, digitação ou rolagem conta como uso.'
        ]],
        ['h', 'Boas práticas'],
        ['lista', [
          'Use {{Sair}} (menu do seu nome) ao terminar, principalmente em computador compartilhado.',
          'Não salve a senha em computadores da secretaria usados por várias pessoas.',
          'Entradas, saídas, senhas erradas e ações administrativas ficam no **Log de segurança**, que não pode ser apagado.'
        ]]
      ],
      relacionados: ['comecar-conexao', 'seguranca-log', 'faq-sessao']
    },
    {
      id: 'comecar-conexao', titulo: 'Atualizar a tela, "Sem conexão" e nova versão', perfis: ['equipe', 'responsavel'],
      resumo: 'O que fazer quando a internet cai, quando os dados parecem desatualizados e quando sai uma versão nova.',
      palavras: ['internet', 'travou', 'lento', 'atualizar', 'recarregar', 'versao'],
      corpo: [
        ['h', 'Atualizar a tela'],
        ['p', 'O botão {{⟳}} do topo busca de novo os dados da tela aberta, sem sair dela. Use quando outra pessoa acabou de lançar algo ou quando a tela parece parada.'],
        ['p', 'Se algo continuar estranho, use {{Recarregar o sistema}} no menu do seu nome: é como apertar F5, mas avisa antes se houver algo não salvo.'],
        ['h', 'Sem conexão'],
        ['p', 'O indicador do topo fica vermelho com "Sem conexão" quando a internet ou o servidor não respondem. O sistema tenta de novo sozinho; clique no indicador para tentar na hora. O que você estava digitando continua na tela.'],
        ['h', 'Nova versão'],
        ['p', 'Depois de uma atualização do EduGest aparece o aviso **"Há uma nova versão do EduGest"**. Termine o que estiver fazendo e clique em {{Atualizar agora}}. Se escolher "lembrar depois", o aviso volta mais tarde.']
      ],
      relacionados: ['faq-sem-conexao', 'faq-nova-versao']
    },
    {
      id: 'comecar-colegios', titulo: 'Trabalhar em mais de um colégio', perfis: ['equipe'],
      resumo: 'Uma única conta para vários colégios, cada um com os seus dados e o seu perfil.',
      palavras: ['trocar de colegio', 'rede de escolas', 'unidade'],
      corpo: [
        ['p', 'Se você trabalha em mais de um colégio que usa o EduGest, use a mesma conta. Cada colégio tem os seus dados completamente separados, e você pode ter perfis diferentes (por exemplo, professor em um e administrador em outro).'],
        ['passos', [
          'No menu lateral, abra o seletor **Colégio**.',
          'Escolha o colégio. O menu muda conforme o seu perfil nele.'
        ]],
        ['dica', 'Para entrar em mais um colégio, peça ao administrador dele para **vincular o seu e-mail** em Sistema › Usuários. Não é preciso criar outra conta.']
      ]
    },
    {
      id: 'comecar-buscas', titulo: 'Buscas, filtros, PDF, planilhas e WhatsApp', perfis: ['equipe'],
      resumo: 'Recursos que se repetem em várias telas: buscar, filtrar, imprimir ou salvar em PDF, exportar para o Excel e enviar pelo WhatsApp.',
      palavras: ['imprimir', 'pdf', 'excel', 'csv', 'exportar', 'whatsapp', 'filtro'],
      corpo: [
        ['lista', [
          '**Busca**: não precisa de acento nem de maiúsculas. Em Alunos, por exemplo, busca por nome, RA, código de acesso ou responsável.',
          '**Filtros em botões** (chips): clique para mostrar só uma situação, como "Vencidas" ou "Inativos". O número entre parênteses é a quantidade.',
          '**Imprimir / PDF**: abre a impressão do navegador. Para gerar o arquivo, escolha a impressora **Salvar como PDF**.',
          '**Exportar CSV**: baixa uma planilha que abre direto no Excel em português.',
          '**WhatsApp**: abre a conversa já com a mensagem pronta (no computador, pelo WhatsApp Web ou o aplicativo). Você confere o texto e envia.'
        ]],
        ['dica', 'Documentos enviados por WhatsApp (cobranças, declarações) vão como **link com validade**. Depois do prazo o link deixa de abrir e é preciso enviar de novo.']
      ],
      relacionados: ['faq-pdf', 'faq-whatsapp']
    },
    {
      id: 'app-instalar', titulo: 'Instalar o EduGest como aplicativo (celular e computador)', perfis: ['equipe', 'responsavel'],
      resumo: 'Ícone na tela inicial do celular ou na área de trabalho, abrindo em tela cheia como um aplicativo.',
      palavras: ['aplicativo', 'app', 'instalar', 'celular', 'tela inicial', 'atalho', 'android', 'iphone', 'pwa'],
      corpo: [
        ['p', 'O EduGest pode ser instalado como aplicativo, sem loja: ganha um ícone na tela inicial e abre em tela cheia, sem a barra do navegador. É o mesmo sistema, sempre atualizado.'],
        ['h', 'Android (Chrome)'],
        ['passos', [
          'Entre no EduGest pelo Chrome.',
          'Toque em {{Instalar}} no convite que aparece embaixo da tela, ou no menu do seu nome › {{Instalar o aplicativo}}.',
          'Confirme. O ícone aparece na tela inicial.'
        ]],
        ['p', 'Se não aparecer a opção, use o menu ⋮ do Chrome › **Instalar app** (ou "Adicionar à tela inicial").'],
        ['h', 'iPhone e iPad (Safari)'],
        ['passos', [
          'Abra o EduGest no **Safari**.',
          'Toque em **Compartilhar** (o quadrado com a seta para cima).',
          'Toque em **Adicionar à Tela de Início** e depois em **Adicionar**.'
        ]],
        ['h', 'Computador (Chrome ou Edge)'],
        ['p', 'Clique no ícone de instalar na barra de endereço ou no menu do seu nome › {{Instalar o aplicativo}}. O EduGest abre numa janela própria e pode ser fixado na barra de tarefas.'],
        ['dica', 'O aplicativo precisa de internet, como o site. Os dados do colégio não ficam guardados no aparelho: se o celular for perdido, basta trocar a senha.'],
        ['p', 'Para sair da conta no aplicativo, use o menu do seu nome › {{Sair}}. Para remover, desinstale como qualquer aplicativo.']
      ],
      relacionados: ['comecar-tela', 'faq-sem-conexao']
    },
    {
      id: 'comecar-dashboard', titulo: 'Dashboard: os números do colégio', tela: 'dashboard',
      resumo: 'Alunos, professores, turmas, inadimplentes, aulas do dia, captação, comunicados, próximos eventos e atividade recente.',
      palavras: ['inicio', 'painel', 'indicadores'],
      corpo: [
        ['p', 'O Dashboard é a primeira tela depois do login. Ele junta o que pede atenção:'],
        ['lista', [
          '**Indicadores**: alunos ativos (e quantos estão sem turma), professores ativos, turmas do ano letivo e alunos inadimplentes. Clique num indicador para abrir a tela correspondente.',
          '**Cadastros aguardando aprovação** (administrador): aparece quando alguém se cadastrou e precisa ser liberado.',
          '**Implantação do colégio** (administrador): o que ainda falta configurar, até tudo estar pronto.',
          '**Suas aulas hoje** (professor): pela grade horária.',
          '**Captação de alunos**: novos interessados e contatos marcados para hoje ou atrasados no funil.',
          '**Próximos eventos** e **Últimos comunicados**, com quantas famílias já leram.',
          '**Atividade recente**: quem fez o quê no sistema.'
        ]]
      ]
    }
  ]);

  /* =================== IMPLANTAÇÃO =================== */
  add('implantacao', [
    {
      id: 'implantacao-ordem', titulo: 'Roteiro de implantação: por onde começar', perfis: ['admin'],
      resumo: 'A ordem que evita retrabalho para colocar o colégio no ar: configurações, estrutura do ano, alunos, financeiro e pessoas.',
      palavras: ['comecar', 'implantar', 'configurar', 'primeiro acesso', 'onboarding'],
      corpo: [
        ['p', 'A lista **Implantação do colégio** (no Dashboard e no topo deste assunto) mostra o que já está feito, conferindo os dados do próprio sistema. Siga esta ordem:'],
        ['h', '1. O colégio'],
        ['passos', [
          '**Dados do colégio**: nome, CNPJ, telefone e endereço (saem nos documentos e cobranças).',
          '**Parâmetros**: ano letivo, mensalidade padrão, dia de vencimento, média para aprovação e frequência mínima.',
          '**Cobrança e PIX**: chave PIX e cidade, para as cobranças saírem com QR Code.',
          '**Logotipo e documentos oficiais**: logotipo, INEP, ato de autorização, diretor(a) e secretário(a).'
        ]],
        ['h', '2. Estrutura do ano letivo'],
        ['passos', [
          '**Disciplinas** (Configurações): revise a lista padrão.',
          '**Turmas** do ano letivo.',
          '**Professores**, com as disciplinas que lecionam.',
          '**Atribuições**: quem dá cada disciplina em cada turma.',
          '**Horários** de cada turno e a **grade horária** das turmas.',
          '**Calendário**: bimestres, feriados e eventos.'
        ]],
        ['h', '3. Alunos e financeiro'],
        ['passos', [
          '**Alunos**: importe a planilha da escola ou cadastre um a um, já na turma.',
          '**Bolsas e descontos**, antes de gerar as mensalidades.',
          '**Mensalidades** do ano.'
        ]],
        ['h', '4. Pessoas'],
        ['passos', [
          '**Equipe**: passe o código do colégio, aprove os cadastros e ajuste os módulos.',
          '**Famílias**: envie o código de acesso (PAI) de cada aluno para os responsáveis entrarem no portal.'
        ]],
        ['dica', 'Cadastre as bolsas antes de gerar as mensalidades. Se gerar antes, não tem problema: ao salvar a bolsa, as mensalidades em aberto do aluno são recalculadas.']
      ],
      relacionados: ['implantacao-dados', 'implantacao-parametros', 'importar-planilha', 'implantacao-equipe']
    },
    {
      id: 'implantacao-dados', titulo: 'Dados do colégio, logotipo e documentos oficiais', tela: 'config', perfis: ['admin'],
      resumo: 'Nome, CNPJ, contatos e endereço; logotipo; INEP, ato de autorização, diretor(a) e secretário(a).',
      palavras: ['cnpj', 'logo', 'logotipo', 'inep', 'diretor', 'secretario', 'cabecalho'],
      corpo: [
        ['onde', 'Sistema › Configurações'],
        ['h', 'Dados do colégio'],
        ['p', 'Nome, CNPJ, telefone, e-mail e endereço saem nos PDFs (declarações, histórico, cobranças, recibos). O **WhatsApp para avisos de novos cadastros** permite que quem se cadastrar avise o colégio para pedir aprovação.'],
        ['h', 'Logotipo e documentos oficiais'],
        ['passos', [
          'Envie o logotipo (PNG, JPG ou WEBP). Ele é reduzido automaticamente; prefira a versão horizontal ou quadrada, com fundo branco.',
          'Preencha **Código INEP**, **UF**, **Ato de autorização / credenciamento**, **diretor(a)** e **secretário(a)** com os registros.',
          'Clique em {{Salvar dados dos documentos}}.'
        ]],
        ['p', 'Esses dados vão para o cabeçalho e as assinaturas das declarações e do histórico escolar. O logotipo aparece também em cobranças, recibos e carnês.'],
        ['dica', 'A cidade que sai na data dos documentos é a informada em **Cobrança e PIX**.']
      ],
      relacionados: ['implantacao-pix', 'documentos-emitir']
    },
    {
      id: 'implantacao-parametros', titulo: 'Parâmetros: ano letivo, mensalidade, média e frequência', tela: 'config', perfis: ['admin'],
      resumo: 'Os números que valem para o colégio inteiro, e o tempo de inatividade para encerrar a sessão.',
      palavras: ['ano letivo', 'media', 'frequencia minima', 'vencimento', 'valor padrao', 'timeout'],
      corpo: [
        ['onde', 'Sistema › Configurações › Parâmetros'],
        ['tabela', [
          ['Parâmetro', 'Para que serve'],
          ['Ano letivo', 'O ano em que o colégio está. Define as turmas que aparecem por padrão, as mensalidades sugeridas e o que entra no Dashboard.'],
          ['Mensalidade padrão (R$)', 'Valor sugerido ao gerar mensalidades e na virada do ano.'],
          ['Dia de vencimento', 'Dia sugerido para o vencimento das mensalidades (1 a 28).'],
          ['Média para aprovação', 'Média final mínima em cada disciplina (ex.: 6,0).'],
          ['Frequência mínima (%)', 'Presença mínima no ano (ex.: 75%). Abaixo dela, o boletim mostra "Frequência insuficiente".'],
          ['Encerrar sessão inativa após', 'Minutos sem uso até o sistema sair sozinho.']
        ]],
        ['atencao', 'No fim do ano, prefira a **Virada do ano letivo** a trocar o ano aqui: ela cria as turmas novas, passa os alunos e gera as mensalidades, e pode ser desfeita.']
      ],
      relacionados: ['virada-quando', 'notas-media']
    },
    {
      id: 'implantacao-pix', titulo: 'Cobrança e PIX', tela: 'config', perfis: ['admin', 'financeiro'],
      resumo: 'Chave PIX, beneficiário, cidade, instruções e validade dos links das cobranças.',
      palavras: ['pix', 'qr code', 'chave', 'copia e cola', 'boleto'],
      corpo: [
        ['onde', 'Sistema › Configurações › Cobrança e PIX'],
        ['p', 'Com a chave PIX configurada, os PDFs de mensalidade, carnê e lote saem com **QR Code PIX** e **copia e cola**, já com o valor de cada parcela. O dinheiro cai direto na conta do colégio.'],
        ['passos', [
          'Escolha o **tipo da chave** (CNPJ, e-mail, telefone ou aleatória) e digite a chave.',
          'Confira o **nome do beneficiário** (em branco, usa o nome do colégio) e a **cidade** (obrigatória no PIX).',
          'Se quiser, escreva as **instruções** que saem impressas nas cobranças (multa, juros, contato).',
          'Defina a **validade dos links** enviados por WhatsApp.',
          'Clique em {{Salvar cobrança}} e depois em {{PDF de teste (R$ 1,00)}}. Leia o QR Code com o aplicativo do seu banco e confira o nome do colégio e o valor. Não precisa concluir o pagamento.'
        ]],
        ['atencao', 'O PIX não dá baixa sozinho: quando o pagamento cair, registre com {{Receber}} na mensalidade ou use a **Conciliação bancária** com o extrato do banco.']
      ],
      relacionados: ['mensalidades-cobrar', 'mensalidades-receber', 'conciliacao-conta']
    },
    {
      id: 'implantacao-disciplinas', titulo: 'Disciplinas', tela: 'config', perfis: ['admin'],
      resumo: 'A lista de disciplinas do colégio, usada no diário, nas notas, no boletim, na grade e no histórico.',
      palavras: ['materias', 'componentes curriculares'],
      corpo: [
        ['onde', 'Sistema › Configurações › Disciplinas'],
        ['lista', [
          'O colégio começa com uma lista padrão. Inclua as que faltam com {{Adicionar}}.',
          'Disciplina **com notas lançadas** não pode ser excluída: desative para tirá-la das listas (o histórico continua com ela).',
          'A ordem da lista é a ordem que aparece no boletim e no histórico.'
        ]]
      ]
    },
    {
      id: 'implantacao-equipe', titulo: 'Trazer a equipe: código do colégio e aprovação', tela: 'usuarios', perfis: ['admin'],
      resumo: 'Como professores e funcionários entram no sistema e como você libera cada um.',
      palavras: ['convite', 'codigo', 'aprovar', 'professor novo', 'funcionario'],
      corpo: [
        ['passos', [
          'Copie o **código do colégio** em Sistema › Usuários (ou Configurações) e envie para a equipe.',
          'Cada pessoa cria a conta em {{Criar conta}} com esse código.',
          'Os cadastros aparecem em **Cadastros aguardando aprovação** (também no Dashboard).',
          'Clique em {{Aprovar}}, escolha o **perfil** e, se quiser, ajuste os **módulos**. Para professor, ligue ao **cadastro de professor**.',
          'Pronto: a pessoa entra e vê só o que foi liberado.'
        ]],
        ['dica', 'Quem já tem conta no EduGest (de outro colégio) pode ser adicionado direto com {{Vincular por e-mail}}, sem código: o acesso fica ativo na hora.'],
        ['atencao', 'Se o código vazar, gere um novo em Configurações › Código do colégio. O antigo deixa de funcionar; quem já entrou continua com acesso.']
      ],
      relacionados: ['usuarios-gerenciar', 'usuarios-modulos', 'professores-cadastrar']
    },
    {
      id: 'implantacao-familias', titulo: 'Liberar o portal para as famílias', tela: 'alunos', perfis: ['admin'],
      resumo: 'Envio do código de acesso (PAI) e aprovação dos responsáveis.',
      palavras: ['pais', 'responsaveis', 'portal', 'codigo pai', 'familias'],
      corpo: [
        ['p', 'Cada aluno tem um **código de acesso** que começa com `PAI`. Com ele, o responsável cria a conta no portal e passa a acompanhar boletim, faltas, mensalidades, comunicados e calendário.'],
        ['passos', [
          'Em Alunos, abra a ficha do aluno.',
          'Em **Acesso do responsável ao portal**, clique em {{Enviar}} para mandar pelo WhatsApp a mensagem pronta com o código e o endereço do sistema (ou {{Copiar}}).',
          'O responsável cria a conta na aba {{Sou responsável}}.',
          'O cadastro aparece em Sistema › Usuários para aprovação. Aprove com o perfil **Responsável**.'
        ]],
        ['dica', 'Depois de importar a planilha de alunos, baixe a **lista com RA e códigos** no fim da importação para distribuir de uma vez.'],
        ['p', 'Irmãos: o responsável usa {{Adicionar aluno}} no portal com o código do outro filho.']
      ],
      relacionados: ['alunos-codigo', 'portal-equipe', 'importar-planilha']
    }
  ]);

  /* =================== PEDAGÓGICO =================== */
  add('pedagogico', [
    {
      id: 'turmas-criar', titulo: 'Criar e organizar as turmas', tela: 'turmas',
      resumo: 'Nome, série, turno, capacidade e sala; turmas de outros anos; desativar e excluir.',
      palavras: ['turma nova', 'serie', 'periodo', 'turno', 'vagas', 'capacidade', 'sala'],
      corpo: [
        ['onde', 'Pedagógico › Turmas e Séries'],
        ['passos', [
          'Clique em {{Nova turma}}.',
          'Preencha o **nome** (ex.: "5º Ano A"), a **série**, o **período** (matutino, vespertino, integral ou noturno), a **capacidade** (vagas) e, se quiser, a **sala**.',
          'Confira o **ano letivo** e salve.'
        ]],
        ['p', 'Cada cartão mostra a ocupação (alunos/vagas), quantas disciplinas já têm professor e os botões {{Alunos}} (abre a lista da turma), {{Professores}} (atribuições) e {{Editar}}.'],
        ['lista', [
          'Use o seletor **Ano letivo** no alto para ver turmas de anos anteriores ou já criadas para o próximo ano.',
          'Os botões de turno filtram as turmas.',
          'Turma que não vai mais ser usada: **desative** (ícone de arquivo). Ela some das listas, mas notas, diário e histórico continuam.',
          'Excluir só faz sentido para turma criada por engano.'
        ]],
        ['atencao', 'Trocar o **turno** de uma turma apaga a grade horária dela, porque os horários de cada turno são diferentes. O sistema avisa antes.'],
        ['dica', 'A série é usada para separar os segmentos (Educação Infantil, Fundamental I e II, Ensino Médio) nos comunicados e no calendário, e para propor a série seguinte na virada do ano.']
      ],
      relacionados: ['turmas-professores', 'grade-montar', 'virada-quando']
    },
    {
      id: 'turmas-professores', titulo: 'Atribuir professores às disciplinas da turma', tela: 'turmas',
      resumo: 'Quem dá cada disciplina em cada turma. É isso que libera a turma para o professor no Diário e nas Notas.',
      palavras: ['atribuicao', 'professor da turma', 'polivalente', 'disciplina da turma'],
      corpo: [
        ['onde', 'Pedagógico › Turmas e Séries › botão {{Professores}} no cartão da turma'],
        ['passos', [
          'Para cada disciplina, escolha o professor.',
          'Professor polivalente (Educação Infantil e Fundamental I): escolha o professor no campo de cima e clique em {{Aplicar a todas}}.',
          'Salve.'
        ]],
        ['p', 'O professor verá a turma no Diário de Classe e nas Notas **apenas nas disciplinas atribuídas a ele**. A atribuição também alimenta a grade horária e a carga horária do professor.'],
        ['atencao', 'O professor só aparece na lista se estiver cadastrado em Professores com status ativo.']
      ],
      relacionados: ['professores-cadastrar', 'faq-professor-turma']
    },
    {
      id: 'professores-cadastrar', titulo: 'Cadastrar professores e ligar ao login', tela: 'professores',
      resumo: 'Ficha do professor, disciplinas que leciona e o vínculo com o usuário que ele usa para entrar.',
      palavras: ['professor novo', 'docente', 'vincular login', 'carga horaria'],
      corpo: [
        ['onde', 'Pedagógico › Professores'],
        ['passos', [
          'Clique em {{Novo professor}}.',
          'Preencha nome, telefone, e-mail e a carga horária semanal (opcional).',
          'Marque as **disciplinas que leciona**.',
          'Em **Login no sistema**, escolha o usuário dele (a conta que ele criou com o código do colégio e você aprovou).',
          'Salve.'
        ]],
        ['p', 'Sem o vínculo com o login, o professor entra no sistema mas não enxerga turma nenhuma no Diário, nas Notas e em "Minha grade".'],
        ['dica', 'O vínculo também pode ser feito na aprovação do cadastro, em Sistema › Usuários.'],
        ['p', 'Professor que saiu: mude o status para **Inativo**. O histórico dele (diários, notas) continua.']
      ],
      relacionados: ['turmas-professores', 'implantacao-equipe']
    },
    {
      id: 'alunos-cadastrar', titulo: 'Cadastrar um aluno', tela: 'alunos',
      resumo: 'Ficha completa: dados do aluno, turma, dados para documentos, responsável e autorizados a retirar.',
      palavras: ['matricula', 'aluno novo', 'ficha', 'ra', 'cpf', 'responsavel'],
      corpo: [
        ['onde', 'Pedagógico › Alunos › {{Novo aluno}}'],
        ['passos', [
          '**Dados do aluno**: nome completo, nascimento, CPF, RG. O **RA** é gerado automaticamente (ou digite o da escola).',
          '**Turma** e **status** (ativo para quem está estudando).',
          '**Dados para documentos**: mãe, pai, naturalidade, UF, nacionalidade e data de matrícula. Saem no histórico escolar e nas declarações.',
          '**Responsável**: nome, parentesco, CPF, telefone/WhatsApp e e-mail. O CPF do responsável sai na declaração de pagamentos do Imposto de Renda e fica gravado criptografado.',
          '**Autorizados a retirar** (opcional): outras pessoas que podem buscar o aluno.',
          'Clique em {{Cadastrar aluno}}. O aviso mostra o RA e o código de acesso do responsável.'
        ]],
        ['dica', 'Muitos alunos de uma vez? Use {{Importar planilha}} (Excel ou CSV).'],
        ['p', 'Para alterar depois, clique no lápis da linha do aluno.']
      ],
      relacionados: ['alunos-codigo', 'alunos-situacao', 'importar-planilha', 'funil-matricular']
    },
    {
      id: 'alunos-codigo', titulo: 'Código de acesso do responsável (PAI)', tela: 'alunos',
      resumo: 'O código que cada família usa para entrar no portal: copiar, enviar pelo WhatsApp e gerar outro.',
      palavras: ['codigo pai', 'portal', 'acesso dos pais', 'enviar codigo'],
      corpo: [
        ['p', 'Cada aluno tem um código que começa com `PAI` (ex.: `PAI7K2M9Q`). Ele aparece na lista de alunos e na ficha.'],
        ['lista', [
          '{{Copiar}}: copia o código para colar onde quiser.',
          '{{Enviar}}: abre o WhatsApp do responsável com a mensagem pronta (nome do colégio, código e o passo a passo para criar a conta).',
          '{{Gerar novo}}: troca o código. O antigo deixa de valer para cadastros novos; quem já usa o portal continua com acesso.'
        ]],
        ['p', 'Na ficha aparece também quantos responsáveis já usam o portal com aquele aluno.'],
        ['atencao', 'O código dá acesso aos dados do aluno depois da aprovação do colégio. Envie só para o responsável e aprove apenas quem você reconhece.']
      ],
      relacionados: ['implantacao-familias', 'portal-equipe', 'faq-codigo-pai']
    },
    {
      id: 'alunos-situacao', titulo: 'Situação do aluno: ativo, inativo, transferido e concluído', tela: 'alunos',
      resumo: 'Quando usar cada situação e por que é melhor que excluir o aluno.',
      palavras: ['inativo', 'transferido', 'concluido', 'excluir aluno', 'saiu da escola', 'desistente'],
      corpo: [
        ['tabela', [
          ['Situação', 'Quando usar'],
          ['Ativo', 'Está estudando no colégio. Só ativos entram em chamada, notas, cobranças e comunicados.'],
          ['Inativo', 'Saiu ou desistiu (sem transferência formal).'],
          ['Transferido', 'Foi para outra escola. A declaração de transferência (Documentos) já muda a situação e pode cancelar as mensalidades futuras.'],
          ['Concluído', 'Terminou o curso no colégio (marcado na virada do ano, por exemplo, na última série).']
        ]],
        ['p', 'Os botões no alto da lista de alunos filtram por situação.'],
        ['atencao', '**Prefira mudar a situação a excluir.** Aluno com mensalidades não pode ser excluído (para preservar o financeiro). Com notas ou chamada, o sistema pede confirmação, e esses registros somem junto. Documentos já emitidos continuam no livro de registro.']
      ],
      relacionados: ['documentos-transferencia', 'faq-aluno-saiu']
    },
    {
      id: 'alunos-autorizados', titulo: 'Pessoas autorizadas a retirar o aluno', tela: 'alunos',
      resumo: 'Quem, além do responsável, pode buscar o aluno na escola.',
      palavras: ['retirada', 'buscar aluno', 'saida', 'autorizacao'],
      corpo: [
        ['onde', 'Ficha do aluno › Autorizados a retirar o aluno'],
        ['passos', [
          'Clique em {{Adicionar pessoa autorizada}}.',
          'Preencha nome completo, parentesco (pai, avó, transporte escolar...), RG ou CPF e telefone.',
          'Até 6 pessoas por aluno. Salve a ficha.'
        ]],
        ['p', 'A lista de alunos mostra quantos autorizados cada aluno tem. Na retirada, confira o documento com foto.']
      ]
    },
    {
      id: 'diario-chamada', titulo: 'Fazer a chamada e registrar o conteúdo da aula', tela: 'diario',
      resumo: 'Presença, falta e falta justificada; conteúdo ministrado; chamada do dia para a Educação Infantil e o Fundamental I.',
      palavras: ['chamada', 'presenca', 'falta', 'frequencia', 'conteudo', 'diario de classe'],
      corpo: [
        ['onde', 'Pedagógico › Diário de Classe'],
        ['passos', [
          'Escolha a **turma**, a **data da aula** e a **aula** (a disciplina). Para turmas com professor polivalente, use **Chamada do dia (todas as aulas)**.',
          'Marque cada aluno: **P** (presente), **F** (falta) ou **J** (falta justificada). {{Todos presentes}} marca todos de uma vez; depois é só trocar quem faltou.',
          'Escreva o **conteúdo ministrado** (opcional na chamada, mas aparece no portal para as famílias, junto das faltas).',
          'Clique em {{Salvar diário}}.'
        ]],
        ['lista', [
          'A contagem mostra quantos alunos ainda estão sem marcação.',
          'Não é possível registrar aula em data futura, nem fora do ano letivo da turma.',
          'O professor vê só as turmas e disciplinas atribuídas a ele.'
        ]],
        ['p', 'A frequência do boletim é calculada assim: (presenças + faltas justificadas) ÷ aulas registradas.']
      ],
      relacionados: ['diario-corrigir', 'boletim-emitir', 'faq-professor-turma']
    },
    {
      id: 'diario-corrigir', titulo: 'Corrigir ou excluir um registro do diário', tela: 'diario',
      resumo: 'Como abrir uma aula já lançada para mudar a chamada ou o conteúdo.',
      palavras: ['corrigir chamada', 'editar diario', 'apagar aula'],
      corpo: [
        ['p', 'Escolha de novo a turma, a data e a aula: o registro salvo abre com a chamada e o conteúdo. Altere e clique em {{Salvar diário}}.'],
        ['p', 'Em **Registros da turma** (abaixo) ficam as últimas aulas, com o resumo de presentes e faltas. Clique numa delas para abrir.'],
        ['p', '{{Excluir registro}} apaga a aula inteira (chamada e conteúdo). Use quando a aula foi lançada na data ou na disciplina errada.']
      ]
    },
    {
      id: 'notas-lancar', titulo: 'Lançar notas do bimestre', tela: 'notas',
      resumo: 'Nota 1, Nota 2 e Trabalho por bimestre, com a média calculada na hora.',
      palavras: ['notas', 'avaliacao', 'prova', 'trabalho', 'bimestre', 'media'],
      corpo: [
        ['onde', 'Pedagógico › Notas e Médias'],
        ['passos', [
          'Escolha a **turma**, a **disciplina** e o **bimestre**.',
          'Digite as notas de 0 a 10 em **Nota 1**, **Nota 2** e **Trabalho**. Vale vírgula ou ponto (7,5 ou 7.5).',
          '**Enter** passa para o próximo aluno.',
          'Confira a média e a situação de cada aluno (na média ou abaixo).',
          'Clique em {{Salvar notas}}.'
        ]],
        ['p', 'Nota em branco **não conta como zero**: a média do bimestre é a média das notas lançadas. Para apagar uma nota, deixe o campo vazio e salve.'],
        ['p', 'No alto aparece quem fez a última alteração e quando.'],
        ['dica', 'Saiu da tela sem salvar? O sistema avisa antes. Use {{Descartar}} se quiser voltar ao que estava gravado.']
      ],
      relacionados: ['notas-media', 'boletim-emitir']
    },
    {
      id: 'notas-media', titulo: 'Como o EduGest calcula médias e a situação', telas: ['notas', 'boletim'],
      resumo: 'Média do bimestre, média final, recuperação, frequência insuficiente e "em curso".',
      palavras: ['media final', 'aprovado', 'reprovado', 'recuperacao', 'calculo', 'situacao'],
      corpo: [
        ['lista', [
          '**Média do bimestre**: média das notas lançadas no bimestre (Nota 1, Nota 2 e Trabalho), com 1 casa decimal.',
          '**Média final da disciplina**: média dos bimestres lançados.',
          '**Situação da disciplina**: "em curso" até os 4 bimestres terem nota; depois, **aprovado** (média final maior ou igual à média do colégio) ou **recuperação**.',
          '**Frequência**: (presenças + faltas justificadas) ÷ aulas registradas no diário.'
        ]],
        ['h', 'Situação geral do aluno'],
        ['tabela', [
          ['Situação', 'Quando'],
          ['Em curso', 'Ainda falta bimestre com nota em alguma disciplina.'],
          ['Aprovado', 'Todas as disciplinas aprovadas e frequência acima do mínimo.'],
          ['Recuperação', 'Alguma disciplina abaixo da média.'],
          ['Frequência insuficiente', 'Frequência abaixo do mínimo do colégio.']
        ]],
        ['p', 'A média para aprovação e a frequência mínima ficam em Configurações › Parâmetros. A mesma regra vale para o boletim, o portal das famílias, a virada do ano e o histórico escolar.']
      ],
      relacionados: ['implantacao-parametros', 'virada-passos']
    },
    {
      id: 'boletim-emitir', titulo: 'Emitir o boletim e enviar ao responsável', tela: 'boletim',
      resumo: 'Boletim com médias por bimestre, média final, situação e frequência; imprimir, PDF e WhatsApp.',
      palavras: ['boletim', 'imprimir boletim', 'enviar boletim'],
      corpo: [
        ['onde', 'Pedagógico › Boletim'],
        ['passos', [
          'Escolha a **turma** e o **aluno**.',
          'Confira as médias, a situação e a frequência.',
          '{{Imprimir / PDF}} abre a impressão (escolha "Salvar como PDF" para gerar o arquivo).',
          '{{Enviar ao responsável}} abre o WhatsApp do responsável com o resumo do boletim.'
        ]],
        ['p', 'Turmas inativas e de anos anteriores também aparecem, para consultar boletins antigos. As famílias veem o mesmo boletim no portal.']
      ],
      relacionados: ['notas-media', 'portal-boletim']
    },
    {
      id: 'calendario-eventos', titulo: 'Calendário: eventos, provas, reuniões e feriados', tela: 'calendario',
      resumo: 'Criar eventos com público, horário e local; o que aparece para as famílias; imprimir o calendário.',
      palavras: ['evento', 'prova', 'reuniao', 'feriado', 'recesso', 'agenda', 'conselho de classe'],
      corpo: [
        ['onde', 'Pedagógico › Calendário Escolar'],
        ['passos', [
          'Clique em {{Novo evento}} (ou num dia da grade do mês).',
          'Dê um **título** e escolha o **tipo**: evento, prova, reunião, conselho de classe, feriado, recesso ou dia letivo extra.',
          'Informe a **data** (e "até", se durar vários dias), o horário e o local, se quiser.',
          'Em **Para quem**, escolha o colégio todo, segmentos (Infantil, Fundamental I...) ou turmas.',
          'Deixe marcado **Aparece para as famílias** para o evento ir para o portal. Desmarque para eventos internos, como conselho de classe.',
          'Salve.'
        ]],
        ['lista', [
          'Veja por **Mês** ou em **Lista**, e filtre por tipo e turma.',
          '{{Feriados nacionais}} inclui os feriados do ano de uma vez. Feriados da cidade e do estado: crie com o tipo **Feriado**.',
          '{{Imprimir}} gera o calendário para o mural ou para enviar às famílias.',
          'O professor cria provas, reuniões e eventos só para as turmas dele.'
        ]],
        ['p', 'Feriados, recessos e dias letivos extras entram na contagem de dias letivos.']
      ],
      relacionados: ['calendario-bimestres', 'portal-calendario']
    },
    {
      id: 'calendario-bimestres', titulo: 'Bimestres e dias letivos', tela: 'calendario',
      resumo: 'Início e fim de cada bimestre e a contagem de dias letivos do ano (mínimo de 200).',
      palavras: ['bimestre', 'dias letivos', '200 dias', 'ldb', 'periodo letivo'],
      corpo: [
        ['onde', 'Calendário Escolar › {{Definir bimestres}}'],
        ['passos', [
          'Informe o início e o fim de cada bimestre do ano letivo. As férias entre eles não contam como dias letivos.',
          'Deixe em branco o bimestre que ainda não tem datas.',
          'Salve.'
        ]],
        ['p', 'O sistema conta os dias letivos de segunda a sexta dentro dos bimestres, menos feriados e recessos do colégio todo, mais os dias letivos extras. O total aparece no calendário, com o mínimo de 200 dias da LDB.'],
        ['dica', 'Os dias letivos e a carga horária da grade entram sozinhos no histórico escolar.']
      ],
      relacionados: ['calendario-eventos', 'documentos-historico']
    },
    {
      id: 'grade-horarios', titulo: 'Horários de aula de cada turno', tela: 'grade', perfis: ['admin'],
      resumo: 'Aulas e intervalos do matutino, vespertino, integral e noturno. É a base da grade horária.',
      palavras: ['horario', 'intervalo', 'recreio', 'turno', 'aulas por dia'],
      corpo: [
        ['onde', 'Pedagógico › Grade Horária › aba {{Horários}}'],
        ['passos', [
          'Escolha o turno.',
          'Use {{Gerar automaticamente}}: informe a hora da primeira aula, a duração da aula, o número de aulas, depois de qual aula vem o intervalo e quanto ele dura.',
          'Ajuste o que precisar na lista (início, fim e tipo: aula ou intervalo).',
          'Clique em {{Salvar horários}}.'
        ]],
        ['p', 'Cada turma usa os horários do seu turno. Ao mudar um horário, as aulas já marcadas na grade continuam nas mesmas posições (1ª aula, 2ª aula...).']
      ],
      relacionados: ['grade-montar']
    },
    {
      id: 'grade-montar', titulo: 'Montar a grade horária da turma', tela: 'grade',
      resumo: 'Disciplina e professor em cada horário da semana, sem conflito de professor.',
      palavras: ['grade', 'horario da turma', 'quadro de horarios'],
      corpo: [
        ['onde', 'Pedagógico › Grade Horária › aba {{Turmas}}'],
        ['passos', [
          'Escolha a turma.',
          'Em cada horário da semana, escolha a **disciplina** e o **professor** (sugerido pela atribuição da turma).',
          'Marque **Sábado** se a turma tiver aula aos sábados.',
          'Salve a grade.'
        ]],
        ['lista', [
          'Um professor não pode estar em duas turmas no mesmo horário: o sistema recusa e mostra o conflito.',
          'A contagem mostra quantas aulas por semana já foram preenchidas.',
          'A aba {{Professores}} mostra a semana de cada professor, com a carga horária.',
          '{{Imprimir}} gera a grade para o mural. As famílias veem o horário no portal.'
        ]]
      ],
      relacionados: ['grade-horarios', 'grade-minha', 'turmas-professores']
    },
    {
      id: 'grade-minha', titulo: 'Minha grade e as aulas do dia (professor)', tela: 'grade', perfis: ['professor'],
      resumo: 'A sua semana de aulas e o cartão "Suas aulas hoje" no Dashboard.',
      palavras: ['minhas aulas', 'meu horario'],
      corpo: [
        ['p', 'Na Grade Horária, a aba {{Minha grade}} mostra a sua semana: turma e disciplina de cada horário, e quantas aulas você dá por semana. No Dashboard, o cartão **Suas aulas hoje** lista as aulas do dia.'],
        ['p', 'A grade é montada pela coordenação; o professor só consulta.'],
        ['atencao', 'Se aparecer "Seu login ainda não está ligado a um cadastro de professor", peça ao administrador para fazer o vínculo em Sistema › Usuários.']
      ]
    }
  ]);

  /* =================== SECRETARIA =================== */
  add('secretaria', [
    {
      id: 'documentos-emitir', titulo: 'Emitir declarações e contrato', tela: 'documentos',
      resumo: 'Declaração de matrícula, frequência, transferência, conclusão, contrato e os modelos do colégio, em PDF com código de validação.',
      palavras: ['declaracao', 'declaracao de matricula', 'declaracao de frequencia', 'contrato', 'documento', 'secretaria'],
      corpo: [
        ['onde', 'Pedagógico › Documentos › aba {{Emitir}}'],
        ['passos', [
          'Escolha o **aluno** e o **documento**.',
          'Preencha a **finalidade** (opcional), que sai no texto.',
          'Confira a prévia. Se faltar algum dado (filiação, naturalidade, dados do colégio), o sistema mostra o que falta e onde preencher.',
          'Se precisar ajustar o texto só deste documento, use **Ajustar o texto só deste documento**.',
          'Clique em {{Emitir e abrir PDF}} ou {{Emitir e enviar}} (manda o link pelo WhatsApp).'
        ]],
        ['p', 'Ao emitir, o documento recebe **número** e **código de validação** com QR Code, e fica no livro de registro (aba Emitidos).'],
        ['dica', 'Envie o logotipo e os dados oficiais (INEP, ato de autorização, diretor e secretário) em Configurações para os documentos saírem completos.']
      ],
      relacionados: ['documentos-registro', 'documentos-modelos', 'documentos-validacao', 'documentos-transferencia']
    },
    {
      id: 'documentos-transferencia', titulo: 'Transferência de aluno', tela: 'documentos',
      resumo: 'Declaração de transferência que já marca o aluno como transferido e pode cancelar as mensalidades futuras.',
      palavras: ['transferir', 'transferencia', 'outra escola', 'cancelar mensalidades'],
      corpo: [
        ['passos', [
          'Em Documentos › Emitir, escolha o aluno e **Declaração de transferência**.',
          'Informe a **data de saída** e, se souber, a escola de destino.',
          'Deixe marcado **Mudar a situação do aluno para Transferido**.',
          'Escolha se as **mensalidades futuras** devem ser canceladas.',
          'Emita.'
        ]],
        ['p', 'O aluno sai das chamadas, notas e cobranças, mas o histórico e o financeiro do período continuam. Se quiser, emita também o **histórico escolar**.']
      ],
      relacionados: ['alunos-situacao', 'documentos-historico']
    },
    {
      id: 'documentos-historico', titulo: 'Histórico escolar', tela: 'documentos',
      resumo: 'Anos cursados no EduGest (automáticos) e anos de outras escolas digitados pela secretaria.',
      palavras: ['historico', 'historico escolar', 'anos anteriores', 'carga horaria', 'dias letivos'],
      corpo: [
        ['onde', 'Pedagógico › Documentos › aba {{Histórico escolar}}'],
        ['p', 'Os anos feitos no EduGest entram sozinhos: médias do boletim, frequência do diário, dias letivos do calendário e carga horária da grade.'],
        ['passos', [
          'Escolha o aluno.',
          'Para anos cursados antes, em outras escolas, clique em {{Incluir ano anterior}}: ano, série, escola, cidade, carga horária, frequência, notas ou conceitos e observação.',
          'Nos anos do EduGest, ajuste o que precisar. Campos em branco usam o valor calculado.',
          'Clique em {{Emitir histórico}}.'
        ]],
        ['p', 'Disciplinas sem nota não entram no histórico. Depois da virada do ano, o resultado do ano (aprovado, retido, concluiu) também vai para o histórico.']
      ],
      relacionados: ['documentos-emitir', 'calendario-bimestres', 'virada-passos']
    },
    {
      id: 'documentos-registro', titulo: 'Livro de registro, 2ª via e cancelamento', tela: 'documentos',
      resumo: 'Todos os documentos emitidos, com número, data e quem emitiu; segunda via, envio e cancelamento.',
      palavras: ['segunda via', '2 via', 'cancelar documento', 'livro de registro', 'emitidos'],
      corpo: [
        ['onde', 'Pedagógico › Documentos › aba {{Emitidos}}'],
        ['lista', [
          'Filtre por ano, tipo, situação (válidos ou cancelados) ou busque pelo aluno.',
          '{{PDF}} abre a **2ª via idêntica** à original (mesmo número e código).',
          'O WhatsApp envia o link do documento (com validade).',
          '**Cancelar** pede o motivo. O documento continua no livro, e quem conferir o QR Code verá que ele foi cancelado. Não pode ser desfeito.'
        ]]
      ],
      relacionados: ['documentos-validacao']
    },
    {
      id: 'documentos-modelos', titulo: 'Modelos de documento e variáveis', tela: 'documentos', perfis: ['admin'],
      resumo: 'Ajustar o texto dos modelos do sistema, criar modelos do colégio e usar variáveis como {aluno}.',
      palavras: ['modelo', 'texto da declaracao', 'variaveis', 'personalizar documento', 'declaracao de comparecimento'],
      corpo: [
        ['onde', 'Pedagógico › Documentos › aba {{Modelos}}'],
        ['lista', [
          'Abra um modelo do sistema para ajustar o texto. {{Voltar ao padrão}} desfaz os ajustes.',
          '{{Novo modelo}} cria um documento do colégio (ex.: declaração de comparecimento).',
          'As **variáveis** entre chaves, como `{aluno}` e `{serie}`, são preenchidas na hora de emitir. Clique numa variável para inserir.',
          '`**texto**` sai em negrito; uma linha em branco separa parágrafos.',
          'Trechos entre `[[` e `]]` somem quando uma variável de dentro está vazia. Ex.: `[[, nascido(a) em {nascimento}]]`.',
          'Use **Prévia com o aluno** para conferir antes de salvar.'
        ]]
      ]
    },
    {
      id: 'documentos-validacao', titulo: 'Validação dos documentos pelo QR Code', tela: 'documentos',
      resumo: 'Como uma escola ou empresa confere se a declaração é verdadeira.',
      palavras: ['validar', 'autenticidade', 'qr code', 'codigo de validacao', 'falsificacao'],
      corpo: [
        ['p', 'Todo documento emitido tem um **código de validação** e um **QR Code**. Quem recebe o documento lê o QR Code (ou digita o código na página de validação) e vê se ele é válido ou foi cancelado, com o nome do aluno abreviado.'],
        ['p', 'Nenhum dado além disso aparece na validação.']
      ]
    }
  ]);

  /* =================== FINANCEIRO =================== */
  add('financeiro', [
    {
      id: 'mensalidades-gerar', titulo: 'Gerar as mensalidades', tela: 'mensalidades',
      resumo: 'Para todos os alunos, uma turma ou um aluno, com resumo antes de confirmar. Bolsas aplicadas e sem duplicar.',
      palavras: ['gerar cobranca', 'parcelas', 'mensalidade', 'carne', 'ano letivo', 'anuidade'],
      corpo: [
        ['onde', 'Financeiro › Mensalidades › {{Gerar mensalidades}}'],
        ['passos', [
          'Informe o **ano**, o **mês inicial** e o **mês final** (ex.: fevereiro a dezembro).',
          'Confira o **dia de vencimento** e o **valor da mensalidade** (vêm dos Parâmetros do colégio).',
          'Em **Para**, escolha todos os alunos ativos, uma turma ou um aluno.',
          'Veja o **resumo**: quantas mensalidades serão geradas, quantas já existiam, quantas ficam isentas (bolsa de 100%) e o total.',
          'Clique em {{Confirmar geração}}.'
        ]],
        ['lista', [
          'O desconto da **bolsa vigente** no vencimento é aplicado automaticamente.',
          'Mensalidade que já existe para o aluno naquele mês **não é duplicada**: dá para gerar de novo para incluir alunos novos.',
          'Na virada do ano, as mensalidades do ano novo podem ser geradas junto.'
        ]],
        ['dica', 'Aluno matriculado no meio do ano: gere só para ele (opção "Um aluno"), a partir do mês de entrada.']
      ],
      relacionados: ['bolsas-cadastrar', 'mensalidades-receber', 'mensalidades-cobrar', 'virada-passos']
    },
    {
      id: 'mensalidades-receber', titulo: 'Receber (dar baixa), estornar e cancelar', tela: 'mensalidades',
      resumo: 'Registrar o pagamento com data, forma e valor; desfazer um recebimento; cancelar ou excluir uma cobrança.',
      palavras: ['baixa', 'pagamento', 'recebido', 'estorno', 'cancelar mensalidade', 'quitar', 'juros', 'multa'],
      corpo: [
        ['onde', 'Financeiro › Mensalidades'],
        ['h', 'Receber'],
        ['passos', [
          'Ache a mensalidade (filtros de referência, turma, situação ou busca pelo aluno).',
          'Clique em {{Receber}}.',
          'Informe a **data do pagamento**, a **forma** (PIX, boleto, cartão, dinheiro...) e o **valor recebido** (altere se houve juros, multa ou acordo).',
          'Salve. A mensalidade fica **Paga** e o recibo fica disponível.'
        ]],
        ['h', 'Outras ações'],
        ['lista', [
          '{{Estornar}}: desfaz o recebimento (pagamento lançado por engano). A mensalidade volta a ficar em aberto.',
          '**Cancelar** (ícone ⊘): para cobrança que não deve mais ser paga, mas precisa ficar registrada (ex.: aluno saiu). {{Reativar}} volta atrás.',
          '**Excluir**: só para mensalidade gerada por engano.'
        ]],
        ['p', 'Os botões no alto filtram: Em aberto, Vencidas, Pagas, Isentas e Canceladas.'],
        ['dica', 'Com o extrato do banco, a **Conciliação bancária** dá baixa em várias mensalidades de uma vez.']
      ],
      relacionados: ['conciliacao-conciliar', 'mensalidades-documentos', 'faq-desfazer']
    },
    {
      id: 'mensalidades-cobrar', titulo: 'Cobrar pelo WhatsApp com PIX', tela: 'mensalidades',
      resumo: 'Enviar a cobrança com o link do PDF, QR Code PIX e copia e cola.',
      palavras: ['cobranca', 'whatsapp', 'pix', 'qr code', 'lembrete', 'inadimplente'],
      corpo: [
        ['passos', [
          'Na mensalidade em aberto, clique no ícone do **WhatsApp**.',
          'Abre a conversa com o responsável e a mensagem pronta, com o link do PDF da cobrança.',
          'No PDF, o responsável paga com o **QR Code PIX** ou o **copia e cola**, já com o valor da parcela.',
          'Quando o pagamento cair, registre com {{Receber}} (ou pela Conciliação bancária).'
        ]],
        ['p', 'O ícone de PDF abre a cobrança para imprimir ou conferir. Em mensalidade paga, os mesmos ícones enviam o **recibo**.'],
        ['atencao', 'O QR Code só sai com a chave PIX configurada em Configurações › Cobrança e PIX. O link do PDF vale pelo prazo configurado lá.']
      ],
      relacionados: ['implantacao-pix', 'mensalidades-receber', 'relatorios-financeiros']
    },
    {
      id: 'mensalidades-documentos', titulo: 'Carnê, lote do mês e declaração do Imposto de Renda', tela: 'mensalidades',
      resumo: 'PDFs com várias mensalidades: carnê do aluno, mensalidades do mês para imprimir e a declaração anual de pagamentos.',
      palavras: ['carne', 'lote', 'imprimir mensalidades', 'declaracao de pagamentos', 'imposto de renda', 'ir'],
      corpo: [
        ['onde', 'Financeiro › Mensalidades › {{Documentos}}'],
        ['tabela', [
          ['Documento', 'Para que serve'],
          ['Carnê do aluno', 'Todas as mensalidades em aberto do ano de um aluno, com QR Code PIX em cada parcela.'],
          ['Mensalidades do mês', 'Um lote com as cobranças de um mês (todas ou de uma turma), para imprimir e entregar.'],
          ['Declaração anual de pagamentos (IR)', 'O que o responsável pagou no ano, com o CPF dele, para o Imposto de Renda.']
        ]],
        ['p', 'Cada documento pode ser aberto em PDF ou enviado por WhatsApp. As famílias também baixam o carnê e a declaração no portal.']
      ]
    },
    {
      id: 'mensalidades-alterar', titulo: 'Alterar valor ou vencimento de uma mensalidade', tela: 'mensalidades',
      resumo: 'Corrigir uma parcela sem gerar de novo.',
      palavras: ['mudar valor', 'mudar vencimento', 'corrigir mensalidade', 'reajuste'],
      corpo: [
        ['passos', [
          'Clique no lápis da mensalidade.',
          'Altere o **valor sem desconto** e/ou o **vencimento**.',
          'Salve. O desconto da bolsa vigente é recalculado automaticamente.'
        ]],
        ['p', 'Mensalidade paga não muda de valor: estorne antes, se for o caso.'],
        ['dica', 'Reajuste para todos: altere o valor padrão em Configurações e gere os meses seguintes; ou ajuste parcela a parcela.']
      ]
    },
    {
      id: 'bolsas-cadastrar', titulo: 'Descontos e bolsas', tela: 'bolsas',
      resumo: 'Bolsa integral ou parcial, desconto de irmão, pontualidade, convênio ou funcionário, com vigência.',
      palavras: ['bolsa', 'desconto', 'irmao', 'convenio', 'funcionario', 'bolsista'],
      corpo: [
        ['onde', 'Financeiro › Descontos e Bolsas › {{Nova bolsa}}'],
        ['passos', [
          'Escolha o **aluno** e o **tipo** (bolsa integral, parcial, desconto irmão, pontualidade, convênio, funcionário ou outro).',
          'Informe o **desconto (%)**.',
          'Defina a **vigência**: a partir de quando e até quando (em branco = indeterminada).',
          'Escreva o motivo, se quiser, e salve.'
        ]],
        ['lista', [
          'As mensalidades **em aberto** do aluno são recalculadas na hora; as já pagas não mudam.',
          'Se houver mais de uma bolsa vigente, vale a de **maior percentual**.',
          'Bolsa de 100%: a mensalidade fica **isenta** e não é cobrada.',
          'O relatório **Impacto de bolsas** mostra quanto o colégio deixa de receber.'
        ]]
      ],
      relacionados: ['mensalidades-gerar', 'relatorios-financeiros', 'faq-bolsa-valor']
    },
    {
      id: 'contas-pagar', titulo: 'Contas a pagar e contas que se repetem', tela: 'contas',
      resumo: 'Lançar despesas, registrar o pagamento e deixar o sistema lançar sozinho as contas mensais.',
      palavras: ['despesa', 'conta', 'fornecedor', 'aluguel', 'salario', 'recorrente', 'pagar conta'],
      corpo: [
        ['onde', 'Financeiro › Contas a Pagar › {{Nova conta}}'],
        ['passos', [
          'Preencha a **descrição**, a **categoria** (aluguel, energia, folha de pagamento...), o fornecedor, o **valor** e o **vencimento**.',
          'Em **Repetição**, escolha mensal, trimestral ou anual para contas fixas.',
          'Salve.'
        ]],
        ['lista', [
          '{{Pagar conta}} registra a data do pagamento. Numa conta que se repete, a próxima já é lançada automaticamente.',
          '{{Estornar}} desfaz o pagamento.',
          'Filtre por mês, categoria ou busca.'
        ]],
        ['p', 'As contas pagas entram no Fluxo de caixa e no DRE.']
      ],
      relacionados: ['fluxo-caixa', 'conciliacao-conciliar']
    },
    {
      id: 'fluxo-caixa', titulo: 'Fluxo de caixa', tela: 'fluxo',
      resumo: 'Entradas e saídas mês a mês: o realizado e o previsto.',
      palavras: ['caixa', 'saldo', 'entradas', 'saidas', 'previsto', 'realizado'],
      corpo: [
        ['onde', 'Financeiro › Fluxo de Caixa'],
        ['lista', [
          '**Realizado**: entradas pela data em que a mensalidade foi recebida e saídas pela data em que a conta foi paga.',
          '**Previsto**: o que está em aberto, pelo vencimento (a receber e a pagar).',
          'O gráfico compara entradas e saídas de cada mês; a tabela mostra o saldo do mês e o acumulado.',
          'Troque o ano no seletor.'
        ]]
      ],
      relacionados: ['relatorios-financeiros', 'contas-pagar']
    },
    {
      id: 'relatorios-financeiros', titulo: 'Relatórios financeiros', tela: 'relatorios',
      resumo: 'Inadimplência por turma, ranking de inadimplentes, receita prevista × recebida, DRE simplificado e impacto de bolsas.',
      palavras: ['relatorio', 'inadimplencia', 'devedores', 'dre', 'receita', 'exportar'],
      corpo: [
        ['onde', 'Financeiro › Relatórios'],
        ['tabela', [
          ['Relatório', 'O que mostra'],
          ['Inadimplência por turma', 'Valor em atraso por faixa (até 30 dias, 31 a 60...) e por turma. Inadimplência = valor em atraso ÷ tudo o que já venceu.'],
          ['Inadimplentes', 'Ranking das maiores dívidas, com o responsável, os meses em atraso e desde quando.'],
          ['Receita prevista × recebida', 'Mês a mês, por mês de referência da mensalidade.'],
          ['DRE simplificado', 'Receitas e despesas no regime de caixa, por categoria.'],
          ['Impacto de bolsas', 'Quanto os descontos representam, por tipo e por aluno.']
        ]],
        ['p', 'Cada relatório tem {{Exportar CSV}} (abre no Excel) e {{Imprimir / PDF}}.']
      ],
      relacionados: ['faq-inadimplente', 'bolsas-cadastrar']
    },
    {
      id: 'conciliacao-conta', titulo: 'Conciliação: cadastrar a conta e importar o extrato', tela: 'conciliacao',
      resumo: 'Conta bancária do colégio e importação do extrato em OFX ou CSV.',
      palavras: ['extrato', 'ofx', 'banco', 'conciliacao', 'importar extrato'],
      corpo: [
        ['onde', 'Financeiro › Conciliação Bancária'],
        ['passos', [
          'Na primeira vez, {{Cadastrar conta bancária}}: nome, banco, agência e conta.',
          'Baixe o extrato no internet banking, de preferência em **OFX** (tem identificação única de cada lançamento e o saldo). CSV também serve (data, histórico e valor, ou colunas de crédito e débito).',
          'Clique em {{Importar extrato}}, escolha a conta e o arquivo. Confira a prévia e o saldo informado pelo banco.',
          'Confirme. Os lançamentos vão para a aba **Pendentes**.'
        ]],
        ['p', 'Importar o mesmo período de novo não duplica: lançamentos repetidos são ignorados.']
      ],
      relacionados: ['conciliacao-conciliar']
    },
    {
      id: 'conciliacao-conciliar', titulo: 'Conciliar lançamentos: automático, sugestões e manual', tela: 'conciliacao',
      resumo: 'Ligar cada lançamento do banco a uma mensalidade ou conta a pagar, dando baixa automaticamente.',
      palavras: ['conciliar', 'baixa automatica', 'sugestao', 'tarifa', 'vincular'],
      corpo: [
        ['p', 'Na aba **Pendentes**, o sistema sugere o vínculo de cada lançamento, com confiança **alta** ou **média** (pelo valor, pela data e pelo nome no histórico do banco).'],
        ['lista', [
          '{{Conciliar automaticamente}}: concilia só as sugestões de confiança alta.',
          '{{Aceitar sugestões}}: concilia os lançamentos que você selecionou.',
          '{{Vincular}}: escolha à mão a mensalidade ou a conta a pagar; ou crie uma **despesa nova** (débito automático que não estava em Contas a pagar), que já nasce paga.',
          '**Classificar como...**: para movimentos que não são mensalidade nem conta (tarifas, transferência entre contas, aplicação). Ficam no Resumo, mas não entram no Fluxo de caixa.'
        ]],
        ['p', 'Mensalidade vinculada recebe a **baixa** com a data e o valor do extrato. Valor igual sozinho nunca é conciliado automaticamente.'],
        ['p', 'As abas **Conciliados**, **Importações** e **Resumo** mostram o que já foi feito e o movimento do mês por categoria.']
      ],
      relacionados: ['conciliacao-desfazer', 'mensalidades-receber']
    },
    {
      id: 'conciliacao-desfazer', titulo: 'Desfazer uma conciliação ou importação', tela: 'conciliacao',
      resumo: 'Voltar atrás numa conciliação errada ou num extrato importado por engano.',
      palavras: ['desfazer conciliacao', 'extrato errado'],
      corpo: [
        ['lista', [
          'Na aba **Conciliados**, {{Desfazer}} reverte tudo o que a conciliação fez (inclusive a baixa da mensalidade ou a despesa criada).',
          'Na aba **Importações**, desfazer uma importação remove os lançamentos dela. Só é possível enquanto nenhum estiver conciliado.'
        ]]
      ]
    }
  ]);

  /* =================== CAPTAÇÃO E COMUNICAÇÃO =================== */
  add('captacao', [
    {
      id: 'funil-usar', titulo: 'Funil de matrículas: do interesse à matrícula', tela: 'funil',
      resumo: 'Interessados, etapas, contatos marcados e visitas, em quadro ou lista.',
      palavras: ['captacao', 'interessado', 'lead', 'visita', 'proposta', 'crm', 'matricula nova'],
      corpo: [
        ['onde', 'Captação › Funil de Matrículas'],
        ['p', 'Cada família interessada vira um cartão que anda pelas etapas: **Interessado → Visita agendada → Proposta → Matriculado** (ou **Perdido**, com o motivo).'],
        ['passos', [
          '{{Novo interessado}}: nome do aluno, série e ano pretendidos, turno, responsável, telefone, e-mail e **como conheceu o colégio**.',
          'Na aba **Quadro**, arraste o cartão para a próxima etapa (ou para "Perdido").',
          'Abra o cartão para registrar **contatos** (ligação, WhatsApp, visita), marcar o **próximo contato** e a data da visita.',
          'Quando fechar, use **Matricular**.'
        ]],
        ['lista', [
          'Cartões com contato para hoje ou atrasado ficam destacados, e o Dashboard avisa.',
          'A aba **Lista** filtra por etapa, série, origem e ano, e exporta para o Excel.',
          'Perdido pode ser **reaberto** depois.'
        ]]
      ],
      relacionados: ['funil-matricular', 'funil-formulario', 'funil-numeros']
    },
    {
      id: 'funil-matricular', titulo: 'Matricular um interessado', tela: 'funil',
      resumo: 'Transformar o interessado em aluno, já na turma e, se quiser, com as mensalidades do ano.',
      palavras: ['matricular', 'converter', 'aluno novo'],
      corpo: [
        ['passos', [
          'Abra o cartão do interessado e clique em **Matricular**.',
          'Escolha **Cadastrar novo aluno** (com a turma, os dados do responsável e o CPF) ou **Aluno já cadastrado** (irmão ou cadastro feito antes).',
          'Marque se quer **gerar as mensalidades** do ano.',
          'Confirme. O sistema mostra o RA e o código de acesso do responsável, com o atalho para enviar pelo WhatsApp.'
        ]],
        ['p', 'O cartão vai para **Matriculado** e entra nos números da captação.']
      ],
      relacionados: ['alunos-codigo', 'mensalidades-gerar']
    },
    {
      id: 'funil-formulario', titulo: 'Formulário de interesse (link e QR Code)', tela: 'funil', perfis: ['admin'],
      resumo: 'Uma página pública para a família deixar os dados; cai direto no funil.',
      palavras: ['formulario', 'link', 'instagram', 'site', 'qr code', 'panfleto'],
      corpo: [
        ['onde', 'Funil de Matrículas › aba {{Formulário}}'],
        ['lista', [
          'Ative o formulário e ajuste o título e a mensagem.',
          'Divulgue o link na bio do Instagram, no site, no status do WhatsApp ou em panfletos com o QR Code.',
          'Quem preencher entra como **Interessado**, marcado como novo, com o contato autorizado pelo próprio responsável.',
          'Proteções: limite de envios por aparelho, campo invisível contra robôs e envios repetidos juntados no mesmo cadastro.',
          '{{Trocar o link}} invalida o anterior (se ele estiver sendo usado de forma indevida).'
        ]]
      ]
    },
    {
      id: 'funil-numeros', titulo: 'Números da captação', tela: 'funil',
      resumo: 'Interessados por etapa, origem e série, motivos de perda e matrículas dos últimos 12 meses.',
      palavras: ['indicadores', 'conversao', 'origem', 'marketing'],
      corpo: [
        ['p', 'A aba **Números** mostra quantos estão em cada etapa, de onde vêm (Instagram, indicação, Google...), as séries mais procuradas, os motivos de perda e os novos interessados e matrículas mês a mês. Use para decidir onde investir na divulgação.']
      ]
    },
    {
      id: 'comunicados-publicar', titulo: 'Publicar um comunicado', tela: 'comunicados',
      resumo: 'Aviso, circular, evento ou urgente para o colégio todo, segmentos ou turmas, no portal das famílias.',
      palavras: ['comunicado', 'aviso', 'circular', 'recado', 'bilhete', 'mensagem para os pais'],
      corpo: [
        ['onde', 'Comunicação › Comunicados › {{Novo comunicado}}'],
        ['passos', [
          'Escreva o **título** e a **mensagem** e escolha o **tipo** (aviso, circular, evento ou urgente).',
          'Em **Para quem**: todas as famílias, segmentos (o segmento vem da série de cada turma) ou turmas específicas.',
          'Opcional: **No ar até** (depois some do portal), **Fixar no topo** e **Pedir confirmação de ciência** (o responsável clica em "Estou ciente").',
          'Clique em {{Publicar}}.'
        ]],
        ['p', 'O comunicado aparece no portal das famílias do público escolhido. O professor publica só para as turmas em que leciona.']
      ],
      relacionados: ['comunicados-leitura', 'portal-comunicados']
    },
    {
      id: 'comunicados-leitura', titulo: 'Quem leu, ciência e envio pelo WhatsApp', tela: 'comunicados',
      resumo: 'Acompanhar a leitura no portal e avisar pelo WhatsApp quem ainda não viu.',
      palavras: ['lido', 'leitura', 'ciente', 'whatsapp', 'grupo da turma'],
      corpo: [
        ['lista', [
          'Cada comunicado mostra **Lido por X de Y** responsáveis com acesso ao portal. Clique para ver quem leu e quando (e quem confirmou ciência).',
          'Logo depois de publicar abre o envio pelo **WhatsApp**: uma linha por família (irmãos juntos), com a mensagem pronta para ajustar.',
          '{{Copiar para o grupo da turma}} copia o texto para colar no grupo.',
          'O filtro **Só quem ainda não leu no portal** ajuda a reforçar o aviso.'
        ]],
        ['p', 'Famílias que ainda não têm acesso ao portal aparecem como "sem acesso": para elas, use o WhatsApp.']
      ]
    }
  ]);

  /* =================== VIRADA E INÍCIO DO ANO =================== */
  add('ano', [
    {
      id: 'virada-quando', titulo: 'Virada do ano letivo: o que é e quando fazer', tela: 'virada', perfis: ['admin'],
      resumo: 'A rematrícula em poucos passos: turmas do ano novo, alunos promovidos, mensalidades e troca do ano letivo.',
      palavras: ['rematricula', 'ano novo', 'fim de ano', 'promover', 'trocar ano letivo', 'virada'],
      corpo: [
        ['onde', 'Sistema › Virada do ano letivo (só administrador)'],
        ['p', 'A virada faz de uma vez, com conferência antes de gravar:'],
        ['lista', [
          'Cria as **turmas do ano novo** com a série seguinte (5º Ano A → 6º Ano A), copiando professores e grade.',
          'Passa cada **aluno**: promover, reter, concluir o curso, sair da escola ou decidir depois.',
          'Gera as **mensalidades** do ano novo, com as bolsas.',
          'Muda o **ano letivo** do colégio e, se quiser, o valor padrão da mensalidade.'
        ]],
        ['p', 'O ano que termina **continua intacto**: notas, diário, boletins, histórico e financeiro ficam ligados às turmas antigas.'],
        ['h', 'Quando fazer'],
        ['p', 'Depois do fechamento das notas do 4º bimestre (a situação de cada aluno é calculada pelas notas e pela frequência) e antes de começar a lançar coisas do ano novo.'],
        ['dica', 'Dá para desfazer a última virada enquanto o ano novo não tiver movimento (notas, chamada, mensalidade paga).']
      ],
      relacionados: ['virada-passos', 'virada-pendentes', 'virada-desfazer']
    },
    {
      id: 'virada-passos', titulo: 'Fazer a virada passo a passo', tela: 'virada', perfis: ['admin'],
      resumo: 'Os 4 passos: Turmas, Alunos, Mensalidades e Conferir.',
      palavras: ['passo a passo virada', 'reter', 'promover', 'concluir', 'concluinte'],
      corpo: [
        ['h', '1. Turmas'],
        ['p', 'Para cada turma do ano que termina, escolha: **Criar turma nova** (nome, série, período e vagas já sugeridos), **Usar uma turma que já existe** no ano novo ou **Não continua** (última série, ou série que o colégio não oferece).'],
        ['h', '2. Alunos'],
        ['lista', [
          'Cada aluno vem com a **situação** pelas notas e frequência e com a decisão sugerida: aprovados e alunos sem notas lançadas são promovidos; recuperação, frequência baixa ou notas incompletas ficam em **Decidir depois**.',
          'Decisões: **Promover**, **Reter** (repete a série), **Concluiu o curso**, **Sai da escola** ou **Decidir depois**.',
          'Escolha a turma de destino quando precisar (por exemplo, para quem foi retido).',
          '**Aplicar a todos** muda a turma inteira de uma vez; o filtro **Precisam de atenção** mostra quem tem recuperação, mensalidade em aberto ou falta escolher a turma.',
          'Alunos ativos **sem turma** podem ser colocados numa turma do ano novo.'
        ]],
        ['h', '3. Mensalidades'],
        ['p', 'Marque para gerar as mensalidades do ano novo de quem vai para uma turma: valor, meses e dia de vencimento. O valor novo pode virar o padrão em Configurações.'],
        ['h', '4. Conferir'],
        ['p', 'Resumo com turmas novas, alunos por destino, vagas, avisos (turma acima da capacidade, alunos com dívidas) e o que muda no colégio. Clique em {{Fazer a virada}} e confirme.'],
        ['atencao', 'Nada é gravado antes do último passo. Se sair da tela no meio, o sistema avisa que as escolhas serão perdidas.']
      ],
      relacionados: ['virada-pendentes', 'virada-desfazer', 'notas-media']
    },
    {
      id: 'virada-pendentes', titulo: 'Alunos em "Decidir depois"', tela: 'virada', perfis: ['admin'],
      resumo: 'Como resolver depois da virada quem ficou para o conselho de classe ou a recuperação.',
      palavras: ['recuperacao final', 'conselho', 'pendente', 'decidir depois'],
      corpo: [
        ['p', 'Quem fica em "Decidir depois" continua na turma do ano anterior, ativo. Quando sair o resultado (recuperação, conselho de classe):'],
        ['passos', [
          'Abra Sistema › Virada do ano letivo. A tela já abre nos **alunos pendentes** do ano anterior.',
          'Promova, retenha, marque como concluído ou como saída.',
          'Gere as mensalidades de quem foi promovido (a partir do mês atual, sugerido) e confirme.'
        ]],
        ['p', 'O ano letivo do colégio não muda nesse complemento.']
      ]
    },
    {
      id: 'virada-desfazer', titulo: 'Desfazer a virada', tela: 'virada', perfis: ['admin'],
      resumo: 'Voltar atrás na última virada, enquanto o ano novo não teve movimento.',
      palavras: ['desfazer virada', 'voltar ano'],
      corpo: [
        ['passos', [
          'Em Sistema › Virada do ano letivo, abra **Viradas já feitas**.',
          'Na última virada, clique em {{Desfazer}} e confirme.'
        ]],
        ['p', 'Os alunos voltam para as turmas e a situação de antes, as turmas e as mensalidades criadas pela virada são apagadas e o ano letivo volta ao anterior. Notas, chamadas e pagamentos do ano anterior não mudam.'],
        ['atencao', 'Não dá para desfazer quando o ano novo já tem notas ou chamada nas turmas criadas, mensalidade gerada pela virada já paga, ou aluno novo colocado nessas turmas. O motivo aparece no histórico.']
      ]
    },
    {
      id: 'importar-planilha', titulo: 'Importar alunos por planilha (Excel ou CSV)', tela: 'alunos',
      resumo: 'Cadastrar muitos alunos de uma vez, com conferência antes de gravar e a lista de códigos no final.',
      palavras: ['importar', 'planilha', 'excel', 'xlsx', 'csv', 'migrar', 'cadastro em lote'],
      corpo: [
        ['onde', 'Pedagógico › Alunos › {{Importar planilha}}'],
        ['passos', [
          '**Planilha**: escolha o arquivo .xlsx ou .csv (ou arraste). Um aluno por linha, com os títulos das colunas na primeira linha. Se quiser, baixe a **planilha modelo**.',
          '**Colunas**: o sistema liga cada coluna pelo título (nome, nascimento, turma, CPF, responsável, telefone...). Confira o exemplo ao lado e ajuste se precisar. Só o nome é obrigatório.',
          '**Conferência**: veja as linhas prontas, as duplicadas e as com erro (data inválida, turma que não existe...). Baixe a conferência se quiser corrigir a planilha.',
          '{{Importar}}: só as linhas sem erro entram. No final, baixe a **lista com RA e códigos de acesso** para entregar às famílias.'
        ]],
        ['lista', [
          'A **turma** precisa estar escrita como o nome cadastrado em Turmas e Séries, no ano letivo atual ("1o ano a" também é reconhecido como "1º Ano A"). Crie as turmas antes.',
          'Datas no formato DD/MM/AAAA. CPF que o Excel guardou como número (sem o zero da frente) é corrigido.',
          'Duplicados: mesmo CPF, mesmo nome com a mesma data de nascimento, ou mesmo RA, já cadastrado ou repetido na planilha.',
          'Arquivo .xls (Excel antigo): abra no Excel e salve como .xlsx ou CSV.'
        ]],
        ['dica', 'Importou errado? Dá para desfazer a importação inteira (veja "Desfazer uma importação").']
      ],
      relacionados: ['importar-desfazer', 'turmas-criar', 'implantacao-familias']
    },
    {
      id: 'importar-desfazer', titulo: 'Desfazer uma importação de alunos', tela: 'alunos',
      resumo: 'Apagar de uma vez os alunos de uma planilha importada por engano.',
      palavras: ['desfazer importacao', 'planilha errada'],
      corpo: [
        ['passos', [
          'Em Alunos, clique em {{Importar planilha}}.',
          'Em **Importações anteriores**, clique em {{Desfazer}} na importação e confirme.'
        ]],
        ['p', 'Os alunos daquela importação são apagados; os outros não são afetados.'],
        ['atencao', 'Só é possível enquanto esses alunos não tiverem mensalidades, notas, chamada ou responsável no portal. O motivo aparece ao lado da importação.']
      ]
    }
  ]);

  /* =================== ADMINISTRAÇÃO =================== */
  add('sistema', [
    {
      id: 'usuarios-gerenciar', titulo: 'Usuários: aprovar, bloquear e remover', tela: 'usuarios', perfis: ['admin'],
      resumo: 'Cadastros pendentes, equipe e responsáveis do colégio, último acesso e bloqueio.',
      palavras: ['aprovar cadastro', 'pendente', 'bloquear', 'remover usuario', 'acesso', 'funcionario saiu'],
      corpo: [
        ['onde', 'Sistema › Usuários'],
        ['h', 'Cadastros aguardando aprovação'],
        ['p', 'Quem se cadastrou com o código do colégio (equipe) ou com o código PAI de um aluno (responsável) aparece aqui. O Dashboard e o menu também avisam.'],
        ['lista', [
          '{{Aprovar}}: escolha o perfil e, se quiser, os módulos. Para professor, ligue ao cadastro de professor. Para responsável, confira se a pessoa é mesmo da família do aluno.',
          '{{Rejeitar}}: recusa o acesso.'
        ]],
        ['h', 'Usuários do colégio'],
        ['lista', [
          'A lista mostra perfil, situação, o que cada um acessa e o **último acesso**.',
          'O ícone de ajustes muda o perfil, os módulos ou **bloqueia** o acesso (a pessoa não entra, mas o histórico dela continua).',
          'O ícone de remover tira a pessoa do colégio.'
        ]],
        ['atencao', 'Funcionário que saiu: **bloqueie ou remova no mesmo dia**. O colégio nunca fica sem um administrador ativo, e você não consegue alterar o próprio acesso.']
      ],
      relacionados: ['usuarios-modulos', 'usuarios-vincular', 'implantacao-equipe']
    },
    {
      id: 'usuarios-modulos', titulo: 'Perfis e módulos de cada pessoa', tela: 'usuarios', perfis: ['admin'],
      resumo: 'Liberar ou tirar telas de uma pessoa, além do padrão do perfil.',
      palavras: ['modulos', 'permissao', 'liberar tela', 'restringir'],
      corpo: [
        ['passos', [
          'Em Sistema › Usuários, clique no ícone de ajustes da pessoa.',
          'Escolha o **perfil**.',
          'Em **Módulos que poderá acessar**: {{Padrão do perfil}}, {{Todos}}, {{Nenhum}} ou marque um a um.',
          'Salve. A mudança vale no próximo acesso da pessoa (ou depois que ela recarregar o sistema).'
        ]],
        ['p', 'O administrador sempre acessa todos os módulos, as configurações e a gestão de usuários.']
      ],
      relacionados: ['comecar-perfis']
    },
    {
      id: 'usuarios-vincular', titulo: 'Vincular uma pessoa por e-mail', tela: 'usuarios', perfis: ['admin'],
      resumo: 'Adicionar ao colégio quem já tem conta no EduGest, sem código e sem esperar aprovação.',
      palavras: ['vincular', 'adicionar usuario', 'e-mail'],
      corpo: [
        ['passos', [
          'Em Sistema › Usuários, clique em {{Vincular por e-mail}}.',
          'Digite o e-mail com que a pessoa entra no EduGest, o perfil e os módulos.',
          'Confirme. O acesso fica ativo na hora.'
        ]],
        ['p', 'A pessoa precisa já ter conta (de outro colégio ou criada pela tela de cadastro). Senão, passe o código do colégio.']
      ]
    },
    {
      id: 'seguranca-log', titulo: 'Log de segurança', tela: 'seguranca', perfis: ['admin'],
      resumo: 'Registro permanente de entradas, senhas erradas, saídas, inatividade, cadastros e ações administrativas.',
      palavras: ['auditoria', 'log', 'quem acessou', 'tentativa de acesso', 'ip'],
      corpo: [
        ['onde', 'Sistema › Log de Segurança'],
        ['p', 'Mostra data e hora, evento, usuário, detalhes, IP e dispositivo. Filtre por tipo (login, falha de login, logout, inatividade, cadastro, ação de admin).'],
        ['p', 'O log **não pode ser apagado** por ninguém. Use para conferir acessos fora do horário, várias senhas erradas seguidas ou mudanças de permissão.'],
        ['dica', 'O que cada pessoa fez no dia a dia (lançou notas, gerou mensalidades...) aparece em **Atividade recente**, no Dashboard.']
      ]
    },
    {
      id: 'colegios-gestao', titulo: 'Gestão de colégios', tela: 'colegios', perfis: ['proprietario'],
      resumo: 'Cadastrar colégios novos, convidar o diretor, aprovar cadastros, desativar e dar suporte.',
      palavras: ['novo colegio', 'cliente', 'suporte', 'proprietario'],
      corpo: [
        ['onde', 'Sistema › Gestão de Colégios (só o proprietário do sistema)'],
        ['lista', [
          'Cadastre o colégio e envie o **convite** ao diretor, que vira o administrador.',
          'Aprove cadastros pendentes de qualquer colégio.',
          'Desative ou reative um colégio (desativado, ninguém entra).',
          '**Entrar no colégio** ou **acessar como administrador** para dar suporte.'
        ]],
        ['p', 'Os parâmetros de cada colégio continuam com o administrador do próprio colégio.']
      ]
    }
  ]);

  /* =================== PORTAL DO RESPONSÁVEL =================== */
  add('portal', [
    {
      id: 'portal-equipe', titulo: 'Como as famílias usam o portal', perfis: ['equipe'],
      resumo: 'O que o responsável vê, como ele entra e o que a equipe precisa fazer.',
      palavras: ['portal', 'pais', 'responsavel', 'familia', 'app dos pais'],
      corpo: [
        ['p', 'O responsável entra pelo mesmo endereço do EduGest e vê **somente os filhos vinculados à conta dele**:'],
        ['lista', [
          '**Início**: avisos que pedem atenção, comunicados, próximas datas, a próxima mensalidade e as últimas faltas.',
          '**Boletim** e **Frequência** (com o conteúdo das aulas em que o aluno faltou).',
          '**Horário de aulas** e **Calendário**.',
          '**Financeiro**: mensalidades do ano, pagamento com PIX, carnê e declaração para o Imposto de Renda.',
          '**Comunicados**, com a confirmação "Estou ciente" quando pedida.'
        ]],
        ['h', 'O que a equipe faz'],
        ['passos', [
          'Envia o código de acesso do aluno (ficha do aluno › {{Enviar}}).',
          'Aprova o cadastro do responsável em Sistema › Usuários.',
          'Mantém notas, chamada, calendário e comunicados em dia: tudo aparece para a família na hora.'
        ]]
      ],
      relacionados: ['alunos-codigo', 'implantacao-familias', 'comunicados-publicar']
    },
    {
      id: 'portal-primeiro-acesso', titulo: 'Criar a conta e entrar no portal', tela: 'portal', perfis: ['responsavel'],
      resumo: 'Como criar o acesso com o código enviado pelo colégio.',
      palavras: ['criar conta', 'codigo pai', 'cadastro', 'primeiro acesso', 'senha'],
      corpo: [
        ['passos', [
          'Abra o endereço enviado pelo colégio e escolha a aba {{Sou responsável}}.',
          'Digite o **código de acesso** do aluno (começa com `PAI`) e o seu parentesco.',
          'Informe o seu nome, e-mail e uma senha com pelo menos 8 caracteres, uma letra maiúscula e um número.',
          'Clique em {{Criar conta}}. O colégio confere e aprova o seu acesso.',
          'Depois da aprovação, entre com o seu e-mail e senha.'
        ]],
        ['dica', 'Esqueceu a senha? Na tela de acesso, use {{Esqueci minha senha}}.']
      ],
      relacionados: ['portal-filhos', 'faq-aguardando']
    },
    {
      id: 'portal-filhos', titulo: 'Acompanhar mais de um filho', tela: 'portal', perfis: ['responsavel'],
      resumo: 'Adicionar irmãos à mesma conta e trocar de aluno.',
      palavras: ['irmao', 'outro filho', 'adicionar aluno'],
      corpo: [
        ['passos', [
          'No Início do portal, clique em {{Adicionar aluno}}.',
          'Digite o código de acesso do outro filho e o parentesco.',
          'Depois da aprovação do colégio, os nomes aparecem no alto da tela: clique para trocar de aluno.'
        ]]
      ]
    },
    {
      id: 'portal-boletim', titulo: 'Boletim, frequência e horário', tela: 'portal-boletim', perfis: ['responsavel'],
      resumo: 'Notas por bimestre, situação, faltas por disciplina e o horário de aulas.',
      palavras: ['notas', 'boletim', 'faltas', 'frequencia', 'horario'],
      telas: ['portal-frequencia', 'portal-grade'],
      corpo: [
        ['lista', [
          '**Boletim**: médias de cada bimestre, média final e situação. {{Imprimir / PDF}} para guardar.',
          '**Frequência**: faltas por disciplina, mês a mês e o conteúdo das aulas em que o aluno faltou.',
          '**Horário de aulas**: a grade da semana da turma.'
        ]],
        ['p', 'As notas e a chamada aparecem assim que os professores lançam.']
      ]
    },
    {
      id: 'portal-financeiro', titulo: 'Mensalidades: pagar com PIX, carnê e declaração do IR', tela: 'portal-financeiro', perfis: ['responsavel'],
      resumo: 'Ver as mensalidades do ano, pagar pelo PIX e baixar o carnê e a declaração de pagamentos.',
      palavras: ['pagar', 'pix', 'boleto', 'mensalidade', 'carne', 'imposto de renda', 'recibo'],
      corpo: [
        ['passos', [
          'Abra **Financeiro** (ou o cartão de pagamento no Início).',
          'Na mensalidade em aberto, clique em pagar: abre a cobrança com o **QR Code PIX** e o **copia e cola**, já com o valor.',
          'Pague pelo aplicativo do seu banco.'
        ]],
        ['p', 'A mensalidade aparece como paga quando o colégio confirmar o recebimento. Nas pagas, abra o **recibo**.'],
        ['p', 'Também estão aqui o **carnê** (todas as parcelas em aberto) e a **declaração de pagamentos do ano**, para o Imposto de Renda.']
      ]
    },
    {
      id: 'portal-comunicados', titulo: 'Comunicados e confirmação de ciência', tela: 'portal-comunicados', perfis: ['responsavel'],
      resumo: 'Avisos do colégio e o botão "Estou ciente".',
      palavras: ['comunicado', 'aviso', 'ciente', 'circular'],
      corpo: [
        ['p', 'Os comunicados do colégio para a turma do seu filho aparecem aqui e no Início. Os novos ficam destacados.'],
        ['p', 'Quando o colégio pede confirmação (passeio, mudança de horário...), clique em {{Estou ciente}}. O colégio vê quem confirmou.']
      ]
    },
    {
      id: 'portal-calendario', titulo: 'Calendário do colégio', tela: 'portal-calendario', perfis: ['responsavel'],
      resumo: 'Provas, reuniões, eventos, feriados e recessos da turma do seu filho.',
      palavras: ['calendario', 'prova', 'reuniao', 'feriado', 'evento'],
      corpo: [
        ['p', 'Mostra o mês com os eventos do colégio e da turma do seu filho. As próximas datas também aparecem no Início.']
      ]
    }
  ]);

  /* =================== PERGUNTAS FREQUENTES =================== */
  add('duvidas', [
    {
      id: 'faq-senha', titulo: 'Esqueci a minha senha', perfis: ['equipe', 'responsavel'],
      resumo: 'Como criar uma senha nova pelo e-mail.',
      palavras: ['senha', 'esqueci', 'redefinir', 'trocar senha', 'nao consigo entrar'],
      corpo: [
        ['passos', [
          'Na tela de acesso, digite o seu e-mail e clique em {{Esqueci minha senha}}.',
          'Abra o e-mail recebido (confira também o lixo eletrônico e o spam) e clique no link.',
          'Crie a senha nova e entre de novo.'
        ]],
        ['p', 'Se o e-mail não chegar em alguns minutos, confira se digitou o mesmo e-mail com que se cadastrou. A equipe do colégio não vê nem troca senhas.']
      ]
    },
    {
      id: 'faq-aguardando', titulo: 'Fiz o cadastro e aparece "Aguardando aprovação"', perfis: ['equipe', 'responsavel'],
      resumo: 'O administrador do colégio precisa liberar o acesso.',
      palavras: ['aguardando', 'pendente', 'aprovacao', 'nao libera'],
      corpo: [
        ['p', 'Todo cadastro novo passa pela aprovação do colégio, para ninguém ver dados de alunos sem autorização. Avise a secretaria ou a coordenação. Depois da aprovação, clique em {{Verificar novamente}}.'],
        ['p', 'Administrador: os pendentes ficam em Sistema › Usuários e no Dashboard.']
      ]
    },
    {
      id: 'faq-professor-turma', titulo: 'O professor não vê a turma no Diário ou nas Notas', perfis: ['admin', 'professor'],
      resumo: 'Faltam o vínculo do login ou a atribuição da disciplina.',
      palavras: ['professor nao ve turma', 'turma nao aparece', 'diario vazio'],
      corpo: [
        ['p', 'Confira as duas coisas:'],
        ['passos', [
          'Em **Professores**, a ficha do professor está ligada ao **login** dele (campo "Login no sistema")?',
          'Em **Turmas e Séries** › {{Professores}} da turma, a disciplina está **atribuída** a ele?'
        ]],
        ['p', 'Depois de ajustar, o professor clica em {{⟳}} ou recarrega o sistema.']
      ],
      relacionados: ['turmas-professores', 'professores-cadastrar']
    },
    {
      id: 'faq-aluno-saiu', titulo: 'O aluno saiu da escola: excluir ou mudar a situação?', perfis: ['equipe'],
      resumo: 'Mude a situação. Excluir apaga o histórico.',
      palavras: ['excluir aluno', 'aluno saiu', 'desistiu', 'transferido'],
      corpo: [
        ['p', 'Mude a situação para **Inativo** (saiu ou desistiu) ou **Transferido** (foi para outra escola; de preferência emitindo a declaração de transferência, que já cancela as mensalidades futuras). Assim o histórico, as notas e o financeiro ficam guardados.'],
        ['p', 'Excluir é só para cadastro feito por engano.']
      ],
      relacionados: ['alunos-situacao', 'documentos-transferencia']
    },
    {
      id: 'faq-bolsa-valor', titulo: 'A mensalidade ficou com outro valor depois da bolsa', perfis: ['admin', 'financeiro'],
      resumo: 'O desconto é recalculado sempre que a bolsa muda.',
      palavras: ['valor errado', 'desconto', 'bolsa', 'recalcular'],
      corpo: [
        ['p', 'Ao criar, alterar ou encerrar uma bolsa, as mensalidades **em aberto** do aluno são recalculadas pela bolsa vigente em cada vencimento. As pagas não mudam. Com duas bolsas vigentes, vale a de maior percentual.'],
        ['p', 'Confira a vigência da bolsa (data de início e fim) em Descontos e Bolsas.']
      ],
      relacionados: ['bolsas-cadastrar']
    },
    {
      id: 'faq-mudar-ano', titulo: 'Como mudar o ano letivo?', perfis: ['admin'],
      resumo: 'Pela Virada do ano letivo, que também cria as turmas e passa os alunos.',
      palavras: ['ano letivo', 'mudar ano', 'ano novo'],
      corpo: [
        ['p', 'Use **Sistema › Virada do ano letivo**: além de trocar o ano, ela cria as turmas do ano novo, passa os alunos, gera as mensalidades e pode ser desfeita.'],
        ['p', 'Trocar só o número em Configurações › Parâmetros não move turmas nem alunos.']
      ],
      relacionados: ['virada-quando']
    },
    {
      id: 'faq-codigo-pai', titulo: 'O responsável perdeu ou não recebeu o código de acesso', perfis: ['equipe'],
      resumo: 'Reenvie pela ficha do aluno.',
      palavras: ['codigo', 'perdeu codigo', 'nao recebeu', 'pai'],
      corpo: [
        ['p', 'Abra a ficha do aluno e clique em {{Enviar}} (WhatsApp) ou {{Copiar}}. Se suspeitar que o código foi parar com outra pessoa, use {{Gerar novo}}: o antigo deixa de valer para cadastros novos.']
      ],
      relacionados: ['alunos-codigo']
    },
    {
      id: 'faq-sem-conexao', titulo: 'Aparece "Sem conexão"', perfis: ['equipe', 'responsavel'],
      resumo: 'A internet ou o servidor não responderam.',
      palavras: ['sem conexao', 'offline', 'nao carrega', 'erro de rede'],
      corpo: [
        ['passos', [
          'Confira a internet do computador ou do celular.',
          'Clique no indicador vermelho do topo para tentar de novo (o sistema também tenta sozinho).',
          'Se só o EduGest não abrir e a internet estiver normal, aguarde alguns minutos e avise o suporte.'
        ]],
        ['p', 'O que estava digitado continua na tela. Não feche a página antes de salvar.']
      ]
    },
    {
      id: 'faq-nova-versao', titulo: 'Apareceu "Há uma nova versão do EduGest"', perfis: ['equipe', 'responsavel'],
      resumo: 'O sistema foi atualizado; atualize quando terminar o que está fazendo.',
      palavras: ['nova versao', 'atualizacao', 'atualizar'],
      corpo: [
        ['p', 'Termine e salve o que estiver fazendo e clique em {{Atualizar agora}}. A página recarrega com a versão nova, sem perder login.']
      ]
    },
    {
      id: 'faq-pdf', titulo: 'Como salvar em PDF ou imprimir', perfis: ['equipe', 'responsavel'],
      resumo: 'Pela impressão do navegador.',
      palavras: ['pdf', 'imprimir', 'salvar', 'baixar'],
      corpo: [
        ['p', 'Nos botões {{Imprimir / PDF}}, abre a janela de impressão. Para gerar o arquivo, escolha a impressora **Salvar como PDF** (ou "Microsoft Print to PDF") e clique em Salvar.'],
        ['p', 'Cobranças, declarações e carnês já abrem como PDF: use o botão de baixar do próprio visualizador.']
      ]
    },
    {
      id: 'faq-whatsapp', titulo: 'O botão do WhatsApp não abre', perfis: ['equipe'],
      resumo: 'Bloqueio de janela, telefone sem DDD ou WhatsApp Web desconectado.',
      palavras: ['whatsapp', 'nao abre', 'telefone'],
      corpo: [
        ['lista', [
          'Permita janelas (pop-ups) do EduGest no navegador.',
          'Confira se o telefone do responsável tem DDD.',
          'No computador, deixe o WhatsApp Web conectado ou o aplicativo instalado.',
          'Sem telefone cadastrado, o WhatsApp abre para você escolher o contato.'
        ]]
      ]
    },
    {
      id: 'faq-desfazer', titulo: 'Lancei algo errado: dá para desfazer?', perfis: ['equipe'],
      resumo: 'O que pode ser desfeito em cada tela.',
      palavras: ['desfazer', 'errei', 'estornar', 'voltar atras', 'apagar'],
      corpo: [
        ['tabela', [
          ['Situação', 'Como desfazer'],
          ['Recebimento de mensalidade', '{{Estornar}} na mensalidade paga.'],
          ['Pagamento de conta', '{{Estornar}} na conta paga.'],
          ['Conciliação bancária', '{{Desfazer}} na aba Conciliados (ou desfazer a importação, se nada foi conciliado).'],
          ['Aula no diário', 'Abra a aula e use {{Excluir registro}}.'],
          ['Nota lançada', 'Apague o campo e salve de novo.'],
          ['Importação de alunos', '{{Desfazer}} em Importar planilha › Importações anteriores (sem movimento).'],
          ['Virada do ano', '{{Desfazer}} em Viradas já feitas (sem movimento no ano novo).'],
          ['Documento emitido', 'Cancelar no livro de registro (fica registrado como cancelado).']
        ]]
      ]
    },
    {
      id: 'faq-inadimplente', titulo: 'Como vejo quem está devendo?', perfis: ['admin', 'financeiro'],
      resumo: 'Dashboard, filtro de vencidas e relatórios de inadimplência.',
      palavras: ['inadimplente', 'devedor', 'atraso', 'vencida', 'cobrar'],
      corpo: [
        ['lista', [
          'No **Dashboard**, clique em **Inadimplentes**: abre as mensalidades vencidas de todos os meses.',
          'Em **Mensalidades**, use o filtro **Vencidas** e cobre pelo WhatsApp.',
          'Em **Relatórios**, veja a inadimplência por turma e o ranking com o tempo de atraso.'
        ]]
      ],
      relacionados: ['mensalidades-cobrar', 'relatorios-financeiros']
    },
    {
      id: 'faq-sessao', titulo: 'O sistema saiu sozinho', perfis: ['equipe', 'responsavel'],
      resumo: 'Encerramento por inatividade, para proteger os dados.',
      palavras: ['deslogou', 'saiu sozinho', 'sessao expirou'],
      corpo: [
        ['p', 'Depois de um tempo sem uso, a sessão é encerrada. Dois minutos antes, o indicador do topo fica âmbar e aparece um aviso para continuar conectado. Entre de novo normalmente.'],
        ['p', 'O tempo é definido pelo administrador em Configurações › Parâmetros.']
      ],
      relacionados: ['comecar-sessao']
    }
  ]);

  /* =================== TOURS =================== */
  // Passos de cada tela. g: 1 = entra no tour geral (o resto aparece em "Mostrar na tela").
  const tours = {
    dashboard: [
      { g: 1, alvo: '.pagina .grade-kpi', titulo: 'Dashboard', texto: 'Os números do colégio: alunos ativos, professores, turmas do ano e inadimplentes. **Clique num indicador** para abrir a tela correspondente.' },
      { g: 1, alvo: ['.pagina .aj-impl', '.pagina [data-dash-implantacao]'], titulo: 'Implantação do colégio', texto: 'Para o administrador: o que ainda falta configurar, na ordem certa. Cada item tem o atalho para a tela e o passo a passo. A lista some quando tudo estiver pronto.' },
      { alvo: '.pagina .lista-atividade', titulo: 'Atividade recente', texto: 'Quem fez o quê no sistema: notas lançadas, mensalidades geradas, alunos cadastrados...' }
    ],
    alunos: [
      { g: 1, alvo: ['.pagina .cab-acoes', '.pagina .card-titulo'], titulo: 'Alunos', texto: 'Cadastre um aluno em **Novo aluno** ou muitos de uma vez em **Importar planilha** (Excel ou CSV).' },
      { g: 1, alvo: '.pagina [data-filtro="busca"]', titulo: 'Busca e turma', texto: 'Busque por nome, RA, código de acesso ou responsável, e filtre pela turma (ou "Sem turma").' },
      { alvo: '.pagina .filtros', titulo: 'Situação', texto: 'Ativos, inativos, transferidos e concluídos. Prefira mudar a situação a excluir um aluno.' },
      { alvo: '.pagina .tabela-wrap', titulo: 'Lista de alunos', texto: 'O **código de acesso** (PAI) é o que a família usa para entrar no portal: copie aqui ou envie pela ficha. O lápis abre a ficha completa, com responsável e autorizados a retirar.' }
    ],
    professores: [
      { g: 1, alvo: ['.pagina [data-action="novo"]', '.pagina .card-titulo'], titulo: 'Professores', texto: 'Cadastre cada professor com as disciplinas que leciona e **ligue ao login** dele, para que veja as próprias turmas no Diário e nas Notas.' },
      { alvo: '.pagina .tabela-wrap', titulo: 'Lista', texto: 'Disciplinas, turmas, carga horária, contato e se o professor já está ligado a um login do sistema.' }
    ],
    turmas: [
      { g: 1, alvo: ['.pagina [data-action="nova"]', '.pagina .card-titulo'], titulo: 'Turmas e Séries', texto: 'Crie as turmas do ano: nome, série, turno, capacidade e sala.' },
      { alvo: '.pagina [data-filtro="ano"]', titulo: 'Ano letivo', texto: 'Veja as turmas de anos anteriores ou as já criadas para o próximo ano.' },
      { g: 1, alvo: ['.pagina [data-id] [data-action="professores"]', '.pagina .filtros'], titulo: 'Professores da turma', texto: 'Em cada turma, **Professores** define quem dá cada disciplina. É isso que libera a turma para o professor no Diário e nas Notas.' }
    ],
    diario: [
      { g: 1, alvo: ['.pagina .linha-3', '.pagina .card'], titulo: 'Diário de Classe', texto: 'Escolha a turma, a data e a aula (a disciplina, ou "Chamada do dia" no Infantil e Fundamental I).' },
      { alvo: ['.pagina [data-area="aula"]', '.pagina .card'], titulo: 'Chamada e conteúdo', texto: 'Marque **P** (presente), **F** (falta) ou **J** (justificada); "Todos presentes" agiliza. Escreva o conteúdo da aula e salve.' },
      { alvo: '.pagina [data-area="historico"]', titulo: 'Registros da turma', texto: 'As últimas aulas lançadas. Clique numa para corrigir.' }
    ],
    notas: [
      { g: 1, alvo: ['.pagina .linha-3', '.pagina .card'], titulo: 'Notas e Médias', texto: 'Escolha a turma, a disciplina e o bimestre. Digite Nota 1, Nota 2 e Trabalho (Enter passa para o próximo aluno) e salve. Nota em branco não conta como zero.' },
      { alvo: ['.pagina [data-area="planilha"]', '.pagina .card'], titulo: 'Médias', texto: 'A média do bimestre e a situação (na média ou abaixo) aparecem na hora.' }
    ],
    boletim: [
      { g: 1, alvo: ['.pagina [data-filtro="aluno"]', '.pagina .card'], titulo: 'Boletim', texto: 'Escolha a turma e o aluno: médias por bimestre, média final, situação e frequência.' },
      { alvo: '.pagina [data-action="imprimir"]', titulo: 'Imprimir e enviar', texto: 'Imprima, salve em PDF ou envie o resumo ao responsável pelo WhatsApp.' }
    ],
    calendario: [
      { g: 1, alvo: ['.pagina [data-action="novo"]', '.pagina .card'], titulo: 'Calendário Escolar', texto: 'Eventos, provas, reuniões, feriados e recessos, para o colégio todo, segmentos ou turmas. O que estiver marcado para as famílias aparece no portal.' },
      { alvo: '.pagina [data-action="bimestres"]', titulo: 'Bimestres', texto: 'Defina o início e o fim de cada bimestre: o sistema conta os dias letivos do ano.' },
      { alvo: '.pagina [data-action="feriados"]', titulo: 'Feriados nacionais', texto: 'Inclua os feriados do ano de uma vez. Os da cidade e do estado, crie com o tipo Feriado.' }
    ],
    grade: [
      { g: 1, alvo: ['.pagina .abas', '.pagina .card'], titulo: 'Grade Horária', texto: 'A semana de cada turma e de cada professor. A coordenação monta; o professor consulta em "Minha grade".' },
      { alvo: '.pagina [data-aba="horarios"]', titulo: 'Horários', texto: 'Primeiro defina os horários de aula e intervalo de cada turno. Dá para gerar automaticamente.' },
      { alvo: ['.pagina [data-aba="professores"]', '.pagina [data-aba="minha"]'], titulo: 'Semana do professor', texto: 'As aulas de cada professor e a carga horária. Um professor não pode estar em duas turmas no mesmo horário.' }
    ],
    documentos: [
      { g: 1, alvo: ['.pagina .abas', '.pagina .card'], titulo: 'Documentos', texto: 'Declarações e histórico escolar em PDF com número e QR Code de validação.' },
      { alvo: '.pagina [data-aba="emitidos"]', titulo: 'Emitidos', texto: 'O livro de registro: 2ª via, envio pelo WhatsApp e cancelamento.' },
      { alvo: '.pagina [data-aba="historico"]', titulo: 'Histórico escolar', texto: 'Os anos do EduGest entram sozinhos; inclua aqui os anos de outras escolas.' },
      { alvo: '.pagina [data-aba="modelos"]', titulo: 'Modelos', texto: 'Ajuste o texto dos documentos ou crie os do colégio, com variáveis como {aluno}.' }
    ],
    mensalidades: [
      { g: 1, alvo: ['.pagina [data-action="gerar"]', '.pagina .card'], titulo: 'Mensalidades', texto: '**Gerar mensalidades** cria as cobranças do período para todos, uma turma ou um aluno, com as bolsas aplicadas e resumo antes de confirmar.' },
      { alvo: '.pagina .filtros', titulo: 'Situação', texto: 'Em aberto, vencidas, pagas, isentas e canceladas. Na linha: **Receber** (baixa), WhatsApp com PIX, PDF, alterar e cancelar.' },
      { alvo: '.pagina [data-action="documentos"]', titulo: 'Documentos', texto: 'Carnê do aluno, mensalidades do mês para imprimir e a declaração anual para o Imposto de Renda.' }
    ],
    contas: [
      { g: 1, alvo: ['.pagina [data-action="nova"]', '.pagina .card'], titulo: 'Contas a Pagar', texto: 'Lance as despesas do colégio. Conta que se repete (mensal, trimestral, anual) lança a próxima sozinha ao ser paga.' }
    ],
    fluxo: [
      { g: 1, alvo: ['.pagina svg', '.pagina .card'], titulo: 'Fluxo de Caixa', texto: 'Entradas e saídas mês a mês: o realizado (pagamentos) e o previsto (o que está em aberto).' }
    ],
    bolsas: [
      { g: 1, alvo: ['.pagina [data-action="nova"]', '.pagina .card'], titulo: 'Descontos e Bolsas', texto: 'Bolsas e descontos com vigência. As mensalidades em aberto do aluno são recalculadas na hora.' }
    ],
    relatorios: [
      { g: 1, alvo: ['.pagina .filtros', '.pagina .card'], titulo: 'Relatórios', texto: 'Inadimplência por turma, ranking de inadimplentes, receita prevista × recebida, DRE e impacto de bolsas. Todos exportam CSV e PDF.' }
    ],
    conciliacao: [
      { g: 1, alvo: ['.pagina [data-action="importar"]', '.pagina [data-action="nova-conta"]', '.pagina .card'], titulo: 'Conciliação Bancária', texto: 'Importe o extrato do banco (OFX ou CSV): o sistema sugere a mensalidade ou a conta de cada lançamento e dá baixa ao conciliar.' },
      { alvo: '.pagina .filtros', titulo: 'Pendentes e conciliados', texto: 'Concilie automaticamente as sugestões de confiança alta, aceite em lote ou vincule à mão. Tudo pode ser desfeito.' }
    ],
    funil: [
      { g: 1, alvo: ['.pagina .abas', '.pagina .card'], titulo: 'Funil de Matrículas', texto: 'Cada família interessada anda pelas etapas: interessado, visita, proposta e matriculado. Arraste os cartões no **Quadro**.' },
      { alvo: '.pagina [data-acao="novo"]', titulo: 'Novo interessado', texto: 'Cadastre quem ligou ou visitou. Marque o próximo contato para não esquecer.' },
      { alvo: '.pagina [data-aba="formulario"]', titulo: 'Formulário', texto: 'Um link para o Instagram, o site ou um QR Code: quem preencher cai direto no funil.' }
    ],
    comunicados: [
      { g: 1, alvo: ['.pagina [data-action="novo"]', '.pagina .card'], titulo: 'Comunicados', texto: 'Avisos para o portal das famílias do colégio todo, de segmentos ou de turmas, com confirmação de ciência e envio pelo WhatsApp. Você acompanha quem leu.' }
    ],
    config: [
      { g: 1, alvo: ['.pagina [data-bloco="dados"]', '.pagina .card'], titulo: 'Configurações', texto: 'Dados do colégio, logotipo e documentos oficiais, parâmetros do ano, cobrança e PIX, disciplinas e o código do colégio.' },
      { alvo: '.pagina [data-bloco="config"]', titulo: 'Parâmetros', texto: 'Ano letivo, mensalidade padrão, vencimento, média para aprovação, frequência mínima e o tempo para encerrar a sessão.' },
      { alvo: '.pagina [data-bloco="cobranca"]', titulo: 'Cobrança e PIX', texto: 'Com a chave PIX, as cobranças saem com QR Code. Gere o PDF de teste de R$ 1,00 para conferir.' }
    ],
    usuarios: [
      { g: 1, alvo: ['.pagina [data-action="vincular"]', '.pagina .card'], titulo: 'Usuários', texto: 'Aprove os cadastros, escolha o perfil e os módulos de cada pessoa e bloqueie quem saiu.' },
      { alvo: '.pagina .tabela-wrap', titulo: 'Equipe e responsáveis', texto: 'Perfil, situação, o que cada um acessa e o último acesso.' }
    ],
    virada: [
      { g: 1, alvo: ['.pagina .virada-anos', '.pagina .card'], titulo: 'Virada do ano letivo', texto: 'No fim do ano: cria as turmas do ano novo, passa os alunos, gera as mensalidades e muda o ano letivo. Nada é gravado antes da conferência e dá para desfazer.' },
      { alvo: '.pagina .virada-passos', titulo: 'Quatro passos', texto: 'Turmas, Alunos, Mensalidades e Conferir.' }
    ],
    seguranca: [
      { g: 1, alvo: ['.pagina .filtros', '.pagina .card'], titulo: 'Log de Segurança', texto: 'Entradas, senhas erradas, saídas e ações administrativas, com IP e dispositivo. Não pode ser apagado.' }
    ],
    colegios: [
      { g: 1, alvo: '.pagina .card', titulo: 'Gestão de Colégios', texto: 'Só para o proprietário do sistema: cadastrar colégios, convidar o diretor, aprovar cadastros e dar suporte.' }
    ],
    portal: [
      { g: 1, alvo: ['.pagina .portal-cab', '.pagina .card'], titulo: 'Início', texto: 'O resumo do seu filho: avisos importantes, comunicados, próximas datas, a próxima mensalidade e as últimas faltas.' },
      { g: 1, alvo: '.pagina [data-action="adicionar-filho"]', titulo: 'Mais de um filho', texto: 'Adicione os irmãos com o código de acesso de cada um e troque de aluno aqui.' }
    ],
    'portal-boletim': [
      { g: 1, alvo: '.pagina .card', titulo: 'Boletim', texto: 'Médias de cada bimestre, média final e situação. Dá para imprimir ou salvar em PDF.' }
    ],
    'portal-frequencia': [
      { g: 1, alvo: '.pagina .card', titulo: 'Frequência', texto: 'Faltas por disciplina, mês a mês, e o conteúdo das aulas em que o aluno faltou.' }
    ],
    'portal-grade': [
      { alvo: '.pagina .card', titulo: 'Horário de aulas', texto: 'A grade da semana da turma.' }
    ],
    'portal-financeiro': [
      { g: 1, alvo: ['.pagina [data-action="doc"]', '.pagina .card'], titulo: 'Financeiro', texto: 'Mensalidades do ano. Pague pelo PIX (QR Code ou copia e cola) e baixe o carnê e a declaração para o Imposto de Renda.' }
    ],
    'portal-comunicados': [
      { g: 1, alvo: '.pagina .card', titulo: 'Comunicados', texto: 'Os avisos do colégio. Quando pedirem, confirme com **Estou ciente**.' }
    ],
    'portal-calendario': [
      { g: 1, alvo: '.pagina .card', titulo: 'Calendário', texto: 'Provas, reuniões, eventos e feriados da turma do seu filho.' }
    ]
  };

  const tourInicio = {
    equipe: [
      { titulo: 'Bem-vindo(a) ao tour do EduGest', texto: ['Vamos passar pelas telas que você usa e mostrar para que serve cada uma e onde ficam os botões principais.', 'Use **Próximo** e **Voltar** (ou as setas do teclado). **Esc** sai a qualquer momento. Nada é alterado no sistema durante o tour.'] },
      { alvo: '#menu', celular: '.btn-menu', titulo: 'Menu', texto: 'As telas ficam agrupadas: Pedagógico, Financeiro, Captação, Comunicação e Sistema. Clique no nome do grupo para abrir. Você só vê o que foi liberado para o seu perfil.' },
      { alvo: '.sidebar-colegio', titulo: 'Colégio', texto: 'Se você trabalha em mais de um colégio, troque aqui. Cada colégio tem os seus dados separados.' },
      { alvo: '#statusConexao', titulo: 'Conexão', texto: 'Há quanto tempo você está conectado. Fica âmbar nos 2 minutos antes de encerrar por inatividade e vermelho se cair a internet.' },
      { alvo: '[data-action="atualizar-tela"]', titulo: 'Atualizar', texto: 'Busca de novo os dados da tela, por exemplo quando outra pessoa acabou de lançar algo. Pergunta antes se houver algo não salvo.' },
      { alvo: '.usuario-botao', titulo: 'Seu usuário', texto: 'Tema claro ou escuro, Central de ajuda, este tour, recarregar o sistema e sair.' }
    ],
    responsavel: [
      { titulo: 'Bem-vindo(a) ao portal do colégio', texto: ['Vamos mostrar onde ver o boletim, as faltas, as mensalidades, os comunicados e o calendário.', 'Use **Próximo** e **Voltar**. **Esc** sai a qualquer momento.'] },
      { alvo: '#menu', celular: '.btn-menu', titulo: 'Menu', texto: 'Início, Boletim, Frequência, Horário de aulas, Financeiro, Comunicados e Calendário.' }
    ]
  };
  const tourFim = [
    { alvo: '[data-action="ajuda"]', celular: '.usuario-botao', titulo: 'Central de ajuda', texto: ['Pronto! Quando tiver dúvida, use o botão **?**: ele abre o manual já na tela em que você está.', 'Na Central de ajuda há o passo a passo de cada tela, as perguntas frequentes, o manual em PDF e este tour para rever quando quiser.'] }
  ];
  const ordemEquipe = ['dashboard', 'alunos', 'professores', 'turmas', 'diario', 'notas', 'boletim', 'calendario', 'grade', 'documentos',
    'mensalidades', 'contas', 'fluxo', 'bolsas', 'relatorios', 'conciliacao', 'funil', 'comunicados', 'config', 'usuarios', 'virada', 'seguranca', 'colegios'];
  const ordemPortal = ['portal', 'portal-boletim', 'portal-frequencia', 'portal-financeiro', 'portal-comunicados', 'portal-calendario'];

  /* "Comece por aqui": o essencial de cada perfil, na ordem de uso */
  const trilhas = {
    admin: ['comecar-tela', 'implantacao-ordem', 'comecar-perfis', 'implantacao-parametros', 'turmas-criar', 'importar-planilha', 'mensalidades-gerar', 'implantacao-equipe', 'implantacao-familias', 'virada-quando'],
    professor: ['comecar-tela', 'diario-chamada', 'notas-lancar', 'notas-media', 'boletim-emitir', 'grade-minha', 'calendario-eventos', 'comunicados-publicar'],
    financeiro: ['comecar-tela', 'mensalidades-gerar', 'mensalidades-receber', 'mensalidades-cobrar', 'bolsas-cadastrar', 'contas-pagar', 'conciliacao-conta', 'relatorios-financeiros'],
    responsavel: ['portal-primeiro-acesso', 'app-instalar', 'portal-filhos', 'portal-boletim', 'portal-financeiro', 'portal-comunicados']
  };

  /* Implantação do colégio: o que a API confere (GET /colegios/atual/implantacao) */
  const implantacao = [
    { id: 'dados', fase: '1. O colégio', titulo: 'Dados do colégio', texto: 'CNPJ, telefone e endereço, que saem nos documentos e cobranças.', pagina: 'config', artigo: 'implantacao-dados' },
    { id: 'mensalidade', fase: '1. O colégio', titulo: 'Mensalidade padrão', texto: 'Valor e dia de vencimento em Parâmetros.', pagina: 'config', artigo: 'implantacao-parametros' },
    { id: 'pix', fase: '1. O colégio', titulo: 'Cobrança e PIX', texto: 'Chave PIX e cidade, para as cobranças saírem com QR Code.', pagina: 'config', artigo: 'implantacao-pix' },
    { id: 'documentos', fase: '1. O colégio', titulo: 'Logotipo e documentos oficiais', texto: 'Logotipo, INEP, ato de autorização, diretor(a) e secretário(a).', pagina: 'config', artigo: 'implantacao-dados' },
    { id: 'turmas', fase: '2. Estrutura do ano', titulo: 'Turmas do ano letivo', texto: 'Nome, série, turno e vagas de cada turma.', pagina: 'turmas', artigo: 'turmas-criar' },
    { id: 'professores', fase: '2. Estrutura do ano', titulo: 'Professores', texto: 'Com as disciplinas e o login de cada um.', pagina: 'professores', artigo: 'professores-cadastrar' },
    { id: 'atribuicoes', fase: '2. Estrutura do ano', titulo: 'Professores nas turmas', texto: 'Quem dá cada disciplina em cada turma (botão Professores da turma).', pagina: 'turmas', artigo: 'turmas-professores' },
    { id: 'horarios', fase: '2. Estrutura do ano', titulo: 'Horários dos turnos', texto: 'Aulas e intervalos de cada turno.', pagina: 'grade', artigo: 'grade-horarios' },
    { id: 'grade', fase: '2. Estrutura do ano', titulo: 'Grade horária', texto: 'Disciplina e professor em cada horário das turmas.', pagina: 'grade', artigo: 'grade-montar' },
    { id: 'calendario', fase: '2. Estrutura do ano', titulo: 'Bimestres do ano', texto: 'Início e fim de cada bimestre no calendário.', pagina: 'calendario', artigo: 'calendario-bimestres' },
    { id: 'alunos', fase: '3. Alunos e financeiro', titulo: 'Alunos cadastrados', texto: 'Importe a planilha ou cadastre um a um.', pagina: 'alunos', artigo: 'importar-planilha' },
    { id: 'enturmados', fase: '3. Alunos e financeiro', titulo: 'Todos os alunos com turma', texto: 'Nenhum aluno ativo sem turma.', pagina: 'alunos', artigo: 'alunos-cadastrar' },
    { id: 'mensalidades', fase: '3. Alunos e financeiro', titulo: 'Mensalidades do ano', texto: 'Cadastre as bolsas antes e gere as mensalidades.', pagina: 'mensalidades', artigo: 'mensalidades-gerar' },
    { id: 'equipe', fase: '4. Pessoas', titulo: 'Equipe no sistema', texto: 'Código do colégio para a equipe e aprovação dos cadastros.', pagina: 'usuarios', artigo: 'implantacao-equipe' },
    { id: 'familias', fase: '4. Pessoas', titulo: 'Famílias no portal', texto: 'Envie o código de acesso (PAI) aos responsáveis.', pagina: 'alunos', artigo: 'implantacao-familias' }
  ];

  EG.AJUDA = { categorias, artigos, tours, tourInicio, tourFim, ordemEquipe, ordemPortal, trilhas, implantacao };
})(window.EG);
