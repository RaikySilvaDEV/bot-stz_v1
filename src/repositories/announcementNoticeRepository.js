import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE = 'announcement-notice.json';

export function getAnnouncementNoticeMessageId() {
    const state = readJsonData(FILE, {});
    return typeof state?.messageId === 'string' ? state.messageId : null;
}

export function saveAnnouncementNoticeMessageId(messageId) {
    writeJsonData(FILE, { messageId, savedAt: new Date().toISOString() });
}