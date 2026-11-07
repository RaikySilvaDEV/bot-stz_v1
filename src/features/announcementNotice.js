import { ChannelType } from 'discord.js';
import { client } from '../client.js';
import { CANAL_ANUNCIO_FIVE_M_ID, GUILD_ID } from '../config/constants.js';
import { getAnnouncementNoticeMessageId, saveAnnouncementNoticeMessageId } from '../repositories/announcementNoticeRepository.js';

export const ANNOUNCEMENT_NOTICE_TEXT = [
    '⛔ **Não envie mensagens neste canal.**',
    '',
    'Quem enviar mensagens aqui poderá receber banimento. Esta medida ajuda a conter self-bots que espalham spam pelos canais do servidor para tentar infectar outros usuários.'
].join('\n');

export function normalizeAnnouncementChannelName(name) {
    return String(name ?? '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g, '');
}

export function isAnnouncementTargetChannelName(name) {
    return normalizeAnnouncementChannelName(name).includes('armadilha');
}

export async function publicarAvisoCanalRestrito() {
    const guild = client.guilds.cache.get(GUILD_ID) ?? await client.guilds.fetch(GUILD_ID);
    const channels = await guild.channels.fetch();
    const targets = [...channels.values()].filter(channel =>
        channel &&
        [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type) &&
        isAnnouncementTargetChannelName(channel.name)
    );
    if (targets.length !== 1) {
        throw new Error(targets.length
            ? 'Há mais de um canal chamado armadilha; o aviso não foi enviado.'
            : 'Não encontrei um canal de texto chamado armadilha; o aviso não foi enviado.');
    }

    const channel = targets[0];
    const previousNotice = getAnnouncementNoticeMessageId();
    const previousChannelId = previousNotice?.channelId || CANAL_ANUNCIO_FIVE_M_ID;
    if (previousNotice && previousChannelId === channel.id) {
        const existing = await channel.messages.fetch(previousNotice.messageId).catch(() => null);
        if (existing) return false;
    }

    const message = await channel.send({ content: ANNOUNCEMENT_NOTICE_TEXT, allowedMentions: { parse: [] } });
    saveAnnouncementNoticeMessageId(channel.id, message.id);

    if (previousNotice && previousChannelId !== channel.id) {
        const previousChannel = await client.channels.fetch(previousChannelId).catch(() => null);
        const previousMessage = previousChannel?.isTextBased()
            ? await previousChannel.messages.fetch(previousNotice.messageId).catch(() => null)
            : null;
        if (previousMessage?.author.id === client.user.id && previousMessage.content === ANNOUNCEMENT_NOTICE_TEXT) {
            await previousMessage.delete().catch(error => {
                console.warn('[aviso-anuncios] O aviso antigo do próprio bot não pôde ser removido:', error.message);
            });
        }
    }

    console.log('[aviso-anuncios] Aviso publicado no canal armadilha.');
    return true;
}