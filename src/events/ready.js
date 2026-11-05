import { client } from '../client.js';
import { iniciarVarreduraTicketsOrfaos } from '../features/tickets.js';
import { configurarCanalVerificacao, configurarPainelParceria } from '../features/community.js';
import { iniciarAgendadorRelogio, dispararAvisosLoopHorario, verificarEnviosPendentesAoLigar } from '../features/automation.js';
client.once('clientReady', async () => {
    console.log(`🤖 Bot conectado com sucesso como: ${client.user.tag}`);
    iniciarVarreduraTicketsOrfaos();
    await configurarCanalVerificacao();
    await configurarPainelParceria();
    iniciarAgendadorRelogio();
    await dispararAvisosLoopHorario();
    await verificarEnviosPendentesAoLigar();
});

