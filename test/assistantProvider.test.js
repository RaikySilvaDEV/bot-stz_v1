import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantProvider } from '../src/services/assistantProvider.js';

const defaultEnv = Object.freeze({
    OLLAMA_ENABLED: 'true',
    OLLAMA_HOST: 'http://127.0.0.1:11434',
    OLLAMA_MODEL: 'qwen2.5:0.5b',
    OLLAMA_TIMEOUT_MS: '30000',
    OLLAMA_NUM_CTX: '1024',
    OLLAMA_NUM_PREDICT: '120',
    OLLAMA_NUM_THREAD: '1',
    OLLAMA_KEEP_ALIVE: '0',
    OLLAMA_MAX_CONCURRENT: '1',
    OLLAMA_MAX_QUEUE: '3',
    OLLAMA_USER_COOLDOWN_MS: '15000',
    OLLAMA_GLOBAL_RPM: '12'
});

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function tags() { return json({ models: [{ name: 'qwen2.5:0.5b' }] }); }
function chat(content = 'Resposta local.') { return json({ message: { content } }); }
function provider(fetchImpl, overrides = {}, now) {
    return createAssistantProvider({ env: { ...defaultEnv, ...overrides }, fetchImpl, ...(now ? { now } : {}) });
}

test('reports Ollama ready and generates with bounded local options', async () => {
    const calls = [];
    const instance = provider(async (url, init = {}) => {
        calls.push({ url: String(url), init });
        return String(url).endsWith('/api/tags') ? tags() : chat();
    });
    assert.equal(calls.length, 0, 'construction must not load or probe the model');
    const status = await instance.getStatus();
    assert.equal(status.ready, true);
    assert.equal(status.model, 'qwen2.5:0.5b');
    assert.equal(await instance.generate('system', [{ role: 'user', content: 'oi' }], { userId: 'u1' }), 'Resposta local.');
    const body = JSON.parse(calls[1].init.body);
    assert.equal(body.options.num_ctx, 1024);
    assert.equal(body.options.num_predict, 120);
    assert.equal(body.options.num_thread, 1);
    assert.equal(body.keep_alive, '0');
    assert.equal(calls[1].init.signal instanceof AbortSignal, true);
    assert.equal(instance.getQueueStatus().lastResponseMs >= 0, true);
});

test('handles unavailable Ollama without crashing and rejects non-local hosts', async () => {
    const instance = provider(async () => { throw new Error('connection refused'); });
    const status = await instance.getStatus();
    assert.equal(status.available, false);
    await assert.rejects(instance.generate('system', [{ content: 'olá' }]), /conectar ao Ollama local/);

    let called = false;
    const remote = provider(async () => { called = true; return tags(); }, { OLLAMA_HOST: 'http://192.0.2.5:11434' });
    assert.equal((await remote.getStatus()).ready, false);
    await assert.rejects(remote.generate('system', [{ content: 'olá' }]), /recusado/);
    assert.equal(called, false);
});

test('reports model missing, HTTP errors, and empty model responses', async () => {
    const missing = provider(async url => String(url).endsWith('/api/tags') ? json({ models: [] }) : json({ error: 'not found' }, 404));
    assert.equal((await missing.getStatus()).ready, false);
    await assert.rejects(missing.generate('system', [{ content: 'oi' }]), /ollama pull qwen2.5:0.5b/);

    const failed = provider(async () => json({ error: 'failure' }, 500));
    await assert.rejects(failed.generate('system', [{ content: 'oi' }]), /HTTP 500/);

    const empty = provider(async () => chat('  '));
    await assert.rejects(empty.generate('system', [{ content: 'oi' }]), /resposta vazia/);
});

test('aborts a generation after the configured timeout', async () => {
    const instance = provider((url, { signal }) => String(url).endsWith('/api/tags')
        ? Promise.resolve(tags())
        : new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    { OLLAMA_TIMEOUT_MS: '1000' });
    await assert.rejects(instance.generate('system', [{ content: 'oi' }]), /timeout de 1 segundos/);
});

test('serializes concurrent requests and enforces a bounded FIFO queue', async () => {
    let activeCount = 0;
    let maxActiveCount = 0;
    const releases = [];
    const instance = provider(async (_url, { signal }) => {
        activeCount += 1;
        maxActiveCount = Math.max(maxActiveCount, activeCount);
        return new Promise((resolve, reject) => {
            releases.push(() => { activeCount -= 1; resolve(chat()); });
            signal.addEventListener('abort', () => { activeCount -= 1; reject(signal.reason); }, { once: true });
        });
    }, { OLLAMA_MAX_QUEUE: '2' });
    const first = instance.generate('s', [{ content: 'a' }], { userId: '1' });
    const second = instance.generate('s', [{ content: 'b' }], { userId: '2' });
    const third = instance.generate('s', [{ content: 'c' }], { userId: '3' });
    const fourth = instance.generate('s', [{ content: 'd' }], { userId: '4' });
    await assert.rejects(fourth, /fila da IA está cheia/);
    assert.deepEqual(instance.getQueueStatus().queued, 2);
    assert.equal(maxActiveCount, 1);
    releases.shift()();
    assert.equal(await first, 'Resposta local.');
    await new Promise(resolve => setImmediate(resolve));
    releases.shift()();
    assert.equal(await second, 'Resposta local.');
    await new Promise(resolve => setImmediate(resolve));
    releases.shift()();
    assert.equal(await third, 'Resposta local.');
    assert.equal(maxActiveCount, 1);
});

test('applies user cooldown, repeat protection, and a global rate limit', async () => {
    const instance = provider(async () => chat(), { OLLAMA_USER_COOLDOWN_MS: '15000', OLLAMA_GLOBAL_RPM: '2' }, () => 20_000);
    await instance.generate('s', [{ content: 'pergunta A' }], { userId: 'same' });
    await assert.rejects(instance.generate('s', [{ content: 'pergunta B' }], { userId: 'same' }), /Aguarde/);
    await instance.generate('s', [{ content: 'pergunta B' }], { userId: 'other' });
    await assert.rejects(instance.generate('s', [{ content: 'pergunta C' }], { userId: 'third' }), /limite global/);

    const repeat = provider(async () => chat(), { OLLAMA_USER_COOLDOWN_MS: '0' }, () => 20_000);
    await repeat.generate('s', [{ content: 'mesma pergunta' }], { userId: 'same' });
    await assert.rejects(repeat.generate('s', [{ content: 'mesma pergunta' }], { userId: 'same' }), /mesma pergunta/);
});

test('cancels queued requests and active work during shutdown', async () => {
    let resolveActive;
    let aborted = false;
    const instance = provider((_url, { signal }) => new Promise((resolve, reject) => {
        resolveActive = () => resolve(chat());
        signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }, { once: true });
    }));
    const active = instance.generate('s', [{ content: 'ativa' }], { userId: '1' });
    const queuedController = new AbortController();
    const queued = instance.generate('s', [{ content: 'fila' }], { userId: '2', signal: queuedController.signal });
    queuedController.abort();
    await assert.rejects(queued, /cancelada/);
    instance.stop();
    await assert.rejects(active, /cancelada/);
    assert.equal(aborted, true);
    assert.equal(instance.getQueueStatus().queued, 0);
    assert.equal(typeof resolveActive, 'function');
});

test('a fresh provider after restart can answer normally', async () => {
    const oldInstance = provider(async (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const inFlight = oldInstance.generate('s', [{ content: 'interrompida' }], { userId: 'old' });
    await new Promise(resolve => setImmediate(resolve));
    oldInstance.stop();
    await assert.rejects(inFlight, /cancelada/);

    const restarted = provider(async () => chat('Após reinício.'));
    assert.equal(await restarted.generate('s', [{ content: 'novo processo' }], { userId: 'new' }), 'Após reinício.');
});

test('redacts credentials, bounds prompt and answer lengths, and honors disabled mode', async () => {
    let sentBody;
    const instance = provider(async (_url, init) => { sentBody = JSON.parse(init.body); return chat('x'.repeat(500)); }, {
        OLLAMA_MAX_PROMPT_CHARS: '500', OLLAMA_MAX_RESPONSE_CHARS: '100'
    });
    const answer = await instance.generate('system', [{ content: 'token=super-secret ' + 'a'.repeat(900) }]);
    assert.equal(answer.length, 100);
    assert.doesNotMatch(JSON.stringify(sentBody), /super-secret/);
    assert.ok(sentBody.messages.at(-1).content.length <= 500);

    const disabled = provider(async () => { throw new Error('must not call'); }, { OLLAMA_ENABLED: 'false' });
    assert.equal((await disabled.getStatus()).enabled, false);
    await assert.rejects(disabled.generate('s', [{ content: 'oi' }]), /desativada/);
});
