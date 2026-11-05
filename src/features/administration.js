import { AttachmentBuilder, ChannelType, MessageFlags } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { ai, client } from '../client.js';
import { GUILD_ID, MEU_ID_USUARIO, PATHS } from '../config/constants.js';
import { getAuditEntries } from '../repositories/auditRepository.js';
import { getPartners } from '../repositories/partnershipRepository.js';
import { getSettings, updateSettings } from '../repositories/settingsRepository.js';
import { getStockState, getWallpaperState } from '../repositories/stateRepository.js';
import { getPartnershipCount } from './partnerships.js';
import { listarAnunciosFiveM } from './fivemAnnouncements.js';
import { logAction } from '../services/audit.js';
import { getApiStatus } from '../api/server.js';

const CHANNEL_LABELS = {
    partnerships: 'Parcerias', fivemAnnouncements: 'Anúncios FiveM', supportCategory: 'Categoria de tickets',
    verification: 'Verificação', welcome: 'Boas-vindas', wallpapers: 'Wallpapers', suggestions: 'Sugestões',
    purchaseStatus: 'Status de compras', supportNotices: 'Avisos de suporte', roleNews: 'Novidades de cargos',
    precisionInfo: 'Informações PrecisionFix', stockCtz: 'Armazém CTZ', stockBoosters: 'Armazém CTZ Boosters', audit: 'Logs administrativos'
};
const AUTOMATION_LABELS = { announcements: 'Avisos agendados', wallpapers: 'Wallpapers diários', stock: 'Armazéns a cada 5 horas', aiResponses: 'Atendimento automático por IA' };
const CHANNEL_CHOICES = Object.entries(CHANNEL_LABELS).map(([value, name]) => ({ name, value }));
const AUTOMATION_CHOICES = Object.entries(AUTOMATION_LABELS).map(([value, name]) => ({ name, value }));

export { CHANNEL_CHOICES, AUTOMATION_CHOICES };

export function ehDono(interaction) {
    return interaction.user.id === MEU_ID_USUARIO || interaction.user.id === interaction.guild?.ownerId;
}

function contarArquivosDoItem(folder, index) {
    if (!fs.existsSync(folder)) return 0;
    return fs.readdirSync(folder).filter(name => new RegExp(`^${index}\\.`, 'i').test(name) && fs.statSync(path.join(folder, name)).isFile()).length;
}

function formatSettings(settings) {
    const channels = Object.entries(CHANNEL_LABELS).map(([key, label]) => `${label}: ${settings.channels[key] ? `<#${settings.channels[key]}>` : 'não configurado'}`).join('\n');
    const automations = Object.entries(AUTOMATION_LABELS).map(([key, label]) => `${label}: ${settings.automations[key] ? 'ligados' : 'pausados'}`).join('\n');
    return `**Canais**\n${channels}\n\n**Automações**\n${automations}\n\nMenções @everyone: ${settings.everyoneMentions ? 'ligadas' : 'desligadas'}\nHorários dos avisos: ${settings.announcementHours.map(hour => `${String(hour).padStart(2, '0')}:00`).join(', ')}\nFuso horário: ${settings.timezone}`;
}

async function logConfigurationChange(interaction, action, detail) {
    await logAction(interaction.guild, interaction.user.id, action, detail);
}

export async function tratarInteracaoAdministracao(interaction) {
    const command = interaction.isChatInputCommand() && ['status', 'configurar', 'logs', 'backup'].includes(interaction.commandName);
    if (!command) return false;
    if (!ehDono(interaction)) {
        await interaction.reply({ content: 'Esse comando está disponível apenas para os donos do servidor.', flags: MessageFlags.Ephemeral });
        return true;
    }

    if (interaction.commandName === 'status') {
        const settings = getSettings();
        const guild = client.guilds.cache.get(GUILD_ID);
        const channels = guild ? await guild.channels.fetch().catch(() => null) : null;
        const missingChannels = Object.entries(settings.channels)
            .filter(([key, id]) => id && key !== 'audit' && !channels?.has(id))
            .map(([key]) => CHANNEL_LABELS[key]);
        const uptime = Math.floor(process.uptime());
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const apiStatus = getApiStatus();
        const wallpaperState = getWallpaperState();
        const stockState = getStockState();
        const stockRemaining = Math.max(0, 5 * 60 * 60 * 1000 - (Date.now() - Math.min(stockState.ctz.ultimoTimestampEnvio, stockState.boosters.ultimoTimestampEnvio)));
        const stockRemainingText = stockRemaining === 0 ? 'pronto para publicar' : `${Math.floor(stockRemaining / 3_600_000)}h ${Math.floor((stockRemaining % 3_600_000) / 60_000)}min`;
        const lines = [
            `Discord: ${client.isReady() ? 'conectado' : 'desconectado'}${guild ? ` em **${guild.name}**` : ''}`,
            `Latência: ${client.ws.ping >= 0 ? `${client.ws.ping} ms` : 'aguardando gateway'}`,
            `Tempo ligado: ${hours}h ${minutes}min`,
            `Parcerias cadastradas: ${getPartnershipCount()}`,
            `Anúncios FiveM cadastrados: ${listarAnunciosFiveM().length}`,
            `Gemini: ${ai ? (settings.automations.aiResponses ? 'atendimento ligado' : 'atendimento pausado') : 'GEMINI_API_KEY ausente'}`,
            `API local: ${apiStatus.running ? `ativa na porta ${apiStatus.port}` : 'inativa (configure API_KEY para ativar)'}`,
            `Wallpaper atual: dia ${wallpaperState.diaAtual}/105 (${fs.existsSync(path.join(PATHS.wallpapers, `${wallpaperState.diaAtual}.png`)) ? 'arquivo pronto' : 'arquivo ausente'})`,
            `Armazém CTZ: item #${stockState.ctz.indexAtual}, ${contarArquivosDoItem(PATHS.ctz, stockState.ctz.indexAtual)} arquivo(s)`,
            `Armazém Boosters: item #${stockState.boosters.indexAtual}, ${contarArquivosDoItem(PATHS.boosters, stockState.boosters.indexAtual)} arquivo(s)`,
            `Próxima verificação dos armazéns: ${stockRemainingText}`,
            `Memória: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
            `Canais não encontrados: ${missingChannels.length ? missingChannels.join(', ') : 'nenhum'}`
        ];
        await interaction.reply({ content: `**Status do bot**\n${lines.join('\n')}`, flags: MessageFlags.Ephemeral });
        return true;
    }

    if (interaction.commandName === 'logs') {
        const entries = getAuditEntries(interaction.options.getInteger('quantidade') ?? 10);
        const content = entries.length
            ? entries.map(entry => `• <t:${Math.floor(new Date(entry.at).getTime() / 1000)}:R> — **${entry.action}** — <@${entry.actorId}> — ${entry.subject}`).join('\n')
            : 'Ainda não há ações administrativas registradas.';
        await interaction.reply({ content: `**Registro administrativo**\n${content}`.slice(0, 1900), flags: MessageFlags.Ephemeral, allowedMentions: { users: [] } });
        return true;
    }

    if (interaction.commandName === 'backup') {
        const snapshot = {
            criadoEm: new Date().toISOString(),
            servidor: GUILD_ID,
            configuracoes: getSettings(),
            parcerias: getPartners(),
            anunciosFiveM: listarAnunciosFiveM(),
            logsAdministrativos: getAuditEntries(100)
        };
        const filename = `backup-community-${new Date().toISOString().slice(0, 10)}.json`;
        const attachment = new AttachmentBuilder(Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`, 'utf8'), { name: filename });
        await interaction.reply({ content: 'Backup gerado. Inclui configurações, parcerias, anúncios e os últimos 100 logs; não inclui tokens nem transcrições de tickets.', files: [attachment], flags: MessageFlags.Ephemeral });
        await logConfigurationChange(interaction, 'Backup gerado', filename);
        return true;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'ver') {
        await interaction.reply({ content: formatSettings(getSettings()), flags: MessageFlags.Ephemeral });
    } else if (subcommand === 'canal') {
        const key = interaction.options.getString('tipo');
        const channel = interaction.options.getChannel('canal');
        if (key === 'supportCategory' ? channel.type !== ChannelType.GuildCategory : !channel.isTextBased()) {
            await interaction.reply({ content: key === 'supportCategory' ? 'Escolha uma categoria do servidor.' : 'Escolha um canal de texto.' , flags: MessageFlags.Ephemeral });
            return true;
        }
        const settings = updateSettings({ channels: { [key]: channel.id } });
        await logConfigurationChange(interaction, 'Canal alterado', `${CHANNEL_LABELS[key]} → <#${channel.id}>`);
        await interaction.reply({ content: `✅ ${CHANNEL_LABELS[key]} definido como ${channel}.\n\n${formatSettings(settings)}`, flags: MessageFlags.Ephemeral });
    } else if (subcommand === 'automacao') {
        const key = interaction.options.getString('tipo');
        const enabled = interaction.options.getBoolean('ativa');
        const settings = updateSettings({ automations: { [key]: enabled } });
        await logConfigurationChange(interaction, 'Automação alterada', `${AUTOMATION_LABELS[key]}: ${enabled ? 'ligados' : 'pausados'}`);
        await interaction.reply({ content: `✅ ${AUTOMATION_LABELS[key]} ${enabled ? 'ativados' : 'pausados'}.`, flags: MessageFlags.Ephemeral });
    } else if (subcommand === 'mencoes') {
        const enabled = interaction.options.getBoolean('ativa');
        const settings = updateSettings({ everyoneMentions: enabled });
        await logConfigurationChange(interaction, '@everyone alterado', enabled ? 'menções ativadas' : 'menções desativadas');
        await interaction.reply({ content: `✅ Menções @everyone ${settings.everyoneMentions ? 'ativadas' : 'desativadas'}.`, flags: MessageFlags.Ephemeral });
    } else if (subcommand === 'horarios') {
        const raw = interaction.options.getString('horas');
        const parts = raw.split(',').map(value => value.trim());
        const hours = [...new Set(parts.map(Number))].sort((a, b) => a - b);
        if (!parts.length || parts.some(value => !/^\d{1,2}$/.test(value)) || hours.some(hour => hour < 0 || hour > 23)) {
            await interaction.reply({ content: 'Informe horas de 0 a 23 separadas por vírgula, por exemplo: `9,15,21`.', flags: MessageFlags.Ephemeral });
            return true;
        }
        const settings = updateSettings({ announcementHours: hours });
        await logConfigurationChange(interaction, 'Horários alterados', hours.map(hour => `${String(hour).padStart(2, '0')}:00`).join(', '));
        await interaction.reply({ content: `✅ Avisos agendados para ${settings.announcementHours.map(hour => `${String(hour).padStart(2, '0')}:00`).join(', ')} (${settings.timezone}).`, flags: MessageFlags.Ephemeral });
    } else if (subcommand === 'fuso') {
        const timezone = interaction.options.getString('zona').trim();
        try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); }
        catch {
            await interaction.reply({ content: 'Esse fuso não é válido. Use um nome IANA, como `America/Sao_Paulo`.', flags: MessageFlags.Ephemeral });
            return true;
        }
        updateSettings({ timezone });
        await logConfigurationChange(interaction, 'Fuso horário alterado', timezone);
        await interaction.reply({ content: `✅ Fuso horário definido para **${timezone}**.`, flags: MessageFlags.Ephemeral });
    } else if (subcommand === 'auditoria') {
        const enabled = interaction.options.getBoolean('ativa');
        const channel = interaction.options.getChannel('canal');
        if (enabled && !channel?.isTextBased()) {
            await interaction.reply({ content: 'Escolha um canal de texto privado para receber os logs.', flags: MessageFlags.Ephemeral });
            return true;
        }
        updateSettings({ channels: { audit: enabled ? channel.id : null } });
        await interaction.reply({ content: enabled ? `✅ Logs administrativos serão enviados para ${channel}.` : '✅ Envio de logs em canal desativado; os registros continuarão salvos localmente.', flags: MessageFlags.Ephemeral });
        await logConfigurationChange(interaction, 'Canal de auditoria alterado', enabled ? `Canal ${channel.name}` : 'Envio em canal desligado');
    }
    return true;
}
