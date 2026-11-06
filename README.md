# Bot STZ · Community for FiveM

Bot de Discord para a Community for FiveM, feito em Node.js e Discord.js. O projeto reúne suporte, automações da comunidade, loja digital, pagamentos via Mercado Pago, API de anúncios e painel administrativo web.

## Vitrine real do projeto

Os cards abaixo usam as imagens presentes no repositório:

| Premium | Booster | Banner da loja |
|---|---|---|
| ![Produto Premium](assets/store/premium.jpg) | ![Produto Booster](assets/store/booster.jpg) | ![Banner da loja](assets/store/access-roles-banner.png) |

Os três produtos iniciais são Cargo Premium (R$ 12,00), Cargo Booster (R$ 7,00) e Booster + Premium (R$ 14,00). Os preços e conteúdos exibidos podem ser alterados no catálogo; confira o painel antes de publicar a vitrine.

## Requisitos

- Node.js 20 ou superior.
- Um aplicativo de bot no Discord Developer Portal, convidado para o servidor com permissões de mensagens, canais, cargos, membros e comandos de aplicação necessários às funções ativadas.
- `cloudflared` no `PATH` se for usar `npm start` com túnel Cloudflare automático.
- Uma chave Gemini para respostas automáticas dos tickets e para a Assistente interna. Sem ela, o restante do bot pode iniciar, mas esses recursos de IA ficam indisponíveis.

## Instalação

```powershell
npm install
Copy-Item .env.example .env
```

Edite `.env` localmente e configure pelo menos `DISCORD_TOKEN`, `API_KEY` e uma senha forte para `DASHBOARD_PASSWORD`. Nunca envie esse arquivo pelo chat nem o adicione ao Git. `GEMINI_API_KEY` é opcional. O `.env` já está no `.gitignore`.

No Discord Developer Portal, habilite **Server Members Intent** e **Message Content Intent** se o bot usar os respectivos eventos e comandos. Depois confira a hierarquia: o cargo do bot precisa ficar acima dos cargos que ele entrega.

## Iniciar e parar

```powershell
npm start
```

`npm start` inicia o supervisor do projeto: tenta abrir o túnel Cloudflare Quick Tunnel e inicia o bot; reinicia os processos após saídas inesperadas. O URL `trycloudflare.com` é temporário e pode mudar. `Ctrl+C` encerra os processos iniciados pelo supervisor. Sem túnel, execute `npm run start:direct` para iniciar somente o bot e a API local.

A API usa `API_HOST` e `API_PORT` (padrão `127.0.0.1:3001`). O túnel e o bot precisam apontar para a mesma porta. O painel local fica em `http://127.0.0.1:3001/painel`. Para acesso externo, use HTTPS e defina `DASHBOARD_PUBLIC_URL` com a URL pública completa do painel. Quick Tunnels não garantem um endereço fixo.

## Painel web

O painel (`/painel`) mostra estado do bot, automações, canais, loja, pagamentos e pedidos. Ele também permite administrar produtos, preços, imagens, cargos de entrega, estoque, cupons e configurações disponíveis na interface. O acesso pode usar `DASHBOARD_PASSWORD`; se estiver vazia, a sessão do painel usa `API_KEY`. A rota web de autenticação usa cookie `HttpOnly` e as operações de alteração validam origem.

O botão **Abrir painel web** no painel administrativo do Discord cria um acesso de uso único com validade limitada. A interface usa ícones Lucide distribuídos localmente (`src/api/public/icons/`), sem depender de CDN, e oferece tema escuro e navegação adaptável.

A Assistente do painel é consultiva: responde sobre o estado resumido do projeto, mas não altera configurações. Quando configurada, a pergunta é enviada ao Gemini. Não inclua tokens, senhas, chaves Pix ou dados de clientes nas perguntas.

## Recursos do bot

- Verificação e boas-vindas de membros.
- Tickets, transcrições e encaminhamento para atendimento humano; Gemini é opcional.
- Parcerias e anúncios FiveM, com gerenciamento no Discord e no painel.
- API REST protegida para criar, listar, editar e remover anúncios FiveM. Exemplos: [API-POSTMAN.md](API-POSTMAN.md).
- Wallpapers, avisos programados, saudações e publicações dos armazéns CTZ e CTZ Boosters.
- Loja de cargos, carrinho, cupons, avaliações, confirmação Mercado Pago, entrega configurável e relatórios.
- Registros de auditoria e dados JSON locais.

### Comandos Slash

| Comando | Para que serve |
|---|---|
| `/ajuda` | Lista os comandos e recursos. |
| `/ping` | Mostra latência e estado da conexão. |
| `/teste` | Verifica a resposta do bot no servidor. |
| `/vendas` | Publica ou atualiza a vitrine de produtos. |
| `/comprar` | Abre o fluxo de carrinho e compra. |
| `/pagamentos` | Abre o painel interativo de métodos e preços. |
| `/pagamentos teste` | Cria uma cobrança Pix **real** de R$ 0,10 e, após pagamento confirmado, entrega o cargo de teste. Não use como simulação gratuita. |
| `/loja status` | Consulta catálogo, automações e estoque. |
| `/loja publicar` | Publica/atualiza a vitrine. |
| `/loja automacao` | Liga ou pausa uma automação comercial. |
| `/loja cargo` | Associa um cargo Discord ao produto. |
| `/loja instrucoes`, `/loja imagem`, `/loja link-entrega`, `/loja estoque` | Configura entrega, mídia e disponibilidade de produto. |
| `/loja cupom-criar`, `/loja cupom-remover` | Administra cupons. A aplicação de desconto depende da automação correspondente estar ativa. |
| `/loja relatorio`, `/loja feedbacks` | Consulta vendas e avaliações. |
| `/pedido aprovar` | Registra manualmente um pedido como pago e tenta entregar o produto. Use só após confirmar o pagamento por fonte confiável. |
| `/pedido entregar` | Tenta novamente a entrega de um pedido já pago. |
| `/painel` | Cria/atualiza o painel administrativo privado no Discord. |
| `/parcerias`, `/cadastrar-parceria` | Lista e administra parcerias. |
| `/anuncios-fivem` | Administra os anúncios do canal FiveM. |
| `/status` | Mostra o estado do bot e das integrações. |
| `/logs` | Consulta ações administrativas recentes. |
| `/backup` | Baixa um snapshot JSON administrativo, sem tokens nem transcrições de tickets. |
| `/configurar ver` | Mostra canais e automações configurados. |
| `/configurar canal`, `/configurar automacao`, `/configurar mencoes`, `/configurar horarios`, `/configurar fuso`, `/configurar auditoria` | Administra canais, agendamentos e logs. |

Os comandos administrativos têm checagens de autorização próprias: alguns aceitam o dono do servidor, desenvolvedores configurados ou cargos administrativos; outros são restritos ao dono. Configure `BOT_DEVELOPER_IDS` e `BOT_ADMIN_ROLE_IDS` e confira a resposta de acesso de cada comando. A lista de produtos nas opções do Discord é formada pelos produtos ativos quando os comandos Slash são registrados.

As automações comerciais podem ser ativadas separadamente. Confirme cada status no painel; existir código para uma automação não significa que ela esteja ativa nem que os canais/cargos estejam configurados.

## Mercado Pago

A integração de compra usa Mercado Pago Pix e confirma os pedidos consultando a API a partir de webhooks assinados. O QR Code/copia e cola é gerado com o valor do pedido. Para ativar, configure no `.env`:

```dotenv
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=
MERCADO_PAGO_WEBHOOK_URL=https://SEU_HOST/api/webhooks/mercado-pago
```

O endereço de webhook precisa ser público, HTTPS e terminado em `/api/webhooks/mercado-pago`. Ative a automação Mercado Pago no painel e teste com as credenciais e cenários próprios do Mercado Pago antes de vender. O painel não deve ser usado como substituto da confirmação assinada do provedor; comprovantes enviados por compradores não confirmam pagamentos.

### Repasse ao sócio

Payouts para uma chave Pix é um fluxo financeiro distinto do checkout. O valor deverá ser calculado por uma regra explícita sobre pedidos pagos; cada repasse requer histórico persistente, chave idempotente, autorização administrativa e consulta do estado até a confirmação final. O Payouts do Mercado Pago pode exigir elegibilidade da conta, saldo disponível e, em produção, cadastro da chave pública de assinatura específica do produto. Nunca use o token de checkout ou a Public Key do painel como chave de assinatura de Payouts. A chave Pix do destinatário é dado sensível: configure-a somente no painel protegido, nunca em issue, commit ou chat.

> A existência da integração de checkout não habilita nem prova que Payouts esteja liberado na sua conta. Faça testes de Payouts separados e mantenha transferências reais desativadas até validar conta, assinatura, saldo, webhook e reconciliação.

O repasse ao sócio usa a porcentagem configurada sobre cada pedido confirmado como pago, antes das tarifas do provedor, com arredondamento para centavos por pedido. A automação vem desligada; a equipe precisa criar um repasse no painel e confirmar o envio explicitamente. O modo de teste é o padrão e limita o valor por transferência; credencial e elegibilidade de Payouts são independentes das credenciais de Checkout. A URL pública de notificação deve permanecer estável e apontar para `/api/webhooks/mercado-pago-payouts`.

## Configuração

| Variável | Uso |
|---|---|
| `DISCORD_TOKEN` | Token privado do bot. |
| `GEMINI_API_KEY` | IA dos tickets e Assistente do painel (opcional). |
| `API_KEY` | Bearer da API de anúncios e fallback de senha do painel. |
| `DASHBOARD_PASSWORD` | Senha dedicada ao painel (recomendado). |
| `API_HOST`, `API_PORT` | Endereço local e porta HTTP. |
| `DASHBOARD_PUBLIC_URL` | URL pública HTTPS de `/painel`, se houver. |
| `BOT_TIME_ZONE` | Fuso IANA, por padrão `America/Sao_Paulo`. |
| `BOT_DEVELOPER_IDS` | IDs de desenvolvedor adicionais separados por vírgulas. |
| `BOT_ADMIN_ROLE_IDS` | IDs de cargos que podem usar recursos administrativos. |
| `MERCADO_PAGO_ACCESS_TOKEN` | Access Token de servidor do Mercado Pago; nunca exponha no navegador. |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Segredo usado para verificar a assinatura de webhooks. |
| `MERCADO_PAGO_WEBHOOK_URL` | URL pública HTTPS configurada para notificações de pagamento. |

Veja [`.env.example`](.env.example) para os nomes e valores padrão, sem credenciais reais.

## Dados e recuperação

O estado persistente fica em `data/`; arquivos JSON são atualizados por gravação temporária e renomeação atômica. Arquivos de estado e logs locais são ignorados pelo Git. Faça cópias de segurança da pasta `data/`, assets próprios, `ModArmazem/`, `Wallpapers/` e do `.env` em armazenamento seguro. Não armazene backups do `.env` dentro do repositório.

O armazenamento JSON é adequado para uma única instância do bot. Não execute duas instâncias apontando para a mesma pasta de dados; não há bloqueio distribuído para múltiplos processos.

## Verificações de desenvolvimento

```powershell
npm run check
npm test
```

Os testes automatizados devem usar mocks e não publicar mensagens no Discord, cobrar clientes ou executar Payouts reais. Para validar a integração financeira, faça um roteiro manual com credenciais de teste e fixtures oficiais, sem usar uma chave ou conta de destinatário real.

## Estrutura

```text
src/
  api/          API HTTP, autenticação, webhook MP e painel web
  commands/     Definições e registro dos comandos Slash
  config/       IDs, produtos e validação do ambiente
  data/         Persistência JSON atômica
  events/       Eventos Discord
  features/     Comunidade, tickets, loja, pagamentos e automações
  process/      Supervisor do bot e do túnel
  repositories/ Acesso aos dados persistidos
  services/     Integrações e regras reutilizáveis
assets/store/   Imagens locais dos produtos
```

## Licenças e atribuições

Os ícones locais são do [Lucide](https://lucide.dev/), distribuídos sob licença ISC. As imagens comerciais e os arquivos de produto pertencem aos respectivos autores/proprietários.
