import { MessageFlags } from 'discord.js';
import { isServerManager } from '../services/authorization.js';
import {
    COMMERCE_AUTOMATION_LABELS, createCoupon, getCommerceConfig, getCommerceProduct, getCommerceProducts, removeCoupon,
    setCommerceAutomation, setProductDeliveryLink, setProductDeliveryMessage, setProductImage, setProductRole, setProductStock
} from '../repositories/commerceRepository.js';
import { getOrders, getOrderById } from '../repositories/orderRepository.js';
import { getFeedback } from '../repositories/feedbackRepository.js';
import { handlePaidOrder } from './commerceAutomations.js';
import { mercadoPagoConfigReady } from '../services/mercadoPago.js';
import { publicarVitrineLoja } from './commerce.js';

function money(cents) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100); }

export async function tratarAdminLoja(interaction) {
    if (!interaction.isChatInputCommand() || !['loja', 'pedido'].includes(interaction.commandName)) return false;
    if (!interaction.guild || !isServerManager(interaction)) {
        await interaction.reply({ content: 'Apenas o dono do servidor ou desenvolvedor configurado pode gerenciar a loja.', flags: MessageFlags.Ephemeral });
        return true;
    }

    if (interaction.commandName === 'pedido') {
        const action = interaction.options.getSubcommand();
        if (!['aprovar', 'entregar'].includes(action)) return false;
        const order = getOrderById(interaction.options.getString('id', true));
        if (!order || order.guildId !== interaction.guildId) {
            await interaction.reply({ content: 'Pedido não encontrado neste servidor.', flags: MessageFlags.Ephemeral });
            return true;
        }
        const result = action === 'aprovar'
            ? await handlePaidOrder(order.id, { status: 'approved', manual: true })
            : await handlePaidOrder(order.id, { status: 'approved', manual: true }, { forceDelivery: true });
        await interaction.reply({ content: result.ok ? `✅ Pedido ${order.id.slice(0, 8)} ${action === 'aprovar' ? 'marcado como pago' : 'reprocessado para entrega'}.${result.order?.status === 'paid_waiting_delivery' ? ` Entrega pendente: ${result.order.deliveryError}` : result.order?.status === 'paid' ? ' Liberação automática está desativada; faça a entrega manualmente.' : ' Cargo entregue automaticamente.'}` : result.reason, flags: MessageFlags.Ephemeral });
        return true;
    }

    const sub = interaction.options.getSubcommand();
    const config = getCommerceConfig();
    if (sub === 'status') {
        const automationLines = Object.entries(COMMERCE_AUTOMATION_LABELS).map(([key, label]) => `${config.automations[key] ? '🟢' : '⚪'} ${label}`);
        const products = getCommerceProducts({ includeInactive: false });
        const roleLines = products.map(product => `${product.name}: ${config.roles[product.value] ? `<@&${config.roles[product.value]}>` : 'não configurado'}`);
        const stockLines = products.map(product => `${product.name}: ${config.stock[product.value] === null ? '∞' : config.stock[product.value]}`);
        await interaction.reply({ content: `**Automações (novas ficam desligadas)**\n${automationLines.join('\n')}\n\n**Cargos de entrega**\n${roleLines.join('\n')}\n\n**Estoque configurado**\n${stockLines.join('\n')}\n\nMercado Pago: ${mercadoPagoConfigReady() ? 'credenciais e HTTPS detectados (ainda precisa ativar a automação)' : 'aguardando credenciais e URL HTTPS'}`, flags: MessageFlags.Ephemeral });
        return true;
    }
    if (sub === 'publicar') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const { channel } = await publicarVitrineLoja(interaction.guild);
            await interaction.editReply({ content: `✅ Vitrine publicada/atualizada em ${channel}. Os clientes podem adicionar cada produto ao carrinho.` });
        } catch (error) {
            console.error('[loja] Falha ao publicar vitrine:', error);
            await interaction.editReply({ content: 'Não consegui publicar a vitrine. Confira permissões de enviar mensagens, embeds e gerenciar canais.' });
        }
        return true;
    }
    if (sub === 'automacao') {
        const key = interaction.options.getString('tipo', true);
        const active = interaction.options.getBoolean('ativa', true);
        if (active && key === 'mercadoPago' && !mercadoPagoConfigReady()) {
            await interaction.reply({ content: 'Mercado Pago continua desligado: configure Access Token, assinatura do webhook e URL HTTPS pública antes de ativar.', flags: MessageFlags.Ephemeral });
            return true;
        }
        if (active && key === 'automaticDelivery' && getCommerceProducts({ includeInactive: false }).some(product => !config.roles[product.value])) {
            await interaction.reply({ content: 'Configure primeiro os cargos de todos os produtos com `/loja cargo`.', flags: MessageFlags.Ephemeral });
            return true;
        }
        setCommerceAutomation(key, active);
        await interaction.reply({ content: `${active ? '🟢 Preparado e ativado' : '⚪ Desativado'}: **${COMMERCE_AUTOMATION_LABELS[key]}**.`, flags: MessageFlags.Ephemeral });
        return true;
    }
    if (sub === 'cargo') {
        const product = interaction.options.getString('produto', true);
        const role = interaction.options.getRole('cargo', true);
        if (!getCommerceProduct(product)) throw new Error('Produto inválido.');
        setProductRole(product, role.id);
        await interaction.reply({ content: `Cargo ${role} vinculado ao produto **${getCommerceProduct(product).name}**. A automação de entrega continua no estado atual (desligada por padrão).`, flags: MessageFlags.Ephemeral });
        return true;
    }
    if (sub === 'instrucoes') {
        const product = interaction.options.getString('produto', true);
        const message = interaction.options.getString('texto', true);
        setProductDeliveryMessage(product, message);
        await interaction.reply({ content: `Instruções automáticas salvas para **${getCommerceProduct(product).name}**. Só serão enviadas se a entrega digital estiver ativada.`, flags: MessageFlags.Ephemeral });
        return true;
    }
    if (sub === 'imagem') {
        const product = interaction.options.getString('produto', true);
        const url = interaction.options.getString('url', true);
        setProductImage(product, url);
        await interaction.reply({ content: `Imagem salva para **${getCommerceProduct(product).name}**. A vitrine será atualizada quando for publicada novamente.`, flags: MessageFlags.Ephemeral });
        return true;
    }
    if (sub === 'link-entrega') {
        const product = interaction.options.getString('produto', true);
        const url = interaction.options.getString('url', true);
        setProductDeliveryLink(product, url);
        await interaction.reply({ content: `Link de entrega salvo para **${getCommerceProduct(product).name}**. Só será enviado se a automação de entrega digital estiver ativada.`, flags: MessageFlags.Ephemeral });
        return true;
    }
    if (sub === 'estoque') {
        const product = interaction.options.getString('produto', true);
        const quantity = interaction.options.getInteger('quantidade', true);
        setProductStock(product, quantity === 0 ? null : quantity);
        await interaction.reply({ content: `Estoque de **${getCommerceProduct(product).name}** definido para ${quantity === 0 ? 'ilimitado' : quantity}. A verificação continua desligada até ativar a automação de estoque.`, flags: MessageFlags.Ephemeral });
        return true;
    }
    if (sub === 'cupom-criar') {
        const code = interaction.options.getString('codigo', true);
        const percent = interaction.options.getInteger('desconto', true);
        const maxUses = interaction.options.getInteger('usos', true);
        const hours = interaction.options.getInteger('validade-horas');
        const expiresAt = hours ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() : null;
        const coupon = createCoupon({ code, percent, maxUses, expiresAt });
        await interaction.reply({ content: `Cupom **${coupon.code}** salvo: ${coupon.percent}% de desconto, até ${coupon.maxUses} usos${expiresAt ? `, expira em ${new Date(expiresAt).toLocaleString('pt-BR')}` : ''}. Aplicação de cupons está ${config.automations.coupons ? 'ativa' : 'desligada'}.`, flags: MessageFlags.Ephemeral });
        return true;
    }
    if (sub === 'cupom-remover') {
        const code = interaction.options.getString('codigo', true);
        const removed = removeCoupon(code);
        await interaction.reply({ content: removed ? `Cupom **${code.toUpperCase()}** removido.` : 'Cupom não encontrado.', flags: MessageFlags.Ephemeral });
        return true;
    }
    if (sub === 'relatorio') {
        const orders = getOrders().filter(order => order.guildId === interaction.guildId);
        const paid = orders.filter(order => order.paidAt);
        const pending = orders.filter(order => ['pending', 'awaiting_manual_confirmation'].includes(order.status));
        const total = paid.reduce((sum, order) => sum + (Number.isSafeInteger(order.amountCents) ? order.amountCents : 0), 0);
        const byProduct = getCommerceProducts({ includeInactive: true }).map(product => `${product.name}: ${paid.filter(order => order.productValue === product.value).length}`).join('\n');
        await interaction.reply({ content: `📊 **Relatório da loja**\nPedidos: ${orders.length} · Pagos: ${paid.length} · Pendentes: ${pending.length}\nFaturamento registrado: **${money(total)}**\n\n${byProduct}`, flags: MessageFlags.Ephemeral });
        return true;
    }
    if (sub === 'feedbacks') {
        const reviews = getFeedback().slice(-10).reverse();
        if (!reviews.length) {
            await interaction.reply({ content: 'Ainda não há avaliações registradas.', flags: MessageFlags.Ephemeral });
            return true;
        }
        const all = getFeedback();
        const average = all.reduce((sum, item) => sum + item.rating, 0) / all.length;
        const lines = reviews.map(item => `⭐ ${item.rating}/5 · <@${item.buyerId}>${item.comment ? `\n> ${item.comment.replace(/\n/g, '\n> ')}` : ''}`);
        await interaction.reply({ content: `**Avaliações recentes** · média ${average.toFixed(1)}/5 (${all.length})\n\n${lines.join('\n\n')}`.slice(0, 1900), flags: MessageFlags.Ephemeral });
        return true;
    }
    return false;
}
