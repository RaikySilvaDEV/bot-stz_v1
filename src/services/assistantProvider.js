const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'qwen2.5:3b';

function getLocalEndpoint() {
    const raw = process.env.OLLAMA_URL?.trim() || DEFAULT_OLLAMA_URL;
    try {
        const url = new URL(raw);
        const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
        if (url.protocol !== 'http:' || !localHosts.has(url.hostname)) return null;
        return url.toString().replace(/\/$/, '');
    } catch { return null; }
}

export function getConfiguredAssistantModel() {
    return process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
}

export async function getAssistantStatus() {
    const endpoint = getLocalEndpoint();
    const model = getConfiguredAssistantModel();
    if (!endpoint) return { provider: 'Ollama local', configured: false, available: false, ready: false, model, detail: 'OLLAMA_URL precisa apontar para localhost.' };
    try {
        const response = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(1800) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const installed = Array.isArray(data.models) && data.models.some(item => item.name === model || item.model === model);
        return {
            provider: 'Ollama local', configured: true, available: true, ready: installed, model,
            detail: installed ? `Ollama ativo · modelo ${model} pronto.` : `Ollama ativo, mas falta baixar o modelo ${model}. Execute: ollama pull ${model}`
        };
    } catch {
        return { provider: 'Ollama local', configured: true, available: false, ready: false, model, detail: 'Ollama local não respondeu em http://127.0.0.1:11434. Inicie o Ollama no computador do bot.' };
    }
}

export async function generateAssistantResponse(systemPrompt, messages) {
    const status = await getAssistantStatus();
    if (!status.available) throw Object.assign(new Error(status.detail), { status: 503 });
    if (!status.ready) throw Object.assign(new Error(status.detail), { status: 503 });

    const endpoint = getLocalEndpoint();
    let response;
    try {
        response = await fetch(`${endpoint}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: status.model,
                stream: false,
                messages: [{ role: 'system', content: systemPrompt }, ...messages],
                options: { temperature: 0.35, num_predict: 500 }
            }),
            signal: AbortSignal.timeout(90_000)
        });
    } catch (error) {
        const message = error.name === 'TimeoutError' ? 'A IA local demorou mais de 90 segundos para responder.' : `Não consegui acessar o Ollama local: ${error.message}`;
        throw Object.assign(new Error(message), { status: 503 });
    }
    if (!response.ok) throw Object.assign(new Error(`Ollama respondeu com HTTP ${response.status}. Verifique o modelo local.`), { status: 502 });
    const data = await response.json();
    const answer = typeof data.message?.content === 'string' ? data.message.content.trim() : '';
    if (!answer) throw Object.assign(new Error('O modelo local retornou uma resposta vazia.'), { status: 502 });
    return answer;
}
