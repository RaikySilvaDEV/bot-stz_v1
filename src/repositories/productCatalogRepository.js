import { readJsonData, writeJsonData } from '../data/jsonStore.js';
import { getCommerceProduct } from './commerceRepository.js';

const FILE = 'catalogo-loja.json';

export function getProductPrices() {
    const value = readJsonData(FILE, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function getProductPriceCents(productValue) {
    const cents = getProductPrices()[productValue];
    if (Number.isSafeInteger(cents) && cents > 0) return cents;
    return getCommerceProduct(productValue)?.defaultPriceCents ?? null;
}

export function hasCustomProductPrice(productValue) {
    const cents = getProductPrices()[productValue];
    return Number.isSafeInteger(cents) && cents > 0;
}

export function setProductPriceCents(productValue, cents) {
    if (typeof productValue !== 'string' || !productValue) throw new TypeError('Produto inválido.');
    if (!Number.isSafeInteger(cents) || cents < 1 || cents > 99_999_999) {
        throw new TypeError('O preço precisa ser um valor positivo de até R$ 999.999,99.');
    }
    const prices = getProductPrices();
    prices[productValue] = cents;
    writeJsonData(FILE, prices);
    return cents;
}

export function removeProductPrice(productValue) {
    const prices = getProductPrices();
    if (!(productValue in prices)) return false;
    delete prices[productValue];
    writeJsonData(FILE, prices);
    return true;
}
