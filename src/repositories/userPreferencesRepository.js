import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE = 'user-preferences.json';
const LANGUAGES = new Set(['pt-BR', 'en-US', 'es']);

function readPreferences() {
    const value = readJsonData(FILE, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function getUserLanguage(userId) {
    const language = readPreferences()[userId];
    return LANGUAGES.has(language) ? language : 'pt-BR';
}

export function setUserLanguage(userId, language) {
    if (!/^\d{17,20}$/.test(String(userId)) || !LANGUAGES.has(language)) throw new TypeError('Usuário ou idioma inválido.');
    const preferences = readPreferences();
    preferences[userId] = language;
    writeJsonData(FILE, preferences);
    return language;
}

export function isSupportedUserLanguage(language) {
    return LANGUAGES.has(language);
}
