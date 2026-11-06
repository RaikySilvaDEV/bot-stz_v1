import { BOT_ADMIN_ROLE_IDS, BOT_DEVELOPER_IDS } from '../config/constants.js';

export function isServerManager(interaction) {
    if (BOT_DEVELOPER_IDS.includes(interaction.user.id) || interaction.user.id === interaction.guild?.ownerId) return true;
    const memberRoles = interaction.member?.roles;
    const roleIds = memberRoles?.cache ? [...memberRoles.cache.keys()] : Array.isArray(memberRoles) ? memberRoles : [];
    return BOT_ADMIN_ROLE_IDS.some(roleId => roleIds.includes(roleId));
}
