const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  VoiceConnectionStatus,
  StreamType,
  NoSubscriberBehavior,
  entersState,
  AudioPlayerStatus,
} = require('@discordjs/voice');

const { spawn } = require('child_process');

class VoiceManager {
  constructor(spotifyManager) {
    this.spotifyManager = spotifyManager;
    this.sessions = new Map();
  }

  async join(guildId, voiceChannel, discordUserId) {
    // Clean up any existing session fully before starting fresh
    if (this.sessions.has(guildId)) {
      this.leave(guildId);
      await new Promise(r => setTimeout(r, 1000));
    }

    const accessToken = await this.spotifyManager.getAccessToken(discordUserId);
    if (!accessToken) throw new Error('Spotify not connected. Use /connect first.');

    // ── 1. Join voice channel ─────────────────────────────────────────────
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    connection.on('stateChange', (o, n) => {
      console.log(`[voice] ${o.status} -> ${n.status}`);
      if (n.closeCode) console.log(`[voice]   closeCode: ${n.closeCode}`);
    });

    connection.on('error', (err) => {
      console.error('[voice error]', err.message);
    });

    // ── Wait for Ready ────────────────────────────────────────────────────
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      console.log('[Greg] Voice connection is Ready!');
    } catch {
      connection.destroy();
      throw new Error(
        'Voice connection failed to reach Ready state. ' +
        'Check logs above for close codes. ' +
        'Common causes: missing @snazzah/davey (DAVE E2EE), or Discord rate-limiting reconnects — wait 30s and try again.'
      );
    }

    // Handle Discord-side disconnects (server migration, etc)
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.leave(guildId);
      }
    });

    // ── 2. Create the audio player (long-lived, survives pipeline restarts) ─
    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });

    player.on('error', (err) => console.error(`[player error] ${err.message}`));
    player.on('stateChange', (o, n) => console.log(`[player] ${o.status} -> ${n.status}`));

    connection.subscribe(player);

    // ── 3. Store session state ────────────────────────────────────────────
    const session = {
      connection,
      player,
      guildId,
      discordUserId,
      channelName: voiceChannel.name,
      librespot: null,
      ffmpeg: null,
      restartCount: 0,
      restarting: false,
      destroyed: false,
    };

    this.sessions.set(guildId, session);

    // ── 4. Start the audio pipeline (librespot → ffmpeg → player) ─────────
    await this._startPipeline(session, accessToken);

    // ── 5. Auto-restart pipeline when librespot dies ──────────────────────
    //    This handles token expiry (~60min), Spotify server drops, etc.
    //    The voice connection stays alive — only the audio pipeline restarts.
    player.on('stateChange', async (oldState, newState) => {
      if (
        oldState.status === AudioPlayerStatus.Playing &&
        newState.status === AudioPlayerStatus.Idle &&
        !session.destroyed &&
        !session.restarting
      ) {
        console.log('[Greg] Player went idle — librespot likely lost its session.');
        await this._restartPipeline(session);
      }
    });

    console.log(`[Greg] Joined "${voiceChannel.name}" in guild ${guildId}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Audio pipeline management (restartable, independent of voice connection)
  // ═══════════════════════════════════════════════════════════════════════════

  async _startPipeline(session, accessToken) {
    const librespot = this._spawnLibrespot(accessToken);
    const ffmpeg = this._spawnFfmpeg(librespot.stdout);

    librespot.stdout.once('data', (chunk) => {
      console.log(`[debug] librespot first output: ${chunk.length} bytes`);
    });
    ffmpeg.stdout.once('data', (chunk) => {
      console.log(`[debug] ffmpeg first output: ${chunk.length} bytes`);
    });

    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.OggOpus,
    });

    session.librespot = librespot;
    session.ffmpeg = ffmpeg;
    session.player.play(resource);
  }

  _teardownPipeline(session) {
    if (session.librespot) {
      try { session.librespot.kill('SIGTERM'); } catch {}
      session.librespot = null;
    }
    if (session.ffmpeg) {
      try { session.ffmpeg.kill('SIGTERM'); } catch {}
      session.ffmpeg = null;
    }
    try { session.player.stop(true); } catch {}
  }

  async _restartPipeline(session) {
    if (session.destroyed || session.restarting) return;

    session.restartCount++;
    if (session.restartCount > 5) {
      console.error('[Greg] Too many pipeline restarts (5) — giving up. Use /leave then /join again.');
      return;
    }

    session.restarting = true;

    // Exponential backoff: 2s, 4s, 8s, 16s, 32s
    const delay = Math.min(2000 * Math.pow(2, session.restartCount - 1), 32000);
    console.log(`[Greg] Restarting audio pipeline in ${delay / 1000}s (attempt ${session.restartCount}/5)...`);

    this._teardownPipeline(session);
    await new Promise(r => setTimeout(r, delay));

    if (session.destroyed) return; // /leave was called while we were waiting

    try {
      // Get a fresh access token (auto-refreshes if expired)
      const freshToken = await this.spotifyManager.getAccessToken(session.discordUserId);
      if (!freshToken) {
        console.error('[Greg] Cannot restart — Spotify token expired and refresh failed. Use /connect then /join.');
        session.restarting = false;
        return;
      }

      await this._startPipeline(session, freshToken);

      // Reset counter on successful restart
      session.restartCount = 0;
      session.restarting = false;

      console.log('[Greg] Audio pipeline restarted — select Greg in Spotify and hit play!');
    } catch (err) {
      console.error(`[Greg] Pipeline restart failed: ${err.message}`);
      session.restarting = false;
      // The player stateChange listener will trigger another attempt
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Process spawning
  // ═══════════════════════════════════════════════════════════════════════════

  _spawnLibrespot(accessToken) {
    const binary = process.platform === 'win32' ? 'librespot.exe' : 'librespot';
    const args = [
      '--name',         process.env.SPOTIFY_DEVICE_NAME || 'Greg',
      '--backend',      'pipe',
      '--bitrate',      '320',
      '--access-token', accessToken,
      '--format',       'S16',
      '--disable-audio-cache',
      '--disable-gapless',
      '--quiet',
    ];

    console.log(`[librespot] Starting with fresh token`);
    const proc = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    proc.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.log(`[librespot] ${msg}`);
    });
    proc.on('close', (code) => {
      console.log(`[librespot] Process exited (code ${code ?? 'null'})`);
    });
    proc.on('error', (err) => console.error(`[librespot] ${err.message}`));
    return proc;
  }

  _spawnFfmpeg(inputStream) {
    const args = [
      '-f',        's16le',
      '-ar',       '44100',
      '-ac',       '2',
      '-i',        'pipe:0',
      '-ar',       '48000',
      '-ac',       '2',
      '-c:a',      'libopus',
      '-b:a',      '128k',
      '-application', 'audio',
      '-frame_duration', '20',
      '-vbr',      'on',
      '-f',        'ogg',
      '-loglevel', 'warning',
      'pipe:1',
    ];

    const proc = spawn('ffmpeg', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    inputStream.pipe(proc.stdin, { end: false });

    proc.stdin.on('error', (err) => {
      if (err.code !== 'EPIPE') console.error(`[ffmpeg stdin] ${err.message}`);
    });
    proc.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.error(`[ffmpeg] ${msg}`);
    });
    proc.on('error', (err) => console.error(`[ffmpeg] ${err.message}`));
    return proc;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Public API
  // ═══════════════════════════════════════════════════════════════════════════

  leave(guildId) {
    const session = this.sessions.get(guildId);
    if (!session) return;

    session.destroyed = true;
    this._teardownPipeline(session);
    try { session.connection.destroy(); } catch {}
    this.sessions.delete(guildId);
    console.log(`[Greg] Left voice channel in guild ${guildId}`);
  }

  getConnection(guildId) {
    return this.sessions.get(guildId) ?? null;
  }
}

module.exports = VoiceManager;
