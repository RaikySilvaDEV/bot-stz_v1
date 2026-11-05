import 'dotenv/config';
import { client } from './client.js';
import { TOKEN } from './config/constants.js';
import './features/community.js';
import './events/interactions.js';
import './events/ready.js';
client.login(TOKEN);
