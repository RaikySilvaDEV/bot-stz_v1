import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE = 'bot-dashboard.json';
const EMPTY = { channelId: null, messageId: null };

export function getDashboardReference() {
    const value = readJsonData(FILE, EMPTY);
    return {
        channelId: typeof value?.channelId === 'string' ? value.channelId : null,
        messageId: typeof value?.messageId === 'string' ? value.messageId : null
    };
}

export function saveDashboardReference(channelId, messageId) {
    writeJsonData(FILE, { channelId, messageId });
}
