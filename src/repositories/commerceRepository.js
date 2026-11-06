import { readJsonData, writeJsonData } from '../data/jsonStore.js';
import { PRODUCTS } from '../config/products.js';

const FILE = 'comercio-config.json';
const AUTOMATIONS = ['mercadoPago', 'automaticDelivery', 'roleExpiration', 'paymentReminders', 'abandonedOrders', 'coupons', 'stock', 'digitalDelivery', 'salesReports', 'purchaseFeedback'];
const EMPTY = {
    automations: Object.fromEntries(AUTOMATIONS.map(key => [key, false])),
    roles: Object.fromEntries(PRODUCTS.map(product => [product.value, null])),
    deliveryMessages: Object.fromEntries(PRODUCTS.map(product => [product.value, ''])),
    deliveryLinks: Object.fromEntries(PRODUCTS.map(product => [product.value, null])),
    images: Object.fromEntries(PRODUCTS.map(product => [product.value, product.imageFile ? `asset:${product.imageFile}` : product.imageUrl ?? null])),
    productDetails: Object.fromEntries(PRODUCTS.map(product => [product.value, {
        name: product.name, description: product.description, roleName: product.roleName,
        durationDays: product.durationDays, originalPriceCents: product.originalPriceCents, active: true
    }])),
    stock: Object.fromEntries(PRODUCTS.map(product => [product.value, null])),
    customProducts: [], coupons: [], lastReportDate: null, storeChannelId: null, storeMessageId: null
};

export const COMMERCE_AUTOMATIONS = AUTOMATIONS;
export const COMMERCE_AUTOMATION_LABELS = {
    mercadoPago: 'Mercado Pago e confirmação automática', automaticDelivery: 'Liberação automática de cargos',
    roleExpiration: 'Expiração e remoção de cargos', paymentReminders: 'Lembretes de pagamento',
    abandonedOrders: 'Cancelamento de carrinhos abandonados', coupons: 'Cupons de desconto',
    stock: 'Controle de estoque e alerta de estoque baixo', digitalDelivery: 'Entrega automática de arquivos e instruções',
    salesReports: 'Relatórios diários de vendas', purchaseFeedback: 'Pesquisa de satisfação pós-compra'
};

export function getCommerceConfig() {
    const value = readJsonData(FILE, EMPTY);
    const saved = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        ...structuredClone(EMPTY), ...saved,
        automations: { ...EMPTY.automations, ...(saved.automations ?? {}) },
        roles: { ...EMPTY.roles, ...(saved.roles ?? {}) },
        deliveryMessages: { ...EMPTY.deliveryMessages, ...(saved.deliveryMessages ?? {}) },
        deliveryLinks: { ...EMPTY.deliveryLinks, ...(saved.deliveryLinks ?? {}) },
        images: { ...EMPTY.images, ...(saved.images ?? {}) },
        productDetails: { ...EMPTY.productDetails, ...(saved.productDetails ?? {}) },
        stock: { ...EMPTY.stock, ...(saved.stock ?? {}) },
        customProducts: Array.isArray(saved.customProducts) ? saved.customProducts : [],
        coupons: Array.isArray(saved.coupons) ? saved.coupons : []
    };
}

function productValues(config = getCommerceConfig()) {
    return [...PRODUCTS, ...config.customProducts].map(product => product.value);
}

export function getCommerceProducts({ includeInactive = true } = {}) {
    const config = getCommerceConfig();
    const allProducts = [...PRODUCTS, ...config.customProducts];
    return allProducts
        .map(product => ({
            ...product,
            ...(config.productDetails[product.value] ?? {}),
            imageUrl: config.images[product.value] ?? product.imageUrl ?? null,
            roleId: config.roles[product.value] ?? null,
            stock: config.stock[product.value] ?? null,
            deliveryMessage: config.deliveryMessages[product.value] ?? '',
            deliveryLink: config.deliveryLinks[product.value] ?? null,
            active: config.productDetails[product.value]?.active !== false
        }))
        .filter(product => includeInactive || product.active);
}

function productExists(productValue) {
    return productValues().includes(productValue);
}

function save(next) { writeJsonData(FILE, next); return next; }

export function setCommerceAutomation(key, active) {
    if (!AUTOMATIONS.includes(key)) throw new TypeError('Automação de loja inválida.');
    const config = getCommerceConfig();
    config.automations[key] = Boolean(active);
    save(config);
    return config;
}

export function setProductRole(productValue, roleId) {
    if (!productExists(productValue)) throw new TypeError('Produto inválido.');
    const config = getCommerceConfig();
    config.roles[productValue] = roleId || null;
    save(config);
    return config;
}

export function setProductDeliveryMessage(productValue, message) {
    if (!productExists(productValue)) throw new TypeError('Produto inválido.');
    const config = getCommerceConfig();
    config.deliveryMessages[productValue] = String(message ?? '').trim().slice(0, 1500);
    save(config);
    return config;
}

export function setProductImage(productValue, url) {
    if (!productExists(productValue)) throw new TypeError('Produto inválido.');
    const config = getCommerceConfig();
    if (!url) config.images[productValue] = null;
    else {
        let parsed;
        try { parsed = new URL(url); } catch { throw new TypeError('Informe uma URL válida para a imagem.'); }
        if (parsed.protocol !== 'https:') throw new TypeError('A URL da imagem precisa usar HTTPS.');
        config.images[productValue] = parsed.href;
    }
    save(config);
    return config.images[productValue];
}

export function resetProductImage(productValue) {
    if (!productExists(productValue)) throw new TypeError('Produto inválido.');
    const product = [...PRODUCTS, ...getCommerceConfig().customProducts].find(item => item.value === productValue);
    const config = getCommerceConfig();
    config.images[productValue] = product.imageFile ? `asset:${product.imageFile}` : product.imageUrl ?? null;
    save(config);
    return config.images[productValue];
}

export function getCommerceProduct(productValue) {
    const product = [...PRODUCTS, ...getCommerceConfig().customProducts].find(item => item.value === productValue);
    if (!product) return null;
    const config = getCommerceConfig();
    return { ...product, ...config.productDetails[productValue], imageUrl: config.images[productValue] ?? product.imageUrl ?? null,
        roleId: config.roles[productValue], stock: config.stock[productValue],
        deliveryMessage: config.deliveryMessages[productValue], deliveryLink: config.deliveryLinks[productValue],
        active: config.productDetails[productValue]?.active !== false };
}

export function setProductDetails(productValue, values) {
    if (!productExists(productValue)) throw new TypeError('Produto inválido.');
    const name = String(values.name ?? '').trim();
    const description = String(values.description ?? '').trim();
    const roleName = String(values.roleName ?? '').trim();
    const durationDays = Number(values.durationDays);
    const originalPriceCents = Number(values.originalPriceCents);
    if (!name || name.length > 80) throw new TypeError('O nome precisa ter entre 1 e 80 caracteres.');
    if (!description || description.length > 1000) throw new TypeError('A descrição precisa ter entre 1 e 1000 caracteres.');
    if (!roleName || roleName.length > 100) throw new TypeError('O nome do cargo precisa ter entre 1 e 100 caracteres.');
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) throw new TypeError('A validade precisa ser entre 1 e 3650 dias.');
    if (!Number.isSafeInteger(originalPriceCents) || originalPriceCents < 1 || originalPriceCents > 99_999_999) throw new TypeError('O preço original precisa ser entre R$ 0,01 e R$ 999.999,99.');
    const config = getCommerceConfig();
    config.productDetails[productValue] = {
        ...config.productDetails[productValue], name, description, roleName, durationDays, originalPriceCents,
        active: values.active === undefined ? config.productDetails[productValue]?.active !== false : Boolean(values.active)
    };
    save(config);
    return config.productDetails[productValue];
}

export function setProductDeliveryLink(productValue, url) {
    if (!productExists(productValue)) throw new TypeError('Produto inválido.');
    const config = getCommerceConfig();
    if (!String(url ?? '').trim()) {
        config.deliveryLinks[productValue] = null;
        save(config);
        return null;
    }
    let parsed;
    try { parsed = new URL(url); } catch { throw new TypeError('Informe um link de entrega válido.'); }
    if (parsed.protocol !== 'https:') throw new TypeError('O link de entrega precisa usar HTTPS.');
    config.deliveryLinks[productValue] = parsed.href;
    save(config);
    return config.deliveryLinks[productValue];
}

export function setProductStock(productValue, quantity) {
    if (!productExists(productValue)) throw new TypeError('Produto inválido.');
    if (quantity !== null && (!Number.isSafeInteger(quantity) || quantity < 0)) throw new TypeError('Estoque precisa ser zero ou maior.');
    const config = getCommerceConfig();
    config.stock[productValue] = quantity;
    save(config);
    return config;
}

export function createCommerceProduct(values) {
    const config = getCommerceConfig();
    const name = String(values.name ?? '').trim();
    const value = String(values.value ?? '').trim().toLowerCase();
    const description = String(values.description ?? '').trim();
    const roleName = String(values.roleName ?? '').trim();
    const durationDays = Number(values.durationDays);
    const originalPriceCents = Number(values.originalPriceCents);
    const priceCents = Number(values.priceCents);
    if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(value)) throw new TypeError('O identificador deve ter 2 a 32 caracteres: letras minúsculas, números, hífen ou _.');
    if (productValues(config).includes(value)) throw new TypeError('Já existe um produto com esse identificador.');
    if (getCommerceProducts({ includeInactive: false }).length >= 10) throw new TypeError('A vitrine suporta até 10 produtos ativos. Desative um antes de cadastrar outro.');
    if (!name || name.length > 80) throw new TypeError('O nome precisa ter entre 1 e 80 caracteres.');
    if (!description || description.length > 1000) throw new TypeError('A descrição precisa ter entre 1 e 1000 caracteres.');
    if (!roleName || roleName.length > 100) throw new TypeError('O nome do cargo precisa ter entre 1 e 100 caracteres.');
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) throw new TypeError('A validade precisa ser entre 1 e 3650 dias.');
    if (!Number.isSafeInteger(originalPriceCents) || originalPriceCents < 1 || originalPriceCents > 99_999_999 || !Number.isSafeInteger(priceCents) || priceCents < 1 || priceCents > 99_999_999) throw new TypeError('Os preços devem ser entre R$ 0,01 e R$ 999.999,99.');
    const imageUrl = String(values.imageUrl ?? '').trim();
    if (imageUrl) {
        let parsed;
        try { parsed = new URL(imageUrl); } catch { throw new TypeError('Informe uma URL válida para a imagem.'); }
        if (parsed.protocol !== 'https:') throw new TypeError('A URL da imagem precisa usar HTTPS.');
    }
    config.customProducts.push({ name, value, description, roleName, durationDays, originalPriceCents, defaultPriceCents: priceCents, emoji: String(values.emoji ?? '🛍️').trim().slice(0, 8) || '🛍️', imageFile: null });
    config.roles[value] = null;
    config.deliveryMessages[value] = '';
    config.deliveryLinks[value] = null;
    config.images[value] = imageUrl || null;
    config.productDetails[value] = { name, description, roleName, durationDays, originalPriceCents, active: true };
    config.stock[value] = null;
    save(config);
    return getCommerceProduct(value);
}

export function setProductActive(productValue, active) {
    const product = getCommerceProduct(productValue);
    if (!product) throw new TypeError('Produto inválido.');
    const config = getCommerceConfig();
    config.productDetails[productValue] = { ...config.productDetails[productValue], active: Boolean(active) };
    save(config);
    return getCommerceProduct(productValue);
}

export function removeCommerceProduct(productValue, { hasOrders = false } = {}) {
    const config = getCommerceConfig();
    const customIndex = config.customProducts.findIndex(product => product.value === productValue);
    if (customIndex < 0) {
        if (!PRODUCTS.some(product => product.value === productValue)) return false;
        setProductActive(productValue, false);
        return 'archived';
    }
    if (hasOrders) {
        setProductActive(productValue, false);
        return 'archived';
    }
    config.customProducts.splice(customIndex, 1);
    for (const section of ['roles', 'deliveryMessages', 'deliveryLinks', 'images', 'productDetails', 'stock']) delete config[section][productValue];
    save(config);
    return 'deleted';
}

export function reserveProductStock(productValue) {
    const config = getCommerceConfig();
    if (!config.automations.stock) return { ok: true, reserved: false, available: config.stock[productValue] };
    const quantity = config.stock[productValue];
    if (quantity === null || quantity === undefined) return { ok: true, reserved: false, available: null };
    if (quantity < 1) return { ok: false, reserved: false, available: 0 };
    config.stock[productValue] = quantity - 1;
    save(config);
    return { ok: true, reserved: true, available: quantity - 1 };
}

export function releaseProductStock(productValue) {
    const config = getCommerceConfig();
    const quantity = config.stock[productValue];
    if (quantity === null || quantity === undefined) return;
    config.stock[productValue] = quantity + 1;
    save(config);
}

export function releaseCoupon(code) {
    const config = getCommerceConfig();
    const coupon = config.coupons.find(item => item.code === String(code).trim().toUpperCase());
    if (!coupon || coupon.uses < 1) return false;
    coupon.uses -= 1;
    save(config);
    return true;
}

export function createCoupon({ code, percent, maxUses, expiresAt }) {
    const config = getCommerceConfig();
    const normalized = String(code).trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,24}$/.test(normalized)) throw new TypeError('Código deve ter 3 a 24 letras, números, _ ou -.');
    if (!Number.isInteger(percent) || percent < 1 || percent > 90) throw new TypeError('Desconto precisa ser entre 1% e 90%.');
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100000) throw new TypeError('Usos máximos precisa ser entre 1 e 100000.');
    if (config.coupons.some(item => item.code === normalized)) throw new Error('Já existe um cupom com esse código.');
    config.coupons.push({ code: normalized, percent, maxUses, uses: 0, expiresAt: expiresAt || null, active: true, createdAt: new Date().toISOString() });
    save(config);
    return config.coupons.at(-1);
}

export function removeCoupon(code) {
    const config = getCommerceConfig();
    const index = config.coupons.findIndex(item => item.code === String(code).trim().toUpperCase());
    if (index < 0) return false;
    config.coupons.splice(index, 1);
    save(config);
    return true;
}

export function getUsableCoupon(code) {
    if (!getCommerceConfig().automations.coupons) return null;
    const coupon = getCommerceConfig().coupons.find(item => item.code === String(code).trim().toUpperCase() && item.active);
    if (!coupon || coupon.uses >= coupon.maxUses || (coupon.expiresAt && Date.parse(coupon.expiresAt) <= Date.now())) return null;
    return coupon;
}

export function consumeCoupon(code) {
    const config = getCommerceConfig();
    const coupon = config.coupons.find(item => item.code === String(code).trim().toUpperCase());
    if (!coupon || !coupon.active || coupon.uses >= coupon.maxUses || (coupon.expiresAt && Date.parse(coupon.expiresAt) <= Date.now())) return false;
    coupon.uses += 1;
    save(config);
    return true;
}

export function saveLastCommerceReport(date) {
    const config = getCommerceConfig();
    config.lastReportDate = date;
    save(config);
}

export function saveStorefrontReference(channelId, messageId) {
    const config = getCommerceConfig();
    config.storeChannelId = channelId;
    config.storeMessageId = messageId;
    save(config);
}
