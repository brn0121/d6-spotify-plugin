const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { exec } = require('child_process');

function openBrowser(url, log) {
    const escaped = url.replace(/"/g, '\\"');
    const cmd = process.platform === 'win32' ? `start "" "${escaped}"` : `/usr/bin/open "${escaped}"`;
    log && log.info('openBrowser cmd:', cmd.slice(0, 80));
    exec(cmd, (err, _stdout, stderr) => {
        if (err) log && log.error('openBrowser failed:', err.message, stderr);
        else log && log.info('openBrowser ok');
    });
}

const REDIRECT_URI = 'http://127.0.0.1:6545/callback';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';

function generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

function httpsPost(hostname, path, body) {
    return new Promise((resolve, reject) => {
        const payload = body.toString();
        const req = https.request({
            hostname,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function httpsRequest(method, path, accessToken) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.spotify.com',
            path,
            method,
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode === 204 || data === '') return resolve(null);
                try { resolve(JSON.parse(data)); } catch (_) { resolve(null); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function exchangeCode(code, verifier, clientId) {
    return httpsPost('accounts.spotify.com', '/api/token', new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier
    }));
}

function refreshAccessToken(refreshToken, clientId) {
    return httpsPost('accounts.spotify.com', '/api/token', new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId
    }));
}

function startAuth(clientId, log) {
    return new Promise((resolve, reject) => {
        const { verifier, challenge } = generatePKCE();

        const params = new URLSearchParams({
            client_id: clientId,
            response_type: 'code',
            redirect_uri: REDIRECT_URI,
            code_challenge_method: 'S256',
            code_challenge: challenge,
            scope: SCOPES
        });

        let server;
        const timeout = setTimeout(() => {
            server && server.close();
            reject(new Error('OAuth timeout — no response within 5 minutes'));
        }, 5 * 60 * 1000);

        server = http.createServer((req, res) => {
            if (!req.url.startsWith('/callback')) return;

            const url = new URL(req.url, 'http://localhost');
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><body style="font-family:sans-serif;text-align:center;margin-top:60px"><h2>&#10003; Spotify connected!</h2><p>You can close this tab.</p></body></html>');

            clearTimeout(timeout);
            server.close();

            if (error) return reject(new Error(`Spotify denied access: ${error}`));

            exchangeCode(code, verifier, clientId)
                .then(resolve)
                .catch(reject);
        });

        server.on('error', (e) => {
            clearTimeout(timeout);
            reject(e);
        });

        server.listen(6545, '127.0.0.1', () => {
            const authUrl = `https://accounts.spotify.com/authorize?${params}`;
            log.info('OAuth server listening, opening browser...');
            openBrowser(authUrl, log);
        });
    });
}

const api = (method, path) => (token) => httpsRequest(method, path, token);

const getPlaybackState = api('GET',  '/v1/me/player');
const play             = api('PUT',  '/v1/me/player/play');
const pause            = api('PUT',  '/v1/me/player/pause');
const skipNext         = api('POST', '/v1/me/player/next');
const skipPrevious     = api('POST', '/v1/me/player/previous');

const setVolume = (token, volumePercent) =>
    httpsRequest('PUT', `/v1/me/player/volume?volume_percent=${volumePercent}`, token);

module.exports = { startAuth, refreshAccessToken, getPlaybackState, play, pause, skipNext, skipPrevious, setVolume };