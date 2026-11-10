import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE = 'bot-announcements.json';
export const BOT_ANNOUNCEMENT_DEFAULTS = {
    sales: `${'{saudacao}'}\n\n🛒 **COMPRAS ONLINE DISPONÍVEIS:**\n${'{produtos}'}\n\nAbra seu carrinho no painel de compras para ver os detalhes e finalizar o pedido.\n\n@everyone`,
    partnerships: `${'{saudacao}'}\n\n🤝 **PARCERIAS • COMMUNITY FOR GOATS**\nQuer divulgar uma comunidade ou propor uma parceria? Confira as informações e fale com a nossa equipe em ${'{canal_parcerias}'}.\n\n@everyone`,
    support: `${'{saudacao}'}\n\n💬 **ATENDIMENTO E SUPORTE • COMMUNITY FOR FIVEM**\n\n⏰ **Horário de suporte humano:** das **09:00** às **21:00**.\n\n@everyone`,
    suggestions: `${'{saudacao}'}\n\n💡 **CANAL DE SUGESTÕES & IDEIAS**\nDeixe aqui suas ideias!\n\n@everyone`,
    roleNews: `# ✨ NOVIDADES NA COMMUNITY FOR FIVEM! ✨\nAtualizamos nossos cargos e vantagens!\n\n@everyone`,
    precisionInfo: `${'{saudacao}'}\n\n⚡ **BOT ONLINE • INFORMAÇÕES SOBRE O PRECISIONFIX**\n\nO bot está online.\n\n🔹 **Faça sua verificação:**\n${'{canal_verificacao}'}\n\n${'{canal_compra}'}\n\n> ⚠️ O acesso do PrecisionFix dura **5 dias**.\n\n@everyone`,
    welcomeContent: '🎉 Olá {membro}! Seja bem-vindo(a)!',
    welcomeTitle: '✨ • BEM-VINDO(A) À COMMUNITY FOR FIVEM!',
    welcomeDescription: '{saudacao} Olá {membro}, seja muito bem-vindo(a) ao nosso servidor!\n\n📋 **Próximo passo importante:**\nFaça a sua verificação aqui:\n👉 {canal_verificacao}',
    verificationTitle: '✅ • VERIFICAÇÃO DE ACESSO',
    verificationDescription: 'Bem-vindo(a) à **Community for FiveM・**!\n\nClique no botão abaixo para se verificar.',
    maintenanceTitle: 'Manutenção programada',
    maintenanceMessage: 'Estamos realizando uma manutenção. Algumas funções podem ficar temporariamente indisponíveis.',
    restrictedChannel: '⛔ **Não envie mensagens neste canal.**\n\nQuem enviar mensagens aqui poderá receber banimento. Esta medida ajuda a conter self-bots que espalham spam pelos canais do servidor para tentar infectar outros usuários.',
    wallpaper: '🖼️ **Wallpaper do Dia • Dia {dia}/105**',
    warehouse: '📦 **[Armazém {armazem}] • Item #{item}**\n\n@everyone'
};

export const BOT_ANNOUNCEMENT_LABELS = {
    sales: 'Compras online', partnerships: 'Parcerias', support: 'Atendimento e suporte', suggestions: 'Sugestões', roleNews: 'Novidades de cargos', precisionInfo: 'Informações do PrecisionFix',
    welcomeContent: 'Boas-vindas · mensagem', welcomeTitle: 'Boas-vindas · título', welcomeDescription: 'Boas-vindas · descrição',
    verificationTitle: 'Verificação · título', verificationDescription: 'Verificação · descrição',
    maintenanceTitle: 'Manutenção · título', maintenanceMessage: 'Manutenção · mensagem', restrictedChannel: 'Aviso do canal restrito',
    wallpaper: 'Wallpaper diário', warehouse: 'Publicação diária do armazém'
};

export function getBotAnnouncements() {
    const saved = readJsonData(FILE, {});
    return Object.fromEntries(Object.entries(BOT_ANNOUNCEMENT_DEFAULTS).map(([key, fallback]) => [
        key, typeof saved?.[key] === 'string' ? saved[key] : fallback
    ]));
}

export function updateBotAnnouncements(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Formato dos avisos inválido.');
    const current = getBotAnnouncements();
    const next = { ...current };
    for (const [key, value] of Object.entries(input)) {
        if (!(key in BOT_ANNOUNCEMENT_DEFAULTS)) throw new Error(`Aviso desconhecido: ${key}.`);
        if (typeof value !== 'string' || !value.trim()) throw new Error(`O texto de “${BOT_ANNOUNCEMENT_LABELS[key]}” não pode ficar vazio.`);
        const max = ['sales', 'partnerships', 'support', 'suggestions', 'roleNews', 'precisionInfo', 'restrictedChannel'].includes(key)
            ? 1900 : key.endsWith('Title') ? 100 : 1000;
        if (value.length > max) throw new Error(`“${BOT_ANNOUNCEMENT_LABELS[key]}” excede o limite de ${max} caracteres.`);
        next[key] = value.trim();
    }
    writeJsonData(FILE, next);
    return next;
}
