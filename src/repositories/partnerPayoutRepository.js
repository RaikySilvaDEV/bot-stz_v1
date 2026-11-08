import { randomUUID } from 'node:crypto';
import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE = 'partner-payouts.json';
const DEFAULT = { shareBps: 5000, recipient: null, payouts: [], notifications: [] };

export function getPartnerPayoutState() {
    const state = readJsonData(FILE, DEFAULT);
    return {
        shareBps: Number.isInteger(state?.shareBps) && state.shareBps >= 0 && state.shareBps <= 10000 ? state.shareBps : 0,
        recipient: state?.recipient && typeof state.recipient === 'object' ? state.recipient : null,
        payouts: Array.isArray(state?.payouts) ? state.payouts : [],
        notifications: Array.isArray(state?.notifications) ? state.notifications : []
    };
}

export function savePartnerPayoutSettings({ shareBps, recipient }) {
    const state = getPartnerPayoutState();
    state.shareBps = shareBps;
    state.recipient = recipient;
    writeJsonData(FILE, state);
    return state;
}

export function createPartnerPayoutDraft({ orderIds, orderShares, totalCents, shareBps, recipientCiphertext, recipientType, testMode }) {
    const state = getPartnerPayoutState();
    const payout = {
        id: randomUUID(),
        externalReference: `stz-${randomUUID().replaceAll('-', '')}`,
        idempotencyKey: randomUUID(),
        orderIds: [...orderIds],
        orderShares: { ...orderShares },
        totalCents,
        shareBps,
        recipientCiphertext,
        recipientType,
        testMode,
        status: 'prepared',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        providerPayoutId: null,
        providerTransactionId: null
    };
    state.payouts.push(payout);
    state.payouts = state.payouts.slice(-1000);
    writeJsonData(FILE, state);
    return payout;
}

export function updatePartnerPayout(id, changes) {
    const state = getPartnerPayoutState();
    const payout = state.payouts.find(item => item.id === id);
    if (!payout) return null;
    Object.assign(payout, changes, { updatedAt: new Date().toISOString() });
    writeJsonData(FILE, state);
    return payout;
}

export function getPartnerPayout(id) {
    return getPartnerPayoutState().payouts.find(item => item.id === id) ?? null;
}

export function enqueuePayoutNotification({ eventKey, payoutId, transactionId }) {
    const state = getPartnerPayoutState();
    if (state.notifications.some(event => event.eventKey === eventKey)) return false;
    state.notifications.push({ eventKey, payoutId: String(payoutId), transactionId: String(transactionId), status: 'pending', attempts: 0, receivedAt: new Date().toISOString(), nextAttemptAt: new Date().toISOString() });
    state.notifications = state.notifications.slice(-5000);
    writeJsonData(FILE, state);
    return true;
}

export function claimPayoutNotification() {
    const state = getPartnerPayoutState();
    const event = state.notifications.find(item => item.status === 'pending' && Date.parse(item.nextAttemptAt ?? 0) <= Date.now());
    if (!event) return null;
    event.status = 'processing';
    event.updatedAt = new Date().toISOString();
    writeJsonData(FILE, state);
    return event;
}

export function settlePayoutNotification(eventKey, error = null) {
    const state = getPartnerPayoutState();
    const event = state.notifications.find(item => item.eventKey === eventKey);
    if (!event) return;
    if (!error) Object.assign(event, { status: 'completed', completedAt: new Date().toISOString(), lastError: null });
    else {
        event.attempts += 1;
        const delayMs = Math.min(5 * 60_000, 5_000 * (2 ** Math.min(event.attempts - 1, 6)));
        Object.assign(event, { status: event.attempts >= 12 ? 'failed' : 'pending', nextAttemptAt: new Date(Date.now() + delayMs).toISOString(), lastError: String(error.message ?? error).slice(0, 300), updatedAt: new Date().toISOString() });
    }
    writeJsonData(FILE, state);
}

export function recoverPayoutNotifications() {
    const state = getPartnerPayoutState();
    let changed = false;
    for (const event of state.notifications) {
        if (event.status === 'processing') { event.status = 'pending'; changed = true; }
    }
    for (const payout of state.payouts) {
        if (payout.status === 'submitting') { payout.status = 'unknown'; changed = true; }
    }
    if (changed) writeJsonData(FILE, state);
}
