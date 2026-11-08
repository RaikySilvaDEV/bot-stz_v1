import { client } from '../client.js';
import { iniciarVarreduraTicketsInativos, iniciarVarreduraTicketsOrfaos } from '../features/tickets.js';
import { configurarCanalVerificacao, configurarPainelTickets, removerPainelParceriaAntigo } from '../features/community.js';
import { iniciarAgendadorRelogio, verificarEnviosPendentesAoLigar, removerAnuncioParceriaAntigo } from '../features/automation.js';
import { registrarComandos } from '../commands/deploy.js';
import { removerAnuncioFiveMAntigo } from '../features/fivemAnnouncements.js';
import { iniciarApiAnunciosFiveM } from '../api/server.js';
import { removeExpiredRemoteTranscripts, removeExpiredTranscripts } from '../services/transcripts.js';
import { configurarPainelDashboard } from '../features/dashboard.js';
import { startCommerceAutomations } from '../features/commerceAutomations.js';
import { startFeedbackRecovery } from '../features/commerceFeedback.js';
import { startMercadoPagoWebhookProcessor } from '../api/mercadoPagoWebhook.js';
import { publicarAvisoCanalRestrito } from '../features/announcementNotice.js';

async function executarEtapa(nome, tarefa) {
    try {
        await tarefa();
    } catch (error) {
        console.error(`[inicialização:${nome}] Esta etapa falhou; as demais continuarão:`, error);
    }
}

client.once('clientReady', async () => {
    iniciarApiAnunciosFiveM();
    startCommerceAutomations();
    startFeedbackRecovery();
    startMercadoPagoWebhookProcessor();
    console.log(`🤖 Bot conectado com sucesso como: ${client.user.tag}`);
    await executarEtapa('aviso do canal de anúncios', publicarAvisoCanalRestrito);
    try {
        const expired = await removeExpiredTranscripts();
        const remoteExpired = await removeExpiredRemoteTranscripts(client);
        if (expired || remoteExpired) console.log(`[tickets] Removidas ${expired} transcrição(ões) local(is) e ${remoteExpired} cópia(s) no Discord com mais de 90 dias.`);
        setInterval(async () => {
            try {
                const count = await removeExpiredTranscripts();
                const remoteCount = await removeExpiredRemoteTranscripts(client);
                if (count || remoteCount) console.log(`[tickets] Removidas ${count} transcrição(ões) local(is) e ${remoteCount} cópia(s) no Discord com mais de 90 dias.`);
            } catch (error) {
                console.error('[tickets] Falha na limpeza periódica das transcrições:', error);
            }
        }, 24 * 60 * 60 * 1000);
    } catch (error) {
        console.error('[tickets] Não foi possível aplicar a retenção das transcrições:', error);
    }
    try {
        await registrarComandos();
    } catch (error) {
        console.error('Não foi possível registrar os comandos de barra:', error);
    }
    await executarEtapa('varredura de tickets', iniciarVarreduraTicketsOrfaos);
    await executarEtapa('fechamento de tickets inativos', iniciarVarreduraTicketsInativos);
    await executarEtapa('painel de verificação', configurarCanalVerificacao);
    await executarEtapa('painel de tickets', configurarPainelTickets);
    await executarEtapa('painel antigo de parcerias', removerPainelParceriaAntigo);
    await executarEtapa('anúncio antigo FiveM', removerAnuncioFiveMAntigo);
    await executarEtapa('anúncio antigo de parcerias', removerAnuncioParceriaAntigo);
    await executarEtapa('agendador', iniciarAgendadorRelogio);
    await executarEtapa('envios pendentes', verificarEnviosPendentesAoLigar);
    await executarEtapa('painel privado do bot', configurarPainelDashboard);
});

client.on('error', error => console.error('[discord] Erro no cliente Discord:', error));
client.on('shardError', error => console.error('[discord] Falha na conexão do shard:', error));
