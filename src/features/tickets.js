import { ChannelType } from 'discord.js';
import { client } from '../client.js';
import { GUILD_ID, CANAIS_IGNORADOS_SUPORTE, MEU_ID_USUARIO } from '../config/constants.js';
import { addNotifiedTicketId, getNotifiedTicketIds, removeNotifiedTicketId } from '../repositories/stateRepository.js';
import { getSettings } from '../repositories/settingsRepository.js';
import { logAction } from '../services/audit.js';
import { generateAssistantResponse, getAssistantStatus } from '../services/assistantProvider.js';
const ultimoAtendimentoPorCanal = new Map();
const ultimaMensagemTentadaPorCanal = new Map();
const avisoIaIndisponivelPorCanal = new Set();
const saudacoesIniciaisEmAndamento = new Set();
let varreduraEmAndamento = false;

const PROMPT_SISTEMA_TICKET = `Você é o assistente virtual profissional da Community for FiveM.
Interprete gírias e abreviações informais do usuário (como 'q', 'oq', 'n', 'ss', 'tô').
Assuntos principais: FiveM, PrecisionFix (otimização FiveM, ativação e acesso), compras e suporte da comunidade.
Responda em português do Brasil, com clareza e sem inventar preços, disponibilidade, pagamentos confirmados ou configurações.
Nunca peça senha, token, chave Pix ou dados pessoais desnecessários. Não confirme pagamentos por comprovantes.
Se a dúvida ultrapassar seu atendimento automático ou o cliente pedir uma pessoa, inclua obrigatoriamente a palavra CHAVE_HUMANO na resposta.`;

export async function iniciarAtendimentoAutomatico(channel, userId, selectedOption = null) {
    if (!channel || saudacoesIniciaisEmAndamento.has(channel.id)) return;
    saudacoesIniciaisEmAndamento.add(channel.id);
    try {
        if (!getSettings().automations.aiResponses) return;
        const status = await getAssistantStatus();
        if (!status.ready) {
            await channel.send('⚠️ O atendimento automático está temporariamente indisponível. A equipe responderá por este canal.');
            await logAction(channel.guild, client.user.id, 'Atendimento automático indisponível ao abrir ticket', `Canal ${channel.name}`);
            return;
        }

        await channel.sendTyping();
        const assunto = selectedOption?.label ?? 'Atendimento geral';
        const detalhes = selectedOption?.description?.slice(0, 600) ?? '';
        const mensagemInicial = [
            'Um cliente acabou de abrir um novo ticket de atendimento.',
            `Assunto selecionado: ${assunto}.`,
            detalhes ? `Descrição do assunto: ${detalhes}` : '',
            'Escreva a primeira mensagem de atendimento: cumprimente o cliente, diga brevemente em que temas pode ajudar e pergunte o que ele precisa. No máximo 3 frases; não invente dados do cliente ou do servidor.'
        ].filter(Boolean).join('\n');
        let resposta = await generateAssistantResponse(PROMPT_SISTEMA_TICKET, [{ role: 'user', content: mensagemInicial }]);

        if (resposta.includes('CHAVE_HUMANO') || resposta.length < 10) {
            addNotifiedTicketId(channel.id);
            await channel.send({ content: `Olá <@${userId}>! Vou chamar a equipe para continuar seu atendimento.`, allowedMentions: { users: [userId], parse: [] } });
            await logAction(channel.guild, client.user.id, 'Ticket encaminhado à equipe na abertura', `Canal ${channel.name}`);
            return;
        }

        resposta = resposta.replaceAll('CHAVE_HUMANO', '').trim();
        await channel.send({ content: `Olá <@${userId}>! ${resposta}`.slice(0, 1900), allowedMentions: { users: [userId], parse: [] } });
        avisoIaIndisponivelPorCanal.delete(channel.id);
        await logAction(channel.guild, client.user.id, 'IA iniciou atendimento ao abrir ticket', `Canal ${channel.name}`);
    } catch (error) {
        console.error(`[tickets:${channel.id}] Falha ao iniciar atendimento automático:`, error.message);
        await channel.send('⚠️ Não consegui iniciar o atendimento automático agora. A equipe responderá por este canal.').catch(() => {});
        await logAction(channel.guild, client.user.id, 'Falha ao iniciar atendimento automático', `Canal ${channel.name}: ${error.message}`).catch(() => {});
    } finally {
        saudacoesIniciaisEmAndamento.delete(channel.id);
    }
}

client.on('channelDelete', channel => {
    try {
        removeNotifiedTicketId(channel.id);
    } catch (error) {
        console.error('[tickets] Não foi possível limpar o estado do ticket removido:', error);
    }
    ultimoAtendimentoPorCanal.delete(channel.id);
    ultimaMensagemTentadaPorCanal.delete(channel.id);
    avisoIaIndisponivelPorCanal.delete(channel.id);
});

export function iniciarVarreduraTicketsOrfaos() {
    setInterval(async () => {
        if (varreduraEmAndamento) return;
        varreduraEmAndamento = true;
        try {
            const guild = client.guilds.cache.get(GUILD_ID);
            if (!guild) return;
            await guild.channels.fetch();
            const settings = getSettings();

            const tickets = guild.channels.cache.filter(c =>
                c && c.type === ChannelType.GuildText &&
                c.parentId === settings.channels.supportCategory &&
                !c.topic?.includes('ticket-type:compra') &&
                !CANAIS_IGNORADOS_SUPORTE.includes(c.id)
            );

            const ticketsNotificados = getNotifiedTicketIds();
            for (const [id, canalTicket] of tickets) {
                try {
                    const mensagens = await canalTicket.messages.fetch({ limit: 10 });
                    if (mensagens.size === 0) continue;

                    const msgsOrdenadas = Array.from(mensagens.values()).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
                    const ultimaMsg = msgsOrdenadas[0];

                    if (!ultimaMsg.author.bot && settings.automations.aiResponses) {
                        if (ultimaMensagemTentadaPorCanal.get(canalTicket.id) === ultimaMsg.id) continue;
                        const ultimaRespostaIA = ultimoAtendimentoPorCanal.get(canalTicket.id) ?? 0;
                        if (Date.now() - ultimaRespostaIA < 30 * 1000) continue;
                        if (ticketsNotificados.includes(canalTicket.id)) continue;
                        ultimaMensagemTentadaPorCanal.set(canalTicket.id, ultimaMsg.id);

                        const assistantStatus = await getAssistantStatus();
                        if (!assistantStatus?.ready) {
                            if (!avisoIaIndisponivelPorCanal.has(canalTicket.id)) {
                                avisoIaIndisponivelPorCanal.add(canalTicket.id);
                                await canalTicket.send(`⚠️ <@${MEU_ID_USUARIO}>: o autoatendimento local está indisponível. ${assistantStatus.detail}`);
                                await logAction(guild, client.user.id, 'IA local indisponível', `Canal ${canalTicket.name}`);
                            }
                            continue;
                        }
                        const ultimaMensagemDoBot = msgsOrdenadas.find(m => m.author.id === client.user.id);
                        const botJaRespondeuRecente = ultimaMensagemDoBot && ultimaMensagemDoBot.createdTimestamp > ultimaMsg.createdTimestamp;
                        if (!botJaRespondeuRecente) {
                            await canalTicket.sendTyping();

                            let respostaIA;
                            try {
                                respostaIA = await generateAssistantResponse(PROMPT_SISTEMA_TICKET, msgsOrdenadas.slice(0, 8).reverse().map(message => ({
                                    role: message.author.bot ? 'assistant' : 'user',
                                    content: message.content || '[mensagem com anexo]'
                                })), { userId: ultimaMsg.author.id });
                            } catch (error) {
                                console.error(`[tickets:${canalTicket.id}] IA local indisponível:`, error.message);
                                avisoIaIndisponivelPorCanal.add(canalTicket.id);
                                await canalTicket.send(`⚠️ <@${MEU_ID_USUARIO}>: não consegui consultar a IA local. A equipe precisa responder manualmente. (${error.message})`);
                                await logAction(guild, client.user.id, 'Falha na IA local do ticket', `Canal ${canalTicket.name}`);
                                continue;
                            }

                            if (respostaIA.includes("CHAVE_HUMANO") || respostaIA.length < 10) {
                                addNotifiedTicketId(canalTicket.id);
                                await canalTicket.send(`⚠️ <@${MEU_ID_USUARIO}> (.thestz), preciso da sua atenção neste atendimento aqui.`);
                                await logAction(guild, client.user.id, 'Ticket encaminhado à equipe', `Canal ${canalTicket.name}`);
                                continue;
                            }

                            respostaIA = respostaIA.replace("CHAVE_HUMANO", "").trim();
                            await ultimaMsg.reply({ content: respostaIA.slice(0, 1900), allowedMentions: { parse: [] } });
                            avisoIaIndisponivelPorCanal.delete(canalTicket.id);
                            ultimoAtendimentoPorCanal.set(canalTicket.id, Date.now());
                        }
                    }
                } catch (errCanal) { console.error(`[tickets:${canalTicket.id}] Falha ao processar ticket:`, errCanal); }
            }
        } catch (errGlobal) { console.error('[tickets] Falha na varredura:', errGlobal); }
        finally { varreduraEmAndamento = false; }
    }, 25 * 1000);
}

// 👋 Boas-vindas Personalizadas
