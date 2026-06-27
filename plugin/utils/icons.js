const zlib = require('zlib');

// --- PNG encoder ---

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[i] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
}

function makePng(w, h, draw) {
    const rows = [];
    for (let y = 0; y < h; y++) {
        const row = Buffer.alloc(1 + w * 4);
        for (let x = 0; x < w; x++) {
            const [r, g, b, a] = draw(x, y);
            row[1 + x*4] = r; row[2 + x*4] = g; row[3 + x*4] = b; row[4 + x*4] = a;
        }
        rows.push(row);
    }
    const comp = zlib.deflateSync(Buffer.concat(rows), { level: 6 });
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', comp), pngChunk('IEND', Buffer.alloc(0))]);
}

function pngDataUrl(buf) {
    return `data:image/png;base64,${buf.toString('base64')}`;
}

// --- Flat renderer ---
// Dark Spotify background (#121212) with Spotify green symbol (#1db954).

const T      = [0,    0,    0,    0  ]; // transparent (outside button shape)
const BG     = [0x12, 0x12, 0x12, 255]; // #121212 dark background
const GREEN  = [0x1d, 0xb9, 0x54, 255]; // #1db954 Spotify green

function makeNeon(w, h, inBounds, isSymbol) {
    return pngDataUrl(makePng(w, h, (x, y) => {
        if (!inBounds(x, y)) return T;
        if (isSymbol(x, y))  return GREEN;
        return BG;
    }));
}

// --- Shape helpers ---

const SZ = 144, CR = 16;

function inRR(x, y) {
    const cx = Math.min(Math.max(x, CR), SZ - CR);
    const cy = Math.min(Math.max(y, CR), SZ - CR);
    return (x - cx) ** 2 + (y - cy) ** 2 <= CR * CR;
}

function inTri(px, py, ax, ay, bx, by, cx, cy) {
    const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function inSpeaker(x, y) {
    if (x >= 18 && x < 40 && y >= 54 && y < 90) return true;
    if (x >= 40 && x <= 78) {
        const t = (x - 40) / 38;
        return y >= (54 - t * 18) && y <= (90 + t * 18);
    }
    return false;
}

function inWave(x, y, r) {
    if (x < 84) return false;
    return Math.abs(Math.sqrt((x - 84) ** 2 + (y - 72) ** 2) - r) <= 3;
}

function inPlus(x, y) {
    if (x >= 86 && x <= 126 && y >= 68 && y <= 76) return true;
    if (x >= 102 && x <= 110 && y >= 48 && y <= 96) return true;
    return false;
}

function inMinus(x, y) { return x >= 86 && x <= 126 && y >= 68 && y <= 76; }

function inX(x, y) {
    if (x < 84 || x > 126) return false;
    const t = (x - 84) / 42;
    if (Math.abs(y - (48 + t * 48)) <= 4) return true;
    if (Math.abs(y - (96 - t * 48)) <= 4) return true;
    return false;
}

function inDots(x, y) {
    return [[50, 116], [72, 116], [94, 116]].some(
        ([dx, dy]) => (x - dx) ** 2 + (y - dy) ** 2 <= 36
    );
}

// --- Icons ---

const ICONS = {
    play:  makeNeon(SZ, SZ, inRR, (x, y) => inTri(x, y, 44, 36, 44, 108, 110, 72)),
    pause: makeNeon(SZ, SZ, inRR, (x, y) => (x >= 48 && x < 62 && y >= 36 && y < 108) || (x >= 82 && x < 96 && y >= 36 && y < 108)),

    lock: makeNeon(SZ, SZ, inRR, (x, y) => {
        if (x >= 52 && x < 92 && y >= 68 && y < 104) return true;
        if (Math.abs(x - 60) <= 3 && y >= 54 && y < 68) return true;
        if (Math.abs(x - 84) <= 3 && y >= 54 && y < 68) return true;
        return Math.abs(Math.sqrt((x - 72) ** 2 + (y - 54) ** 2) - 12) <= 3 && y <= 54;
    }),

    next: makeNeon(SZ, SZ, inRR, (x, y) =>
        inTri(x, y, 34, 36, 34, 108, 88, 72) || (x >= 92 && x < 106 && y >= 36 && y < 108)
    ),

    prev: makeNeon(SZ, SZ, inRR, (x, y) =>
        (x >= 38 && x < 52 && y >= 36 && y < 108) || inTri(x, y, 110, 36, 110, 108, 56, 72)
    ),

    volUp:   makeNeon(SZ, SZ, inRR, (x, y) => inSpeaker(x, y) || inPlus(x, y)),
    volDown: makeNeon(SZ, SZ, inRR, (x, y) => inSpeaker(x, y) || inMinus(x, y)),
    unmuted: makeNeon(SZ, SZ, inRR, (x, y) => inSpeaker(x, y) || inWave(x, y, 14) || inWave(x, y, 26)),
    muted:   makeNeon(SZ, SZ, inRR, (x, y) => inSpeaker(x, y) || inX(x, y)),

    // Fade variants — same symbols shifted up slightly to make room for the 3-dot indicator
    fadePlay:  makeNeon(SZ, SZ, inRR, (x, y) => inTri(x, y, 44, 30, 44, 96, 110, 63) || inDots(x, y)),
    fadePause: makeNeon(SZ, SZ, inRR, (x, y) =>
        (x >= 48 && x < 62 && y >= 30 && y < 96) ||
        (x >= 82 && x < 96 && y >= 30 && y < 96) ||
        inDots(x, y)
    ),
};

module.exports = { ICONS };
