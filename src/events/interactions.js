import {
    ChannelType, MessageFlags, PermissionsBitField
} from 'discord.js';
import { client } from '../client.js';
import { CARGO_VERIFICADO_ID, CARGO_STAFF_SUPORTE_ID } from '../config/constants.js';
import { getSettings } from '../repositories/settingsRepository.js';
import { logAction } from '../services/audit.js';
import { archiveAndCloseTicket } from '../services/ticketClosure.js';
import { tratarInteracaoAdministracao } from '../features/administration.js';
import { tratarInteracaoParcerias } from '../features/partnerships.js';
import { tratarInteracaoAnunciosFiveM } from '../features/fivemAnnouncements.js';
import { tratarInteracaoPagamentos } from '../features/payments.js';
import { tratarInteracaoDashboard } from '../features/dashboard.js';
import { criarVitrineLoja, publicarSeletorProdutos, tratarInteracaoCompras } from '../features/commerce.js';
import { tratarAdminLoja } from '../features/commerceAdmin.js';
import { tratarInteracaoFeedback } from '../features/commerceFeedback.js';

const ticketsEmCriacao = new Set();

client.on('interactionCreate', async interaction => {
    try {
        if (await tratarInteracaoAnunciosFiveM(interaction)) return;
        if (await tratarInteracaoAdministracao(interaction)) return;
        if (await tratarInteracaoParcerias(interaction)) return;
        if (await tratarInteracaoPagamentos(interaction)) return;
        if (await tratarInteracaoDashboard(interaction)) return;
        if (await tratarInteracaoFeedback(interaction)) return;
        if (await tratarAdminLoja(interaction)) return;
        if (await tratarInteracaoCompras(interaction)) return;
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'ajuda') {
                return interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    content: [
                        '**Comandos disponíveis**',
                        '`/ajuda` — mostra esta lista.',
                        '`/ping` — mostra a latência do bot.',
                        '`/teste` — verifica se o bot está respondendo.',
                        '`/vendas` — mostra os produtos disponíveis para compra.',
                        '`/comprar` — abre a loja com Pix Mercado Pago e entrega automática após confirmação.',
                        '`/pagamentos` — gerencia os métodos de pagamento da loja.',
                        '`/painel` — abre o painel privado de status e controle do bot.',
                        '`/parcerias` — gerencia parcerias (somente donos).',
                        '`/cadastrar-parceria` — abre o cadastro rápido de parceria (somente donos).',
                        '`/anuncios-fivem` — administra anúncios (somente donos).',
                        '`/configurar` — configura canais e automações (somente donos).',
                        '`/status` e `/logs` — estado do bot e registro administrativo.',
                        '`/backup` — baixa uma cópia dos dados administrativos (somente donos).',
                        '',
                        'Os painéis do servidor também oferecem verificação, abertura de tickets e carrinho de compras.'
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
                return interaction.reply({ ...criarVitrineLoja(), flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Comando não reconhecido.' });
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
            if (ticketsEmCriacao.has(interaction.user.id)) return interaction.editReply({ content: 'Seu atendimento está sendo aberto. Aguarde um instante.' });
            ticketsEmCriacao.add(interaction.user.id);
            try {
            await guild.channels.fetch();
            const supportCategoryId = getSettings().channels.supportCategory;
            const duplicateTicket = guild.channels.cache.find(channel => channel.parentId === supportCategoryId && channel.type === ChannelType.GuildText && channel.topic === `ticket-owner:${interaction.user.id}`);
            if (duplicateTicket) {
                await publicarSeletorProdutos(duplicateTicket).catch(error => console.error(`[loja:${duplicateTicket.id}] Não foi possível publicar o carrinho:`, error));
                return interaction.editReply({ content: `Você já tem um atendimento aberto: ${duplicateTicket}` });
            }
            const cleanUser = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || interaction.user.id;
            const tipo = 'ticket';
            const channel = await guild.channels.create({
                name: `${tipo}-${cleanUser}`.slice(0, 100),
                type: ChannelType.GuildText,
                parent: supportCategoryId,
                topic: `ticket-owner:${interaction.user.id}`,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.AttachFiles] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                    { id: CARGO_STAFF_SUPORTE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] }
                ]
            });
            await publicarSeletorProdutos(channel).catch(error => console.error(`[loja:${channel.id}] Não foi possível publicar o carrinho:`, error));
            await logAction(guild, interaction.user.id, 'Ticket aberto', `Canal ${channel.name}`);
            await interaction.editReply({ content: `✅ Canal criado com sucesso: ${channel}` });
            setTimeout(() => {
                interaction.deleteReply().catch(() => {});
            }, 5000).unref?.();
            return;
            } finally {
                ticketsEmCriacao.delete(interaction.user.id);
            }
        }

        if (interaction.customId === 'fechar_ticket') {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!member.roles.cache.has(CARGO_STAFF_SUPORTE_ID) && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: 'Apenas a equipe de suporte pode fechar este canal.', flags: MessageFlags.Ephemeral });
            }
            await interaction.reply({ content: '🔒 Fechando canal em 5 segundos...' });
            setTimeout(async () => {
                const ticket = interaction.channel;
                try {
                    await archiveAndCloseTicket(
                        interaction.guild, ticket, interaction.user.id, 'Ticket fechado pela equipe de suporte'
                    );
                } catch (error) {
                    console.error('[tickets] Falha ao salvar a transcrição ou fechar o ticket:', error);
                    await interaction.followUp({
                        content: 'Não consegui salvar a transcrição ou fechar o ticket; o canal foi mantido aberto. Tente fechar novamente mais tarde.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
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
