import path from 'node:path';
import QRCode from 'qrcode';
import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, ModalBuilder,
    PermissionsBitField, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { client } from '../client.js';
import { getCommerceConfig, getCommerceProduct, getCommerceProducts, getUsableCoupon, consumeCoupon, releaseCoupon, reserveProductStock, releaseProductStock, saveStorefrontReference } from '../repositories/commerceRepository.js';
import { getProductPriceCents } from '../repositories/productCatalogRepository.js';
import { createOrder, updateOrder } from '../repositories/orderRepository.js';
import { createMercadoPagoPixPayment, mercadoPagoConfigReady } from '../services/mercadoPago.js';
import { trackMercadoPagoResponse } from '../services/mercadoPagoResponses.js';
import { logAction } from '../services/audit.js';
import { getSettings } from '../repositories/settingsRepository.js';
import { PATHS } from '../config/constants.js';
import { replyWithEmbedPages, splitEmbedPayload } from '../services/embedPagination.js';

function formatPrice(cents) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function productOptions() {
    return getCommerceProducts({ includeInactive: false }).map(product => {
        const cents = getProductPriceCents(product.value);
        return {
            label: product.name,
            description: cents ? `Carrinho · ${formatPrice(cents)}` : 'Preço ainda não configurado',
            value: product.value
        };
    });
}

export function criarSeletorProdutos() {
    const options = productOptions().slice(0, 25);
    if (!options.length) return null;
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('shop:product')
            .setPlaceholder('🛍️ Selecione um produto para ver o preço e pagar')
            .addOptions(options)
    );
}

export function criarVitrineLoja() {
    const config = getCommerceConfig();
    const filesByName = new Map();
    const products = getCommerceProducts({ includeInactive: false });
    const embeds = products.map(baseProduct => {
        const product = baseProduct;
        const cents = getProductPriceCents(product.value);
        const original = product.originalPriceCents;
        const discount = original && cents < original ? `~~${formatPrice(original)}~~  →  **${formatPrice(cents)}**` : `**${formatPrice(cents)}**`;
        const stock = config.automations.stock && Number.isSafeInteger(config.stock[product.value])
            ? String(config.stock[product.value]) : '∞';
        const embed = new EmbedBuilder().setColor(0x6C5CE7)
            .setTitle(`${product.emoji}  ${product.name}`)
            .setDescription(`*${product.description}*`)
            .addFields(
                { name: '💸 Preço', value: discount, inline: true },
                { name: '🛒 Estoque', value: stock, inline: true },
                { name: '🛂 Você receberá', value: product.roleIds?.length ? product.roleIds.map(roleId => `<@&${roleId}>`).join(' + ') : `**${product.roleName}**`, inline: true },
                { name: '🗓️ Validade', value: `${product.durationDays} dias`, inline: true }
            )
            .setFooter({ text: 'Powered by AG Solutions' });
        const imageUrl = config.images[product.value];
        if (imageUrl?.startsWith('asset:')) {
            const filename = path.basename(imageUrl.slice('asset:'.length));
            filesByName.set(filename, { attachment: path.join(PATHS.storeImages, filename), name: filename });
            embed.setImage(`attachment://${filename}`);
        } else if (imageUrl) embed.setImage(imageUrl);
        return embed;
    });
    return {
        content: '🛍️ **LOJA DA COMUNIDADE**\nEscolha um produto e pague com Pix do Mercado Pago. O cargo é liberado automaticamente após a confirmação.',
        embeds,
        components: products.length ? [new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('shop:product').setPlaceholder('Escolha um produto para comprar')
                .addOptions(products.slice(0, 25).map(product => ({ label: product.name.slice(0, 100), description: product.description.slice(0, 100), value: product.value, emoji: product.emoji || '🛍️' })))
        )] : [],
        files: [...filesByName.values()],
        allowedMentions: { parse: [] }
    };
}

export async function publicarSeletorProdutos(channel) {
    let messages;
    try {
        messages = await channel.messages.fetch({ limit: 25 });
    } catch (error) {
        console.warn(`[loja:${channel.id}] Não foi possível verificar o seletor existente:`, error.message);
        messages = [];
    }

    const productSelector = criarSeletorProdutos();
    const components = [
        ...(productSelector ? [productSelector] : []),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('fechar_ticket').setLabel('🔒 Fechar ticket').setStyle(ButtonStyle.Danger)
        )
    ];
    const bannerPath = path.join(PATHS.storeImages, 'access-roles-banner.png');
    const payload = {
        embeds: [],
        components,
        attachments: [],
        files: [{ attachment: bannerPath, name: 'access-roles-banner.png' }],
        allowedMentions: { parse: [] }
    };
    const exists = messages.find(message => message.author.id === client.user.id &&
        message.components.some(row => row.components.some(component => component.customId === 'shop:product' || component.customId?.startsWith('shop:add:'))));
    if (exists) {
        await exists.edit({
            ...payload,
            content: productSelector ? null : 'No momento não há produtos disponíveis para compra.'
        });
    } else {
        await channel.send({
            ...payload,
            ...(productSelector ? {} : { content: 'No momento não há produtos disponíveis para compra.' })
        });
    }

    const legacyGreeting = /^(?:☀️ \*\*Bom dia!\*\*|🌤️ \*\*Boa tarde!\*\*|🌙 \*\*Boa noite!\*\*) Tudo bem\? No que posso ajudar\?$/;
    for (const message of messages.values()) {
        if (message.author.id !== client.user.id || message.id === exists?.id) continue;
        const oldTicketIntro = message.embeds.some(embed => embed.title === '🎫 • ATENDIMENTO');
        if (!oldTicketIntro && !legacyGreeting.test(message.content)) continue;
        try {
            await message.delete();
        } catch (error) {
            console.warn(`[loja:${channel.id}] Não foi possível remover uma mensagem antiga do ticket:`, error.message);
        }
    }
}

export async function publicarVitrineLoja(guild) {
    const config = getCommerceConfig();
    const configuredChannelId = config.storeChannelId || getSettings().channels.purchaseStatus;
    let channel = configuredChannelId ? await guild.channels.fetch(configuredChannelId).catch(() => null) : null;
    if (!channel?.isTextBased()) {
        channel = await guild.channels.create({
            name: '🛍️・loja', type: ChannelType.GuildText,
            topic: 'Vitrine de produtos e carrinho da loja do servidor.',
            permissionOverwrites: [
                { id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory], deny: [PermissionsBitField.Flags.SendMessages] },
                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks] }
            ]
        });
    }
    const payloadPages = splitEmbedPayload(criarVitrineLoja());
    const savedPageIds = config.storeChannelId === channel.id
        ? [config.storeMessageId, ...(config.storePageMessageIds ?? [])].filter(Boolean) : [];
    const existingPages = await Promise.all(savedPageIds.map(id => channel.messages.fetch(id).catch(() => null)));
    const messages = [];
    for (const [index, payload] of payloadPages.entries()) {
        const existing = existingPages[index];
        const message = existing ? await existing.edit(payload) : await channel.send(payload);
        messages.push(message);
    }
    for (const stale of existingPages.slice(payloadPages.length).filter(Boolean)) {
        await stale.delete().catch(error => console.warn(`[loja:${channel.id}] Não foi possível remover uma página antiga da vitrine:`, error.message));
    }
    const message = messages[0];
    saveStorefrontReference(channel.id, message.id, messages.slice(1).map(item => item.id));
    return { channel, message };
}

function couponModal(product) {
    return new ModalBuilder().setCustomId(`shop:coupon-submit:${product.value}`).setTitle('Aplicar cupom')
        .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('code').setLabel('Código do cupom').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(24)
        ));
}

function mercadoPagoPixModal(product, couponCode = '') {
    return new ModalBuilder()
        .setCustomId(`shop:pix-submit:${product.value}:${couponCode}`)
        .setTitle(`Pix Mercado Pago · ${product.name.slice(0, 24)}`)
        .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('email').setLabel('Seu e-mail de pagador no Mercado Pago')
                .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120)
        ));
}

function checkoutView(product, coupon = null) {
    const baseCents = getProductPriceCents(product.value);
    const amountCents = coupon ? Math.max(1, Math.round(baseCents * (100 - coupon.percent) / 100)) : baseCents;
    const label = coupon ? `~~${formatPrice(baseCents)}~~ **${formatPrice(amountCents)}** (cupom ${coupon.code} · ${coupon.percent}% OFF)` : formatPrice(amountCents);
    const buttons = [
        new ButtonBuilder()
            .setCustomId(`shop:pix:${product.value}:${coupon?.code ?? ''}`)
            .setLabel('Continuar com Pix do Mercado Pago')
            .setStyle(ButtonStyle.Success)
    ];
    if (!coupon && getCommerceConfig().automations.coupons) {
        buttons.push(new ButtonBuilder().setCustomId(`shop:coupon:${product.value}`).setLabel('Tenho um cupom').setStyle(ButtonStyle.Secondary));
    }
    return {
        content: `🛒 **${product.name}** · ${label}\nO pagamento será criado pelo Mercado Pago e confirmado automaticamente antes da entrega do cargo.`,
        components: [new ActionRowBuilder().addComponents(buttons)],
        flags: MessageFlags.Ephemeral
    };
}

async function validateCheckout(interaction, product) {
    if (!product || !product.active) return 'Esse produto não está disponível.';
    if (!getProductPriceCents(product.value)) return `O preço de **${product.name}** ainda não foi configurado no painel da loja.`;
    const config = getCommerceConfig();
    if (!config.automations.mercadoPago || !mercadoPagoConfigReady()) {
        return 'O pagamento da loja é feito somente pelo Mercado Pago, mas a integração não está ativa ou configurada. Avise a equipe.';
    }
    if (!config.automations.automaticDelivery) return 'A entrega automática está desligada. A equipe precisa ativá-la em `/loja automacao` antes de receber pedidos.';
    const roleIds = product.roleIds?.length ? product.roleIds : [product.roleId].filter(Boolean);
    if (!roleIds.length) return `Os cargos de entrega de **${product.name}** ainda não foram vinculados. A equipe precisa configurá-los no painel da loja ou em \`/loja cargo\`.`;
    if (!interaction.guild) return 'A compra precisa ser iniciada dentro do servidor.';
    if (config.automations.stock && config.stock[product.value] === 0) return `O produto **${product.name}** está sem estoque no momento.`;

    const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        return 'O bot precisa da permissão Gerenciar Cargos para entregar este produto.';
    }
    const roles = await Promise.all(roleIds.map(roleId => interaction.guild.roles.fetch(roleId).catch(() => null)));
    const invalid = roles.find(role => !role || role.managed || botMember.roles.highest.comparePositionTo(role) <= 0);
    if (invalid || roles.some(role => !role)) {
        return `Um dos cargos de **${product.name}** é inválido ou está acima do cargo do bot. Ajuste os cargos no painel da loja.`;
    }
    return null;
}

async function auditarCompra(interaction, order, method) {
    try {
        await logAction(interaction.guild, interaction.user.id, 'Compra iniciada',
            `${order.productName} · ${formatPrice(order.amountCents)} · ${method.name} · pedido ${order.id.slice(0, 8)}`);
    } catch (error) {
        console.error('[loja] Não foi possível registrar a compra na auditoria:', error);
    }
}

export async function tratarInteracaoCompras(interaction) {
    const command = interaction.isChatInputCommand() && interaction.commandName === 'comprar';
    const component = (interaction.isStringSelectMenu() || interaction.isButton()) && interaction.customId.startsWith('shop:');
    const couponModalSubmit = interaction.isModalSubmit() && interaction.customId.startsWith('shop:coupon-submit:');
    const pixModalSubmit = interaction.isModalSubmit() && interaction.customId.startsWith('shop:pix-submit:');
    if (!command && !component && !couponModalSubmit && !pixModalSubmit) return false;

    if (command) {
        const view = criarVitrineLoja();
        await replyWithEmbedPages(interaction, { ...view, flags: MessageFlags.Ephemeral });
        return true;
    }

    if (component && (interaction.customId.startsWith('shop:coupon:') || interaction.customId.startsWith('shop:add:'))) {
        const [, action, productValue] = interaction.customId.split(':');
        const product = getCommerceProduct(productValue);
        if (!product || !product.active) {
            await interaction.reply({ content: 'Esse produto não existe mais no catálogo.', flags: MessageFlags.Ephemeral });
            return true;
        }
        if (action === 'coupon') {
            if (!getCommerceConfig().automations.coupons) {
                await interaction.reply({ content: 'Cupons estão indisponíveis no momento.', flags: MessageFlags.Ephemeral });
                return true;
            }
            await interaction.showModal(couponModal(product));
            return true;
        }
        const issue = await validateCheckout(interaction, product);
        if (issue) {
            await interaction.reply({ content: issue, flags: MessageFlags.Ephemeral });
            return true;
        }
        await interaction.reply(checkoutView(product));
        return true;
    }

    if (couponModalSubmit) {
        const product = getCommerceProduct(interaction.customId.split(':')[2]);
        const coupon = getUsableCoupon(interaction.fields.getTextInputValue('code'));
        if (!product || !product.active || !coupon) {
            await interaction.reply({ content: 'Cupom inválido, expirado ou sem usos disponíveis.', flags: MessageFlags.Ephemeral });
            return true;
        }
        const issue = await validateCheckout(interaction, product);
        if (issue) {
            await interaction.reply({ content: issue, flags: MessageFlags.Ephemeral });
            return true;
        }
        await interaction.reply(checkoutView(product, coupon));
        return true;
    }

    if (interaction.customId === 'shop:product') {
        const product = getCommerceProduct(interaction.values[0]);
        const issue = await validateCheckout(interaction, product);
        if (issue) {
            await interaction.reply({ content: issue, flags: MessageFlags.Ephemeral });
            return true;
        }
        await interaction.reply(checkoutView(product));
        return true;
    }

    if (component && interaction.customId.startsWith('shop:pix:')) {
        const [, , productValue, couponCode] = interaction.customId.split(':');
        const product = getCommerceProduct(productValue);
        const issue = await validateCheckout(interaction, product);
        if (issue) {
            await interaction.reply({ content: issue, flags: MessageFlags.Ephemeral });
            return true;
        }
        const coupon = couponCode ? getUsableCoupon(couponCode) : null;
        if (couponCode && !coupon) {
            await interaction.reply({ content: 'Esse cupom expirou ou não possui mais usos. Selecione o produto novamente.', flags: MessageFlags.Ephemeral });
            return true;
        }
        await interaction.showModal(mercadoPagoPixModal(product, coupon?.code));
        return true;
    }

    if (component && interaction.customId.startsWith('shop:method:')) {
        await interaction.reply({ content: 'A loja agora aceita somente Pix do Mercado Pago. Execute `/comprar` novamente para gerar um novo pedido.', flags: MessageFlags.Ephemeral });
        return true;
    }

    if (!pixModalSubmit) return true;

    const [, , productValue, couponCode] = interaction.customId.split(':');
    const product = getCommerceProduct(productValue);
    const issue = await validateCheckout(interaction, product);
    if (issue) {
        await interaction.reply({ content: issue, flags: MessageFlags.Ephemeral });
        return true;
    }
    const coupon = couponCode ? getUsableCoupon(couponCode) : null;
    if (couponCode && !coupon) {
        await interaction.reply({ content: 'Esse cupom expirou ou não possui mais usos. Inicie novamente a compra para usar outro cupom.', flags: MessageFlags.Ephemeral });
        return true;
    }
    const payerEmail = interaction.fields.getTextInputValue('email').trim();
    if (payerEmail.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
        await interaction.reply({ content: 'Informe um endereço de e-mail válido para o pagador.', flags: MessageFlags.Ephemeral });
        return true;
    }

    const baseCents = getProductPriceCents(product.value);
    const amountCents = coupon ? Math.max(1, Math.round(baseCents * (100 - coupon.percent) / 100)) : baseCents;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let reservation;
    let couponConsumed = false;
    let order;
    let paymentCreated = false;
    try {
        reservation = reserveProductStock(product.value);
        if (!reservation.ok) {
            await interaction.editReply({ content: 'Esse produto está sem estoque no momento.' });
            return true;
        }

        if (coupon && !consumeCoupon(coupon.code)) {
            if (reservation.reserved) releaseProductStock(product.value);
            await interaction.editReply({ content: 'O cupom acabou de atingir o limite de uso. Inicie novamente a compra para tentar outro.' });
            return true;
        }
        couponConsumed = Boolean(coupon);

        order = createOrder({
            guildId: interaction.guild.id, channelId: interaction.channelId, buyerId: interaction.user.id,
            productValue: product.value, productName: product.name, paymentMethodId: 'mercadopago',
            paymentMethodName: 'Mercado Pago Pix', amountCents, provider: 'mercadoPago',
            stockReserved: reservation.reserved, couponCode: coupon?.code ?? null, discountPercent: coupon?.percent ?? 0
        });

        const payment = await createMercadoPagoPixPayment({
            externalReference: order.id,
            payerEmail,
            amountCents,
            description: `${product.name} · pedido ${order.id.slice(0, 8)}`,
            metadata: { order_id: order.id, guild_id: order.guildId, buyer_id: order.buyerId, product_value: product.value }
        });
        paymentCreated = true;
        const updatedOrder = updateOrder(order.id, {
            providerPaymentId: payment.id, providerStatus: 'pending'
        });
        if (!updatedOrder) throw new Error('Pix criado, mas não foi possível salvar o vínculo com o pedido.');

        trackMercadoPagoResponse(
            order.id,
            interaction.webhook,
            `✅ **Pagamento confirmado!** O cargo de **${product.name}** foi atribuído à sua conta.`
        );
        await auditarCompra(interaction, order, { name: 'Mercado Pago Pix' });

        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('Pix · Mercado Pago')
            .setDescription('Escaneie o QR Code ou copie o código Pix. **O pagamento é confirmado automaticamente** e o cargo será entregue após a aprovação.')
            .addFields(
                { name: 'Produto', value: product.name, inline: true },
                { name: 'Valor', value: formatPrice(amountCents), inline: true },
                { name: 'Pix Copia e Cola', value: `\`${payment.qrCode.slice(0, 1000)}\`` }
            )
            .setImage('attachment://pix-mercado-pago.png')
            .setFooter({ text: `Pedido ${order.id.slice(0, 8)} · aguardando confirmação do Mercado Pago` });
        await interaction.editReply({
            content: payment.ticketUrl ? `Cobrança Pix criada. [Abrir no Mercado Pago](${payment.ticketUrl})` : 'Cobrança Pix criada. Esta mensagem será atualizada quando o pagamento for aprovado.',
            embeds: [embed],
            files: [{ attachment: payment.qrImage, name: 'pix-mercado-pago.png' }],
            components: [],
            allowedMentions: { parse: [] }
        });
    } catch (error) {
        if (!paymentCreated) {
            if (reservation?.reserved) releaseProductStock(product.value);
            if (couponConsumed) releaseCoupon(coupon.code);
            if (order) updateOrder(order.id, {
                status: 'payment_creation_failed', stockReserved: false, couponCode: null,
                paymentError: String(error.message).slice(0, 300)
            });
        }
        console.error(`[loja:${interaction.id}] Falha ao gerar a cobrança Pix:`, error);
        const message = paymentCreated
            ? `O Pix foi criado, mas houve uma falha ao exibir ou salvar os dados. Não inicie outro pagamento; avise a equipe com o pedido ${order?.id.slice(0, 8) ?? 'sem identificação'}.`
            : 'Não consegui gerar a cobrança Pix. Nenhum cargo foi entregue; tente novamente ou avise a equipe.';
        await interaction.editReply({ content: message, embeds: [], files: [], components: [] }).catch(editError => {
            console.error(`[loja:${interaction.id}] Não consegui informar a falha ao comprador:`, editError.message);
        });
    }
    return true;
}
