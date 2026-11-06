import { randomUUID } from 'node:crypto';
import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE = 'feedbacks.json';

export function getFeedback() {
    const data = readJsonData(FILE, []);
    return Array.isArray(data) ? data : [];
}

export function saveFeedback({ orderId, buyerId, rating, comment }) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new TypeError('A avaliação precisa ser de 1 a 5.');
    const rows = getFeedback();
    if (rows.some(row => row.orderId === orderId)) return null;
    const item = {
        id: randomUUID(), orderId, buyerId, rating,
        comment: String(comment ?? '').trim().slice(0, 1000),
        createdAt: new Date().toISOString(), publicMessageId: null, ticketClosedAt: null
    };
    rows.push(item);
    writeJsonData(FILE, rows.slice(-5000));
    return item;
}

export function getFeedbackByOrderId(orderId) {
    return getFeedback().find(item => item.orderId === orderId) ?? null;
}

export function updateFeedback(orderId, changes) {
    const rows = getFeedback();
    const item = rows.find(row => row.orderId === orderId);
    if (!item) return null;
    Object.assign(item, changes, { updatedAt: new Date().toISOString() });
    writeJsonData(FILE, rows);
    return item;
}
