import { randomUUID } from 'node:crypto';
import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE = 'legacy-entitlements.json';
const MAX_RECORDS = 10_000;

export function getLegacyEntitlements() {
    const records = readJsonData(FILE, []);
    return Array.isArray(records) ? records.slice(-MAX_RECORDS) : [];
}

function validDate(value, label) {
    const date = new Date(value);
    if (!value || !Number.isFinite(date.getTime())) throw new TypeError(`${label} inválida.`);
    return date.toISOString();
}

function normalizeRecord(input, previous = {}) {
    const buyerId = String(input.buyerId ?? previous.buyerId ?? '').trim();
    const buyerName = String(input.buyerName ?? previous.buyerName ?? '').trim();
    const productName = String(input.productName ?? previous.productName ?? '').trim();
    const productValue = String(input.productValue ?? previous.productValue ?? 'legacy').trim();
    const roleIds = input.roleIds === undefined ? previous.roleIds : input.roleIds;
    const purchasedAt = validDate(input.purchasedAt ?? previous.purchasedAt, 'Data da compra');
    const expiresAt = validDate(input.expiresAt ?? previous.expiresAt, 'Data de vencimento');

    if (!/^\d{17,20}$/.test(buyerId)) throw new TypeError('Informe o ID numérico do cliente no Discord.');
    if (!buyerName || buyerName.length > 100) throw new TypeError('Informe o nome do cliente (até 100 caracteres).');
    if (!productName || productName.length > 100) throw new TypeError('Informe o nome do produto (até 100 caracteres).');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/.test(productValue)) throw new TypeError('Produto inválido.');
    if (!Array.isArray(roleIds) || roleIds.length < 1 || roleIds.length > 5 || roleIds.some(id => typeof id !== 'string' || !/^\d{17,20}$/.test(id))) {
        throw new TypeError('Selecione de 1 a 5 cargos válidos para acompanhar.');
    }
    if (Date.parse(expiresAt) <= Date.parse(purchasedAt)) throw new TypeError('O vencimento deve ser posterior à data da compra.');
    const notes = String(input.notes ?? previous.notes ?? '').trim();
    if (notes.length > 500) throw new TypeError('As observações podem ter até 500 caracteres.');

    const requestedStatus = input.status ?? previous.status ?? 'active';
    const status = ['active', 'expired', 'revoked'].includes(requestedStatus) ? requestedStatus : 'active';
    return {
        buyerId, buyerName, productName, productValue, roleIds: [...new Set(roleIds)], purchasedAt, expiresAt, notes,
        guildId: String(input.guildId ?? previous.guildId ?? ''), source: 'legacy',
        status,
        createdAt: previous.createdAt ?? new Date().toISOString(),
        ...(previous.expiredAt ? { expiredAt: previous.expiredAt } : {}),
        ...(previous.expirationReminderAt ? { expirationReminderAt: previous.expirationReminderAt } : {})
    };
}

export function createLegacyEntitlement(input) {
    const records = getLegacyEntitlements();
    if (records.length >= MAX_RECORDS) throw new TypeError('Limite de registros de acessos antigos atingido.');
    const record = { id: randomUUID(), ...normalizeRecord(input) };
    records.push(record);
    writeJsonData(FILE, records);
    return record;
}

export function updateLegacyEntitlement(id, input) {
    const records = getLegacyEntitlements();
    const index = records.findIndex(record => record.id === id);
    if (index === -1) return null;
    const previous = records[index];
    const updated = { id: previous.id, ...normalizeRecord(input, previous), updatedAt: new Date().toISOString() };
    if (input.expiresAt !== undefined || input.purchasedAt !== undefined) {
        updated.status = 'active';
        delete updated.expiredAt;
        delete updated.expirationReminderAt;
    }
    records[index] = updated;
    writeJsonData(FILE, records);
    return updated;
}

export function markLegacyEntitlementExpired(id, expiredAt = new Date().toISOString()) {
    return updateLegacyEntitlement(id, { status: 'expired', expiredAt });
}

export function markLegacyEntitlementReminder(id, reminderAt = new Date().toISOString()) {
    const records = getLegacyEntitlements();
    const record = records.find(item => item.id === id);
    if (!record) return null;
    record.expirationReminderAt = reminderAt;
    record.updatedAt = new Date().toISOString();
    writeJsonData(FILE, records);
    return record;
}

export function removeLegacyEntitlement(id) {
    const records = getLegacyEntitlements();
    const next = records.filter(record => record.id !== id);
    if (next.length === records.length) return false;
    writeJsonData(FILE, next);
    return true;
}
