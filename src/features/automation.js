import { AttachmentBuilder } from 'discord.js';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { client } from '../client.js';
import { PATHS, GUILD_ID } from '../config/constants.js';
import { getCommerceConfig, getCommerceProducts } from '../repositories/commerceRepository.js';
import { getProductPriceCents } from '../repositories/productCatalogRepository.js';
import { getSaudacaoDinamica } from '../services/greetings.js';
import {
    getStockState, getWallpaperState, saveStockState, saveWallpaperState
} from '../repositories/stateRepository.js';
import { getSettings } from '../repositories/settingsRepository.js';
import { getGuildAttachmentLimitBytes, getOversizedAttachments, BYTES_PER_MIB } from '../services/attachmentLimits.js';
import { getAutomationMessageIds, saveAutomationMessageId } from '../repositories/automationRepository.js';
import {
    getAnnouncementHoursCompleted, getWallpaperDateCompleted,
    markAnnouncementHoursCompleted, markWallpaperDateCompleted, clearWallpaperDateCompleted
} from '../repositories/automationScheduleRepository.js';
import { getWallpaperPath } from '../repositories/wallpaperRepository.js';
import { findExistingWarehousePost } from './warehousePosting.js';
import { acquireLocalProcessLock } from '../services/localProcessLock.js';
import {
    getScheduledAnnouncements, markScheduledAnnouncementSent, wasScheduledAnnouncementSent
} from '../repositories/scheduledAnnouncementsRepository.js';
import { getBotAnnouncements } from '../repositories/botAnnouncementsRepository.js';

function aplicarModeloAviso(modelo, valores) {
    return String(modelo).replace(/\{([a-z_]+)\}/gi, (token, chave) => Object.hasOwn(valores, chave) ? valores[chave] : token);
}

const ultimasMensagensLoop = new Map(Object.entries(getAutomationMessageIds()));
const ultimoAvisoAssetAusente = new Map();
const enviosArmazemEmAndamento = new Set();
const avisosProgramadosEmAndamento = new Set();
let ultimaTentativaWallpaper = { dateKey: '', at: 0 };

function formatarTamanho(bytes) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

async function dividirArquivo(arquivo, pastaTemporaria, nomeOriginal, tamanhoMaximoParte) {
    const tamanho = (await fsPromises.stat(arquivo)).size;
    const quantidade = Math.ceil(tamanho / tamanhoMaximoParte);
    const nomesPartes = [];
    let indiceParte = 0;
    let bytesNaParte = 0;
    let handle = null;

    try {
        for await (const bloco of fs.createReadStream(arquivo)) {
            let deslocamento = 0;
            while (deslocamento < bloco.length) {
                if (!handle) {
                    indiceParte += 1;
                    bytesNaParte = 0;
                    const nomeParte = `${nomeOriginal}.parte-${String(indiceParte).padStart(3, '0')}`;
                    nomesPartes.push(nomeParte);
                    handle = await fsPromises.open(path.join(pastaTemporaria, nomeParte), 'w');
                }
                const quantidadeEscrita = Math.min(tamanhoMaximoParte - bytesNaParte, bloco.length - deslocamento);
                let escrito = 0;
                while (escrito < quantidadeEscrita) {
                    const resultado = await handle.write(bloco, deslocamento + escrito, quantidadeEscrita - escrito);
                    escrito += resultado.bytesWritten;
                }
                deslocamento += quantidadeEscrita;
                bytesNaParte += quantidadeEscrita;
                if (bytesNaParte === tamanhoMaximoParte) {
                    await handle.close();
                    handle = null;
                }
            }
        }
    } finally {
        await handle?.close();
    }
    return { nomesPartes, quantidade, tamanho };
}

function instrucaoJuntarPartes(nomeOriginal, nomesPartes) {
    const partes = nomesPartes.map(nome => `"${nome}"`).join('+');
    return `No Windows, baixe todas as partes na mesma pasta e execute no CMD: \`copy /b ${partes} "${nomeOriginal}"\``;
}

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
    if (typeof canalId !== 'string' || !/^\d{17,20}$/.test(canalId)) {
        console.warn(`[avisos] O destino da mensagem "${chaveLoop}" não está configurado.`);
        return false;
    }
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

export function gerarPayloadsLoop(purchaseChannelId = null) {
    const settings = getSettings();
    const templates = getBotAnnouncements();
    const saudacao = getSaudacaoDinamica(new Date(), settings.timezone);
    const hora = getScheduleDateParts(new Date(), settings.timezone).hour;
    const greetingImage = path.join(PATHS.greetingImages, hora < 12 ? 'bom-dia.png' : hora < 18 ? 'boa-tarde.png' : 'boa-noite.png');
    const greetingFile = fs.existsSync(greetingImage) ? greetingImage : null;
    const greetingName = path.basename(greetingImage);
    const greetingEmbed = greetingFile ? { image: { url: `attachment://${greetingName}` } } : null;
    const allowedMentions = settings.everyoneMentions ? { parse: ['everyone'] } : { parse: [] };
    const greetingPayload = content => ({
        content, allowedMentions,
        ...(greetingFile ? { files: [new AttachmentBuilder(greetingFile, { name: greetingName })], embeds: [greetingEmbed] } : {})
    });
    const productLines = getCommerceProducts({ includeInactive: false }).map(product => {
        const priceCents = getProductPriceCents(product.value);
        const price = Number.isSafeInteger(priceCents)
            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(priceCents / 100)
            : 'preço em configuração';
        const roleIds = product.roleIds?.length ? product.roleIds : [product.roleId].filter(Boolean);
        const access = roleIds.length ? roleIds.map(roleId => `<@&${roleId}>`).join(' + ') : `cargo **${product.roleName || 'não configurado'}** (equipe: configure o cargo)`;
        return `• **${product.name}** — ${price}\n  🎟️ Acesso: ${access} · ${product.durationDays} dias`;
    }).join('\n');
    const productList = productLines || 'No momento, não há produtos ativos na loja.';
    const purchaseDestination = purchaseChannelId
        ? `🚀 **Adquira o PrecisionFix:**\n<#${purchaseChannelId}>`
        : '🚀 **Adquira o PrecisionFix:**\nAbra o carrinho pelo painel de compras do servidor.';
    const replacements = {
        saudacao, produtos: productList, canal_compra: purchaseDestination,
        canal_verificacao: `<#${settings.channels.verification}>`,
        canal_parcerias: settings.channels.partnerships ? `<#${settings.channels.partnerships}>` : 'o canal de parcerias do servidor'
    };
    return {
        payloadComprasOnline: greetingPayload(aplicarModeloAviso(templates.sales, replacements)),
        payloadParceria: greetingPayload(aplicarModeloAviso(templates.partnerships, replacements)),
        payloadVendasSuporte: greetingPayload(aplicarModeloAviso(templates.support, replacements)),
        payloadSugestao: greetingPayload(aplicarModeloAviso(templates.suggestions, replacements)),
        payloadNovidadesCargos: { content: aplicarModeloAviso(templates.roleNews, replacements), allowedMentions },
        payloadInfoPrecision: greetingPayload(aplicarModeloAviso(templates.precisionInfo, replacements))
    };
}

async function resolverCanalDeCompras(guild, settings) {
    const commerce = getCommerceConfig();
    const candidates = [...new Set([
        commerce.storeChannelId,
        settings.channels.purchasePanel,
        settings.channels.purchaseStatus
    ].filter(id => typeof id === 'string' && /^\d{17,20}$/.test(id)))];

    for (const id of candidates) {
        const channel = await guild.channels.fetch(id).catch(() => null);
        if (channel?.isTextBased()) return channel.id;
    }
    return null;
}

export async function dispararAvisosLoopHorario() {
    const settings = getSettings();
    if (!settings.automations.announcements) return false;
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
        console.error(`[avisos] Bot não está no servidor configurado (${GUILD_ID}).`);
        return false;
    }
    const purchaseChannelId = await resolverCanalDeCompras(guild, settings);
    const payloads = gerarPayloadsLoop(purchaseChannelId);
    const mensagens = [
        ['sales', settings.channels.purchaseStatus, payloads.payloadComprasOnline],
        ['partnerships', settings.channels.partnerships, payloads.payloadParceria],
        ['support', settings.channels.supportNotices, payloads.payloadVendasSuporte],
        ['suggestions', settings.channels.suggestions, payloads.payloadSugestao],
        ['roleNews', settings.channels.roleNews, payloads.payloadNovidadesCargos],
        ['precisionInfo', settings.channels.precisionInfo, payloads.payloadInfoPrecision]
    ];
    const destinationCounts = new Map();
    for (const [, channelId] of mensagens) {
        if (channelId) destinationCounts.set(channelId, (destinationCounts.get(channelId) ?? 0) + 1);
    }
    const results = [];
    for (const [key, channelId, payload] of mensagens) {
        if (channelId && destinationCounts.get(channelId) === 1 && !ultimasMensagensLoop.has(`announcement:${key}`)) {
            const legacyMessageId = ultimasMensagensLoop.get(channelId);
            if (legacyMessageId) ultimasMensagensLoop.set(`announcement:${key}`, legacyMessageId);
        }
        results.push(await enviarOuSubstituirMensagem(guild, channelId, payload, `announcement:${key}`));
    }
    return results.every(Boolean);
}

async function findExistingScheduledAnnouncement(canal, item, dateKey, time, timezone) {
    const messages = await canal.messages.fetch({ limit: 100 });
    return messages.find(message => {
        if (message.author?.id !== client.user.id || message.content !== item.content) return false;
        const parts = getScheduleDateParts(message.createdAt, timezone);
        return parts.dateKey === dateKey && `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}` === time;
    }) ?? null;
}

export async function dispararAvisosProgramados() {
    const settings = getSettings();
    if (!settings.automations.scheduledAnnouncements) return false;
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return false;
    const releaseGlobalLock = await acquireLocalProcessLock('scheduled-announcements-global');
    if (!releaseGlobalLock) return false;
    const now = getScheduleDateParts(new Date(), settings.timezone);
    const time = `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`;
    const due = getScheduledAnnouncements().filter(item => item.enabled && item.times.includes(time) && !wasScheduledAnnouncementSent(item.id, now.dateKey, time));
    try {
        for (const item of due) {
            if (avisosProgramadosEmAndamento.has(item.id)) continue;
            avisosProgramadosEmAndamento.add(item.id);
            try {
                if (wasScheduledAnnouncementSent(item.id, now.dateKey, time)) continue;
                const channel = await guild.channels.fetch(item.channelId).catch(() => null);
                if (!channel?.isTextBased()) {
                    console.warn(`[avisos-programados:${item.id}] Canal não encontrado; será tentado novamente no próximo ciclo.`);
                    continue;
                }
                const existing = await findExistingScheduledAnnouncement(channel, item, now.dateKey, time, settings.timezone);
                if (!existing) {
                    const embeds = item.imageUrl ? [{ title: item.title, image: { url: item.imageUrl } }] : [];
                    await channel.send({ content: item.content, allowedMentions: settings.everyoneMentions ? { parse: ['everyone'] } : { parse: [] }, embeds });
                }
                markScheduledAnnouncementSent(item.id, now.dateKey, time);
                console.info(`[avisos-programados:${item.id}] ${existing ? 'Publicação duplicada evitada' : 'Aviso publicado'} em #${channel.name} às ${time}.`);
            } catch (error) {
                console.error(`[avisos-programados:${item.id}] Falha ao publicar:`, error.message);
            } finally {
                avisosProgramadosEmAndamento.delete(item.id);
            }
        }
        return true;
    } finally {
        await releaseGlobalLock().catch(error => console.warn('[avisos-programados] Não consegui liberar o bloqueio local:', error.message));
    }
}

export function getScheduleDateParts(date, timeZone) {
    const values = new Intl.DateTimeFormat('en-US', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return { dateKey: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour), minute: Number(values.minute) };
}

function getPreviousScheduleDateKey(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const previous = new Date(Date.UTC(year, month - 1, day - 1));
    return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}-${String(previous.getUTCDate()).padStart(2, '0')}`;
}

function isScheduleTimeDue(scheduledHour, hour, minute) {
    return scheduledHour < hour || (scheduledHour === hour && minute >= 0);
}

async function recuperarAvisosPendentes(settings, dateKey, hour, minute) {
    if (!settings.automations.announcements) return false;
    const previousDate = getPreviousScheduleDateKey(dateKey);
    const completedYesterday = getAnnouncementHoursCompleted(previousDate);
    const missedYesterday = settings.announcementHours.some(scheduledHour => !completedYesterday.includes(scheduledHour));
    const completedToday = getAnnouncementHoursCompleted(dateKey);
    const dueToday = settings.announcementHours.filter(scheduledHour => isScheduleTimeDue(scheduledHour, hour, minute));
    const missedToday = dueToday.some(scheduledHour => !completedToday.includes(scheduledHour));
    if (!missedYesterday && !missedToday) return false;

    if (!await dispararAvisosLoopHorario()) return false;
    if (missedYesterday) markAnnouncementHoursCompleted(previousDate, settings.announcementHours);
    if (missedToday) {
        markAnnouncementHoursCompleted(dateKey, [...completedToday, ...dueToday]);
    }
    console.info(`[avisos] Recuperação concluída${missedYesterday ? ` (pendência de ${previousDate})` : ''}${missedToday ? ` (pendência de hoje: ${dueToday.join(', ')})` : ''}.`);
    return true;
}

export async function dispararWallpaperDiario() {
    const settings = getSettings();
    if (!settings.automations.wallpapers) return false;
    const { dateKey } = getScheduleDateParts(new Date(), settings.timezone);
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) { console.error('[wallpapers] Bot não está no servidor configurado.'); return false; }
    const canal = await guild.channels.fetch(settings.channels.wallpapers).catch(() => null);
    if (!canal?.isTextBased()) { console.error(`[wallpapers] Canal ${settings.channels.wallpapers} não encontrado.`); return false; }

    if (getWallpaperDateCompleted() === dateKey) {
        const recent = await canal.messages.fetch({ limit: 100 }).catch(() => null);
        if (!recent) return false;
        const alreadySentToday = recent.find(message => message.author.id === client.user.id &&
            message.attachments.some(attachment => /^wallpaper-dia-\d+\./i.test(attachment.name ?? '')) &&
            getScheduleDateParts(message.createdAt, settings.timezone).dateKey === dateKey);
        if (alreadySentToday) {
            const postedAttachment = alreadySentToday.attachments.find(attachment => /^wallpaper-dia-\d+\./i.test(attachment.name ?? ''));
            const postedDay = Number(postedAttachment?.name?.match(/^wallpaper-dia-(\d+)\./i)?.[1]);
            const currentDay = getWallpaperState().diaAtual;
            if (postedDay === currentDay) saveWallpaperState({ diaAtual: currentDay >= 105 ? 1 : currentDay + 1 });
            ultimaTentativaWallpaper = { dateKey, at: Date.now() };
            return true;
        }
        clearWallpaperDateCompleted(dateKey);
        console.warn('[wallpapers] O agendamento estava marcado como concluído, mas não encontrei publicação de hoje; vou tentar novamente.');
    }

    if (ultimaTentativaWallpaper.dateKey === dateKey && Date.now() - ultimaTentativaWallpaper.at < 5 * 60 * 1000) return false;
    ultimaTentativaWallpaper = { dateKey, at: Date.now() };
    const estado = getWallpaperState();
    const diaAtual = estado.diaAtual;
    const arquivoPath = getWallpaperPath(diaAtual);
    if (!arquivoPath) {
        console.warn(`[wallpapers] Imagem para o dia ${diaAtual}/105 ausente; envio permanece pendente, sem avançar a sequência. Nova tentativa em cinco minutos.`);
        return false;
    }

    try {
        const messageContent = aplicarModeloAviso(getBotAnnouncements().wallpaper, { dia: diaAtual });
        const recent = await canal.messages.fetch({ limit: 25 }).catch(() => null);
        const alreadyPosted = recent?.find(message => message.author.id === client.user.id &&
            (message.content === messageContent || message.attachments.some(attachment => attachment.name?.toLowerCase().startsWith(`wallpaper-dia-${diaAtual}.`))) &&
            getScheduleDateParts(message.createdAt, settings.timezone).dateKey === dateKey);
        if (alreadyPosted) {
            saveWallpaperState({ diaAtual: diaAtual >= 105 ? 1 : diaAtual + 1 });
            markWallpaperDateCompleted(dateKey);
            return true;
        }
        const attachment = new AttachmentBuilder(arquivoPath, { name: `wallpaper-dia-${diaAtual}${path.extname(arquivoPath)}` });
        await canal.send({ content: messageContent, files: [attachment] });
        saveWallpaperState({ diaAtual: diaAtual >= 105 ? 1 : diaAtual + 1 });
        markWallpaperDateCompleted(dateKey);
        return true;
    } catch (error) {
        console.error('[wallpapers] Falha ao enviar o wallpaper:', error);
        return false;
    }
}

async function findExistingWarehousePostForDate(canal, content, dateKey, timezone) {
    let before;
    for (let page = 0; page < 10; page += 1) {
        const messages = await canal.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        const existingPost = findExistingWarehousePost(messages.values(), {
            authorId: client.user.id,
            content,
            dateKey,
            getDateKey: date => getScheduleDateParts(date, timezone).dateKey
        });
        if (existingPost) return existingPost;
        if (messages.size < 100) return null;

        const oldestMessage = messages.reduce((oldest, message) =>
            message.createdTimestamp < oldest.createdTimestamp ? message : oldest
        );
        if (getScheduleDateParts(oldestMessage.createdAt, timezone).dateKey < dateKey) return null;
        before = oldestMessage.id;
    }
    throw new Error('Não encontrei o cabeçalho do item nas últimas 1000 mensagens; envio cancelado para evitar duplicação.');
}

export async function processarEnvioArmazemDiario(guild, nomeArmazem, pastaArmazem, estadoKey, forcarEnvio = false) {
    if (enviosArmazemEmAndamento.has(estadoKey)) return true;
    enviosArmazemEmAndamento.add(estadoKey);
    let releaseLock;
    try {
        releaseLock = await acquireLocalProcessLock(`warehouse-${estadoKey}`);
        if (!releaseLock) {
            console.info(`[armazém:${nomeArmazem}] Outro processo local já está cuidando do envio; pulando esta execução.`);
            return true;
        }
        const settings = getSettings();
        if (!settings.automations.stock) return false;
        const { dateKey } = getScheduleDateParts(new Date(), settings.timezone);
        const estadoMods = getStockState();
        const armazemEstado = estadoMods[estadoKey];
        const agoraMs = Date.now();
        if (!forcarEnvio && armazemEstado.ultimoTimestampEnvio > 0 &&
            getScheduleDateParts(new Date(armazemEstado.ultimoTimestampEnvio), settings.timezone).dateKey === dateKey) return true;

        const canalDestinoId = settings.channels[estadoKey === 'ctz' ? 'stockCtz' : 'stockBoosters'];
        const canal = await guild.channels.fetch(canalDestinoId).catch(() => null);
        if (!canal?.isTextBased()) {
            console.error(`[armazém:${nomeArmazem}] Canal ${canalDestinoId} não encontrado.`);
            return false;
        }
        fs.mkdirSync(pastaArmazem, { recursive: true });
        const item = armazemEstado.indexAtual;
        const titulo = nomeArmazem === 'ctz' ? 'Armazém CTZ' : 'Armazém CTZ Boosters';
        const messageContent = aplicarModeloAviso(getBotAnnouncements().warehouse, { armazem: titulo, item });
        const existingPost = await findExistingWarehousePostForDate(canal, messageContent, dateKey, settings.timezone);
        if (existingPost) {
            armazemEstado.indexAtual += 1;
            armazemEstado.ultimoTimestampEnvio = agoraMs;
            saveStockState(estadoMods);
            console.info(`[armazém:${nomeArmazem}] O item ${item} já foi publicado hoje; pulando reenvio.`);
            return true;
        }
        const nomes = fs.readdirSync(pastaArmazem)
            .filter(nome => new RegExp(`^${item}\\.`, 'i').test(nome))
            .filter(nome => fs.statSync(path.join(pastaArmazem, nome)).isFile());
        if (nomes.length === 0) {
            const ultimoAviso = ultimoAvisoAssetAusente.get(nomeArmazem) ?? 0;
            if (Date.now() - ultimoAviso >= 60 * 60 * 1000) {
                console.warn(`[armazém:${nomeArmazem}] Sem arquivos para o item ${item} em ${pastaArmazem}.`);
                ultimoAvisoAssetAusente.set(nomeArmazem, Date.now());
            }
            return false;
        }

        const arquivos = nomes.map(nome => {
            const filePath = path.join(pastaArmazem, nome);
            return { name: nome, path: filePath, size: fs.statSync(filePath).size };
        });
        const limiteUpload = getGuildAttachmentLimitBytes(guild.premiumTier);
        const tamanhoMaximoParte = Math.max(BYTES_PER_MIB, limiteUpload - BYTES_PER_MIB);
        const arquivosGrandes = getOversizedAttachments(arquivos, limiteUpload);
        await canal.send({
            content: messageContent,
            allowedMentions: settings.everyoneMentions ? { parse: ['everyone'] } : { parse: [] }
        });
        for (const arquivo of arquivos) {
            if (arquivo.size <= tamanhoMaximoParte) {
                await canal.send({ files: [new AttachmentBuilder(arquivo.path, { name: arquivo.name })] });
                continue;
            }

            const pastaTemporaria = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'botstz-armazem-'));
            try {
                const { nomesPartes, quantidade, tamanho } = await dividirArquivo(arquivo.path, pastaTemporaria, arquivo.name, tamanhoMaximoParte);
                const comando = instrucaoJuntarPartes(arquivo.name, nomesPartes);
                const motivo = arquivosGrandes.some(grande => grande.name === arquivo.name)
                    ? `excede o limite atual de ${formatarTamanho(limiteUpload)}`
                    : `foi dividido para ficar abaixo do limite de ${formatarTamanho(limiteUpload)}`;
                await canal.send(`📦 **${arquivo.name}** (${formatarTamanho(tamanho)}) ${motivo}. Enviei ${quantidade} partes, uma por mensagem.
${comando}`);
                for (const nomeParte of nomesPartes) {
                    await canal.send({ files: [new AttachmentBuilder(path.join(pastaTemporaria, nomeParte), { name: nomeParte })] });
                }
            } finally {
                await fsPromises.rm(pastaTemporaria, { recursive: true, force: true });
            }
        }
        armazemEstado.indexAtual += 1;
        armazemEstado.ultimoTimestampEnvio = agoraMs;
        saveStockState(estadoMods);
        return true;
    } catch (error) {
        console.error(`[armazém:${nomeArmazem}] Falha ao enviar item:`, error);
        return false;
    } finally {
        enviosArmazemEmAndamento.delete(estadoKey);
        await releaseLock?.().catch(error => console.warn(`[armazém:${nomeArmazem}] Não consegui liberar o bloqueio local:`, error.message));
    }
}

export async function dispararArmazensDiarios(forcarEnvio = false) {
    if (!getSettings().automations.stock) return false;
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
        console.error('[armazéns] Bot não está no servidor configurado.');
        return false;
    }
    const ctz = await processarEnvioArmazemDiario(guild, 'ctz', PATHS.ctz, 'ctz', forcarEnvio);
    const boosters = await processarEnvioArmazemDiario(guild, 'boosters', PATHS.boosters, 'boosters', forcarEnvio);
    return ctz && boosters;
}

export function iniciarAgendadorRelogio() {
    let ultimaTentativaEstoqueEm = 0;
    let dataUltimaTentativaEstoque = '';
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
        const previousDate = getPreviousScheduleDateKey(dateKey);
        if (settings.automations.announcements) {
            const completedYesterday = getAnnouncementHoursCompleted(previousDate);
            const missedYesterday = settings.announcementHours.some(scheduledHour => !completedYesterday.includes(scheduledHour));
            const completedToday = getAnnouncementHoursCompleted(dateKey);
            const dueToday = settings.announcementHours.filter(scheduledHour => isScheduleTimeDue(scheduledHour, hora, minuto));
            const missedToday = dueToday.some(scheduledHour => !completedToday.includes(scheduledHour));
            if (missedYesterday || missedToday) {
                executarAgendado('avisos', () => recuperarAvisosPendentes(settings, dateKey, hora, minuto));
            }
        }
        if (settings.automations.scheduledAnnouncements) executarAgendado('avisos-programados', dispararAvisosProgramados);
        if (settings.automations.wallpapers) {
            const wallpaperDate = getWallpaperDateCompleted();
            const wallpaperWasMissedYesterday = wallpaperDate && wallpaperDate < dateKey;
            const wallpaperDueToday = hora > 12 || (hora === 12 && minuto >= 0);
            const wallpaperRetryDue = ultimaTentativaWallpaper.dateKey !== dateKey || Date.now() - ultimaTentativaWallpaper.at >= 5 * 60 * 1000;
            if ((wallpaperWasMissedYesterday || wallpaperDueToday) && wallpaperRetryDue) {
                executarAgendado('wallpapers', dispararWallpaperDiario);
            }
        }
        const stockDue = hora > 12 || (hora === 12 && minuto >= 30);
        const stockState = getStockState();
        const stockMissedYesterday = [stockState.ctz, stockState.boosters].some(state =>
            state.ultimoTimestampEnvio > 0 && getScheduleDateParts(new Date(state.ultimoTimestampEnvio), settings.timezone).dateKey < dateKey
        );
        const retryStock = dataUltimaTentativaEstoque !== dateKey || Date.now() - ultimaTentativaEstoqueEm >= 5 * 60 * 1000;
        if (settings.automations.stock && (stockDue || stockMissedYesterday) && retryStock) {
            dataUltimaTentativaEstoque = dateKey;
            ultimaTentativaEstoqueEm = Date.now();
            executarAgendado('estoque-diario', async () => {
                if (!await dispararArmazensDiarios(false)) {
                    console.warn('[armazéns] Um ou mais envios diários falharam; nova tentativa em cinco minutos.');
                }
            });
        }
      } catch (error) {
        console.error('[agendador] Falha ao verificar tarefas; nova tentativa no próximo ciclo:', error);
      }
    }, 15 * 1000);
}

export async function verificarEnviosPendentesAoLigar() {
    const settings = getSettings();
    const { dateKey, hour, minute } = getScheduleDateParts(new Date(), settings.timezone);
    await recuperarAvisosPendentes(settings, dateKey, hour, minute);
    const wallpaperDate = getWallpaperDateCompleted();
    if (settings.automations.wallpapers &&
        (hour > 12 || (hour === 12 && minute >= 0) || Boolean(wallpaperDate && wallpaperDate < dateKey))) {
        await dispararWallpaperDiario();
    }
    const stockDue = hour > 12 || (hour === 12 && minute >= 30);
    const stockState = getStockState();
    const stockMissedYesterday = [stockState.ctz, stockState.boosters].some(state =>
        state.ultimoTimestampEnvio > 0 && getScheduleDateParts(new Date(state.ultimoTimestampEnvio), settings.timezone).dateKey < dateKey
    );
    if (settings.automations.stock && (stockDue || stockMissedYesterday)) await dispararArmazensDiarios(false);
}
