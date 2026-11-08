import test from 'node:test';
import assert from 'node:assert/strict';
import { getRateLimitRetryDelay } from '../src/process/retryPolicy.js';

test('exponentially backs off Cloudflare rate limits up to thirty minutes', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(getRateLimitRetryDelay), [300_000, 600_000, 1_200_000, 1_800_000, 1_800_000]);
});