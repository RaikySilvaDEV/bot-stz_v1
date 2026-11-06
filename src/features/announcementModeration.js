import { PermissionsBitField } from 'discord.js';
import { CANAL_ANUNCIO_FIVE_M_ID } from '../config/constants.js';
import { logAction } from '../services/audit.js';

export const RESTRICTED_ANNOUNCEMENT_CHANNEL_ID =
    process.env.AUTO_BAN_ANNOUNCEMENT_CHANNEL_ID?.trim() || CANAL_ANUNCIO_FIVE_M_ID;

export function isRestrictedAnnouncementMessage(message) {
    return Boolean(
        message.guild &&
        message.channelId === RESTRICTED_ANNOUNCEMENT_CHANNEL_ID &&
        !message.author?.bot &&
        !message.webhookId
    );
}

export async function handleRestrictedAnnouncementMessage(message) {
    if (!isRestrictedAnnouncementMessage(message)) return false;

    const guild = message.guild;
    const memberPermissions = guild.members.me?.permissions;
    if (!memberPermissions?.has(PermissionsBitField.Flags.BanMembers)) {
        console.error('[anti-spam-anuncios] O bot não tem permissão para banir membros.');
        await logAction(guild, 'sistema', 'Falha no banimento automático',
            `Canal ${message.channelId}; autor ${message.author.id}; falta permissão BanMembers.`);
        return true;
    }

    try {
        await guild.members.ban(message.author.id, {
            reason: 'AutoMod: mensagem enviada em canal restrito de anúncios.',
            deleteMessageSeconds: 0
        });
        await message.delete().catch(error => {
            console.warn('[anti-spam-anuncios] O usuário foi banido, mas a mensagem não pôde ser apagada:', error.message);
        });
        await logAction(guild, 'sistema', 'Banimento automático por mensagem em anúncios',
            `Canal ${message.channelId}; autor ${message.author.id}; mensagem removida.`);
    } catch (error) {
        console.error('[anti-spam-anuncios] Não foi possível banir o autor da mensagem:', error.message);
        await logAction(guild, 'sistema', 'Falha no banimento automático',
            `Canal ${message.channelId}; autor ${message.author.id}; erro ${error.code ?? 'desconhecido'}.`);
    }
    return true;
}