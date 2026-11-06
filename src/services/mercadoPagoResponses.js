const RESPONSE_TTL_MS = 14 * 60 * 1000;
const responses = new Map();

export function trackMercadoPagoResponse(externalReference, webhook, confirmationMessage) {
    responses.set(externalReference, { webhook, confirmationMessage, expiresAt: Date.now() + RESPONSE_TTL_MS });
}

export async function confirmMercadoPagoResponse(externalReference) {
    const response = responses.get(externalReference);
    responses.delete(externalReference);
    if (!response || response.expiresAt <= Date.now()) return false;
    await response.webhook.editMessage('@original', { content: response.confirmationMessage });
    return true;
}
