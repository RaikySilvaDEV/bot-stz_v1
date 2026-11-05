import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import {
    atualizarAnuncioFiveM, criarAnuncioFiveM, listarAnunciosFiveM, removerAnuncioFiveM
} from '../features/fivemAnnouncements.js';

const API_PORT = Number.parseInt(process.env.API_PORT ?? '3001', 10);
const API_KEY = process.env.API_KEY ?? '';
const MAX_BODY_BYTES = 10 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const requestsByAddress = new Map();
let servidor;

export function getApiStatus() {
    return { running: Boolean(servidor?.listening), port: API_PORT };
}

function responder(res, status, dados) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(dados));
}

function limiteAtingido(req) {
    const now = Date.now();
    const address = req.socket.remoteAddress ?? 'unknown';
    const current = requestsByAddress.get(address);
    if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
        requestsByAddress.set(address, { startedAt: now, count: 1 });
        return false;
    }
    current.count += 1;
    return current.count > RATE_LIMIT_MAX_REQUESTS;
}

function chaveValida(req) {
    const fornecida = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    const a = Buffer.from(fornecida);
    const b = Buffer.from(API_KEY);
    return Boolean(API_KEY) && a.length === b.length && timingSafeEqual(a, b);
}

async function lerJson(req) {
    const partes = [];
    let tamanho = 0;
    for await (const parte of req) {
        tamanho += parte.length;
        if (tamanho > MAX_BODY_BYTES) throw Object.assign(new Error('Corpo JSON excede 10 KB.'), { status: 413 });
        partes.push(parte);
    }
    try {
        return JSON.parse(Buffer.concat(partes).toString('utf8'));
    } catch {
        throw Object.assign(new Error('Envie um JSON válido no corpo da requisição.'), { status: 400 });
    }
}

async function lidarComRequisicao(req, res) {
    if (limiteAtingido(req)) return responder(res, 429, { erro: 'Limite de requisições excedido. Aguarde um minuto.' });
    if (!chaveValida(req)) return responder(res, 401, { erro: 'Chave inválida. Envie Authorization: Bearer SUA_API_KEY.' });
    const url = new URL(req.url, 'http://127.0.0.1');
    const rota = url.pathname.match(/^\/api\/anuncios\/fivem\/?(?:([^/]+)\/?)?$/);
    if (!rota) return responder(res, 404, { erro: 'Rota não encontrada.' });
    const id = rota[1] ?? null;

    try {
        if (req.method === 'GET' && !id) return responder(res, 200, listarAnunciosFiveM());
        if (req.method === 'GET' && id) {
            const anuncio = listarAnunciosFiveM().find(item => item.id === id);
            return anuncio ? responder(res, 200, anuncio) : responder(res, 404, { erro: 'Anúncio não encontrado.' });
        }
        if (req.method === 'POST' && !id) {
            const anuncio = await criarAnuncioFiveM(await lerJson(req));
            return responder(res, 201, anuncio);
        }
        if (req.method === 'PUT' && id) {
            const anuncio = await atualizarAnuncioFiveM(id, await lerJson(req));
            return anuncio ? responder(res, 200, anuncio) : responder(res, 404, { erro: 'Anúncio não encontrado.' });
        }
        if (req.method === 'DELETE' && id) {
            const removido = await removerAnuncioFiveM(id);
            return removido ? responder(res, 200, { mensagem: 'Anúncio removido.' }) : responder(res, 404, { erro: 'Anúncio não encontrado.' });
        }
        return responder(res, 405, { erro: 'Método não permitido para esta rota.' });
    } catch (error) {
        const status = error.status ?? (error instanceof TypeError ? 400 : 502);
        return responder(res, status, { erro: error.message || 'Falha ao processar anúncio.' });
    }
}

export function iniciarApiAnunciosFiveM() {
    if (servidor) return;
    if (!API_KEY) {
        console.warn('[api] API_KEY não configurada; API Postman não iniciada.');
        return;
    }
    if (!Number.isInteger(API_PORT) || API_PORT < 1 || API_PORT > 65535) {
        console.error('[api] API_PORT inválida; use uma porta entre 1 e 65535.');
        return;
    }
    servidor = createServer((req, res) => void lidarComRequisicao(req, res));
    servidor.on('error', error => console.error('[api] Falha ao iniciar API:', error));
    servidor.listen(API_PORT, '127.0.0.1', () => {
        console.log(`[api] API de anúncios FiveM disponível em http://127.0.0.1:${API_PORT}`);
    });
}
