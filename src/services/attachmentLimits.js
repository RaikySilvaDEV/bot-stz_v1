export const BYTES_PER_MIB = 1024 * 1024;

export function getGuildAttachmentLimitBytes(premiumTier) {
    if (Number(premiumTier) >= 3) return 100 * BYTES_PER_MIB;
    if (Number(premiumTier) >= 2) return 50 * BYTES_PER_MIB;
    return 10 * BYTES_PER_MIB;
}

export function getOversizedAttachments(attachments, limitBytes) {
    return attachments.filter(attachment => attachment.size > limitBytes);
}