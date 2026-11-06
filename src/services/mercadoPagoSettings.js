import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENV_FILE = path.join(PROJECT_ROOT, '.env');
const KEYS = ['MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET', 'MERCADO_PAGO_WEBHOOK_URL'];

export function getMercadoPagoSettingsStatus() {
    return {
        accessTokenConfigured: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()),
        webhookSecretConfigured: Boolean(process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()),
        webhookUrl: process.env.MERCADO_PAGO_WEBHOOK_URL?.trim() || '',
        ready: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim() &&
            process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() && isValidWebhookUrl(process.env.MERCADO_PAGO_WEBHOOK_URL))
    };
}

export function saveMercadoPagoSettings(input) {
    const current = {
        MERCADO_PAGO_ACCESS_TOKEN: process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim() ?? '',
        MERCADO_PAGO_WEBHOOK_SECRET: process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() ?? '',
        MERCADO_PAGO_WEBHOOK_URL: process.env.MERCADO_PAGO_WEBHOOK_URL?.trim() ?? ''
    };
    const values = { ...current };
    for (const [field, key] of [
        ['accessToken', 'MERCADO_PAGO_ACCESS_TOKEN'],
        ['webhookSecret', 'MERCADO_PAGO_WEBHOOK_SECRET'],
        ['webhookUrl', 'MERCADO_PAGO_WEBHOOK_URL']
    ]) {
        const value = input[field];
        if (value !== undefined && typeof value !== 'string') throw new TypeError('Os campos de configuração precisam ser texto.');
        const trimmed = typeof value === 'string' ? value.trim() : '';
        if (trimmed && /[\r\n\0]/.test(trimmed)) throw new TypeError('Credenciais não podem conter quebras de linha ou caracteres de controle.');
        if (trimmed) values[key] = trimmed;
        if (input[`clear${field[0].toUpperCase()}${field.slice(1)}`] === true) values[key] = '';
    }
    if (values.MERCADO_PAGO_ACCESS_TOKEN.length > 1000 || values.MERCADO_PAGO_WEBHOOK_SECRET.length > 1000) {
        throw new TypeError('A credencial excede o tamanho permitido.');
    }
    if (values.MERCADO_PAGO_WEBHOOK_URL && !isValidWebhookUrl(values.MERCADO_PAGO_WEBHOOK_URL)) {
        throw new TypeError('Use uma URL pública HTTPS terminando em /api/webhooks/mercado-pago.');
    }

    let contents = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
    let lines = contents.split(/\r?\n/);
    for (const key of KEYS) {
        const value = serializeEnvValue(values[key]);
        let replaced = false;
        lines = lines.flatMap(line => {
            if (!new RegExp(`^\\s*${key}\\s*=`).test(line)) return [line];
            if (replaced) return [];
            replaced = true;
            return [`${key}=${value}`];
        });
        if (!replaced) lines.push(`${key}=${value}`);
    }
    contents = `${lines.join('\n').replace(/\n+$/, '')}\n`;
    const temporaryPath = `${ENV_FILE}.${process.pid}.${randomUUID()}.tmp`;
    try {
        fs.writeFileSync(temporaryPath, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        fs.renameSync(temporaryPath, ENV_FILE);
    } catch (error) {
        fs.rmSync(temporaryPath, { force: true });
        throw error;
    }

    for (const key of KEYS) process.env[key] = values[key];
    return getMercadoPagoSettingsStatus();
}

function serializeEnvValue(value) {
    return /^[A-Za-z0-9._:/@+-]*$/.test(value) ? value : JSON.stringify(value);
}

function isValidWebhookUrl(value) {
    try {
        const url = new URL(value ?? '');
        return url.protocol === 'https:' && url.pathname.replace(/\/$/, '') === '/api/webhooks/mercado-pago' && !url.search && !url.hash;
    } catch { return false; }
}
