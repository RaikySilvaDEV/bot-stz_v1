import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE = 'announcement-notice.json';

export function getAnnouncementNoticeMessageId() {
    const state = readJsonData(FILE, {});
    return state && typeof state === 'object' && typeof state.messageId === 'string'
        ? state
        : null;
}

export function saveAnnouncementNoticeMessageId(channelId, messageId) {
    writeJsonData(FILE, { channelId, messageId, savedAt: new Date().toISOString() });
}