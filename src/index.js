import 'dotenv/config';
import { client } from './client.js';
import { TOKEN } from './config/constants.js';
import { validateEnvironment } from './config/validateEnv.js';
import { stopAssistantProvider } from './services/assistantProvider.js';
import './features/community.js';
import './events/interactions.js';
import './events/ready.js';
validateEnvironment();
client.login(TOKEN).catch(error => {
    console.error('[startup] Não foi possível conectar ao Discord:', error.message);
    process.exitCode = 1;
});

function shutdown(signal) {
    stopAssistantProvider();
    const exitCode = signal === 'SIGINT' ? 130 : 0;
    const forceExit = setTimeout(() => process.exit(exitCode), 3000);
    forceExit.unref?.();
    Promise.resolve(client.destroy()).catch(error => {
        console.error('[shutdown] Falha ao fechar a conexão do Discord:', error.message);
    }).finally(() => {
        clearTimeout(forceExit);
        process.exit(exitCode);
    });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
