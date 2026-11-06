import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    addPaymentMethod, getPaymentConfig, removePaymentMethod, setPaymentMethodActive, updatePaymentMethod
} from '../repositories/paymentMethodsRepository.js';
import { normalizePixKey } from '../services/pix.js';
import { getSettings, updateSettings } from '../repositories/settingsRepository.js';
import { getDashboardDetails } from '../features/dashboard.js';
import { updatePublicStatusIfConfigured } from '../features/payments.js';
import { client } from '../client.js';
import { GUILD_ID } from '../config/constants.js';
import {
    COMMERCE_AUTOMATIONS, createCommerceProduct, getCommerceConfig, getCommerceProduct, getCommerceProducts,
    removeCommerceProduct, setCommerceAutomation, setProductActive,
    setProductDeliveryLink, setProductDeliveryMessage, setProductDetails,
    setProductImage, resetProductImage, setProductRole, setProductStock, createCoupon, removeCoupon,
    saveStorefrontReference
} from '../repositories/commerceRepository.js';
import { getProductPriceCents, removeProductPrice, setProductPriceCents } from '../repositories/productCatalogRepository.js';
import { getOrders, getOrderById } from '../repositories/orderRepository.js';
import { getFeedback } from '../repositories/feedbackRepository.js';
import { handlePaidOrder } from '../features/commerceAutomations.js';
import { publicarVitrineLoja } from '../features/commerce.js';
import { mercadoPagoConfigReady } from '../services/mercadoPago.js';
import { getMercadoPagoSettingsStatus, saveMercadoPagoSettings } from '../services/mercadoPagoSettings.js';
import { registrarComandos } from '../commands/deploy.js';
import {
    dashboardLoginResponse, dashboardLogoutResponse, dashboardPasswordValid,
    dashboardRequestAuthorized, dashboardSessionValid, sameOriginRequest,
    consumeDashboardLoginTicket
} from './dashboardAuth.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const AUTOMATIONS = new Set(['announcements', 'wallpapers', 'stock', 'aiResponses']);
const PAGE_FILES = {
    '/painel/app.js': ['app.js', 'text/javascript; charset=utf-8'],
    '/painel/style.css': ['style.css', 'text/css; charset=utf-8']
};

function responder(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(data));
}

function sendPageFile(res, filename, contentType) {
    try {
        const body = fs.readFileSync(path.join(PUBLIC_DIR, filename));
        res.writeHead(200, {
            'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
            'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
        });
        res.end(body);
    } catch (error) {
        console.error('[painel-web] Não foi possível abrir os arquivos da página:', error);
        responder(res, 500, { erro: 'Arquivos do painel web indisponíveis.' });
    }
}

function sendStoreImage(res, filename) {
    const allowed = new Set(getCommerceProducts().map(product => product.imageFile).filter(Boolean));
    if (!allowed.has(filename) || path.basename(filename) !== filename) return responder(res, 404, { erro: 'Imagem não encontrada.' });
    try {
        const image = fs.readFileSync(path.join(process.cwd(), 'assets', 'store', filename));
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
        res.end(image);
    } catch { responder(res, 404, { erro: 'Imagem não encontrada.' }); }
}

function safeOrder(order) {
    return {
        id: order.id, buyerId: order.buyerId, productValue: order.productValue,
        productName: order.productName, amountCents: order.amountCents, status: order.status,
        paymentMethodName: order.paymentMethodName, provider: order.provider ?? 'manual',
        createdAt: order.createdAt, paidAt: order.paidAt ?? null,
        entitlementExpiresAt: order.entitlementExpiresAt ?? null,
        deliveryError: order.deliveryError ?? null
    };
}

function commerceSnapshot() {
    const config = getCommerceConfig();
    return {
        automations: config.automations,
        mercadoPagoReady: mercadoPagoConfigReady(),
        products: getCommerceProducts().map(product => {
            const isBundledImage = typeof product.imageUrl === 'string' && product.imageUrl.startsWith('asset:');
            const filename = isBundledImage ? path.basename(product.imageUrl.slice('asset:'.length)) : null;
            return {
                ...product, image: isBundledImage ? `/painel/store-images/${filename}` : product.imageUrl,
                customImageUrl: isBundledImage ? '' : product.imageUrl ?? '',
                priceCents: getProductPriceCents(product.value), stockLimited: config.stock[product.value] !== null,
                roleId: config.roles[product.value], stock: config.stock[product.value],
                deliveryMessage: config.deliveryMessages[product.value] ?? '', deliveryLink: config.deliveryLinks[product.value] ?? ''
            };
        }),
        coupons: config.coupons,
        orders: getOrders().slice(-100).reverse().map(safeOrder),
        feedback: getFeedback().slice(-50).reverse(),
        storefront: { channelId: config.storeChannelId, messageId: config.storeMessageId }
    };
}

function validatePaymentMethod(body, current = null) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('Envie um objeto JSON válido.'), { status: 400 });
    const type = body.type ?? current?.type;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : '';
    if (!['pix_manual', 'payment_link'].includes(type)) throw Object.assign(new Error('Tipo de pagamento inválido.'), { status: 400 });
    if (!name || name.length > 70) throw Object.assign(new Error('O nome deve ter entre 1 e 70 caracteres.'), { status: 400 });
    if (instructions.length > 300) throw Object.assign(new Error('As instruções podem ter até 300 caracteres.'), { status: 400 });
    if (type === 'pix_manual') {
        const pixKey = typeof body.pixKey === 'string' && body.pixKey.trim() ? body.pixKey.trim() : current?.pixKey;
        const pixKeyType = body.pixKeyType ?? current?.pixKeyType ?? 'auto';
        const receiverName = typeof body.receiverName === 'string' && body.receiverName.trim() ? body.receiverName.trim() : current?.receiverName ?? '';
        const city = typeof body.city === 'string' && body.city.trim() ? body.city.trim() : current?.city ?? '';
        let normalizedKey;
        try { normalizedKey = normalizePixKey(pixKey, pixKeyType); }
        catch (error) { throw Object.assign(error, { status: 400 }); }
        if (!receiverName || receiverName.length > 25) throw Object.assign(new Error('O nome do recebedor deve ter até 25 caracteres.'), { status: 400 });
        if (!city || city.length > 15) throw Object.assign(new Error('A cidade do recebedor deve ter até 15 caracteres.'), { status: 400 });
        return { type, name, pixKey: normalizedKey, pixKeyType, receiverName, city, instructions };
    }
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : current?.url;
    let url;
    try { url = new URL(rawUrl); } catch { throw Object.assign(new Error('Informe um link de pagamento válido.'), { status: 400 }); }
    if (url.protocol !== 'https:') throw Object.assign(new Error('O link de pagamento precisa usar HTTPS.'), { status: 400 });
    return { type, name, url: url.href, instructions };
}

async function syncPaymentStatus() {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) await updatePublicStatusIfConfigured(guild);
}

function hideSensitiveMethodFields(config) {
    return { ...config, methods: config.methods.map(({ pixKey, ...method }) => ({ ...method, pixKeyConfigured: Boolean(pixKey) })) };
}

async function roleCanBeDelivered(roleId) {
    if (!roleId) return true;
    const guild = client.guilds.cache.get(GUILD_ID);
    const role = await guild?.roles.fetch(roleId).catch(() => null);
    const bot = guild?.members.me;
    return Boolean(role && !role.managed && bot && bot.roles.highest.comparePositionTo(role) > 0);
}

async function refreshStorefrontAndCommands() {
    await registrarComandos().catch(error => console.warn('[painel-web] Catálogo salvo, mas os comandos não foram sincronizados:', error.message));
    const config = getCommerceConfig();
    if (!config.storeMessageId) return;
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) await publicarVitrineLoja(guild).catch(error => console.warn('[painel-web] Catálogo salvo, mas a vitrine Discord não atualizou:', error.message));
}

export async function handleDashboardRoute(req, res, url, readJson) {
    const pathname = url.pathname;
    if (req.method === 'GET' && (pathname === '/painel' || pathname === '/painel/')) {
        sendPageFile(res, 'dashboard.html', 'text/html; charset=utf-8');
        return true;
    }
    if (req.method === 'GET' && PAGE_FILES[pathname]) {
        const [filename, contentType] = PAGE_FILES[pathname];
        sendPageFile(res, filename, contentType);
        return true;
    }
    const storeImageMatch = pathname.match(/^\/painel\/store-images\/([^/]+)$/);
    if (req.method === 'GET' && storeImageMatch) {
        sendStoreImage(res, decodeURIComponent(storeImageMatch[1]));
        return true;
    }

    if (pathname === '/api/painel/login' && req.method === 'POST') {
        if (!sameOriginRequest(req)) return responder(res, 403, { erro: 'Origem da solicitação inválida.' }), true;
        const body = await readJson(req);
        if (!dashboardPasswordValid(body?.password)) return responder(res, 401, { erro: 'Chave de acesso incorreta.' }), true;
        res.setHeader('Set-Cookie', dashboardLoginResponse(req));
        responder(res, 200, { ok: true });
        return true;
    }
    if (pathname === '/api/painel/login-ticket' && req.method === 'POST') {
        if (!sameOriginRequest(req)) return responder(res, 403, { erro: 'Origem da solicitação inválida.' }), true;
        const body = await readJson(req);
        if (!consumeDashboardLoginTicket(body?.ticket)) return responder(res, 401, { erro: 'Este acesso expirou ou já foi utilizado. Atualize o painel no Discord e clique novamente.' }), true;
        res.setHeader('Set-Cookie', dashboardLoginResponse(req));
        responder(res, 200, { ok: true });
        return true;
    }
    if (pathname === '/api/painel/logout' && req.method === 'POST') {
        if (!sameOriginRequest(req)) return responder(res, 403, { erro: 'Origem da solicitação inválida.' }), true;
        if (!dashboardSessionValid(req)) return responder(res, 401, { erro: 'Sessão encerrada.' }), true;
        res.setHeader('Set-Cookie', dashboardLogoutResponse());
        responder(res, 200, { ok: true });
        return true;
    }
    if (!pathname.startsWith('/api/painel/')) return false;
    if (!dashboardRequestAuthorized(req)) return responder(res, 401, { erro: 'Entre no painel para continuar.' }), true;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !sameOriginRequest(req)) {
        return responder(res, 403, { erro: 'Origem da solicitação inválida.' }), true;
    }

    try {
        if (pathname === '/api/painel/status' && req.method === 'GET') {
            return responder(res, 200, await getDashboardDetails()), true;
        }
        if (pathname === '/api/painel/commerce' && req.method === 'GET') {
            return responder(res, 200, commerceSnapshot()), true;
        }
        if (pathname === '/api/painel/commerce/storefront' && req.method === 'PUT') {
            const body = await readJson(req);
            const guild = client.guilds.cache.get(GUILD_ID);
            const channel = typeof body?.channelId === 'string' ? await guild?.channels.fetch(body.channelId).catch(() => null) : null;
            if (!channel || ![0, 5].includes(channel.type)) return responder(res, 400, { erro: 'Selecione um canal de texto válido.' }), true;
            saveStorefrontReference(channel.id, null);
            const result = await publicarVitrineLoja(guild);
            return responder(res, 200, { commerce: commerceSnapshot(), channel: { id: result.channel.id, name: result.channel.name }, messageId: result.message.id }), true;
        }
        if (pathname === '/api/painel/config' && req.method === 'GET') {
            const guild = client.guilds.cache.get(GUILD_ID);
            if (!guild) return responder(res, 503, { erro: 'Servidor Discord indisponível.' }), true;
            const settings = getSettings();
            const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
            return responder(res, 200, {
                timezone: settings.timezone, announcementHours: settings.announcementHours,
                everyoneMentions: settings.everyoneMentions, channels: settings.channels,
                availableChannels: [...channels.values()].filter(channel => channel && ([0, 5].includes(channel.type) || channel.type === 4))
                    .map(channel => ({ id: channel.id, name: channel.name, type: channel.type === 4 ? 'category' : 'text' }))
                    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
            }), true;
        }
        if (pathname === '/api/painel/config' && req.method === 'PUT') {
            const body = await readJson(req);
            const update = {};
            if (body?.timezone !== undefined) {
                if (typeof body.timezone !== 'string' || body.timezone.length > 80) return responder(res, 400, { erro: 'Fuso horário inválido.' }), true;
                try { new Intl.DateTimeFormat('pt-BR', { timeZone: body.timezone }); } catch { return responder(res, 400, { erro: 'Use um fuso IANA válido, por exemplo America/Sao_Paulo.' }), true; }
                update.timezone = body.timezone;
            }
            if (body?.announcementHours !== undefined) {
                if (!Array.isArray(body.announcementHours) || body.announcementHours.length < 1 || body.announcementHours.length > 24 || body.announcementHours.some(hour => !Number.isInteger(hour) || hour < 0 || hour > 23)) return responder(res, 400, { erro: 'Informe horários inteiros de 0 a 23.' }), true;
                update.announcementHours = [...new Set(body.announcementHours)].sort((a, b) => a - b);
            }
            if (body?.everyoneMentions !== undefined) {
                if (typeof body.everyoneMentions !== 'boolean') return responder(res, 400, { erro: 'everyoneMentions precisa ser verdadeiro ou falso.' }), true;
                update.everyoneMentions = body.everyoneMentions;
            }
            if (body?.channels !== undefined) {
                if (!body.channels || typeof body.channels !== 'object' || Array.isArray(body.channels)) return responder(res, 400, { erro: 'Canais inválidos.' }), true;
                const guild = client.guilds.cache.get(GUILD_ID);
                const channels = await guild?.channels.fetch().catch(() => null);
                if (!channels) return responder(res, 503, { erro: 'Servidor Discord indisponível.' }), true;
                const current = getSettings().channels;
                const next = {};
                for (const [key, id] of Object.entries(body.channels)) {
                    if (!(key in current)) return responder(res, 400, { erro: `Configuração de canal desconhecida: ${key}.` }), true;
                    if (id === null || id === '') { next[key] = null; continue; }
                    if (typeof id !== 'string') return responder(res, 400, { erro: `Canal inválido em ${key}.` }), true;
                    const channel = channels.get(id);
                    const valid = key === 'supportCategory' ? channel?.type === 4 : [0, 5].includes(channel?.type);
                    if (!valid) return responder(res, 400, { erro: `Selecione um canal compatível para ${key}.` }), true;
                    next[key] = id;
                }
                update.channels = next;
            }
            const settings = updateSettings(update);
            return responder(res, 200, { timezone: settings.timezone, announcementHours: settings.announcementHours, everyoneMentions: settings.everyoneMentions, channels: settings.channels }), true;
        }
        if (pathname === '/api/painel/roles' && req.method === 'GET') {
            const guild = client.guilds.cache.get(GUILD_ID);
            if (!guild) return responder(res, 503, { erro: 'Servidor Discord indisponível.' }), true;
            await guild.roles.fetch().catch(() => null);
            const bot = guild.members.me;
            const roles = guild.roles.cache.filter(role => role.id !== guild.id && !role.managed && bot?.roles.highest.comparePositionTo(role) > 0)
                .map(role => ({ id: role.id, name: role.name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
            return responder(res, 200, { roles }), true;
        }
        if (pathname === '/api/painel/commerce/products' && req.method === 'POST') {
            const body = await readJson(req);
            const roleId = typeof body?.roleId === 'string' && body.roleId ? body.roleId : null;
            if (!roleId) return responder(res, 400, { erro: 'Selecione o cargo do Discord que será entregue automaticamente após o pagamento.' }), true;
            if (!(await roleCanBeDelivered(roleId))) return responder(res, 400, { erro: 'Cargo inválido, gerenciado ou acima do cargo do bot. Mova o cargo para baixo do cargo do bot.' }), true;
            const priceCents = Number(body?.priceCents);
            const originalPriceCents = Number(body?.originalPriceCents);
            const stock = body?.stock === null || body?.stock === '' || body?.stock === undefined ? null : Number(body.stock);
            if (stock !== null && (!Number.isSafeInteger(stock) || stock < 0 || stock > 100000)) return responder(res, 400, { erro: 'Estoque precisa ser ilimitado ou entre 0 e 100000.' }), true;
            const deliveryLink = String(body?.deliveryLink ?? '').trim();
            if (deliveryLink) {
                let parsed;
                try { parsed = new URL(deliveryLink); } catch { return responder(res, 400, { erro: 'Link de entrega inválido.' }), true; }
                if (parsed.protocol !== 'https:') return responder(res, 400, { erro: 'Link de entrega precisa usar HTTPS.' }), true;
            }
            const product = createCommerceProduct({ ...body, priceCents, originalPriceCents });
            setProductPriceCents(product.value, priceCents);
            setProductRole(product.value, roleId);
            setProductStock(product.value, stock);
            setProductDeliveryMessage(product.value, body?.deliveryMessage ?? '');
            setProductDeliveryLink(product.value, deliveryLink);
            await refreshStorefrontAndCommands();
            return responder(res, 201, commerceSnapshot()), true;
        }
        const productMatch = pathname.match(/^\/api\/painel\/commerce\/products\/([^/]+)$/);
        if (productMatch && req.method === 'PUT') {
            const value = decodeURIComponent(productMatch[1]);
            const product = getCommerceProduct(value);
            if (!product) return responder(res, 404, { erro: 'Produto não encontrado.' }), true;
            const body = await readJson(req);
            const stock = body?.stock === null || body?.stock === '' ? null : Number(body?.stock);
            const priceCents = Number(body?.priceCents);
            if (!Number.isSafeInteger(priceCents) || priceCents < 1 || priceCents > 99_999_999) return responder(res, 400, { erro: 'Preço promocional inválido.' }), true;
            if (stock !== null && (!Number.isSafeInteger(stock) || stock < 0 || stock > 100000)) return responder(res, 400, { erro: 'Estoque precisa ser ilimitado ou entre 0 e 100000.' }), true;
            const roleId = typeof body?.roleId === 'string' && body.roleId ? body.roleId : null;
            if (!roleId) return responder(res, 400, { erro: 'Selecione o cargo do Discord que será entregue automaticamente após o pagamento.' }), true;
            if (!(await roleCanBeDelivered(roleId))) return responder(res, 400, { erro: 'Cargo inválido, gerenciado ou acima do cargo do bot. Mova o cargo para baixo do cargo do bot.' }), true;
            const imageUrl = String(body?.customImageUrl ?? '').trim();
            if (body?.imageMode !== 'builtin' && imageUrl) {
                let parsed;
                try { parsed = new URL(imageUrl); } catch { return responder(res, 400, { erro: 'URL da imagem inválida.' }), true; }
                if (parsed.protocol !== 'https:') return responder(res, 400, { erro: 'A imagem precisa usar HTTPS.' }), true;
            }
            const deliveryLink = String(body?.deliveryLink ?? '').trim();
            if (deliveryLink) {
                let parsed;
                try { parsed = new URL(deliveryLink); } catch { return responder(res, 400, { erro: 'Link de entrega inválido.' }), true; }
                if (parsed.protocol !== 'https:') return responder(res, 400, { erro: 'O link de entrega precisa usar HTTPS.' }), true;
            }
            setProductDetails(value, body);
            setProductPriceCents(value, priceCents);
            setProductStock(value, stock);
            setProductRole(value, roleId);
            setProductDeliveryMessage(value, body?.deliveryMessage ?? '');
            setProductDeliveryLink(value, body?.deliveryLink ?? '');
            if (body?.imageMode === 'builtin' || !imageUrl) resetProductImage(value);
            else setProductImage(value, imageUrl);
            const config = getCommerceConfig();
            if (body.active !== undefined) setProductActive(value, body.active);
            if (config.storeMessageId || body.active !== undefined) await refreshStorefrontAndCommands();
            return responder(res, 200, commerceSnapshot()), true;
        }
        if (productMatch && req.method === 'PATCH') {
            const value = decodeURIComponent(productMatch[1]);
            const product = getCommerceProduct(value);
            if (!product) return responder(res, 404, { erro: 'Produto não encontrado.' }), true;
            const body = await readJson(req);
            if (typeof body?.active !== 'boolean') return responder(res, 400, { erro: 'Informe active como verdadeiro ou falso.' }), true;
            if (body.active && getCommerceProducts({ includeInactive: false }).length >= 10) return responder(res, 400, { erro: 'A vitrine suporta até 10 produtos ativos.' }), true;
            setProductActive(value, body.active);
            await refreshStorefrontAndCommands();
            return responder(res, 200, commerceSnapshot()), true;
        }
        if (productMatch && req.method === 'DELETE') {
            const value = decodeURIComponent(productMatch[1]);
            const product = getCommerceProduct(value);
            if (!product) return responder(res, 404, { erro: 'Produto não encontrado.' }), true;
            const hasOrders = getOrders().some(order => order.productValue === value);
            const result = removeCommerceProduct(value, { hasOrders });
            if (result === 'deleted') removeProductPrice(value);
            await refreshStorefrontAndCommands();
            return responder(res, 200, { ...commerceSnapshot(), removal: result, removedProduct: product.name }), true;
        }
        if (pathname === '/api/painel/commerce/coupons' && req.method === 'POST') {
            const body = await readJson(req);
            const expiresAt = body?.expiresAt ? new Date(body.expiresAt).toISOString() : null;
            createCoupon({ code: body?.code, percent: Number(body?.percent), maxUses: Number(body?.maxUses), expiresAt });
            return responder(res, 201, commerceSnapshot()), true;
        }
        const couponMatch = pathname.match(/^\/api\/painel\/commerce\/coupons\/([^/]+)$/);
        if (couponMatch && req.method === 'DELETE') {
            const removed = removeCoupon(decodeURIComponent(couponMatch[1]));
            if (!removed) return responder(res, 404, { erro: 'Cupom não encontrado.' }), true;
            return responder(res, 200, commerceSnapshot()), true;
        }
        const orderMatch = pathname.match(/^\/api\/painel\/commerce\/orders\/([^/]+)$/);
        if (orderMatch && req.method === 'PATCH') {
            const order = getOrderById(decodeURIComponent(orderMatch[1]));
            if (!order || order.guildId !== GUILD_ID) return responder(res, 404, { erro: 'Pedido não encontrado.' }), true;
            const body = await readJson(req);
            if (body?.action === 'approve' && order.paidAt) return responder(res, 409, { erro: 'Este pedido já está marcado como pago.' }), true;
            if (!['approve', 'deliver'].includes(body?.action)) return responder(res, 400, { erro: 'Ação inválida.' }), true;
            const result = body.action === 'approve'
                ? await handlePaidOrder(order.id, { status: 'approved', manual: true })
                : await handlePaidOrder(order.id, { status: 'approved', manual: true }, { forceDelivery: true });
            if (!result.ok) return responder(res, 400, { erro: result.reason }), true;
            return responder(res, 200, { order: safeOrder(result.order), commerce: commerceSnapshot() }), true;
        }
        if (pathname === '/api/painel/payments' && req.method === 'GET') {
            return responder(res, 200, hideSensitiveMethodFields(getPaymentConfig())), true;
        }
        if (pathname === '/api/painel/payments/mercado-pago' && req.method === 'GET') {
            return responder(res, 200, {
                ...getMercadoPagoSettingsStatus(),
                automationActive: getCommerceConfig().automations.mercadoPago
            }), true;
        }
        if (pathname === '/api/painel/payments/mercado-pago' && req.method === 'PUT') {
            const body = await readJson(req);
            if (body?.clearAccessToken !== undefined && typeof body.clearAccessToken !== 'boolean' ||
                body?.clearWebhookSecret !== undefined && typeof body.clearWebhookSecret !== 'boolean' ||
                body?.clearWebhookUrl !== undefined && typeof body.clearWebhookUrl !== 'boolean') {
                return responder(res, 400, { erro: 'Opção para remover credencial inválida.' }), true;
            }
            const status = saveMercadoPagoSettings(body);
            return responder(res, 200, {
                ...status,
                automationActive: getCommerceConfig().automations.mercadoPago
            }), true;
        }
        if (pathname === '/api/painel/payments' && req.method === 'POST') {
            const method = addPaymentMethod(validatePaymentMethod(await readJson(req)));
            await syncPaymentStatus();
            return responder(res, 201, hideSensitiveMethodFields({ methods: [method] }).methods[0]), true;
        }
        const methodMatch = pathname.match(/^\/api\/painel\/payments\/([^/]+)$/);
        if (methodMatch && req.method === 'PUT') {
            const id = decodeURIComponent(methodMatch[1]);
            const current = getPaymentConfig().methods.find(item => item.id === id);
            if (!current) return responder(res, 404, { erro: 'Método de pagamento não encontrado.' }), true;
            const method = updatePaymentMethod(id, validatePaymentMethod(await readJson(req), current));
            await syncPaymentStatus();
            return responder(res, 200, hideSensitiveMethodFields({ methods: [method] }).methods[0]), true;
        }
        if (methodMatch && req.method === 'PATCH') {
            const body = await readJson(req);
            if (typeof body?.active !== 'boolean') return responder(res, 400, { erro: 'Informe active como verdadeiro ou falso.' }), true;
            const method = setPaymentMethodActive(decodeURIComponent(methodMatch[1]), body.active);
            if (!method) return responder(res, 404, { erro: 'Método de pagamento não encontrado.' }), true;
            await syncPaymentStatus();
            return responder(res, 200, hideSensitiveMethodFields({ methods: [method] }).methods[0]), true;
        }
        if (methodMatch && req.method === 'DELETE') {
            const method = removePaymentMethod(decodeURIComponent(methodMatch[1]));
            if (!method) return responder(res, 404, { erro: 'Método de pagamento não encontrado.' }), true;
            await syncPaymentStatus();
            return responder(res, 200, { ok: true }), true;
        }
        const automationMatch = pathname.match(/^\/api\/painel\/automations\/([a-zA-Z_]+)$/);
        if (automationMatch && req.method === 'PATCH') {
            const key = automationMatch[1];
            const body = await readJson(req);
            if (typeof body?.active !== 'boolean') return responder(res, 400, { erro: 'Automação ou estado inválido.' }), true;
            if (key.startsWith('store_')) {
                const commerceKey = key.slice('store_'.length);
                if (!COMMERCE_AUTOMATIONS.includes(commerceKey)) return responder(res, 400, { erro: 'Automação de loja inválida.' }), true;
                const commerce = getCommerceConfig();
                if (body.active && commerceKey === 'mercadoPago' && !mercadoPagoConfigReady()) return responder(res, 400, { erro: 'Configure as credenciais e a URL HTTPS do webhook primeiro.' }), true;
                if (body.active && commerceKey === 'automaticDelivery' && getCommerceProducts({ includeInactive: false }).some(product => !commerce.roles[product.value])) return responder(res, 400, { erro: 'Configure os cargos dos produtos antes de ativar a entrega.' }), true;
                setCommerceAutomation(commerceKey, body.active);
                return responder(res, 200, { ok: true, commerce: getCommerceConfig().automations }), true;
            }
            if (!AUTOMATIONS.has(key)) return responder(res, 400, { erro: 'Automação inválida.' }), true;
            updateSettings({ automations: { [key]: body.active } });
            return responder(res, 200, { ok: true, settings: getSettings().automations }), true;
        }
        return responder(res, 404, { erro: 'Rota do painel não encontrada.' }), true;
    } catch (error) {
        const status = error.status ?? (error instanceof TypeError ? 400 : 500);
        console.error('[painel-web] Falha ao executar operação do painel:', error.message);
        return responder(res, status, { erro: error.message || 'Falha ao processar a solicitação.' }), true;
    }
}
