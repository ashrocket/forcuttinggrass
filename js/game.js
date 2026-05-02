// ═══════════════════════════════════════════════════════════════════
//  GRASS CUTTER 2003  —  Full Phaser 3 Game
// ═══════════════════════════════════════════════════════════════════

// ─── Layout constants ────────────────────────────────────────────
const CW      = 800;   // canvas width
const CH      = 600;   // canvas height
const TILE    = 32;
const GRID_W  = 25;
const GRID_H  = 15;
const TITLE_H = 40;    // top title bar
const LAWN_Y  = TITLE_H;
const LAWN_W  = GRID_W * TILE;   // 800
const LAWN_H  = GRID_H * TILE;   // 480
const HUD_Y   = LAWN_Y + LAWN_H; // 520
const HUD_H   = CH - HUD_Y;      // 80

// ─── Tile types ──────────────────────────────────────────────────
const T_TALL  = 0;
const T_CUT   = 1;
const T_STUMP = 2;

// ─── Colors ──────────────────────────────────────────────────────
const C_GRASS_TALL  = 0x2d7a2d;
const C_GRASS_BLADE = 0x45b045;
const C_GRASS_CUT   = 0x8bc44a;
const C_STUMP       = 0x8b4513;
const C_MOWER       = 0xffcc00;
const C_MOWER_STRIPE= 0xff8800;
const C_WHEEL       = 0x222222;
const C_GAS_CAN     = 0xdd2222;
const C_CRICKET     = 0x228b22;
const C_HUD_BG      = 0x0d1a0d;

// ─── Level configs ────────────────────────────────────────────────
const LEVELS = [
  {
    n: 1, title: 'LEVEL 1', sub: 'FRESH CUT',
    desc: 'Mow the lawn. Simple.',
    gasMax: 600, gasDrain: 0.10,
    cans: 0, stumps: 0, crickets: 0, cricketMs: 0,
    win: 0.80,
  },
  {
    n: 2, title: 'LEVEL 2', sub: 'RUNNING ON FUMES',
    desc: 'Gas runs out — find the gas can!',
    gasMax: 200, gasDrain: 0.18,
    cans: 1, stumps: 0, crickets: 0, cricketMs: 0,
    win: 0.80,
  },
  {
    n: 3, title: 'LEVEL 3', sub: 'STUMP TROUBLE',
    desc: 'Hold SPACE near stumps to dig them up.',
    gasMax: 180, gasDrain: 0.20,
    cans: 1, stumps: 2, crickets: 0, cricketMs: 0,
    win: 0.80,
  },
  {
    n: 4, title: 'LEVEL 4', sub: 'CRICKET SEASON',
    desc: 'Crickets hop around. Hit one = lose gas!',
    gasMax: 160, gasDrain: 0.22,
    cans: 1, stumps: 2, crickets: 2, cricketMs: 1200,
    win: 0.85,
  },
  {
    n: 5, title: 'LEVEL 5', sub: 'THE FINAL YARD',
    desc: 'Everything at once. Good luck.',
    gasMax: 140, gasDrain: 0.25,
    cans: 2, stumps: 3, crickets: 3, cricketMs: 750,
    win: 0.90,
  },
];

// ─── Web Audio SFX ───────────────────────────────────────────────
const SFX = {
  _ctx: null,
  _mower: null,

  init() {
    if (this._ctx) return;
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
  },

  startMow() {
    if (!this._ctx || this._mower) return;
    const osc  = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    const dist = this._ctx.createWaveShaper();
    dist.curve = _distCurve(80);
    osc.connect(dist); dist.connect(gain); gain.connect(this._ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.value = 88;
    gain.gain.value = 0.07;
    osc.start();
    this._mower = { osc, gain };
  },

  stopMow() {
    if (!this._mower) return;
    this._mower.gain.gain.setTargetAtTime(0, this._ctx.currentTime, 0.15);
    const m = this._mower; this._mower = null;
    setTimeout(() => { try { m.osc.stop(); } catch (_) {} }, 400);
  },

  pickup()       { this._seq([523,659,784],     0.14, 75,  'sine'); },
  splat()        { this._seq([380,240,140],     0.22, 90,  'square'); },
  dig()          { this._beep(130, 0.07, 'square'); },
  levelDone()    { this._seq([523,659,784,1047],0.28, 140, 'sine'); },
  gameOver()     { this._seq([350,250,160,90],  0.36, 180, 'sawtooth'); },
  sputter()      { this._seq([120,100,80,60],   0.3,  120, 'sawtooth'); },

  _seq(fs, d, gap, t) { fs.forEach((f,i) => setTimeout(() => this._beep(f,d,t), i*gap)); },

  _beep(f, d, t) {
    if (!this._ctx) return;
    const o = this._ctx.createOscillator();
    const g = this._ctx.createGain();
    o.connect(g); g.connect(this._ctx.destination);
    o.type = t; o.frequency.value = f;
    g.gain.setValueAtTime(0.18, this._ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + d);
    o.start(); o.stop(this._ctx.currentTime + d + 0.02);
  },
};

function _distCurve(k) {
  const n = 256, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
  }
  return c;
}

// ═══════════════════════════════════════════════════════════════════
//  BootScene — waits for Spotify overlay to clear
// ═══════════════════════════════════════════════════════════════════
class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'Boot' }); }

  create() {
    this.add.rectangle(CW / 2, CH / 2, CW, CH, 0x000000);
    this.add.text(CW / 2, CH / 2, 'LOADING...', {
      fontSize: '20px', fill: '#444444', fontFamily: 'Courier New',
    }).setOrigin(0.5);
    this._poll();
  }

  _poll() {
    if (window._gameReady) { this.scene.start('Menu'); return; }
    this.time.delayedCall(100, () => this._poll());
  }
}

// ═══════════════════════════════════════════════════════════════════
//  MenuScene
// ═══════════════════════════════════════════════════════════════════
class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'Menu' }); }

  create() {
    // Background lawn grid
    const bg = this.add.graphics();
    bg.fillStyle(C_GRASS_TALL);
    bg.fillRect(0, 0, CW, CH);
    bg.lineStyle(1, 0x000000, 0.07);
    for (let x = 0; x <= CW; x += TILE) bg.lineBetween(x, 0, x, CH);
    for (let y = 0; y <= CH; y += TILE) bg.lineBetween(0, y, CW, y);

    // Decorative blade blobs
    bg.fillStyle(C_GRASS_BLADE);
    for (let r = 0; r < GRID_H; r++) {
      for (let c = 0; c < GRID_W; c++) {
        const x = c * TILE, y = r * TILE;
        bg.fillTriangle(x+4,y+TILE, x+8,y+10, x+12,y+TILE);
        bg.fillTriangle(x+18,y+TILE, x+22,y+8, x+26,y+TILE);
      }
    }

    // Title panel
    const panel = this.add.rectangle(CW/2, CH/2 - 70, 540, 220, 0x000000, 0.88);
    panel.setStrokeStyle(4, C_MOWER);

    this.add.text(CW/2, CH/2 - 170, 'GRASS CUTTER', {
      fontSize: '58px', fill: '#ffcc00', fontFamily: 'Courier New',
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 7,
    }).setOrigin(0.5);

    this.add.text(CW/2, CH/2 - 110, '✦ 2003 EDITION ✦', {
      fontSize: '18px', fill: '#ffffff', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    const spStatus = window._spotifyConnected ? '● SPOTIFY CONNECTED' : '○ NO SPOTIFY';
    const spColor  = window._spotifyConnected ? '#1DB954' : '#666';
    this.add.text(CW/2, CH/2 - 80, `♫  THE GOON SONG  —  ${spStatus}`, {
      fontSize: '13px', fill: spColor, fontFamily: 'Courier New',
    }).setOrigin(0.5);

    // Blink "press start"
    const go = this.add.text(CW/2, CH/2 - 40, 'CLICK OR PRESS ENTER TO START', {
      fontSize: '20px', fill: '#fff', fontFamily: 'Courier New', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.tweens.add({ targets: go, alpha: 0.1, duration: 550, yoyo: true, repeat: -1 });

    // Level select
    this.add.text(CW/2, CH/2 + 20, 'SELECT LEVEL', {
      fontSize: '13px', fill: '#aaa', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    for (let i = 0; i < 5; i++) {
      const bx = CW/2 - 100 + i * 50;
      const by = CH/2 + 55;
      const box = this.add.rectangle(bx, by, 40, 40, 0x111111)
        .setStrokeStyle(2, C_MOWER)
        .setInteractive({ useHandCursor: true });
      const lbl = this.add.text(bx, by, `${i + 1}`, {
        fontSize: '18px', fill: '#fff', fontFamily: 'Courier New', fontStyle: 'bold',
      }).setOrigin(0.5);
      box.on('pointerover', () => { box.setFillStyle(0x334433); lbl.setStyle({ fill: '#ffcc00' }); });
      box.on('pointerout',  () => { box.setFillStyle(0x111111); lbl.setStyle({ fill: '#fff' }); });
      box.on('pointerdown', () => this._start(i + 1));
    }

    // Animated menu mower scrolling across
    this._menuMower = this._makeMiniMower(-64, CH / 2 + 110);
    this.tweens.add({
      targets: this._menuMower,
      x: CW + 64, duration: 3800, repeat: -1,
      onRepeat: () => { this._menuMower.x = -64; },
    });

    this.input.keyboard.on('keydown-ENTER', () => this._start(1));
    this.input.keyboard.on('keydown-SPACE', () => this._start(1));
    this.input.on('pointerdown', (ptr) => {
      if (ptr.y < CH/2 + 30 || ptr.y > CH/2 + 80) this._start(1);
    });
  }

  _start(n) {
    SFX.init();
    if (window._spotifyConnected && !window._musicPlaying) {
      SpotifyPlayer.play();
      window._musicPlaying = true;
    }
    this.scene.start('Game', { level: n });
  }

  _makeMiniMower(x, y) {
    const c = this.add.container(x, y).setDepth(10);
    const g = this.add.graphics();
    g.fillStyle(C_MOWER);    g.fillRect(-18, -12, 36, 24);
    g.lineStyle(3, 0x000000); g.strokeRect(-18, -12, 36, 24);
    g.fillStyle(C_MOWER_STRIPE); g.fillRect(-18, -4, 36, 8);
    g.fillStyle(C_WHEEL);
    [[-12,-8],[12,-8],[-12,8],[12,8]].forEach(([wx,wy]) => g.fillCircle(wx,wy,5));
    c.add(g);
    return c;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  GameScene — all 5 levels share this scene
// ═══════════════════════════════════════════════════════════════════
class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'Game' }); }

  // ── init ────────────────────────────────────────────────────────
  init(data) {
    this.lvlNum   = data.level || 1;
    this.cfg      = LEVELS[this.lvlNum - 1];
    this.gas      = this.cfg.gasMax;
    this.cutCount = 0;
    this.state    = 'playing'; // playing | sputtering | over | won
    this.sputter  = 0;
    this.lastHop  = 0;
    this.moving   = false;
    this.exhaustT = 0;
    this.lawnDirty= true;
  }

  // ── create ──────────────────────────────────────────────────────
  create() {
    SFX.init();

    // Build grid (all tall grass initially)
    this.grid = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(T_TALL));

    // Lawn graphics (redrawn when dirty)
    this.lawnGfx = this.add.graphics().setDepth(0);

    // Place objects
    this.cans     = [];
    this.stumps   = [];
    this.crickets = [];
    this._placeCans();
    this._placeStumps();
    this._placeCrickets();

    // Count mowable tiles (stumps excluded)
    this.totalMow = GRID_W * GRID_H - this.stumps.length;

    // Mower start position (center of lawn)
    this.mx = LAWN_W / 2;
    this.my = LAWN_Y + LAWN_H / 2;
    this._buildMower();

    // HUD
    this._buildTitleBar();
    this._buildHUD();

    // Splat flash overlay
    this.flashRect = this.add.rectangle(CW/2, CH/2, CW, CH, 0xff0000, 0).setDepth(60);

    // Input
    this.cur   = this.input.keyboard.createCursorKeys();
    this.wasd  = {
      up:    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.spKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  // ── update ──────────────────────────────────────────────────────
  update(time, delta) {
    if (this.state === 'over' || this.state === 'won') return;

    // Blade always spins
    this.blade.angle += 16;

    if (this.state === 'sputtering') {
      this.sputter += delta;
      this.mowerCont.x = this.mx + Phaser.Math.Between(-2, 2);
      this.mowerCont.y = this.my + Phaser.Math.Between(-1, 1);
      if (this.sputter > 1400) {
        this.state = 'over';
        this.time.delayedCall(600, () => this.scene.start('GameOver', { level: this.lvlNum }));
      }
      return;
    }

    this._input(delta);
    this._drainGas(delta);
    this._cutGrass();
    this._checkCans();
    this._checkStumps(delta);
    this._checkCrickets();
    this._moveCrickets(time);
    this._exhaust(delta);
    this._updateHUD();
    this._checkWin();

    if (this.lawnDirty) { this._drawLawn(); this.lawnDirty = false; }
  }

  // ── input & movement ────────────────────────────────────────────
  _input(delta) {
    const dt = delta / 1000;
    let dx = 0, dy = 0;
    if (this.cur.left.isDown  || this.wasd.left.isDown)  dx = -1;
    if (this.cur.right.isDown || this.wasd.right.isDown) dx =  1;
    if (this.cur.up.isDown    || this.wasd.up.isDown)    dy = -1;
    if (this.cur.down.isDown  || this.wasd.down.isDown)  dy =  1;

    if (dx === 0 && dy === 0) {
      if (this.moving) { SFX.stopMow(); this.moving = false; }
      return;
    }

    if (!this.moving) { SFX.startMow(); this.moving = true; }

    // Rotate mower to face movement
    this.mowerCont.setRotation(Math.atan2(dy, dx) + Math.PI / 2);

    const spd = 155 * dt;
    const nx  = this.mx + dx * spd;
    const ny  = this.my + dy * spd;

    if (!this._blocked(nx, this.my)) this.mx = nx;
    if (!this._blocked(this.mx, ny)) this.my = ny;

    this.mx = Phaser.Math.Clamp(this.mx, 18, LAWN_W - 18);
    this.my = Phaser.Math.Clamp(this.my, LAWN_Y + 18, LAWN_Y + LAWN_H - 18);

    this.mowerCont.x = this.mx;
    this.mowerCont.y = this.my;
  }

  _blocked(x, y) {
    const h = 12; // collision half-size
    const pts = [
      [x-h, y-LAWN_Y-h], [x+h, y-LAWN_Y-h],
      [x-h, y-LAWN_Y+h], [x+h, y-LAWN_Y+h],
    ];
    for (const [cx, cy] of pts) {
      const tx = Math.floor(cx / TILE);
      const ty = Math.floor(cy / TILE);
      if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) return true;
      if (this.grid[ty][tx] === T_STUMP) return true;
    }
    return false;
  }

  // ── grass cutting ────────────────────────────────────────────────
  _cutGrass() {
    if (!this.moving) return;
    const h   = 15;
    const lxT = Math.floor((this.mx - h) / TILE);
    const rxT = Math.floor((this.mx + h) / TILE);
    const tyT = Math.floor((this.my - LAWN_Y - h) / TILE);
    const byT = Math.floor((this.my - LAWN_Y + h) / TILE);

    for (let gy = Math.max(0, tyT); gy <= Math.min(GRID_H-1, byT); gy++) {
      for (let gx = Math.max(0, lxT); gx <= Math.min(GRID_W-1, rxT); gx++) {
        if (this.grid[gy][gx] === T_TALL) {
          this.grid[gy][gx] = T_CUT;
          this.cutCount++;
          this.lawnDirty = true;
        }
      }
    }
  }

  // ── gas ─────────────────────────────────────────────────────────
  _drainGas(delta) {
    if (!this.moving) return;
    this.gas -= this.cfg.gasDrain * (delta / 16.67);
    if (this.gas <= 0) {
      this.gas = 0;
      if (this.state === 'playing') {
        this.state = 'sputtering';
        this.sputter = 0;
        SFX.stopMow();
        SFX.sputter();
        this.moving = false;
      }
    }
  }

  // ── gas can pickup ───────────────────────────────────────────────
  _checkCans() {
    for (const can of this.cans) {
      if (can.dead) continue;
      const d = Phaser.Math.Distance.Between(this.mx, this.my, can.gfx.x, can.gfx.y);
      if (d < TILE) {
        can.dead = true;
        can.tween?.stop();
        can.gfx.setVisible(false);
        this.gas = this.cfg.gasMax;
        SFX.pickup();
        this._floatText(can.gfx.x, can.gfx.y, '+GAS!', '#ffcc00');
      }
    }
  }

  // ── stump digging ────────────────────────────────────────────────
  _checkStumps(delta) {
    if (!this.cfg.stumps) return;
    const digging = this.spKey.isDown;

    for (const s of this.stumps) {
      if (s.dug) continue;
      const d = Phaser.Math.Distance.Between(this.mx, this.my, s.wx, s.wy);
      const near = d < TILE * 2;

      s.barBg.setVisible(near);
      s.barFill.setVisible(near);

      if (near && digging) {
        s.prog += 0.35 * (delta / 1000);
        SFX.dig();
        s.barFill.setSize(Math.min(s.prog, 1) * 40, 8);

        if (s.prog >= 1) this._removeStump(s);
      }
    }
  }

  _removeStump(s) {
    s.dug = true;
    this.grid[s.ty][s.tx] = T_CUT;
    this.cutCount++;
    this.lawnDirty = true;
    s.gfx.destroy();
    s.barBg.destroy();
    s.barFill.destroy();
    SFX.pickup();
    this._floatText(s.wx, s.wy, 'STUMP GONE!', '#ffcc00', 20);
    // explosion puff
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const puff = this.add.circle(
        s.wx + Math.cos(angle) * 20, s.wy + Math.sin(angle) * 20, 6, 0x8b4513,
      ).setDepth(30);
      this.tweens.add({ targets: puff, alpha: 0, scaleX: 3, scaleY: 3, duration: 500, onComplete: () => puff.destroy() });
    }
  }

  // ── cricket collision ────────────────────────────────────────────
  _checkCrickets() {
    if (!this.cfg.crickets) return;
    for (const cr of this.crickets) {
      if (cr.splatted) continue;
      const d = Phaser.Math.Distance.Between(this.mx, this.my, cr.gfx.x, cr.gfx.y);
      if (d < TILE * 0.75) this._splat(cr);
    }
  }

  _splat(cr) {
    cr.splatted = true;
    SFX.splat();

    // Draw splat graphic
    cr.gfx.clear();
    cr.gfx.fillStyle(0x00aa00, 0.85);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      cr.gfx.fillCircle(Math.cos(a) * 12, Math.sin(a) * 12, 5);
    }
    cr.gfx.fillCircle(0, 0, 9);

    // Screen flash
    this.flashRect.setAlpha(0.45);
    this.tweens.add({ targets: this.flashRect, alpha: 0, duration: 380 });

    // Gas penalty
    this.gas = Math.max(0, this.gas - 30);
    this._floatText(cr.gfx.x, cr.gfx.y, '-30 GAS!', '#ff4444', 18);

    // Fade splat after 2s
    this.time.delayedCall(2000, () => {
      this.tweens.add({ targets: cr.gfx, alpha: 0, duration: 500, onComplete: () => cr.gfx.destroy() });
    });
  }

  // ── cricket AI ──────────────────────────────────────────────────
  _moveCrickets(time) {
    if (!this.cfg.crickets || !this.cfg.cricketMs) return;
    if (time - this.lastHop < this.cfg.cricketMs) return;
    this.lastHop = time;

    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const cr of this.crickets) {
      if (cr.splatted || cr.hopping) continue;
      Phaser.Utils.Array.Shuffle(dirs);
      for (const [dx, dy] of dirs) {
        const nx = cr.tx + dx, ny = cr.ty + dy;
        if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
        if (this.grid[ny][nx] === T_STUMP) continue;

        cr.tx = nx; cr.ty = ny;
        const wx = nx * TILE + TILE / 2;
        const wy = LAWN_Y + ny * TILE + TILE / 2;
        const hop = this.cfg.cricketMs;

        cr.hopping = true;
        // arc up then land
        this.tweens.add({
          targets: cr.gfx, x: wx, y: wy - 14,
          duration: hop * 0.35, ease: 'Quad.easeOut',
          onComplete: () => {
            this.tweens.add({
              targets: cr.gfx, y: wy, duration: hop * 0.25, ease: 'Bounce.easeOut',
              onComplete: () => { cr.hopping = false; },
            });
          },
        });
        break;
      }
    }
  }

  // ── exhaust puffs ────────────────────────────────────────────────
  _exhaust(delta) {
    if (!this.moving) return;
    this.exhaustT += delta;
    if (this.exhaustT < 130) return;
    this.exhaustT = 0;
    const puff = this.add.circle(
      this.mx + Phaser.Math.Between(-4, 4),
      this.my + 18,
      Phaser.Math.Between(3, 6), 0x888888, 0.55,
    ).setDepth(8);
    this.tweens.add({ targets: puff, y: puff.y - 22, alpha: 0, scaleX: 2, scaleY: 2, duration: 550, onComplete: () => puff.destroy() });
  }

  // ── win / lose ───────────────────────────────────────────────────
  _checkWin() {
    if (this.state !== 'playing') return;
    if (this.cutCount / this.totalMow >= this.cfg.win) {
      this.state = 'won';
      SFX.stopMow();
      SFX.levelDone();
      this.time.delayedCall(900, () => this.scene.start('LevelComplete', { level: this.lvlNum }));
    }
  }

  // ── HUD update ───────────────────────────────────────────────────
  _updateHUD() {
    const pct = this.gas / this.cfg.gasMax;
    const barW = Math.max(0, pct * 196);
    this.gasBar.setSize(barW, 14);

    if (pct > 0.5)       this.gasBar.setFillStyle(0x00cc44);
    else if (pct > 0.25) this.gasBar.setFillStyle(0xffaa00);
    else                 this.gasBar.setFillStyle(0xff3333);

    const cutPct = Math.floor((this.cutCount / this.totalMow) * 100);
    this.cutTxt.setText(`CUT: ${cutPct}%`);
    this.gasPctTxt.setText(`${Math.floor(pct * 100)}%`);
  }

  // ── object placement ─────────────────────────────────────────────
  _placeCans() {
    for (let i = 0; i < this.cfg.cans; i++) {
      const { tx, ty } = this._freeCell(6);
      const wx = tx * TILE + TILE / 2;
      const wy = LAWN_Y + ty * TILE + TILE / 2;
      const g  = this.add.graphics().setDepth(3);
      _drawCan(g);
      g.x = wx; g.y = wy;
      const tw = this.tweens.add({ targets: g, y: wy - 7, duration: 580, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.cans.push({ gfx: g, tx, ty, wx, wy, dead: false, tween: tw });
    }
  }

  _placeStumps() {
    for (let i = 0; i < this.cfg.stumps; i++) {
      const { tx, ty } = this._freeCell(5);
      this.grid[ty][tx] = T_STUMP;
      const wx = tx * TILE + TILE / 2;
      const wy = LAWN_Y + ty * TILE + TILE / 2;
      const g  = this.add.graphics().setDepth(4);
      _drawStump(g);
      g.x = wx; g.y = wy;

      const barBg = this.add.rectangle(wx, wy - 26, 44, 12, 0x111111).setDepth(14).setVisible(false);
      const barFill = this.add.rectangle(wx - 18, wy - 26, 0, 8, 0xffaa00)
        .setOrigin(0, 0.5).setDepth(15).setVisible(false);

      this.stumps.push({ gfx: g, tx, ty, wx, wy, dug: false, prog: 0, barBg, barFill });
    }
  }

  _placeCrickets() {
    for (let i = 0; i < this.cfg.crickets; i++) {
      const { tx, ty } = this._freeCell(3);
      const wx = tx * TILE + TILE / 2;
      const wy = LAWN_Y + ty * TILE + TILE / 2;
      const g  = this.add.graphics().setDepth(5);
      _drawCricket(g);
      g.x = wx; g.y = wy;
      this.crickets.push({ gfx: g, tx, ty, splatted: false, hopping: false });
    }
  }

  _freeCell(minManhattan = 3) {
    const cx = GRID_W / 2, cy = GRID_H / 2;
    for (let attempt = 0; attempt < 300; attempt++) {
      const tx = Phaser.Math.Between(1, GRID_W - 2);
      const ty = Phaser.Math.Between(1, GRID_H - 2);
      if (this.grid[ty][tx] !== T_TALL) continue;
      if (Math.abs(tx - cx) + Math.abs(ty - cy) < minManhattan) continue;
      return { tx, ty };
    }
    // Fallback: any open cell
    for (let ty = 1; ty < GRID_H - 1; ty++)
      for (let tx = 1; tx < GRID_W - 1; tx++)
        if (this.grid[ty][tx] === T_TALL) return { tx, ty };
    return { tx: 1, ty: 1 };
  }

  // ── build mower container ────────────────────────────────────────
  _buildMower() {
    this.mowerCont = this.add.container(this.mx, this.my).setDepth(10);

    const body = this.add.graphics();
    body.fillStyle(C_MOWER);        body.fillRect(-20, -13, 40, 26);
    body.lineStyle(3, 0x000000);    body.strokeRect(-20, -13, 40, 26);
    body.fillStyle(C_MOWER_STRIPE); body.fillRect(-20, -4, 40, 8);
    body.fillStyle(C_WHEEL);
    [[-13,-9],[13,-9],[-13,9],[13,9]].forEach(([wx,wy]) => {
      body.fillCircle(wx, wy, 6);
      body.fillStyle(0x888888); body.fillCircle(wx, wy, 3);
      body.fillStyle(C_WHEEL);
    });
    body.fillStyle(0x666666);
    body.fillRect(-3, 13, 6, 14);
    body.fillRect(-12, 23, 24, 5);

    // Spinning blade
    this.blade = this.add.graphics();
    this.blade.fillStyle(0xbbbbbb); this.blade.fillCircle(0, 0, 10);
    this.blade.fillStyle(0x999999);
    this.blade.fillRect(-10, -2, 20, 4);
    this.blade.fillRect(-2, -10, 4, 20);
    this.blade.lineStyle(2, 0x333333); this.blade.strokeCircle(0, 0, 10);

    this.mowerCont.add([body, this.blade]);
  }

  // ── build title bar & HUD ────────────────────────────────────────
  _buildTitleBar() {
    this.add.rectangle(CW/2, TITLE_H/2, CW, TITLE_H, 0x111111).setDepth(20);
    this.add.text(10, TITLE_H/2,
      `${this.cfg.title}: ${this.cfg.sub}  —  ${this.cfg.desc}`, {
      fontSize: '13px', fill: '#ffcc00', fontFamily: 'Courier New',
    }).setOrigin(0, 0.5).setDepth(21);
    const sp = window._spotifyConnected ? '♫ THE GOON SONG' : '♫ NO MUSIC';
    const sc = window._spotifyConnected ? '#1DB954' : '#444';
    this.add.text(CW - 10, TITLE_H/2, sp, {
      fontSize: '12px', fill: sc, fontFamily: 'Courier New',
    }).setOrigin(1, 0.5).setDepth(21);
  }

  _buildHUD() {
    // Dark HUD strip
    this.add.rectangle(CW/2, HUD_Y + HUD_H/2, CW, HUD_H, C_HUD_BG).setDepth(20);

    // Row 1: gas
    this.add.text(10, HUD_Y + 16, 'GAS:', {
      fontSize: '13px', fill: '#aaa', fontFamily: 'Courier New',
    }).setOrigin(0, 0.5).setDepth(21);

    // Gas bar bg
    this.add.rectangle(215, HUD_Y + 16, 200, 18, 0x333333).setDepth(21);
    // Gas bar fill (origin left-center)
    this.gasBar = this.add.rectangle(117, HUD_Y + 16, 196, 14, 0x00cc44)
      .setOrigin(0, 0.5).setDepth(22);
    // Gas % label inside bar
    this.gasPctTxt = this.add.text(215, HUD_Y + 16, '100%', {
      fontSize: '11px', fill: '#fff', fontFamily: 'Courier New',
    }).setOrigin(0.5, 0.5).setDepth(23);

    // Cut %
    this.cutTxt = this.add.text(340, HUD_Y + 16, 'CUT: 0%', {
      fontSize: '16px', fill: '#fff', fontFamily: 'Courier New', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(21);

    // Goal
    this.add.text(500, HUD_Y + 16,
      `GOAL: ${Math.floor(this.cfg.win * 100)}%`, {
      fontSize: '14px', fill: '#ffcc00', fontFamily: 'Courier New',
    }).setOrigin(0, 0.5).setDepth(21);

    // Level indicator (dots)
    for (let i = 0; i < 5; i++) {
      const active = i < this.lvlNum;
      this.add.circle(680 + i * 18, HUD_Y + 16, 6, active ? C_MOWER : 0x333333).setDepth(21);
    }

    // Row 2: controls
    let ctrlTxt = 'WASD / ARROWS: mow';
    if (this.cfg.stumps > 0) ctrlTxt += '   HOLD SPACE: dig stumps';
    if (this.cfg.crickets > 0) ctrlTxt += '   ⚠ AVOID CRICKETS  (-30 gas per splat)';
    this.add.text(CW/2, HUD_Y + 42, ctrlTxt, {
      fontSize: '11px', fill: '#556655', fontFamily: 'Courier New',
    }).setOrigin(0.5, 0.5).setDepth(21);

    // Row 3: current gas cans / stumps remaining
    this.add.text(CW/2, HUD_Y + 62,
      `Cans: ${this.cfg.cans}  Stumps: ${this.cfg.stumps}  Crickets: ${this.cfg.crickets}`, {
      fontSize: '10px', fill: '#334433', fontFamily: 'Courier New',
    }).setOrigin(0.5, 0.5).setDepth(21);
  }

  // ── lawn renderer ────────────────────────────────────────────────
  _drawLawn() {
    this.lawnGfx.clear();

    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const x = gx * TILE;
        const y = LAWN_Y + gy * TILE;
        const t = this.grid[gy][gx];

        if (t === T_TALL) {
          this.lawnGfx.fillStyle(C_GRASS_TALL);
          this.lawnGfx.fillRect(x, y, TILE, TILE);
          this.lawnGfx.fillStyle(C_GRASS_BLADE);
          this.lawnGfx.fillTriangle(x+3, y+TILE, x+7, y+9,  x+11, y+TILE);
          this.lawnGfx.fillTriangle(x+13,y+TILE, x+17,y+7,  x+21, y+TILE);
          this.lawnGfx.fillTriangle(x+22,y+TILE, x+26,y+10, x+30, y+TILE);
        } else { // CUT or STUMP (stump object drawn on top)
          this.lawnGfx.fillStyle(C_GRASS_CUT);
          this.lawnGfx.fillRect(x, y, TILE, TILE);
          this.lawnGfx.fillStyle(0x7aad3a);
          this.lawnGfx.fillRect(x+5,  y+20, 2, 10);
          this.lawnGfx.fillRect(x+15, y+18, 2, 12);
          this.lawnGfx.fillRect(x+24, y+20, 2, 10);
        }
      }
    }

    // Subtle grid lines
    this.lawnGfx.lineStyle(1, 0x000000, 0.07);
    for (let gx = 0; gx <= GRID_W; gx++)
      this.lawnGfx.lineBetween(gx*TILE, LAWN_Y, gx*TILE, LAWN_Y+LAWN_H);
    for (let gy = 0; gy <= GRID_H; gy++)
      this.lawnGfx.lineBetween(0, LAWN_Y+gy*TILE, LAWN_W, LAWN_Y+gy*TILE);
  }

  // ── utility ──────────────────────────────────────────────────────
  _floatText(x, y, msg, color, size = 16) {
    const t = this.add.text(x, y, msg, {
      fontSize: `${size}px`, fill: color, fontFamily: 'Courier New', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: t, y: y - 55, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
  }
}

// ═══════════════════════════════════════════════════════════════════
//  LevelCompleteScene
// ═══════════════════════════════════════════════════════════════════
class LevelCompleteScene extends Phaser.Scene {
  constructor() { super({ key: 'LevelComplete' }); }

  init(data) { this.lvl = data.level; }

  create() {
    this.add.rectangle(CW/2, CH/2, CW, CH, 0x081808);

    // Confetti
    for (let i = 0; i < 50; i++) {
      const x   = Phaser.Math.Between(0, CW);
      const col = [0xffcc00, 0xff4444, 0x44ff44, 0x4488ff, 0xff44cc][i % 5];
      const dot = this.add.circle(x, -12, Phaser.Math.Between(5, 11), col);
      this.tweens.add({
        targets: dot, y: CH + 20, x: x + Phaser.Math.Between(-80, 80),
        duration: Phaser.Math.Between(1600, 3200), delay: Phaser.Math.Between(0, 800),
        repeat: -1,
      });
    }

    // Big text
    const banner = this.add.text(CW/2, 140, 'LEVEL COMPLETE!', {
      fontSize: '56px', fill: '#ffcc00', fontFamily: 'Courier New',
      fontStyle: 'bold', stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5).setScale(0.1);
    this.tweens.add({ targets: banner, scaleX: 1, scaleY: 1, duration: 400, ease: 'Back.easeOut' });

    this.add.text(CW/2, 240, LEVELS[this.lvl - 1].sub + ' — CLEARED!', {
      fontSize: '22px', fill: '#ffffff', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    if (this.lvl >= 5) {
      this.time.delayedCall(2000, () => this.scene.start('Win'));
      return;
    }

    const nextCfg = LEVELS[this.lvl];
    this.add.text(CW/2, 300, `Next: ${nextCfg.title} — "${nextCfg.sub}"`, {
      fontSize: '17px', fill: '#8bc44a', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    const btn = this.add.text(CW/2, 380, `► LEVEL ${this.lvl + 1}`, {
      fontSize: '28px', fill: '#000', fontFamily: 'Courier New', fontStyle: 'bold',
      backgroundColor: '#ffcc00', padding: { x: 22, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setStyle({ fill: '#333' }));
    btn.on('pointerout',  () => btn.setStyle({ fill: '#000' }));
    btn.on('pointerdown', () => this.scene.start('Game', { level: this.lvl + 1 }));
    this.input.keyboard.on('keydown-ENTER', () => this.scene.start('Game', { level: this.lvl + 1 }));
    this.input.keyboard.on('keydown-SPACE', () => this.scene.start('Game', { level: this.lvl + 1 }));

    this.add.text(CW/2, 455, 'BACK TO MENU', {
      fontSize: '16px', fill: '#555', fontFamily: 'Courier New',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('Menu'));
  }
}

// ═══════════════════════════════════════════════════════════════════
//  GameOverScene
// ═══════════════════════════════════════════════════════════════════
class GameOverScene extends Phaser.Scene {
  constructor() { super({ key: 'GameOver' }); }

  init(data) { this.lvl = data.level; }

  create() {
    this.add.rectangle(CW/2, CH/2, CW, CH, 0x1a0000);

    // Dead mower graphic
    const g = this.add.graphics();
    g.fillStyle(0x888888); g.fillRect(CW/2-22, 200, 44, 30);
    g.lineStyle(3, 0x444444); g.strokeRect(CW/2-22, 200, 44, 30);
    g.fillStyle(0x555555); g.fillRect(CW/2-22, 212, 44, 8);
    // X eyes
    g.lineStyle(3, 0xff2222);
    [[CW/2-14,208,CW/2-4,218],[CW/2-4,208,CW/2-14,218],
     [CW/2+4,208,CW/2+14,218],[CW/2+14,208,CW/2+4,218]]
      .forEach(([x1,y1,x2,y2]) => g.lineBetween(x1,y1,x2,y2));
    // Sad smoke
    g.lineStyle(2, 0x666666);
    g.strokeCircle(CW/2, 198, 8); g.strokeCircle(CW/2, 186, 6); g.strokeCircle(CW/2, 176, 4);

    this.add.text(CW/2, 130, 'OUT OF GAS!', {
      fontSize: '54px', fill: '#ff3333', fontFamily: 'Courier New',
      fontStyle: 'bold', stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5);

    this.add.text(CW/2, 265, `Level ${this.lvl}: ${LEVELS[this.lvl-1].sub}`, {
      fontSize: '18px', fill: '#888', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    const retry = this.add.text(CW/2, 350, '↺  TRY AGAIN', {
      fontSize: '28px', fill: '#000', fontFamily: 'Courier New', fontStyle: 'bold',
      backgroundColor: '#ffcc00', padding: { x: 22, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    retry.on('pointerover', () => retry.setStyle({ fill: '#333' }));
    retry.on('pointerdown', () => this.scene.start('Game', { level: this.lvl }));
    this.input.keyboard.on('keydown-ENTER', () => this.scene.start('Game', { level: this.lvl }));

    this.add.text(CW/2, 440, 'BACK TO MENU', {
      fontSize: '16px', fill: '#555', fontFamily: 'Courier New',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('Menu'));
  }
}

// ═══════════════════════════════════════════════════════════════════
//  WinScene — all 5 levels cleared
// ═══════════════════════════════════════════════════════════════════
class WinScene extends Phaser.Scene {
  constructor() { super({ key: 'Win' }); }

  create() {
    SFX.levelDone();

    const bg = this.add.graphics();
    bg.fillStyle(0x081408); bg.fillRect(0, 0, CW, CH);
    // Rainbow stripes
    const stripes = [0xff0000,0xff8800,0xffff00,0x00cc00,0x0088ff,0x8800ff];
    stripes.forEach((c, i) => {
      bg.fillStyle(c, 0.08); bg.fillRect(0, i * (CH/6), CW, CH/6);
    });

    // Mower victory lap
    const vic = this.add.container(-50, CH/2 + 60).setDepth(5);
    const vg = this.add.graphics();
    vg.fillStyle(C_MOWER);    vg.fillRect(-22, -14, 44, 28);
    vg.lineStyle(3, 0x000000); vg.strokeRect(-22, -14, 44, 28);
    vg.fillStyle(C_MOWER_STRIPE); vg.fillRect(-22, -4, 44, 8);
    vic.add(vg);
    this.tweens.add({ targets: vic, x: CW + 50, duration: 3000, repeat: -1, onRepeat: () => { vic.x = -50; } });

    this.add.text(CW/2, 100, '🏆 YOU WIN! 🏆', {
      fontSize: '58px', fill: '#ffcc00', fontFamily: 'Courier New',
      fontStyle: 'bold', stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5);

    this.add.text(CW/2, 190, 'ALL 5 YARDS MOWED!', {
      fontSize: '28px', fill: '#ffffff', fontFamily: 'Courier New', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(CW/2, 248, 'STUMPS REMOVED. CRICKETS DODGED.', {
      fontSize: '17px', fill: '#8bc44a', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    this.add.text(CW/2, 284, 'THE GOON SONG PLAYED IN FULL.', {
      fontSize: '17px', fill: '#1DB954', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    this.add.text(CW/2, 330, 'GRASS: CUT.', {
      fontSize: '22px', fill: '#ffcc00', fontFamily: 'Courier New', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Confetti blast
    for (let i = 0; i < 60; i++) {
      const x   = Phaser.Math.Between(0, CW);
      const col = [0xffcc00,0xff4444,0x44ff44,0x4488ff,0xff44cc,0xffffff][i%6];
      const dot = this.add.circle(x, -15, Phaser.Math.Between(4,10), col);
      this.tweens.add({
        targets: dot, y: CH + 20, x: x + Phaser.Math.Between(-120,120),
        duration: Phaser.Math.Between(2000, 4000), delay: Phaser.Math.Between(0, 1200), repeat: -1,
      });
    }

    const play = this.add.text(CW/2, 455, 'PLAY AGAIN', {
      fontSize: '26px', fill: '#000', fontFamily: 'Courier New', fontStyle: 'bold',
      backgroundColor: '#ffcc00', padding: { x: 24, y: 14 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    play.on('pointerover', () => play.setStyle({ fill: '#333' }));
    play.on('pointerdown', () => { window._musicPlaying = false; this.scene.start('Menu'); });
    this.input.keyboard.on('keydown-ENTER', () => { window._musicPlaying = false; this.scene.start('Menu'); });
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Drawing helpers (used by scene create methods)
// ═══════════════════════════════════════════════════════════════════

function _drawCan(g) {
  // Body
  g.fillStyle(C_GAS_CAN);  g.fillRect(-11, -10, 22, 22);
  g.lineStyle(2, 0x000000); g.strokeRect(-11, -10, 22, 22);
  // White highlight stripe
  g.fillStyle(0xffffff, 0.2); g.fillRect(-11, -10, 22, 5);
  // Cap
  g.fillStyle(0xffcc00);    g.fillRect(-6, -17, 12, 9);
  g.lineStyle(2, 0x000000); g.strokeRect(-6, -17, 12, 9);
  // Nozzle
  g.fillStyle(0xccaa00);    g.fillRect(-2, -21, 4, 6);
  // Handle
  g.lineStyle(3, 0x000000);
  g.beginPath(); g.moveTo(-11,-4); g.lineTo(-16,-4); g.lineTo(-16,6); g.lineTo(-11,6); g.strokePath();
  // G label
  g.fillStyle(0xffffff, 0.6); g.fillRect(-5, -4, 10, 12);
}

function _drawStump(g) {
  // Dirt shadow
  g.fillStyle(0x5c2d00, 0.4); g.fillEllipse(2, 17, 32, 10);
  // Main stump body
  g.fillStyle(C_STUMP);      g.fillCircle(0, 0, 15);
  g.lineStyle(3, 0x000000);  g.strokeCircle(0, 0, 15);
  // Tree rings
  g.lineStyle(1, 0x5c2d00, 0.7);
  [10, 6, 3].forEach(r => g.strokeCircle(0, 0, r));
  // Center dot
  g.fillStyle(0x5c2d00); g.fillCircle(0, 0, 2);
  // Roots
  g.lineStyle(3, 0x5c2d00);
  [[-7,12,-13,20],[-1,15,0,22],[6,12,11,20]].forEach(([x1,y1,x2,y2]) => {
    g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.strokePath();
  });
}

function _drawCricket(g) {
  // Body
  g.fillStyle(C_CRICKET);     g.fillEllipse(0, 2, 24, 15);
  g.lineStyle(2, 0x000000);   g.strokeEllipse(0, 2, 24, 15);
  // Head
  g.fillStyle(0x33aa33);      g.fillCircle(10, -2, 8);
  g.lineStyle(2, 0x000000);   g.strokeCircle(10, -2, 8);
  // Eye
  g.fillStyle(0x000000);      g.fillCircle(13, -3, 2.5);
  g.fillStyle(0xffffff);      g.fillCircle(14, -4, 1);
  // Antennae
  g.lineStyle(1, 0x000000);
  g.beginPath(); g.moveTo(12,-9); g.lineTo(20,-20); g.strokePath();
  g.beginPath(); g.moveTo(10,-10); g.lineTo(16,-22); g.strokePath();
  // Legs (3 pairs)
  g.lineStyle(2, 0x006600);
  [[-6,-3,-14,-10],[-2,-3,-8,-12],[3,-3,2,-12],
   [-6,8,-14,16],[-2,8,-6,16],[3,8,6,16]]
    .forEach(([x1,y1,x2,y2]) => { g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.strokePath(); });
  // Big hind legs
  g.lineStyle(3, 0x228b22);
  g.beginPath(); g.moveTo(-8,2); g.lineTo(-18,-6); g.lineTo(-12,14); g.strokePath();
}

// ═══════════════════════════════════════════════════════════════════
//  Phaser config & launch
// ═══════════════════════════════════════════════════════════════════
const PHASER_CONFIG = {
  type: Phaser.AUTO,
  width:  CW,
  height: CH,
  parent: 'game-container',
  backgroundColor: '#111',
  scene: [BootScene, MenuScene, GameScene, LevelCompleteScene, GameOverScene, WinScene],
  scale: {
    mode:       Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

window._gameInstance = new Phaser.Game(PHASER_CONFIG);
