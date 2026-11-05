import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const DEFAULT_WALLPAPER_STATE = { diaAtual: 1 };
const DEFAULT_STOCK_STATE = {
    ctz: { indexAtual: 1, ultimoTimestampEnvio: 0 },
    boosters: { indexAtual: 1, ultimoTimestampEnvio: 0 }
};
const LEGACY_TICKETS_FILE = { legacyFiles: ['tickets_notificados.json'] };
const LEGACY_WALLPAPER_FILE = { legacyFiles: ['wallpaper_state.json'] };
const LEGACY_STOCK_FILE = { legacyFiles: ['mod_estoque_state.json'] };

export function getNotifiedTicketIds() {
    const ids = readJsonData('notified-tickets.json', [], LEGACY_TICKETS_FILE);
    return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [];
}

export function addNotifiedTicketId(channelId) {
    if (typeof channelId !== 'string' || !channelId) return;
    const ids = getNotifiedTicketIds();
    if (!ids.includes(channelId)) writeJsonData('notified-tickets.json', [...ids, channelId]);
}

export function getWallpaperState() {
    const state = readJsonData('wallpaper-state.json', DEFAULT_WALLPAPER_STATE, LEGACY_WALLPAPER_FILE);
    const day = Number(state?.diaAtual);
    return { diaAtual: Number.isInteger(day) && day >= 1 && day <= 105 ? day : 1 };
}

export function saveWallpaperState(state) {
    const day = Number(state?.diaAtual);
    writeJsonData('wallpaper-state.json', {
        diaAtual: Number.isInteger(day) && day >= 1 && day <= 105 ? day : 1
    });
}

export function getStockState() {
    const state = readJsonData('stock-state.json', DEFAULT_STOCK_STATE, LEGACY_STOCK_FILE);
    const normalize = value => ({
        indexAtual: Number.isInteger(value?.indexAtual) && value.indexAtual > 0 ? value.indexAtual : 1,
        ultimoTimestampEnvio: Number.isFinite(value?.ultimoTimestampEnvio) && value.ultimoTimestampEnvio >= 0
            ? value.ultimoTimestampEnvio
            : 0
    });
    return { ctz: normalize(state?.ctz), boosters: normalize(state?.boosters) };
}

export function saveStockState(state) {
    const current = getStockState();
    const normalize = value => ({
        indexAtual: Number.isInteger(value?.indexAtual) && value.indexAtual > 0 ? value.indexAtual : 1,
        ultimoTimestampEnvio: Number.isFinite(value?.ultimoTimestampEnvio) && value.ultimoTimestampEnvio >= 0
            ? value.ultimoTimestampEnvio
            : 0
    });
    writeJsonData('stock-state.json', {
        ctz: normalize(state?.ctz ?? current.ctz),
        boosters: normalize(state?.boosters ?? current.boosters)
    });
}
