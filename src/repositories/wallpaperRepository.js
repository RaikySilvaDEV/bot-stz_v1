import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { PATHS } from '../config/constants.js';
import { getWallpaperState } from './stateRepository.js';

const EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const MAX_WALLPAPER_BYTES = 25 * 1024 * 1024;

function readImageExtension(buffer, requestedExtension) {
    const ext = requestedExtension.toLowerCase();
    if (!EXTENSIONS.has(ext)) throw Object.assign(new Error('Use PNG, JPG, WebP ou GIF.'), { status: 400 });
    const valid = ext === '.png' ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : ext === '.jpg' || ext === '.jpeg' ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
            : ext === '.gif' ? buffer.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/)
                : buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!valid) throw Object.assign(new Error('O conteúdo do arquivo não corresponde ao formato da imagem.'), { status: 400 });
    return ext;
}

function wallpaperNumbers() {
    fs.mkdirSync(PATHS.wallpapers, { recursive: true });
    return new Set(fs.readdirSync(PATHS.wallpapers, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => entry.name.match(/^(\d+)\.(?:png|jpe?g|webp|gif)$/i)?.[1])
        .filter(Boolean).map(Number));
}

function imageFilesRecursively(directory = PATHS.wallpapers, found = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) imageFilesRecursively(absolutePath, found);
        else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name).toLowerCase())) found.push(absolutePath);
    }
    return found;
}

export function normalizeWallpaperSequence() {
    fs.mkdirSync(PATHS.wallpapers, { recursive: true });
    const currentDay = getWallpaperState().diaAtual;
    const occupied = wallpaperNumbers();
    const root = path.resolve(PATHS.wallpapers);
    const legacyFiles = imageFilesRecursively().filter(file => {
        const relative = path.relative(root, file);
        return path.dirname(relative) !== '.' || !/^\d+\.(?:png|jpe?g|webp|gif)$/i.test(path.basename(file));
    }).sort((a, b) => path.relative(root, a).localeCompare(path.relative(root, b), 'pt-BR', { numeric: true }));

    for (const source of legacyFiles) {
        let day = currentDay;
        while (day <= 105 && occupied.has(day)) day += 1;
        if (day > 105) {
            day = 1;
            while (day < currentDay && occupied.has(day)) day += 1;
        }
        if (day > 105 || occupied.has(day)) {
            console.warn(`[wallpapers] Não foi possível numerar ${path.basename(source)}: dias de 1 a 105 já estão ocupados.`);
            continue;
        }
        const target = path.join(root, `${day}${path.extname(source).toLowerCase()}`);
        fs.renameSync(source, target);
        occupied.add(day);
        console.info(`[wallpapers] ${path.relative(root, source)} organizado como ${path.basename(target)}.`);
    }
}

export function listWallpapers() {
    normalizeWallpaperSequence();
    const currentDay = getWallpaperState().diaAtual;
    const numbers = wallpaperNumbers();
    const files = fs.readdirSync(PATHS.wallpapers, { withFileTypes: true })
        .filter(entry => entry.isFile() && EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        .map(entry => {
            const numbered = entry.name.match(/^(\d+)\.(?:png|jpe?g|webp|gif)$/i);
            const day = numbered ? Number(numbered[1]) : null;
            return { day, name: entry.name, size: fs.statSync(path.join(PATHS.wallpapers, entry.name)).size,
                url: `/painel/wallpaper-images/${encodeURIComponent(entry.name)}`, current: day === currentDay };
        }).sort((a, b) => {
            if (a.day !== null && b.day !== null) return a.day - b.day;
            if (a.day !== null) return -1;
            if (b.day !== null) return 1;
            return a.name.localeCompare(b.name, 'pt-BR', { numeric: true });
        });
    let nextDay = currentDay;
    while (nextDay <= 105 && numbers.has(nextDay)) nextDay += 1;
    return { directory: 'Wallpapers', currentDay, nextDay: nextDay <= 105 ? nextDay : null, files };
}

export async function saveWallpaper(buffer, originalName) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw Object.assign(new Error('O arquivo está vazio.'), { status: 400 });
    if (buffer.length > MAX_WALLPAPER_BYTES) throw Object.assign(new Error('Cada imagem pode ter no máximo 25 MiB.'), { status: 413 });
    const extension = readImageExtension(buffer, path.extname(path.basename(originalName || '')));
    const { currentDay, nextDay } = listWallpapers();
    if (nextDay === null) throw Object.assign(new Error('A sequência de 1 a 105 está completa. Remova arquivos antigos antes de adicionar outros.'), { status: 409 });
    const filename = `${nextDay}${extension}`;
    const destination = path.join(PATHS.wallpapers, filename);
    await fsPromises.writeFile(destination, buffer, { flag: 'wx' });
    return { day: nextDay, name: filename, url: `/painel/wallpaper-images/${encodeURIComponent(filename)}`, current: nextDay === currentDay };
}

export function readWallpaperImage(filename) {
    if (path.basename(filename) !== filename || !EXTENSIONS.has(path.extname(filename).toLowerCase()) || /[\\/\0]/.test(filename)) return null;
    try { return fs.readFileSync(path.join(PATHS.wallpapers, filename)); }
    catch { return null; }
}

export function getWallpaperImageContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' })[ext] ?? null;
}

export function getWallpaperPath(day) {
    normalizeWallpaperSequence();
    const prefix = `${day}.`;
    const filename = fs.existsSync(PATHS.wallpapers)
        ? fs.readdirSync(PATHS.wallpapers).find(name => name.startsWith(prefix) && EXTENSIONS.has(path.extname(name).toLowerCase()))
        : null;
    return filename ? path.join(PATHS.wallpapers, filename) : null;
}
