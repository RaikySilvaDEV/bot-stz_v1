import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENV_FILE = path.join(PROJECT_ROOT, '.env');
const KEYS = ['MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET', 'MERCADO_PAGO_WEBHOOK_URL', 'MERCADO_PAGO_PAYOUTS_WEBHOOK_URL', 'MERCADO_PAGO_PAYOUTS_ACCESS_TOKEN', 'MERCADO_PAGO_PAYOUTS_TEST_MODE', 'MERCADO_PAGO_PAYOUTS_TEST_MAX_CENTS', 'MERCADO_PAGO_PAYOUTS_PRIVATE_KEY_PATH', 'PARTNER_PAYOUTS_ENCRYPTION_KEY'];

export function getMercadoPagoSettingsStatus() {
    return {
        accessTokenConfigured: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()),
        webhookSecretConfigured: Boolean(process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()),
        webhookUrl: process.env.MERCADO_PAGO_WEBHOOK_URL?.trim() || '',
        payoutsWebhookUrl: process.env.MERCADO_PAGO_PAYOUTS_WEBHOOK_URL?.trim() || '',
        payoutsAccessTokenConfigured: Boolean(process.env.MERCADO_PAGO_PAYOUTS_ACCESS_TOKEN?.trim()),
        payoutsTestMode: process.env.MERCADO_PAGO_PAYOUTS_TEST_MODE !== 'false',
        payoutsTestMaxCents: Number.parseInt(process.env.MERCADO_PAGO_PAYOUTS_TEST_MAX_CENTS ?? '1000', 10),
        payoutsPrivateKeyPathConfigured: Boolean(process.env.MERCADO_PAGO_PAYOUTS_PRIVATE_KEY_PATH?.trim()),
        payoutsEncryptionReady: Boolean(process.env.PARTNER_PAYOUTS_ENCRYPTION_KEY?.trim()),
        ready: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim() &&
            process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() && isValidWebhookUrl(process.env.MERCADO_PAGO_WEBHOOK_URL))
    };
}

export function saveMercadoPagoSettings(input) {
    const current = {
        MERCADO_PAGO_ACCESS_TOKEN: process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim() ?? '',
        MERCADO_PAGO_WEBHOOK_SECRET: process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() ?? '',
        MERCADO_PAGO_WEBHOOK_URL: process.env.MERCADO_PAGO_WEBHOOK_URL?.trim() ?? '',
        MERCADO_PAGO_PAYOUTS_WEBHOOK_URL: process.env.MERCADO_PAGO_PAYOUTS_WEBHOOK_URL?.trim() ?? '',
        MERCADO_PAGO_PAYOUTS_ACCESS_TOKEN: process.env.MERCADO_PAGO_PAYOUTS_ACCESS_TOKEN?.trim() ?? '',
        MERCADO_PAGO_PAYOUTS_TEST_MODE: process.env.MERCADO_PAGO_PAYOUTS_TEST_MODE?.trim() || 'true',
        MERCADO_PAGO_PAYOUTS_TEST_MAX_CENTS: process.env.MERCADO_PAGO_PAYOUTS_TEST_MAX_CENTS?.trim() || '1000',
        MERCADO_PAGO_PAYOUTS_PRIVATE_KEY_PATH: process.env.MERCADO_PAGO_PAYOUTS_PRIVATE_KEY_PATH?.trim() ?? '',
        PARTNER_PAYOUTS_ENCRYPTION_KEY: process.env.PARTNER_PAYOUTS_ENCRYPTION_KEY?.trim() ?? ''
    };
    const values = { ...current };
    for (const [field, key] of [
        ['accessToken', 'MERCADO_PAGO_ACCESS_TOKEN'],
        ['webhookSecret', 'MERCADO_PAGO_WEBHOOK_SECRET'],
        ['webhookUrl', 'MERCADO_PAGO_WEBHOOK_URL'],
        ['payoutsWebhookUrl', 'MERCADO_PAGO_PAYOUTS_WEBHOOK_URL'],
        ['payoutsAccessToken', 'MERCADO_PAGO_PAYOUTS_ACCESS_TOKEN'],
        ['payoutsPrivateKeyPath', 'MERCADO_PAGO_PAYOUTS_PRIVATE_KEY_PATH'],
        ['payoutsEncryptionKey', 'PARTNER_PAYOUTS_ENCRYPTION_KEY']
    ]) {
        const value = input[field];
        if (value !== undefined && typeof value !== 'string') throw new TypeError('Os campos de configuração precisam ser texto.');
        const trimmed = typeof value === 'string' ? value.trim() : '';
        if (trimmed && /[\r\n\0]/.test(trimmed)) throw new TypeError('Credenciais não podem conter quebras de linha ou caracteres de controle.');
        if (trimmed) values[key] = trimmed;
        if (input[`clear${field[0].toUpperCase()}${field.slice(1)}`] === true) values[key] = '';
    }
    if (input.payoutsTestMode !== undefined) {
        if (typeof input.payoutsTestMode !== 'boolean') throw new TypeError('O modo de teste Payouts precisa ser verdadeiro ou falso.');
        values.MERCADO_PAGO_PAYOUTS_TEST_MODE = String(input.payoutsTestMode);
    }
    if (input.payoutsTestMaxCents !== undefined) {
        if (!Number.isSafeInteger(input.payoutsTestMaxCents) || input.payoutsTestMaxCents < 100 || input.payoutsTestMaxCents > 10_000_000) {
            throw new TypeError('O limite de teste deve ficar entre R$ 1,00 e R$ 100.000,00.');
        }
        values.MERCADO_PAGO_PAYOUTS_TEST_MAX_CENTS = String(input.payoutsTestMaxCents);
    }
    if (values.MERCADO_PAGO_ACCESS_TOKEN.length > 1000 || values.MERCADO_PAGO_WEBHOOK_SECRET.length > 1000) {
        throw new TypeError('A credencial excede o tamanho permitido.');
    }
    if (values.MERCADO_PAGO_WEBHOOK_URL && !isValidWebhookUrl(values.MERCADO_PAGO_WEBHOOK_URL)) {
        throw new TypeError('Use uma URL pública HTTPS terminando em /api/webhooks/mercado-pago.');
    }
    if (values.MERCADO_PAGO_PAYOUTS_WEBHOOK_URL && !isValidPayoutWebhookUrl(values.MERCADO_PAGO_PAYOUTS_WEBHOOK_URL)) {
        throw new TypeError('Use uma URL pública HTTPS terminando em /api/webhooks/mercado-pago-payouts.');
    }
    if (values.PARTNER_PAYOUTS_ENCRYPTION_KEY && Buffer.from(values.PARTNER_PAYOUTS_ENCRYPTION_KEY, 'base64').length !== 32) {
        throw new TypeError('A chave de proteção dos dados do sócio precisa representar 32 bytes em Base64.');
    }
    if (values.MERCADO_PAGO_PAYOUTS_PRIVATE_KEY_PATH && /[\r\n\0]/.test(values.MERCADO_PAGO_PAYOUTS_PRIVATE_KEY_PATH)) {
        throw new TypeError('O caminho da chave de assinatura contém caracteres inválidos.');
    }
    if (values.MERCADO_PAGO_PAYOUTS_PRIVATE_KEY_PATH) {
        if (!path.isAbsolute(values.MERCADO_PAGO_PAYOUTS_PRIVATE_KEY_PATH)) throw new TypeError('Use um caminho absoluto para a chave privada de Payouts.');
        const relative = path.relative(PROJECT_ROOT, path.resolve(values.MERCADO_PAGO_PAYOUTS_PRIVATE_KEY_PATH));
        if (relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))) {
            throw new TypeError('Mantenha a chave privada Ed25519 fora da pasta do projeto e do Git.');
        }
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

export function generatePartnerPayoutEncryptionKey() {
    if (process.env.PARTNER_PAYOUTS_ENCRYPTION_KEY?.trim()) return false;
    saveMercadoPagoSettings({ payoutsEncryptionKey: randomBytes(32).toString('base64') });
    return true;
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

function isValidPayoutWebhookUrl(value) {
    try {
        const url = new URL(value ?? '');
        return url.protocol === 'https:' && url.pathname.replace(/\/$/, '') === '/api/webhooks/mercado-pago-payouts' && !url.search && !url.hash;
    } catch { return false; }
}
