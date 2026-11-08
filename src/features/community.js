import { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import fs from 'node:fs';
import { client } from '../client.js';
import { CANAL_PAINEL_PARCERIA_ANTIGO_ID, PATHS } from '../config/constants.js';
import { getSaudacaoDinamica } from '../services/greetings.js';
import { getSettings } from '../repositories/settingsRepository.js';
import { getTicketPanelConfig } from '../repositories/ticketPanelRepository.js';
import { getBotAnnouncements } from '../repositories/botAnnouncementsRepository.js';
client.on('guildMemberAdd', async (member) => {
    try {
        const canalBoasVindas = await member.guild.channels.fetch(getSettings().channels.welcome).catch(() => null);
        if (!canalBoasVindas || !canalBoasVindas.isTextBased()) return;

        const saudacao = getSaudacaoDinamica();
        const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 512 });

        const announcements = getBotAnnouncements();
        const verification = getSettings().channels.verification ? `<#${getSettings().channels.verification}>` : 'o canal de verificação';
        const replace = (value) => value.replace(/\{([a-z_]+)\}/gi, (token, key) => ({ saudacao, membro: `<@${member.id}>`, canal_verificacao: verification, member_count: String(member.guild.memberCount) })[key] ?? token);
        const embed = new EmbedBuilder()
            .setColor(0x00FFCC)
            .setTitle(replace(announcements.welcomeTitle))
            .setDescription(replace(announcements.welcomeDescription))
            .setThumbnail(avatarUrl)
            .setFooter({ text: `Membro nº ${member.guild.memberCount}` })
            .setTimestamp();

        const payload = {
            content: replace(announcements.welcomeContent),
            embeds: [embed]
        };
        if (fs.existsSync(PATHS.welcomeImage)) {
            const imageName = 'Bem-Vindo.png';
            embed.setImage(`attachment://${imageName}`);
            payload.files = [new AttachmentBuilder(PATHS.welcomeImage, { name: imageName })];
        } else {
            console.warn(`[boas-vindas] Imagem não encontrada: ${PATHS.welcomeImage}`);
        }
        await canalBoasVindas.send(payload);
    } catch (error) { console.error('[boas-vindas] Falha ao enviar mensagem:', error); }
});

export async function configurarCanalVerificacao() {
    try {
        const channel = await client.channels.fetch(getSettings().channels.verification).catch(() => null);
        if (!channel) return;
        const messages = await channel.messages.fetch({ limit: 10 });
        const existingMessage = messages.find(m => m.author.id === client.user.id && m.components.length > 0 && m.components[0].components.some(c => c.customId === 'botao_verificar'));
        const announcements = getBotAnnouncements();
        const embed = new EmbedBuilder().setColor(0x00FF00).setTitle(announcements.verificationTitle).setDescription(announcements.verificationDescription).setTimestamp();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('botao_verificar').setLabel('Verificar-se').setStyle(ButtonStyle.Success).setEmoji('✅'));
        const payload = { embeds: [embed], components: [row] };
        if (existingMessage) await existingMessage.edit(payload);
        else await channel.send(payload);
    } catch (error) { console.error('[verificação] Falha ao configurar painel:', error); }
}

export async function configurarPainelTickets() {
    try {
        const settings = getSettings();
        const config = getTicketPanelConfig();
        const publish = async (channelId, type) => {
            const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
            if (!channel?.isTextBased()) {
                console.warn(`[tickets] Canal do painel ${type} não encontrado ou não é textual: ${channelId ?? 'não configurado'}`);
                return;
            }
            const messages = await channel.messages.fetch({ limit: 25 }).catch(() => []);
            const customId = type === 'support' ? 'ticket:select:support' : 'ticket:open:purchase';
            const existing = messages.find(message => message.author.id === client.user.id &&
                message.components.some(row => row.components.some(component => component.customId === customId || (type === 'support' && component.customId === 'abrir_ticket'))));
            const panel = config[type];
            const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`🎫 ${panel.title}`).setDescription(panel.description)
                .setFooter({ text: type === 'support' ? 'Um canal privado será criado para você.' : 'Seu carrinho será aberto em um canal privado.' });
            const component = type === 'support'
                ? new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId)
                    .setPlaceholder(panel.placeholder).addOptions(panel.options.map(option => ({
                        label: option.label, value: option.value, description: option.description || undefined,
                        ...(option.emoji ? { emoji: option.emoji } : {})
                    }))))
                : new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(customId)
                    .setLabel('Abrir carrinho').setStyle(ButtonStyle.Success).setEmoji('🛒'));
            const payload = { embeds: [embed], components: [component], allowedMentions: { parse: [] } };
            if (existing) await existing.edit(payload);
            else await channel.send(payload);
            return true;
        };
        const support = await publish(settings.channels.ticketPanel, 'support');
        const purchase = await publish(settings.channels.purchasePanel, 'purchase');
        return { support, purchase };
    } catch (error) {
        console.error('[tickets] Falha ao criar ou atualizar o painel:', error);
        return { support: false, purchase: false, error: error.message };
    }
}

export async function publicarAvisoManutencao() {
    const settings = getSettings();
    const channelId = settings.channels.supportNotices;
    const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
    if (!channel?.isTextBased()) return { ok: false, reason: 'Configure um canal de avisos válido no painel web.' };
    const announcements = getBotAnnouncements();
    const embed = new EmbedBuilder().setColor(0xF1C40F).setTitle(`🛠️ ${announcements.maintenanceTitle}`)
        .setDescription(announcements.maintenanceMessage).setTimestamp();
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    return { ok: true, channelId: channel.id };
}

export async function removerPainelParceriaAntigo() {
    try {
        const channel = await client.channels.fetch(CANAL_PAINEL_PARCERIA_ANTIGO_ID).catch(() => null);
        if (!channel) return;
        const messages = await channel.messages.fetch({ limit: 50 });
        const oldPanels = messages.filter(message => message.author.id === client.user.id && message.components.some(row => row.components.some(component => component.customId === 'abrir_parceria')));
        for (const message of oldPanels.values()) await message.delete().catch(() => {});
    } catch (error) { console.error('[parceria] Falha ao remover painel antigo:', error); }
}

