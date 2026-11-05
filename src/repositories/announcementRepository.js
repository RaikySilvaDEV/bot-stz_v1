import { randomUUID } from 'node:crypto';
import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE_NAME = 'anuncios_fivem.json';
const LEGACY_FILE = { legacyFiles: ['anuncios_fivem.json'] };

function validateAnnouncementList(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(item => item &&
        typeof item.id === 'string' &&
        typeof item.mensagemId === 'string' &&
        typeof item.titulo === 'string' &&
        typeof item.texto === 'string');
}

export function getAnnouncements() {
    return validateAnnouncementList(readJsonData(FILE_NAME, [], LEGACY_FILE));
}

export function addAnnouncement({ id, mensagemId, titulo, texto }) {
    const announcement = {
        id: id || randomUUID(),
        mensagemId,
        titulo,
        texto,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    const announcements = getAnnouncements();
    if (announcements.some(item => item.id === announcement.id)) throw new Error('Já existe um anúncio com esse ID.');
    announcements.push(announcement);
    writeJsonData(FILE_NAME, announcements);
    return announcement;
}

export function updateAnnouncement(id, { titulo, texto }) {
    const announcements = getAnnouncements();
    const updated = announcements.find(item => item.id === id) ?? null;
    if (!updated) return null;
    Object.assign(updated, { titulo, texto, updatedAt: new Date().toISOString() });
    writeJsonData(FILE_NAME, announcements);
    return updated;
}

export function removeAnnouncement(id) {
    const announcements = getAnnouncements();
    const index = announcements.findIndex(item => item.id === id);
    if (index < 0) return null;
    const [removed] = announcements.splice(index, 1);
    writeJsonData(FILE_NAME, announcements);
    return removed;
}
