export const PRODUCTS = [
    {
        name: 'Cargo Premium', value: 'premium', channelId: '1552131842960916521',
        description: 'Acesso a mods e programas privados, com novidades e conteúdos exclusivos toda semana.',
        roleName: 'Premium (pago)', durationDays: 5, originalPriceCents: 1700, defaultPriceCents: 1200,
        emoji: '🌙', imageFile: 'premium.jpg'
    },
    {
        name: 'Cargo Booster', value: 'cargo_booster', channelId: '1552131921801256961',
        description: 'Apoie a comunidade e receba acesso aos mods privados de Citizens e Sons.',
        roleName: 'Server Booster (pago)', durationDays: 5, originalPriceCents: 1300, defaultPriceCents: 700,
        emoji: '🚀', imageFile: 'booster.jpg'
    },
    {
        name: 'Booster + Premium', value: 'booster_premium', channelId: '1552727902930346167',
        description: 'Dois benefícios em um: acesso aos conteúdos Premium e Booster por um preço especial.',
        roleName: 'Premium Booster (pago)', durationDays: 5, originalPriceCents: 3500, defaultPriceCents: 1400,
        emoji: '✨', imageFile: 'booster.jpg'
    }
];

export function getProductByValue(value) {
    return PRODUCTS.find(product => product.value === value) ?? null;
}
