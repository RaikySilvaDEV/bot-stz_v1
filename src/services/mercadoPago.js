import { createHmac, timingSafeEqual } from 'node:crypto';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import QRCode from 'qrcode';

function createClient() {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    if (!accessToken) throw new Error('MERCADO_PAGO_ACCESS_TOKEN não configurado.');
    return new MercadoPagoConfig({ accessToken, options: { timeout: 12000, maxRetries: 2 } });
}

export function mercadoPagoConfigReady() {
    if (!process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim() || !process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()) return false;
    try {
        const url = new URL(process.env.MERCADO_PAGO_WEBHOOK_URL ?? '');
        return url.protocol === 'https:' && url.pathname.replace(/\/$/, '') === '/api/webhooks/mercado-pago';
    } catch { return false; }
}

export async function createMercadoPagoPixPayment({ externalReference, payerEmail, amountCents, description, metadata = {} }) {
    if (!mercadoPagoConfigReady()) throw new Error('Configure credenciais e a URL HTTPS pública /api/webhooks/mercado-pago do Mercado Pago.');
    if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 99_999_999) {
        throw new TypeError('O valor do pagamento precisa estar entre R$ 0,01 e R$ 999.999,99.');
    }
    try {
        const result = await new Payment(createClient()).create({
            body: {
                transaction_amount: amountCents / 100,
                description,
                payment_method_id: 'pix',
                payer: { email: payerEmail },
                external_reference: externalReference,
                notification_url: process.env.MERCADO_PAGO_WEBHOOK_URL.trim(),
                metadata: { ...metadata, external_reference: externalReference }
            },
            requestOptions: { idempotencyKey: externalReference }
        });
        const transactionData = result.point_of_interaction?.transaction_data;
        const qrCode = transactionData?.qr_code;
        const qrImage = transactionData?.qr_code_base64
            ? Buffer.from(transactionData.qr_code_base64, 'base64')
            : qrCode ? await QRCode.toBuffer(qrCode, { type: 'png', width: 360, margin: 1 }) : null;
        if (!result.id || !qrCode || !qrImage?.length) throw new Error('O pagamento Pix não retornou os dados do QR Code.');
        return { id: result.id, qrCode, qrImage, ticketUrl: transactionData.ticket_url ?? null };
    } catch (error) {
        console.error('[mercado-pago] Falha ao criar pagamento Pix:', error.message);
        throw new Error('O Mercado Pago não conseguiu gerar o pagamento Pix. Confira as credenciais e os dados do pagador.');
    }
}

export async function createMercadoPagoTestPixPayment({ externalReference, payerEmail }) {
    return createMercadoPagoPixPayment({
        externalReference,
        payerEmail,
        amountCents: 10,
        description: 'Teste de pagamento do bot - cargo de teste',
        metadata: { payment_test: true }
    });
}

export function validateMercadoPagoSignature(signature, requestId, dataId, secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET) {
    if (!signature || !requestId || !dataId || !secret) return false;
    const parts = Object.fromEntries(signature.split(',').map(part => part.trim().split('=', 2)));
    if (!parts.ts || !parts.v1 || !/^\d+$/.test(parts.ts) || !/^[a-f0-9]{64}$/i.test(parts.v1)) return false;
    const manifest = `id:${String(dataId)};request-id:${requestId};ts:${parts.ts};`;
    const expected = createHmac('sha256', secret).update(manifest).digest();
    const supplied = Buffer.from(parts.v1, 'hex');
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function getMercadoPagoPayment(paymentId) {
    try {
        return await new Payment(createClient()).get({ id: paymentId, requestOptions: { timeout: 10000 } });
    } catch (error) {
        console.error('[mercado-pago] Falha ao consultar pagamento:', error.message);
        throw new Error('Falha ao consultar o pagamento no Mercado Pago.');
    }
}
