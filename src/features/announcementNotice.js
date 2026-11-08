import { ChannelType } from 'discord.js';
import { client } from '../client.js';
import { CANAL_ANUNCIO_FIVE_M_ID, CANAL_ARMADILHA_ID } from '../config/constants.js';
import { getAnnouncementNoticeMessageId, saveAnnouncementNoticeMessageId } from '../repositories/announcementNoticeRepository.js';
import { getBotAnnouncements } from '../repositories/botAnnouncementsRepository.js';

export async function publicarAvisoCanalRestrito() {
    const channel = await client.channels.fetch(CANAL_ARMADILHA_ID).catch(() => null);
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
        throw new Error('Canal de texto dentro da categoria armadilha não encontrado ou indisponível.');
    }
    const previousNotice = getAnnouncementNoticeMessageId();
    const previousChannelId = previousNotice?.channelId || CANAL_ANUNCIO_FIVE_M_ID;
    const noticeText = getBotAnnouncements().restrictedChannel;
    if (previousNotice && previousChannelId === channel.id) {
        const existing = await channel.messages.fetch(previousNotice.messageId).catch(() => null);
        if (existing?.author.id === client.user.id) {
            if (existing.content !== noticeText) await existing.edit({ content: noticeText, allowedMentions: { parse: [] } });
            return false;
        }
    }

    const message = await channel.send({ content: noticeText, allowedMentions: { parse: [] } });
    saveAnnouncementNoticeMessageId(channel.id, message.id);

    if (previousNotice && previousChannelId !== channel.id) {
        const previousChannel = await client.channels.fetch(previousChannelId).catch(() => null);
        const previousMessage = previousChannel?.isTextBased()
            ? await previousChannel.messages.fetch(previousNotice.messageId).catch(() => null)
            : null;
        if (previousMessage?.author.id === client.user.id) {
            await previousMessage.delete().catch(error => {
                console.warn('[aviso-anuncios] O aviso antigo do próprio bot não pôde ser removido:', error.message);
            });
        }
    }

    console.log('[aviso-anuncios] Aviso publicado no canal armadilha.');
    return true;
}
