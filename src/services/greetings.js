import { getSettings } from '../repositories/settingsRepository.js';

export function getSaudacaoDinamica(date = new Date(), timeZone = getSettings().timezone) {
    const hora = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(date));
    if (hora >= 5 && hora < 12) return '☀️ **Bom dia!**';
    if (hora >= 12 && hora < 18) return '🌤️ **Boa tarde!**';
    return '🌙 **Boa noite!**';
}
