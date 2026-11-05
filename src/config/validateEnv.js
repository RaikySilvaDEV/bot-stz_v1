export function validateEnvironment() {
    const token = process.env.DISCORD_TOKEN?.trim();
    if (!token || token === 'cole_seu_token_do_discord_aqui') {
        throw new Error('Defina um DISCORD_TOKEN válido no arquivo .env antes de iniciar o bot.');
    }
    if (!process.env.GEMINI_API_KEY?.trim()) {
        console.warn('[config] GEMINI_API_KEY ausente: tickets continuarão disponíveis, mas o atendimento automático por IA ficará desativado.');
    }
    if (!process.env.API_KEY?.trim()) {
        console.warn('[config] API_KEY ausente: a API local para anúncios FiveM ficará desativada.');
    }
    const timezone = process.env.BOT_TIME_ZONE || 'America/Sao_Paulo';
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    } catch {
        throw new Error(`BOT_TIME_ZONE inválido: ${timezone}. Use um fuso IANA, como America/Sao_Paulo.`);
    }
}
