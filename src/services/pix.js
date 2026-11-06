function tlv(id, value) {
    const length = Buffer.byteLength(value, 'utf8');
    if (length > 99) throw new TypeError(`Campo Pix ${id} excede o limite do BR Code.`);
    return `${id}${String(length).padStart(2, '0')}${value}`;
}

function crc16(payload) {
    let crc = 0xffff;
    for (const byte of Buffer.from(payload, 'utf8')) {
        crc ^= byte << 8;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

function normalizePixLocation(value, field, maxLength) {
    const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
    if (!normalized) throw new TypeError(`O ${field} do recebedor não pode ficar vazio.`);
    return normalized;
}

export function normalizePixKey(value, type = 'auto') {
    if (typeof value !== 'string') throw new TypeError('Informe uma chave Pix válida.');
    const raw = value.trim();
    const supportedTypes = ['auto', 'email', 'phone', 'cpf', 'cnpj', 'random'];
    if (!supportedTypes.includes(type)) throw new TypeError('Selecione um tipo de chave Pix válido.');
    const keyType = type;
    const digits = raw.replace(/\D/g, '');
    let key = raw;

    if (keyType === 'email' || (keyType === 'auto' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw))) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) throw new TypeError('A chave Pix de e-mail não parece válida.');
        key = raw;
    } else if (keyType === 'phone' || (keyType === 'auto' && raw.startsWith('+'))) {
        let phone = raw.replace(/[\s().-]/g, '');
        if (/^\d{10,11}$/.test(phone)) phone = `+55${phone}`;
        else if (/^55\d{10,11}$/.test(phone)) phone = `+${phone}`;
        if (!/^\+\d{10,15}$/.test(phone)) throw new TypeError('Telefone Pix inválido. Use DDI e DDD, por exemplo +55 (11) 91234-5678.');
        key = phone;
    } else if (keyType === 'cpf' || (keyType === 'auto' && digits.length === 11)) {
        if (digits.length !== 11) throw new TypeError('A chave CPF precisa ter 11 dígitos.');
        key = digits;
    } else if (keyType === 'cnpj' || (keyType === 'auto' && digits.length === 14)) {
        if (digits.length !== 14) throw new TypeError('A chave CNPJ precisa ter 14 dígitos.');
        key = digits;
    } else if (keyType === 'random' || (keyType === 'auto' && /^[\da-f]{8}-?(?:[\da-f]{4}-?){3}[\da-f]{12}$/i.test(raw))) {
        if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(raw)) throw new TypeError('A chave aleatória Pix deve ser um UUID válido com hífens.');
        key = raw;
    } else if (keyType !== 'auto') {
        throw new TypeError('A chave Pix não corresponde ao tipo selecionado.');
    }

    if (!key || Buffer.byteLength(key, 'utf8') > 77) throw new TypeError('A chave Pix está vazia ou excede o limite permitido.');
    return key;
}

export function buildPixPayload({ pixKey, pixKeyType = 'auto', receiverName, city, amountCents, txid }) {
    pixKey = normalizePixKey(pixKey, pixKeyType);
    if (!Number.isSafeInteger(amountCents) || amountCents < 1) throw new TypeError('O valor da cobrança precisa ser maior que zero.');
    if (typeof txid !== 'string' || !/^[A-Za-z0-9]{1,25}$/.test(txid)) throw new TypeError('O identificador da cobrança Pix é inválido.');

    const receiver = normalizePixLocation(receiverName, 'nome', 25);
    const merchantCity = normalizePixLocation(city, 'cidade', 15);
    const amount = `${Math.floor(amountCents / 100)}.${String(amountCents % 100).padStart(2, '0')}`;
    const accountInfo = tlv('00', 'br.gov.bcb.pix') + tlv('01', pixKey);
    const additionalData = tlv('05', txid);
    const payload = [
        tlv('00', '01'),
        tlv('01', '12'),
        tlv('26', accountInfo),
        tlv('52', '0000'),
        tlv('53', '986'),
        tlv('54', amount),
        tlv('58', 'BR'),
        tlv('59', receiver),
        tlv('60', merchantCity),
        tlv('62', additionalData),
        '6304'
    ].join('');
    return `${payload}${crc16(payload)}`;
}

export { crc16 as calcularCRC16Pix };
