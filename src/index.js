import 'dotenv/config';
import { client } from './client.js';
import { TOKEN } from './config/constants.js';
import { validateEnvironment } from './config/validateEnv.js';
import './features/community.js';
import './events/interactions.js';
import './events/announcementModeration.js';
import './events/ready.js';
validateEnvironment();
client.login(TOKEN).catch(error => {
    console.error('[startup] Não foi possível conectar ao Discord:', error.message);
    process.exitCode = 1;
});
