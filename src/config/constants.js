import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const TOKEN = process.env.DISCORD_TOKEN;
export const GUILD_ID = "1528983705673273466";
export const MEU_ID_USUARIO = "1231602226645041258"; 
export const CATEGORIA_SUPORTE_ID = "1547229848324276224";
export const CANAL_VERIFICACAO_ID = "1547204424244658216";
export const CARGO_VERIFICADO_ID = "1544411912270512209";
export const CARGO_STAFF_SUPORTE_ID = "1535261471641042964";

export const CANAL_BOAS_VINDAS_ID = "1558131861564170351";
export const CANAL_INFO_PRECISION_ID = "1558132299290386553";
export const CANAIS_IGNORADOS_SUPORTE = ["1547234823247106168", "1547234961528979476"];
export const CANAL_PAINEL_PARCERIA_ANTIGO_ID = "1547234823247106168";

// IDs de Canais de Automação / Loop
export const CANAL_COMPRAS_ONLINE_STATUS = "1552152094411329546";
export const CANAL_WALLPAPERS_ID = "1552150374746423418";
export const CANAL_FIM_WALLPAPERS_AVISO = "1547659154510844037";
export const CANAL_SUGESTAO_ID = "1549443615984586865";
export const CANAL_ANUNCIO_FIVE_M_ID = "1567699001267191859";
export const CANAL_PARCERIA_PUBLICA = "1567698999446732910";
export const CANAL_AVISOS_VENDAS_PUBLICA = "1547225755526758460";
export const CANAL_NOVIDADES_CARGOS_ID = "1552142081026301992";

// Canais específicos dos Armazéns
export const CANAL_POST_CTZ = "1535263869188972555";
export const PASTA_CTZ = path.join(__dirname, 'ModArmazem', 'ctz');
export const CANAL_POST_BOOSTERS = "1547319800529682483";
export const PASTA_BOOSTERS = path.join(__dirname, 'ModArmazem', 'ctz boosters');

export const PATHS = {
    ctz: path.join(__dirname, 'ModArmazem', 'ctz'),
    boosters: path.join(__dirname, 'ModArmazem', 'ctz boosters'),
    wallpapers: path.join(__dirname, 'Wallpapers')
};
