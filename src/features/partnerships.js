import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
    ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { client } from '../client.js';
import { isServerManager } from '../services/authorization.js';
import { addPartner, getPartners, removePartner, updatePartner } from '../repositories/partnershipRepository.js';
import { getSettings } from '../repositories/settingsRepository.js';
import { logAction } from '../services/audit.js';

function isOwner(interaction) {
    return isServerManager(interaction);
}

function partnerEmbed(partner) {
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🤝 ${partner.name}`)
        .setDescription(partner.description)
        .addFields({ name: 'Conheça', value: `<${partner.url}>` })
        .setFooter({ text: 'Parceria Community for FiveM' })
        .setTimestamp(new Date(partner.updatedAt));
}

async function getPartnersChannel(guild) {
    const channelId = getSettings().channels.partnerships;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) throw new Error('Canal de parcerias não configurado ou inválido. Use `/configurar` para escolher o canal.');
    return channel;
}

function makePanel(selectedId = null, page = 0) {
    const partners = getPartners();
    const pageCount = Math.max(1, Math.ceil(partners.length / 25));
    page = Math.max(0, Math.min(page, pageCount - 1));
    const components = [];
    if (partners.length) {
        components.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`partner:select:${page}`)
                .setPlaceholder('Selecione uma parceria para editar ou remover')
                .addOptions(partners.slice(page * 25, page * 25 + 25).map(partner => ({
                    label: partner.name.slice(0, 100),
                    description: partner.description.replace(/\s+/g, ' ').slice(0, 100) || partner.url,
                    value: partner.id,
                    default: partner.id === selectedId
                })))
        ));
    }
    const buttons = [new ButtonBuilder().setCustomId('partner:add').setLabel('Cadastrar parceria').setStyle(ButtonStyle.Success)];
    if (selectedId && partners.some(partner => partner.id === selectedId)) {
        buttons.push(
            new ButtonBuilder().setCustomId(`partner:edit:${selectedId}`).setLabel('Editar').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`partner:delete:${selectedId}`).setLabel('Remover').setStyle(ButtonStyle.Danger)
        );
    }
    components.push(new ActionRowBuilder().addComponents(buttons));
    const pageDescription = pageCount > 1 ? `\nPágina ${page + 1} de ${pageCount}.` : '';
    const content = partners.length
        ? `**Gerenciamento de parcerias** — ${partners.length} cadastrada(s). As alterações serão publicadas em <#${getSettings().channels.partnerships}>.${pageDescription}`
        : `Ainda não há parcerias cadastradas. Use **Cadastrar parceria** para adicionar a primeira. A divulgação será feita em <#${getSettings().channels.partnerships}>.`;
    if (pageCount > 1) {
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`partner:page:${Math.max(0, page - 1)}`).setLabel('Página anterior').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId(`partner:page:${Math.min(pageCount - 1, page + 1)}`).setLabel('Próxima página').setStyle(ButtonStyle.Secondary).setDisabled(page >= pageCount - 1)
        ));
    }
    return { content, components, flags: MessageFlags.Ephemeral };
}

function makeModal(partner = null) {
    const modal = new ModalBuilder()
        .setCustomId(partner ? `partner:submit-edit:${partner.id}` : 'partner:submit-add')
        .setTitle(partner ? 'Editar parceria' : 'Cadastrar parceria');
    const name = new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true);
    const url = new TextInputBuilder().setCustomId('url').setLabel('Link (https://...)').setStyle(TextInputStyle.Short).setMaxLength(500).setRequired(true);
    const description = new TextInputBuilder().setCustomId('description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setMaxLength(800).setRequired(true);
    if (partner) {
        name.setValue(partner.name);
        url.setValue(partner.url);
        description.setValue(partner.description);
    }
    return modal.addComponents(
        new ActionRowBuilder().addComponents(name),
        new ActionRowBuilder().addComponents(url),
        new ActionRowBuilder().addComponents(description)
    );
}

function readForm(interaction) {
    const name = interaction.fields.getTextInputValue('name').trim();
    const url = interaction.fields.getTextInputValue('url').trim();
    const description = interaction.fields.getTextInputValue('description').trim();
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error('Informe um link válido que comece com https://.');
    }
    if (parsed.protocol !== 'https:') throw new Error('Por segurança, o link da parceria deve usar HTTPS.');
    if (!name || !description) throw new Error('Preencha o nome e a descrição da parceria.');
    return { name, url: parsed.href, description };
}

async function audit(guild, actorId, action, subject) {
    await logAction(guild, actorId, action, subject);
}

export async function tratarInteracaoParcerias(interaction) {
    const command = interaction.isChatInputCommand() && ['parcerias', 'cadastrar-parceria'].includes(interaction.commandName);
    const component = (interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('partner:');
    const modal = interaction.isModalSubmit() && interaction.customId.startsWith('partner:submit-');
    if (!command && !component && !modal) return false;
    if (!isOwner(interaction)) {
        const response = { content: 'Apenas os donos do servidor podem gerenciar parcerias.', flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) await interaction.followUp(response);
        else await interaction.reply(response);
        return true;
    }

    if (command) {
        if (interaction.commandName === 'cadastrar-parceria') await interaction.showModal(makeModal());
        else await interaction.reply(makePanel());
        return true;
    }
    if (interaction.isStringSelectMenu()) {
        const page = Number(interaction.customId.split(':')[2] ?? 0);
        await interaction.update(makePanel(interaction.values[0], page));
        return true;
    }
    if (interaction.isButton()) {
        const [, action, id] = interaction.customId.split(':');
        if (action === 'page') await interaction.update(makePanel(null, Number(id)));
        else if (action === 'add') await interaction.showModal(makeModal());
        else if (action === 'edit') {
            const partner = getPartners().find(item => item.id === id);
            if (!partner) await interaction.update(makePanel());
            else await interaction.showModal(makeModal(partner));
        } else if (action === 'delete') {
            const partner = getPartners().find(item => item.id === id);
            if (!partner) await interaction.update(makePanel());
            else await interaction.reply({
                content: `Confirma remover **${partner.name}** e apagar a publicação do canal?`,
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`partner:confirm-delete:${id}`).setLabel('Confirmar remoção').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('partner:cancel-delete').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
                )],
                flags: MessageFlags.Ephemeral
            });
        } else if (action === 'cancel-delete') {
            await interaction.update({ content: 'Remoção cancelada.', components: [] });
        } else if (action === 'confirm-delete') {
            const partner = getPartners().find(item => item.id === id);
            if (!partner) await interaction.update({ content: 'Essa parceria já foi removida.', components: [] });
            else {
                const channel = await getPartnersChannel(interaction.guild);
                const message = partner.messageId ? await channel.messages.fetch(partner.messageId).catch(() => null) : null;
                if (message) await message.delete();
                removePartner(id);
                await audit(interaction.guild, interaction.user.id, 'Parceria removida', partner.name);
                await interaction.update({ content: `✅ Parceria **${partner.name}** removida.`, components: [] });
            }
        }
        return true;
    }

    const isNew = interaction.customId === 'partner:submit-add';
    const id = isNew ? null : interaction.customId.split(':')[2];
    let data;
    try {
        data = readForm(interaction);
    } catch (error) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
        return true;
    }
    const channel = await getPartnersChannel(interaction.guild);
    if (isNew) {
        let partner;
        try {
            partner = addPartner({ ...data, createdBy: interaction.user.id, messageId: null });
        } catch (error) {
            await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
            return true;
        }
        try {
            const message = await channel.send({ embeds: [partnerEmbed(partner)], allowedMentions: { parse: [] } });
            updatePartner(partner.id, { ...data, createdBy: partner.createdBy, messageId: message.id });
            await audit(interaction.guild, interaction.user.id, 'Parceria cadastrada', partner.name);
            await interaction.reply({ content: `✅ **${partner.name}** foi cadastrada e publicada em ${channel}.`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            removePartner(partner.id);
            throw error;
        }
    } else {
        const partner = getPartners().find(item => item.id === id);
        if (!partner) {
            await interaction.reply({ content: 'Essa parceria não está mais cadastrada. Abra `/parcerias` novamente.', flags: MessageFlags.Ephemeral });
            return true;
        }
        const message = partner.messageId ? await channel.messages.fetch(partner.messageId).catch(() => null) : null;
        if (!message) throw new Error('Não encontrei a publicação original. Confira o canal e reabra `/parcerias`.');
        const duplicate = getPartners().some(item => item.id !== id && new URL(item.url).href === new URL(data.url).href);
        if (duplicate) {
            await interaction.reply({ content: '❌ Essa URL já está cadastrada como parceria.', flags: MessageFlags.Ephemeral });
            return true;
        }
        const updated = { ...partner, ...data, updatedAt: new Date().toISOString() };
        await message.edit({ embeds: [partnerEmbed(updated)], allowedMentions: { parse: [] } });
        updatePartner(id, { ...data, createdBy: partner.createdBy, messageId: partner.messageId });
        await audit(interaction.guild, interaction.user.id, 'Parceria editada', partner.name);
        await interaction.reply({ content: `✅ **${data.name}** foi atualizada em ${channel}.`, flags: MessageFlags.Ephemeral });
    }
    return true;
}

export function getPartnershipCount() {
    return getPartners().length;
}
