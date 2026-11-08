const MAX_EMBED_CHARACTERS_PER_MESSAGE = 5500;
const MAX_EMBEDS_PER_MESSAGE = 10;

function embedCharacterCount(embed) {
    const value = typeof embed?.toJSON === 'function' ? embed.toJSON() : embed ?? {};
    return (value.title?.length ?? 0)
        + (value.description?.length ?? 0)
        + (value.footer?.text?.length ?? 0)
        + (value.author?.name?.length ?? 0)
        + (value.fields ?? []).reduce((total, field) => total + (field.name?.length ?? 0) + (field.value?.length ?? 0), 0);
}

export function splitEmbeds(embeds = []) {
    const pages = [];
    let page = [];
    let size = 0;

    for (const embed of embeds) {
        const embedSize = embedCharacterCount(embed);
        if (page.length && (page.length >= MAX_EMBEDS_PER_MESSAGE || size + embedSize > MAX_EMBED_CHARACTERS_PER_MESSAGE)) {
            pages.push(page);
            page = [];
            size = 0;
        }
        page.push(embed);
        size += embedSize;
    }

    if (page.length) pages.push(page);
    return pages;
}

function filesForEmbeds(files = [], embeds = []) {
    const references = new Set(embeds.flatMap(embed => {
        const value = typeof embed?.toJSON === 'function' ? embed.toJSON() : embed ?? {};
        return [value.image?.url, value.thumbnail?.url].filter(url => url?.startsWith('attachment://'))
            .map(url => decodeURIComponent(url.slice('attachment://'.length)));
    }));
    return files.filter(file => references.has(file.name));
}

export function splitEmbedPayload(payload) {
    const pages = splitEmbeds(payload.embeds ?? []);
    if (pages.length <= 1) return [{ ...payload, embeds: pages[0] ?? [] }];

    return pages.map((embeds, index) => ({
        ...payload,
        content: index === 0 ? payload.content : undefined,
        components: index === 0 ? payload.components : [],
        files: filesForEmbeds(payload.files ?? [], embeds),
        embeds
    }));
}

export async function replyWithEmbedPages(interaction, payload) {
    const [first, ...rest] = splitEmbedPayload(payload);
    await interaction.reply(first);
    for (const page of rest) await interaction.followUp(page);
}
