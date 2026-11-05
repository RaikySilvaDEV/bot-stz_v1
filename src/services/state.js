import fs from 'node:fs';
import { PATHS } from '../config/constants.js';
export function carregarTicketsNotificados() {
    try {
        if (fs.existsSync(PATHS.ticketsNotificados)) {
            return JSON.parse(fs.readFileSync(PATHS.ticketsNotificados, 'utf8'));
        }
    } catch (error) { console.error('[estado] Falha ao ler ou gravar estado:', error); }
    return [];
}

export function salvarTicketNotificado(canalId) {
    try {
        let lista = carregarTicketsNotificados();
        if (!lista.includes(canalId)) {
            lista.push(canalId);
            fs.writeFileSync(PATHS.ticketsNotificados, JSON.stringify(lista, null, 2), 'utf8');
        }
    } catch (error) { console.error('[estado] Falha ao ler ou gravar estado:', error); }
}

export function getSaudacaoDinamica() {
    const hora = new Date().getHours();
    if (hora >= 5 && hora < 12) return "☀️ **Bom dia!**";
    if (hora >= 12 && hora < 18) return "🌤️ **Boa tarde!**";
    return "🌙 **Boa noite!**";
}

export function carregarEstadoWallpaper() {
    try {
        if (fs.existsSync(PATHS.wallpaperState)) {
            const data = JSON.parse(fs.readFileSync(PATHS.wallpaperState, 'utf8'));
            return { diaAtual: data.diaAtual || 1 };
        }
    } catch (error) { console.error('[estado] Falha ao ler ou gravar estado:', error); }
    return { diaAtual: 1 };
}

export function salvarEstadoWallpaper(estado) {
    try {
        fs.writeFileSync(PATHS.wallpaperState, JSON.stringify(estado, null, 2), 'utf8');
    } catch (error) { console.error('[estado] Falha ao ler ou gravar estado:', error); }
}

export function carregarEstadoMods() {
    try {
        if (fs.existsSync(PATHS.modsState)) {
            const data = JSON.parse(fs.readFileSync(PATHS.modsState, 'utf8'));
            return {
                ctz: { indexAtual: data.ctz?.indexAtual || 1, ultimoTimestampEnvio: data.ctz?.ultimoTimestampEnvio || 0 },
                boosters: { indexAtual: data.boosters?.indexAtual || 1, ultimoTimestampEnvio: data.boosters?.ultimoTimestampEnvio || 0 }
            };
        }
    } catch (error) { console.error('[estado] Falha ao ler ou gravar estado:', error); }
    return { ctz: { indexAtual: 1, ultimoTimestampEnvio: 0 }, boosters: { indexAtual: 1, ultimoTimestampEnvio: 0 } };
}

export function salvarEstadoMods(estado) {
    try {
        fs.writeFileSync(PATHS.modsState, JSON.stringify(estado, null, 2), 'utf8');
    } catch (error) { console.error('[estado] Falha ao ler ou gravar estado:', error); }
}

// 🎫 Monitoramento de Tickets com IA e Suporte ao PrecisionFix
