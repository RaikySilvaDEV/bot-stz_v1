import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { client } from '../client.js';
import { CANAL_BOAS_VINDAS_ID, CANAL_VERIFICACAO_ID, CANAL_PAINEL_PARCERIA_ID } from '../config/constants.js';
import { getSaudacaoDinamica } from '../services/state.js';
client.on('guildMemberAdd', async (member) => {
    try {
        const canalBoasVindas = await member.guild.channels.fetch(CANAL_BOAS_VINDAS_ID).catch(() => null);
        if (!canalBoasVindas || !canalBoasVindas.isTextBased()) return;

        const saudacao = getSaudacaoDinamica();
        const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 512 });

        const embed = new EmbedBuilder()
            .setColor(0x00FFCC)
            .setTitle(`✨ • BEM-VINDO(A) À COMMUNITY FOR FIVEM!`)
            .setDescription(`${saudacao} Olá <@${member.id}>, seja muito bem-vindo(a) ao nosso servidor!\n\n📋 **Próximo passo importante:**\nFaça a sua verificação aqui:\n👉 https://discord.com/channels/1528983705673273466/1547204424244658216`)
            .setThumbnail(avatarUrl)
            .setFooter({ text: `Membro nº ${member.guild.memberCount}` })
            .setTimestamp();

        await canalBoasVindas.send({
            content: `🎉 Olá <@${member.id}>! Seja bem-vindo(a)!`,
            embeds: [embed]
        });
    } catch (e) {}
});

export async function configurarCanalVerificacao() {
    try {
        const channel = await client.channels.fetch(CANAL_VERIFICACAO_ID).catch(() => null);
        if (!channel) return;
        const messages = await channel.messages.fetch({ limit: 10 });
        const existingMessage = messages.find(m => m.author.id === client.user.id && m.components.length > 0 && m.components[0].components.some(c => c.customId === 'botao_verificar'));
        const embed = new EmbedBuilder().setColor(0x00FF00).setTitle("✅ • VERIFICAÇÃO DE ACESSO").setDescription("Bem-vindo(a) à **Community for FiveM・**!\n\nClique no botão abaixo para se verificar.").setTimestamp();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('botao_verificar').setLabel('Verificar-se').setStyle(ButtonStyle.Success).setEmoji('✅'));
        if (!existingMessage) await channel.send({ embeds: [embed], components: [row] });
    } catch (err) {}
}

export async function configurarPainelParceria() {
    try {
        const channel = await client.channels.fetch(CANAL_PAINEL_PARCERIA_ID).catch(() => null);
        if (!channel) return;
        const messages = await channel.messages.fetch({ limit: 10 });
        const existingMessage = messages.find(m => m.author.id === client.user.id && m.components.length > 0 && m.components[0].components.some(c => c.customId === 'abrir_parceria'));
        
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🤝 • SEJA PARCEIRO DA COMMUNITY FOR FIVEM・")
            .setDescription("Clique no botão abaixo para abrir seu atendimento de parceria detalhado.")
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('abrir_parceria').setLabel('🤝 Abrir Parceria').setStyle(ButtonStyle.Primary)
        );

        if (!existingMessage) await channel.send({ embeds: [embed], components: [row] });
    } catch (err) {}
}

