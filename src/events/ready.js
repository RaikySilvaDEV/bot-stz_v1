import { client } from '../client.js';
import { iniciarVarreduraTicketsOrfaos } from '../features/tickets.js';
import { configurarCanalVerificacao, removerPainelParceriaAntigo } from '../features/community.js';
import { iniciarAgendadorRelogio, dispararAvisosLoopHorario, verificarEnviosPendentesAoLigar, removerAnuncioParceriaAntigo } from '../features/automation.js';
import { registrarComandos } from '../commands/deploy.js';
import { removerAnuncioFiveMAntigo } from '../features/fivemAnnouncements.js';
import { iniciarApiAnunciosFiveM } from '../api/server.js';
import { removeExpiredRemoteTranscripts, removeExpiredTranscripts } from '../services/transcripts.js';
client.once('clientReady', async () => {
    iniciarApiAnunciosFiveM();
    console.log(`🤖 Bot conectado com sucesso como: ${client.user.tag}`);
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
    iniciarVarreduraTicketsOrfaos();
    await configurarCanalVerificacao();
    await removerPainelParceriaAntigo();
    await removerAnuncioFiveMAntigo();
    await removerAnuncioParceriaAntigo();
    iniciarAgendadorRelogio();
    await dispararAvisosLoopHorario();
    await verificarEnviosPendentesAoLigar();
});

