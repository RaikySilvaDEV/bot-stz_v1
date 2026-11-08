import { randomUUID } from 'node:crypto';
import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE = 'scheduled-announcements.json';

function readState() {
    const value = readJsonData(FILE, { announcements: [], sent: {} });
    return {
        announcements: Array.isArray(value?.announcements) ? value.announcements.filter(item => item && typeof item === 'object') : [],
        sent: value?.sent && typeof value.sent === 'object' && !Array.isArray(value.sent) ? value.sent : {}
    };
}

function writeState(state) { writeJsonData(FILE, state); }

export function getScheduledAnnouncements() {
    return readState().announcements;
}

export function createScheduledAnnouncement(input) {
    const state = readState();
    const now = new Date().toISOString();
    const item = { id: randomUUID(), title: input.title, content: input.content, channelId: input.channelId,
        times: input.times, enabled: input.enabled ?? true, createdAt: now, updatedAt: now };
    state.announcements.push(item);
    writeState(state);
    return item;
}

export function updateScheduledAnnouncement(id, input) {
    const state = readState();
    const index = state.announcements.findIndex(item => item.id === id);
    if (index < 0) return null;
    state.announcements[index] = { ...state.announcements[index], ...input, updatedAt: new Date().toISOString() };
    writeState(state);
    return state.announcements[index];
}

export function removeScheduledAnnouncement(id) {
    const state = readState();
    const index = state.announcements.findIndex(item => item.id === id);
    if (index < 0) return null;
    const [removed] = state.announcements.splice(index, 1);
    delete state.sent[id];
    writeState(state);
    return removed;
}

export function wasScheduledAnnouncementSent(id, dateKey, time) {
    const sent = readState().sent[id];
    return Boolean(sent && sent.dateKey === dateKey && Array.isArray(sent.times) && sent.times.includes(time));
}

export function markScheduledAnnouncementSent(id, dateKey, time) {
    const state = readState();
    const sent = state.sent[id] ?? { dateKey, times: [] };
    if (sent.dateKey !== dateKey) { sent.dateKey = dateKey; sent.times = []; }
    if (!sent.times.includes(time)) sent.times.push(time);
    state.sent[id] = sent;
    const oldestDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const [announcementId, record] of Object.entries(state.sent)) {
        if (record?.dateKey < oldestDate) delete state.sent[announcementId];
    }
    writeState(state);
}
