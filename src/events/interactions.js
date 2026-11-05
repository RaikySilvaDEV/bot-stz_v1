import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } from 'discord.js';
import { client } from '../client.js';
import { CARGO_VERIFICADO_ID, CATEGORIA_SUPORTE_ID, CARGO_STAFF_SUPORTE_ID } from '../config/constants.js';
import { getSaudacaoDinamica } from '../services/state.js';
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId === 'botao_verificar') {
        const member = interaction.member;
        const cargo = interaction.guild.roles.cache.get(CARGO_VERIFICADO_ID);
        if (!cargo) return interaction.reply({ content: '❌ Cargo não encontrado.', ephemeral: true });
        if (member.roles.cache.has(CARGO_VERIFICADO_ID)) return interaction.reply({ content: '✅ Você já está verificado!', ephemeral: true });
        await member.roles.add(cargo);
        return interaction.reply({ content: '✅ Verificação concluída!', ephemeral: true });
    }
    if (interaction.customId === 'abrir_parceria' || interaction.customId === 'abrir_ticket') {
        await interaction.deferReply({ ephemeral: true });
        try {
            const guild = interaction.guild;
            const cleanUser = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
            const tipo = interaction.customId === 'abrir_parceria' ? 'parceria' : 'ticket';
            const channel = await guild.channels.create({
                name: `${tipo}-${cleanUser}`,
                type: ChannelType.GuildText,
                parent: CATEGORIA_SUPORTE_ID,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                    { id: CARGO_STAFF_SUPORTE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] }
                ],
            });
            const saudacao = getSaudacaoDinamica();
            const embed = new EmbedBuilder().setColor(0x00FFCC).setTitle("🎫 • ATENDIMENTO").setDescription(`Olá <@${interaction.user.id}>, envie sua solicitação aqui.`).setTimestamp();
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fechar_ticket').setLabel('🔒 Fechar').setStyle(ButtonStyle.Danger));
            await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
            await channel.send(`${saudacao} Tudo bem? No que posso ajudar?`);
            await interaction.editReply({ content: `✅ Canal criado com sucesso: ${channel}` });
        } catch (e) { await interaction.editReply({ content: '❌ Erro ao criar o canal.' }); }
        return;
    }
    if (interaction.customId === 'fechar_ticket') {
        if (!interaction.member.roles.cache.has(CARGO_STAFF_SUPORTE_ID) && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ Apenas staff.', ephemeral: true });
        }
        await interaction.reply({ content: '🔒 Fechando canal em 5 segundos...' });
        setTimeout(async () => { try { if (interaction.channel) await interaction.channel.delete(); } catch (e) {} }, 5000);
        return;
    }
});

