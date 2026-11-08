import test from 'node:test';
import assert from 'node:assert/strict';
import { findExistingWarehousePost } from '../src/features/warehousePosting.js';

const target = {
    author: { id: 'bot-1' },
    content: '📦 **[Armazém CTZ] • Item #2**\n\n@everyone',
    createdAt: new Date('2026-11-08T15:00:00.000Z')
};

test('finds the bot post for the same item on the requested schedule date', () => {
    const result = findExistingWarehousePost([target], {
        authorId: 'bot-1',
        content: target.content,
        dateKey: '2026-11-08',
        getDateKey: date => date.toISOString().slice(0, 10)
    });

    assert.equal(result, target);
});

test('ignores posts from another author, item, or schedule date', () => {
    const messages = [
        { ...target, author: { id: 'member-1' } },
        { ...target, content: 'outro item' },
        { ...target, createdAt: new Date('2026-11-07T15:00:00.000Z') }
    ];

    assert.equal(findExistingWarehousePost(messages, {
        authorId: 'bot-1',
        content: target.content,
        dateKey: '2026-11-08',
        getDateKey: date => date.toISOString().slice(0, 10)
    }), null);
});