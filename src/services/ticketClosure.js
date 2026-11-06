import { logAction } from './audit.js';
import { rememberRemoteTranscript, saveTicketTranscript } from './transcripts.js';
import { getSettings } from '../repositories/settingsRepository.js';

export async function archiveAndCloseTicket(guild, ticket, actorId, reason) {
    const transcriptPath = await saveTicketTranscript(ticket);

    await logAction(guild, actorId, 'Ticket fechado', `Canal ${ticket.name}; transcrição ${ticket.id}.txt`);
    const logChannelId = getSettings().channels.audit;
    if (logChannelId) {
        const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
        if (logChannel?.isTextBased()) {
            const transcriptMessage = await logChannel.send({
                content: `📄 Transcrição do ticket **${ticket.name}**.`,
                files: [transcriptPath]
            }).catch(error => {
                console.error('[tickets] Não foi possível enviar a transcrição ao canal de logs:', error);
                return null;
            });
            if (transcriptMessage) {
                try {
                    rememberRemoteTranscript({ guildId: guild.id, channelId: logChannel.id, messageId: transcriptMessage.id });
                } catch (error) {
                    await transcriptMessage.delete().catch(() => {});
                    console.error('[tickets] Não foi possível registrar a retenção da transcrição remota:', error);
                }
            }
        }
    }

    await ticket.delete(reason);
}
