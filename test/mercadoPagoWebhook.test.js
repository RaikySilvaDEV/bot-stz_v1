import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { validateMercadoPagoSignature } from '../src/services/mercadoPago.js';

test('valida assinatura HMAC-SHA256 com o identificador exato do webhook', () => {
    const secret = 'webhook-test-secret';
    const requestId = 'req-123';
    const dataId = 'TOP01ABCXYZ';
    const ts = '1781009491';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
    assert.equal(validateMercadoPagoSignature(`ts=${ts},v1=${v1}`, requestId, dataId, secret), true);
    assert.equal(validateMercadoPagoSignature(`ts=${ts},v1=${v1}`, requestId, dataId.toLowerCase(), secret), false);
    assert.equal(validateMercadoPagoSignature(`ts=${ts},v1=${v1}`, 'outro-request', dataId, secret), false);
});
