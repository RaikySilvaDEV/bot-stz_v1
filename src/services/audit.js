import { EmbedBuilder } from 'discord.js';
import { recordAudit } from '../repositories/auditRepository.js';
import { getSettings } from '../repositories/settingsRepository.js';

export async function logRoleChange(guild, { member, role, action, status = 'Sucesso', orderId = null }) {
    const settings = getSettings();
    const channelId = settings.channels.roleLogs || settings.channels.audit;
    if (!guild || !channelId || !member || !role) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return;

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
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } })
        .catch(error => console.warn('[logs:cargos] Não foi possível enviar o registro:', error.message));
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
