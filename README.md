<div align="center">

# 🎵 spotify-discord-bot

**A self-hosted Discord bot that acts as a Spotify Connect device in your voice channels.**

Play music directly from your Spotify app — the bot shows up as a device, you hit play, and it streams audio into Discord. No third-party service. No subscription. Yours to run.

[![Node.js](https://img.shields.io/badge/Node.js-22.12%2B-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Discord.js](https://img.shields.io/badge/discord.js-v14.18%2B-5865F2)](https://discord.js.org)
[![librespot](https://img.shields.io/badge/librespot-0.8%2B-1DB954)](https://github.com/librespot-org/librespot)

</div>

---

## How It Works

```
Your Spotify App
      │
      │  Spotify Connect (select bot as device)
      ▼
  librespot  ←─── acts as a real Spotify Connect endpoint
      │
      │  Raw S16 PCM audio (pipe backend, 44100 Hz stereo)
      ▼
  ffmpeg  ←─── resamples to 48 kHz, encodes Opus in OGG container
      │
      │  OGG/Opus stream
      ▼
  Discord Voice Channel  ←─── @discordjs/voice demuxes OGG, forwards Opus packets directly
```

The bot uses [librespot](https://github.com/librespot-org/librespot) — an open-source Spotify client — to register as a real Spotify Connect device. When you select it in Spotify and hit play, librespot captures the audio stream and pipes it through ffmpeg into Discord.

The audio pipeline uses ffmpeg's built-in `libopus` encoder to output Opus inside an OGG container (`StreamType.OggOpus`). Discord's audio player reads OGG pages at its own 20ms pace and forwards the Opus packets directly — no JavaScript Opus encoder needed in the pipeline.

When librespot's Spotify session expires (~60 minutes), the bot automatically restarts the audio pipeline with a fresh access token. The voice connection stays alive — you just re-select the bot in Spotify's device list.

> **Spotify Premium is required.** Spotify Connect and streaming are Premium-only features.

---

## Commands

| Command | Description |
|---|---|
| `/connect` | Link your Spotify account to the bot |
| `/join` | Bot joins your current voice channel and becomes a Spotify device |
| `/leave` | Bot leaves the voice channel |

---

## Prerequisites

You'll need four things installed before setup:

### 1. Node.js (v22.12.0+)

**Node.js 22.12.0 or newer is required** — `@discordjs/voice` depends on it for built-in `aes-256-gcm` encryption support and compatibility with Discord's current voice protocol.

Download from [nodejs.org](https://nodejs.org) — grab the latest LTS version. Verify with `node -v`.

### 2. Git
Download from [git-scm.com](https://git-scm.com).

### 3. FFmpeg (with libopus)

The bot requires an ffmpeg build that includes `libopus` for encoding audio into Opus format.

**Windows:**
1. Download a release build from [gyan.dev/ffmpeg/builds](https://www.gyan.dev/ffmpeg/builds/) — grab `ffmpeg-release-essentials.zip` (the essentials build includes libopus)
2. Extract it and rename the folder to `ffmpeg`, move it to `C:\ffmpeg`
3. Add `C:\ffmpeg\bin` to your system PATH:
   - Search "Edit the system environment variables" in Start
   - Environment Variables → System variables → `Path` → Edit → New → `C:\ffmpeg\bin`
4. Verify in a new terminal: `ffmpeg -version`
5. Confirm libopus: `ffmpeg -codecs 2>&1 | findstr libopus`

**macOS:** `brew install ffmpeg`

**Linux:** `sudo apt install ffmpeg`

### 4. librespot

**Windows — build from source:**
1. Install Rust from [rustup.rs](https://rustup.rs) (choose the 64-bit default install)
2. Install Visual Studio Build Tools from [visualstudio.microsoft.com/visual-cpp-build-tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — select "Desktop development with C++"
3. Clone and build:
   ```powershell
   git clone https://github.com/librespot-org/librespot
   cd librespot
   cargo build --release
   ```
   This takes 5–15 minutes the first time.
4. The binary will be at `target\release\librespot.exe`
5. Copy it to `C:\librespot\librespot.exe` and add `C:\librespot` to your PATH
6. Verify in a new terminal: `librespot --version`

**macOS:** `brew install librespot`

**Linux:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
git clone https://github.com/librespot-org/librespot
cd librespot && cargo build --release
sudo cp target/release/librespot /usr/local/bin/
```

---

## Setup

### Step 1 — Create a Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** — name it whatever you like
3. Go to **Bot** in the sidebar:
   - Click **Reset Token** and copy it — this is your `DISCORD_TOKEN`
   - Enable all three **Privileged Gateway Intents**:
     - ✅ Presence Intent
     - ✅ Server Members Intent
     - ✅ Message Content Intent
   - Click **Save Changes**
4. Go to **OAuth2** in the sidebar — copy your **Client ID**
5. Invite the bot to your server:
   - Go to **OAuth2 → URL Generator**
   - Scopes: ✅ `bot` and ✅ `applications.commands`
   - Bot Permissions: ✅ `Connect`, ✅ `Speak`, ✅ `Send Messages`, ✅ `Read Message History`
   - Copy the generated URL and open it in your browser

### Step 2 — Create a Spotify App

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Click **Create app**
   - Name: anything you like
   - Redirect URI: `http://127.0.0.1:8888/callback`
   - Check ✅ **Web API**
   - Agree to terms → Save
3. Go to **Settings** → copy your **Client ID** and **Client Secret**

> **Note on redirect URI:** Spotify's dashboard may show a warning that `127.0.0.1` is not secure. This bot uses a paste-back OAuth flow — no redirect server is needed. The redirect URI just needs to be registered; the bot extracts the auth code from the URL you paste into Discord.

### Step 3 — Configure the Bot

Clone this repo and set up your environment:

```bash
git clone https://github.com/yourusername/spoticord-self
cd spoticord-self
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Discord
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_client_id

# Spotify
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback

# Bot device name (shows up in Spotify's device list)
SPOTIFY_DEVICE_NAME=My Bot

PORT=8888
```

### Step 4 — Install and Run

```bash
npm install
```

Run the dependency checker to verify everything is in place:

```bash
node src/check-deps.js
```

You should see green checks for Node.js version, transport encryption, `@discordjs/voice`, DAVE protocol (`@snazzah/davey`), ffmpeg with libopus, and librespot.

Then start the bot:

```bash
npm start
```

You should see:
```
🎵 Bot is online as YourBot#1234
✅ Slash commands registered: /connect, /join, /leave
```

---

## Usage

### 1. Connect your Spotify account
In Discord, type `/connect`. Click the authorization link. Spotify will redirect to a page that fails to load — **that's expected.** Copy the full URL from your browser's address bar (it starts with `http://127.0.0.1:8888/callback?code=...`) and paste it as a message in Discord. The bot will confirm your account is linked.

### 2. Join a voice channel
Join any voice channel in your server and type `/join`. The bot will join and register as a Spotify Connect device.

### 3. Play music
Open Spotify on any device. In the **device picker** (the speaker icon at the bottom of the Spotify app), you'll see your bot listed. Select it and hit play. 🎧

### 4. Leave
Type `/leave` to disconnect the bot from the voice channel.

---

## Running 24/7

To keep the bot running continuously, use [PM2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start src/index.js --name spoticord-self
pm2 save
pm2 startup
```

---

## Project Structure

```
spoticord-self/
├── src/
│   ├── index.js                 # Bot entry point, Discord client setup
│   ├── deploy-commands.js       # Slash command registration
│   ├── check-deps.js            # Dependency verification script
│   ├── commands/
│   │   ├── connect.js           # /connect — Spotify OAuth (paste-back flow)
│   │   ├── join.js              # /join    — join voice channel
│   │   └── leave.js             # /leave   — leave voice channel
│   ├── spotify/
│   │   └── SpotifyManager.js    # OAuth flow, token storage, auto-refresh
│   └── voice/
│       └── VoiceManager.js      # Voice connections, librespot, ffmpeg pipeline, auto-restart
├── .env.example
├── package.json
└── README.md
```

---

## How the OAuth Flow Works

This bot uses a **paste-back OAuth flow** instead of a redirect server, which means:

- No open ports required
- No tunnel services (ngrok, cloudflare, etc.)
- Works entirely locally

When you run `/connect`:
1. The bot gives you a Spotify authorization URL
2. You open it and authorize the bot
3. Spotify redirects to `http://127.0.0.1:8888/callback?code=...` — this fails to load (nothing is listening there), and that's fine
4. You copy the full URL from your browser's address bar and paste it in Discord
5. The bot extracts the authorization code from the URL and exchanges it for tokens

Tokens are stored in memory and auto-refreshed before expiry.

---

## Audio Pipeline Details

The audio pipeline is designed for simplicity and reliability:

1. **librespot** — decodes Spotify's encrypted audio stream, outputs raw S16LE PCM at 44100 Hz stereo via its `--backend pipe` mode
2. **ffmpeg** — resamples from 44100 Hz to 48000 Hz (Discord/Opus requirement), encodes to Opus using `libopus`, and wraps it in an OGG container. Key flags: `-application audio` (optimized for music), `-frame_duration 20` (matches Discord's 20ms frame expectation), `-vbr on`
3. **Discord audio player** — `createAudioResource` with `StreamType.OggOpus` tells `@discordjs/voice` to demux the OGG stream and forward raw Opus packets directly over the voice connection. No JavaScript Opus encoder (opusscript) is needed in this path

**Why OGG/Opus instead of MP3?** Feeding MP3 to Discord via `StreamType.Arbitrary` forces prism-media to probe the format, demux MP3, decode it, then re-encode to Opus — four stages where any one can silently fail. OGG/Opus skips all of that.

**No rate limiter needed.** The previous pipeline used a custom `RateLimiter` Transform stream because librespot's pipe backend dumps audio at ~50x realtime speed, which caused Spotify to think the track finished immediately. With the OGG/Opus approach, Discord's audio player *pulls* 20ms frames at its own pace. librespot dumping fast just means ffmpeg buffers ahead — the player consumes at exactly the right rate regardless.

### Auto-Restart on Token Expiry

Spotify access tokens expire after ~60 minutes. When librespot loses its Spotify connection, the audio player transitions from `playing` to `idle`. The bot detects this and automatically:

1. Tears down the dead librespot and ffmpeg processes
2. Waits with exponential backoff (2s, 4s, 8s… up to 32s)
3. Refreshes the Spotify access token via the stored refresh token
4. Spawns a new librespot + ffmpeg pipeline with the fresh token
5. Gives up after 5 consecutive failures

The Discord voice connection stays alive during this process — only the audio pipeline restarts. You'll need to re-select the bot in Spotify's device list after the restart since librespot re-registers as a new device instance.

---

## Troubleshooting

**`librespot: command not found`**
→ librespot isn't in your PATH. See the Prerequisites section.

**`/connect` link gives "redirect_uri not matching"**
→ Make sure `SPOTIFY_REDIRECT_URI` in your `.env` exactly matches what's saved in your Spotify app dashboard, including `http://` (not `https://`).

**Voice connection loops `signalling → connecting → signalling` and never reaches Ready**
→ This is almost always an encryption or protocol version issue:
- Run `node src/check-deps.js` and make sure all checks pass
- Verify `@discordjs/voice` is v0.19.0+ (needed for AEAD encryption modes and DAVE E2EE)
- Verify `@snazzah/davey` is installed (handles DAVE end-to-end encryption, required by Discord since March 2026)
- Verify Node.js is v22.12.0+ (provides built-in `aes-256-gcm` for transport encryption)
- If you just left a voice channel and are immediately rejoining, wait 30 seconds — Discord rate-limits voice reconnections

**Bot joins voice channel but no audio plays**
→ Make sure ffmpeg is installed and has libopus: `ffmpeg -codecs 2>&1 | findstr libopus`
→ Make sure the bot has Connect and Speak permissions in your server
→ Check that you've selected the bot as your Spotify device before hitting play
→ Check the console for `[debug] librespot first output:` and `[debug] ffmpeg first output:` — if these don't appear, librespot isn't receiving audio from Spotify

**Audio stops after ~30–60 minutes**
→ This is normal — Spotify access tokens expire. The bot should automatically restart the pipeline and log `Audio pipeline restarted`. Re-select the bot in Spotify's device list and hit play again.

**Spotify Premium required error**
→ Spotify Connect requires a Premium account. This is a Spotify restriction.

**`signalling → destroyed` immediately on `/join`**
→ Discord is rate-limiting the voice connection. Wait 30–60 seconds, then try `/join` again. This often happens after a previous session wasn't cleanly disconnected.

---

## Dependencies

| Package | Purpose |
|---|---|
| `discord.js` ^14.18.0 | Discord API client |
| `@discordjs/voice` ^0.19.0 | Discord voice connections, AEAD encryption, DAVE E2EE |
| `@snazzah/davey` ^0.1.6 | DAVE end-to-end encryption protocol (required by Discord since March 2026) |
| `prism-media` ^1.3.5 | OGG/Opus stream demuxing for `StreamType.OggOpus` |
| `axios` ^1.6.2 | Spotify API HTTP requests |
| `dotenv` ^16.3.1 | Environment variable loading |

**No longer needed (removed from earlier versions):**
- `tweetnacl` — replaced by Node.js built-in `aes-256-gcm` for transport encryption
- `opusscript` — not needed when using `StreamType.OggOpus` (ffmpeg's libopus handles encoding)
- `express` — the paste-back OAuth flow doesn't need a redirect server

**External binaries:**
- `librespot` — Spotify Connect client ([github.com/librespot-org/librespot](https://github.com/librespot-org/librespot))
- `ffmpeg` with libopus — audio conversion ([ffmpeg.org](https://ffmpeg.org))

---

## Acknowledgements

Inspired by [Spoticord](https://github.com/SpoticordMusic/Spoticord), which was a hosted service offering the same functionality before it was discontinued. This project is a self-hosted alternative you control entirely.

Built on [librespot](https://github.com/librespot-org/librespot), an open-source Spotify client implementation.

---

## License

MIT — do whatever you want with it.
