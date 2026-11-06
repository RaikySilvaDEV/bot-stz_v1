# Community for FiveM Bot

Bot Discord em Node.js com suporte automatizado, tickets, verificação, anúncios FiveM, parcerias e rotinas de conteúdo.

## Preparar e iniciar

1. Instale Node.js 20 ou superior.
2. Copie `.env.example` para `.env` e preencha `DISCORD_TOKEN`, `GEMINI_API_KEY` e `API_KEY`.
3. No Discord Developer Portal, habilite **Server Members Intent** e **Message Content Intent**. Convide o bot com as permissões necessárias para gerenciar canais e cargos, ler histórico, enviar mensagens, anexar arquivos e usar comandos.
4. Execute `npm install` e depois `npm start`. Esse comando usa um supervisor leve que reinicia o processo do bot após uma saída inesperada; `Ctrl+C` encerra o bot e o supervisor. `npm run start:direct` inicia sem reinício automático.

`GEMINI_API_KEY` pode ficar em branco; os tickets continuam abrindo e a equipe recebe aviso quando a resposta automática não estiver disponível. `API_KEY` pode ficar em branco para desativar a API local do Postman. O fuso padrão é `America/Sao_Paulo` e pode ser alterado por `BOT_TIME_ZONE`.

O painel web fica na rota `/painel` da API local, normalmente em `http://127.0.0.1:3001/painel`. O botão **Ver na web** no canal privado do painel inclui um token de uso único, válido por 10 minutos; atualize o painel no Discord para gerar outro. Também é possível entrar manualmente com `DASHBOARD_PASSWORD` ou, se vazio, `API_KEY`. O servidor escuta somente no próprio computador. Para acesso pela internet, publique atrás de um proxy HTTPS e configure `DASHBOARD_PUBLIC_URL` com o endereço público.

O usuário desenvolvedor é definido por `BOT_DEVELOPER_IDS`, com IDs separados por vírgula. Os comandos de administração ficam visíveis no servidor, mas só o dono do servidor e esses IDs podem executá-los.

## Comandos

| Comando | Acesso | O que faz |
|---|---|---|
| `/ajuda`, `/ping`, `/teste` | Membros | Ajuda e diagnóstico rápido |
| `/vendas`, `/comprar` | Membros | Vitrine; `/comprar` gera Pix do Mercado Pago com confirmação e entrega automáticas |
| `/pagamentos` | Dono do servidor ou desenvolvedor configurado | Gerencia métodos legados e preços; também cria/atualiza o canal público de status |
| `/loja status` | Dono do servidor ou desenvolvedor configurado | Mostra automações, cargos, estoque e estado de configuração |
| `/loja publicar` | Dono do servidor ou desenvolvedor configurado | Publica/atualiza os cards com imagens e botões no canal de compras configurado; cria `#🛍️・loja` se o canal não existir |
| `/loja automacao` | Dono do servidor ou desenvolvedor configurado | Configura cada automação comercial separadamente; Mercado Pago exige credenciais e HTTPS |
| `/loja cargo`, `/loja estoque`, `/loja imagem`, `/loja instrucoes`, `/loja link-entrega` | Dono do servidor ou desenvolvedor configurado | Configura cargo, estoque, card e conteúdo entregue ao cliente |
| `/loja cupom-criar`, `/loja cupom-remover` | Dono do servidor ou desenvolvedor configurado | Gerencia códigos de desconto (aplicação desligada até ativar a automação) |
| `/loja relatorio` | Dono do servidor ou desenvolvedor configurado | Mostra pedidos, pagamentos pendentes e faturamento registrado |
| `/loja feedbacks` | Dono do servidor ou desenvolvedor configurado | Consulta avaliações recentes e média dos compradores |
| `/pedido aprovar` | Dono do servidor ou desenvolvedor configurado | Confirma manualmente um pedido e tenta a entrega configurada |
| `/pedido entregar` | Dono do servidor ou desenvolvedor configurado | Tenta novamente a entrega automática de um pedido já pago |
| `/painel` | Dono do servidor ou desenvolvedor configurado | Cria ou atualiza o painel privado de saúde do bot, com páginas de serviços, automações, canais e pagamentos |
| `/parcerias` | Dono do servidor ou ID de proprietário configurado | Cadastrar, editar, listar e remover parcerias |
| `/cadastrar-parceria` | Dono do servidor ou ID de proprietário configurado | Abre o cadastro rápido |
| `/anuncios-fivem` | Dono do servidor ou ID de proprietário configurado | Criar, editar e remover anúncios FiveM |
| `/configurar ver` | Dono do servidor ou ID de proprietário configurado | Exibe canais, automações e horários |
| `/configurar canal` | Dono do servidor ou ID de proprietário configurado | Define o destino de cada recurso |
| `/configurar automacao` | Dono do servidor ou ID de proprietário configurado | Liga ou pausa avisos, wallpapers, armazéns e IA |
| `/configurar mencoes` | Dono do servidor ou ID de proprietário configurado | Controla as menções automáticas a `@everyone` |
| `/configurar horarios` | Dono do servidor ou ID de proprietário configurado | Define os horários dos avisos, por exemplo `9,15,21` |
| `/configurar fuso` | Dono do servidor ou ID de proprietário configurado | Define o fuso IANA dos agendamentos |
| `/configurar auditoria` | Dono do servidor ou ID de proprietário configurado | Escolhe ou desativa o canal privado de logs |
| `/status`, `/logs`, `/backup` | Dono do servidor ou ID de proprietário configurado | Saúde do bot, ações administrativas e exportação dos dados persistentes |

Os canais começam com os IDs padrão de `src/config/constants.js`. As alterações feitas com `/configurar` ficam em `data/bot-config.json` e sobrevivem a reinicializações.

## Dados e privacidade

- Configurações, parcerias, anúncios FiveM, logs e estados das automações são gravados em arquivos JSON na pasta `data/`. Essa pasta é ignorada pelo Git; use `/backup` para baixar uma cópia dos dados persistentes.
- Os métodos de pagamento ficam em `data/metodos-pagamento.json`. A chave Pix é armazenada localmente e não aparece no painel nem no canal público; o backup administrativo também omite a chave.
- As rotinas da loja ficam em `data/comercio-config.json`. As novas automações de Mercado Pago, cargos, expiração, lembretes, carrinhos abandonados, cupons, estoque, entrega, relatórios e avaliações começam desligadas. Configure os cargos com `/loja cargo`, a validade é de 5 dias para os produtos atuais, e confirme manualmente com `/pedido aprovar` enquanto o pagamento automático estiver desligado.
- A loja aceita somente Pix pelo Mercado Pago: ao escolher um produto em `/comprar`, o bot pede o e-mail do pagador em um formulário privado, cria a cobrança Pix pelo SDK oficial `mercadopago`, exibe QR Code e Pix Copia e Cola e aguarda confirmação assinada do webhook antes de entregar o cargo. Notificações entram numa fila persistente, são respondidas rapidamente e podem ser processadas novamente após falha ou reinício. O endpoint é `/api/webhooks/mercado-pago`. Cada produto precisa ter preço e cargo de entrega configurados, e as automações de Mercado Pago e entrega automática precisam estar ativas.
- Para validar um pagamento Pix de ponta a ponta, a equipe pode usar `/pagamentos teste`. O bot pede o e-mail do pagador em um formulário privado, cria uma cobrança real de R$ 0,10, publica o QR Code e o Pix Copia e Cola na resposta privada e só entrega o cargo `Pagamento Teste` depois da confirmação assinada. Enquanto o processo do bot estiver ativo e dentro da validade do token de interação do Discord, a resposta privada é atualizada para mostrar a confirmação e o cargo atribuído. Esse teste não libera produtos da loja; o cargo é criado automaticamente e não tem permissões. Nas compras normais, a resposta privada do Pix também é atualizada após a confirmação e entrega do cargo. O supervisor atualiza a URL do webhook quando o endereço do túnel Cloudflare muda.
- Após a compra, a avaliação é publicada no canal configurado como **Avaliações de clientes** (por padrão `⭐avaliações-dos-clientes`) e o ticket associado é encerrado automaticamente após salvar a transcrição. Avaliações salvas mas ainda não publicadas são retomadas quando o bot inicia.
- Para configurar: crie uma aplicação no Developer Dashboard do Mercado Pago; use primeiro as credenciais da aba **Teste**; configure o evento de pagamentos no webhook da aplicação e copie a assinatura secreta; abra `/painel` → **Pagamentos** → **Mercado Pago** e informe Access Token, assinatura secreta e URL HTTPS pública terminada em `/api/webhooks/mercado-pago`. A tela grava as credenciais no `.env` local sem exibi-las. Depois, confira o estado do Mercado Pago e ative a automação explicitamente em **Automações**. A URL pública precisa encaminhar para a porta local da API do bot e permanecer acessível para notificações.
- Os tickets podem usar Gemini para responder. O painel informa os membros e recomenda que não enviem senhas, tokens ou outros dados sensíveis. A IA pode ser pausada com `/configurar automacao`.
- Ao abrir um ticket, o canal mostra somente a lista suspensa de produtos e o botão de fechar; os cards e detalhes ficam fora do ticket. Selecionar um produto abre as etapas privadas de pagamento.
- Ao fechar um ticket, o bot guarda uma transcrição local por até 90 dias. Se um canal de auditoria for configurado, também envia a transcrição para esse canal; mantenha-o privado. O comando `/backup` inclui configurações comerciais, preços, pedidos e avaliações, mas remove a chave Pix e não inclui transcrições.
- A API de anúncios FiveM escuta somente em `127.0.0.1`, exige `Authorization: Bearer <API_KEY>` e pode ser desativada omitindo `API_KEY`. As rotas existentes estão documentadas em [API-POSTMAN.md](API-POSTMAN.md).
- Nunca publique `.env`, tokens ou chaves. Se uma credencial for exposta, revogue-a no provedor e substitua-a localmente.

## Automação

Os avisos agendados mantêm os horários já configurados por padrão (05:00, 12:00 e 18:00). Wallpapers continuam às 12:00; o armazém consulta o intervalo de cinco horas e publica quando há arquivos para o item seguinte. Horários usam o fuso escolhido nas configurações. As rotinas podem ser pausadas sem remover os respectivos recursos.

### Painel web de configuração

Em `/painel`, a área **Configuração** permite editar os canais usados pelo bot, fuso horário, horários dos avisos e permissão para menções `@everyone`. A área **Loja** permite editar nomes, descrições, cargos, validade, preços, imagens, estoque e instruções de entrega; gerenciar cupons e acompanhar pedidos e avaliações. **Pagamentos** administra métodos Pix e links sem revelar as chaves salvas e configura credenciais e webhook do Mercado Pago, mantendo os segredos no `.env` local. O painel usa a mesma sessão autenticada e as opções de automação só mudam quando alguém as ativa explicitamente.

Para permitir que uma equipe use comandos administrativos, configure `BOT_ADMIN_ROLE_IDS` com os IDs dos cargos autorizados, separados por vírgula, e reinicie o bot. Os membros desses cargos passam a ver o canal privado do painel e podem usar `/painel`; o comando responde com um link web pessoal, de uso único. Para usar na mesma rede local, configure `API_HOST=0.0.0.0` e `DASHBOARD_PUBLIC_URL` com o IP local do computador. Libere a porta apenas no perfil de rede privada e para a rede local. Não encaminhe a porta diretamente da internet: o painel precisa de HTTPS público por proxy/túnel para acesso externo seguro.
