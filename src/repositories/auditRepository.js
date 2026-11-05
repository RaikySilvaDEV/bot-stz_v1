import { randomUUID } from 'node:crypto';
import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const AUDIT_FILE = 'audit-log.json';
const MAX_AUDIT_ENTRIES = 1000;

export function recordAudit({ actorId, action, subject, detail = '' }) {
    const storedEntries = readJsonData(AUDIT_FILE, []);
    const entries = Array.isArray(storedEntries) ? storedEntries : [];
    entries.push({
        id: randomUUID(),
        at: new Date().toISOString(),
        actorId,
        action,
        subject,
        detail: String(detail).slice(0, 500)
    });
    writeJsonData(AUDIT_FILE, entries.slice(-MAX_AUDIT_ENTRIES));
}

export function getAuditEntries(limit = 10) {
    const entries = readJsonData(AUDIT_FILE, []);
    if (!Array.isArray(entries)) return [];
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));
    return entries.slice(-safeLimit).reverse();
}
