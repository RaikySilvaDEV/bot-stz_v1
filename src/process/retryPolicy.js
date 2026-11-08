export function getRateLimitRetryDelay(count) {
    return Math.min(5 * 60_000 * (2 ** Math.max(0, count - 1)), 30 * 60_000);
}