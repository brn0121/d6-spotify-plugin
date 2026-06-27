const crypto = require('crypto');
const fs = require('fs');
const os = require('os');

const ALGO = 'aes-256-gcm';

// Key is derived from the Spotify Client ID + hostname so tokens are bound to this machine.
function deriveKey(clientId) {
    const pass = `spotify-plugin::${os.hostname()}::${clientId}`;
    return crypto.scryptSync(pass, 'streamdock-v1-salt', 32);
}

function encrypt(obj, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(b64, key) {
    const buf = Buffer.from(b64, 'base64');
    const iv  = buf.slice(0, 12);
    const tag = buf.slice(12, 28);
    const enc = buf.slice(28);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8'));
}

function saveTokens(filePath, tokens, clientId) {
    fs.writeFileSync(filePath, encrypt(tokens, deriveKey(clientId)), 'utf8');
}

function loadTokens(filePath, clientId) {
    try {
        return decrypt(fs.readFileSync(filePath, 'utf8'), deriveKey(clientId));
    } catch (_) {
        return null;
    }
}

module.exports = { saveTokens, loadTokens };
