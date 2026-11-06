import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIRECTORY } from '../data/jsonStore.js';
import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const TRANSCRIPTS_DIRECTORY = path.join(DATA_DIRECTORY, 'transcripts');
const RETENTION_DAYS = 90;
const REMOTE_TRANSCRIPTS_FILE = 'ticket-transcript-messages.json';

export async function saveTicketTranscript(channel) {
    const messages = [];
    let before;
    for (let page = 0; page < 10; page += 1) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (!batch.size) break;
        messages.push(...batch.values());
        before = batch.last().id;
        if (batch.size < 100) break;
    }
    const contents = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp).map(message => {
        const body = message.content?.trim() || (message.embeds.length ? '[embed]' : '[mensagem sem texto]');
        const attachments = [...message.attachments.values()].map(file => `\n  Anexo: ${file.name} (${file.url})`).join('');
        return `[${new Date(message.createdTimestamp).toISOString()}] ${message.author.tag}: ${body}${attachments}`;
    }).join('\n');
    await fs.mkdir(TRANSCRIPTS_DIRECTORY, { recursive: true });
    const filePath = path.join(TRANSCRIPTS_DIRECTORY, `${channel.id}.txt`);
    await fs.writeFile(filePath, `Transcrição do canal ${channel.name}\nGerada em ${new Date().toISOString()}\nRetenção local: até ${RETENTION_DAYS} dias\n\n${contents || '(sem mensagens)'}`, 'utf8');
    return filePath;
}

export async function removeExpiredTranscripts(now = Date.now()) {
    let names;
    try {
        names = await fs.readdir(TRANSCRIPTS_DIRECTORY);
    } catch (error) {
        if (error.code === 'ENOENT') return 0;
        throw error;
    }
    let removed = 0;
    const expiresBefore = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const name of names) {
        if (!name.endsWith('.txt')) continue;
        const filePath = path.join(TRANSCRIPTS_DIRECTORY, name);
        const stat = await fs.stat(filePath);
        if (stat.isFile() && stat.mtimeMs < expiresBefore) {
            await fs.unlink(filePath);
            removed += 1;
        }
    }
    return removed;
}

export function rememberRemoteTranscript({ guildId, channelId, messageId }) {
    const references = getRemoteTranscriptReferences();
    references.push({ guildId, channelId, messageId, deleteAfter: Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000 });
    writeJsonData(REMOTE_TRANSCRIPTS_FILE, references);
}

export function getRemoteTranscriptReferences() {
    const stored = readJsonData(REMOTE_TRANSCRIPTS_FILE, []);
    return Array.isArray(stored) ? stored : [];
}

export async function removeExpiredRemoteTranscripts(client, now = Date.now()) {
    const stored = getRemoteTranscriptReferences();
    if (!stored.length) return 0;
    const keep = [];
    let removed = 0;
    for (const reference of stored) {
        if (!Number.isFinite(reference.deleteAfter) || reference.deleteAfter > now) {
            keep.push(reference);
            continue;
        }
        try {
            const guild = client.guilds.cache.get(reference.guildId) ?? await client.guilds.fetch(reference.guildId);
            const channel = await guild.channels.fetch(reference.channelId).catch(() => null);
            const message = channel?.isTextBased() ? await channel.messages.fetch(reference.messageId).catch(() => null) : null;
            if (message) await message.delete();
            removed += 1;
        } catch (error) {
            console.error(`[tickets] Não foi possível remover a transcrição remota ${reference.messageId}:`, error);
            keep.push(reference);
        }
    }
    writeJsonData(REMOTE_TRANSCRIPTS_FILE, keep);
    return removed;
}
