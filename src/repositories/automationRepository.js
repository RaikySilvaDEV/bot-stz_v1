import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const MESSAGE_IDS_FILE = 'automation-message-ids.json';

export function getAutomationMessageIds() {
    const stored = readJsonData(MESSAGE_IDS_FILE, {});
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter(([, id]) => typeof id === 'string'));
}

export function saveAutomationMessageId(channelId, messageId) {
    if (typeof channelId !== 'string' || typeof messageId !== 'string') return;
    const ids = getAutomationMessageIds();
    ids[channelId] = messageId;
    writeJsonData(MESSAGE_IDS_FILE, ids);
}
