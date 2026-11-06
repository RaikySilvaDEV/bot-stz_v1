import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE = 'mercado-pago-test-payments.json';

function readPayments() {
    const payments = readJsonData(FILE, []);
    return Array.isArray(payments) ? payments : [];
}

export function createMercadoPagoTestPayment(data) {
    const payments = readPayments();
    if (payments.some(payment => payment.externalReference === data.externalReference)) {
        throw new Error('A referência deste pagamento de teste já existe.');
    }
    const payment = {
        ...data, status: 'creating', amountCents: 10,
        createdAt: new Date().toISOString()
    };
    payments.push(payment);
    writeJsonData(FILE, payments.slice(-1000));
    return payment;
}

export function setMercadoPagoTestPaymentCreated(externalReference, paymentId) {
    return updatePayment(externalReference, payment => ({
        ...payment, paymentId: String(paymentId), status: 'pending',
        updatedAt: new Date().toISOString()
    }));
}

export function failMercadoPagoTestPayment(externalReference, error) {
    return updatePayment(externalReference, payment => ({
        ...payment, status: 'failed',
        lastError: String(error?.message ?? error).slice(0, 300),
        updatedAt: new Date().toISOString()
    }));
}

export function getMercadoPagoTestPayment(externalReference) {
    return readPayments().find(payment => payment.externalReference === externalReference) ?? null;
}

export function markMercadoPagoTestPaymentDelivered(externalReference) {
    return updatePayment(externalReference, payment => ({
        ...payment, status: 'delivered', deliveredAt: new Date().toISOString()
    }));
}

function updatePayment(externalReference, transform) {
    const payments = readPayments();
    const index = payments.findIndex(payment => payment.externalReference === externalReference);
    if (index < 0) return null;
    payments[index] = transform(payments[index]);
    writeJsonData(FILE, payments);
    return payments[index];
}
