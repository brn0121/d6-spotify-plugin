const path = require('path');
const fs = require('fs');
const { setTimeout: sleep } = require('timers/promises');
const { Plugins, Actions, log } = require('./utils/plugin');
const { startAuth, refreshAccessToken, getPlaybackState, play, pause, skipNext, skipPrevious, setVolume } = require('./utils/spotify');
const { saveTokens, loadTokens } = require('./utils/storage');
const { ICONS } = require('./utils/icons');

const plugin = new Plugins();

// config.json is a fallback source for clientId when the user hasn't set it via the PI yet.
const pluginDir = path.resolve(path.dirname(process.argv[1]), '..');
const configPath = path.join(pluginDir, 'config.json');
const tokensPath = path.join(pluginDir, 'tokens.enc');

let fileConfig = {};
try { fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (_) {}

let settings = {};
let authInProgress = false;
let lastCommandAt = 0;

const tryDebounce = (label) => {
    const now = Date.now();
    if (now - lastCommandAt < 800) { log.debug(label, 'debounced'); return true; }
    lastCommandAt = now;
    return false;
};

const activeContexts  = new Set();
const nextContexts    = new Set();
const prevContexts    = new Set();
const volUpContexts   = new Set();
const volDownContexts = new Set();
const muteContexts    = new Set();
const fadeContexts    = new Set();

let savedVolume = 50;

// --- Fade play/pause ---

const FADE_STEP     = 3;   // % per step
const FADE_INTERVAL = 105; // ms between steps

let isFading   = false;
let fadeCancel = false;

async function fadeOut(token, fromVol) {
    fadeCancel = false;
    let vol = fromVol;
    while (vol > 0 && !fadeCancel) {
        vol = Math.max(0, vol - FADE_STEP);
        await setVolume(token, vol);
        if (vol > 0 && !fadeCancel) await sleep(FADE_INTERVAL);
    }
    if (!fadeCancel) {
        await pause(token);
        broadcast(fadeContexts, 'fadePlay');
        log.info('Fade out complete');
    }
}

async function fadeIn(token, toVol) {
    fadeCancel = false;
    await setVolume(token, 0);
    await play(token);
    broadcast(fadeContexts, 'fadePause');
    let vol = 0;
    while (vol < toVol && !fadeCancel) {
        vol = Math.min(toVol, vol + FADE_STEP);
        await setVolume(token, vol);
        if (vol < toVol && !fadeCancel) await sleep(FADE_INTERVAL);
    }
    if (!fadeCancel) log.info('Fade in complete, final vol:', toVol);
}

// --- Icons ---

const setIcon   = (context, key) => plugin.setImage(context, ICONS[key]);
const broadcast = (set, key) => { for (const ctx of set) setIcon(ctx, key); };

const updateAllIcons = (state) => {
    const locked  = state === 'locked';
    const playKey = state === 'playing' ? 'pause' : 'play';
    const fadeKey = state === 'playing' ? 'fadePause' : 'fadePlay';
    log.debug('updateAllIcons', state, 'play:', activeContexts.size, 'next:', nextContexts.size, 'prev:', prevContexts.size);
    broadcast(activeContexts,  locked ? 'lock' : playKey);
    broadcast(fadeContexts,    locked ? 'lock' : fadeKey);
    broadcast(nextContexts,    locked ? 'lock' : 'next');
    broadcast(prevContexts,    locked ? 'lock' : 'prev');
    broadcast(volUpContexts,   locked ? 'lock' : 'volUp');
    broadcast(volDownContexts, locked ? 'lock' : 'volDown');
    broadcast(muteContexts,    locked ? 'lock' : 'unmuted');
};

// --- Tokens ---

const getClientId = () => settings.clientId || fileConfig.clientId;

// Pre-load tokens from the encrypted file before the host sends GlobalSettings,
// since the host does not persist tokens across restarts.
{
    const clientId = getClientId();
    if (clientId) {
        const saved = loadTokens(tokensPath, clientId);
        if (saved) {
            settings.accessToken = saved.accessToken;
            settings.refreshToken = saved.refreshToken;
            settings.expiresAt = saved.expiresAt;
            log.info('Tokens loaded from file, expire at', new Date(saved.expiresAt).toISOString());
        }
    }
}

const isTokenValid = () =>
    settings.accessToken && settings.expiresAt && Date.now() < settings.expiresAt - 30000;

const persistClientId = (clientId) => {
    try {
        fs.writeFileSync(configPath, JSON.stringify({ clientId }, null, 2), 'utf8');
        fileConfig.clientId = clientId;
    } catch (e) { log.warn('Failed to persist clientId:', e.message); }
};

const persistTokens = () => {
    plugin.setGlobalSettings(settings);
    try {
        const clientId = getClientId();
        if (clientId) saveTokens(tokensPath, {
            accessToken: settings.accessToken,
            refreshToken: settings.refreshToken,
            expiresAt: settings.expiresAt
        }, clientId);
    } catch (e) { log.warn('Failed to persist tokens:', e.message); }
};

const applyTokenData = (tokenData) => {
    settings.accessToken = tokenData.access_token;
    settings.expiresAt = Date.now() + tokenData.expires_in * 1000;
    if (tokenData.refresh_token) settings.refreshToken = tokenData.refresh_token;
    persistTokens();
    log.info('Tokens saved, expire at', new Date(settings.expiresAt).toISOString());
};

// Mutex: only one refresh request runs at a time to prevent concurrent token rotation conflicts.
let _refreshPromise = null;

const ensureValidToken = async () => {
    if (isTokenValid()) return settings.accessToken;
    if (!settings.refreshToken) throw new Error('No refresh token — please log in again');
    if (_refreshPromise) return _refreshPromise;

    _refreshPromise = (async () => {
        log.info('Refreshing access token...');
        const data = await refreshAccessToken(settings.refreshToken, getClientId());
        if (data.error) {
            if (data.error === 'invalid_grant') {
                log.warn('Refresh token invalid — clearing tokens, please log in again');
                settings.accessToken = null;
                settings.refreshToken = null;
                settings.expiresAt = null;
                persistTokens();
                updateAllIcons('locked');
            }
            throw new Error(data.error);
        }
        applyTokenData(data);
        return settings.accessToken;
    })().finally(() => { _refreshPromise = null; });

    return _refreshPromise;
};

// --- OAuth ---

const triggerAuth = async (context) => {
    const clientId = getClientId();
    if (!clientId) {
        log.warn('Client ID not configured');
        plugin.showAlert(context);
        return;
    }
    if (authInProgress) { log.warn('Auth already in progress'); return; }

    authInProgress = true;
    log.info('Starting OAuth with clientId:', clientId);

    try {
        const tokenData = await startAuth(clientId, log);
        applyTokenData(tokenData);
        log.info('OAuth complete');
        updateAllIcons('paused');
    } catch (e) {
        log.error('OAuth failed:', e.message);
        plugin.showAlert(context);
    } finally {
        authInProgress = false;
    }
};

// --- Plugin events ---

plugin.didReceiveGlobalSettings = ({ payload: { settings: s } }) => {
    const prev = settings;
    settings = s || {};
    // The host does not persist tokens across restarts — restore from the pre-loaded file values.
    if (!settings.accessToken && prev.accessToken) {
        settings.accessToken  = prev.accessToken;
        settings.refreshToken = prev.refreshToken;
        settings.expiresAt    = prev.expiresAt;
        log.info('Tokens restored from file');
    }
    // If tokens still missing but clientId is now available, try loading from file.
    // This covers the case where config.json didn't exist at startup so the pre-load was skipped.
    if (!settings.accessToken) {
        const clientId = getClientId();
        if (clientId) {
            const saved = loadTokens(tokensPath, clientId);
            if (saved) {
                settings.accessToken  = saved.accessToken;
                settings.refreshToken = saved.refreshToken;
                settings.expiresAt    = saved.expiresAt;
                log.info('Tokens loaded from file (deferred), expire at', new Date(saved.expiresAt).toISOString());
            }
        }
    }
    const clientId = getClientId();
    log.info('Settings: clientId:', clientId ? 'ok' : 'missing', '| token:', settings.accessToken ? 'ok' : 'missing');
    updateAllIcons(settings.accessToken ? 'paused' : 'locked');
    if (settings.accessToken) pollPlaybackState();
};

// Global sendToPlugin handler — works regardless of which button's PI sent the event.
plugin.sendToPlugin = ({ payload, context }) => {
    log.info('sendToPlugin received:', JSON.stringify(payload));
    if (payload.action === 'setClientId' && payload.clientId) {
        settings.clientId = payload.clientId.trim();
        persistClientId(settings.clientId);
        plugin.setGlobalSettings(settings);
    }
    if (payload.action === 'setMaxVolume') {
        settings.maxVolume = Math.max(0, Math.min(100, parseInt(payload.maxVolume, 10) || 60));
        plugin.setGlobalSettings(settings);
        log.info('Max volume set to:', settings.maxVolume);
    }
    if (payload.action === 'auth') {
        if (payload.clientId) {
            settings.clientId = payload.clientId.trim();
            persistClientId(settings.clientId);
            plugin.setGlobalSettings(settings);
        }
        triggerAuth(context);
    }
};

plugin.playpause = new Actions({
    _willAppear({ context }) {
        activeContexts.add(context);
        plugin.getGlobalSettings();
        setIcon(context, settings.accessToken ? 'play' : 'lock');
        log.info('willAppear playpause', context);
    },

    _willDisappear({ context }) {
        activeContexts.delete(context);
    },

    _propertyInspectorDidAppear({ context }) {
        log.info('PI opened', context);
        plugin.getGlobalSettings();
    },

    async keyUp({ context }) {
        if (!settings.accessToken) { await triggerAuth(context); return; }
        if (tryDebounce('playpause')) return;
        try {
            const token = await ensureValidToken();
            const state = await getPlaybackState(token);
            if (!state || !state.device) {
                log.warn('No active Spotify device');
                plugin.showAlert(context);
                return;
            }
            if (state.is_playing) {
                await pause(token);
                broadcast(activeContexts, 'play');
            } else {
                await play(token);
                broadcast(activeContexts, 'pause');
            }
            log.info('Playback toggled, was playing:', state.is_playing);
        } catch (e) {
            log.error('Playback error:', e.message);
            plugin.showAlert(context);
        }
    }
});

// apiFn may return a number (new volume) to display briefly as the button title.
const makeSkipAction = (iconKey, ctxSet, apiFn, label) => new Actions({
    _willAppear({ context }) {
        ctxSet.add(context);
        setIcon(context, settings.accessToken ? iconKey : 'lock');
        plugin.getGlobalSettings();
        log.info('willAppear', label, context);
    },
    _willDisappear({ context }) { ctxSet.delete(context); },
    async keyUp({ context }) {
        if (!settings.accessToken) { await triggerAuth(context); return; }
        if (tryDebounce(label)) return;
        try {
            const token = await ensureValidToken();
            const result = await apiFn(token);
            if (typeof result === 'number') {
                for (const ctx of ctxSet) plugin.setTitle(ctx, `${result}%`);
                sleep(2000).then(() => { for (const ctx of ctxSet) plugin.setTitle(ctx, ''); });
            }
            log.info(label, 'ok');
        } catch (e) {
            log.error(label, 'error:', e.message);
            plugin.showAlert(context);
        }
    }
});

plugin.next     = makeSkipAction('next', nextContexts, skipNext,     'skipNext');
plugin.previous = makeSkipAction('prev', prevContexts, skipPrevious, 'skipPrevious');

plugin.volumeup = makeSkipAction('volUp', volUpContexts, async (token) => {
    const state = await getPlaybackState(token);
    if (!state?.device) throw new Error('No active device');
    const newVol = Math.min(100, (state.device.volume_percent ?? 0) + 10);
    await setVolume(token, newVol);
    return newVol;
}, 'volumeUp');

plugin.volumedown = makeSkipAction('volDown', volDownContexts, async (token) => {
    const state = await getPlaybackState(token);
    if (!state?.device) throw new Error('No active device');
    const newVol = Math.max(0, (state.device.volume_percent ?? 0) - 10);
    await setVolume(token, newVol);
    return newVol;
}, 'volumeDown');

plugin.mute = new Actions({
    _willAppear({ context }) {
        muteContexts.add(context);
        plugin.getGlobalSettings();
        setIcon(context, settings.accessToken ? 'unmuted' : 'lock');
        log.info('willAppear mute', context);
    },
    _willDisappear({ context }) { muteContexts.delete(context); },
    async keyUp({ context }) {
        if (!settings.accessToken) { await triggerAuth(context); return; }
        if (tryDebounce('mute')) return;
        try {
            const token = await ensureValidToken();
            const state = await getPlaybackState(token);
            if (!state?.device) { plugin.showAlert(context); return; }
            const currentVol = state.device.volume_percent ?? 0;
            if (currentVol > 0) {
                savedVolume = currentVol;
                await setVolume(token, 0);
                broadcast(muteContexts, 'muted');
                log.info('Muted, saved vol:', savedVolume);
            } else {
                await setVolume(token, savedVolume);
                broadcast(muteContexts, 'unmuted');
                log.info('Unmuted, restored vol:', savedVolume);
            }
        } catch (e) {
            log.error('Mute error:', e.message);
            plugin.showAlert(context);
        }
    }
});

plugin.fadeplaypause = new Actions({
    _willAppear({ context }) {
        fadeContexts.add(context);
        plugin.getGlobalSettings();
        setIcon(context, settings.accessToken ? 'fadePlay' : 'lock');
        log.info('willAppear fadeplaypause', context);
    },
    _willDisappear({ context }) { fadeContexts.delete(context); },
    async keyUp({ context }) {
        if (!settings.accessToken) { await triggerAuth(context); return; }
        if (isFading) {
            fadeCancel = true;
            isFading = false;
            log.info('Fade cancelled by user');
            return;
        }
        if (tryDebounce('fadeplaypause')) return;
        try {
            const token = await ensureValidToken();
            const state = await getPlaybackState(token);
            if (!state || !state.device) {
                log.warn('No active Spotify device');
                plugin.showAlert(context);
                return;
            }
            const maxVol = settings.maxVolume ?? 60;
            isFading = true;
            if (state.is_playing) {
                const fromVol = state.device.volume_percent ?? maxVol;
                log.info('Fade out:', fromVol, '→ 0');
                await fadeOut(token, fromVol);
            } else {
                log.info('Fade in: 0 →', maxVol);
                await fadeIn(token, maxVol);
            }
            isFading = false;
        } catch (e) {
            isFading = false;
            log.error('Fade error:', e.message);
            plugin.showAlert(context);
        }
    }
});

// --- Playback state polling ---
async function pollPlaybackState() {
    if (!settings.accessToken) return;
    if (activeContexts.size === 0 && fadeContexts.size === 0 && nextContexts.size === 0 && prevContexts.size === 0) return;
    try {
        const token = await ensureValidToken();
        const state = await getPlaybackState(token);
        if (!state || !state.device) {
            log.debug('poll: no active device');
            return;
        }
        const playKey = state.is_playing ? 'pause' : 'play';
        const vol     = state.device.volume_percent ?? 100;
        const muteKey = vol === 0 ? 'muted' : 'unmuted';
        log.debug('poll: is_playing =', state.is_playing, '| vol =', vol);
        broadcast(activeContexts, playKey);
        broadcast(fadeContexts,   state.is_playing ? 'fadePause' : 'fadePlay');
        broadcast(nextContexts,   'next');
        broadcast(prevContexts,   'prev');
        broadcast(muteContexts,   muteKey);
    } catch (e) {
        log.debug('poll error:', e.message);
    }
}

setInterval(pollPlaybackState, 3000);
