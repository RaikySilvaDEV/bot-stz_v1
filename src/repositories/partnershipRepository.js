import { randomUUID } from 'node:crypto';
import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const PARTNERSHIPS_FILE = 'parcerias.json';

export function getPartners() {
    const partners = readJsonData(PARTNERSHIPS_FILE, []);
    return Array.isArray(partners) ? partners : [];
}

function normalizeUrl(value) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('A URL da parceria deve usar HTTP ou HTTPS.');
    return url.href;
}

function ensureUniqueUrl(partners, url, excludedId = null) {
    if (partners.some(partner => partner.id !== excludedId && normalizeUrl(partner.url) === url)) {
        throw new Error('Essa URL já está cadastrada como parceria.');
    }
}

export function addPartner(data) {
    const partners = getPartners();
    const url = normalizeUrl(data.url);
    ensureUniqueUrl(partners, url);
    const now = new Date().toISOString();
    const partner = { id: randomUUID(), ...data, url, createdAt: now, updatedAt: now };
    partners.push(partner);
    writeJsonData(PARTNERSHIPS_FILE, partners);
    return partner;
}

export function updatePartner(id, data) {
    const partners = getPartners();
    const partner = partners.find(item => item.id === id);
    if (!partner) return null;
    const url = normalizeUrl(data.url);
    ensureUniqueUrl(partners, url, id);
    Object.assign(partner, data, { url, updatedAt: new Date().toISOString() });
    writeJsonData(PARTNERSHIPS_FILE, partners);
    return partner;
}

export function removePartner(id) {
    const partners = getPartners();
    const index = partners.findIndex(item => item.id === id);
    if (index < 0) return null;
    const [removed] = partners.splice(index, 1);
    writeJsonData(PARTNERSHIPS_FILE, partners);
    return removed;
}
