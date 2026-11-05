# Community for FiveM Bot

Bot Discord em Node.js com suporte automatizado, tickets, verificação, anúncios FiveM, parcerias e rotinas de conteúdo.

## Preparar e iniciar

1. Instale Node.js 20 ou superior.
2. Copie `.env.example` para `.env` e preencha `DISCORD_TOKEN`, `GEMINI_API_KEY` e `API_KEY`.
3. No Discord Developer Portal, habilite **Server Members Intent** e **Message Content Intent**. Convide o bot com as permissões necessárias para gerenciar canais e cargos, ler histórico, enviar mensagens, anexar arquivos e usar comandos.
4. Execute `npm install` e depois `npm start`.

`GEMINI_API_KEY` pode ficar em branco; os tickets continuam abrindo e a equipe recebe aviso quando a resposta automática não estiver disponível. `API_KEY` pode ficar em branco para desativar a API local do Postman. O fuso padrão é `America/Sao_Paulo` e pode ser alterado por `BOT_TIME_ZONE`.

## Comandos

| Comando | Acesso | O que faz |
|---|---|---|
| `/ajuda`, `/ping`, `/teste` | Membros | Ajuda e diagnóstico rápido |
| `/vendas`, `/comprar` | Membros | Informações e links dos produtos |
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
| `/status`, `/logs`, `/backup` | Dono do servidor ou ID de proprietário configurado | Saúde do bot, ações administrativas e exportação de dados |

Os canais começam com os IDs padrão de `src/config/constants.js`. As alterações feitas com `/configurar` ficam em `data/bot-config.json` e sobrevivem a reinicializações.

## Dados e privacidade

- Configurações, parcerias, anúncios FiveM, logs e progresso das automações são gravados em arquivos JSON na pasta `data/`. Essa pasta é ignorada pelo Git; use `/backup` para baixar uma cópia dos dados administrativos.
- Os tickets podem usar Gemini para responder. O painel informa os membros e recomenda que não enviem senhas, tokens ou outros dados sensíveis. A IA pode ser pausada com `/configurar automacao`.
- Ao fechar um ticket, o bot guarda uma transcrição local por até 90 dias. Se um canal de auditoria for configurado, também envia a transcrição para esse canal; mantenha-o privado. O comando `/backup` não inclui transcrições.
- A API de anúncios FiveM escuta somente em `127.0.0.1`, exige `Authorization: Bearer <API_KEY>` e pode ser desativada omitindo `API_KEY`. As rotas existentes estão documentadas em [API-POSTMAN.md](API-POSTMAN.md).
- Nunca publique `.env`, tokens ou chaves. Se uma credencial for exposta, revogue-a no provedor e substitua-a localmente.

## Automação

Os avisos agendados mantêm os horários já configurados por padrão (05:00, 12:00 e 18:00). Wallpapers continuam às 12:00; o armazém consulta o intervalo de cinco horas e publica quando há arquivos para o item seguinte. Horários usam o fuso escolhido nas configurações. As rotinas podem ser pausadas sem remover os respectivos recursos.
