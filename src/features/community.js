import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { client } from '../client.js';
import { CANAL_PAINEL_PARCERIA_ANTIGO_ID } from '../config/constants.js';
import { getSaudacaoDinamica } from '../services/greetings.js';
import { getSettings } from '../repositories/settingsRepository.js';
client.on('guildMemberAdd', async (member) => {
    try {
        const canalBoasVindas = await member.guild.channels.fetch(getSettings().channels.welcome).catch(() => null);
        if (!canalBoasVindas || !canalBoasVindas.isTextBased()) return;

        const saudacao = getSaudacaoDinamica();
        const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 512 });

        const embed = new EmbedBuilder()
            .setColor(0x00FFCC)
            .setTitle(`✨ • BEM-VINDO(A) À COMMUNITY FOR FIVEM!`)
            .setDescription(`${saudacao} Olá <@${member.id}>, seja muito bem-vindo(a) ao nosso servidor!\n\n📋 **Próximo passo importante:**\nFaça a sua verificação aqui:\n👉 <#${getSettings().channels.verification}>`)
            .setThumbnail(avatarUrl)
            .setFooter({ text: `Membro nº ${member.guild.memberCount}` })
            .setTimestamp();

        await canalBoasVindas.send({
            content: `🎉 Olá <@${member.id}>! Seja bem-vindo(a)!`,
            embeds: [embed]
        });
    } catch (error) { console.error('[boas-vindas] Falha ao enviar mensagem:', error); }
});

export async function configurarCanalVerificacao() {
    try {
        const channel = await client.channels.fetch(getSettings().channels.verification).catch(() => null);
        if (!channel) return;
        const messages = await channel.messages.fetch({ limit: 10 });
        const existingMessage = messages.find(m => m.author.id === client.user.id && m.components.length > 0 && m.components[0].components.some(c => c.customId === 'botao_verificar'));
        const embed = new EmbedBuilder().setColor(0x00FF00).setTitle("✅ • VERIFICAÇÃO DE ACESSO").setDescription("Bem-vindo(a) à **Community for FiveM・**!\n\nClique no botão abaixo para se verificar.").setTimestamp();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('botao_verificar').setLabel('Verificar-se').setStyle(ButtonStyle.Success).setEmoji('✅'));
        if (!existingMessage) await channel.send({ embeds: [embed], components: [row] });
    } catch (error) { console.error('[verificação] Falha ao configurar painel:', error); }
}

export async function configurarPainelTickets() {
    try {
        const channelId = getSettings().channels.ticketPanel;
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel?.isTextBased()) {
            console.warn(`[tickets] Canal do painel não encontrado ou não é textual: ${channelId}`);
            return;
        }
        const messages = await channel.messages.fetch({ limit: 25 });
        const existing = messages.find(message => message.author.id === client.user.id &&
            message.components.some(row => row.components.some(component => component.customId === 'abrir_ticket')));
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎫 Atendimento e suporte')
            .setDescription('Precisa de ajuda? Clique no botão abaixo para abrir um atendimento privado com a equipe.')
            .setFooter({ text: 'Um canal privado será criado para você.' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('abrir_ticket').setLabel('Abrir ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
        );
        if (existing) await existing.edit({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
        else await channel.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
    } catch (error) {
        console.error('[tickets] Falha ao criar ou atualizar o painel:', error);
    }
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

