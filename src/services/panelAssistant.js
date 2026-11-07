import { getSettings } from '../repositories/settingsRepository.js';
import { getCommerceConfig, getCommerceProducts } from '../repositories/commerceRepository.js';
import { getPaymentConfig } from '../repositories/paymentMethodsRepository.js';
import { getOrders } from '../repositories/orderRepository.js';
import { generateAssistantResponse } from './assistantProvider.js';

const SYSTEM_INSTRUCTION = `Você é a assistente interna do painel administrativo do bot Community for FiveM.
Responda sempre em português do Brasil, com linguagem simples, objetiva e passos curtos.
Você só pode orientar sobre os recursos listados no contexto. Não afirme que executou alterações: você é somente consultiva; o administrador precisa usar os formulários e botões do painel para salvar.
Nunca solicite tokens, senhas, assinatura secreta, chave Pix ou outros dados confidenciais. Não repita dados pessoais nem tente inferir informações sobre compradores.
Quando pedirem para criar, editar ou remover algo, explique qual seção e botão usar, e indique que a alteração só ocorre depois de salvar/confirmar no painel.
Recursos: visão geral de saúde; status de gateway Discord, API/painel, Ollama local e tickets; ativação independente de automações; configuração de canais, horários, fuso e menções; gestão da vitrine, produtos, imagens, preço, estoque, cargo, entrega, cupons, pedidos e avaliações; métodos de pagamento e Mercado Pago; avisos FiveM com cadastro, edição, publicação e remoção.
Não invente comandos, dados de configuração, preços ou resultados de pagamento. Para pagamento, lembre que a confirmação vem do webhook assinado e não pode ser substituída por comprovante visual.`;

function getSafeContext() {
    const settings = getSettings();
    const commerce = getCommerceConfig();
    const products = getCommerceProducts().map(product => ({
        name: product.name,
        active: product.active,
        priceCents: product.priceCents ?? null,
        durationDays: product.durationDays,
        hasDeliveryRole: Boolean(commerce.roles[product.value])
    }));
    const orders = getOrders();
    const payment = getPaymentConfig();
    return {
        configuredTimeZone: settings.timezone,
        announcementHours: settings.announcementHours,
        announcementAutomationActive: settings.automations.announcements,
        activeStoreAutomations: Object.entries(commerce.automations).filter(([, active]) => active).map(([key]) => key),
        products,
        paymentMethods: payment.methods.map(({ name, type, active }) => ({ name, type, active })),
        orderCounts: {
            recent: orders.length,
            awaitingPayment: orders.filter(order => ['pending', 'awaiting_manual_confirmation'].includes(order.status)).length,
            paid: orders.filter(order => Boolean(order.paidAt)).length
        }
    };
}

export async function responderAssistentePainel(message) {
    const context = getSafeContext();
    const answer = await generateAssistantResponse(SYSTEM_INSTRUCTION, [{
        role: 'user', content: `Contexto atual (resumo sem credenciais ou IDs pessoais):\n${JSON.stringify(context)}\n\nPergunta do administrador:\n${message}`
    }]);
    if (!answer) throw Object.assign(new Error('Não consegui formular uma resposta agora. Tente perguntar de outro jeito.'), { status: 502 });
    return answer.slice(0, 3000);
}
