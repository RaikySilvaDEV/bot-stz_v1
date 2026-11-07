import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCipheriv, createDecipheriv, randomBytes, sign as signMessage } from 'node:crypto';
import { getCommerceConfig, getCommerceProducts } from '../repositories/commerceRepository.js';
import { getOrders } from '../repositories/orderRepository.js';
import {
    createPartnerPayoutDraft, getPartnerPayout, getPartnerPayoutState, updatePartnerPayout, savePartnerPayoutSettings
} from '../repositories/partnerPayoutRepository.js';
import { normalizePixKey } from './pix.js';
import { generatePartnerPayoutEncryptionKey } from './mercadoPagoSettings.js';

const ACTIVE_STATES = new Set(['prepared', 'submitting', 'unknown', 'pending']);
const FINAL_CREDITED = new Set(['success', 'credited']);
const FINAL_REJECTED = new Set(['rejected', 'error', 'failed', 'canceled', 'refunded']);
const sendsInProgress = new Set();
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function encryptionKey() {
    const value = process.env.PARTNER_PAYOUTS_ENCRYPTION_KEY?.trim() ?? '';
    const key = Buffer.from(value, 'base64');
    if (key.length !== 32) throw new Error('PARTNER_PAYOUTS_ENCRYPTION_KEY precisa ser uma chave Base64 de 32 bytes.');
    return key;
}

function encrypt(text) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map(buffer => buffer.toString('base64')).join('.');
}

function decrypt(value) {
    const [iv, tag, encrypted] = String(value).split('.').map(part => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function apiPixType(type) {
    return ({ email: 'EMAIL', phone: 'PHONE', cpf: 'CPF', cnpj: 'CNPJ', random: 'PIX_CODE' })[type] ?? null;
}

function signingKeyPathSafe() {
    const keyPath = process.env.MERCADO_PAGO_PAYOUTS_PRIVATE_KEY_PATH?.trim();
    if (!keyPath || !path.isAbsolute(keyPath) || !fs.existsSync(keyPath)) return false;
    const relative = path.relative(PROJECT_ROOT, path.resolve(keyPath));
    return relative !== '' && (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`));
}

function safePayout(payout) {
    return {
        id: payout.id, status: payout.status, totalCents: payout.totalCents,
        orderCount: payout.orderIds.length, shareBps: payout.shareBps,
        createdAt: payout.createdAt, updatedAt: payout.updatedAt,
        providerPayoutId: payout.providerPayoutId,
        providerStatus: payout.providerStatus ?? null,
        providerStatusDetail: payout.providerStatusDetail ?? null,
        testMode: payout.testMode,
        lastError: payout.lastError ?? null
    };
}

export function calculatePartnerShare(orders, shareBps, payouts) {
    if (!Number.isInteger(shareBps) || shareBps < 0 || shareBps > 10000) throw new TypeError('Percentual inválido.');
    const claimed = new Set((payouts ?? []).filter(payout => ACTIVE_STATES.has(payout.status) || FINAL_CREDITED.has(payout.status))
        .flatMap(payout => payout.orderIds ?? []));
    const eligible = (orders ?? []).filter(order => order?.paidAt && order.status !== 'refunded' && !claimed.has(order.id) &&
        Number.isSafeInteger(order.amountCents) && order.amountCents > 0 &&
        (order.provider !== 'mercadoPago' || (Number.isSafeInteger(order.netAmountCents) && order.netAmountCents >= 0)));
    const shares = eligible.map(order => ({ orderId: order.id, amountCents: Math.round((order.provider === 'mercadoPago' ? order.netAmountCents : order.amountCents) * shareBps / 10000) }))
        .filter(share => share.amountCents > 0);
    return {
        orderCount: shares.length,
        grossCents: eligible.reduce((sum, order) => sum + order.amountCents, 0),
        totalCents: shares.reduce((sum, share) => sum + share.amountCents, 0),
        orderShares: Object.fromEntries(shares.map(share => [share.orderId, share.amountCents]))
    };
}

export function getPartnerPayoutDashboard() {
    const state = getPartnerPayoutState();
    const commerce = getCommerceConfig();
    const orders = getOrders();
    const calc = calculatePartnerShare(orders, state.shareBps, state.payouts);
    const eligibleOrders = orders.filter(order => Object.hasOwn(calc.orderShares, order.id));
    const grossCents = eligibleOrders.reduce((sum, order) => sum + order.amountCents, 0);
    const netCents = eligibleOrders.reduce((sum, order) => sum + (order.provider === 'mercadoPago' ? order.netAmountCents : order.amountCents), 0);
    const missingNetAmountCount = orders.filter(order => order?.provider === 'mercadoPago' && order?.paidAt && order.status !== 'refunded' &&
        !calc.orderShares[order.id] && !state.payouts.some(payout => (payout.orderIds ?? []).includes(order.id) &&
            (ACTIVE_STATES.has(payout.status) || FINAL_CREDITED.has(payout.status)))).length;
    const encryptedKeyExists = Boolean(state.recipient?.encryptedKey);
    let keyConfigured = false;
    try { encryptionKey(); keyConfigured = true; } catch { /* report setup requirement only */ }
    return {
        settings: {
            sharePercent: state.shareBps / 100,
            recipientConfigured: encryptedKeyExists,
            recipientMasked: state.recipient?.masked ?? null,
            pixType: state.recipient?.type ?? null,
            encryptionReady: keyConfigured,
            accessTokenReady: Boolean(process.env.MERCADO_PAGO_PAYOUTS_ACCESS_TOKEN?.trim()),
            testMode: process.env.MERCADO_PAGO_PAYOUTS_TEST_MODE !== 'false',
            testMaxCents: Number.parseInt(process.env.MERCADO_PAGO_PAYOUTS_TEST_MAX_CENTS ?? '1000', 10),
            privateSigningKeyReady: signingKeyPathSafe(),
            webhookReady: validWebhookUrl(process.env.MERCADO_PAGO_PAYOUTS_WEBHOOK_URL) && Boolean(process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()),
            enabled: commerce.automations.partnerPayouts === true
        },
        calculation: { ...calc, grossCents, netCents, feesCents: grossCents - netCents, partnerShareCents: calc.totalCents,
            ownerShareCents: Math.max(0, netCents - calc.totalCents), missingNetAmountCount,
            eligibleOrderCount: orders.filter(order => order?.paidAt && order.status !== 'refunded').length },
        payouts: state.payouts.slice(-100).reverse().map(safePayout)
    };
}

function validWebhookUrl(value) {
    try {
        const url = new URL(value ?? '');
        return url.protocol === 'https:' && url.pathname === '/api/webhooks/mercado-pago-payouts' && !url.search && !url.hash;
    } catch { return false; }
}

export function configurePartnerPayout({ sharePercent, pixType, pixKey }) {
    if (typeof sharePercent !== 'number' || !Number.isFinite(sharePercent) || sharePercent < 0.01 || sharePercent > 100) {
        throw Object.assign(new TypeError('O percentual deve ficar entre 0,01% e 100%.'), { status: 400 });
    }
    const state = getPartnerPayoutState();
    let recipient = state.recipient;
    if (typeof pixKey === 'string' && pixKey.trim()) {
        generatePartnerPayoutEncryptionKey();
        const types = new Set(['email', 'phone', 'cpf', 'cnpj', 'random']);
        if (!types.has(pixType)) throw Object.assign(new TypeError('Selecione um tipo de chave Pix válido.'), { status: 400 });
        let key;
        try { key = normalizePixKey(pixKey, pixType); }
        catch (error) { throw Object.assign(error, { status: 400 }); }
        const encryptedKey = encrypt(key);
        const visible = pixType === 'email' ? key.replace(/^(.).+(@.*)$/, '$1•••$2') : `••••${key.replace(/\D/g, '').slice(-4)}`;
        recipient = { type: pixType, encryptedKey, masked: visible, updatedAt: new Date().toISOString() };
    }
    if (!recipient?.encryptedKey) throw Object.assign(new TypeError('Cadastre a chave Pix do sócio.'), { status: 400 });
    savePartnerPayoutSettings({ shareBps: Math.round(sharePercent * 100), recipient });
    return { sharePercent: Math.round(sharePercent * 100) / 100, recipientConfigured: true, recipientMasked: recipient.masked, pixType: recipient.type, pendingDrafts: state.payouts.filter(payout => payout.status === 'prepared').length };
}

export function createPayoutDraft() {
    const state = getPartnerPayoutState();
    if (!state.recipient?.encryptedKey) throw Object.assign(new Error('Cadastre a chave Pix do sócio no painel.'), { status: 409 });
    const calc = calculatePartnerShare(getOrders(), state.shareBps, state.payouts);
    if (!calc.orderCount || calc.totalCents < 100) throw Object.assign(new Error('O repasse calculado precisa ser de no mínimo R$ 1,00.'), { status: 409 });
    const recipient = decrypt(state.recipient.encryptedKey);
    const testMode = process.env.MERCADO_PAGO_PAYOUTS_TEST_MODE !== 'false';
    if (!process.env.MERCADO_PAGO_PAYOUTS_ACCESS_TOKEN?.trim()) throw Object.assign(new Error('Configure o Access Token da aplicação Payouts antes de preparar o repasse.'), { status: 409 });
    const maxTestCents = Number.parseInt(process.env.MERCADO_PAGO_PAYOUTS_TEST_MAX_CENTS ?? '1000', 10);
    if (testMode && (!Number.isSafeInteger(maxTestCents) || maxTestCents < 100 || calc.totalCents > maxTestCents)) {
        throw Object.assign(new Error(`O total do teste supera o limite configurado de R$ ${(maxTestCents / 100).toFixed(2)}.`), { status: 409 });
    }
    if (!testMode && !signingKeyPathSafe()) throw Object.assign(new Error('Produção exige um arquivo Ed25519 absoluto fora do projeto e registrado no Mercado Pago.'), { status: 409 });
    if (!validWebhookUrl(process.env.MERCADO_PAGO_PAYOUTS_WEBHOOK_URL) || !process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()) throw Object.assign(new Error('Configure a URL HTTPS de webhook Payouts e o segredo de assinatura antes de preparar um repasse.'), { status: 409 });
    const payout = createPartnerPayoutDraft({
        orderIds: Object.keys(calc.orderShares), orderShares: calc.orderShares, totalCents: calc.totalCents,
        shareBps: state.shareBps, recipientCiphertext: state.recipient.encryptedKey,
        recipientType: state.recipient.type, testMode
    });
    return safePayout(payout);
}

function payoutBody(payout) {
    const token = process.env.MERCADO_PAGO_PAYOUTS_ACCESS_TOKEN?.trim();
    if (!token) throw new Error('Configure MERCADO_PAGO_PAYOUTS_ACCESS_TOKEN com a credencial da aplicação Payouts.');
    if (payout.testMode !== (process.env.MERCADO_PAGO_PAYOUTS_TEST_MODE !== 'false')) throw new Error('O modo de execução mudou após a preparação. Crie um novo rascunho para o modo atual.');
    const key = decrypt(payout.recipientCiphertext);
    const type = apiPixType(payout.recipientType);
    if (!type) throw new Error('Tipo de chave Pix inválido.');
    return {
        token,
        body: {
            external_reference: payout.externalReference,
            config: { notification_url: process.env.MERCADO_PAGO_PAYOUTS_WEBHOOK_URL.trim() },
            description: 'Repasse de comissoes STZ',
            transactions: [{
                description: 'Comissao de vendas STZ', type: 'pix',
                pix: { type, chave: key },
                amount: { currency: 'BRL', value: Number((payout.totalCents / 100).toFixed(2)) },
                external_reference: payout.externalReference
            }]
        }
    };
}

export async function sendPartnerPayout(id) {
    const payout = getPartnerPayout(id);
    if (!payout || !['prepared', 'unknown'].includes(payout.status)) throw Object.assign(new Error('Repasse não encontrado ou não está pronto para envio.'), { status: 404 });
    const ordersById = new Map(getOrders().map(order => [order.id, order]));
    const settlementStillMatches = (payout.orderIds ?? []).every(orderId => {
        const order = ordersById.get(orderId);
        const baseCents = order?.provider === 'mercadoPago' ? order.netAmountCents : order?.amountCents;
        return order && order.paidAt && order.status !== 'refunded' && Number.isSafeInteger(baseCents) && baseCents >= 0 &&
            payout.orderShares?.[orderId] === Math.round(baseCents * payout.shareBps / 10000);
    });
    if (!settlementStillMatches) throw Object.assign(new Error('Este rascunho não corresponde aos valores líquidos/taxas atuais. Não o envie; prepare um novo repasse com os dados de liquidação atualizados.'), { status: 409 });
    if (sendsInProgress.has(id)) throw Object.assign(new Error('Este repasse já está sendo enviado.'), { status: 409 });
    if (!getCommerceConfig().automations.partnerPayouts) throw Object.assign(new Error('Ative primeiro a automação de repasses no painel.'), { status: 409 });
    const { token, body } = payoutBody(payout);
    const bodyText = JSON.stringify(body);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': payout.idempotencyKey };
    if (payout.testMode) {
        headers['X-test-token'] = 'true';
        headers['X-enforce-signature'] = 'false';
    } else {
        headers['X-test-token'] = 'false';
        const keyPath = process.env.MERCADO_PAGO_PAYOUTS_PRIVATE_KEY_PATH;
        const privateKey = fs.readFileSync(keyPath);
        headers['X-signature'] = signMessage(null, Buffer.from(bodyText), privateKey).toString('base64');
        headers['X-enforce-signature'] = 'true';
    }
    sendsInProgress.add(id);
    try {
        updatePartnerPayout(id, { status: 'submitting', lastError: null });
        const response = await fetch('https://api.mercadopago.com/v1/payouts', { method: 'POST', headers, body: bodyText, signal: AbortSignal.timeout(20000) });
        const responseBody = await response.json().catch(() => ({}));
        if (!response.ok) {
            const errorCode = String(responseBody.error ?? `http_${response.status}`).replace(/[^a-z0-9_-]/gi, '').slice(0, 60) || 'rejected';
            const failed = updatePartnerPayout(id, { status: 'rejected', lastError: `Solicitação rejeitada pelo Mercado Pago (${errorCode}).` });
            throw Object.assign(new Error(failed.lastError), { status: 502, payout: safePayout(failed) });
        }
        const transaction = responseBody.transactions?.[0] ?? responseBody.transaction ?? {};
        const providerPayoutId = String(responseBody.id ?? responseBody.payout?.id ?? '');
        const providerTransactionId = String(transaction.id ?? responseBody.transaction_id ?? '');
        if (!providerPayoutId || !providerTransactionId) {
            const unknown = updatePartnerPayout(id, { status: 'unknown', lastError: 'O Mercado Pago aceitou a solicitação, mas a resposta não trouxe todos os identificadores. Não crie outro repasse; atualize e contate o suporte.' });
            return safePayout(unknown);
        }
        return safePayout(updatePartnerPayout(id, { status: 'pending', providerPayoutId, providerTransactionId, providerStatus: transaction.status ?? responseBody.status ?? 'created', providerStatusDetail: transaction.status_detail ?? null, acceptedAt: new Date().toISOString() }));
    } catch (error) {
        if (error.payout) throw error;
        const unknown = updatePartnerPayout(id, { status: 'unknown', lastError: 'Sem confirmação da API. Uma nova tentativa reutilizará a mesma chave idempotente.' });
        return safePayout(unknown);
    } finally {
        sendsInProgress.delete(id);
    }
}

async function fetchProviderTransaction(payout) {
    const token = process.env.MERCADO_PAGO_PAYOUTS_ACCESS_TOKEN?.trim();
    if (!token || !payout.providerPayoutId || !payout.providerTransactionId) throw new Error('Identificadores ou credencial do Payouts indisponíveis para conciliação.');
    const url = `https://api.mercadopago.com/v1/payouts/${encodeURIComponent(payout.providerPayoutId)}/transactions/${encodeURIComponent(payout.providerTransactionId)}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(result.message ?? `Mercado Pago HTTP ${response.status}`).slice(0, 200));
    return result;
}

function statusFromProvider(result) {
    if (result.status === 'success' && result.status_detail === 'accredited') return 'credited';
    if (FINAL_REJECTED.has(result.status)) return 'rejected';
    return 'pending';
}

export async function reconcilePartnerPayout(id) {
    const payout = getPartnerPayout(id);
    if (!payout) throw Object.assign(new Error('Repasse não encontrado.'), { status: 404 });
    const result = await fetchProviderTransaction(payout);
    const status = statusFromProvider(result);
    const updated = updatePartnerPayout(id, { status, providerStatus: result.status ?? null, providerStatusDetail: result.status_detail ?? null, reconciledAt: new Date().toISOString(), lastError: null });
    return safePayout(updated);
}

export async function reconcilePayoutNotification({ payoutId, transactionId }) {
    const state = getPartnerPayoutState();
    const payout = state.payouts.find(item => item.providerPayoutId === String(payoutId) && item.providerTransactionId === String(transactionId));
    if (!payout) return false;
    await reconcilePartnerPayout(payout.id);
    return true;
}

export function listPartnerPayouts() {
    return getPartnerPayoutState().payouts.slice(-100).reverse().map(safePayout);
}
