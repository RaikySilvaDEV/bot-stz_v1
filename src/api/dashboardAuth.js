import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'stz_dashboard_session';
const SESSION_SECONDS = 8 * 60 * 60;
const SECRET = process.env.DASHBOARD_PASSWORD || process.env.API_KEY || '';
const LOGIN_TICKET_TTL_MS = 10 * 60 * 1000;
const loginTickets = new Map();

function signature(payload) {
    return createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function safeEqual(left, right) {
    const a = Buffer.from(String(left));
    const b = Buffer.from(String(right));
    return a.length === b.length && timingSafeEqual(a, b);
}

function cookieValue(req) {
    const cookie = req.headers.cookie ?? '';
    const pair = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`));
    return pair?.slice(COOKIE_NAME.length + 1) ?? '';
}

export function dashboardPasswordValid(value) {
    return Boolean(SECRET) && safeEqual(value ?? '', SECRET);
}

export function dashboardSessionValid(req) {
    if (!SECRET) return false;
    const value = cookieValue(req);
    const separator = value.lastIndexOf('.');
    if (separator < 1) return false;
    const payload = value.slice(0, separator);
    const suppliedSignature = value.slice(separator + 1);
    if (!safeEqual(suppliedSignature, signature(payload))) return false;
    const expiresAt = Number(payload);
    return Number.isSafeInteger(expiresAt) && expiresAt > Math.floor(Date.now() / 1000);
}

export function issueDashboardLoginTicket(userId, guildId) {
    if (!SECRET) return null;
    const now = Date.now();
    for (const [ticket, value] of loginTickets) if (value.expiresAt <= now) loginTickets.delete(ticket);
    const ticket = randomBytes(32).toString('base64url');
    loginTickets.set(ticket, { userId, guildId, expiresAt: now + LOGIN_TICKET_TTL_MS });
    return ticket;
}

export function consumeDashboardLoginTicket(ticket) {
    if (typeof ticket !== 'string') return false;
    const record = loginTickets.get(ticket);
    loginTickets.delete(ticket);
    return Boolean(record && record.expiresAt > Date.now());
}

export function dashboardLoginResponse(req) {
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    const payload = String(expiresAt);
    const secure = req.headers['x-forwarded-proto'] === 'https' || Boolean(req.socket.encrypted) ? '; Secure' : '';
    return `${COOKIE_NAME}=${payload}.${signature(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function dashboardLogoutResponse() {
    return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

export function dashboardRequestAuthorized(req) {
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    return dashboardSessionValid(req) || dashboardPasswordValid(bearer);
}

export function sameOriginRequest(req) {
    const origin = req.headers.origin;
    if (!origin || !req.headers.host) return false;
    try { return new URL(origin).host === req.headers.host; }
    catch { return false; }
}
