import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveMercadoPagoSettings } from '../services/mercadoPagoSettings.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TUNNEL_URL_PATTERN = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;
const STARTUP_TUNNEL_WAIT_MS = 12_000;

let bot = null;
let tunnel = null;
let botRestartTimer = null;
let tunnelRestartTimer = null;
let botRestartCount = 0;
let tunnelRestartCount = 0;
let stopping = false;
let restartingBotForTunnel = false;
let tunnelUrlReady;
const firstTunnelUrl = new Promise(resolve => { tunnelUrlReady = resolve; });
let hasTunnelUrl = false;

function retryDelay(count) {
    return Math.min(1000 * (2 ** Math.max(0, count - 1)), 30_000);
}

function startBot() {
    if (stopping || bot) return;

    console.log('[supervisor] Iniciando o bot…');
    bot = spawn(process.execPath, ['index.js'], {
        cwd: PROJECT_ROOT,
        env: process.env,
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
        const publicUrl = line.match(TUNNEL_URL_PATTERN)?.[0];
        if (!publicUrl) continue;

        const dashboardUrl = `${publicUrl}/painel`;
        const webhookUrl = `${publicUrl}/api/webhooks/mercado-pago`;
        const webhookChanged = process.env.MERCADO_PAGO_WEBHOOK_URL !== webhookUrl;
        const changed = process.env.DASHBOARD_PUBLIC_URL !== dashboardUrl || webhookChanged;
        process.env.DASHBOARD_PUBLIC_URL = dashboardUrl;
        if (webhookChanged) {
            process.env.MERCADO_PAGO_WEBHOOK_URL = webhookUrl;
            try {
                saveMercadoPagoSettings({ webhookUrl });
                console.log('[cloudflared] URL do webhook do Mercado Pago atualizada.');
            } catch (error) {
                console.error('[cloudflared] Não foi possível persistir a nova URL do webhook:', error.message);
            }
        }
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

    console.log('[supervisor] Iniciando o túnel Cloudflare para http://127.0.0.1:3001…');
    tunnel = spawn('cloudflared', ['tunnel', '--url', 'http://127.0.0.1:3001'], {
        cwd: PROJECT_ROOT,
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
        const delay = retryDelay(tunnelRestartCount);
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
