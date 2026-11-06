import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPixPayload, normalizePixKey } from '../src/services/pix.js';

test('normaliza chave de e-mail e telefone Pix', () => {
    assert.equal(normalizePixKey(' cliente@example.com ', 'email'), 'cliente@example.com');
    assert.equal(normalizePixKey('(11) 91234-5678', 'phone'), '+5511912345678');
});

test('rejeita chaves Pix incompatíveis com o tipo', () => {
    assert.throws(() => normalizePixKey('abc', 'cpf'), /CPF/);
    assert.throws(() => normalizePixKey('não-é-e-mail', 'email'), /e-mail/);
});

test('gera BR Code com valor e rejeita identificador inválido', () => {
    const payload = buildPixPayload({ pixKey: 'cliente@example.com', pixKeyType: 'email', receiverName: 'Loja', city: 'Sao Paulo', amountCents: 1200, txid: 'ORDER123' });
    assert.match(payload, /540512\.00/);
    assert.match(payload, /6304[0-9A-F]{4}$/);
    assert.throws(() => buildPixPayload({ pixKey: 'cliente@example.com', pixKeyType: 'email', receiverName: 'Loja', city: 'Sao Paulo', amountCents: 1200, txid: 'pedido inválido' }), /identificador/);
});
