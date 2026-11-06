import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { client } from '../client.js';
import { getFeedback, getFeedbackByOrderId, saveFeedback, updateFeedback } from '../repositories/feedbackRepository.js';
import { getOrderById, getOrders } from '../repositories/orderRepository.js';
import { getSettings } from '../repositories/settingsRepository.js';
import { archiveAndCloseTicket } from '../services/ticketClosure.js';

const feedbackInProgress = new Set();
let recoveryTimer;

export async function sendPurchaseFeedbackPrompt(user, order) {
    const rows = [new ActionRowBuilder().addComponents([1, 2, 3, 4, 5].map(rating =>
        new ButtonBuilder().setCustomId(`feedback:rate:${order.id}:${rating}`).setLabel(String(rating)).setStyle(rating >= 4 ? ButtonStyle.Success : ButtonStyle.Secondary)
    ))];
    const guild = client.guilds.cache.get(order.guildId) ?? await client.guilds.fetch(order.guildId);
    const ticket = await guild.channels.fetch(order.channelId).catch(() => null);
    const isBuyerTicket = ticket?.type === ChannelType.GuildText && ticket.topic === `ticket-owner:${order.buyerId}`;
    const content = `✅ Pagamento confirmado e cargo liberado! Como foi sua compra de **${order.productName}**? Avalie de 1 a 5 e, se quiser, deixe um comentário. Após enviar a avaliação, este ticket será fechado automaticamente.`;
    if (isBuyerTicket) {
        await ticket.send({ content, components: rows, allowedMentions: { parse: [] } });
        return;
    }
    await user.send({
        content: `Como foi sua compra de **${order.productName}**? Avalie de 1 a 5 e, se quiser, deixe um comentário.`,
        components: rows
    });
}

async function publishFeedback(feedback, order) {
    if (feedback.publicMessageId) return true;
    const guild = client.guilds.cache.get(order.guildId) ?? await client.guilds.fetch(order.guildId);
    const feedbackChannelId = getSettings().channels.feedback;
    const feedbackChannel = feedbackChannelId ? await guild.channels.fetch(feedbackChannelId).catch(() => null) : null;
    if (!feedbackChannel?.isTextBased()) throw new Error('Canal de avaliações não configurado ou indisponível.');

    const embed = new EmbedBuilder()
        .setColor(feedback.rating >= 4 ? 0x2ECC71 : 0xF1C40F)
        .setTitle(`Avaliação da compra · ${'⭐'.repeat(feedback.rating)} (${feedback.rating}/5)`)
        .addFields(
            { name: 'Produto', value: order.productName, inline: true },
            { name: 'Cliente', value: `<@${feedback.buyerId}>`, inline: true }
        )
        .setFooter({ text: `Pedido ${order.id.slice(0, 8)}` })
        .setTimestamp(new Date(feedback.createdAt));
    if (feedback.comment) embed.setDescription(feedback.comment);

    const message = await feedbackChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    const updated = updateFeedback(order.id, { publicMessageId: message.id, feedbackChannelId: feedbackChannel.id });
    if (!updated) throw new Error('Avaliação publicada, mas não foi possível salvar a referência da mensagem.');
    return true;
}

async function closeOrderTicket(feedback, order) {
    if (feedback.ticketClosedAt || feedback.ticketCloseSkippedAt) return;
    const guild = client.guilds.cache.get(order.guildId) ?? await client.guilds.fetch(order.guildId);
    const ticket = await guild.channels.fetch(order.channelId).catch(() => null);
    if (!ticket) {
        updateFeedback(order.id, { ticketClosedAt: new Date().toISOString() });
        return;
    }
    if (ticket.type !== ChannelType.GuildText || ticket.topic !== `ticket-owner:${feedback.buyerId}`) {
        updateFeedback(order.id, { ticketCloseSkippedAt: new Date().toISOString() });
        console.warn(`[feedback:${order.id}] Pedido não foi criado em um ticket do comprador; canal não será fechado.`);
        return;
    }
    try {
        await ticket.send('✅ Avaliação publicada. Este ticket será fechado automaticamente em 5 segundos.');
        await new Promise(resolve => setTimeout(resolve, 5000));
        await archiveAndCloseTicket(guild, ticket, feedback.buyerId, `Ticket fechado após avaliação do pedido ${order.id}`);
        updateFeedback(order.id, { ticketClosedAt: new Date().toISOString() });
    } catch (error) {
        console.error(`[feedback:${order.id}] Avaliação publicada, mas não foi possível fechar o ticket:`, error);
        throw error;
    }
}

async function completeFeedback(feedback, order) {
    if (feedbackInProgress.has(order.id)) return;
    feedbackInProgress.add(order.id);
    try {
        await publishFeedback(feedback, order);
        await closeOrderTicket(getFeedbackByOrderId(order.id), order);
    } finally {
        feedbackInProgress.delete(order.id);
    }
}

async function recoverPendingFeedback() {
    for (const feedback of getFeedback()) {
        if (feedback.publicMessageId && (feedback.ticketClosedAt || feedback.ticketCloseSkippedAt)) continue;
        const order = getOrders().find(item => item.id === feedback.orderId);
        if (!order) {
            console.error(`[feedback:${feedback.orderId}] Pedido da avaliação não encontrado; não foi possível publicá-la.`);
            continue;
        }
        try {
            await completeFeedback(feedback, order);
        } catch (error) {
            console.error(`[feedback:${feedback.orderId}] Falha ao concluir avaliação pendente; nova tentativa será feita:`, error.message);
        }
    }
}

export function startFeedbackRecovery() {
    if (recoveryTimer) return;
    void recoverPendingFeedback();
    recoveryTimer = setInterval(() => void recoverPendingFeedback(), 60_000);
    recoveryTimer.unref?.();
}

export async function tratarInteracaoFeedback(interaction) {
    const isButton = interaction.isButton() && interaction.customId.startsWith('feedback:rate:');
    const isModal = interaction.isModalSubmit() && interaction.customId.startsWith('feedback:submit:');
    if (!isButton && !isModal) return false;
    if (isButton) {
        const [, , id, ratingRaw] = interaction.customId.split(':');
        const rating = Number(ratingRaw);
        const order = getOrderById(id);
        if (!order || order.buyerId !== interaction.user.id || !order.paidAt || !Number.isInteger(rating) || rating < 1 || rating > 5) {
            await interaction.reply({ content: 'Não encontrei uma compra paga válida para essa avaliação.', flags: MessageFlags.Ephemeral });
            return true;
        }
        const modal = new ModalBuilder().setCustomId(`feedback:submit:${order.id}:${rating}`).setTitle('Avaliar sua compra')
            .addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('comment').setLabel('Comentário (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000)
            ));
        await interaction.showModal(modal);
        return true;
    }
    const [, , orderId, ratingRaw] = interaction.customId.split(':');
    const order = getOrderById(orderId);
    const rating = Number(ratingRaw);
    if (!order || order.buyerId !== interaction.user.id || !order.paidAt || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        await interaction.reply({ content: 'Não encontrei uma compra paga válida para essa avaliação.', flags: MessageFlags.Ephemeral });
        return true;
    }
    const saved = saveFeedback({
        orderId: order.id, buyerId: interaction.user.id, rating,
        comment: interaction.fields.getTextInputValue('comment')
    });
    const feedback = saved ?? getFeedbackByOrderId(order.id);
    if (!feedback) throw new Error(`Não foi possível carregar a avaliação do pedido ${order.id}.`);
    try {
        await publishFeedback(feedback, order);
        await interaction.reply({
            content: 'Obrigado! Sua avaliação foi publicada no canal de avaliações. O ticket será fechado automaticamente.',
            flags: MessageFlags.Ephemeral
        });
        void closeOrderTicket(getFeedbackByOrderId(order.id), order).catch(error => {
            console.error(`[feedback:${order.id}] Falha ao fechar ticket após avaliação:`, error.message);
        });
    } catch (error) {
        console.error(`[feedback:${order.id}] Não foi possível publicar a avaliação:`, error);
        await interaction.reply({
            content: 'Sua avaliação foi salva, mas não consegui publicá-la ou fechar o ticket. A equipe foi notificada e o bot tentará novamente automaticamente.',
            flags: MessageFlags.Ephemeral
        });
    }
    return true;
}
