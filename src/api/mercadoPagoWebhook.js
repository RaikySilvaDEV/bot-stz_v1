import { getCommerceConfig } from '../repositories/commerceRepository.js';
import {
    claimNextMercadoPagoWebhookEvent, completeMercadoPagoWebhookEvent,
    enqueueMercadoPagoWebhookEvent, recoverMercadoPagoWebhookEvents,
    retryMercadoPagoWebhookEvent
} from '../repositories/mercadoPagoWebhookRepository.js';
import { getMercadoPagoPayment, validateMercadoPagoSignature } from '../services/mercadoPago.js';
import { recordMercadoPagoPayment } from '../features/commerceAutomations.js';
import {
    claimPayoutNotification, enqueuePayoutNotification, recoverPayoutNotifications,
    settlePayoutNotification
} from '../repositories/partnerPayoutRepository.js';
import { reconcilePayoutNotification } from '../services/partnerPayouts.js';

let processorTimer;
let processing = false;
let payoutProcessing = false;

async function processNextWebhookEvent() {
    if (processing) return;
    processing = true;
    try {
        const event = claimNextMercadoPagoWebhookEvent();
        if (!event) return;
        try {
            const payment = await getMercadoPagoPayment(event.paymentId);
            const result = await recordMercadoPagoPayment(payment);
            if (!result.ok) throw new Error(result.reason || 'Pagamento não conciliado com o pedido.');
            completeMercadoPagoWebhookEvent(event.eventKey);
        } catch (error) {
            retryMercadoPagoWebhookEvent(event.eventKey, error);
            console.error(`[mercado-pago] Evento ${event.eventKey} falhou; nova tentativa será agendada:`, error.message);
        }
    } catch (error) {
        console.error('[mercado-pago] Falha ao processar a fila de notificações:', error.message);
    } finally {
        processing = false;
    }
}

async function processNextPayoutNotification() {
    if (payoutProcessing) return;
    payoutProcessing = true;
    try {
        const event = claimPayoutNotification();
        if (!event) return;
        try {
            await reconcilePayoutNotification({ payoutId: event.payoutId, transactionId: event.transactionId });
            settlePayoutNotification(event.eventKey);
        } catch (error) {
            settlePayoutNotification(event.eventKey, error);
            console.error('[mercado-pago:payouts] Falha ao conciliar a notificação; haverá nova tentativa:', error.message);
        }
    } catch (error) {
        console.error('[mercado-pago:payouts] Falha na fila de notificações:', error.message);
    } finally {
        payoutProcessing = false;
    }
}

export function startMercadoPagoWebhookProcessor() {
    if (processorTimer) return;
    try { recoverMercadoPagoWebhookEvents(); }
    catch (error) { console.error('[mercado-pago] Não foi possível recuperar a fila persistente:', error.message); }
    try { recoverPayoutNotifications(); }
    catch (error) { console.error('[mercado-pago:payouts] Não foi possível recuperar as notificações:', error.message); }
    processorTimer = setInterval(() => { void processNextWebhookEvent(); void processNextPayoutNotification(); }, 5_000);
    processorTimer.unref?.();
    void processNextWebhookEvent();
    void processNextPayoutNotification();
}

export async function handleMercadoPagoWebhook(req, res, url, readJson) {
    const isPayout = url.pathname === '/api/webhooks/mercado-pago-payouts';
    if (url.pathname !== '/api/webhooks/mercado-pago' && !isPayout) return false;
    const send = (status, data) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(data));
    };
    if (req.method !== 'POST') { req.resume(); send(405, { erro: 'Método não permitido.' }); return true; }
    if (isPayout) {
        const dataId = url.searchParams.get('data.id');
        const requestId = req.headers['x-request-id'];
        if (!validateMercadoPagoSignature(req.headers['x-signature'], requestId, dataId)) {
            req.resume(); send(401, { erro: 'Assinatura de webhook Payouts inválida.' }); return true;
        }
        try {
            const body = await readJson(req);
            const transactionId = body?.id == null ? '' : String(body.id);
            const payoutId = body?.payout?.id == null ? '' : String(body.payout.id);
            if (!transactionId || !payoutId || transactionId.toLowerCase() !== String(dataId).toLowerCase()) {
                send(400, { erro: 'Identificadores da notificação Payouts inválidos.' }); return true;
            }
            enqueuePayoutNotification({ eventKey: `payout:${payoutId}:${transactionId}`, payoutId, transactionId });
            send(200, { recebido: true });
            void processNextPayoutNotification();
        } catch (error) {
            console.error('[mercado-pago:payouts] Falha ao registrar a notificação:', error.message);
            if (!res.headersSent) send(error.status ?? 503, { erro: 'Falha ao registrar a notificação; o Mercado Pago poderá tentar novamente.' });
        }
        return true;
    }
    if (!getCommerceConfig().automations.mercadoPago) { req.resume(); send(503, { erro: 'Integração de pagamentos está desligada.' }); return true; }
    const dataId = url.searchParams.get('data.id');
    const requestId = req.headers['x-request-id'];
    if (!validateMercadoPagoSignature(req.headers['x-signature'], requestId, dataId)) {
        req.resume();
        send(401, { erro: 'Assinatura de webhook inválida.' });
        return true;
    }
    try {
        const body = await readJson(req);
        const bodyDataId = body?.data?.id == null ? null : String(body.data.id);
        if (bodyDataId && bodyDataId.toLowerCase() !== String(dataId).toLowerCase()) {
            send(400, { erro: 'O identificador do evento não confere com a assinatura.' });
            return true;
        }
        const type = String(body?.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? 'payment');
        if (type !== 'payment') {
            send(200, { recebido: true, ignorado: true });
            return true;
        }
        const notificationId = body?.id == null ? null : String(body.id);
        const eventKey = notificationId ? `${type}:${notificationId}` : `${type}:${requestId}:${dataId}`;
        enqueueMercadoPagoWebhookEvent({ eventKey, paymentId: dataId, type });
        send(200, { recebido: true });
        void processNextWebhookEvent();
    } catch (error) {
        console.error('[mercado-pago] Falha ao enfileirar notificação:', error.message);
        if (!res.headersSent) send(error.status ?? 503, { erro: 'Falha ao registrar a notificação; o Mercado Pago pode tentar novamente.' });
    }
    return true;
}
