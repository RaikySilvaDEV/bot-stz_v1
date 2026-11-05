import { recordAudit } from '../repositories/auditRepository.js';
import { getSettings } from '../repositories/settingsRepository.js';

export async function logAction(guild, actorId, action, subject) {
    recordAudit({ actorId, action, subject });
    const channelId = getSettings().channels.audit;
    if (!channelId || !guild) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased()) {
        await channel.send({
            content: `🧾 **${action}** — <@${actorId}> — ${subject}`,
            allowedMentions: { users: [] }
        }).catch(error => console.warn('[logs] Não foi possível enviar o registro:', error));
    }
}
