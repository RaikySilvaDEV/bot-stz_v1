import { AttachmentBuilder } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { client } from '../client.js';
import {
    PATHS, GUILD_ID, CANAL_COMPRAS_ONLINE_STATUS, CANAL_PARCERIA_PUBLICA,
    CANAL_AVISOS_VENDAS_PUBLICA, CANAL_SUGESTAO_ID, CANAL_ANUNCIO_FIVE_M_ID,
    CANAL_NOVIDADES_CARGOS_ID, CANAL_INFO_PRECISION_ID, CANAL_WALLPAPERS_ID,
    CANAL_POST_CTZ, CANAL_POST_BOOSTERS
} from '../config/constants.js';
import {
    carregarEstadoWallpaper, salvarEstadoWallpaper, carregarEstadoMods,
    salvarEstadoMods, getSaudacaoDinamica
} from '../services/state.js';

const __dirname = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ultimasMensagensLoop = new Map();
const ultimoAvisoAssetAusente = new Map();

export async function removerAnuncioParceriaAntigo() {
    const canal = await client.channels.fetch(CANAL_PARCERIA_PUBLICA).catch(() => null);
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
    } catch (error) {
        console.error(`[avisos] Falha ao publicar no canal ${canalId}:`, error);
    }
}

export function gerarPayloadsLoop() {
    const saudacao = getSaudacaoDinamica();
    return {
        payloadComprasOnline: { content: `${saudacao}\n\n🛒 **COMPRAS ONLINE DISPONÍVEIS:**\n• **PRODUTO 1:** https://discord.com/channels/${GUILD_ID}/1552131842960916521\n• **PRODUTO 2:** https://discord.com/channels/${GUILD_ID}/1552131921801256961\n• **PRODUTO 3:** https://discord.com/channels/${GUILD_ID}/1552727902930346167\n\n@everyone` },
        payloadVendasSuporte: { content: `${saudacao}\n\n💬 **ATENDIMENTO E SUPORTE • COMMUNITY FOR FIVEM**\n\n⏰ **Horário de suporte humano:** das **09:00** às **21:00**.\n\n@everyone` },
        payloadSugestao: { content: `${saudacao}\n\n💡 **CANAL DE SUGESTÕES & IDEIAS**\nDeixe aqui suas ideias!\n\n@everyone` },
        payloadAnuncioFiveM: { content: `# 🚨 ENTRE AGORA NO DISCORD DA COMMUNITY FOR FIVEM!\n\nConvite: https://discord.gg/PX5YFryEPA\n\n@everyone` },
        payloadNovidadesCargos: { content: `# ✨ NOVIDADES NA COMMUNITY FOR FIVEM! ✨\nAtualizamos nossos cargos e vantagens!\n\n@everyone` },
        payloadInfoPrecision: { content: `${saudacao}\n\n⚡ **BOT ONLINE • INFORMAÇÕES SOBRE O PRECISIONFIX**\n\nO bot está online.\n\n🔹 **Faça sua verificação:**\nhttps://discord.com/channels/${GUILD_ID}/1547204424244658216\n\n🚀 **Adquira o PrecisionFix:**\nhttps://discord.com/channels/${GUILD_ID}/1552131842960916521\n\n> ⚠️ O acesso do PrecisionFix dura **5 dias**.\n\n@everyone` }
    };
}

export async function dispararAvisosLoopHorario() {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
        console.error(`[avisos] Bot não está no servidor configurado (${GUILD_ID}).`);
        return;
    }
    const payloads = gerarPayloadsLoop();
    const mensagens = [
        [CANAL_COMPRAS_ONLINE_STATUS, payloads.payloadComprasOnline],
        [CANAL_AVISOS_VENDAS_PUBLICA, payloads.payloadVendasSuporte],
        [CANAL_SUGESTAO_ID, payloads.payloadSugestao],
        [CANAL_ANUNCIO_FIVE_M_ID, payloads.payloadAnuncioFiveM],
        [CANAL_NOVIDADES_CARGOS_ID, payloads.payloadNovidadesCargos],
        [CANAL_INFO_PRECISION_ID, payloads.payloadInfoPrecision]
    ];
    await Promise.all(mensagens.map(([id, payload]) => enviarOuSubstituirMensagem(guild, id, payload, id)));
}

export async function dispararWallpaperDiario() {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return console.error('[wallpapers] Bot não está no servidor configurado.');
    const estado = carregarEstadoWallpaper();
    const diaAtual = estado.diaAtual;
    const arquivoPath = path.join(__dirname, 'Wallpapers', `${diaAtual}.png`);
    if (!fs.existsSync(arquivoPath)) {
        console.warn(`[wallpapers] Arquivo ausente: ${arquivoPath}. O dia não foi avançado.`);
        return;
    }

    const canal = await guild.channels.fetch(CANAL_WALLPAPERS_ID).catch(() => null);
    if (!canal?.isTextBased()) return console.error(`[wallpapers] Canal ${CANAL_WALLPAPERS_ID} não encontrado.`);
    try {
        const attachment = new AttachmentBuilder(arquivoPath, { name: `wallpaper-dia-${diaAtual}.png` });
        await canal.send({ content: `🖼️ **Wallpaper do Dia • Dia ${diaAtual}/105**`, files: [attachment] });
        salvarEstadoWallpaper({ diaAtual: diaAtual >= 105 ? 1 : diaAtual + 1 });
    } catch (error) {
        console.error('[wallpapers] Falha ao enviar o wallpaper:', error);
    }
}

export async function processarEnvioArmazemCincoHoras(guild, nomeArmazem, pastaArmazem, canalDestinoId, estadoKey, forcarEnvio = false) {
    try {
        const estadoMods = carregarEstadoMods();
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
                files: anexos.slice(inicio, inicio + 10)
            });
        }
        armazemEstado.indexAtual += 1;
        armazemEstado.ultimoTimestampEnvio = agoraMs;
        salvarEstadoMods(estadoMods);
    } catch (error) {
        console.error(`[armazém:${nomeArmazem}] Falha ao enviar item:`, error);
    }
}

export async function dispararTodosArmazensCincoHoras(forcarEnvio = false) {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return console.error('[armazéns] Bot não está no servidor configurado.');
    await processarEnvioArmazemCincoHoras(guild, 'ctz', PATHS.ctz, CANAL_POST_CTZ, 'ctz', forcarEnvio);
    await processarEnvioArmazemCincoHoras(guild, 'boosters', PATHS.boosters, CANAL_POST_BOOSTERS, 'boosters', forcarEnvio);
}

export function iniciarAgendadorRelogio() {
    setInterval(() => {
        const agora = new Date();
        const hora = agora.getHours();
        const minuto = agora.getMinutes();
        const segundo = agora.getSeconds();
        if (segundo === 0 && minuto === 0 && [5, 12, 18].includes(hora)) void dispararAvisosLoopHorario();
        if (segundo === 5 && hora === 12 && minuto === 0) void dispararWallpaperDiario();
        if (segundo === 10) void dispararTodosArmazensCincoHoras(false);
    }, 1000);
}

export async function verificarEnviosPendentesAoLigar() {
    const estado = carregarEstadoMods();
    const limite = 5 * 60 * 60 * 1000;
    const agora = Date.now();
    const ctzPendente = estado.ctz.ultimoTimestampEnvio === 0 || agora - estado.ctz.ultimoTimestampEnvio >= limite;
    const boostersPendente = estado.boosters.ultimoTimestampEnvio === 0 || agora - estado.boosters.ultimoTimestampEnvio >= limite;
    if (ctzPendente || boostersPendente) await dispararTodosArmazensCincoHoras(false);
}
