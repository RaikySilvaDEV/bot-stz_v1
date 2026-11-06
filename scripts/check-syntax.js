import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'src');
function collect(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const absolute = path.join(directory, entry.name);
        return entry.isDirectory() ? collect(absolute) : entry.isFile() && entry.name.endsWith('.js') ? [absolute] : [];
    });
}
for (const file of collect(source)) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Sintaxe JavaScript válida: ${collect(source).length} arquivos.`);
