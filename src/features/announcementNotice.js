import { ChannelType } from 'discord.js';
import { client } from '../client.js';
import { CANAL_ANUNCIO_FIVE_M_ID } from '../config/constants.js';
import { getAnnouncementNoticeMessageId, saveAnnouncementNoticeMessageId } from '../repositories/announcementNoticeRepository.js';

export const ANNOUNCEMENT_NOTICE_TEXT = [
    '⛔ **Não envie mensagens neste canal.**',
    '',
    'Quem enviar mensagens aqui poderá receber banimento. Esta medida ajuda a conter self-bots que espalham spam pelos canais do servidor para tentar infectar outros usuários.'
].join('\n');

export async function publicarAvisoCanalRestrito() {
    const channel = await client.channels.fetch(CANAL_ANUNCIO_FIVE_M_ID).catch(() => null);
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
        throw new Error('Canal de anúncios configurado não foi encontrado ou não aceita mensagens.');
    }

    const savedMessageId = getAnnouncementNoticeMessageId();
    if (savedMessageId && await channel.messages.fetch(savedMessageId).catch(() => null)) return false;

    const message = await channel.send({ content: ANNOUNCEMENT_NOTICE_TEXT, allowedMentions: { parse: [] } });
    saveAnnouncementNoticeMessageId(message.id);
    console.log('[aviso-anuncios] Aviso publicado no canal configurado.');
    return true;
}