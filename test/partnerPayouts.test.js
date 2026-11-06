import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePartnerShare } from '../src/services/partnerPayouts.js';

test('calcula comissão percentual por pedido e arredonda para centavos', () => {
    const orders = [
        { id: 'a', status: 'delivered', paidAt: '2026-11-01T00:00:00.000Z', amountCents: 1200 },
        { id: 'b', status: 'paid', paidAt: '2026-11-02T00:00:00.000Z', amountCents: 700 },
        { id: 'c', status: 'pending', amountCents: 1400 }
    ];
    assert.deepEqual(calculatePartnerShare(orders, 1500, []), {
        orderCount: 2, grossCents: 1900, totalCents: 285,
        orderShares: { a: 180, b: 105 }
    });
});

test('não inclui pedidos já reservados em repasse em aberto ou creditado', () => {
    const orders = [
        { id: 'a', status: 'paid', paidAt: '2026-11-01T00:00:00.000Z', amountCents: 10000 },
        { id: 'b', status: 'paid', paidAt: '2026-11-02T00:00:00.000Z', amountCents: 5000 }
    ];
    const payouts = [
        { status: 'pending', orderIds: ['a'] },
        { status: 'credited', orderIds: ['b'] }
    ];
    assert.deepEqual(calculatePartnerShare(orders, 1000, payouts), {
        orderCount: 0, grossCents: 0, totalCents: 0, orderShares: {}
    });
});
