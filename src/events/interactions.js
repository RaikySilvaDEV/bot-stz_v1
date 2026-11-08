import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, PermissionsBitField
} from 'discord.js';
import { client } from '../client.js';
import { CARGO_VERIFICADO_ID, CARGO_STAFF_SUPORTE_ID } from '../config/constants.js';
import { getSettings, updateSettings } from '../repositories/settingsRepository.js';
import { getTicketPanelConfig } from '../repositories/ticketPanelRepository.js';
import { logAction } from '../services/audit.js';
import { archiveAndCloseTicket } from '../services/ticketClosure.js';
import { tratarInteracaoAdministracao } from '../features/administration.js';
import { tratarInteracaoParcerias } from '../features/partnerships.js';
import { tratarInteracaoAnunciosFiveM } from '../features/fivemAnnouncements.js';
import { tratarInteracaoPagamentos } from '../features/payments.js';
import { tratarInteracaoDashboard } from '../features/dashboard.js';
import { criarVitrineLoja, publicarSeletorProdutos, tratarInteracaoCompras } from '../features/commerce.js';
import { tratarAdminLoja } from '../features/commerceAdmin.js';
import { tratarInteracaoFeedback } from '../features/commerceFeedback.js';
import { tratarComandoIa } from '../features/assistantCommands.js';
import { iniciarAtendimentoAutomatico, iniciarAjudaCompraAutomatica } from '../features/tickets.js';
import { setUserLanguage } from '../repositories/userPreferencesRepository.js';
import { markTicketActivity } from '../repositories/ticketActivityRepository.js';

const ticketsEmCriacao = new Set();
let criandoCategoriaCompras = null;

function criarAjuda() {
    const embeds = [
        new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📚 Central de comandos')
            .setDescription([
                'Comandos disponíveis neste servidor. Os itens marcados como **Admin** exigem o dono ou um desenvolvedor autorizado.',
                '',
                '**Geral e comunidade**',
                '`/ajuda` — mostra esta lista completa.',
                '`/idioma idioma:<opção>` — escolhe Português (Brasil), English (US) ou Español para respostas da assistente.',
                '`/ping` — latência do bot e conexão com o Discord.',
                '`/teste` — confirma que o bot está respondendo.',
                '`/ia perguntar pergunta:<texto>` — consulta o assistente local.',
                '`/ia status` — mostra disponibilidade, modelo, fila e última resposta.',
                '`/ia ajuda` — mostra os comandos da IA.',
                '`/status` — estado do bot, API, integrações e automações. **Admin**',
                '`/painel` — cria/atualiza o painel no Discord e oferece acesso à web. **Admin**',
                '`/vendas` — mostra a vitrine de produtos.',
                '`/comprar` — inicia o carrinho/fluxo de compra.',
                '`/parcerias` — lista e gerencia parcerias. **Admin**',
                '`/cadastrar-parceria` — abre o formulário de cadastro. **Admin**',
                '`/anuncios-fivem` — abre o gerenciador de anúncios FiveM. **Admin**',
                '`/logs [quantidade]` — consulta até 30 ações administrativas. **Admin**',
                '`/backup` — baixa uma cópia dos dados administrativos. **Admin**'
            ].join('\n')),
        new EmbedBuilder()
            .setColor(0x22C55E)
            .setTitle('🛒 Loja e pedidos')
            .setDescription([
                '`/loja status` — vê produtos, estoque, cargos e automações.',
                '`/loja publicar` — publica/atualiza a vitrine no canal da loja.',
                '`/loja automacao tipo:<opção> ativa:<sim/não>` — liga ou pausa uma automação comercial.',
                '`/loja cargo produto:<produto> cargo:<cargo>` — configura o cargo entregue após pagamento.',
                '`/loja instrucoes produto:<produto> texto:<mensagem>` — define instruções de entrega por DM.',
                '`/loja imagem produto:<produto> url:<HTTPS>` — define imagem ou GIF do produto.',
                '`/loja link-entrega produto:<produto> url:<HTTPS>` — configura link de entrega digital.',
                '`/loja estoque produto:<produto> quantidade:<n>` — define estoque; `0` significa ilimitado.',
                '`/loja cupom-criar codigo:<código> desconto:<1–90> usos:<n> [validade-horas:<n>]` — cria cupom.',
                '`/loja cupom-remover codigo:<código>` — remove cupom.',
                '`/loja relatorio` — resume pedidos, pendências e faturamento registrado.',
                '`/loja feedbacks` — mostra as avaliações recentes.',
                '`/pedido aprovar id:<pedido>` — registra aprovação manual e tenta entregar.',
                '`/pedido entregar id:<pedido>` — reprocessa a entrega de pedido pago.',
                '',
                'Os comandos `/loja` e `/pedido` são administrativos. Ative integrações só depois de configurar credenciais, cargos e canais.'
            ].join('\n')),
        new EmbedBuilder()
            .setColor(0xF59E0B)
            .setTitle('⚙️ Configuração e pagamentos')
            .setDescription([
                '`/pagamentos` — abre o painel interativo para cadastrar, editar, ativar e remover métodos e configurar preços dos produtos. **Admin**',
                '`/pagamentos teste` — abre o fluxo de teste do Mercado Pago (gera cobrança real de R$ 0,10). **Admin**',
                '`/configurar ver` — mostra canais, horários, fuso e automações. **Admin**',
                '`/configurar canal tipo:<opção> canal:<canal/categoria>` — define destino ou categoria de um recurso. **Admin**',
                '`/configurar automacao tipo:<opção> ativa:<sim/não>` — liga ou pausa avisos, wallpapers, armazéns ou atendimento IA. **Admin**',
                '`/configurar mencoes ativa:<sim/não>` — controla menções automáticas @everyone. **Admin**',
                '`/configurar horarios horas:<lista>` — agenda avisos, por exemplo `9,12,18`. **Admin**',
                '`/configurar fuso zona:<IANA>` — define fuso, por exemplo `America/Sao_Paulo`. **Admin**',
                '`/configurar auditoria ativa:<sim/não> [canal:<canal>]` — controla os registros administrativos. **Admin**',
                '',
                'Nas opções `tipo`, use o seletor do Discord para ver todos os canais e automações aceitos.'
            ].join('\n')),
        new EmbedBuilder()
            .setColor(0x8B5CF6)
            .setTitle('🧭 Painel web e rotas')
            .setDescription([
                'Use `/painel` e clique em **Abrir painel web**. Faça login pela sessão segura gerada no Discord. As rotas de API do painel não são comandos slash.',
                '',
                '**Acesso e rotas principais do painel**',
                '`GET /painel` · interface web; `POST /api/painel/login` · login por senha; `POST /api/painel/login-ticket` · login pelo botão do Discord; `POST /api/painel/logout` · sair.',
                '`GET /api/painel/status` · visão geral e saúde.',
                '`GET /api/painel/config` · `PUT /api/painel/config` · canais, avisos, horários e painéis de ticket.',
                '`GET/POST /api/painel/channels` · `PATCH/DELETE /api/painel/channels/:id` · gerenciar canais.',
                '`GET /api/painel/roles` · cargos disponíveis; `POST /api/painel/tickets/publish` · publicar painéis de suporte e compra.',
                '`POST /api/painel/maintenance/announce` · publicar aviso de manutenção.',
                '`GET/POST /api/painel/announcements` · `PUT/DELETE /api/painel/announcements/:id` · avisos FiveM.',
                '`GET/POST/PUT /api/painel/scheduled-announcements` · `DELETE /api/painel/scheduled-announcements/:id` · avisos com canal, horários e imagem/GIF.',
                '`GET /api/painel/commerce` · `PUT /api/painel/commerce/storefront` · `POST /api/painel/commerce/products` · `PUT/PATCH/DELETE /api/painel/commerce/products/:value`.',
                '`POST /api/painel/commerce/coupons` · `DELETE /api/painel/commerce/coupons/:id` · cupons.',
                '`PATCH /api/painel/commerce/orders/:id` · aprovar ou reentregar pedido.',
                '`GET/POST /api/painel/payments` · `PUT/PATCH/DELETE /api/painel/payments/:id` · métodos de pagamento.',
                '`GET/PUT /api/painel/payments/mercado-pago` · credenciais e estado do Mercado Pago.',
                '`GET /api/painel/payouts` · `PUT /api/painel/payouts/secrets` · credenciais; `PUT /api/painel/payouts/settings` · regra/chave Pix; `POST /api/painel/payouts/drafts` · rascunho; `POST /api/painel/payouts/:id/send|reconcile` · envio/conciliação.',
                '`PATCH /api/painel/automations/:id` · estado de automações; `POST /api/painel/assistant` · assistente interno.',
                '`GET /painel/icons/:nome.svg` e `GET /painel/store-images/:arquivo` · ícones e imagens da interface.',
                '`GET /api/anuncios/fivem` · `POST /api/anuncios/fivem` · `GET/PUT/DELETE /api/anuncios/fivem/:id` (Bearer `API_KEY`).',
                '`POST /api/webhooks/mercado-pago` · notificações de pagamento; `POST /api/webhooks/mercado-pago-payouts` · notificações de repasse (assinaturas validadas).',
                '',
                'Os endpoints administrativos exigem sessão do painel e validação de origem. A API de anúncios exige `API_KEY`; o webhook exige configuração Mercado Pago. Uma rota configurada depende também de credenciais, permissões do Discord e canais válidos.'
            ].join('\n'))
    ];
    return { embeds, allowedMentions: { parse: [] } };
}

async function obterCategoriaCompras(guild) {
    let settings = getSettings();
    let configurada = settings.channels.purchaseCategory
        ? await guild.channels.fetch(settings.channels.purchaseCategory).catch(() => null)
        : null;
    if (configurada?.type !== ChannelType.GuildCategory && !criandoCategoriaCompras) {
        criandoCategoriaCompras = (async () => {
            const category = await guild.channels.create({ name: '🛒・compras', type: ChannelType.GuildCategory });
            settings = updateSettings({ channels: { purchaseCategory: category.id } });
            console.info(`[tickets] Categoria exclusiva de compras configurada: ${category.name} (${category.id}).`);
            return settings.channels.purchaseCategory;
        })().finally(() => { criandoCategoriaCompras = null; });
    }
    const categoryId = configurada?.type === ChannelType.GuildCategory ? configurada.id : await criandoCategoriaCompras;
    const supportCategoryId = settings.channels.supportCategory;
    if (supportCategoryId && categoryId !== supportCategoryId) {
        const purchaseTickets = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildText &&
            channel.parentId === supportCategoryId && channel.topic?.includes('ticket-type:compra'));
        for (const channel of purchaseTickets.values()) {
            await channel.setParent(categoryId, { lockPermissions: false });
            console.info(`[tickets] Ticket de compra movido para a categoria exclusiva: ${channel.name}.`);
        }
    }
    return categoryId;
}

async function criarTicketPrivado(interaction, type, selectedOption = null) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = interaction.guild;
    if (ticketsEmCriacao.has(interaction.user.id)) return interaction.editReply({ content: 'Seu canal está sendo aberto. Aguarde um instante.' });
    ticketsEmCriacao.add(interaction.user.id);
    try {
        await guild.channels.fetch();
        const settings = getSettings();
        const parentId = type === 'purchase' ? await obterCategoriaCompras(guild) : settings.channels.supportCategory;
        if (!parentId) throw new Error('Configure a categoria de atendimento no painel antes de abrir tickets.');
        const ticketType = type === 'purchase' ? 'compra' : 'suporte';
        const topic = `ticket-owner:${interaction.user.id};ticket-type:${ticketType}`;
        const existing = guild.channels.cache.find(channel => channel.parentId === parentId && channel.type === ChannelType.GuildText &&
            (channel.topic === topic || (type === 'support' && channel.topic === `ticket-owner:${interaction.user.id}`)));
        if (existing) {
            if (type === 'purchase') await publicarSeletorProdutos(existing).catch(error => console.error(`[loja:${existing.id}] Não foi possível publicar o carrinho:`, error));
            return interaction.editReply({ content: `Você já tem este canal aberto: ${existing}` });
        }
        const safeName = (interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || interaction.user.id).slice(0, 80);
        const channel = await guild.channels.create({
            name: `${ticketType}-${safeName}`.slice(0, 100), type: ChannelType.GuildText, parent: parentId, topic,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.AttachFiles] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                { id: CARGO_STAFF_SUPORTE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] }
            ]
        });
        if (type === 'purchase') {
            await publicarSeletorProdutos(channel);
            if (settings.automations.aiResponses) {
                void iniciarAjudaCompraAutomatica(channel, interaction.user.id);
            }
        } else {
            const ticketIntro = [
                `Cliente: <@${interaction.user.id}>`,
                `Assunto: **${selectedOption?.label ?? 'Atendimento geral'}**`,
                selectedOption?.description ?? '',
                settings.automations.aiResponses
                    ? 'A assistente virtual vai iniciar o atendimento automaticamente. Conte com detalhes o que você precisa.'
                    : 'A equipe responderá assim que possível.'
            ].filter(Boolean).join('\n');
            await channel.send({
                embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎫 Atendimento aberto')
                    .setDescription(ticketIntro)
                    .setTimestamp()],
                components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Fechar ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'))],
                allowedMentions: { users: [interaction.user.id] }
            });
            if (settings.automations.aiResponses) {
                void iniciarAtendimentoAutomatico(channel, interaction.user.id, selectedOption);
            }
        }
        await logAction(guild, interaction.user.id, type === 'purchase' ? 'Ticket de compra aberto' : 'Ticket de suporte aberto', `Canal ${channel.name}`);
        await interaction.editReply({ content: `✅ Canal criado com sucesso: ${channel}` });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 5000).unref?.();
    } finally {
        ticketsEmCriacao.delete(interaction.user.id);
    }
}

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.inGuild?.() && !interaction.user?.bot && interaction.channel?.type === ChannelType.GuildText && interaction.channel.topic?.includes('ticket-type:')) {
            markTicketActivity(interaction.channel.id);
        }
        if (await tratarComandoIa(interaction)) return;
        if (await tratarInteracaoAnunciosFiveM(interaction)) return;
        if (await tratarInteracaoAdministracao(interaction)) return;
        if (await tratarInteracaoParcerias(interaction)) return;
        if (await tratarInteracaoPagamentos(interaction)) return;
        if (await tratarInteracaoDashboard(interaction)) return;
        if (await tratarInteracaoFeedback(interaction)) return;
        if (await tratarAdminLoja(interaction)) return;
        if (await tratarInteracaoCompras(interaction)) return;
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'idioma') {
                const language = interaction.options.getString('idioma', true);
                setUserLanguage(interaction.user.id, language);
                const confirmations = {
                    'pt-BR': '✅ Seu idioma foi definido como **Português (Brasil)**. A assistente usará esse idioma nos seus próximos atendimentos.',
                    'en-US': '✅ Your language is now **English (US)**. The assistant will use it in your future support and purchase tickets.',
                    es: '✅ Tu idioma ahora es **Español**. La asistente lo usará en tus próximos tickets de soporte y compra.'
                };
                return interaction.reply({ content: confirmations[language] ?? confirmations['pt-BR'], flags: MessageFlags.Ephemeral });
            }
            if (interaction.commandName === 'ajuda') {
                return interaction.reply({ ...criarAjuda(), flags: MessageFlags.Ephemeral });
            }
            if (interaction.commandName === 'ping') {
                return interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    content: `🏓 Pong! Latência: ${client.ws.ping} ms.`
                });
            }
            if (interaction.commandName === 'teste') {
                return interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    content: `✅ Estou respondendo em **${interaction.guild?.name ?? 'este servidor'}**.`
                });
            }
            if (interaction.commandName === 'vendas') {
                return interaction.reply({ ...criarVitrineLoja(), flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Comando não reconhecido.' });
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket:select:support') {
            const selectedOption = getTicketPanelConfig().support.options.find(option => option.value === interaction.values[0]);
            if (!selectedOption) return interaction.reply({ content: 'Essa opção foi removida. Atualize o painel e tente novamente.', flags: MessageFlags.Ephemeral });
            return criarTicketPrivado(interaction, 'support', selectedOption);
        }

        if (!interaction.isButton()) return;

        if (interaction.customId === 'botao_verificar') {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const cargo = await interaction.guild.roles.fetch(CARGO_VERIFICADO_ID);
            if (!cargo) return interaction.reply({ content: 'O cargo de verificação não foi encontrado.', flags: MessageFlags.Ephemeral });
            if (member.roles.cache.has(cargo.id)) return interaction.reply({ content: '✅ Você já está verificado!', flags: MessageFlags.Ephemeral });
            if (interaction.guild.members.me.roles.highest.comparePositionTo(cargo) <= 0) {
                return interaction.reply({ content: 'O cargo do bot precisa ficar acima do cargo de verificado.', flags: MessageFlags.Ephemeral });
            }
            await member.roles.add(cargo);
            return interaction.reply({ content: '✅ Verificação concluída!', flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId === 'abrir_ticket') return criarTicketPrivado(interaction, 'support');
        if (interaction.customId === 'ticket:open:purchase') return criarTicketPrivado(interaction, 'purchase');

        if (interaction.customId === 'fechar_ticket') {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!member.roles.cache.has(CARGO_STAFF_SUPORTE_ID) && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: 'Apenas a equipe de suporte pode fechar este canal.', flags: MessageFlags.Ephemeral });
            }
            await interaction.reply({ content: '🔒 Fechando canal em 5 segundos...' });
            setTimeout(async () => {
                const ticket = interaction.channel;
                try {
                    await archiveAndCloseTicket(
                        interaction.guild, ticket, interaction.user.id, 'Ticket fechado pela equipe de suporte'
                    );
                } catch (error) {
                    console.error('[tickets] Falha ao salvar a transcrição ou fechar o ticket:', error);
                    await interaction.followUp({
                        content: 'Não consegui salvar a transcrição ou fechar o ticket; o canal foi mantido aberto. Tente fechar novamente mais tarde.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }
            }, 5000);
        }
    } catch (error) {
        console.error(`[interaction:${interaction.id}] Falha ao processar interação:`, error);
        const conteudo = 'Ocorreu um erro ao processar esta ação. Confira as permissões do bot e tente novamente.';
        if (interaction.deferred) await interaction.editReply({ content: conteudo }).catch(() => {});
        else if (interaction.replied) await interaction.followUp({ content: conteudo, flags: MessageFlags.Ephemeral }).catch(() => {});
        else await interaction.reply({ content: conteudo, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
});
