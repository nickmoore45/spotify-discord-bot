const axios = require('axios');
const crypto = require('crypto');

/**
 * SpotifyManager - no callback server needed
 * Uses a paste-back OAuth flow instead of a redirect server
 */
class SpotifyManager {
  constructor() {
    this.tokens = new Map();
    this.pendingStates = new Map();
  }

  // ── OAuth URL ───────────────────────────────────────────────────────────────
  getAuthUrl(discordUserId) {
    const state = crypto.randomBytes(16).toString('hex');
    this.pendingStates.set(state, discordUserId);

    // Clean up after 10 min
    setTimeout(() => this.pendingStates.delete(state), 10 * 60 * 1000);

    const scopes = [
      'streaming',
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
    ].join(' ');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.SPOTIFY_CLIENT_ID,
      scope: scopes,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
      state,
    });

    return `https://accounts.spotify.com/authorize?${params}`;
  }

  // ── Handle pasted callback URL code ────────────────────────────────────────
  async handleCallbackCode(code, state, discordUserId) {
    // Verify state matches (CSRF protection)
    const expectedUserId = this.pendingStates.get(state);
    if (expectedUserId && expectedUserId !== discordUserId) {
      throw new Error('State mismatch — possible CSRF. Try /connect again.');
    }
    this.pendingStates.delete(state);

    const tokenData = await this.exchangeCode(code);
    this.tokens.set(discordUserId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    });

    console.log(`✅ Spotify connected for Discord user ${discordUserId}`);
  }

  // ── Exchange auth code for tokens ───────────────────────────────────────────
  async exchangeCode(code) {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
          ).toString('base64')}`,
        },
      }
    );
    return response.data;
  }

  // ── Refresh access token ────────────────────────────────────────────────────
  async refreshToken(discordUserId) {
    const stored = this.tokens.get(discordUserId);
    if (!stored) throw new Error('No token stored for this user.');

    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: stored.refreshToken,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
          ).toString('base64')}`,
        },
      }
    );

    const data = response.data;
    stored.accessToken = data.access_token;
    stored.expiresAt = Date.now() + data.expires_in * 1000;
    if (data.refresh_token) stored.refreshToken = data.refresh_token;
    this.tokens.set(discordUserId, stored);

    return stored.accessToken;
  }

  // ── Get valid access token (auto-refreshes) ─────────────────────────────────
  async getAccessToken(discordUserId) {
    const stored = this.tokens.get(discordUserId);
    if (!stored) return null;

    if (Date.now() > stored.expiresAt - 60_000) {
      return this.refreshToken(discordUserId);
    }

    return stored.accessToken;
  }

  isConnected(discordUserId) {
    return this.tokens.has(discordUserId);
  }

  getRefreshToken(discordUserId) {
    return this.tokens.get(discordUserId)?.refreshToken ?? null;
  }

  // No-op: kept for compatibility, no server needed anymore
  startAuthServer() {
    console.log('🎵 Greg ready — no auth server needed (using paste-back OAuth)');
  }
}

module.exports = SpotifyManager;
