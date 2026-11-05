import {
    addNotifiedTicketId, getNotifiedTicketIds, getStockState, getWallpaperState,
    saveStockState, saveWallpaperState
} from '../repositories/stateRepository.js';
import { getSaudacaoDinamica } from './greetings.js';

// Compatibilidade com os módulos antigos que importavam o serviço de estado diretamente.
export const carregarTicketsNotificados = getNotifiedTicketIds;
export const salvarTicketNotificado = addNotifiedTicketId;
export const carregarEstadoWallpaper = getWallpaperState;
export const salvarEstadoWallpaper = saveWallpaperState;
export const carregarEstadoMods = getStockState;
export const salvarEstadoMods = saveStockState;
export { getSaudacaoDinamica };
