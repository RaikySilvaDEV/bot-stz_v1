import { AttachmentBuilder } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { client } from '../client.js';
import { PATHS, GUILD_ID } from '../config/constants.js';
import { PRODUCTS } from '../config/products.js';
import { getSaudacaoDinamica } from '../services/greetings.js';
import {
    getStockState, getWallpaperState, saveStockState, saveWallpaperState
} from '../repositories/stateRepository.js';
import { getSettings } from '../repositories/settingsRepository.js';
import { getAutomationMessageIds, saveAutomationMessageId } from '../repositories/automationRepository.js';
import {
    getAnnouncementHoursCompleted, getWallpaperDateCompleted,
    markAnnouncementHoursCompleted, markWallpaperDateCompleted
} from '../repositories/automationScheduleRepository.js';

const ultimasMensagensLoop = new Map(Object.entries(getAutomationMessageIds()));
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
        return false;
    }

    const idAnterior = ultimasMensagensLoop.get(chaveLoop);
    const mensagem = idAnterior ? await canal.messages.fetch(idAnterior).catch(() => null) : null;

    try {
        const atualizada = mensagem ? await mensagem.edit(payload) : await canal.send(payload);
        ultimasMensagensLoop.set(chaveLoop, atualizada.id);
        saveAutomationMessageId(chaveLoop, atualizada.id);
        return true;
    } catch (error) {
        console.error(`[avisos] Falha ao publicar no canal ${canalId}:`, error);
        return false;
    }
}

export function gerarPayloadsLoop() {
    const saudacao = getSaudacaoDinamica();
    const settings = getSettings();
    const allowedMentions = settings.everyoneMentions ? { parse: ['everyone'] } : { parse: [] };
    const productLines = PRODUCTS.map((product, index) => `• **PRODUTO ${index + 1}:** <#${product.channelId}>`).join('\n');
    return {
        payloadComprasOnline: { content: `${saudacao}\n\n🛒 **COMPRAS ONLINE DISPONÍVEIS:**\n${productLines}\n\n@everyone`, allowedMentions },
        payloadVendasSuporte: { content: `${saudacao}\n\n💬 **ATENDIMENTO E SUPORTE • COMMUNITY FOR FIVEM**\n\n⏰ **Horário de suporte humano:** das **09:00** às **21:00**.\n\n@everyone`, allowedMentions },
        payloadSugestao: { content: `${saudacao}\n\n💡 **CANAL DE SUGESTÕES & IDEIAS**\nDeixe aqui suas ideias!\n\n@everyone`, allowedMentions },
        payloadNovidadesCargos: { content: `# ✨ NOVIDADES NA COMMUNITY FOR FIVEM! ✨\nAtualizamos nossos cargos e vantagens!\n\n@everyone`, allowedMentions },
        payloadInfoPrecision: { content: `${saudacao}\n\n⚡ **BOT ONLINE • INFORMAÇÕES SOBRE O PRECISIONFIX**\n\nO bot está online.\n\n🔹 **Faça sua verificação:**\n<#${settings.channels.verification}>\n\n🚀 **Adquira o PrecisionFix:**\n<#${PRODUCTS[0].channelId}>\n\n> ⚠️ O acesso do PrecisionFix dura **5 dias**.\n\n@everyone`, allowedMentions }
    };
}

export async function dispararAvisosLoopHorario() {
    const settings = getSettings();
    if (!settings.automations.announcements) return false;
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
        console.error(`[avisos] Bot não está no servidor configurado (${GUILD_ID}).`);
        return false;
    }
    const payloads = gerarPayloadsLoop();
    const mensagens = [
        [settings.channels.purchaseStatus, payloads.payloadComprasOnline],
        [settings.channels.supportNotices, payloads.payloadVendasSuporte],
        [settings.channels.suggestions, payloads.payloadSugestao],
        [settings.channels.roleNews, payloads.payloadNovidadesCargos],
        [settings.channels.precisionInfo, payloads.payloadInfoPrecision]
    ];
    const results = await Promise.all(mensagens.map(([id, payload]) => enviarOuSubstituirMensagem(guild, id, payload, id)));
    return results.every(Boolean);
}

export function getScheduleDateParts(date, timeZone) {
    const values = new Intl.DateTimeFormat('en-US', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return { dateKey: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour), minute: Number(values.minute) };
}

export async function dispararWallpaperDiario() {
    const settings = getSettings();
    if (!settings.automations.wallpapers) return false;
    const { dateKey } = getScheduleDateParts(new Date(), settings.timezone);
    if (getWallpaperDateCompleted() === dateKey) return true;
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) { console.error('[wallpapers] Bot não está no servidor configurado.'); return false; }
    const estado = getWallpaperState();
    const diaAtual = estado.diaAtual;
    const arquivoPath = path.join(PATHS.wallpapers, `${diaAtual}.png`);
    if (!fs.existsSync(arquivoPath)) {
        console.warn(`[wallpapers] Arquivo ausente: ${arquivoPath}. O dia não foi avançado.`);
        return false;
    }

    const canal = await guild.channels.fetch(settings.channels.wallpapers).catch(() => null);
    if (!canal?.isTextBased()) { console.error(`[wallpapers] Canal ${settings.channels.wallpapers} não encontrado.`); return false; }
    try {
        const messageContent = `🖼️ **Wallpaper do Dia • Dia ${diaAtual}/105**`;
        const recent = await canal.messages.fetch({ limit: 25 }).catch(() => null);
        const alreadyPosted = recent?.find(message => message.author.id === client.user.id && message.content === messageContent);
        if (alreadyPosted) {
            saveWallpaperState({ diaAtual: diaAtual >= 105 ? 1 : diaAtual + 1 });
            markWallpaperDateCompleted(dateKey);
            return true;
        }
        const attachment = new AttachmentBuilder(arquivoPath, { name: `wallpaper-dia-${diaAtual}.png` });
        await canal.send({ content: messageContent, files: [attachment] });
        saveWallpaperState({ diaAtual: diaAtual >= 105 ? 1 : diaAtual + 1 });
        markWallpaperDateCompleted(dateKey);
        return true;
    } catch (error) {
        console.error('[wallpapers] Falha ao enviar o wallpaper:', error);
        return false;
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
    const tarefasEmAndamento = new Set();
    const executarAgendado = (nome, tarefa) => {
        if (tarefasEmAndamento.has(nome)) return;
        tarefasEmAndamento.add(nome);
        Promise.resolve().then(tarefa)
            .catch(error => console.error(`[agendador:${nome}] Falha nesta execução; o agendador continuará:`, error))
            .finally(() => tarefasEmAndamento.delete(nome));
    };
    setInterval(() => {
      try {
        const settings = getSettings();
        const { dateKey, hour: hora, minute: minuto } = getScheduleDateParts(new Date(), settings.timezone);
        const dataHora = `${dateKey}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
        if (dataHora !== ultimoAvisoAgendado && minuto === 0 && settings.automations.announcements && settings.announcementHours.includes(hora) && !getAnnouncementHoursCompleted(dateKey).includes(hora)) {
            ultimoAvisoAgendado = dataHora;
            executarAgendado('avisos', async () => {
                if (await dispararAvisosLoopHorario()) markAnnouncementHoursCompleted(dateKey, [...getAnnouncementHoursCompleted(dateKey), hora]);
            });
        }
        if (dataHora !== ultimoWallpaper && minuto === 0 && hora === 12 && settings.automations.wallpapers && getWallpaperDateCompleted() !== dateKey) {
            ultimoWallpaper = dataHora;
            executarAgendado('wallpapers', dispararWallpaperDiario);
        }
        const stockKey = `${dateKey}T${String(hora).padStart(2, '0')}:${String(Math.floor(minuto / 5) * 5).padStart(2, '0')}`;
        if (settings.automations.stock && minuto % 5 === 0 && stockKey !== ultimaVerificacaoEstoque) {
            ultimaVerificacaoEstoque = stockKey;
            executarAgendado('estoque', () => dispararTodosArmazensCincoHoras(false));
        }
      } catch (error) {
        console.error('[agendador] Falha ao verificar tarefas; nova tentativa no próximo ciclo:', error);
      }
    }, 15 * 1000);
}

export async function verificarEnviosPendentesAoLigar() {
    const settings = getSettings();
    const { dateKey, hour, minute } = getScheduleDateParts(new Date(), settings.timezone);
    if (settings.automations.announcements) {
        const dueHours = settings.announcementHours.filter(scheduledHour => scheduledHour < hour || (scheduledHour === hour && minute > 0));
        const completed = getAnnouncementHoursCompleted(dateKey);
        const missing = dueHours.filter(scheduledHour => !completed.includes(scheduledHour));
        if (missing.length && await dispararAvisosLoopHorario()) markAnnouncementHoursCompleted(dateKey, [...completed, ...missing]);
    }
    if (settings.automations.wallpapers && hour >= 12 && getWallpaperDateCompleted() !== dateKey) await dispararWallpaperDiario();
    const estado = getStockState();
    const limite = 5 * 60 * 60 * 1000;
    const agora = Date.now();
    const ctzPendente = estado.ctz.ultimoTimestampEnvio === 0 || agora - estado.ctz.ultimoTimestampEnvio >= limite;
    const boostersPendente = estado.boosters.ultimoTimestampEnvio === 0 || agora - estado.boosters.ultimoTimestampEnvio >= limite;
    if (ctzPendente || boostersPendente) await dispararTodosArmazensCincoHoras(false);
}
