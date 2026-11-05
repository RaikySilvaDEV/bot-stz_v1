# Dados do bot

Os arquivos desta pasta são o armazenamento local persistente do bot. O código que consulta ou altera esses dados fica em `src/repositories/`; leitura e gravação de JSON ficam centralizadas em `src/data/jsonStore.js`.

| Arquivo | Conteúdo |
|---|---|
| `bot-config.json` | Canais, automações, fuso horário e preferências |
| `parcerias.json` | Parcerias publicadas pelo bot |
| `anuncios_fivem.json` | Anúncios FiveM publicados e IDs das mensagens |
| `audit-log.json` | Até 1000 ações administrativas recentes |
| `notified-tickets.json` | Tickets já notificados pelo assistente |
| `wallpaper-state.json` | Próximo dia de wallpaper |
| `stock-state.json` | Índices e horários de envio dos armazéns |
| `transcripts/` | Transcrições de tickets, separadas dos registros JSON e com retenção local |

Use os repositórios em `src/repositories/` para alterar dados; não grave JSON diretamente em comandos ou eventos. A camada comum valida o caminho, cria a pasta e grava em arquivo temporário antes de substituir o JSON final. Estados antigos na raiz do projeto são migrados para cá na primeira leitura.

Esses arquivos não devem conter tokens, chaves de API ou outras credenciais. Credenciais ficam no `.env`.
