import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE = 'automation-schedule.json';

function readState() {
    const value = readJsonData(FILE, {});
    const announcements = value?.announcements && typeof value.announcements === 'object' && !Array.isArray(value.announcements)
        ? value.announcements : {};
    return {
        announcements,
        wallpaperDate: typeof value?.wallpaperDate === 'string' ? value.wallpaperDate : null
    };
}

export function getAnnouncementHoursCompleted(dateKey) {
    const hours = readState().announcements[dateKey];
    return Array.isArray(hours) ? hours.filter(hour => Number.isInteger(hour) && hour >= 0 && hour <= 23) : [];
}

export function markAnnouncementHoursCompleted(dateKey, hours) {
    const state = readState();
    state.announcements[dateKey] = [...new Set(hours.filter(hour => Number.isInteger(hour) && hour >= 0 && hour <= 23))].sort((a, b) => a - b);
    const dates = Object.keys(state.announcements).sort();
    for (const oldDate of dates.slice(0, -30)) delete state.announcements[oldDate];
    writeJsonData(FILE, state);
}

export function getWallpaperDateCompleted() {
    return readState().wallpaperDate;
}

export function markWallpaperDateCompleted(dateKey) {
    const state = readState();
    state.wallpaperDate = dateKey;
    writeJsonData(FILE, state);
}
