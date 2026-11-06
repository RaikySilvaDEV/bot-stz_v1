import { randomUUID } from 'node:crypto';
import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE = 'orders.json';

export function getOrders() {
    const value = readJsonData(FILE, []);
    return Array.isArray(value) ? value : [];
}

export function createOrder(data) {
    const orders = getOrders();
    const order = { id: randomUUID(), status: 'pending', createdAt: new Date().toISOString(), ...data };
    orders.push(order);
    writeJsonData(FILE, orders.slice(-5000));
    return order;
}

export function getOrderById(id) {
    return getOrders().find(order => order.id === id || order.id.startsWith(String(id))) ?? null;
}

export function updateOrder(id, changes) {
    const orders = getOrders();
    const order = orders.find(item => item.id === id);
    if (!order) return null;
    Object.assign(order, changes, { updatedAt: new Date().toISOString() });
    writeJsonData(FILE, orders.slice(-5000));
    return order;
}
