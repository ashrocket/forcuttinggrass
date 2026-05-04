// ─────────────────────────────────────────────────────────────────
//  GRASS CUTTER 2003 — Configuration
//  1. Go to https://developer.spotify.com/dashboard
//  2. Create an app, add redirect URI:
//       https://forcuttinggrass.goon.bandmusicgames.party
//     (also add http://localhost:8080 for local dev)
//  3. Paste your Client ID below
// ─────────────────────────────────────────────────────────────────

const CONFIG = {
  spotifyClientId:   'aa16f7f72c04485fb93d86d2f7ee33d1',
  spotifyRedirectUri: window.location.hostname === 'localhost'
    ? 'http://localhost:8080'
    : 'https://forcuttinggrass.goon.bandmusicgames.party',
  trackUri: 'spotify:track:6EJAb3oTjDFwrt1dpIJPbr',
};
