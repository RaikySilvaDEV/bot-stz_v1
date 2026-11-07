import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';

const directory = path.join(os.homedir(), '.bot-stz-v1', 'secrets');
const privatePath = path.join(directory, 'mercado-pago-payouts-ed25519-private.pem');
const publicPath = path.join(directory, 'mercado-pago-payouts-ed25519-public.pem');

if (fs.existsSync(privatePath) || fs.existsSync(publicPath)) {
    console.error(`Já existe um arquivo de chave em ${directory}. Não substituí para evitar invalidar a chave cadastrada no Mercado Pago.`);
    process.exitCode = 1;
} else {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    fs.writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.writeFileSync(publicPath, publicKey.export({ type: 'spki', format: 'pem' }), { encoding: 'utf8', mode: 0o644, flag: 'wx' });
    console.log(`Chave privada (mantenha secreta): ${privatePath}`);
    console.log(`Caminho para configurar no painel: ${privatePath}`);
    console.log('Envie a chave pública a seguir para a equipe de Integrações do Mercado Pago cadastrar na aplicação Payouts:');
    console.log(fs.readFileSync(publicPath, 'utf8'));
    console.log('A produção só funcionará depois que o Mercado Pago confirmar o cadastro da chave pública.');
}
