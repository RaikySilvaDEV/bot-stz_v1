import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder,
    StringSelectMenuBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { client } from '../client.js';
import { MEU_ID_USUARIO } from '../config/constants.js';
import { logAction } from '../services/audit.js';
import { getSettings } from '../repositories/settingsRepository.js';
import {
    addAnnouncement, getAnnouncements, updateAnnouncement, removeAnnouncement
} from '../repositories/announcementRepository.js';

export function listarAnunciosFiveM() {
    return getAnnouncements();
}

function validarDadosAnuncio(titulo, texto) {
    if (typeof titulo !== 'string' || !titulo.trim() || titulo.trim().length > 100) {
        throw new TypeError('O título é obrigatório e deve ter no máximo 100 caracteres.');
    }
    if (typeof texto !== 'string' || !texto.trim() || texto.trim().length > 1800) {
        throw new TypeError('O texto é obrigatório e deve ter no máximo 1800 caracteres.');
    }
    return { titulo: titulo.trim(), texto: texto.trim() };
}

async function obterCanalAnuncios() {
    const channelId = getSettings().channels.fivemAnnouncements;
    const canal = await client.channels.fetch(channelId).catch(() => null);
    if (!canal?.isTextBased()) throw new Error('O canal de anúncios FiveM não foi encontrado. Use `/configurar` para escolher o canal.');
    return canal;
}

export async function criarAnuncioFiveM(dados) {
    const { titulo, texto } = validarDadosAnuncio(dados.titulo, dados.texto);
    const canal = await obterCanalAnuncios();
    const mensagem = await canal.send({ content: `# ${titulo}\n\n${texto}`, allowedMentions: { parse: [] } });
    let anuncio;
    try {
        anuncio = addAnnouncement({ id: mensagem.id, mensagemId: mensagem.id, titulo, texto });
    } catch (error) {
        await mensagem.delete().catch(() => {});
        throw error;
    }
    await logAction(canal.guild, dados.actorId ?? 'sistema', 'Anúncio FiveM cadastrado', titulo);
    return anuncio;
}

export async function atualizarAnuncioFiveM(id, dados, actorId = 'sistema') {
    const { titulo, texto } = validarDadosAnuncio(dados.titulo, dados.texto);
    const anuncio = getAnnouncements().find(item => item.id === id);
    if (!anuncio) return null;
    const canal = await obterCanalAnuncios();
    const mensagem = await canal.messages.fetch(anuncio.mensagemId).catch(() => null);
    if (!mensagem) throw new Error('A mensagem publicada não foi encontrada no Discord.');
    await mensagem.edit({ content: `# ${titulo}\n\n${texto}`, allowedMentions: { parse: [] } });
    const atualizado = updateAnnouncement(id, { titulo, texto });
    await logAction(canal.guild, actorId, 'Anúncio FiveM editado', titulo);
    return atualizado;
}

export async function removerAnuncioFiveM(id, actorId = 'sistema') {
    const anuncio = getAnnouncements().find(item => item.id === id);
    if (!anuncio) return false;
    const canal = await obterCanalAnuncios();
    const mensagem = await canal.messages.fetch(anuncio.mensagemId).catch(() => null);
    if (mensagem) await mensagem.delete();
    removeAnnouncement(id);
    await logAction(canal.guild, actorId, 'Anúncio FiveM removido', anuncio.titulo);
    return true;
}

function ehAdministrador(interaction) {
    return interaction.user.id === MEU_ID_USUARIO || interaction.user.id === interaction.guild?.ownerId;
}

function montarPainel(anuncios, selecionadoId = null) {
    const announcementChannelId = getSettings().channels.fivemAnnouncements;
    const componentes = [];
    if (anuncios.length) {
        componentes.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('fivem:select')
                .setPlaceholder('Selecione um anúncio para atualizar ou remover')
                .addOptions(anuncios.slice(0, 25).map(anuncio => ({
                    label: anuncio.titulo.slice(0, 100),
                    description: anuncio.texto.replace(/\s+/g, ' ').slice(0, 100) || 'Sem descrição',
                    value: anuncio.id,
                    default: anuncio.id === selecionadoId
                })))
        ));
    }
    const botoes = [new ButtonBuilder().setCustomId('fivem:add').setLabel('Cadastrar anúncio').setStyle(ButtonStyle.Success)];
    if (selecionadoId) botoes.push(
        new ButtonBuilder().setCustomId(`fivem:edit:${selecionadoId}`).setLabel('Atualizar').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fivem:delete:${selecionadoId}`).setLabel('Remover').setStyle(ButtonStyle.Danger)
    );
    componentes.push(new ActionRowBuilder().addComponents(botoes));
    const texto = anuncios.length
        ? `**Anúncios FiveM** — publicados em <#${announcementChannelId}>. Selecione um anúncio para atualizar ou remover.${anuncios.length > 25 ? `\nExibindo os primeiros 25 de ${anuncios.length}.` : ''}`
        : `Ainda não há anúncios cadastrados. Use **Cadastrar anúncio** para publicar o primeiro em <#${announcementChannelId}>.`;
    return { content: texto, components: componentes, flags: MessageFlags.Ephemeral };
}

function montarModal(anuncio = null) {
    const modal = new ModalBuilder()
        .setCustomId(anuncio ? `fivem:submit-edit:${anuncio.id}` : 'fivem:submit-add')
        .setTitle(anuncio ? 'Atualizar anúncio FiveM' : 'Cadastrar anúncio FiveM');
    const titulo = new TextInputBuilder().setCustomId('titulo').setLabel('Título')
        .setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true);
    const texto = new TextInputBuilder().setCustomId('texto').setLabel('Texto do anúncio')
        .setStyle(TextInputStyle.Paragraph).setMaxLength(1800).setRequired(true);
    if (anuncio) titulo.setValue(anuncio.titulo);
    if (anuncio) texto.setValue(anuncio.texto);
    return modal.addComponents(new ActionRowBuilder().addComponents(titulo), new ActionRowBuilder().addComponents(texto));
}

export async function removerAnuncioFiveMAntigo() {
    const canal = await client.channels.fetch(getSettings().channels.fivemAnnouncements).catch(() => null);
    if (!canal?.isTextBased()) return;
    const mensagens = await canal.messages.fetch({ limit: 100 }).catch(error => {
        console.warn('[anuncios-fivem] Não foi possível localizar o anúncio antigo:', error);
        return null;
    });
    const antigas = mensagens?.filter(m => m.author.id === client.user.id &&
        /ENTRE AGORA NO DISCORD DA COMMUNITY FOR FIVEM|discord\.gg\/PX5YFryEPA/i.test(m.content));
    for (const mensagem of antigas?.values() ?? []) {
        await mensagem.delete().catch(error => console.warn('[anuncios-fivem] Não foi possível remover o anúncio antigo:', error));
    }
}

export async function tratarInteracaoAnunciosFiveM(interaction) {
    const comando = interaction.isChatInputCommand() && interaction.commandName === 'anuncios-fivem';
    const componente = (interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('fivem:');
    const modal = interaction.isModalSubmit() && interaction.customId.startsWith('fivem:submit-');
    if (!comando && !componente && !modal) return false;
    if (!ehAdministrador(interaction)) {
        const resposta = { content: 'Apenas os donos do servidor podem gerenciar anúncios FiveM.', flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) await interaction.followUp(resposta);
        else await interaction.reply(resposta);
        return true;
    }
    if (comando) {
        await interaction.reply(montarPainel(getAnnouncements()));
        return true;
    }
    if (interaction.isStringSelectMenu()) {
        await interaction.update(montarPainel(getAnnouncements(), interaction.values[0]));
        return true;
    }
    if (interaction.isButton()) {
        const [, acao, id] = interaction.customId.split(':');
        const anuncios = getAnnouncements();
        if (acao === 'add') await interaction.showModal(montarModal());
        if (acao === 'edit') {
            const anuncio = anuncios.find(item => item.id === id);
            if (!anuncio) await interaction.update(montarPainel(getAnnouncements()));
            else await interaction.showModal(montarModal(anuncio));
        }
        if (acao === 'delete') {
            await removerAnuncioFiveM(id, interaction.user.id);
            await interaction.update(montarPainel(getAnnouncements()));
        }
        return true;
    }

    const isNovo = interaction.customId === 'fivem:submit-add';
    const id = isNovo ? null : interaction.customId.split(':')[2];
    const titulo = interaction.fields.getTextInputValue('titulo').trim();
    const texto = interaction.fields.getTextInputValue('texto').trim();
    const anuncio = isNovo
        ? await criarAnuncioFiveM({ titulo, texto, actorId: interaction.user.id })
        : await atualizarAnuncioFiveM(id, { titulo, texto }, interaction.user.id);
    if (!anuncio) {
        await interaction.reply({ content: 'Esse anúncio não está mais na lista. Abra `/anuncios-fivem` novamente.', flags: MessageFlags.Ephemeral });
        return true;
    }
    const channelId = getSettings().channels.fivemAnnouncements;
    await interaction.reply({ content: `✅ Anúncio ${isNovo ? 'cadastrado' : 'atualizado'} no canal <#${channelId}>.`, flags: MessageFlags.Ephemeral });
    return true;
}
