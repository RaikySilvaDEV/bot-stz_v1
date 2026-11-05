import { client } from '../client.js';
import { iniciarVarreduraTicketsOrfaos } from '../features/tickets.js';
import { configurarCanalVerificacao, removerPainelParceriaAntigo } from '../features/community.js';
import { iniciarAgendadorRelogio, dispararAvisosLoopHorario, verificarEnviosPendentesAoLigar, removerAnuncioParceriaAntigo } from '../features/automation.js';
import { registrarComandos } from '../commands/deploy.js';
client.once('clientReady', async () => {
    console.log(`🤖 Bot conectado com sucesso como: ${client.user.tag}`);
    try {
        await registrarComandos();
    } catch (error) {
        console.error('Não foi possível registrar os comandos de barra:', error);
    }
    iniciarVarreduraTicketsOrfaos();
    await configurarCanalVerificacao();
    await removerPainelParceriaAntigo();
    await removerAnuncioParceriaAntigo();
    iniciarAgendadorRelogio();
    await dispararAvisosLoopHorario();
    await verificarEnviosPendentesAoLigar();
});

