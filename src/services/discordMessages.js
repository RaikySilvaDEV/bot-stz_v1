export function dividirRespostaDiscord(texto, limite = 1800) {
    const remaining = String(texto ?? '').trim();
    if (!remaining) return [];
    const partes = [];
    let textoRestante = remaining;
    while (textoRestante.length > limite) {
        let corte = textoRestante.lastIndexOf('\n', limite);
        if (corte < Math.floor(limite * 0.55)) corte = textoRestante.lastIndexOf(' ', limite);
        if (corte < Math.floor(limite * 0.55)) corte = limite;
        partes.push(textoRestante.slice(0, corte).trim());
        textoRestante = textoRestante.slice(corte).trim();
    }
    if (textoRestante) partes.push(textoRestante);
    return partes;
}

export async function enviarRespostaDiscord(channel, text, { replyTo = null, allowedMentions = { parse: [] }, limit = 1800 } = {}) {
    const parts = dividirRespostaDiscord(text, limit);
    if (!parts.length) return [];
    const sent = [];
    sent.push(await (replyTo
        ? replyTo.reply({ content: parts[0], allowedMentions })
        : channel.send({ content: parts[0], allowedMentions })));
    for (const part of parts.slice(1)) {
        sent.push(await channel.send({ content: part, allowedMentions: { parse: [] } }));
    }
    return sent;
}
