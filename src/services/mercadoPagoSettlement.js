function toCents(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER / 100) return null;
    const cents = Math.round(amount * 100);
    return Number.isSafeInteger(cents) ? cents : null;
}

/** Use only actual Mercado Pago settlement information; never estimate a fee. */
export function calculateMercadoPagoSettlement(payment, grossCents) {
    if (!Number.isSafeInteger(grossCents) || grossCents < 0) return null;
    const netCents = toCents(payment?.transaction_details?.net_received_amount);
    if (netCents !== null && netCents <= grossCents) {
        return { grossAmountCents: grossCents, netAmountCents: netCents, feeAmountCents: grossCents - netCents, settlementSource: 'net_received_amount' };
    }
    const fees = payment?.fee_details;
    if (!Array.isArray(fees) || !fees.length) return null;
    const collectorFees = fees.filter(fee => String(fee?.fee_payer ?? '').toLowerCase() === 'collector');
    if (!collectorFees.length) return null;
    const amounts = collectorFees.map(fee => toCents(fee.amount));
    if (amounts.some(amount => amount === null)) return null;
    const feeAmountCents = amounts.reduce((sum, amount) => sum + amount, 0);
    if (!Number.isSafeInteger(feeAmountCents) || feeAmountCents > grossCents) return null;
    return { grossAmountCents: grossCents, netAmountCents: grossCents - feeAmountCents, feeAmountCents, settlementSource: 'fee_details' };
}
