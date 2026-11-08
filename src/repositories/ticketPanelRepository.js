import { readJsonData, writeJsonData } from '../data/jsonStore.js';

const FILE = 'ticket-panels.json';
const DEFAULTS = {
    support: {
        title: 'Atendimento e suporte',
        description: 'Escolha o assunto para abrir um canal privado com a equipe.',
        placeholder: 'Selecione o tipo de atendimento',
        options: [
            { label: 'Dúvida geral', description: 'Perguntas sobre a comunidade e os serviços.', value: 'duvida', emoji: '💬' },
            { label: 'Suporte técnico', description: 'Ajuda com instalação, acesso ou erros.', value: 'tecnico', emoji: '🛠️' },
            { label: 'Problema em uma compra', description: 'Ajuda com pagamento ou pedido existente.', value: 'pedido', emoji: '🧾' }
        ]
    },
    purchase: {
        title: 'Compras online',
        description: 'Abra seu carrinho privado e escolha um produto para comprar.'
    },
    maintenance: {
        title: 'Manutenção programada',
        message: 'Estamos realizando uma manutenção. Algumas funções podem ficar temporariamente indisponíveis.'
    }
};

function normalizeOptions(options) {
    if (!Array.isArray(options) || options.length < 1 || options.length > 25) {
        throw new Error('Cadastre de 1 a 25 opções para o menu de atendimento.');
    }
    const seen = new Set();
    return options.map((item, index) => {
        const label = String(item?.label ?? '').trim();
        const description = String(item?.description ?? '').trim();
        const value = String(item?.value ?? '').trim().toLowerCase();
        const emoji = String(item?.emoji ?? '').trim();
        if (!label || label.length > 100 || description.length > 100 || !/^[a-z0-9_-]{1,80}$/.test(value) || seen.has(value)) {
            throw new Error(`Revise a opção ${index + 1}: título (1–100), descrição (até 100) e identificador único com letras, números, _ ou -.`);
        }
        seen.add(value);
        return { label, description, value, ...(emoji ? { emoji: emoji.slice(0, 10) } : {}) };
    });
}

export function getTicketPanelConfig() {
    const saved = readJsonData(FILE, DEFAULTS);
    return {
        support: { ...DEFAULTS.support, ...(saved.support ?? {}), options: Array.isArray(saved.support?.options) ? saved.support.options : DEFAULTS.support.options },
        purchase: { ...DEFAULTS.purchase, ...(saved.purchase ?? {}) },
        maintenance: { ...DEFAULTS.maintenance, ...(saved.maintenance ?? {}) }
    };
}

export function updateTicketPanelConfig(input = {}) {
    const current = getTicketPanelConfig();
    const next = structuredClone(current);
    for (const key of ['support', 'purchase', 'maintenance']) {
        if (!input[key]) continue;
        for (const field of key === 'support' ? ['title', 'description', 'placeholder'] : key === 'purchase' ? ['title', 'description'] : ['title', 'message']) {
            if (input[key][field] === undefined) continue;
            const value = String(input[key][field]).trim();
            const max = field === 'description' || field === 'message' ? 1000 : field === 'placeholder' ? 150 : 100;
            if (!value || value.length > max) throw new Error(`Campo ${key}.${field} inválido; limite de ${max} caracteres.`);
            next[key][field] = value;
        }
        if (key === 'support' && input.support.options !== undefined) next.support.options = normalizeOptions(input.support.options);
    }
    writeJsonData(FILE, next);
    return next;
}
