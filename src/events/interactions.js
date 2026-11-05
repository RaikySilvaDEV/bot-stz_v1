import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
    EmbedBuilder, MessageFlags, ModalBuilder, PermissionsBitField,
    TextInputBuilder, TextInputStyle
} from 'discord.js';
import { client } from '../client.js';
import {
    CARGO_VERIFICADO_ID, CATEGORIA_SUPORTE_ID, CARGO_STAFF_SUPORTE_ID,
    CANAL_PARCERIA_PUBLICA, MEU_ID_USUARIO
} from '../config/constants.js';
import { getSaudacaoDinamica } from '../services/state.js';

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'cadastrar-parceria') {
                const ehDono = interaction.user.id === MEU_ID_USUARIO || interaction.user.id === interaction.guild?.ownerId;
                if (!ehDono) return interaction.reply({ content: 'Apenas os donos do servidor podem cadastrar parcerias.', flags: MessageFlags.Ephemeral });
                const modal = new ModalBuilder()
                    .setCustomId('cadastro_parceria_modal')
                    .setTitle('Cadastrar nova parceria')
                    .addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nome').setLabel('Nome da parceria').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('link').setLabel('Link do parceiro').setStyle(TextInputStyle.Short).setMaxLength(500).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setMaxLength(800).setRequired(true))
                    );
                return interaction.showModal(modal);
            }
            if (interaction.commandName === 'ajuda') {
                return interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    content: [
                        '**Comandos disponíveis**',
                        '`/ajuda` — mostra esta lista.',
                        '`/ping` — mostra a latência do bot.',
                        '`/teste` — verifica se o bot está respondendo.',
                        '',
                        'Os painéis do servidor também oferecem verificação e tickets.'
                    ].join('\n')
                });
            }
            if (interaction.commandName === 'ping') {
                return interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    content: `🏓 Pong! Latência: ${client.ws.ping} ms.`
                });
            }
            if (interaction.commandName === 'teste') {
                return interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    content: `✅ Estou respondendo em **${interaction.guild?.name ?? 'este servidor'}**.`
                });
            }
            if (interaction.commandName === 'vendas') {
                return interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    content: [
                        '**Produtos disponíveis**',
                        `• **Premium:** <#1552131842960916521>`,
                        `• **Cargo Booster:** <#1552131921801256961>`,
                        `• **Booster Premium:** <#1552727902930346167>`,
                        '',
                        'Use `/comprar` e escolha um produto para abrir a sala correspondente.'
                    ].join('\n')
                });
            }
            if (interaction.commandName === 'comprar') {
                const canais = {
                    premium: ['Premium', '1552131842960916521'],
                    cargo_booster: ['Cargo Booster', '1552131921801256961'],
                    booster_premium: ['Booster Premium', '1552727902930346167']
                };
                const [nome, canalId] = canais[interaction.options.getString('produto')];
                return interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    content: `Para ver e comprar **${nome}**, acesse <#${canalId}>.`
                });
            }
            return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Comando não reconhecido.' });
        }

        if (interaction.isModalSubmit() && interaction.customId === 'cadastro_parceria_modal') {
            const ehDono = interaction.user.id === MEU_ID_USUARIO || interaction.user.id === interaction.guild?.ownerId;
            if (!ehDono) return interaction.reply({ content: 'Apenas os donos do servidor podem cadastrar parcerias.', flags: MessageFlags.Ephemeral });
            const nome = interaction.fields.getTextInputValue('nome').trim();
            const link = interaction.fields.getTextInputValue('link').trim();
            const descricao = interaction.fields.getTextInputValue('descricao').trim();
            let url;
            try {
                url = new URL(link);
                if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Protocolo inválido');
            } catch {
                return interaction.reply({ content: 'Informe um link válido começando com http:// ou https://.', flags: MessageFlags.Ephemeral });
            }
            const canal = await interaction.guild.channels.fetch(CANAL_PARCERIA_PUBLICA).catch(() => null);
            if (!canal?.isTextBased()) return interaction.reply({ content: 'O canal de divulgação de parcerias não foi encontrado. Confira o ID configurado.', flags: MessageFlags.Ephemeral });
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`🤝 ${nome}`)
                .setDescription(descricao)
                .addFields({ name: 'Acesse', value: `[Abrir link da parceria](${url.href})` })
                .setTimestamp();
            await canal.send({ embeds: [embed], allowedMentions: { parse: [] } });
            return interaction.reply({ content: `✅ Parceria **${nome}** cadastrada em ${canal}.`, flags: MessageFlags.Ephemeral });
        }

        if (!interaction.isButton()) return;

        if (interaction.customId === 'botao_verificar') {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const cargo = await interaction.guild.roles.fetch(CARGO_VERIFICADO_ID);
            if (!cargo) return interaction.reply({ content: 'O cargo de verificação não foi encontrado.', flags: MessageFlags.Ephemeral });
            if (member.roles.cache.has(cargo.id)) return interaction.reply({ content: '✅ Você já está verificado!', flags: MessageFlags.Ephemeral });
            if (interaction.guild.members.me.roles.highest.comparePositionTo(cargo) <= 0) {
                return interaction.reply({ content: 'O cargo do bot precisa ficar acima do cargo de verificado.', flags: MessageFlags.Ephemeral });
            }
            await member.roles.add(cargo);
            return interaction.reply({ content: '✅ Verificação concluída!', flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId === 'abrir_ticket') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const guild = interaction.guild;
            const cleanUser = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || interaction.user.id;
            const tipo = 'ticket';
            const channel = await guild.channels.create({
                name: `${tipo}-${cleanUser}`.slice(0, 100),
                type: ChannelType.GuildText,
                parent: CATEGORIA_SUPORTE_ID,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                    { id: CARGO_STAFF_SUPORTE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] }
                ]
            });
            const embed = new EmbedBuilder()
                .setColor(0x00FFCC)
                .setTitle('🎫 • ATENDIMENTO')
                .setDescription(`Olá <@${interaction.user.id}>, envie sua solicitação aqui.`)
                .setTimestamp();
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('fechar_ticket').setLabel('🔒 Fechar').setStyle(ButtonStyle.Danger)
            );
            await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
            await channel.send(`${getSaudacaoDinamica()} Tudo bem? No que posso ajudar?`);
            return interaction.editReply({ content: `✅ Canal criado com sucesso: ${channel}` });
        }

        if (interaction.customId === 'fechar_ticket') {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!member.roles.cache.has(CARGO_STAFF_SUPORTE_ID) && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: 'Apenas a equipe de suporte pode fechar este canal.', flags: MessageFlags.Ephemeral });
            }
            await interaction.reply({ content: '🔒 Fechando canal em 5 segundos...' });
            setTimeout(async () => {
                try {
                    await interaction.channel?.delete('Ticket fechado pela equipe de suporte');
                } catch (error) {
                    console.error('[tickets] Não foi possível fechar o canal:', error);
                }
            }, 5000);
        }
    } catch (error) {
        console.error(`[interaction:${interaction.id}] Falha ao processar interação:`, error);
        const conteudo = 'Ocorreu um erro ao processar esta ação. Confira as permissões do bot e tente novamente.';
        if (interaction.deferred) await interaction.editReply({ content: conteudo }).catch(() => {});
        else if (interaction.replied) await interaction.followUp({ content: conteudo, flags: MessageFlags.Ephemeral }).catch(() => {});
        else await interaction.reply({ content: conteudo, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
});
