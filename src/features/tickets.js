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
let varreduraEmAndamento = false;

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

                            const promptSistema = `Você é o assistente virtual profissional da Community for FiveM.
Interprete gírias e abreviações informais do usuário (como 'q', 'oq', 'n', 'ss', 'tô').
Assuntos principais: PrecisionFix (otimização FiveM, key de 5 dias, ativação) e dúvidas de compra/suporte.
Responda com todas as informações necessárias. Se a dúvida ultrapassar o seu atendimento automático ou o cliente insistir, inclua obrigatoriamente a palavra CHAVE_HUMANO na resposta.`;

                            let respostaIA;
                            try {
                                respostaIA = await generateAssistantResponse(promptSistema, msgsOrdenadas.slice(0, 8).reverse().map(message => ({
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
