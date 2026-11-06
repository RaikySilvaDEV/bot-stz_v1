import test from 'node:test';
import assert from 'node:assert/strict';
import { getSaudacaoDinamica } from '../src/services/greetings.js';

test('saudação usa os limites locais de São Paulo', () => {
    assert.equal(getSaudacaoDinamica(new Date('2026-11-06T08:00:00.000Z'), 'America/Sao_Paulo'), '☀️ **Bom dia!**');
    assert.equal(getSaudacaoDinamica(new Date('2026-11-06T14:59:00.000Z'), 'America/Sao_Paulo'), '☀️ **Bom dia!**');
    assert.equal(getSaudacaoDinamica(new Date('2026-11-06T15:00:00.000Z'), 'America/Sao_Paulo'), '🌤️ **Boa tarde!**');
    assert.equal(getSaudacaoDinamica(new Date('2026-11-06T21:00:00.000Z'), 'America/Sao_Paulo'), '🌙 **Boa noite!**');
    assert.equal(getSaudacaoDinamica(new Date('2026-11-06T07:59:00.000Z'), 'America/Sao_Paulo'), '🌙 **Boa noite!**');
});

test('saudação respeita o fuso escolhido', () => {
    const date = new Date('2026-11-06T12:00:00.000Z');
    assert.equal(getSaudacaoDinamica(date, 'America/Sao_Paulo'), '☀️ **Bom dia!**');
    assert.equal(getSaudacaoDinamica(date, 'UTC'), '🌤️ **Boa tarde!**');
});


