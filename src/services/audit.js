import { EmbedBuilder } from 'discord.js';
import { recordAudit } from '../repositories/auditRepository.js';
import { getSettings } from '../repositories/settingsRepository.js';

async function findLogChannel(guild, configuredId, fallbackName) {
    if (!guild) return null;
    const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
    if (configuredId) {
        const channel = channels.get(configuredId);
        if (channel?.isTextBased()) return channel;
    }
    return channels.find(channel => channel?.isTextBased() && channel.name === fallbackName) ?? null;
}

function formatDateTime(value, timezone) {
    if (!value || !Number.isFinite(Date.parse(value))) return 'Indisponível';
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: timezone || 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short'
    }).format(new Date(value));
}

export async function logRoleChange(guild, { member, role, action, status = 'Sucesso', orderId = null, paidAt = null, expiresAt = null }) {
    const settings = getSettings();
    if (!guild || !member || !role) return false;
    const channel = await findLogChannel(guild, settings.channels.roleLogs, 'registros-de-cargos') ??
        await findLogChannel(guild, settings.channels.audit, null);
    if (!channel) return false;

    const customerName = member.displayName || member.user.globalName || member.user.username;
    const embed = new EmbedBuilder()
        .setColor(status === 'Sucesso' ? 0x2ecc71 : 0xe74c3c)
        .setTitle(action === 'removal' ? 'Registro de Remoção de Cargo' : 'Registro de Atribuição de Cargo')
        .addFields(
            { name: '👤 Cliente', value: `**${customerName}**\n${member.user.tag}\n<@${member.id}>`, inline: false },
            { name: '🛂 Cargo', value: `<@&${role.id}>`, inline: true },
            { name: action === 'removal' ? '🔎 Status da Remoção' : '🔎 Status da Atribuição', value: status, inline: true }
        )
        .setTimestamp();
    if (orderId) embed.addFields({ name: '🧾 Pedido', value: `\`${orderId}\``, inline: false });
    if (paidAt) embed.addFields({ name: '📅 Compra em', value: formatDateTime(paidAt, settings.timezone), inline: true });
    if (expiresAt) embed.addFields({ name: '⏳ Cargo expira em', value: formatDateTime(expiresAt, settings.timezone), inline: true });
    try {
        await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        return true;
    } catch (error) {
        console.warn('[logs:cargos] Não foi possível enviar o registro:', error.message);
        return false;
    }
}

export async function logSale(guild, order) {
    if (!guild || !order) return false;
    const settings = getSettings();
    const channel = await findLogChannel(guild, settings.channels.salesLogs, 'registros-de-vendas');
    if (!channel) return false;
    const member = await guild.members.fetch(order.buyerId).catch(() => null);
    const name = member?.displayName || member?.user?.globalName || member?.user?.username || 'Cliente';
    const format = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
    const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('Registro de Venda')
        .addFields(
            { name: '👤 Cliente', value: `**${name}**\n${member?.user?.tag ?? 'Usuário'}\n<@${order.buyerId}>`, inline: false },
            { name: '📦 Produto', value: String(order.productName ?? 'Produto').slice(0, 1024), inline: true },
            { name: '🛂 Cargos liberados', value: (order.deliveryRoleIds?.length ? order.deliveryRoleIds : [order.deliveryRoleId].filter(Boolean)).map(roleId => `<@&${roleId}>`).join(' + ') || 'Não identificado', inline: true },
            { name: '💰 Valor bruto', value: format(order.amountCents), inline: true },
            { name: '📉 Taxa Mercado Pago', value: Number.isSafeInteger(order.feeAmountCents) ? format(order.feeAmountCents) : 'Indisponível', inline: true },
            { name: '💵 Líquido recebido', value: Number.isSafeInteger(order.netAmountCents) ? format(order.netAmountCents) : 'Indisponível', inline: true },
            { name: '📅 Compra em', value: formatDateTime(order.paidAt, settings.timezone), inline: true },
            { name: '⏳ Cargo expira em', value: formatDateTime(order.entitlementExpiresAt, settings.timezone), inline: true },
            { name: '✅ Status', value: 'Pago e entregue', inline: true },
            { name: '🧾 Pedido', value: `\`${String(order.id).slice(0, 100)}\``, inline: false }
        )
        .setTimestamp(order.paidAt ? new Date(order.paidAt) : new Date());
    try {
        await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        return true;
    } catch (error) {
        console.warn('[logs:vendas] Não foi possível enviar o registro:', error.message);
        return false;
    }
}

export async function logAction(guild, actorId, action, subject) {
    try {
        recordAudit({ actorId, action, subject });
    } catch (error) {
        console.error('[logs] Não foi possível gravar a ação no JSON local:', error);
    }
    const channelId = getSettings().channels.audit;
    if (!channelId || !guild) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased()) {
        const actor = /^\d{17,20}$/.test(String(actorId)) ? `<@${actorId}>` : String(actorId || 'sistema');
        await channel.send({
            content: `🧾 **${action}** — ${actor} — ${subject}`,
            allowedMentions: { users: [] }
        }).catch(error => console.warn('[logs] Não foi possível enviar o registro:', error));
    }
}
