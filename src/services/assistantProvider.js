const DEFAULTS = Object.freeze({
    host: 'http://127.0.0.1:11434',
    model: 'qwen2.5:0.5b',
    timeoutMs: 90_000,
    numCtx: 2048,
    numPredict: 512,
    numThread: 1,
    keepAlive: '0',
    maxConcurrent: 1,
    maxQueue: 5,
    globalRequestsPerMinute: 12,
    maxPromptChars: 6000,
    maxResponseChars: 12_000
});

function boundedInteger(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function readConfig(env) {
    const rawHost = env.OLLAMA_HOST?.trim() || env.OLLAMA_URL?.trim() || DEFAULTS.host;
    let host = null;
    try {
        const url = new URL(rawHost);
        const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
        if (url.protocol === 'http:' && localHosts.has(url.hostname) && !url.username && !url.password &&
            (url.pathname === '/' || url.pathname === '') && !url.search && !url.hash) {
            host = url.origin;
        }
    } catch { /* Host inválido fica indisponível sem afetar o bot. */ }

    const rawModel = env.OLLAMA_MODEL?.trim() || DEFAULTS.model;
    const model = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(rawModel) ? rawModel : DEFAULTS.model;
    const keepAlive = env.OLLAMA_KEEP_ALIVE?.trim() || DEFAULTS.keepAlive;
    const safeKeepAlive = /^(0|[1-9]\d*(ms|s|m|h))$/.test(keepAlive) ? keepAlive : DEFAULTS.keepAlive;

    return Object.freeze({
        enabled: !['false', '0', 'no', 'off'].includes((env.OLLAMA_ENABLED ?? 'true').trim().toLowerCase()),
        host,
        model,
        timeoutMs: boundedInteger(env.OLLAMA_TIMEOUT_MS, DEFAULTS.timeoutMs, 1000, 180_000),
        numCtx: boundedInteger(env.OLLAMA_NUM_CTX, DEFAULTS.numCtx, 256, 4096),
        numPredict: boundedInteger(env.OLLAMA_NUM_PREDICT, DEFAULTS.numPredict, 1, 2048),
        numThread: boundedInteger(env.OLLAMA_NUM_THREAD, DEFAULTS.numThread, 1, 4),
        keepAlive: safeKeepAlive,
        // O modelo leve deste host foi dimensionado para uma inferência por vez.
        maxConcurrent: Math.min(1, boundedInteger(env.OLLAMA_MAX_CONCURRENT, DEFAULTS.maxConcurrent, 1, 8)),
        maxQueue: boundedInteger(env.OLLAMA_MAX_QUEUE, DEFAULTS.maxQueue, 0, 20),
        globalRequestsPerMinute: boundedInteger(env.OLLAMA_GLOBAL_RPM, DEFAULTS.globalRequestsPerMinute, 1, 120),
        maxPromptChars: boundedInteger(env.OLLAMA_MAX_PROMPT_CHARS, DEFAULTS.maxPromptChars, 500, 20_000),
        maxResponseChars: boundedInteger(env.OLLAMA_MAX_RESPONSE_CHARS, DEFAULTS.maxResponseChars, 100, 24_000)
    });
}

function httpError(message, status = 503, cause) {
    const error = new Error(message, cause ? { cause } : undefined);
    error.status = status;
    return error;
}

function sanitizeText(value, maximum) {
    return String(value ?? '')
        .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redigido]')
        .replace(/\b(?:password|senha|token|secret|segredo|api[_ -]?key|chave pix)\s*[:=]\s*[^\s,;]+/gi, '[dado sensível redigido]')
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[e-mail redigido]')
        .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF redigido]')
        .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-. ]?\d{4}\b/g, '[telefone redigido]')
        .replace(/\b(?:mfa\.[\w-]{20,}|[\w-]{24,}\.[\w-]{6,}\.[\w-]{20,})\b/g, '[token redigido]')
        .slice(0, maximum);
}

function abortError(message = 'Solicitação cancelada.') {
    return httpError(message, 499);
}

export function createAssistantProvider({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
    const config = readConfig(env);
    const queue = [];
    const active = new Set();
    const globalRequests = [];
    const recentPrompts = new Map();
    let stopped = false;
    let lastResponseMs = null;

    function getQueueStatus() {
        return {
            queued: queue.length,
            running: active.size,
            maxQueue: config.maxQueue,
            maxConcurrent: config.maxConcurrent,
            lastResponseMs,
            enabled: config.enabled,
            model: config.model
        };
    }

    async function requestJson(url, init, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
        timer.unref?.();
        let relayAbort;
        if (init.signal) {
            if (init.signal.aborted) controller.abort(init.signal.reason);
            else {
                relayAbort = () => controller.abort(init.signal.reason);
                init.signal.addEventListener('abort', relayAbort, { once: true });
            }
        }
        try {
            const response = await fetchImpl(url, { ...init, signal: controller.signal });
            return response;
        } catch (error) {
            if (controller.signal.aborted) {
                if (stopped) throw abortError('Bot encerrando: solicitação de IA cancelada.');
                if (init.signal?.aborted) throw abortError();
                throw httpError(`O Ollama não respondeu dentro de ${Math.round(timeoutMs / 1000)} segundos.`, 504, error);
            }
            throw httpError('Não foi possível conectar ao Ollama local em 127.0.0.1:11434.', 503, error);
        } finally {
            clearTimeout(timer);
            if (init.signal && relayAbort) init.signal.removeEventListener('abort', relayAbort);
        }
    }

    async function getStatus() {
        const stats = getQueueStatus();
        if (!config.enabled) return { provider: 'Ollama local', configured: Boolean(config.host), available: false, ready: false, detail: 'Integração Ollama desligada por OLLAMA_ENABLED=false.', ...stats };
        if (!config.host) return { provider: 'Ollama local', configured: false, available: false, ready: false, detail: 'OLLAMA_HOST precisa apontar para localhost ou 127.0.0.1.', ...stats };
        if (stopped) return { provider: 'Ollama local', configured: true, available: false, ready: false, detail: 'Serviço de IA está encerrando.', ...stats };
        try {
            const response = await requestJson(`${config.host}/api/tags`, { method: 'GET' }, Math.min(config.timeoutMs, 1800));
            if (!response.ok) throw httpError(`Ollama respondeu com HTTP ${response.status} ao consultar os modelos.`, 502);
            const data = await response.json();
            const installed = Array.isArray(data.models) && data.models.some(item => item.name === config.model || item.model === config.model);
            return {
                provider: 'Ollama local', configured: true, available: true, ready: installed,
                detail: installed ? `Ollama local disponível; modelo ${config.model} instalado.` : `Ollama respondeu, mas o modelo ${config.model} não está instalado. Execute: ollama pull ${config.model}`,
                ...getQueueStatus()
            };
        } catch (error) {
            return { provider: 'Ollama local', configured: true, available: false, ready: false, detail: error.message, ...getQueueStatus() };
        }
    }

    function validateAndReserve(messages, userId) {
        if (stopped) throw httpError('O serviço de IA está encerrando. Tente novamente em instantes.', 503);
        if (!config.enabled) throw httpError('A IA local está desativada. Defina OLLAMA_ENABLED=true para habilitá-la.', 503);
        if (!config.host) throw httpError('Ollama foi recusado: OLLAMA_HOST deve apontar somente para localhost.', 503);
        if (!Array.isArray(messages) || messages.length === 0) throw httpError('Envie uma pergunta para consultar a IA.', 400);

        const normalized = messages.slice(-8).map(message => {
            const role = message?.role === 'assistant' ? 'assistant' : 'user';
            return { role, content: sanitizeText(message?.content, config.maxPromptChars) };
        }).filter(message => message.content.trim());
        if (!normalized.length) throw httpError('A pergunta está vazia após remover conteúdo não permitido.', 400);
        let remaining = config.maxPromptChars;
        for (let index = normalized.length - 1; index >= 0; index -= 1) {
            normalized[index].content = normalized[index].content.slice(0, remaining);
            remaining -= normalized[index].content.length;
        }
        const promptKey = normalized.map(item => item.content).join('\n').toLowerCase();
        const timestamp = now();
        const userKey = userId ? String(userId) : null;
        for (const [key, previous] of recentPrompts) {
            if (timestamp - previous.at >= 60_000) recentPrompts.delete(key);
        }
        if (userKey) {
            const previousPrompt = recentPrompts.get(userKey);
            if (previousPrompt?.value === promptKey && timestamp - previousPrompt.at < 60_000) {
                throw httpError('Essa mesma pergunta acabou de ser enviada. Aguarde ou reformule a mensagem.', 429);
            }
        }
        while (globalRequests.length && timestamp - globalRequests[0] >= 60_000) globalRequests.shift();
        if (globalRequests.length >= config.globalRequestsPerMinute) {
            throw httpError('A IA está ocupada. O limite global temporário foi atingido; tente novamente em um minuto.', 429);
        }
        if (queue.length >= config.maxQueue && active.size >= config.maxConcurrent) {
            throw httpError('A fila da IA está cheia. Aguarde a resposta atual e tente novamente.', 503);
        }
        globalRequests.push(timestamp);
        if (userKey) recentPrompts.set(userKey, { value: promptKey, at: timestamp });
        return normalized;
    }

    async function runTask(task) {
        const startedAt = now();
        const { controller } = task;
        const timer = setTimeout(() => controller.abort(new Error('timeout')), config.timeoutMs);
        timer.unref?.();
        let externalAbort;
        if (task.signal) {
            externalAbort = () => controller.abort(task.signal.reason);
            if (task.signal.aborted) externalAbort();
            else task.signal.addEventListener('abort', externalAbort, { once: true });
        }
        try {
            const messages = [
                // Preserve the full support/sales rules and the live catalog appended to them.
                { role: 'system', content: sanitizeText(task.systemPrompt, 12_000) },
                ...task.messages
            ];
            const answerParts = [];
            let answerLength = 0;
            let truncated = false;
            for (let continuation = 0; continuation < 6; continuation += 1) {
                const response = await fetchImpl(`${config.host}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: config.model,
                        stream: false,
                        keep_alive: config.keepAlive,
                        messages,
                        options: {
                            temperature: 0.35,
                            num_ctx: config.numCtx,
                            num_predict: config.numPredict,
                            num_thread: config.numThread
                        }
                    }),
                    signal: controller.signal
                });
                if (!response.ok) {
                    const status = response.status === 404 ? 503 : 502;
                    throw httpError(response.status === 404
                        ? `O modelo ${config.model} não foi encontrado no Ollama. Instale-o com: ollama pull ${config.model}`
                        : `Ollama respondeu com HTTP ${response.status}.`, status);
                }
                let data;
                try { data = await response.json(); }
                catch (error) { throw httpError('O Ollama retornou uma resposta inválida.', 502, error); }
                const part = typeof data.message?.content === 'string' ? data.message.content : '';
                if (!part.trim()) break;
                answerParts.push(part);
                answerLength += part.length;
                truncated = data.done_reason === 'length' || data.done === false;
                if (!truncated || answerLength >= config.maxResponseChars) break;
                messages.push(
                    { role: 'assistant', content: part },
                    { role: 'user', content: 'Continue exatamente do ponto em que parou, sem repetir o texto anterior. Termine a resposta de forma completa e concisa.' }
                );
            }
            const answer = answerParts.join('').trim();
            if (!answer) throw httpError('O modelo local retornou uma resposta vazia. Tente reformular a pergunta.', 502);
            lastResponseMs = Math.max(0, now() - startedAt);
            if (truncated) return `${answer}\n\n_(Resposta longa; envie “continue” se precisar da continuação.)_`;
            return answer;
        } catch (error) {
            if (controller.signal.aborted) {
                if (stopped) throw abortError('Bot encerrando: geração de IA cancelada.');
                if (task.signal?.aborted) throw abortError();
                throw httpError(`A IA local excedeu o timeout de ${Math.round(config.timeoutMs / 1000)} segundos.`, 504, error);
            }
            if (error.status) throw error;
            throw httpError('Não foi possível conectar ao Ollama local em 127.0.0.1:11434.', 503, error);
        } finally {
            clearTimeout(timer);
            if (task.signal && externalAbort) task.signal.removeEventListener('abort', externalAbort);
        }
    }

    function drain() {
        while (!stopped && active.size < config.maxConcurrent && queue.length) {
            const task = queue.shift();
            if (task.signal?.aborted) {
                task.reject(abortError());
                continue;
            }
            active.add(task);
            runTask(task).then(task.resolve, task.reject).finally(() => {
                active.delete(task);
                drain();
            });
        }
    }

    function generate(systemPrompt, messages, { userId, signal } = {}) {
        let normalized;
        try { normalized = validateAndReserve(messages, userId); }
        catch (error) { return Promise.reject(error); }
        if (signal?.aborted) return Promise.reject(abortError());
        if (active.size >= config.maxConcurrent && queue.length >= config.maxQueue) {
            return Promise.reject(httpError('A fila da IA está cheia. Aguarde a resposta atual e tente novamente.', 503));
        }
        let task;
        const pending = new Promise((resolve, reject) => {
            task = { systemPrompt: String(systemPrompt ?? ''), messages: normalized, userId, signal, resolve, reject, controller: new AbortController() };
            task.cancel = () => {
                const queuedIndex = queue.indexOf(task);
                if (queuedIndex !== -1) {
                    queue.splice(queuedIndex, 1);
                    reject(abortError());
                } else if (active.has(task)) {
                    task.controller.abort(signal?.reason);
                }
            };
            if (signal) signal.addEventListener('abort', task.cancel, { once: true });
            queue.push(task);
            drain();
        });
        return pending.finally(() => {
            if (signal) signal.removeEventListener('abort', task.cancel);
        });
    }

    function stop() {
        if (stopped) return;
        stopped = true;
        for (const task of queue.splice(0)) task.reject(abortError('Bot encerrando: solicitação na fila cancelada.'));
        for (const task of active) task.controller.abort(new Error('shutdown'));
    }

    return { getStatus, getQueueStatus, generate, stop };
}

const provider = createAssistantProvider();

export function getConfiguredAssistantModel() { return provider.getQueueStatus().model; }
export function getAssistantStatus() { return provider.getStatus(); }
export function getAssistantQueueStatus() { return provider.getQueueStatus(); }
export function generateAssistantResponse(systemPrompt, messages, options) { return provider.generate(systemPrompt, messages, options); }
export function stopAssistantProvider() { provider.stop(); }
