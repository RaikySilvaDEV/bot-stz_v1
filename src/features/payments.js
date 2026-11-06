import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder,
    MessageFlags, ModalBuilder, PermissionsBitField, StringSelectMenuBuilder,
    TextInputBuilder, TextInputStyle
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { client } from '../client.js';
import { isServerManager } from '../services/authorization.js';
import { trackMercadoPagoResponse } from '../services/mercadoPagoResponses.js';
import {
    createMercadoPagoTestPayment, failMercadoPagoTestPayment,
    setMercadoPagoTestPaymentCreated
} from '../repositories/mercadoPagoTestPaymentRepository.js';
import {
    addPaymentMethod, getPaymentConfig, removePaymentMethod, savePublicPaymentPanel,
    setPaymentMethodActive, updatePaymentMethod
} from '../repositories/paymentMethodsRepository.js';
import { logAction } from '../services/audit.js';
import { PRODUCTS } from '../config/products.js';
import { getProductPriceCents, hasCustomProductPrice, removeProductPrice, setProductPriceCents } from '../repositories/productCatalogRepository.js';
import { createMercadoPagoTestPixPayment, mercadoPagoConfigReady } from '../services/mercadoPago.js';

const TYPE_LABELS = { pix_manual: 'Pix manual', payment_link: 'Link de pagamento (Mercado Pago ou outro)' };

function methodLabel(method) {
    return `${method.active ? '🟢 Ativo' : '⚪ Inativo'} · ${method.name} · ${TYPE_LABELS[method.type] ?? 'Outro'}`.slice(0, 100);
}

function formatPrice(cents) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function parsePriceCents(raw) {
    const value = raw.replace(/R\$|\s/gi, '');
    let whole;
    let fractional;
    if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(value) || /^\d+,\d{1,2}$/.test(value)) {
        const parts = value.split(',');
        whole = parts[0].replace(/\./g, '');
        fractional = parts[1].padEnd(2, '0');
    } else if (/^\d+(\.\d{1,2})?$/.test(value)) {
        const parts = value.split('.');
        whole = parts[0];
        fractional = (parts[1] ?? '').padEnd(2, '0');
    } else throw new Error('Digite um preço como `25,90` ou `25.90`.');
    const cents = Number(whole) * 100 + Number(fractional || 0);
    if (!Number.isSafeInteger(cents) || cents < 1 || cents > 99_999_999) throw new Error('O preço deve ser entre R$ 0,01 e R$ 999.999,99.');
    return cents;
}

function makeProductPanel(selectedValue = null, notice = '') {
    const selected = PRODUCTS.find(product => product.value === selectedValue) ?? null;
    const rows = [new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('payment:product-select').setPlaceholder('Selecione um produto para configurar o preço')
            .addOptions(PRODUCTS.map(product => {
                const cents = getProductPriceCents(product.value);
                return { label: product.name, description: cents ? formatPrice(cents) : 'Preço não configurado', value: product.value, default: product.value === selected?.value };
            }))
    )];
    if (selected) rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`payment:price-edit:${selected.value}`).setLabel('Definir ou editar preço').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`payment:price-clear:${selected.value}`).setLabel('Restaurar preço padrão').setStyle(ButtonStyle.Danger).setDisabled(!hasCustomProductPrice(selected.value))
    ));
    const summary = PRODUCTS.map(product => {
        const cents = getProductPriceCents(product.value);
        const original = product.originalPriceCents;
        const price = original && cents < original ? `~~${formatPrice(original)}~~ → **${formatPrice(cents)}**` : formatPrice(cents);
        return `• **${product.name}:** ${price}${hasCustomProductPrice(product.value) ? ' · personalizado' : ' · padrão'}`;
    }).join('\n');
    return {
        embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🛒 Preços do catálogo')
            .setDescription(`${notice ? `${notice}\n\n` : ''}${summary}\n\nEdite o preço promocional de cada produto. O valor atual será usado no QR Pix e no carrinho.`)],
        components: rows, flags: MessageFlags.Ephemeral
    };
}

function makePriceModal(product) {
    const cents = getProductPriceCents(product.value);
    const value = cents ? (cents / 100).toFixed(2).replace('.', ',') : '';
    const input = new TextInputBuilder().setCustomId('amount').setLabel('Valor em reais (ex.: 25,90)')
        .setStyle(TextInputStyle.Short).setMaxLength(15).setRequired(true);
    if (value) input.setValue(value);
    return new ModalBuilder().setCustomId(`payment:submit-price:${product.value}`).setTitle(`Preço · ${product.name}`)
        .addComponents(new ActionRowBuilder().addComponents(input));
}

function makeTestPixModal() {
    return new ModalBuilder().setCustomId('payment:submit-test-pix').setTitle('Pix de teste · R$ 0,10')
        .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('email').setLabel('Seu e-mail de pagador no Mercado Pago')
                .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120)
        ));
}

function makePanel(selectedId = null, notice = '') {
    const { methods, publicChannelId } = getPaymentConfig();
    const selected = methods.find(method => method.id === selectedId) ?? null;
    const rows = [];
    rows.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('payment:type')
            .setPlaceholder('Cadastrar método de pagamento…')
            .addOptions(
                { label: 'Pix manual', description: 'Chave Pix e dados do recebedor', value: 'pix_manual', emoji: '💠' },
                { label: 'Link de pagamento', description: 'Mercado Pago ou outro link de checkout', value: 'payment_link', emoji: '🔗' }
            )
    ));
    if (methods.length) {
        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('payment:select')
                .setPlaceholder('Selecione um método cadastrado')
                .addOptions(methods.slice(0, 25).map(method => ({
                    label: methodLabel(method), value: method.id, default: method.id === selected?.id
                })))
        ));
    }
    const buttons = [];
    if (selected) {
        buttons.push(new ButtonBuilder().setCustomId(`payment:edit:${selected.id}`).setLabel('Editar').setStyle(ButtonStyle.Primary));
        buttons.push(new ButtonBuilder().setCustomId(`payment:toggle:${selected.id}`).setLabel(selected.active ? 'Desativar' : 'Ativar').setStyle(selected.active ? ButtonStyle.Secondary : ButtonStyle.Success));
        buttons.push(new ButtonBuilder().setCustomId(`payment:delete:${selected.id}`).setLabel('Remover').setStyle(ButtonStyle.Danger));
    }
    buttons.push(new ButtonBuilder().setCustomId('payment:products').setLabel('Configurar produtos').setStyle(ButtonStyle.Secondary));
    buttons.push(new ButtonBuilder().setCustomId('payment:publish').setLabel(publicChannelId ? 'Atualizar canal de status' : 'Criar canal de status').setStyle(ButtonStyle.Success));
    rows.push(new ActionRowBuilder().addComponents(buttons));

    const details = methods.length
        ? methods.map(method => `${method.active ? '🟢' : '⚪'} **${method.name}** — ${TYPE_LABELS[method.type] ?? method.type}`).join('\n')
        : 'Nenhum método cadastrado. Escolha um tipo no menu acima para começar.';
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('💳 Gerenciamento de pagamentos')
        .setDescription(`${notice ? `${notice}\n\n` : ''}${details}`)
        .setFooter({ text: `Métodos ativos: ${methods.filter(method => method.active).length} · Inativos: ${methods.filter(method => !method.active).length}` });
    return { embeds: [embed], components: rows, flags: MessageFlags.Ephemeral };
}

function makeMethodModal(type, method = null) {
    const editing = Boolean(method);
    const modal = new ModalBuilder()
        .setCustomId(editing ? `payment:submit-edit:${method.id}` : `payment:submit-add:${type}`)
        .setTitle(editing ? 'Editar método de pagamento' : 'Cadastrar método de pagamento');
    const addInput = (id, label, style, maxLength, required = true, value = '') => {
        const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMaxLength(maxLength).setRequired(required);
        if (value) input.setValue(value.slice(0, maxLength));
        return new ActionRowBuilder().addComponents(input);
    };
    const rows = [addInput('name', 'Nome para identificar', TextInputStyle.Short, 70, true, method?.name)];
    if (type === 'pix_manual') {
        rows.push(
            addInput('pixKey', 'Chave Pix (telefone: use +55 e DDD)', TextInputStyle.Short, 100, true, method?.pixKey),
            addInput('receiverName', 'Nome do recebedor', TextInputStyle.Short, 25, true, method?.receiverName),
            addInput('city', 'Cidade do recebedor', TextInputStyle.Short, 15, true, method?.city),
            addInput('instructions', 'Instruções para o cliente (opcional)', TextInputStyle.Paragraph, 300, false, method?.instructions)
        );
    } else {
        rows.push(
            addInput('url', 'Link de pagamento https://…', TextInputStyle.Short, 500, true, method?.url),
            addInput('instructions', 'Instruções para o cliente (opcional)', TextInputStyle.Paragraph, 300, false, method?.instructions)
        );
    }
    return modal.addComponents(...rows);
}

function readMethodForm(interaction, type) {
    const name = interaction.fields.getTextInputValue('name').trim();
    if (!name) throw new Error('Informe um nome para o método.');
    if (type === 'pix_manual') {
        const pixKey = interaction.fields.getTextInputValue('pixKey').trim();
        const receiverName = interaction.fields.getTextInputValue('receiverName').trim();
        const city = interaction.fields.getTextInputValue('city').trim();
        const instructions = interaction.fields.getTextInputValue('instructions').trim();
        if (!pixKey || !receiverName || !city) throw new Error('Preencha a chave Pix, o nome e a cidade do recebedor.');
        return { name, type, pixKey, pixKeyType: 'auto', receiverName, city, instructions };
    }
    const url = interaction.fields.getTextInputValue('url').trim();
    const instructions = interaction.fields.getTextInputValue('instructions').trim();
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('Informe um link válido de pagamento.'); }
    if (parsed.protocol !== 'https:') throw new Error('O link de pagamento precisa começar com https://.');
    return { name, type, url: parsed.href, instructions };
}

function buildPublicStatus() {
    const activeMethods = getPaymentConfig().methods.filter(method => method.active);
    const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('💳 Formas de pagamento disponíveis')
        .setDescription(activeMethods.length
            ? activeMethods.map(method => `**${method.name}**\n${TYPE_LABELS[method.type] ?? method.type}${method.instructions ? `\n${method.instructions}` : ''}`).join('\n\n')
            : 'No momento, não há formas de pagamento ativas.');
    const linkMethods = activeMethods.filter(method => method.type === 'payment_link' && method.url).slice(0, 5);
    const components = linkMethods.length ? [new ActionRowBuilder().addComponents(linkMethods.map(method =>
        new ButtonBuilder().setLabel(method.name.slice(0, 80)).setStyle(ButtonStyle.Link).setURL(method.url)
    ))] : [];
    return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

async function publishStatusChannel(guild) {
    const config = getPaymentConfig();
    let channel = config.publicChannelId ? await guild.channels.fetch(config.publicChannelId).catch(() => null) : null;
    if (!channel?.isTextBased()) {
        channel = await guild.channels.create({
            name: '💳・pagamentos',
            type: ChannelType.GuildText,
            topic: 'Métodos de pagamento ativos da loja. As informações são atualizadas pelo painel administrativo.',
            permissionOverwrites: [{
                id: guild.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
                deny: [PermissionsBitField.Flags.SendMessages]
            }, {
                id: client.user.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks]
            }]
        });
    }
    savePublicPaymentPanel(channel.id, config.publicMessageId);
    const existing = config.publicMessageId ? await channel.messages.fetch(config.publicMessageId).catch(() => null) : null;
    const message = existing
        ? await existing.edit(buildPublicStatus())
        : await channel.send(buildPublicStatus());
    savePublicPaymentPanel(channel.id, message.id);
    return channel;
}

export async function updatePublicStatusIfConfigured(guild) {
    if (!getPaymentConfig().publicChannelId) return;
    try { await publishStatusChannel(guild); }
    catch (error) { console.error('[pagamentos] Métodos salvos, mas não foi possível atualizar o canal público:', error); }
}

async function audit(interaction, action, subject) {
    try { await logAction(interaction.guild, interaction.user.id, action, subject); }
    catch (error) { console.error('[pagamentos] Não foi possível registrar a ação de auditoria:', error); }
}

export async function tratarInteracaoPagamentos(interaction) {
    const command = interaction.isChatInputCommand() && interaction.commandName === 'pagamentos';
    const component = (interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('payment:');
    const modal = interaction.isModalSubmit() && interaction.customId.startsWith('payment:submit-');
    if (!command && !component && !modal) return false;
    if (!interaction.guild || !isServerManager(interaction)) {
        const response = { content: 'Apenas o dono do servidor ou o desenvolvedor do bot pode gerenciar pagamentos.', flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) await interaction.followUp(response);
        else await interaction.reply(response);
        return true;
    }

    if (command) {
        if (interaction.options.getSubcommand(false) === 'teste') {
            if (!mercadoPagoConfigReady()) {
                await interaction.reply({ content: 'Configure as credenciais e a URL HTTPS do webhook antes de criar o checkout de teste.', flags: MessageFlags.Ephemeral });
                return true;
            }
            await interaction.showModal(makeTestPixModal());
            return true;
        }
        await interaction.reply(makePanel());
        return true;
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'payment:type') {
            await interaction.showModal(makeMethodModal(interaction.values[0]));
        } else if (interaction.customId === 'payment:select') {
            await interaction.update(makePanel(interaction.values[0]));
        } else if (interaction.customId === 'payment:product-select') {
            await interaction.update(makeProductPanel(interaction.values[0]));
        }
        return true;
    }

    if (interaction.isButton()) {
        const [, action, id] = interaction.customId.split(':');
        const method = getPaymentConfig().methods.find(item => item.id === id);
        if (action === 'products') {
            await interaction.reply(makeProductPanel());
        } else if (action === 'price-edit') {
            const product = PRODUCTS.find(item => item.value === id);
            if (!product) await interaction.reply({ content: 'Produto não encontrado no catálogo.', flags: MessageFlags.Ephemeral });
            else await interaction.showModal(makePriceModal(product));
        } else if (action === 'price-clear') {
            const product = PRODUCTS.find(item => item.value === id);
            if (!product) await interaction.update(makeProductPanel(null, 'Produto não encontrado.'));
            else {
                removeProductPrice(id);
                await audit(interaction, 'Preço de produto removido', product.name);
                await interaction.update(makeProductPanel(null, `Preço personalizado removido. **${product.name}** voltou ao preço padrão do catálogo.`));
            }
        } else if (action === 'publish') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
                const channel = await publishStatusChannel(interaction.guild);
                await audit(interaction, 'Canal de pagamentos atualizado', `Canal ${channel.name}`);
                await interaction.editReply({ content: `✅ Canal de status publicado/atualizado: ${channel}. Os clientes verão apenas os métodos ativos.` });
            } catch (error) {
                console.error('[pagamentos] Falha ao publicar canal de status:', error);
                await interaction.editReply({ content: '❌ Não consegui criar ou atualizar o canal. Confira se o bot pode gerenciar canais e enviar mensagens.' });
            }
        } else if (action === 'edit' && method) {
            await interaction.showModal(makeMethodModal(method.type, method));
        } else if (action === 'toggle' && method) {
            const updated = setPaymentMethodActive(id, !method.active);
            await updatePublicStatusIfConfigured(interaction.guild);
            await audit(interaction, updated.active ? 'Método de pagamento ativado' : 'Método de pagamento desativado', updated.name);
            await interaction.update(makePanel(id, `✅ **${updated.name}** agora está ${updated.active ? 'ativo' : 'inativo'}.`));
        } else if (action === 'delete' && method) {
            await interaction.reply({
                content: `Confirma remover o método **${method.name}**?`,
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`payment:confirm-delete:${id}`).setLabel('Confirmar remoção').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('payment:cancel-delete').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
                )], flags: MessageFlags.Ephemeral
            });
        } else if (action === 'cancel-delete') {
            await interaction.update({ content: 'Remoção cancelada.', components: [] });
        } else if (action === 'confirm-delete') {
            if (!method) await interaction.update({ content: 'Esse método já foi removido.', components: [] });
            else {
                removePaymentMethod(id);
                await updatePublicStatusIfConfigured(interaction.guild);
                await audit(interaction, 'Método de pagamento removido', method.name);
                await interaction.update({ content: `✅ Método **${method.name}** removido.`, components: [] });
            }
        }
        return true;
    }

    if (interaction.customId === 'payment:submit-test-pix') {
        const payerEmail = interaction.fields.getTextInputValue('email').trim();
        if (payerEmail.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
            await interaction.reply({ content: 'Informe um endereço de e-mail válido para o pagador.', flags: MessageFlags.Ephemeral });
            return true;
        }
        if (!mercadoPagoConfigReady()) {
            await interaction.reply({ content: 'A configuração do Mercado Pago não está pronta. Nenhum pagamento foi criado.', flags: MessageFlags.Ephemeral });
            return true;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const externalReference = `bot-test-${randomUUID()}`;
        let paymentCreated = false;
        try {
            const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
            if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                throw new Error('O bot precisa da permissão Gerenciar Cargos para criar e entregar o cargo de teste.');
            }
            let role = interaction.guild.roles.cache.find(item => item.name === 'Pagamento Teste');
            if (!role) role = await interaction.guild.roles.create({
                name: 'Pagamento Teste',
                permissions: [],
                reason: 'Cargo temporário para validar pagamento Pix do Mercado Pago'
            });
            if (role.managed || botMember.roles.highest.comparePositionTo(role) <= 0) {
                throw new Error('O cargo Pagamento Teste está acima do cargo do bot ou não pode ser atribuído.');
            }

            createMercadoPagoTestPayment({
                externalReference, guildId: interaction.guildId, buyerId: interaction.user.id, roleId: role.id
            });
            const payment = await createMercadoPagoTestPixPayment({ externalReference, payerEmail });
            paymentCreated = true;
            if (!setMercadoPagoTestPaymentCreated(externalReference, payment.id)) {
                throw new Error('O pagamento foi criado, mas não foi possível salvar seu vínculo de entrega.');
            }
            trackMercadoPagoResponse(
                externalReference,
                interaction.webhook,
                '✅ **Pagamento confirmado!** O cargo **Pagamento Teste** foi atribuído à sua conta.'
            );
            await audit(interaction, 'Pix de teste Mercado Pago criado', 'R$ 0,10 · cargo Pagamento Teste');
            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('Pix de teste · R$ 0,10')
                .setDescription('Escaneie o QR Code ou copie e cole o código Pix. **A cobrança é real**; após a confirmação do Mercado Pago, o bot entrega o cargo **Pagamento Teste** neste servidor.')
                .addFields({ name: 'Pix Copia e Cola', value: `\`${payment.qrCode.slice(0, 1000)}\`` })
                .setImage('attachment://pix-teste.png')
                .setFooter({ text: `Pagamento ${payment.id}` });
            await interaction.editReply({
                content: payment.ticketUrl ? `Checkout Pix criado. [Abrir no Mercado Pago](${payment.ticketUrl})` : 'Checkout Pix criado. A confirmação pode levar alguns instantes após o pagamento.',
                embeds: [embed],
                files: [{ attachment: payment.qrImage, name: 'pix-teste.png' }],
                allowedMentions: { parse: [] }
            });
        } catch (error) {
            if (!paymentCreated) failMercadoPagoTestPayment(externalReference, error);
            console.error('[pagamentos] Falha ao gerar Pix ou preparar cargo de teste:', error);
            await interaction.editReply({
                content: paymentCreated
                    ? 'O Pix foi criado, mas ocorreu uma falha ao preparar a entrega. Avise a equipe e não crie outro pagamento.'
                    : `Não consegui criar o Pix de teste. ${error.message}`
            });
        }
        return true;
    }

    if (interaction.customId.startsWith('payment:submit-price:')) {
        const productValue = interaction.customId.split(':')[2];
        const product = PRODUCTS.find(item => item.value === productValue);
        if (!product) {
            await interaction.reply({ content: 'Produto não encontrado no catálogo.', flags: MessageFlags.Ephemeral });
            return true;
        }
        let cents;
        try { cents = parsePriceCents(interaction.fields.getTextInputValue('amount').trim()); }
        catch (error) {
            await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
            return true;
        }
        setProductPriceCents(productValue, cents);
        await audit(interaction, 'Preço de produto definido', `${product.name} · ${formatPrice(cents)}`);
        await interaction.reply(makeProductPanel(productValue, `✅ **${product.name}** definido para **${formatPrice(cents)}**.`));
        return true;
    }

    const isNew = interaction.customId.startsWith('payment:submit-add:');
    const type = isNew ? interaction.customId.split(':')[2] : getPaymentConfig().methods.find(item => item.id === interaction.customId.split(':')[2])?.type;
    const id = isNew ? null : interaction.customId.split(':')[2];
    if (!type || !TYPE_LABELS[type]) {
        await interaction.reply({ content: 'Esse método não existe mais. Abra `/pagamentos` e tente novamente.', flags: MessageFlags.Ephemeral });
        return true;
    }
    let data;
    try { data = readMethodForm(interaction, type); }
    catch (error) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
        return true;
    }
    let saved;
    try { saved = isNew ? addPaymentMethod(data) : updatePaymentMethod(id, data); }
    catch (error) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
        return true;
    }
    if (!saved) {
        await interaction.reply({ content: 'Esse método não existe mais. Abra `/pagamentos` e tente novamente.', flags: MessageFlags.Ephemeral });
        return true;
    }
    await updatePublicStatusIfConfigured(interaction.guild);
    await audit(interaction, isNew ? 'Método de pagamento cadastrado' : 'Método de pagamento editado', saved.name);
    await interaction.reply(makePanel(saved.id, `✅ Método **${saved.name}** ${isNew ? 'cadastrado' : 'atualizado'}.`));
    return true;
}
