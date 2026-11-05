import { AttachmentBuilder } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { client } from '../client.js';
import { PATHS, GUILD_ID } from '../config/constants.js';
import { getSaudacaoDinamica } from '../services/greetings.js';
import {
    getStockState, getWallpaperState, saveStockState, saveWallpaperState
} from '../repositories/stateRepository.js';
import { getSettings } from '../repositories/settingsRepository.js';
import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const __dirname = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOOP_MESSAGES_FILE = 'automation-message-ids.json';
const ultimasMensagensLoop = new Map(Object.entries(readJsonData(LOOP_MESSAGES_FILE, {})));
const ultimoAvisoAssetAusente = new Map();

export async function removerAnuncioParceriaAntigo() {
    const canal = await client.channels.fetch(getSettings().channels.partnerships).catch(() => null);
    if (!canal?.isTextBased()) return;
    const mensagens = await canal.messages.fetch({ limit: 50 }).catch(error => {
        console.warn('[parceria] Não foi possível localizar o anúncio antigo:', error);
        return null;
    });
    const anunciosAntigos = mensagens?.filter(mensagem => mensagem.author.id === client.user.id &&
        /wellkeysoficial\.com\.br|JOGOS STEAM QUASE DE GRAÇA/i.test(mensagem.content));
    for (const anuncio of anunciosAntigos?.values() ?? []) {
        await anuncio.delete().catch(error => console.warn('[parceria] Não foi possível remover o anúncio antigo:', error));
    }
}

export async function enviarOuSubstituirMensagem(guild, canalId, payload, chaveLoop) {
    const canal = await guild.channels.fetch(canalId).catch(() => null);
    if (!canal?.isTextBased()) {
        console.warn(`[avisos] Canal ${canalId} não encontrado ou não é textual.`);
        return;
    }

    const idAnterior = ultimasMensagensLoop.get(chaveLoop);
    let mensagem = idAnterior ? await canal.messages.fetch(idAnterior).catch(() => null) : null;
    if (!mensagem) {
        const recentes = await canal.messages.fetch({ limit: 50 }).catch(error => {
            console.warn(`[avisos] Não foi possível ler mensagens antigas do canal ${canalId}:`, error);
            return null;
        });
        mensagem = recentes?.find(item => item.author.id === client.user.id) ?? null;
    }

    try {
        const atualizada = mensagem ? await mensagem.edit(payload) : await canal.send(payload);
        ultimasMensagensLoop.set(chaveLoop, atualizada.id);
        writeJsonData(LOOP_MESSAGES_FILE, Object.fromEntries(ultimasMensagensLoop));
    } catch (error) {
        console.error(`[avisos] Falha ao publicar no canal ${canalId}:`, error);
    }
}

export function gerarPayloadsLoop() {
    const saudacao = getSaudacaoDinamica();
    const allowedMentions = getSettings().everyoneMentions ? { parse: ['everyone'] } : { parse: [] };
    return {
        payloadComprasOnline: { content: `${saudacao}\n\n🛒 **COMPRAS ONLINE DISPONÍVEIS:**\n• **PRODUTO 1:** https://discord.com/channels/${GUILD_ID}/1552131842960916521\n• **PRODUTO 2:** https://discord.com/channels/${GUILD_ID}/1552131921801256961\n• **PRODUTO 3:** https://discord.com/channels/${GUILD_ID}/1552727902930346167\n\n@everyone`, allowedMentions },
        payloadVendasSuporte: { content: `${saudacao}\n\n💬 **ATENDIMENTO E SUPORTE • COMMUNITY FOR FIVEM**\n\n⏰ **Horário de suporte humano:** das **09:00** às **21:00**.\n\n@everyone`, allowedMentions },
        payloadSugestao: { content: `${saudacao}\n\n💡 **CANAL DE SUGESTÕES & IDEIAS**\nDeixe aqui suas ideias!\n\n@everyone`, allowedMentions },
        payloadNovidadesCargos: { content: `# ✨ NOVIDADES NA COMMUNITY FOR FIVEM! ✨\nAtualizamos nossos cargos e vantagens!\n\n@everyone`, allowedMentions },
        payloadInfoPrecision: { content: `${saudacao}\n\n⚡ **BOT ONLINE • INFORMAÇÕES SOBRE O PRECISIONFIX**\n\nO bot está online.\n\n🔹 **Faça sua verificação:**\nhttps://discord.com/channels/${GUILD_ID}/1547204424244658216\n\n🚀 **Adquira o PrecisionFix:**\nhttps://discord.com/channels/${GUILD_ID}/1552131842960916521\n\n> ⚠️ O acesso do PrecisionFix dura **5 dias**.\n\n@everyone`, allowedMentions }
    };
}

export async function dispararAvisosLoopHorario() {
    const settings = getSettings();
    if (!settings.automations.announcements) return;
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
        console.error(`[avisos] Bot não está no servidor configurado (${GUILD_ID}).`);
        return;
    }
    const payloads = gerarPayloadsLoop();
    const mensagens = [
        [settings.channels.purchaseStatus, payloads.payloadComprasOnline],
        [settings.channels.supportNotices, payloads.payloadVendasSuporte],
        [settings.channels.suggestions, payloads.payloadSugestao],
        [settings.channels.roleNews, payloads.payloadNovidadesCargos],
        [settings.channels.precisionInfo, payloads.payloadInfoPrecision]
    ];
    await Promise.all(mensagens.map(([id, payload]) => enviarOuSubstituirMensagem(guild, id, payload, id)));
}

export async function dispararWallpaperDiario() {
    const settings = getSettings();
    if (!settings.automations.wallpapers) return;
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return console.error('[wallpapers] Bot não está no servidor configurado.');
    const estado = getWallpaperState();
    const diaAtual = estado.diaAtual;
    const arquivoPath = path.join(__dirname, 'Wallpapers', `${diaAtual}.png`);
    if (!fs.existsSync(arquivoPath)) {
        console.warn(`[wallpapers] Arquivo ausente: ${arquivoPath}. O dia não foi avançado.`);
        return;
    }

    const canal = await guild.channels.fetch(settings.channels.wallpapers).catch(() => null);
    if (!canal?.isTextBased()) return console.error(`[wallpapers] Canal ${settings.channels.wallpapers} não encontrado.`);
    try {
        const attachment = new AttachmentBuilder(arquivoPath, { name: `wallpaper-dia-${diaAtual}.png` });
        await canal.send({ content: `🖼️ **Wallpaper do Dia • Dia ${diaAtual}/105**`, files: [attachment] });
        saveWallpaperState({ diaAtual: diaAtual >= 105 ? 1 : diaAtual + 1 });
    } catch (error) {
        console.error('[wallpapers] Falha ao enviar o wallpaper:', error);
    }
}

export async function processarEnvioArmazemCincoHoras(guild, nomeArmazem, pastaArmazem, canalDestinoId, estadoKey, forcarEnvio = false) {
    try {
        const settings = getSettings();
        if (!settings.automations.stock) return;
        canalDestinoId = settings.channels[estadoKey === 'ctz' ? 'stockCtz' : 'stockBoosters'];
        const estadoMods = getStockState();
        const armazemEstado = estadoMods[estadoKey];
        const agoraMs = Date.now();
        const cincoHorasMs = 5 * 60 * 60 * 1000;
        if (!forcarEnvio && armazemEstado.ultimoTimestampEnvio > 0 && agoraMs - armazemEstado.ultimoTimestampEnvio < cincoHorasMs) return;

        const canal = await guild.channels.fetch(canalDestinoId).catch(() => null);
        if (!canal?.isTextBased()) return console.error(`[armazém:${nomeArmazem}] Canal ${canalDestinoId} não encontrado.`);
        fs.mkdirSync(pastaArmazem, { recursive: true });
        const item = armazemEstado.indexAtual;
        const nomes = fs.readdirSync(pastaArmazem)
            .filter(nome => new RegExp(`^${item}\\.`, 'i').test(nome))
            .filter(nome => fs.statSync(path.join(pastaArmazem, nome)).isFile());
        if (nomes.length === 0) {
            const ultimoAviso = ultimoAvisoAssetAusente.get(nomeArmazem) ?? 0;
            if (Date.now() - ultimoAviso >= 60 * 60 * 1000) {
                console.warn(`[armazém:${nomeArmazem}] Sem arquivos para o item ${item} em ${pastaArmazem}.`);
                ultimoAvisoAssetAusente.set(nomeArmazem, Date.now());
            }
            return;
        }

        const titulo = nomeArmazem === 'ctz' ? 'Armazém CTZ' : 'Armazém CTZ Boosters';
        const anexos = nomes.map(nome => new AttachmentBuilder(path.join(pastaArmazem, nome), { name: nome }));
        for (let inicio = 0; inicio < anexos.length; inicio += 10) {
            const primeiraMensagem = inicio === 0;
            await canal.send({
                content: primeiraMensagem ? `📦 **[${titulo}] • Item #${item}**\n\n@everyone` : undefined,
                allowedMentions: settings.everyoneMentions ? { parse: ['everyone'] } : { parse: [] },
                files: anexos.slice(inicio, inicio + 10)
            });
        }
        armazemEstado.indexAtual += 1;
        armazemEstado.ultimoTimestampEnvio = agoraMs;
        saveStockState(estadoMods);
    } catch (error) {
        console.error(`[armazém:${nomeArmazem}] Falha ao enviar item:`, error);
    }
}

export async function dispararTodosArmazensCincoHoras(forcarEnvio = false) {
    if (!getSettings().automations.stock) return;
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return console.error('[armazéns] Bot não está no servidor configurado.');
    await processarEnvioArmazemCincoHoras(guild, 'ctz', PATHS.ctz, null, 'ctz', forcarEnvio);
    await processarEnvioArmazemCincoHoras(guild, 'boosters', PATHS.boosters, null, 'boosters', forcarEnvio);
}

export function iniciarAgendadorRelogio() {
    let ultimoAvisoAgendado = '';
    let ultimoWallpaper = '';
    let ultimaVerificacaoEstoque = '';
    setInterval(() => {
        const settings = getSettings();
        const partes = new Intl.DateTimeFormat('en-US', {
            timeZone: settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).formatToParts(new Date()).reduce((resultado, parte) => ({ ...resultado, [parte.type]: parte.value }), {});
        const hora = Number(partes.hour);
        const minuto = Number(partes.minute);
        const dataHora = `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
        if (dataHora !== ultimoAvisoAgendado && minuto === 0 && settings.automations.announcements && settings.announcementHours.includes(hora)) {
            ultimoAvisoAgendado = dataHora;
            void dispararAvisosLoopHorario();
        }
        if (dataHora !== ultimoWallpaper && minuto === 0 && hora === 12 && settings.automations.wallpapers) {
            ultimoWallpaper = dataHora;
            void dispararWallpaperDiario();
        }
        const stockKey = `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${String(Math.floor(minuto / 5) * 5).padStart(2, '0')}`;
        if (settings.automations.stock && minuto % 5 === 0 && stockKey !== ultimaVerificacaoEstoque) {
            ultimaVerificacaoEstoque = stockKey;
            void dispararTodosArmazensCincoHoras(false);
        }
    }, 15 * 1000);
}

export async function verificarEnviosPendentesAoLigar() {
    const estado = getStockState();
    const limite = 5 * 60 * 60 * 1000;
    const agora = Date.now();
    const ctzPendente = estado.ctz.ultimoTimestampEnvio === 0 || agora - estado.ctz.ultimoTimestampEnvio >= limite;
    const boostersPendente = estado.boosters.ultimoTimestampEnvio === 0 || agora - estado.boosters.ultimoTimestampEnvio >= limite;
    if (ctzPendente || boostersPendente) await dispararTodosArmazensCincoHoras(false);
}
