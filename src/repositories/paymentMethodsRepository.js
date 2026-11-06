import { randomUUID } from 'node:crypto';
import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE = 'metodos-pagamento.json';
const EMPTY = { methods: [], publicChannelId: null, publicMessageId: null };

export function getPaymentConfig() {
    const value = readJsonData(FILE, EMPTY);
    return {
        methods: Array.isArray(value?.methods) ? value.methods : [],
        publicChannelId: typeof value?.publicChannelId === 'string' ? value.publicChannelId : null,
        publicMessageId: typeof value?.publicMessageId === 'string' ? value.publicMessageId : null
    };
}

function save(config) {
    writeJsonData(FILE, config);
    return config;
}

export function addPaymentMethod(data) {
    const config = getPaymentConfig();
    if (config.methods.length >= 25) throw new Error('O Discord permite exibir até 25 métodos no painel. Remova um método antes de cadastrar outro.');
    if (config.methods.some(method => method.name.toLowerCase() === data.name.toLowerCase())) {
        throw new Error('Já existe um método de pagamento com esse nome.');
    }
    const now = new Date().toISOString();
    const method = { id: randomUUID(), active: true, ...data, createdAt: now, updatedAt: now };
    config.methods.push(method);
    save(config);
    return method;
}

export function updatePaymentMethod(id, data) {
    const config = getPaymentConfig();
    const method = config.methods.find(item => item.id === id);
    if (!method) return null;
    if (config.methods.some(item => item.id !== id && item.name.toLowerCase() === data.name.toLowerCase())) {
        throw new Error('Já existe um método de pagamento com esse nome.');
    }
    Object.assign(method, data, { updatedAt: new Date().toISOString() });
    save(config);
    return method;
}

export function setPaymentMethodActive(id, active) {
    const config = getPaymentConfig();
    const method = config.methods.find(item => item.id === id);
    if (!method) return null;
    method.active = active;
    method.updatedAt = new Date().toISOString();
    save(config);
    return method;
}

export function removePaymentMethod(id) {
    const config = getPaymentConfig();
    const index = config.methods.findIndex(item => item.id === id);
    if (index < 0) return null;
    const [removed] = config.methods.splice(index, 1);
    save(config);
    return removed;
}

export function savePublicPaymentPanel(channelId, messageId) {
    const config = getPaymentConfig();
    config.publicChannelId = channelId;
    config.publicMessageId = messageId;
    save(config);
}
