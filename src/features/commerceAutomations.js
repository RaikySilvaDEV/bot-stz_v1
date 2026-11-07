import { ChannelType } from 'discord.js';
import { client } from '../client.js';
import { GUILD_ID } from '../config/constants.js';
import { getCommerceConfig, releaseCoupon, releaseProductStock, saveLastCommerceReport } from '../repositories/commerceRepository.js';
import { getOrders, updateOrder } from '../repositories/orderRepository.js';
import { getCommerceProduct } from '../repositories/commerceRepository.js';
import { getSettings } from '../repositories/settingsRepository.js';
import {
    getMercadoPagoTestPayment, markMercadoPagoTestPaymentDelivered
} from '../repositories/mercadoPagoTestPaymentRepository.js';
import { confirmMercadoPagoResponse } from '../services/mercadoPagoResponses.js';
import { calculateMercadoPagoSettlement } from '../services/mercadoPagoSettlement.js';
import { logAction, logRoleChange, logSale } from '../services/audit.js';
import { archiveAndCloseTicket } from '../services/ticketClosure.js';
import { sendPurchaseFeedbackPrompt } from './commerceFeedback.js';

const DAY = 24 * 60 * 60 * 1000;
let timer;
let running = false;

function formatPrice(cents) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

async function registrarVendaEFecharTicket(order) {
    let guild = client.guilds.cache.get(order.guildId) ?? await client.guilds.fetch(order.guildId).catch(() => null);
    if (!guild) return false;

    if (!order.salesLogAt) {
        const product = getCommerceProduct(order.productValue);
        const roleIds = order.deliveryRoleIds?.length ? order.deliveryRoleIds : [order.deliveryRoleId].filter(Boolean);
        const roles = await Promise.all(roleIds.map(roleId => guild.roles.fetch(roleId).catch(() => null)));
        const customer = await guild.members.fetch(order.buyerId).catch(() => null);
        const customerName = customer?.displayName ?? order.buyerId;
        const cargo = roles.filter(Boolean).map(role => role.name).join(', ') || product?.roleName || 'não identificado';
        await logAction(guild, order.buyerId, 'Venda aprovada',
            `Cliente: ${customerName}; produto: ${order.productName}; valor bruto: ${formatPrice(order.amountCents)}; taxa Mercado Pago: ${Number.isSafeInteger(order.feeAmountCents) ? formatPrice(order.feeAmountCents) : 'indisponível'}; líquido recebido: ${Number.isSafeInteger(order.netAmountCents) ? formatPrice(order.netAmountCents) : 'indisponível'}; cargo: ${cargo}; pedido: ${order.id}`);
        updateOrder(order.id, { salesLogAt: new Date().toISOString() });
        order.salesLogAt = new Date().toISOString();
    }
    if (!order.saleChannelLogAt && await logSale(guild, order)) {
        const timestamp = new Date().toISOString();
        updateOrder(order.id, { saleChannelLogAt: timestamp });
        order.saleChannelLogAt = timestamp;
    }

    if (order.ticketClosedAt || order.status !== 'delivered') return true;
    const now = Date.now();
    if (order.ticketCloseAttemptAt && now - Date.parse(order.ticketCloseAttemptAt) < 5 * 60 * 1000) return true;
    updateOrder(order.id, { ticketCloseAttemptAt: new Date(now).toISOString(), ticketCloseError: null });

    const ticket = await guild.channels.fetch(order.channelId).catch(() => null);
    if (!ticket) {
        updateOrder(order.id, { ticketClosedAt: new Date().toISOString(), ticketCloseError: null });
        return true;
    }
    const ownerMatches = new RegExp(`(?:^|;)ticket-owner:${order.buyerId}(?:;|$)`).test(ticket.topic ?? '');
    const isPurchaseTicket = (ticket.topic ?? '').includes('ticket-type:compra');
    if (ticket.type !== ChannelType.GuildText || !ownerMatches || !isPurchaseTicket) {
        updateOrder(order.id, { ticketCloseSkippedAt: new Date().toISOString() });
        console.warn(`[loja:${order.id}] O canal do pedido não corresponde ao ticket de compra do cliente; não será fechado.`);
        return true;
    }

    try {
        await ticket.send({
            content: `✅ Pagamento confirmado e cargo liberado para **${order.productName}**. A venda foi registrada; este ticket será fechado automaticamente em 5 segundos.`,
            allowedMentions: { parse: [] }
        });
        await new Promise(resolve => setTimeout(resolve, 5_000));
        await archiveAndCloseTicket(guild, ticket, order.buyerId, `Compra ${order.id} paga e entregue`);
        updateOrder(order.id, { ticketClosedAt: new Date().toISOString(), ticketCloseError: null });
        return true;
    } catch (error) {
        updateOrder(order.id, { ticketCloseError: String(error.message).slice(0, 300) });
        console.error(`[loja:${order.id}] Venda registrada, mas não foi possível fechar o ticket; haverá nova tentativa:`, error.message);
        return false;
    }
}

async function reconcileDeliveredOrderRoles(order, guild, now) {
    if (!guild || order.status !== 'delivered' || order.deliveryRolesSyncedAt ||
        (order.entitlementExpiresAt && Date.parse(order.entitlementExpiresAt) <= now)) return;
    const product = getCommerceProduct(order.productValue);
    const desiredRoleIds = product?.roleIds?.length ? product.roleIds : [product?.roleId].filter(Boolean);
    if (!desiredRoleIds.length) return;
    const member = await guild.members.fetch(order.buyerId).catch(() => null);
    if (!member) return;
    const roles = await Promise.all(desiredRoleIds.map(roleId => guild.roles.fetch(roleId).catch(() => null)));
    if (roles.some(role => !role || role.managed || guild.members.me.roles.highest.comparePositionTo(role) <= 0)) return;
    try {
        for (const role of roles) {
            if (!member.roles.cache.has(role.id)) {
                await member.roles.add(role, `Sincronização de cargos do pedido ${order.id}`);
                await logRoleChange(guild, { member, role, action: 'assignment', orderId: order.id });
            }
        }
        const deliveryRoleIds = [...new Set([...(order.deliveryRoleIds ?? []), order.deliveryRoleId, ...roles.map(role => role.id)].filter(Boolean))];
        updateOrder(order.id, { deliveryRoleId: order.deliveryRoleId ?? roles[0].id, deliveryRoleIds, deliveryRolesSyncedAt: new Date().toISOString(), deliveryError: null });
    } catch (error) {
        console.warn(`[loja:sincronização:${order.id}] Não foi possível completar todos os cargos; haverá nova tentativa:`, error.message);
    }
}

export async function handlePaidOrder(orderId, paymentDetails = {}, { forceDelivery = false } = {}) {
    const order = getOrders().find(item => item.id === orderId);
    if (!order) return { ok: false, reason: 'Pedido não encontrado.' };
    if (order.paidAt && !forceDelivery) return { ok: true, duplicate: true, order };
    if (order.paidAt && order.status === 'delivered') return { ok: true, duplicate: true, order };
    const product = getCommerceProduct(order.productValue);
    if (!product) return { ok: false, reason: 'Produto não existe no catálogo.' };
    const config = getCommerceConfig();
    const paidAt = order.paidAt ?? new Date().toISOString();
    const expiresAt = new Date(Date.now() + product.durationDays * DAY).toISOString();
    const settlement = order.provider === 'mercadoPago' && paymentDetails.id
        ? calculateMercadoPagoSettlement(paymentDetails, order.amountCents)
        : null;
    let updated = updateOrder(order.id, {
        status: 'paid', paidAt, entitlementExpiresAt: expiresAt,
        providerPaymentId: paymentDetails.id ?? order.providerPaymentId ?? null,
        providerStatus: paymentDetails.status ?? 'approved', stockReserved: false,
        ...(settlement ?? (order.provider === 'mercadoPago' && paymentDetails.id
            ? { grossAmountCents: order.amountCents, netAmountCents: null, feeAmountCents: null, settlementSource: null }
            : {}))
    });
    if (order.stockReserved) {
        // A reserva vira venda; não devolver ao estoque.
    }
    if (config.automations.automaticDelivery) {
        const roleIds = product.roleIds?.length ? product.roleIds : [config.roles[product.value]].filter(Boolean);
        try {
            if (!roleIds.length) throw new Error('Cargo do produto ainda não foi configurado em /loja cargo.');
            const guild = client.guilds.cache.get(order.guildId) ?? await client.guilds.fetch(order.guildId);
            const member = await guild.members.fetch(order.buyerId);
            const roles = await Promise.all(roleIds.map(roleId => guild.roles.fetch(roleId)));
            for (const role of roles) {
                if (!role || role.managed || guild.members.me.roles.highest.comparePositionTo(role) <= 0) throw new Error(`Cargo ${role?.name ?? 'desconhecido'} inválido ou acima do cargo do bot.`);
            }
            for (const role of roles) {
                if (!member.roles.cache.has(role.id)) {
                    await member.roles.add(role, `Pedido pago ${order.id}`);
                    await logRoleChange(guild, { member, role, action: 'assignment', orderId: order.id });
                }
            }
            updated = updateOrder(order.id, { status: 'delivered', deliveredAt: new Date().toISOString(),
                deliveryRoleId: roles[0].id, deliveryRoleIds: roles.map(role => role.id), deliveryRolesSyncedAt: new Date().toISOString() });
            if (config.automations.digitalDelivery) {
                const message = config.deliveryMessages[product.value] || product.description;
                const link = config.deliveryLinks[product.value];
                await member.send(`✅ Pagamento confirmado! Seu acesso **${product.name}** foi liberado por ${product.durationDays} dias. Expira em ${new Date(expiresAt).toLocaleString('pt-BR')}.\n\n${message}${link ? `\n\n📦 **Seu conteúdo:** ${link}` : ''}`).catch(error => console.warn('[loja] Não consegui enviar a confirmação por DM:', error.message));
            }
        } catch (error) {
            console.error(`[loja:entrega:${order.id}] Não foi possível entregar o cargo:`, error.message);
            updated = updateOrder(order.id, { status: 'paid_waiting_delivery', deliveryError: error.message });
        }
    }
    if (config.automations.purchaseFeedback && !order.feedbackPromptedAt) {
        try {
            const buyer = await client.users.fetch(order.buyerId);
            await sendPurchaseFeedbackPrompt(buyer, { ...updated, paidAt });
            updated = updateOrder(order.id, { feedbackPromptedAt: new Date().toISOString() });
        } catch (error) {
            console.warn(`[loja:feedback:${order.id}] Não consegui enviar a pesquisa:`, error.message);
        }
    }
    if (order.provider === 'mercadoPago' && updated.status === 'delivered') {
        try {
            await confirmMercadoPagoResponse(order.id);
        } catch (error) {
            console.warn(`[mercado-pago:${order.id}] Não consegui atualizar a mensagem de confirmação:`, error.message);
        }
    }
    if (order.provider === 'mercadoPago' && updated.status === 'delivered') {
        await registrarVendaEFecharTicket({ ...updated });
    }
    return { ok: true, order: updated };
}

function localDateParts(date, timezone) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(date).reduce((acc, item) => (acc[item.type] = item.value, acc), {});
}

async function runDailyReport(config, now, dateKey) {
    const parts = localDateParts(now, getSettings().timezone);
    if (!config.automations.salesReports || Number(parts.hour) < 9 || config.lastReportDate === dateKey) return;
    const guild = client.guilds.cache.get(GUILD_ID);
    const channelId = getSettings().channels.audit;
    const channel = guild && channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (!channel?.isTextBased()) return;
    const orders = getOrders().filter(order => {
        if (!order.paidAt) return false;
        const paid = localDateParts(new Date(order.paidAt), getSettings().timezone);
        return `${paid.year}-${paid.month}-${paid.day}` === dateKey;
    });
    const total = orders.reduce((sum, order) => sum + (Number.isSafeInteger(order.amountCents) ? order.amountCents : 0), 0);
    await channel.send(`📈 **Relatório diário da loja · ${dateKey}**\nPedidos pagos: **${orders.length}** · Total: **R$ ${(total / 100).toFixed(2).replace('.', ',')}**`);
    saveLastCommerceReport(dateKey);
}

export async function runCommerceAutomations() {
    if (running) return;
    running = true;
    try {
        const config = getCommerceConfig();
        const now = Date.now();
        const guild = client.guilds.cache.get(GUILD_ID);
        for (const order of getOrders()) {
            if (config.automations.automaticDelivery && order.status === 'delivered' && !order.deliveryRolesSyncedAt) {
                await reconcileDeliveredOrderRoles(order, client.guilds.cache.get(order.guildId) ?? guild, now);
            }
            if (order.provider === 'mercadoPago' && order.paidAt && order.status === 'delivered' &&
                ((!order.ticketClosedAt && !order.ticketCloseSkippedAt) || !order.saleChannelLogAt)) {
                await registrarVendaEFecharTicket(order);
            }
            if (['pending', 'awaiting_manual_confirmation'].includes(order.status)) {
                const age = now - Date.parse(order.createdAt);
                if (config.automations.paymentReminders && age >= 30 * 60 * 1000 && (!order.lastReminderAt || now - Date.parse(order.lastReminderAt) >= 12 * 60 * 60 * 1000)) {
                    const user = await client.users.fetch(order.buyerId).catch(() => null);
                    await user?.send(`⏳ Seu pedido **${order.productName}** ainda está aguardando pagamento. Se já pagou, envie o comprovante no ticket.`).catch(() => {});
                    updateOrder(order.id, { lastReminderAt: new Date().toISOString() });
                }
                if (config.automations.abandonedOrders && age >= DAY) {
                    updateOrder(order.id, { status: 'abandoned', abandonedAt: new Date().toISOString() });
                    if (order.stockReserved) releaseProductStock(order.productValue);
                    if (order.couponCode) releaseCoupon(order.couponCode);
                    const user = await client.users.fetch(order.buyerId).catch(() => null);
                    await user?.send(`Seu pedido **${order.productName}** expirou e o carrinho foi cancelado. Você pode iniciar uma nova compra quando quiser.`).catch(() => {});
                }
            }
            if (config.automations.roleExpiration && order.entitlementExpiresAt && !order.roleExpiredAt && Date.parse(order.entitlementExpiresAt) <= now && (order.deliveryRoleIds?.length || order.deliveryRoleId)) {
                try {
                    const targetGuild = client.guilds.cache.get(order.guildId) ?? guild;
                    const member = await targetGuild?.members.fetch(order.buyerId);
                    const roleIds = [...new Set(order.deliveryRoleIds?.length ? order.deliveryRoleIds : [order.deliveryRoleId].filter(Boolean))];
                    const orders = getOrders();
                    for (const roleId of roleIds) {
                        const hasNewerAccess = orders.some(other => other.id !== order.id && other.guildId === order.guildId && other.buyerId === order.buyerId &&
                            (other.deliveryRoleIds?.includes(roleId) || other.deliveryRoleId === roleId) && other.entitlementExpiresAt && Date.parse(other.entitlementExpiresAt) > now && !other.roleExpiredAt);
                        if (!hasNewerAccess && member?.roles.cache.has(roleId)) {
                            await member.roles.remove(roleId, `Acesso expirado no pedido ${order.id}`);
                            const role = await targetGuild.roles.fetch(roleId).catch(() => null);
                            if (role) await logRoleChange(targetGuild, { member, role, action: 'removal', orderId: order.id });
                        }
                    }
                    updateOrder(order.id, { status: 'expired', roleExpiredAt: new Date().toISOString() });
                } catch (error) {
                    console.error(`[loja:expiracao:${order.id}] Não foi possível remover o cargo:`, error.message);
                }
            }
            if (config.automations.roleExpiration && order.entitlementExpiresAt && !order.expirationReminderAt &&
                Date.parse(order.entitlementExpiresAt) > now && Date.parse(order.entitlementExpiresAt) - now <= DAY) {
                const buyer = await client.users.fetch(order.buyerId).catch(() => null);
                await buyer?.send(`⏰ Seu acesso **${order.productName}** expira em até 24 horas. Se quiser continuar, você pode renovar pela loja.`).catch(() => {});
                updateOrder(order.id, { expirationReminderAt: new Date().toISOString() });
            }
        }
        const dateKey = localDateParts(new Date(now), getSettings().timezone);
        await runDailyReport(config, new Date(now), `${dateKey.year}-${dateKey.month}-${dateKey.day}`);
    } catch (error) {
        console.error('[loja:automacoes] Falha ao executar a rotina; novas execuções continuarão:', error);
    } finally { running = false; }
}

export function startCommerceAutomations() {
    if (timer) return;
    timer = setInterval(() => void runCommerceAutomations(), 60_000);
    timer.unref?.();
}

export async function recordMercadoPagoPayment(payment) {
    if (payment.status !== 'approved') return { ok: true, ignored: true };
    const orderId = payment.external_reference || payment.metadata?.order_id;
    if (!orderId) return { ok: false, reason: 'Pagamento sem referência do pedido.' };
    if (typeof orderId === 'string' && orderId.startsWith('bot-test-')) {
        const testPayment = getMercadoPagoTestPayment(orderId);
        if (!testPayment || testPayment.status === 'delivered') return { ok: true, ignored: true };
        if (testPayment.status !== 'pending' || String(payment.id) !== testPayment.paymentId ||
            payment.currency_id !== 'BRL' || Math.round(Number(payment.transaction_amount) * 100) !== testPayment.amountCents) {
            return { ok: false, reason: 'O pagamento não confere com a cobrança de teste.' };
        }
        try {
            const guild = client.guilds.cache.get(testPayment.guildId) ?? await client.guilds.fetch(testPayment.guildId);
            const role = await guild.roles.fetch(testPayment.roleId);
            if (!role || role.managed || guild.members.me.roles.highest.comparePositionTo(role) <= 0) {
                throw new Error('Cargo de teste inválido ou acima do cargo do bot.');
            }
            const member = await guild.members.fetch(testPayment.buyerId);
            if (!member.roles.cache.has(role.id)) await member.roles.add(role, `Pagamento Pix de teste aprovado ${payment.id}`);
            markMercadoPagoTestPaymentDelivered(orderId);
            try {
                await confirmMercadoPagoResponse(orderId);
            } catch (error) {
                console.warn(`[mercado-pago:teste:${orderId}] Não consegui mostrar a confirmação:`, error.message);
            }
            return { ok: true, delivered: true };
        } catch (error) {
            console.error(`[mercado-pago:teste:${orderId}] Não foi possível entregar o cargo de teste:`, error.message);
            return { ok: false, reason: 'Pagamento confirmado, mas não foi possível entregar o cargo de teste.' };
        }
    }
    const order = getOrders().find(item => item.id === orderId);
    if (!order || order.provider !== 'mercadoPago' || order.guildId !== GUILD_ID ||
        (order.providerPaymentId && String(payment.id) !== String(order.providerPaymentId)) ||
        payment.currency_id !== 'BRL' || order.amountCents !== Math.round(Number(payment.transaction_amount) * 100)) {
        return { ok: false, reason: 'O pedido não confere com o pagamento.' };
    }
    return handlePaidOrder(order.id, payment);
}
