import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const TOKEN = process.env.DISCORD_TOKEN;
export const GUILD_ID = "1528983705673273466";
export const MEU_ID_USUARIO = "1231602226645041258"; 
export const BOT_DEVELOPER_IDS = [...new Set([
    MEU_ID_USUARIO,
    ...(process.env.BOT_DEVELOPER_IDS ?? '').split(',').map(id => id.trim())
].filter(id => /^\d{17,20}$/.test(id)))];
export const IDS_EQUIPE_TICKETS = new Set([
    '766524316182511647', // Desenvolvedor
    '1231602226645041258', // Sócio
    ...BOT_DEVELOPER_IDS
]);
export const BOT_ADMIN_ROLE_IDS = [...new Set(
    (process.env.BOT_ADMIN_ROLE_IDS ?? '').split(',').map(id => id.trim()).filter(id => /^\d{17,20}$/.test(id))
)];
export const CATEGORIA_SUPORTE_ID = "1547229848324276224";
export const CANAL_VERIFICACAO_ID = "1547204424244658216";
export const CARGO_VERIFICADO_ID = "1544411912270512209";
export const CARGO_STAFF_SUPORTE_ID = "1535261471641042964";

export const CANAL_BOAS_VINDAS_ID = "1558131861564170351";
export const CANAL_INFO_PRECISION_ID = "1558132299290386553";
export const CANAL_PAINEL_PARCERIA_ANTIGO_ID = "1547234823247106168";
export const CANAL_ABRIR_TICKET_ID = "1547234961528979476";
export const CANAIS_IGNORADOS_SUPORTE = [CANAL_PAINEL_PARCERIA_ANTIGO_ID, CANAL_ABRIR_TICKET_ID];

// IDs de Canais de Automação / Loop
export const CANAL_COMPRAS_ONLINE_STATUS = "1552152094411329546";
export const CANAL_WALLPAPERS_ID = "1552150374746423418";
export const CANAL_SUGESTAO_ID = "1549443615984586865";
export const CANAL_AVALIACOES_CLIENTES_ID = "1549410077608378418";
export const CANAL_ANUNCIO_FIVE_M_ID = "1567754498837839924";
export const CANAL_ARMADILHA_ID = "1546921143158571059";
export const CANAL_PARCERIA_PUBLICA = "1567698999446732910";
export const CANAL_LOGS_ADMIN_ID = "1546490624469901442";
export const CANAL_AVISOS_VENDAS_PUBLICA = "1547225755526758460";
export const CANAL_NOVIDADES_CARGOS_ID = "1552142081026301992";

// Canais específicos dos Armazéns
export const CANAL_POST_CTZ = "1535263869188972555";
export const CANAL_POST_BOOSTERS = "1547319800529682483";

export const PATHS = {
    ctz: path.join(__dirname, 'ModArmazem', 'ctz'),
    boosters: path.join(__dirname, 'ModArmazem', 'ctz boosters'),
    wallpapers: path.join(__dirname, 'Wallpapers'),
    storeImages: path.join(__dirname, 'assets', 'store'),
    welcomeImage: path.join(__dirname, 'assets', 'welcome', 'Bem-Vindo.png'),
    greetingImages: path.join(__dirname, 'assets', 'greetings')
};
