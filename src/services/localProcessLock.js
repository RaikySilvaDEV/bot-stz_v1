import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

function processExists(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try { process.kill(pid, 0); return true; }
    catch (error) { return error.code === 'EPERM'; }
}

export async function acquireLocalProcessLock(name) {
    if (!/^[a-z0-9-]{1,80}$/i.test(name)) throw new TypeError('Nome de bloqueio inválido.');
    const lockDirectory = path.join(tmpdir(), 'bot-stz-v1-locks');
    await fs.mkdir(lockDirectory, { recursive: true });
    const file = path.join(lockDirectory, `${name}.lock`);
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const handle = await fs.open(file, 'wx');
            await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
            await handle.close();
            return async () => {
                try {
                    const lock = JSON.parse(await fs.readFile(file, 'utf8'));
                    if (lock.pid === process.pid) await fs.unlink(file);
                } catch (error) { if (error.code !== 'ENOENT') throw error; }
            };
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            const stat = await fs.stat(file).catch(() => null);
            if (stat && Date.now() - stat.mtimeMs < 5000) return null;
            let owner = null;
            try { owner = JSON.parse(await fs.readFile(file, 'utf8')); } catch { /* arquivo parcial de processo interrompido */ }
            if (processExists(Number(owner?.pid))) return null;
            await fs.unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
        }
    }
    return null;
}
