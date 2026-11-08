import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveMercadoPagoSettings } from '../services/mercadoPagoSettings.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TUNNEL_URL_PATTERN = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;
const STARTUP_TUNNEL_WAIT_MS = 12_000;
const API_PORT = Number.parseInt(process.env.API_PORT ?? '3001', 10);
const CLOUDFLARE_TUNNEL_TOKEN = process.env.CLOUDFLARE_TUNNEL_TOKEN?.trim() ?? '';
const USE_NAMED_TUNNEL = Boolean(CLOUDFLARE_TUNNEL_TOKEN);

let bot = null;
let tunnel = null;
let botRestartTimer = null;
let tunnelRestartTimer = null;
let botRestartCount = 0;
let tunnelRestartCount = 0;
let stopping = false;
let restartingBotForTunnel = false;
let dnsFailureHintShown = false;
let quickTunnelRateLimited = false;
let tunnelUrlReady;
const firstTunnelUrl = new Promise(resolve => { tunnelUrlReady = resolve; });
let hasTunnelUrl = false;

function retryDelay(count) {
    return Math.min(1000 * (2 ** Math.max(0, count - 1)), 30_000);
}

function startBot() {
    if (stopping || bot) return;

    console.log('[supervisor] Iniciando o bot…');
    const botEnv = { ...process.env };
    delete botEnv.CLOUDFLARE_TUNNEL_TOKEN;
    delete botEnv.TUNNEL_TOKEN;
    bot = spawn(process.execPath, ['index.js'], {
        cwd: PROJECT_ROOT,
        env: botEnv,
        stdio: 'inherit',
        windowsHide: true
    });

    bot.on('error', error => {
        console.error('[supervisor] Não foi possível iniciar o bot:', error.message);
    });

    bot.on('close', (code, signal) => {
        bot = null;
        if (stopping) return;

        if (restartingBotForTunnel) {
            restartingBotForTunnel = false;
            startBot();
            return;
        }

        botRestartCount += 1;
        const delay = retryDelay(botRestartCount);
        console.error(`[supervisor] Bot encerrou (código ${code ?? 'indisponível'}${signal ? `, sinal ${signal}` : ''}). Nova tentativa em ${Math.ceil(delay / 1000)}s.`);
        botRestartTimer = setTimeout(startBot, delay);
    });
}

function configuredNamedTunnelOrigin() {
    const rawUrl = process.env.DASHBOARD_PUBLIC_URL?.trim();
    if (!rawUrl) return null;

    try {
        const url = new URL(rawUrl);
        const validPath = ['', '/', '/painel', '/painel/'].includes(url.pathname);
        if (url.protocol !== 'https:' || !validPath || url.username || url.password || url.search || url.hash ||
            url.hostname.endsWith('.trycloudflare.com')) return null;
        return url.origin;
    } catch {
        return null;
    }
}

function configurePublicEndpoints(publicOrigin) {
    const origin = new URL(publicOrigin).origin;
    const dashboardUrl = `${origin}/painel`;
    const webhookUrl = `${origin}/api/webhooks/mercado-pago`;
    const payoutsWebhookUrl = `${origin}/api/webhooks/mercado-pago-payouts`;
    const webhookChanged = process.env.MERCADO_PAGO_WEBHOOK_URL !== webhookUrl;
    const payoutsWebhookChanged = process.env.MERCADO_PAGO_PAYOUTS_WEBHOOK_URL !== payoutsWebhookUrl;
    const changed = process.env.DASHBOARD_PUBLIC_URL !== dashboardUrl || webhookChanged || payoutsWebhookChanged;

    process.env.DASHBOARD_PUBLIC_URL = dashboardUrl;
    if (webhookChanged) process.env.MERCADO_PAGO_WEBHOOK_URL = webhookUrl;
    if (payoutsWebhookChanged) process.env.MERCADO_PAGO_PAYOUTS_WEBHOOK_URL = payoutsWebhookUrl;

    if (webhookChanged || payoutsWebhookChanged) {
        try {
            saveMercadoPagoSettings({
                ...(webhookChanged ? { webhookUrl } : {}),
                ...(payoutsWebhookChanged ? { payoutsWebhookUrl } : {})
            });
            console.log('[cloudflared] URLs de webhook do Mercado Pago atualizadas.');
        } catch (error) {
            console.error('[cloudflared] Não foi possível persistir a nova URL do webhook:', error.message);
        }
    }

    return { dashboardUrl, changed };
}

function announceNamedTunnelConnection() {
    const origin = configuredNamedTunnelOrigin();
    if (!origin) {
        console.error('[cloudflared] Configure DASHBOARD_PUBLIC_URL com o hostname HTTPS publicado no túnel nomeado e caminho /painel.');
        return;
    }

    const { dashboardUrl } = configurePublicEndpoints(origin);
    if (!hasTunnelUrl) {
        hasTunnelUrl = true;
        tunnelUrlReady();
    }
    console.log(`[cloudflared] Túnel nomeado conectado. Painel externo: ${dashboardUrl}`);
}

function restartBotWithNewTunnelUrl() {
    if (!bot || stopping) return;
    restartingBotForTunnel = true;
    console.log('[supervisor] Reiniciando o bot para aplicar o novo endereço público…');
    bot.kill('SIGTERM');
}

function processTunnelOutput(chunk) {
    const output = chunk.toString();
    for (const line of output.split(/\r?\n/).filter(Boolean)) {
        console.log(`[cloudflared] ${line}`);
        if (/quick tunnel provisioning failed with status 429/i.test(line)) {
            quickTunnelRateLimited = true;
            console.warn('[cloudflared] O Cloudflare limitou a criação do Quick Tunnel (HTTP 429). A próxima tentativa será em 5 minutos; para acesso estável configure um túnel nomeado.');
        }
        if (/Failed to refresh DNS local resolver error=.*(timeout|i\/o timeout)/i.test(line) && !dnsFailureHintShown) {
            dnsFailureHintShown = true;
            console.warn('[cloudflared] O DNS configurado no Windows não respondeu. O túnel tentará novamente; se persistir, troque o DNS do adaptador de rede para 1.1.1.1 e 1.0.0.1 ou libere consultas UDP na porta 53.');
        }
        if (USE_NAMED_TUNNEL && /Registered tunnel connection/i.test(line)) {
            announceNamedTunnelConnection();
            continue;
        }

        if (USE_NAMED_TUNNEL) continue;

        const publicUrl = line.match(TUNNEL_URL_PATTERN)?.[0];
        if (!publicUrl) continue;
        dnsFailureHintShown = false;
        const { dashboardUrl, changed } = configurePublicEndpoints(publicUrl);
        if (!hasTunnelUrl) {
            hasTunnelUrl = true;
            tunnelUrlReady();
            console.log(`[cloudflared] Painel externo: ${dashboardUrl}`);
        } else if (changed) {
            console.log(`[cloudflared] Novo endereço público: ${dashboardUrl}`);
            restartBotWithNewTunnelUrl();
        }
    }
}

function startTunnel() {
    if (stopping || tunnel) return;

    const tunnelArgs = USE_NAMED_TUNNEL
        ? ['tunnel', 'run']
        : ['tunnel', '--url', `http://127.0.0.1:${API_PORT}`];
    const tunnelEnv = USE_NAMED_TUNNEL
        ? { ...process.env, TUNNEL_TOKEN: CLOUDFLARE_TUNNEL_TOKEN }
        : process.env;

    if (USE_NAMED_TUNNEL) {
        const origin = configuredNamedTunnelOrigin();
        if (origin) {
            const { dashboardUrl } = configurePublicEndpoints(origin);
            console.log(`[supervisor] Iniciando túnel Cloudflare nomeado para ${dashboardUrl}…`);
        } else {
            console.log('[supervisor] Iniciando túnel Cloudflare nomeado…');
            console.warn('[cloudflared] Defina DASHBOARD_PUBLIC_URL como HTTPS do hostname publicado, terminando em /painel.');
        }
    } else {
        console.log(`[supervisor] Iniciando o túnel Cloudflare Quick Tunnel para http://127.0.0.1:${API_PORT}…`);
    }

    tunnel = spawn('cloudflared', tunnelArgs, {
        cwd: PROJECT_ROOT,
        env: tunnelEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });

    tunnel.stdout.on('data', processTunnelOutput);
    tunnel.stderr.on('data', processTunnelOutput);
    tunnel.on('error', error => {
        console.error(`[cloudflared] Não foi possível iniciar o túnel: ${error.message}`);
        console.error('[cloudflared] Confira se o cloudflared está instalado e disponível no PATH.');
    });

    tunnel.on('close', (code, signal) => {
        tunnel = null;
        if (stopping) return;

        tunnelRestartCount += 1;
        const delay = quickTunnelRateLimited ? 300_000 : retryDelay(tunnelRestartCount);
        quickTunnelRateLimited = false;
        console.error(`[cloudflared] Túnel encerrou (código ${code ?? 'indisponível'}${signal ? `, sinal ${signal}` : ''}). Nova tentativa em ${Math.ceil(delay / 1000)}s.`);
        tunnelRestartTimer = setTimeout(startTunnel, delay);
    });
}

function stop(signal) {
    if (stopping) return;
    stopping = true;
    if (botRestartTimer) clearTimeout(botRestartTimer);
    if (tunnelRestartTimer) clearTimeout(tunnelRestartTimer);

    console.log('\n[supervisor] Encerrando bot e túnel…');
    for (const child of [bot, tunnel]) {
        if (child && !child.killed) {
            const childSignal = process.platform === 'win32' ? 'SIGTERM' : signal;
            child.kill(childSignal);
        }
    }
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

async function main() {
    startTunnel();
    await Promise.race([
        firstTunnelUrl,
        new Promise(resolve => setTimeout(resolve, STARTUP_TUNNEL_WAIT_MS))
    ]);

    if (!hasTunnelUrl) {
        console.warn('[cloudflared] Ainda não detectei o endereço público. O bot será iniciado; confira as mensagens do túnel acima.');
    }

    startBot();
}

main().catch(error => {
    console.error('[supervisor] Falha ao iniciar os serviços:', error);
    stop('SIGTERM');
    process.exitCode = 1;
});
