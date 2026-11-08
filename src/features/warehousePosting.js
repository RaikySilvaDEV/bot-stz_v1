export function findExistingWarehousePost(messages, { authorId, content, dateKey, getDateKey }) {
    for (const message of messages) {
        if (message.author?.id !== authorId || message.content !== content) continue;
        if (getDateKey(message.createdAt) === dateKey) return message;
    }
    return null;
}