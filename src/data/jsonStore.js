import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIRECTORY = path.join(PROJECT_ROOT, 'data');

function getDataPath(fileName) {
    if (path.basename(fileName) !== fileName) throw new TypeError('O arquivo de dados deve ser um nome simples.');
    return path.join(DATA_DIRECTORY, fileName);
}

export function readJsonData(fileName, fallback, { legacyFiles = [] } = {}) {
    const filePath = getDataPath(fileName);
    let storedValue;
    let fileExists = false;
    try {
        storedValue = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        fileExists = true;
        const isSeedData = JSON.stringify(storedValue) === JSON.stringify(fallback);
        if (!legacyFiles.length || !isSeedData) return storedValue;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`[dados] JSON inválido ou ilegível em ${fileName}:`, error);
            return structuredClone(fallback);
        }
    }

    for (const legacyFile of legacyFiles) {
        const legacyPath = path.join(PROJECT_ROOT, legacyFile);
        let value;
        try {
            value = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        } catch (error) {
            if (error.code !== 'ENOENT') console.error(`[dados] Falha ao migrar ${legacyFile}:`, error);
            continue;
        }
        try {
            writeJsonData(fileName, value);
            fs.unlinkSync(legacyPath);
            console.info(`[dados] Estado legado migrado para data/${fileName}.`);
        } catch (error) {
            console.error(`[dados] O arquivo legado ${legacyFile} foi mantido porque a migração falhou:`, error);
        }
        return value;
    }
    return fileExists ? storedValue : structuredClone(fallback);
}

export function writeJsonData(fileName, value) {
    const filePath = getDataPath(fileName);
    fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
        fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
        fs.renameSync(tempPath, filePath);
    } catch (error) {
        fs.rmSync(tempPath, { force: true });
        throw error;
    }
}

