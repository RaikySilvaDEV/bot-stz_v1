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
| `automation-message-ids.json` | IDs das mensagens que as automações atualizam |
| `ticket-transcript-messages.json` | Referências às transcrições no Discord para aplicar retenção |
| `metodos-pagamento.json` | Métodos da loja, estado ativo/inativo e referência ao canal público; a chave Pix fica apenas neste arquivo local ignorado pelo Git |
| `catalogo-loja.json` | Preços personalizados dos produtos configurados pelo painel `/pagamentos`; sem preço personalizado, usa os valores padrão do catálogo |
| `orders.json` | Histórico local dos últimos 5000 pedidos iniciados e status de confirmação manual |
| `feedbacks.json` | Avaliações pós-compra, comentários e data de envio |
| `comercio-config.json` | Recursos comerciais, cargos, estoque, imagens, instruções de entrega e cupons; todas as novas automações começam desligadas |
| `assets/store/` | Imagens dos produtos e banner de cargos exibido junto ao seletor nos tickets |
| `bot-dashboard.json` | Referência ao canal e à mensagem do painel privado do bot |
| `transcripts/` | Transcrições de tickets, separadas dos registros JSON e com retenção local |

Use os repositórios em `src/repositories/` para alterar dados; não grave JSON diretamente em comandos ou eventos. A camada comum valida o caminho, cria a pasta e grava em arquivo temporário antes de substituir o JSON final. Estados antigos na raiz do projeto são migrados para cá na primeira leitura.

Tokens e chaves de API ficam no `.env`. A chave Pix é guardada somente em `metodos-pagamento.json`, arquivo local ignorado pelo Git; não compartilhe nem publique esse arquivo.
