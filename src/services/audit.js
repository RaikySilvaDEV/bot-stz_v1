import { recordAudit } from '../repositories/auditRepository.js';
import { getSettings } from '../repositories/settingsRepository.js';

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
