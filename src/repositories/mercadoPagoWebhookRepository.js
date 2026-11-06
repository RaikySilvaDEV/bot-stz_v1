import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE = 'mercado-pago-webhook-events.json';
const MAX_EVENTS = 5000;

function readEvents() {
    const events = readJsonData(FILE, []);
    return Array.isArray(events) ? events : [];
}

export function enqueueMercadoPagoWebhookEvent({ eventKey, paymentId, type }) {
    const events = readEvents();
    const existing = events.find(event => event.eventKey === eventKey);
    if (existing) return { event: existing, duplicate: true };
    const event = {
        eventKey, paymentId: String(paymentId), type, status: 'pending', attempts: 0,
        receivedAt: new Date().toISOString(), nextAttemptAt: new Date().toISOString()
    };
    events.push(event);
    writeJsonData(FILE, events.slice(-MAX_EVENTS));
    return { event, duplicate: false };
}

export function recoverMercadoPagoWebhookEvents() {
    const events = readEvents();
    let changed = false;
    for (const event of events) {
        if (event.status === 'processing') {
            event.status = 'pending';
            event.nextAttemptAt = new Date().toISOString();
            changed = true;
        }
    }
    if (changed) writeJsonData(FILE, events);
}

export function claimNextMercadoPagoWebhookEvent(now = Date.now()) {
    const events = readEvents();
    const event = events.find(item => item.status === 'pending' && Date.parse(item.nextAttemptAt) <= now);
    if (!event) return null;
    event.status = 'processing';
    event.updatedAt = new Date().toISOString();
    writeJsonData(FILE, events);
    return event;
}

export function completeMercadoPagoWebhookEvent(eventKey) {
    updateEvent(eventKey, event => ({ ...event, status: 'completed', completedAt: new Date().toISOString(), lastError: null }));
}

export function retryMercadoPagoWebhookEvent(eventKey, error) {
    updateEvent(eventKey, event => {
        const attempts = event.attempts + 1;
        const terminal = attempts >= 12;
        const delayMs = Math.min(30, 2 ** Math.min(attempts, 5)) * 60_000;
        return {
            ...event, attempts, status: terminal ? 'failed' : 'pending',
            nextAttemptAt: new Date(Date.now() + delayMs).toISOString(),
            lastError: String(error?.message ?? error).slice(0, 300), updatedAt: new Date().toISOString()
        };
    });
}

function updateEvent(eventKey, transform) {
    const events = readEvents();
    const index = events.findIndex(event => event.eventKey === eventKey);
    if (index < 0) return;
    events[index] = transform(events[index]);
    writeJsonData(FILE, events);
}
