import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE = 'ticket-activity.json';

function readActivities() {
    const value = readJsonData(FILE, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function markTicketActivity(channelId, timestamp = Date.now()) {
    if (!/^\d{17,20}$/.test(String(channelId)) || !Number.isFinite(timestamp) || timestamp < 0) return;
    const activities = readActivities();
    activities[channelId] = Math.max(Number(activities[channelId]) || 0, timestamp);
    writeJsonData(FILE, activities);
}

export function getTicketActivity(channelId) {
    const timestamp = Number(readActivities()[channelId]);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

export function removeTicketActivity(channelId) {
    const activities = readActivities();
    if (!Object.hasOwn(activities, channelId)) return;
    delete activities[channelId];
    writeJsonData(FILE, activities);
}
