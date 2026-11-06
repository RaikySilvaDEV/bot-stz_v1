import { getCommerceConfig } from '../repositories/commerceRepository.js';
import {
    claimNextMercadoPagoWebhookEvent, completeMercadoPagoWebhookEvent,
    enqueueMercadoPagoWebhookEvent, recoverMercadoPagoWebhookEvents,
    retryMercadoPagoWebhookEvent
} from '../repositories/mercadoPagoWebhookRepository.js';
import { getMercadoPagoPayment, validateMercadoPagoSignature } from '../services/mercadoPago.js';
import { recordMercadoPagoPayment } from '../features/commerceAutomations.js';

let processorTimer;
let processing = false;

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

export function startMercadoPagoWebhookProcessor() {
    if (processorTimer) return;
    try { recoverMercadoPagoWebhookEvents(); }
    catch (error) { console.error('[mercado-pago] Não foi possível recuperar a fila persistente:', error.message); }
    processorTimer = setInterval(() => void processNextWebhookEvent(), 5_000);
    processorTimer.unref?.();
    void processNextWebhookEvent();
}

export async function handleMercadoPagoWebhook(req, res, url, readJson) {
    if (url.pathname !== '/api/webhooks/mercado-pago') return false;
    const send = (status, data) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(data));
    };
    if (req.method !== 'POST') { req.resume(); send(405, { erro: 'Método não permitido.' }); return true; }
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
