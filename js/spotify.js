// Spotify token access — reads shared cookies set by the lobby.
// Auth is handled entirely at bandmusicgames.party; games never
// redirect to Spotify themselves.

const SpotifyAuth = {
  hasToken() { return !!_readToken('sp_token'); },
  getToken()  { return _readToken('sp_token'); },

  async refresh() {
    const rt = _readToken('sp_refresh');
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
    _writeToken('sp_token', d.access_token, d.expires_in);
    if (d.refresh_token) _writeToken('sp_refresh', d.refresh_token, 60 * 60 * 24 * 30);
    return d.access_token;
  },
};

// ─── Storage helpers ───────────────────────────────────────────────

function _readToken(name) {
  if (location.hostname === 'localhost') return sessionStorage.getItem(name);
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function _writeToken(name, value, maxAge) {
  if (location.hostname === 'localhost') {
    sessionStorage.setItem(name, value);
    return;
  }
  document.cookie = [
    `${name}=${encodeURIComponent(value)}`,
    `max-age=${maxAge}`,
    `domain=.bandmusicgames.party`,
    `path=/`,
    `secure`,
    `samesite=lax`,
  ].join('; ');
}

// ─── Web Playback SDK wrapper ──────────────────────────────────────

const SpotifyPlayer = {
  _player:   null,
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

    this._player.on('not_ready',            () => console.warn('[Spotify] went offline'));
    this._player.on('initialization_error', e  => console.error('[Spotify] init error:', e.message));
    this._player.on('authentication_error', e  => console.error('[Spotify] auth error:', e.message));
    this._player.on('account_error',        e  => console.error('[Spotify] account error (Premium required):', e.message));

    this._player.on('player_state_changed', state => {
      if (!state || !window._musicPlaying) return;
      // Track ended: paused at position 0 after having been playing
      if (state.paused && state.position === 0 && !state.loading) {
        SpotifyPlayer.play();
      }
    });

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

  pause()      { this._player?.pause(); },
  resume()     { this._player?.resume(); },
  setVolume(v) { this._player?.setVolume(v); },
  isReady()    { return !!this._deviceId; },
};

// ─── Bootstrap ────────────────────────────────────────────────────

(async function bootstrap() {
  const skip = _readToken('sp_skip') === '1';

  if (skip) {
    document.getElementById('spotify-overlay').classList.add('hidden');
    window._gameReady = true;
    return;
  }

  if (SpotifyAuth.hasToken()) {
    document.getElementById('spotify-overlay').classList.add('hidden');
    await SpotifyPlayer.init();
    window._spotifyConnected = true;
    window._gameReady = true;
    return;
  }

  // No token — send to lobby (unless local dev)
  if (location.hostname !== 'localhost') {
    window.location.href = 'https://bandmusicgames.party';
  }
  // On localhost overlay stays; skip button still works for testing
})();
