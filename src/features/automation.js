import { AttachmentBuilder } from 'discord.js';
import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
import { client } from '../client.js';
import { PATHS, CANAL_COMPRAS_ONLINE_STATUS, CANAL_PARCERIA_PUBLICA, CANAL_AVISOS_VENDAS_PUBLICA, CANAL_SUGESTAO_ID, CANAL_ANUNCIO_FIVE_M_ID, CANAL_NOVIDADES_CARGOS_ID, CANAL_INFO_PRECISION_ID, CANAL_WALLPAPERS_ID, CANAL_POST_CTZ, CANAL_POST_BOOSTERS } from '../config/constants.js';
import { carregarEstadoWallpaper, salvarEstadoWallpaper, carregarEstadoMods, salvarEstadoMods, getSaudacaoDinamica } from '../services/state.js';
const __dirname = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export async function enviarOuSubstituirMensagem(guild, canalId, payload, chaveLoop) {
    try {
        const canal = await guild.channels.fetch(canalId).catch(() => null);
        if (!canal || !canal.isTextBased()) return;

        try {
            let fetchedMessages = await canal.messages.fetch({ limit: 20 });
            let minhasMensagens = fetchedMessages.filter(m => m.author.id === client.user.id);
            while (minhasMensagens.size > 0) {
                for (const [msgId, msgObj] of minhasMensagens) { await msgObj.delete().catch(() => {}); }
                fetchedMessages = await canal.messages.fetch({ limit: 20 });
                minhasMensagens = fetchedMessages.filter(m => m.author.id === client.user.id);
            }
        } catch (e) {}

        const novaMsg = await canal.send(payload);
        ultimasMensagensLoop[chaveLoop] = novaMsg.id;
    } catch (err) {}
}

export function gerarPayloadsLoop() {
    const saudacao = getSaudacaoDinamica();
    return {
        payloadComprasOnline: { content: `${saudacao}\n\n🛒 **COMPRAS ONLINE DISPONÍVEIS:**\n• **PRODUTO 1:** https://discordapp.com/channels/1528983705673273466/1552131842960916521\n• **PRODUTO 2:** https://discordapp.com/channels/1528983705673273466/1552131921801256961\n• **PRODUTO 3:** https://discord.com/channels/1528983705673273466/1552727902930346167\n\n@everyone` },
        payloadParceria: { content: `# 🕹️ JOGOS STEAM QUASE DE GRAÇA!!\n\nA Wellkeys resolve seu problema, trabalhamos com jogos steam oficiais!\nhttps://wellkeysoficial.com.br\n\n@everyone` },
        payloadVendasSuporte: { content: `${saudacao}\n\n💬 **ATENDIMENTO E SUPORTE • COMMUNITY FOR FIVEM・**\n\n⏰ **Horário de Suporte Humano:** Das **09:00** até as **21:00**.\n\n@everyone` },
        payloadSugestao: { content: `${saudacao}\n\n💡 **CANAL DE SUGESTÕES & IDEIAS**\nDeixe aqui suas ideias!\n\n@everyone` },
        payloadAnuncioFiveM: { content: `# **🚨 ENTRE AGORA NO MELHOR DISCORD DE FIVE M! 🚨**\n\n**vem:** https://discord.gg/PX5YFryEPA\n\n@everyone` },
        payloadNovidadesCargos: { content: `# **✨ NOVIDADES NA COMMUNITY FOR FIVEM! ✨**\nAtualizamos nossos cargos e vantagens!\n\n@everyone` },
        payloadInfoPrecision: { content: `${saudacao}\n\n⚡ **BOT ONLINE • INFORMAÇÕES SOBRE O PRECISIONFIX**\n\nNosso bot está 100% online!\n\n🔹 **Já pode fazer sua verificação aqui:**\nhttps://discord.com/channels/1528983705673273466/1547204424244658216\n\n🚀 **Procurando o PrecisionFix?**\nAdquira em:\nhttps://discord.com/channels/1528983705673273466/1552131842960916521\n\n> ⚠️ *Aviso: O cargo/acesso do PrecisionFix tem duração de **5 dias** de total desempenho no seu FiveM!*.\n\n@everyone` }
    };
}

export async function dispararAvisosLoopHorario() {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return;
        const payloads = gerarPayloadsLoop();
        await enviarOuSubstituirMensagem(guild, CANAL_COMPRAS_ONLINE_STATUS, payloads.payloadComprasOnline, CANAL_COMPRAS_ONLINE_STATUS);
        await enviarOuSubstituirMensagem(guild, CANAL_PARCERIA_PUBLICA, payloads.payloadParceria, CANAL_PARCERIA_PUBLICA);
        await enviarOuSubstituirMensagem(guild, CANAL_AVISOS_VENDAS_PUBLICA, payloads.payloadVendasSuporte, CANAL_AVISOS_VENDAS_PUBLICA);
        await enviarOuSubstituirMensagem(guild, CANAL_SUGESTAO_ID, payloads.payloadSugestao, CANAL_SUGESTAO_ID);
        await enviarOuSubstituirMensagem(guild, CANAL_ANUNCIO_FIVE_M_ID, payloads.payloadAnuncioFiveM, CANAL_ANUNCIO_FIVE_M_ID);
        await enviarOuSubstituirMensagem(guild, CANAL_NOVIDADES_CARGOS_ID, payloads.payloadNovidadesCargos, CANAL_NOVIDADES_CARGOS_ID);
        await enviarOuSubstituirMensagem(guild, CANAL_INFO_PRECISION_ID, payloads.payloadInfoPrecision, CANAL_INFO_PRECISION_ID);
    } catch (err) {}
}

export async function dispararWallpaperDiario() {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return;
        let estado = carregarEstadoWallpaper();
        const diaAtual = estado.diaAtual;
        const arquivoPath = path.join(__dirname, 'Wallpapers', `${diaAtual}.png`);
        const canalWallpaper = await guild.channels.fetch(CANAL_WALLPAPERS_ID).catch(() => null);
        if (canalWallpaper && canalWallpaper.isTextBased() && fs.existsSync(arquivoPath)) {
            const attachment = new AttachmentBuilder(arquivoPath, { name: `wallpaper-dia-${diaAtual}.png` });
            await canalWallpaper.send({ content: `🖼️ **Wallpaper do Dia • Dia ${diaAtual}/105**`, files: [attachment] });
        }
        estado.diaAtual = diaAtual >= 105 ? 1 : diaAtual + 1;
        salvarEstadoWallpaper(estado);
    } catch (err) {}
}

export async function processarEnvioArmazemCincoHoras(guild, nomeArmazem, pastaArmazem, canalDestinoId, estadoKey, forcarEnvio) {
    try {
        let estadoMods = carregarEstadoMods();
        let armazemEstado = estadoMods[estadoKey];
        const agoraMs = Date.now();
        const cincoHorasMs = 5 * 60 * 60 * 1000;

        if (!forcarEnvio && armazemEstado.ultimoTimestampEnvio > 0 && (agoraMs - armazemEstado.ultimoTimestampEnvio) < cincoHorasMs) return;
        const canalDestino = await guild.channels.fetch(canalDestinoId).catch(() => null);
        if (!canalDestino || !canalDestino.isTextBased()) return;
        if (!fs.existsSync(pastaArmazem)) { fs.mkdirSync(pastaArmazem, { recursive: true }); return; }

        const indexAtual = armazemEstado.indexAtual;
        const arquivosNaPasta = fs.readdirSync(pastaArmazem);
        const arquivosDoItem = arquivosNaPasta.filter(n => new RegExp(`^${indexAtual}\\.`, 'i').test(n));

        if (arquivosDoItem.length > 0) {
            const tituloLabel = nomeArmazem === 'ctz' ? 'Armazém CTZ' : 'Armazém CTZ Boosters';
            const attachments = arquivosDoItem.map(n => new AttachmentBuilder(path.join(pastaArmazem, n), { name: n }));
            await canalDestino.send({ content: `📦 **[${tituloLabel}] • Item #${indexAtual}**\n\n@everyone`, files: attachments });
            armazemEstado.indexAtual += 1;
            armazemEstado.ultimoTimestampEnvio = agoraMs;
            salvarEstadoMods(estadoMods);
        }
    } catch (err) {}
}

export async function dispararTodosArmazensCincoHoras(forcarEnvio = false) {
    const guild = client.guilds.cache.first();
    if (!guild) return;
    await processarEnvioArmazemCincoHoras(guild, 'ctz', PATHS.ctz, CANAL_POST_CTZ, 'ctz', forcarEnvio);
    await processarEnvioArmazemCincoHoras(guild, 'boosters', PATHS.boosters, CANAL_POST_BOOSTERS, 'boosters', forcarEnvio);
}

export function iniciarAgendadorRelogio() {
    setInterval(() => {
        const agora = new Date();
        const hora = agora.getHours();
        const minuto = agora.getMinutes();
        const segundo = agora.getSeconds();
        if (segundo === 0 && (hora === 5 || hora === 12 || hora === 18) && minuto === 0) dispararAvisosLoopHorario();
        if (segundo === 5 && hora === 12 && minuto === 0) dispararWallpaperDiario();
        if (segundo === 10) dispararTodosArmazensCincoHoras(false);
    }, 1000);
}

export async function verificarEnviosPendentesAoLigar() {
    const estadoMods = carregarEstadoMods();
    const agoraMs = Date.now();
    const cincoHorasMs = 5 * 60 * 60 * 1000;
    if (estadoMods.ctz.ultimoTimestampEnvio === 0 || (agoraMs - estadoMods.ctz.ultimoTimestampEnvio) >= cincoHorasMs ||
        estadoMods.boosters.ultimoTimestampEnvio === 0 || (agoraMs - estadoMods.boosters.ultimoTimestampEnvio) >= cincoHorasMs) {
        await dispararTodosArmazensCincoHoras(true);
    }
}

