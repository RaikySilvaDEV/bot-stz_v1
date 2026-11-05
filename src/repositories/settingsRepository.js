import { readJsonData, writeJsonData } from '../data/jsonStore.js';
import {
    CANAL_ANUNCIO_FIVE_M_ID, CANAL_AVISOS_VENDAS_PUBLICA, CANAL_BOAS_VINDAS_ID,
    CANAL_COMPRAS_ONLINE_STATUS, CANAL_INFO_PRECISION_ID, CANAL_NOVIDADES_CARGOS_ID,
    CANAL_PARCERIA_PUBLICA, CANAL_POST_BOOSTERS, CANAL_POST_CTZ, CANAL_SUGESTAO_ID,
    CANAL_VERIFICACAO_ID, CANAL_WALLPAPERS_ID, CATEGORIA_SUPORTE_ID, GUILD_ID
} from '../config/constants.js';

const SETTINGS_FILE = 'bot-config.json';

const DEFAULT_SETTINGS = {
    guildId: GUILD_ID,
    timezone: process.env.BOT_TIME_ZONE || 'America/Sao_Paulo',
    announcementHours: [5, 12, 18],
    everyoneMentions: true,
    automations: { announcements: true, wallpapers: true, stock: true, aiResponses: true },
    channels: {
        partnerships: CANAL_PARCERIA_PUBLICA,
        fivemAnnouncements: CANAL_ANUNCIO_FIVE_M_ID,
        supportCategory: CATEGORIA_SUPORTE_ID,
        verification: CANAL_VERIFICACAO_ID,
        welcome: CANAL_BOAS_VINDAS_ID,
        wallpapers: CANAL_WALLPAPERS_ID,
        suggestions: CANAL_SUGESTAO_ID,
        purchaseStatus: CANAL_COMPRAS_ONLINE_STATUS,
        supportNotices: CANAL_AVISOS_VENDAS_PUBLICA,
        roleNews: CANAL_NOVIDADES_CARGOS_ID,
        precisionInfo: CANAL_INFO_PRECISION_ID,
        stockCtz: CANAL_POST_CTZ,
        stockBoosters: CANAL_POST_BOOSTERS,
        audit: null
    }
};

export function getSettings() {
    const loaded = readJsonData(SETTINGS_FILE, {});
    const saved = loaded && typeof loaded === 'object' && !Array.isArray(loaded) ? loaded : {};
    const timezone = typeof saved.timezone === 'string' ? saved.timezone : DEFAULT_SETTINGS.timezone;
    let validTimezone = DEFAULT_SETTINGS.timezone;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
        validTimezone = timezone;
    } catch { /* Fuso inválido: segue com o padrão do projeto. */ }
    const rawHours = Array.isArray(saved.announcementHours) ? saved.announcementHours : DEFAULT_SETTINGS.announcementHours;
    const hours = [...new Set(rawHours.filter(hour => Number.isInteger(hour) && hour >= 0 && hour <= 23))].sort((a, b) => a - b);
    return {
        ...structuredClone(DEFAULT_SETTINGS),
        ...saved,
        timezone: validTimezone,
        announcementHours: hours.length ? hours : DEFAULT_SETTINGS.announcementHours,
        everyoneMentions: typeof saved.everyoneMentions === 'boolean' ? saved.everyoneMentions : DEFAULT_SETTINGS.everyoneMentions,
        automations: { ...DEFAULT_SETTINGS.automations, ...(saved.automations ?? {}) },
        channels: { ...DEFAULT_SETTINGS.channels, ...(saved.channels ?? {}) }
    };
}

export function updateSettings(update) {
    const current = getSettings();
    const next = {
        ...current,
        ...update,
        automations: { ...current.automations, ...(update.automations ?? {}) },
        channels: { ...current.channels, ...(update.channels ?? {}) }
    };
    writeJsonData(SETTINGS_FILE, next);
    return next;
}
