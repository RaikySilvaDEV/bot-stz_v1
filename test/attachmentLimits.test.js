import test from 'node:test';
import assert from 'node:assert/strict';
import { BYTES_PER_MIB, getGuildAttachmentLimitBytes, getOversizedAttachments } from '../src/services/attachmentLimits.js';

test('uses the Discord upload limit for each server boost tier', () => {
    assert.equal(getGuildAttachmentLimitBytes(0), 10 * BYTES_PER_MIB);
    assert.equal(getGuildAttachmentLimitBytes(1), 10 * BYTES_PER_MIB);
    assert.equal(getGuildAttachmentLimitBytes(2), 50 * BYTES_PER_MIB);
    assert.equal(getGuildAttachmentLimitBytes(3), 100 * BYTES_PER_MIB);
});

test('rejects attachments larger than the server limit before upload', () => {
    const files = [
        { name: 'image.png', size: 2 * BYTES_PER_MIB },
        { name: 'archive.rar', size: 80 * BYTES_PER_MIB },
        { name: 'video.mp4', size: 142 * BYTES_PER_MIB }
    ];
    assert.deepEqual(getOversizedAttachments(files, 50 * BYTES_PER_MIB).map(file => file.name), ['archive.rar', 'video.mp4']);
});