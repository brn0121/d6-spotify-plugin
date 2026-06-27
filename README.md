# Spotify Controller — StreamDock Plugin

Control Spotify directly from your FIFINE D6 / StreamDock device. Supports play/pause, fade play/pause, next/previous track, volume control, and mute.

---

## Requirements

- **FIFINE Control Deck** (StreamDock V2 software) installed and running
- **Spotify Premium** account (the Spotify Web API requires Premium for playback control)
- **macOS 10.11+** or **Windows 10+**
- A registered **Spotify Developer application** (free, takes ~2 minutes)

---

## 1. Create a Spotify Developer Application

You need a Spotify Client ID to authenticate the plugin with the Spotify API.

1. Go to [https://developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and log in with your Spotify account.
2. Click **Create app**.
3. Fill in the form:
   - **App name**: anything you like (e.g. `StreamDock Controller`)
   - **App description**: anything
   - **Redirect URI**: **`http://127.0.0.1:6545/callback`** ← this is required exactly as shown
   - **APIs used**: check **Web API**
4. Accept the terms and click **Save**.
5. On the app page, click **Settings** and copy the **Client ID** — you will need it during plugin setup.

> **Important:** The redirect URI `http://127.0.0.1:6545/callback` must be added exactly as shown. The OAuth flow will fail if it does not match.

---

## 2. Install the Plugin

### Option A — Manual install (recommended)

1. Close FIFINE Control Deck if it is running.
2. Copy the `com.spotify.controller.sdPlugin` folder to the StreamDock plugins directory:
   - **macOS**: `~/Library/Application Support/HotSpot/StreamDock/plugins/`
   - **Windows**: `%APPDATA%\HotSpot\StreamDock\plugins\`
3. Open FIFINE Control Deck. The **Spotify** category will appear in the action list.

### Option B — Build from source

```bash
cd com.spotify.controller.sdPlugin/plugin
npm install
npm run build
```

Then copy the parent folder to the plugins directory as described in Option A.

---

## 3. Configure the Plugin

1. Open **FIFINE Control Deck**.
2. Drag the **Play/Pause** action (or any Spotify action) onto a key slot.
3. Click the key to open the **Property Inspector** panel on the right.
4. Paste your **Client ID** into the field and click **Save**.
5. Click **Connect to Spotify** — your default browser will open the Spotify authorization page.
6. Log in and click **Agree**. The browser will show "✓ Spotify connected!" and you can close it.
7. The button icon on the deck will update to reflect the current playback state.

> The plugin stores your tokens in an AES-256-GCM encrypted file (`tokens.enc`) bound to your machine. You will not need to log in again unless you revoke access from the Spotify Dashboard.

---

## 4. Available Actions

| Action | Description |
|--------|-------------|
| **Play/Pause** | Instantly play or pause the current track |
| **Fade Play/Pause** | Gradually fades volume to 0 then pauses; fades back up on play |
| **Next Track** | Skip to the next track in the queue |
| **Previous Track** | Go back to the previous track |
| **Volume Up** | Increase volume by 10% |
| **Volume Down** | Decrease volume by 10% |
| **Mute** | Toggle mute; restores the previous volume level on unmute |

### Fade Play/Pause — max volume

The **Fade Play/Pause** button respects a configurable maximum volume:

- Open the **Property Inspector** for the **Play/Pause** button.
- Use the **Fade max volume** slider to set your desired maximum (default: 60%).
- Click **Save volume**.

When you press Fade Play/Pause:
- **While playing** → volume decreases from current level to 0, then pauses (~2 s at 60% max).
- **While paused** → starts playback at 0%, then volume rises to the configured max.
- **Press again during a fade** → cancels the fade immediately; volume stays at the current level.

---

## 5. How Authentication Works

The plugin uses the **OAuth 2.0 PKCE** flow — no client secret is required.

```
User presses button (no token)
        ↓
Plugin opens browser → Spotify login page
        ↓
User logs in and approves
        ↓
Spotify redirects to http://127.0.0.1:6545/callback
        ↓
Plugin receives the authorization code, exchanges for tokens
        ↓
Tokens saved (AES-256-GCM encrypted) to tokens.enc
```

**Token refresh** happens automatically in the background. Access tokens expire after 1 hour; the refresh token is used silently. If the refresh token is ever revoked (e.g. you changed your Spotify password or revoked access from the Dashboard), the buttons will show a lock icon — press any button to re-authenticate.

---

## 6. Troubleshooting

### "No active Spotify device"
Spotify must have an active device before the plugin can control playback. Open the Spotify app and start playing something, then use the StreamDock buttons.

### Button shows a lock icon
The plugin is not authenticated. Press the button to start the OAuth flow, or open the Property Inspector and click **Connect to Spotify**.

### Authentication timeout
The OAuth flow has a 5-minute timeout. If the browser does not redirect back within that time, press the button again to restart authentication.

### Redirect URI mismatch error in the browser
The redirect URI in your Spotify Developer Dashboard does not match `http://127.0.0.1:6545/callback`. Go to the Dashboard → your app → Settings and add exactly: `http://127.0.0.1:6545/callback`.

### Plugin does not appear in FIFINE Control Deck
- Verify the folder name is exactly `com.spotify.controller.sdPlugin`.
- Verify it is placed directly in the plugins directory (not in a subfolder).
- Restart FIFINE Control Deck.

### Log files
Runtime logs are written to:
```
com.spotify.controller.sdPlugin/plugin/log/plugin.log
```
The log rotates at 1 MB and keeps 2 backups. Check this file for detailed error messages.

---

## 7. Security Notes

- The **Client ID** is not a secret — it is safe to share and does not grant access to your account on its own.
- Tokens are stored encrypted (`AES-256-GCM`) and are bound to your machine hostname + Client ID. They cannot be decrypted on another machine.
- Do **not** commit `tokens.enc` to version control.
- The plugin only requests the minimum Spotify scopes needed: `user-read-playback-state user-modify-playback-state user-read-currently-playing`.

---

## 8. Development

```bash
# Install dependencies
cd plugin
npm install

# Build the bundle (required after every source change)
npm run build

# Restart FIFINE Control Deck to load the new build
```

The build uses [`@vercel/ncc`](https://github.com/vercel/ncc) to bundle `plugin/index.js` and all dependencies into a single file at `plugin/build/index.js`. The StreamDock host runs this bundle directly via Node.js.
