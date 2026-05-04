// Spotify PKCE Auth + Web Playback SDK wrapper

const SpotifyAuth = {
  async login() {
    const verifier  = _pkceVerifier();
    const challenge = await _pkceChallenge(verifier);
    sessionStorage.setItem('sp_verifier', verifier);

    const p = new URLSearchParams({
      client_id:             CONFIG.spotifyClientId,
      response_type:         'code',
      redirect_uri:          CONFIG.spotifyRedirectUri,
      scope:                 'streaming user-read-email user-read-private',
      code_challenge_method: 'S256',
      code_challenge:        challenge,
    });
    window.location.href = `https://accounts.spotify.com/authorize?${p}`;
  },

  async handleCallback(code) {
    const verifier = sessionStorage.getItem('sp_verifier');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     CONFIG.spotifyClientId,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  CONFIG.spotifyRedirectUri,
        code_verifier: verifier,
      }),
    });
    if (!res.ok) return false;
    const d = await res.json();
    _saveTokens(d);
    return true;
  },

  hasToken() {
    return !!(sessionStorage.getItem('sp_token') &&
              Date.now() < +sessionStorage.getItem('sp_expires'));
  },

  getToken() { return sessionStorage.getItem('sp_token'); },

  async refresh() {
    const rt = sessionStorage.getItem('sp_refresh');
    if (!rt) return null;
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: rt,
        client_id:     CONFIG.spotifyClientId,
      }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    _saveTokens(d);
    return d.access_token;
  },
};

function _saveTokens(d) {
  sessionStorage.setItem('sp_token',   d.access_token);
  sessionStorage.setItem('sp_expires', Date.now() + d.expires_in * 1000);
  if (d.refresh_token) sessionStorage.setItem('sp_refresh', d.refresh_token);
}

function _pkceVerifier() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function _pkceChallenge(v) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─── Web Playback SDK wrapper ─────────────────────────────────────

const SpotifyPlayer = {
  _player: null,
  _deviceId: null,

  async init() {
    const token = SpotifyAuth.getToken();
    if (!token) return;

    await new Promise(r => {
      if (window._sdkReady) return r();
      window._onSDKReady = r;
    });

    this._player = new Spotify.Player({
      name: 'Grass Cutter 2003',
      getOAuthToken: async cb => {
        let t = SpotifyAuth.getToken();
        if (!t) t = await SpotifyAuth.refresh();
        cb(t);
      },
      volume: 0.75,
    });

    this._player.on('ready', ({ device_id }) => {
      this._deviceId = device_id;
      window._spotifyReady = true;
      console.log('[Spotify] ready, device:', device_id);
    });

    this._player.on('not_ready',           () => console.warn('[Spotify] went offline'));
    this._player.on('initialization_error', e  => console.error('[Spotify] init error:', e.message));
    this._player.on('authentication_error', e  => console.error('[Spotify] auth error:', e.message));
    this._player.on('account_error',        e  => console.error('[Spotify] account error (Premium required):', e.message));

    await this._player.connect();
  },

  async play(startMs = 0) {
    if (!this._deviceId) return;
    const token = SpotifyAuth.getToken() || await SpotifyAuth.refresh();
    if (!token) return;
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this._deviceId}`, {
      method:  'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ uris: [CONFIG.trackUri], position_ms: startMs }),
    });
  },

  pause()          { this._player?.pause(); },
  resume()         { this._player?.resume(); },
  setVolume(v)     { this._player?.setVolume(v); },
  isReady()        { return !!this._deviceId; },
};

// ─── Bootstrap on page load ───────────────────────────────────────

(async function bootstrap() {
  if (SpotifyAuth.hasToken()) {
    document.getElementById('spotify-overlay').classList.add('hidden');
    await SpotifyPlayer.init();
    window._spotifyConnected = true;
    window._gameReady = true;
  }
  // Otherwise overlay stays visible; user clicks Connect or Skip
})();
