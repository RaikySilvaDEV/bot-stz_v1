import test from 'node:test';
import assert from 'node:assert/strict';
import { ANNOUNCEMENT_NOTICE_TEXT } from '../src/features/announcementNotice.js';

test('announcement warns against messages and explains the anti-self-bot purpose', () => {
    assert.match(ANNOUNCEMENT_NOTICE_TEXT, /Não envie mensagens neste canal/);
    assert.match(ANNOUNCEMENT_NOTICE_TEXT, /poderá receber banimento/);
    assert.match(ANNOUNCEMENT_NOTICE_TEXT, /self-bots/);
});

test('announcement does not include automatic message deletion or ban actions', () => {
    assert.doesNotMatch(ANNOUNCEMENT_NOTICE_TEXT, /guild\.members\.ban|message\.delete/);
});