import test from 'node:test';
import assert from 'node:assert/strict';
import { isRestrictedAnnouncementMessage, RESTRICTED_ANNOUNCEMENT_CHANNEL_ID } from '../src/features/announcementModeration.js';

function createMessage(overrides = {}) {
    return {
        guild: {},
        channelId: RESTRICTED_ANNOUNCEMENT_CHANNEL_ID,
        author: { bot: false },
        webhookId: null,
        ...overrides
    };
}

test('matches human messages only in the restricted announcement channel', () => {
    assert.equal(isRestrictedAnnouncementMessage(createMessage()), true);
    assert.equal(isRestrictedAnnouncementMessage(createMessage({ channelId: '000000000000000001' })), false);
});

test('ignores bot, webhook, and direct messages', () => {
    assert.equal(isRestrictedAnnouncementMessage(createMessage({ author: { bot: true } })), false);
    assert.equal(isRestrictedAnnouncementMessage(createMessage({ webhookId: 'webhook-id' })), false);
    assert.equal(isRestrictedAnnouncementMessage(createMessage({ guild: null })), false);
});