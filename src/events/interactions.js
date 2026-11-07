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

const ticketsEmCriacao = new Set();
let criandoCategoriaCompras = null;

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
        } else {
            await channel.send({
                embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎫 Atendimento aberto')
                    .setDescription(`Cliente: <@${interaction.user.id}>\nAssunto: **${selectedOption?.label ?? 'Atendimento geral'}**\n\n${selectedOption?.description ?? 'A equipe responderá assim que possível.'}`)
                    .setTimestamp()],
                components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Fechar ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'))],
                allowedMentions: { users: [interaction.user.id] }
            });
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
        if (await tratarInteracaoAnunciosFiveM(interaction)) return;
        if (await tratarInteracaoAdministracao(interaction)) return;
        if (await tratarInteracaoParcerias(interaction)) return;
        if (await tratarInteracaoPagamentos(interaction)) return;
        if (await tratarInteracaoDashboard(interaction)) return;
        if (await tratarInteracaoFeedback(interaction)) return;
        if (await tratarAdminLoja(interaction)) return;
        if (await tratarInteracaoCompras(interaction)) return;
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'ajuda') {
                return interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    content: [
                        '**Comandos disponíveis**',
                        '`/ajuda` — mostra esta lista.',
                        '`/ping` — mostra a latência do bot.',
                        '`/teste` — verifica se o bot está respondendo.',
                        '`/vendas` — mostra os produtos disponíveis para compra.',
                        '`/comprar` — abre a loja com Pix Mercado Pago e entrega automática após confirmação.',
                        '`/pagamentos` — gerencia os métodos de pagamento da loja.',
                        '`/painel` — abre o painel privado de status e controle do bot.',
                        '`/parcerias` — gerencia parcerias (somente donos).',
                        '`/cadastrar-parceria` — abre o cadastro rápido de parceria (somente donos).',
                        '`/anuncios-fivem` — administra anúncios (somente donos).',
                        '`/configurar` — configura canais e automações (somente donos).',
                        '`/status` e `/logs` — estado do bot e registro administrativo.',
                        '`/backup` — baixa uma cópia dos dados administrativos (somente donos).',
                        '',
                        'Os painéis do servidor também oferecem verificação, abertura de tickets e carrinho de compras.'
                    ].join('\n')
                });
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
