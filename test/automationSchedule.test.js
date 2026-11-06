import test from 'node:test';
import assert from 'node:assert/strict';
import { getScheduleDateParts } from '../src/features/automation.js';

test('separa data e horário agendado no fuso configurado', () => {
    assert.deepEqual(getScheduleDateParts(new Date('2026-11-06T15:00:00.000Z'), 'America/Sao_Paulo'), {
        dateKey: '2026-11-06', hour: 12, minute: 0
    });
});
