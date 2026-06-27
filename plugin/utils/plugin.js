const WebSocket = require('ws');
const log4js = require('log4js');
const path = require('path');
const fs = require('fs');

// Parse CLI args: node index.js -port PORT -pluginUUID UUID -registerEvent EVENT -info INFO
const argv = {};
for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith('-')) {
        argv[process.argv[i].slice(1)] = process.argv[i + 1];
    }
}

const PORT           = argv.port;
const PLUGIN_UUID    = argv.pluginUUID;
const REGISTER_EVENT = argv.registerEvent;

// The bundle lives in build/, so go one level up to reach plugin/ for the log directory.
const scriptDir = path.resolve(path.dirname(process.argv[1]), '..');
const logDir = path.join(scriptDir, 'log');
try { fs.mkdirSync(logDir, { recursive: true }); } catch (_) {}

log4js.configure({
    appenders: {
        file: {
            type: 'file',
            filename: path.join(logDir, 'plugin.log'),
            maxLogSize: 1048576,
            backups: 2
        }
    },
    categories: { default: { appenders: ['file'], level: 'debug' } }
});

const log = log4js.getLogger();

let _ws = null;

const _send = (msg) => {
    if (_ws?.readyState === WebSocket.OPEN) _ws.send(JSON.stringify(msg));
    else log.warn('_send skipped — socket not open', msg.event);
};

class Plugins {
    constructor() {
        log.info('Plugin starting — port:', PORT, 'uuid:', PLUGIN_UUID, 'event:', REGISTER_EVENT);

        _ws = new WebSocket(`ws://localhost:${PORT}`);

        _ws.on('open', () => {
            log.info('Connected to StreamDock host');
            _ws.send(JSON.stringify({ event: REGISTER_EVENT, uuid: PLUGIN_UUID }));
        });

        _ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                this._route(msg);
            } catch (e) {
                log.error('Failed to parse message:', e);
            }
        });

        _ws.on('error', (err) => log.error('WebSocket error:', err));
        _ws.on('close', () => log.warn('WebSocket closed'));
    }

    _route({ event, context, action, payload }) {
        log.debug(`event=${event} action=${action} context=${context}`);

        if (event === 'didReceiveGlobalSettings') {
            if (typeof this.didReceiveGlobalSettings === 'function') {
                this.didReceiveGlobalSettings({ context, payload });
            }
            return;
        }

        if (event === 'sendToPlugin') {
            if (typeof this.sendToPlugin === 'function') {
                this.sendToPlugin({ context, payload, action });
            }
            return;
        }

        if (action) {
            // 'com.spotify.controller.playpause' → 'playpause'
            const key = action.split('.').pop();
            const handler = this[key];
            if (handler instanceof Actions) {
                handler._dispatch(event, { context, payload, action });
            } else {
                log.debug(`No Actions handler for key="${key}"`);
            }
        }
    }

    setImage(context, image) {
        _send({ event: 'setImage', context, payload: { image, target: 0 } });
    }

    setTitle(context, title, target = 0) {
        _send({ event: 'setTitle', context, payload: { title, target } });
    }

    showOk(context) {
        _send({ event: 'showOk', context });
    }

    showAlert(context) {
        _send({ event: 'showAlert', context });
    }

    getGlobalSettings() {
        _send({ event: 'getGlobalSettings', context: PLUGIN_UUID });
    }

    setGlobalSettings(settings) {
        _send({ event: 'setGlobalSettings', context: PLUGIN_UUID, payload: { settings } });
    }

}

class Actions {
    constructor(handlers) {
        this._handlers = handlers;
    }

    _dispatch(event, args) {
        // Lifecycle events use an underscore prefix to avoid collisions with SDK event names.
        const fn = this._handlers[event] ?? this._handlers[`_${event}`];
        if (typeof fn === 'function') {
            fn(args);
        }
    }
}

module.exports = { Plugins, Actions, log };
