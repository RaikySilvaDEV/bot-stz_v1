import { ChannelType } from 'discord.js';
import { ai, client } from '../client.js';
import { CATEGORIA_SUPORTE_ID, CANAIS_IGNORADOS_SUPORTE, MEU_ID_USUARIO } from '../config/constants.js';
import { carregarTicketsNotificados, salvarTicketNotificado, getSaudacaoDinamica } from '../services/state.js';
export function iniciarVarreduraTicketsOrfaos() {
    setInterval(async () => {
        try {
            const guild = client.guilds.cache.first();
            if (!guild) return;
            await guild.channels.fetch();

            const tickets = guild.channels.cache.filter(c => 
                c && c.type === ChannelType.GuildText && 
                c.parentId === CATEGORIA_SUPORTE_ID && 
                !CANAIS_IGNORADOS_SUPORTE.includes(c.id)
            );

            const ticketsNotificados = carregarTicketsNotificados();

            for (const [id, canalTicket] of tickets) {
                try {
                    const mensagens = await canalTicket.messages.fetch({ limit: 10 });
                    if (mensagens.size === 0) continue;
                    
                    const msgsOrdenadas = Array.from(mensagens.values()).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
                    const ultimaMsg = msgsOrdenadas[0];

                    const botJaMandouInicio = msgsOrdenadas.some(m => m.author.id === client.user.id);
                    if (!botJaMandouInicio && msgsOrdenadas.length <= 3) {
                        const saudacao = getSaudacaoDinamica();
                        await canalTicket.send(`${saudacao} Tudo bem? No que posso ajudar?`);
                        continue;
                    }

                    if (!ultimaMsg.author.bot) {
                        const botJaRespondeuRecente = msgsOrdenadas.slice(0, 2).some(m => m.author.id === client.user.id);
                        if (!botJaRespondeuRecente) {
                            if (ticketsNotificados.includes(canalTicket.id)) continue;

                            await canalTicket.sendTyping();

                            const promptSistema = `Você é o assistente virtual profissional da Community for FiveM. 
Interprete gírias e abreviações informais do usuário (como 'q', 'oq', 'n', 'ss', 'tô'). 
Assuntos principais: PrecisionFix (otimização FiveM, key de 5 dias, ativação) e dúvidas de compra/suporte.
Responda com todas as informações necessárias. Se a dúvida ultrapassar o seu atendimento automático ou o cliente insistir, inclua obrigatoriamente a palavra CHAVE_HUMANO na resposta.`;

                            const response = await ai.models.generateContent({
                                model: 'gemini-1.5-flash',
                                contents: `Mensagem do cliente: "${ultimaMsg.content}"`,
                                config: { systemInstruction: promptSistema }
                            });

                            let respostaIA = (response.text || "").trim();

                            if (respostaIA.includes("CHAVE_HUMANO") || respostaIA.length < 10) {
                                salvarTicketNotificado(canalTicket.id);
                                await canalTicket.send(`⚠️ <@${MEU_ID_USUARIO}> (.thestz), preciso da sua atenção neste atendimento aqui.`);
                                continue;
                            }

                            respostaIA = respostaIA.replace("CHAVE_HUMANO", "").trim();
                            await ultimaMsg.reply(respostaIA);
                        }
                    }
                } catch (errCanal) {}
            }
        } catch (errGlobal) {}
    }, 25 * 1000);
}

// 👋 Boas-vindas Personalizadas
