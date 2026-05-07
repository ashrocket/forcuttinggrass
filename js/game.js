// ═══════════════════════════════════════════════════════════════════
//  GRASS CUTTER 2003  —  Full Phaser 3 Game
// ═══════════════════════════════════════════════════════════════════

// ─── Layout constants ────────────────────────────────────────────
const CW      = 800;
const CH      = 600;
const TILE    = 32;
const GRID_W  = 25;
const GRID_H  = 15;
const TITLE_H = 40;
const LAWN_Y  = TITLE_H;
const LAWN_W  = GRID_W * TILE;
const LAWN_H  = GRID_H * TILE;
const HUD_Y   = LAWN_Y + LAWN_H;
const HUD_H   = 80;
const CTRL_Y  = CH;
const CTRL_H  = 140;
const TOTAL_H = CH + CTRL_H;

// ─── Tile types ──────────────────────────────────────────────────
const T_TALL   = 0;
const T_CUT    = 1;
const T_STUMP  = 2;
const T_HOUSE  = 3;  // impassable house footprint (level 1)
const T_GARDEN = 4;  // passable garden / porch bed (not mowable)

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
const C_DOG         = 0xc8a060;

// ─── Cookie helpers ───────────────────────────────────────────────
function saveLevel(n) {
  document.cookie = `fcg_level=${n};max-age=${60 * 60 * 24 * 365};path=/`;
}
function getSavedLevel() {
  const m = document.cookie.match(/fcg_level=(\d)/);
  return m ? Math.min(parseInt(m[1]), 5) : 1;
}
function hasWon() {
  return /fcg_won=1/.test(document.cookie);
}
function setWon() {
  document.cookie = `fcg_won=1;max-age=${60 * 60 * 24 * 365 * 10};path=/`;
}

// ─── Level configs ────────────────────────────────────────────────
const LEVELS = [
  {
    n: 1, title: 'LEVEL 1', sub: 'THE HOUSE NEXT DOOR',
    desc: 'Mow around the house and garden.',
    gasMax: 600, gasDrain: 0.10,
    cans: 0, stumps: 0, crickets: 0, dogs: 0, cricketMs: 0,
    win: 0.80,
  },
  {
    n: 2, title: 'LEVEL 2', sub: 'RUNNING ON FUMES',
    desc: 'Gas runs out — find the gas can!',
    gasMax: 200, gasDrain: 0.18,
    cans: 2, stumps: 0, crickets: 0, dogs: 0, cricketMs: 0,
    win: 0.80,
  },
  {
    n: 3, title: 'LEVEL 3', sub: 'STUMP TROUBLE',
    desc: 'Hold SPACE near stumps to dig them up.',
    gasMax: 180, gasDrain: 0.20,
    cans: 2, stumps: 2, crickets: 0, dogs: 0, cricketMs: 0,
    win: 0.80,
  },
  {
    n: 4, title: 'LEVEL 4', sub: 'CRICKET SEASON',
    desc: 'Crickets hop around. Hit one = lose gas!  Watch the dog!',
    gasMax: 160, gasDrain: 0.22,
    cans: 2, stumps: 2, crickets: 2, dogs: 1, cricketMs: 1200,
    win: 0.85,
  },
  {
    n: 5, title: 'LEVEL 5', sub: 'THE FINAL YARD',
    desc: 'Everything at once. Good luck.',
    gasMax: 140, gasDrain: 0.25,
    cans: 4, stumps: 3, crickets: 3, dogs: 2, cricketMs: 750,
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

  pickup()    { this._seq([523, 659, 784],      0.14, 75,  'sine'); },
  splat()     { this._seq([380, 240, 140],      0.22, 90,  'square'); },
  dig()       { this._beep(130, 0.07, 'square'); },
  levelDone() { this._seq([523, 659, 784, 1047], 0.28, 140, 'sine'); },
  gameOver()  { this._seq([350, 250, 160, 90],   0.36, 180, 'sawtooth'); },
  sputter()   { this._seq([120, 100, 80, 60],    0.3,  120, 'sawtooth'); },
  bark()      { this._beep(200, 0.12, 'square'); },

  combo(n) {
    const tier = n >= 10 ? [784, 1047, 1319] : n >= 5 ? [659, 784, 1047] : [523, 659, 784];
    this._seq(tier, 0.10, 60, 'sine');
  },

  _seq(fs, d, gap, t) { fs.forEach((f, i) => setTimeout(() => this._beep(f, d, t), i * gap)); },

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
    window._totalScore = 0;

    const bg = this.add.graphics();
    bg.fillStyle(C_GRASS_TALL);
    bg.fillRect(0, 0, CW, CH);
    bg.lineStyle(1, 0x000000, 0.07);
    for (let x = 0; x <= CW; x += TILE) bg.lineBetween(x, 0, x, CH);
    for (let y = 0; y <= CH; y += TILE) bg.lineBetween(0, y, CW, y);

    bg.fillStyle(C_GRASS_BLADE);
    for (let r = 0; r < GRID_H; r++) {
      for (let c = 0; c < GRID_W; c++) {
        const x = c * TILE, y = r * TILE;
        bg.fillTriangle(x + 4, y + TILE, x + 8,  y + 10, x + 12, y + TILE);
        bg.fillTriangle(x + 18, y + TILE, x + 22, y + 8,  x + 26, y + TILE);
      }
    }

    const panel = this.add.rectangle(CW / 2, CH / 2 - 15, 480, 320, 0x000000, 0.88);
    panel.setStrokeStyle(4, C_MOWER);

    this.add.text(CW / 2, CH / 2 - 170, 'GRASS CUTTER', {
      fontSize: '58px', fill: '#ffcc00', fontFamily: 'Courier New',
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 7,
    }).setOrigin(0.5);

    this.add.text(CW / 2, CH / 2 - 110, '✦ 2003 EDITION ✦', {
      fontSize: '18px', fill: '#ffffff', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    const spStatus = window._spotifyConnected ? '● SPOTIFY CONNECTED' : '○ NO SPOTIFY';
    const spColor  = window._spotifyConnected ? '#1DB954' : '#666';
    this.add.text(CW / 2, CH / 2 - 80, `♫  FOR CUTTING GRASS BY GOON  —  ${spStatus}`, {
      fontSize: '13px', fill: spColor, fontFamily: 'Courier New',
    }).setOrigin(0.5);

    this.add.text(CW / 2, CH / 2 - 125, 'SELECT LEVEL', {
      fontSize: '13px', fill: '#aaa', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    const saved = getSavedLevel();
    const LEVEL_LABELS = ['HOUSE', 'GAS', 'STUMPS', 'BUGS', 'FINAL'];

    for (let i = 0; i < 5; i++) {
      const bx = CW / 2 - 160 + i * 80;
      const by = CH / 2 - 75;
      const isSaved = (i + 1 === saved && saved > 1);
      const box = this.add.rectangle(bx, by, 50, 50, isSaved ? 0x224422 : 0x111111)
        .setStrokeStyle(isSaved ? 3 : 2, isSaved ? 0xffcc00 : C_MOWER)
        .setInteractive({ useHandCursor: true });
      const lbl = this.add.text(bx, by - 2, `${i + 1}`, {
        fontSize: '22px', fill: isSaved ? '#ffcc00' : '#fff',
        fontFamily: 'Courier New', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(bx, by + 36, LEVEL_LABELS[i], {
        fontSize: '9px', fill: isSaved ? '#ffcc00' : '#666',
        fontFamily: 'Courier New',
      }).setOrigin(0.5);
      box.on('pointerover', () => { box.setFillStyle(0x334433); lbl.setStyle({ fill: '#ffcc00' }); });
      box.on('pointerout',  () => { box.setFillStyle(isSaved ? 0x224422 : 0x111111); lbl.setStyle({ fill: isSaved ? '#ffcc00' : '#fff' }); });
      box.on('pointerdown', () => this._start(i + 1));
    }

    if (saved > 1) {
      const btn = this.add.text(CW / 2, CH / 2 + 30, 'CONTINUE', {
        fontSize: '30px', fill: '#000', fontFamily: 'Courier New', fontStyle: 'bold',
        backgroundColor: '#ffcc00', padding: { x: 32, y: 14 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setStyle({ fill: '#333' }));
      btn.on('pointerout',  () => btn.setStyle({ fill: '#000' }));
      btn.on('pointerdown', () => this._start(saved));
      this.add.text(CW / 2, CH / 2 + 82, `Level ${saved}`, {
        fontSize: '13px', fill: '#888', fontFamily: 'Courier New',
      }).setOrigin(0.5);
    }

    this._menuMower = this._makeMiniMower(-64, CH / 2 + 130);
    this.tweens.add({
      targets: this._menuMower,
      x: CW + 64, duration: 3800, repeat: -1,
      onRepeat: () => { this._menuMower.x = -64; },
    });

    this.input.keyboard.on('keydown-ENTER', () => this._start(saved));
    this.input.keyboard.on('keydown-SPACE', () => this._start(saved));
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
    g.fillStyle(C_MOWER);        g.fillRect(-18, -12, 36, 24);
    g.lineStyle(3, 0x000000);    g.strokeRect(-18, -12, 36, 24);
    g.fillStyle(C_MOWER_STRIPE); g.fillRect(-18, -4, 36, 8);
    g.fillStyle(C_WHEEL);
    [[-12, -8], [12, -8], [-12, 8], [12, 8]].forEach(([wx, wy]) => g.fillCircle(wx, wy, 5));
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
    this.lvlNum    = data.level || 1;
    this.cfg       = LEVELS[this.lvlNum - 1];
    this.gas       = this.cfg.gasMax;
    this.cutCount  = 0;
    this.state     = 'playing';
    this.sputter   = 0;
    this.lastHop   = 0;
    this.moving    = false;
    this.exhaustT  = 0;
    this.lawnDirty = true;
    // Score / combo
    this.score         = 0;
    this.combo         = 1;
    this.comboIdleMs   = 0;
    this.lastComboTier = 0;
    // Mower face
    this.faceState  = 'normal';
    this.faceTimer  = 0;
    this.blinkTimer = Phaser.Math.Between(2000, 4000);
    // Sputter shake
    this.sputterShakeT = 0;
    // Replay mode
    this.replay = data.replay || false;
    this._rRow  = 0;
    this._rDir  = 1; // 1=right, -1=left
  }

  // ── create ──────────────────────────────────────────────────────
  create() {
    SFX.init();

    this.grid = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(T_TALL));
    if (this.lvlNum === 1) this._initLevel1Layout();

    this._buildBackdrop();
    this.lawnGfx = this.add.graphics().setDepth(0);
    if (this.lvlNum === 1) this._buildLevel1Scenery();

    this.cans     = [];
    this.stumps   = [];
    this.crickets = [];
    this.dogs     = [];
    this._placeCans();
    this._placeStumps();
    this._placeCrickets();
    this._placeDogs();

    let _mow = 0;
    for (let _gy = 0; _gy < GRID_H; _gy++)
      for (let _gx = 0; _gx < GRID_W; _gx++)
        if (this.grid[_gy][_gx] === T_TALL || this.grid[_gy][_gx] === T_STUMP) _mow++;
    this.totalMow = _mow;
    this.wideTimer = 0; // seconds remaining for double-wide power-up

    if (this.replay) {
      this.gas = 999999; // infinite gas during replay
      this.add.text(CW / 2, 4, '◄◄ REPLAY ×5 ◄◄', {
        fontSize: '13px', fill: '#ffcc00', fontFamily: 'Courier New', fontStyle: 'bold',
        backgroundColor: '#000000aa', padding: { x: 8, y: 3 },
      }).setOrigin(0.5, 0).setDepth(50);
    }

    this.mx = LAWN_W / 2;
    this.my = LAWN_Y + LAWN_H / 2;
    if (this.lvlNum === 1) this.my = LAWN_Y + 10 * TILE + TILE / 2; // start in open yard
    this._buildMower();

    this._buildTitleBar();
    this._buildHUD();

    this.flashRect = this.add.rectangle(CW / 2, CH / 2, CW, CH, 0xff0000, 0).setDepth(60);

    this.cur  = this.input.keyboard.createCursorKeys();
    this.wasd = {
      up:    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.spKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // ── Touch joystick ──────────────────────────────────────────
    this._touch = { active: false, startX: 0, startY: 0, dx: 0, dy: 0, digging: false };
    this._buildJoystick();
  }

  // ── update ──────────────────────────────────────────────────────
  update(time, delta) {
    if (this.state === 'over' || this.state === 'won') return;
    if (this.replay) delta *= 5; // everything runs at 5× in replay

    this.blade.angle += 16;

    if (this.state === 'sputtering') {
      this.sputter += delta;
      this.mowerCont.x = this.mx + Phaser.Math.Between(-2, 2);
      this.mowerCont.y = this.my + Phaser.Math.Between(-1, 1);
      this.sputterShakeT += delta;
      if (this.sputterShakeT > 200) {
        this.sputterShakeT = 0;
        this._shake(0.004, 150);
      }
      if (this.sputter > 1400) {
        this.state = 'over';
        this.time.delayedCall(600, () => this.scene.start('GameOver', { level: this.lvlNum }));
      }
      return;
    }

    // Wide-mower countdown
    if (this.wideTimer > 0) {
      const prev = this.wideTimer;
      this.wideTimer = Math.max(0, this.wideTimer - delta / 1000);
      if (this.wideTimer === 0 && prev > 0) {
        this.tweens.add({ targets: this.mowerCont, scaleX: 1, duration: 160, ease: 'Quad.easeIn' });
        this._floatText(this.mx, this.my - 40, 'NORMAL WIDTH', '#aaaaaa', 18);
      }
    }

    this._input(delta);
    this._drainGas(delta);
    this._cutGrass();
    this._checkCans();
    this._checkStumps(delta);
    this._checkCrickets();
    this._moveCrickets(time);
    this._moveDogs(delta);
    this._checkDogs();
    this._exhaust(delta);
    this._updateMowerFace(delta);
    this._updateHUD();
    this._checkWin();

    if (this.lawnDirty) { this._drawLawn(); this.lawnDirty = false; }
  }

  // ── input & movement ────────────────────────────────────────────
  _input(delta) {
    if (this.replay) { this._replayInput(delta); return; }

    const dt = delta / 1000;
    let dx = 0, dy = 0;
    if (this.cur.left.isDown  || this.wasd.left.isDown)  dx = -1;
    if (this.cur.right.isDown || this.wasd.right.isDown) dx =  1;
    if (this.cur.up.isDown    || this.wasd.up.isDown)    dy = -1;
    if (this.cur.down.isDown  || this.wasd.down.isDown)  dy =  1;
    // Touch/joystick override
    if (this._touch.active && (Math.abs(this._touch.dx) > 8 || Math.abs(this._touch.dy) > 8)) {
      const td = Math.sqrt(this._touch.dx ** 2 + this._touch.dy ** 2);
      dx = this._touch.dx / td;
      dy = this._touch.dy / td;
    }

    if (dx === 0 && dy === 0) {
      if (this.moving) { SFX.stopMow(); this.moving = false; }
      this.comboIdleMs += delta;
      if (this.comboIdleMs > 400 && this.combo > 1) {
        this.combo = 1;
        this.lastComboTier = 0;
      }
      return;
    }

    this.comboIdleMs = 0;
    if (!this.moving) { SFX.startMow(); this.moving = true; }

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

  // ── replay AI: snake-pattern mow ────────────────────────────────
  _replayInput(delta) {
    const dt      = delta / 1000;
    const targetY = LAWN_Y + this._rRow * TILE + TILE / 2;
    const targetX = this._rDir === 1 ? (LAWN_W - 18) : 18;

    let dx = 0, dy = 0;

    if (Math.abs(this.my - targetY) > 6) {
      // Move to the current row's Y first
      dy = this.my > targetY ? -1 : 1;
    } else {
      dx = this._rDir;
      // Reached target X — advance to next row
      if ((this._rDir === 1  && this.mx >= targetX - 6) ||
          (this._rDir === -1 && this.mx <= targetX + 6)) {
        if (this._rRow < GRID_H - 1) {
          this._rRow++;
          this._rDir *= -1;
        }
        // Stay at last row when done; _checkWin will fire
      }
    }

    if (dx === 0 && dy === 0) {
      if (this.moving) { SFX.stopMow(); this.moving = false; }
      return;
    }
    if (!this.moving) { SFX.startMow(); this.moving = true; }

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
    const h = 12;
    const pts = [
      [x - h, y - LAWN_Y - h], [x + h, y - LAWN_Y - h],
      [x - h, y - LAWN_Y + h], [x + h, y - LAWN_Y + h],
    ];
    for (const [cx, cy] of pts) {
      const tx = Math.floor(cx / TILE);
      const ty = Math.floor(cy / TILE);
      if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) return true;
      if (this.grid[ty][tx] === T_STUMP || this.grid[ty][tx] === T_HOUSE) return true;
    }
    return false;
  }

  // ── grass cutting ────────────────────────────────────────────────
  _cutGrass() {
    if (!this.moving) return;
    const h   = this.wideTimer > 0 ? 45 : 15;
    const lxT = Math.floor((this.mx - h) / TILE);
    const rxT = Math.floor((this.mx + h) / TILE);
    const tyT = Math.floor((this.my - LAWN_Y - h) / TILE);
    const byT = Math.floor((this.my - LAWN_Y + h) / TILE);

    for (let gy = Math.max(0, tyT); gy <= Math.min(GRID_H - 1, byT); gy++) {
      for (let gx = Math.max(0, lxT); gx <= Math.min(GRID_W - 1, rxT); gx++) {
        if (this.grid[gy][gx] === T_TALL) {
          this.grid[gy][gx] = T_CUT;
          this.cutCount++;
          this.lawnDirty = true;

          // Cutting blade particles
          const px = gx * TILE + TILE / 2;
          const py = LAWN_Y + gy * TILE + TILE / 2;
          const count = Phaser.Math.Between(3, 5);
          for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist  = Phaser.Math.Between(18, 45);
            const p = this.add.rectangle(px, py, 3, 7, C_GRASS_BLADE)
              .setDepth(6)
              .setRotation(angle);
            this.tweens.add({
              targets: p,
              x: px + Math.cos(angle) * dist,
              y: py + Math.sin(angle) * dist,
              angle: p.angle + 180,
              alpha: 0,
              duration: Phaser.Math.Between(200, 350),
              onComplete: () => p.destroy(),
            });
          }

          // Combo + score
          this.combo++;
          this.score += 10 * this.combo;
          const tier = this.combo >= 10 ? 3 : this.combo >= 5 ? 2 : this.combo >= 3 ? 1 : 0;
          if (tier > this.lastComboTier) {
            this.lastComboTier = tier;
            SFX.combo(this.combo);
            this._floatText(this.mx, this.my - 24, `+${this.combo}x COMBO!`, '#ffcc00', 15);
          }
        }
      }
    }
  }

  // ── gas ─────────────────────────────────────────────────────────
  _drainGas(delta) {
    if (!this.moving || this.replay) return;
    const gx = Math.floor(this.mx / TILE);
    const gy = Math.floor((this.my - LAWN_Y) / TILE);
    const onCut = gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H
      && this.grid[gy][gx] === T_CUT;
    const drain = onCut ? this.cfg.gasDrain * 0.4 : this.cfg.gasDrain;
    this.gas -= drain * (delta / 16.67);
    if (this.gas <= 0) {
      this.gas = 0;
      if (this.state === 'playing') {
        this.state       = 'sputtering';
        this.sputter     = 0;
        this.sputterShakeT = 0;
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
        this._setFaceState('smile', 800);
      }
    }
  }

  // ── stump digging ────────────────────────────────────────────────
  _checkStumps(delta) {
    if (!this.cfg.stumps) return;
    const digging = this.replay || this.spKey.isDown || this._touch.digging;

    for (const s of this.stumps) {
      if (s.dug) continue;
      const d    = Phaser.Math.Distance.Between(this.mx, this.my, s.wx, s.wy);
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

    // Grant double-wide power-up
    this.wideTimer = 10;
    this._floatText(this.mx, this.my - 40, 'TRIPLE WIDE! 10s', '#ff88ff', 22);
    this.tweens.add({
      targets: this.mowerCont, scaleX: 3, duration: 180, ease: 'Back.easeOut',
    });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const puff  = this.add.circle(
        s.wx + Math.cos(angle) * 20, s.wy + Math.sin(angle) * 20, 6, 0x8b4513,
      ).setDepth(30);
      this.tweens.add({
        targets: puff, alpha: 0, scaleX: 3, scaleY: 3, duration: 500,
        onComplete: () => puff.destroy(),
      });
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
    this._shake(0.006, 220);

    cr.gfx.clear();
    cr.gfx.fillStyle(0x00aa00, 0.85);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      cr.gfx.fillCircle(Math.cos(a) * 12, Math.sin(a) * 12, 5);
    }
    cr.gfx.fillCircle(0, 0, 9);

    this.flashRect.setFillStyle(0xff0000);
    this.flashRect.setAlpha(0.45);
    this.tweens.add({ targets: this.flashRect, alpha: 0, duration: 380 });

    this.gas = Math.max(0, this.gas - 30);
    this._floatText(cr.gfx.x, cr.gfx.y, '-30 GAS!', '#ff4444', 18);
    this._setFaceState('xeyes', 600);

    this.time.delayedCall(2000, () => {
      this.tweens.add({
        targets: cr.gfx, alpha: 0, duration: 500,
        onComplete: () => cr.gfx.destroy(),
      });
    });
  }

  // ── cricket AI ──────────────────────────────────────────────────
  _moveCrickets(time) {
    if (!this.cfg.crickets || !this.cfg.cricketMs) return;
    if (time - this.lastHop < this.cfg.cricketMs) return;
    this.lastHop = time;

    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const cr of this.crickets) {
      if (cr.splatted || cr.hopping) continue;
      Phaser.Utils.Array.Shuffle(dirs);
      for (const [dx, dy] of dirs) {
        const nx = cr.tx + dx, ny = cr.ty + dy;
        if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
        if (this.grid[ny][nx] === T_STUMP) continue;

        cr.tx = nx; cr.ty = ny;
        const wx  = nx * TILE + TILE / 2;
        const wy  = LAWN_Y + ny * TILE + TILE / 2;
        const hop = this.cfg.cricketMs;

        cr.hopping = true;
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

  // ── dog AI ──────────────────────────────────────────────────────
  _moveDogs(delta) {
    if (!this.cfg.dogs) return;
    const dt = delta / 1000;

    for (const dog of this.dogs) {
      if (dog.scattered) continue;
      const dx   = this.mx - dog.gfx.x;
      const dy   = this.my - dog.gfx.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      if (dist / TILE < 4) {
        // Chase player
        const nx = dog.gfx.x + (dx / dist) * 80 * dt;
        const ny = dog.gfx.y + (dy / dist) * 80 * dt;
        dog.gfx.x = Phaser.Math.Clamp(nx, TILE, LAWN_W - TILE);
        dog.gfx.y = Phaser.Math.Clamp(ny, LAWN_Y + TILE, LAWN_Y + LAWN_H - TILE);
        dog.gfx.rotation = Math.atan2(dy, dx);
        dog.chasing = true;
      } else {
        dog.chasing = false;
        dog.wanderT = (dog.wanderT || 0) + delta;
        if (dog.wanderT > 1800) {
          dog.wanderT  = 0;
          dog.wanderDx = Phaser.Math.Between(-1, 1);
          dog.wanderDy = Phaser.Math.Between(-1, 1);
        }
        const nx = dog.gfx.x + (dog.wanderDx || 0) * 30 * dt;
        const ny = dog.gfx.y + (dog.wanderDy || 0) * 30 * dt;
        dog.gfx.x = Phaser.Math.Clamp(nx, TILE, LAWN_W - TILE);
        dog.gfx.y = Phaser.Math.Clamp(ny, LAWN_Y + TILE, LAWN_Y + LAWN_H - TILE);
      }
    }
  }

  _checkDogs() {
    if (!this.cfg.dogs) return;
    for (const dog of this.dogs) {
      if (dog.scattered) continue;
      const d = Phaser.Math.Distance.Between(this.mx, this.my, dog.gfx.x, dog.gfx.y);
      if (d < TILE * 0.9) this._dogScatter(dog);
    }
  }

  _dogScatter(dog) {
    dog.scattered = true;
    SFX.bark();
    this._shake(0.008, 300);

    this.flashRect.setFillStyle(0xff8800);
    this.flashRect.setAlpha(0.3);
    this.tweens.add({
      targets: this.flashRect, alpha: 0, duration: 400,
      onComplete: () => this.flashRect.setFillStyle(0xff0000),
    });

    // Knock mower back 30px away from dog
    const dx   = this.mx - dog.gfx.x;
    const dy   = this.my - dog.gfx.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    this.mx = Phaser.Math.Clamp(this.mx + (dx / dist) * 30, 18, LAWN_W - 18);
    this.my = Phaser.Math.Clamp(this.my + (dy / dist) * 30, LAWN_Y + 18, LAWN_Y + LAWN_H - 18);
    this.mowerCont.x = this.mx;
    this.mowerCont.y = this.my;

    this._floatText(dog.gfx.x, dog.gfx.y, 'WOOF!', '#ff8800', 22);
    this._setFaceState('xeyes', 700);

    // Dog trots off
    const exitX = dog.gfx.x < CW / 2 ? -80 : CW + 80;
    this.tweens.add({
      targets: dog.gfx, x: exitX, duration: 1200, ease: 'Quad.easeIn',
      onComplete: () => dog.gfx.setVisible(false),
    });
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
    this.tweens.add({
      targets: puff, y: puff.y - 22, alpha: 0, scaleX: 2, scaleY: 2,
      duration: 550, onComplete: () => puff.destroy(),
    });
  }

  // ── win / lose ───────────────────────────────────────────────────
  _checkWin() {
    if (this.state !== 'playing') return;
    if (this.cutCount / this.totalMow >= this.cfg.win) {
      this.state = 'won';
      SFX.stopMow();
      SFX.levelDone();
      window._totalScore = (window._totalScore || 0) + this.score;
      if (this.replay) {
        // In replay: silently advance to next level (or stop after level 5)
        const next = this.lvlNum + 1;
        this.time.delayedCall(400, () => {
          if (next <= 5) this.scene.start('Game', { level: next, replay: true });
          else           this.scene.start('Menu');
        });
      } else {
        this.time.delayedCall(900, () =>
          this.scene.start('LevelComplete', { level: this.lvlNum, score: this.score }),
        );
      }
    }
  }

  // ── HUD update ───────────────────────────────────────────────────
  _updateHUD() {
    const pct  = this.gas / this.cfg.gasMax;
    const barW = Math.max(0, pct * 196);
    this.gasBar.setSize(barW, 14);

    if (pct > 0.5)       this.gasBar.setFillStyle(0x00cc44);
    else if (pct > 0.25) this.gasBar.setFillStyle(0xffaa00);
    else                 this.gasBar.setFillStyle(0xff3333);

    const cutPct = Math.floor((this.cutCount / this.totalMow) * 100);
    this.cutTxt.setText(`CUT: ${cutPct}%`);
    this.gasPctTxt.setText(`${Math.floor(pct * 100)}%`);
    this.scoreTxt.setText(`${this.score}`);

    this._updateIconRow();
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
      const tw = this.tweens.add({
        targets: g, y: wy - 7, duration: 580, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
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

      const barBg   = this.add.rectangle(wx, wy - 26, 44, 12, 0x111111).setDepth(14).setVisible(false);
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

  _placeDogs() {
    if (!this.cfg.dogs) return;
    for (let i = 0; i < this.cfg.dogs; i++) {
      const { tx, ty } = this._freeCell(8);
      const wx = tx * TILE + TILE / 2;
      const wy = LAWN_Y + ty * TILE + TILE / 2;
      const g  = this.add.graphics().setDepth(5);
      _drawDog(g);
      g.x = wx; g.y = wy;
      this.dogs.push({ gfx: g, tx, ty, scattered: false, chasing: false, wanderT: 0, wanderDx: 0, wanderDy: 0 });
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
    [[-13, -9], [13, -9], [-13, 9], [13, 9]].forEach(([wx, wy]) => {
      body.fillCircle(wx, wy, 6);
      body.fillStyle(0x888888); body.fillCircle(wx, wy, 3);
      body.fillStyle(C_WHEEL);
    });
    body.fillStyle(0x666666);
    body.fillRect(-3, 13, 6, 14);
    body.fillRect(-12, 23, 24, 5);

    this.blade = this.add.graphics();
    this.blade.fillStyle(0xbbbbbb); this.blade.fillCircle(0, 0, 10);
    this.blade.fillStyle(0x999999);
    this.blade.fillRect(-10, -2, 20, 4);
    this.blade.fillRect(-2, -10, 4, 20);
    this.blade.lineStyle(2, 0x333333); this.blade.strokeCircle(0, 0, 10);

    // Face (rotates with body — Flash-era charm)
    this.mowerFace = this.add.graphics();
    this._redrawFace('normal');

    this.mowerCont.add([body, this.blade, this.mowerFace]);
  }

  // ── mower face ───────────────────────────────────────────────────
  _redrawFace(state) {
    const g = this.mowerFace;
    g.clear();

    if (state === 'normal') {
      g.fillStyle(0x000000);
      g.fillCircle(-6, -5, 3);
      g.fillCircle(6, -5, 3);
    } else if (state === 'xeyes') {
      g.lineStyle(2, 0xff2222);
      [[-9, -8, -3, -2], [-3, -8, -9, -2], [3, -8, 9, -2], [9, -8, 3, -2]]
        .forEach(([x1, y1, x2, y2]) => {
          g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
        });
    } else if (state === 'smile') {
      g.fillStyle(0x000000);
      g.fillCircle(-6, -5, 3);
      g.fillCircle(6, -5, 3);
      // Smile arc: bottom half of a circle
      g.lineStyle(2, 0x000000);
      g.beginPath();
      g.arc(0, 1, 6, 0, Math.PI, false);
      g.strokePath();
    } else if (state === 'alert') {
      // Wide eyes with highlight
      g.fillStyle(0x000000);
      g.fillCircle(-6, -5, 4);
      g.fillCircle(6, -5, 4);
      g.fillStyle(0xffffff);
      g.fillCircle(-5, -6, 1.5);
      g.fillCircle(7, -6, 1.5);
      // Worry brows
      g.lineStyle(2, 0x000000);
      g.beginPath(); g.moveTo(-10, -11); g.lineTo(-3, -9); g.strokePath();
      g.beginPath(); g.moveTo(10, -11);  g.lineTo(3, -9);  g.strokePath();
    }
  }

  _setFaceState(state, duration) {
    this.faceState = state;
    this.faceTimer = duration;
    this._redrawFace(state);
  }

  _updateMowerFace(delta) {
    const lowGas = this.gas / this.cfg.gasMax < 0.2;

    // Timed transient states (xeyes, smile)
    if (this.faceState !== 'normal' && this.faceState !== 'alert') {
      this.faceTimer -= delta;
      if (this.faceTimer <= 0) {
        this.faceState = lowGas ? 'alert' : 'normal';
        this._redrawFace(this.faceState);
      }
      return;
    }

    // Transition normal <-> alert based on gas level
    if (lowGas && this.faceState === 'normal') {
      this.faceState = 'alert';
      this._redrawFace('alert');
    } else if (!lowGas && this.faceState === 'alert') {
      this.faceState = 'normal';
      this._redrawFace('normal');
    }

    // Scale wide eyes when very low on gas
    this.mowerFace.setScale(lowGas ? 1.4 : 1.0);

    // Blink
    this.blinkTimer -= delta;
    if (this.blinkTimer <= 0) {
      this.mowerFace.clear(); // eyes disappear briefly
      this.time.delayedCall(80, () => {
        if (this.faceState === 'normal' || this.faceState === 'alert') {
          this._redrawFace(this.faceState);
        }
      });
      this.blinkTimer = Phaser.Math.Between(2000, 4000);
    }
  }

  // ── screen shake ─────────────────────────────────────────────────
  _shake(strength, duration) {
    this.cameras.main.shake(duration, strength);
  }

  // ── level 1 layout + scenery ─────────────────────────────────────
  _initLevel1Layout() {
    // House: cols 6-24, rows 0-6 (blocked)
    for (let gy = 0; gy <= 6; gy++)
      for (let gx = 6; gx <= 24; gx++)
        this.grid[gy][gx] = T_HOUSE;
    // Side garden: cols 0-5, rows 0-7 (passable, not mowable)
    for (let gy = 0; gy <= 7; gy++)
      for (let gx = 0; gx <= 5; gx++)
        this.grid[gy][gx] = T_GARDEN;
    // Porch / flower bed: row 7, cols 6-24
    for (let gx = 6; gx <= 24; gx++)
      this.grid[7][gx] = T_GARDEN;
  }

  _buildLevel1Scenery() {
    const sc = this.add.graphics().setDepth(2);

    // ── House (cols 6-24, rows 0-6 → x=192–800, y=40–264) ──────
    const HX = 6 * TILE, HY = LAWN_Y, HW = 19 * TILE, HH = 7 * TILE;

    sc.fillStyle(0x2a2a2a); sc.fillRect(HX, HY, HW, HH);

    // Roof (fills upper portion)
    sc.fillStyle(0x6e1a1a); sc.fillRect(HX + 4, HY + 4, HW - 8, HH - 40);
    sc.lineStyle(1, 0x4c0a0a, 0.5);
    for (let sy = 0; sy < 7; sy++)
      sc.lineBetween(HX + 4, HY + 4 + sy * 26, HX + HW - 4, HY + 4 + sy * 26);
    sc.lineStyle(3, 0x3a0808);
    sc.lineBetween(HX + 4, HY + HH / 2 - 24, HX + HW - 4, HY + HH / 2 - 24);

    // Chimney tops
    const chimneys = [[HX + 60, HY + 20], [HX + 240, HY + 16], [HX + 440, HY + 20]];
    for (const [cx, cy] of chimneys) {
      sc.fillStyle(0x9c5050); sc.fillRect(cx, cy, 18, 18);
      sc.lineStyle(1, 0x5c1818); sc.strokeRect(cx, cy, 18, 18);
      sc.fillStyle(0x1a1010); sc.fillCircle(cx + 9, cy + 9, 5);
    }

    // Front facade (bottom strip facing the yard)
    sc.fillStyle(0xeedad8); sc.fillRect(HX, HY + HH - 36, HW, 36);
    sc.lineStyle(2, 0xc0a8a6); sc.strokeRect(HX, HY + HH - 36, HW, 36);
    sc.lineStyle(1, 0xd0b8b6, 0.4);
    for (let sl = 0; sl < 3; sl++)
      sc.lineBetween(HX, HY + HH - 36 + sl * 12, HX + HW, HY + HH - 36 + sl * 12);

    // Front windows
    const wY = HY + HH - 30;
    for (const wx of [HX + 40, HX + 120, HX + 200, HX + 370, HX + 450, HX + 530]) {
      sc.fillStyle(0x88c8e8); sc.fillRect(wx, wY, 26, 20);
      sc.lineStyle(1, 0x4488a8); sc.strokeRect(wx, wY, 26, 20);
      sc.lineStyle(1, 0x66aacc);
      sc.lineBetween(wx + 13, wY, wx + 13, wY + 20);
      sc.lineBetween(wx, wY + 10, wx + 26, wY + 10);
    }

    // Front door
    const dX = HX + HW / 2 - 14;
    sc.fillStyle(0x5c2808); sc.fillRect(dX, HY + HH - 34, 28, 32);
    sc.lineStyle(2, 0x3a1800); sc.strokeRect(dX, HY + HH - 34, 28, 32);
    sc.fillStyle(0xddaa00); sc.fillCircle(dX + 22, HY + HH - 18, 2.5);

    // ── Porch / flower bed (row 7: y=264–296) ───────────────────
    const PY = LAWN_Y + 7 * TILE;
    sc.fillStyle(0xc8aa80); sc.fillRect(HX, PY, HW, TILE);
    sc.lineStyle(1, 0xa88860, 0.35);
    for (let pv = 0; pv <= 19; pv++) sc.lineBetween(HX + pv * TILE, PY, HX + pv * TILE, PY + TILE);
    sc.lineBetween(HX, PY + 16, HX + HW, PY + 16);
    const pal = [0xff6688, 0xffee44, 0xff88ee, 0x66ddff, 0xff9933, 0xaaffaa];
    let fi = 0;
    for (let fx = HX + 24; fx < HX + HW - 20; fx += 44) {
      const fc = pal[fi++ % pal.length];
      sc.lineStyle(2, 0x228822); sc.lineBetween(fx, PY + TILE - 2, fx, PY + 11);
      sc.fillStyle(fc);
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        sc.fillCircle(fx + Math.cos(a) * 4, PY + 9 + Math.sin(a) * 4, 3);
      }
      sc.fillStyle(0xffee00); sc.fillCircle(fx, PY + 9, 2.5);
    }

    // ── Side garden (cols 0-5, rows 0-7 → x=0–192, y=40–296) ───
    const GW = 6 * TILE, GH = 8 * TILE;
    sc.fillStyle(0x3a1e0a); sc.fillRect(0, LAWN_Y, GW, GH);
    const cc = [0x44aa22, 0x88aa44, 0xaaaa22, 0x44aaaa, 0xaa6622, 0x66aa44, 0xaa44aa, 0x22aaaa];
    for (let cr = 0; cr < 8; cr++) {
      const cY = LAWN_Y + cr * 32 + 6;
      sc.fillStyle(0x2a1205, 0.7); sc.fillRect(4, cY, GW - 8, 20);
      for (let cp = 0; cp < 4; cp++) {
        const cX = 18 + cp * 40;
        sc.fillStyle(cc[cr % cc.length]); sc.fillCircle(cX, cY + 10, 6);
        sc.fillStyle(cc[cr % cc.length], 0.5);
        sc.fillCircle(cX - 5, cY + 14, 4); sc.fillCircle(cX + 5, cY + 14, 4);
      }
    }
    sc.lineStyle(3, 0x8b5a1a); sc.strokeRect(2, LAWN_Y + 2, GW - 4, GH - 4);
    sc.fillStyle(0x7a4a10);
    for (let gp = 0; gp <= 8; gp++) sc.fillRect(2, LAWN_Y + 2 + gp * 31, 5, 8);
    for (let gp = 0; gp <= 8; gp++) sc.fillRect(GW - 7, LAWN_Y + 2 + gp * 31, 5, 8);
    for (let gp = 0; gp <= 4; gp++) sc.fillRect(2 + gp * 46, LAWN_Y + 2, 5, 8);
    for (let gp = 0; gp <= 4; gp++) sc.fillRect(2 + gp * 46, LAWN_Y + GH - 10, 5, 8);

    // ── Animated chimney smoke ───────────────────────────────────
    chimneys.forEach(([sx, sy]) => {
      this.time.addEvent({
        delay: Phaser.Math.Between(600, 1100), repeat: -1,
        callback: () => {
          if (this.state === 'over' || this.state === 'won') return;
          const p = this.add.circle(sx + 9, sy, Phaser.Math.Between(2, 4), 0xc0c0c0, 0.4).setDepth(3);
          this.tweens.add({
            targets: p, y: sy - Phaser.Math.Between(14, 22), x: p.x + Phaser.Math.Between(-3, 3),
            alpha: 0, scaleX: 1.8, scaleY: 1.8, duration: 1700,
            onComplete: () => p.destroy(),
          });
        },
      });
    });
  }

  // ── control zone: joystick (left) + dig button (right) ──────────
  _buildJoystick() {
    const PAD   = 10;
    const joyR  = 44;
    const JOY_X1 = PAD, JOY_X2 = CW * 0.54, JOY_W = JOY_X2 - JOY_X1;
    const DIG_X1 = CW * 0.57, DIG_X2 = CW - PAD, DIG_W = DIG_X2 - DIG_X1;
    const ZONE_Y = CTRL_Y + PAD, ZONE_H = CTRL_H - PAD * 2;
    const JOY_CX = JOY_X1 + JOY_W / 2, JOY_CY = ZONE_Y + ZONE_H / 2;
    const DIG_CX = DIG_X1 + DIG_W / 2, DIG_CY = ZONE_Y + ZONE_H / 2;

    // ── Joystick zone background ────────────────────────────────
    const joyBg = this.add.graphics().setDepth(48).setScrollFactor(0);
    const _drawJoyIdle = () => {
      joyBg.clear();
      joyBg.fillStyle(0xffffff, 0.04);
      joyBg.fillRoundedRect(JOY_X1, ZONE_Y, JOY_W, ZONE_H, 14);
      joyBg.lineStyle(1.5, 0xffffff, 0.12);
      joyBg.strokeRoundedRect(JOY_X1, ZONE_Y, JOY_W, ZONE_H, 14);
    };
    _drawJoyIdle();
    const moveLbl = this.add.text(JOY_CX, JOY_CY, 'MOVE', {
      fontSize: '11px', fill: '#fff', fontFamily: 'Courier New',
    }).setOrigin(0.5).setDepth(49).setScrollFactor(0).setAlpha(0.2);

    // Active ring + knob
    const ring = this.add.graphics().setDepth(50).setScrollFactor(0).setAlpha(0);
    ring.lineStyle(3, 0xffffff, 0.7); ring.strokeCircle(0, 0, joyR);
    const knob = this.add.graphics().setDepth(51).setScrollFactor(0).setAlpha(0);
    knob.fillStyle(0xffffff, 0.25); knob.fillCircle(0, 0, 22);
    knob.lineStyle(2, 0xffffff, 0.6); knob.strokeCircle(0, 0, 22);

    // ── DIG zone (only if level has stumps) ─────────────────────
    let digBg = null, digLbl = null;
    const _drawDigIdle = () => {
      if (!digBg) return;
      digBg.clear();
      digBg.fillStyle(0xffffff, 0.05);
      digBg.fillRoundedRect(DIG_X1, ZONE_Y, DIG_W, ZONE_H, 14);
      digBg.lineStyle(1.5, 0xffcc00, 0.3);
      digBg.strokeRoundedRect(DIG_X1, ZONE_Y, DIG_W, ZONE_H, 14);
    };
    const _drawDigActive = () => {
      if (!digBg) return;
      digBg.clear();
      digBg.fillStyle(0xffcc00, 0.18);
      digBg.fillRoundedRect(DIG_X1, ZONE_Y, DIG_W, ZONE_H, 14);
      digBg.lineStyle(2.5, 0xffcc00, 0.85);
      digBg.strokeRoundedRect(DIG_X1, ZONE_Y, DIG_W, ZONE_H, 14);
    };

    if (this.cfg.stumps > 0) {
      digBg = this.add.graphics().setDepth(48).setScrollFactor(0);
      _drawDigIdle();
      digLbl = this.add.text(DIG_CX, DIG_CY, 'DIG', {
        fontSize: '18px', fill: '#ffcc00', fontFamily: 'Courier New', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(49).setScrollFactor(0).setAlpha(0.55);
    }

    let sx = JOY_CX, sy = JOY_CY;
    let joyPtrId = -1, digPtrId = -1;

    const _inJoy = (px, py) => px >= JOY_X1 && px <= JOY_X2 && py >= ZONE_Y && py <= ZONE_Y + ZONE_H;
    const _inDig = (px, py) => digBg && px >= DIG_X1 && px <= DIG_X2 && py >= ZONE_Y && py <= ZONE_Y + ZONE_H;

    this.input.on('pointerdown', (ptr) => {
      if (_inDig(ptr.x, ptr.y)) {
        digPtrId = ptr.id;
        this._touch.digging = true;
        _drawDigActive();
        if (digLbl) digLbl.setAlpha(1);
        return;
      }
      if (!_inJoy(ptr.x, ptr.y)) return;
      joyPtrId = ptr.id;
      sx = Phaser.Math.Clamp(ptr.x, JOY_X1 + joyR, JOY_X2 - joyR);
      sy = Phaser.Math.Clamp(ptr.y, ZONE_Y + joyR, ZONE_Y + ZONE_H - joyR);
      this._touch.active = true;
      this._touch.dx = 0; this._touch.dy = 0;
      ring.setPosition(sx, sy).setAlpha(1);
      knob.setPosition(sx, sy).setAlpha(1);
      moveLbl.setAlpha(0);
      joyBg.clear();
      joyBg.fillStyle(0xffffff, 0.07);
      joyBg.fillRoundedRect(JOY_X1, ZONE_Y, JOY_W, ZONE_H, 14);
    });

    this.input.on('pointermove', (ptr) => {
      if (!this._touch.active || ptr.id !== joyPtrId) return;
      const dx = ptr.x - sx, dy = ptr.y - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const cl = Math.min(dist, joyR);
      knob.setPosition(sx + (dx / (dist || 1)) * cl, sy + (dy / (dist || 1)) * cl);
      this._touch.dx = dx; this._touch.dy = dy;
    });

    this.input.on('pointerup', (ptr) => {
      if (ptr.id === joyPtrId) {
        joyPtrId = -1;
        this._touch.active = false;
        this._touch.dx = 0; this._touch.dy = 0;
        ring.setAlpha(0); knob.setAlpha(0);
        moveLbl.setAlpha(0.2);
        _drawJoyIdle();
      }
      if (ptr.id === digPtrId) {
        digPtrId = -1;
        this._touch.digging = false;
        _drawDigIdle();
        if (digLbl) digLbl.setAlpha(0.55);
      }
    });
  }

  // ── per-level backdrop ───────────────────────────────────────────
  _buildBackdrop() {
    // Drawn at depth 19, visible through semi-transparent title/HUD bars at depth 20
    const g = this.add.graphics().setDepth(19);
    const n = this.lvlNum;

    // Tint strip in title bar area
    const tints = [0x3399cc, 0x229966, 0x8a5c2a, 0x444488, 0xff6622];
    g.fillStyle(tints[n - 1], 0.35);
    g.fillRect(0, 0, CW, TITLE_H);

    // Tint strip in HUD area
    g.fillStyle(tints[n - 1], 0.18);
    g.fillRect(0, HUD_Y, CW, HUD_H);

    // Small thematic icon at right edge of title bar
    if (n === 1) {
      // Mini house silhouette in title bar
      g.fillStyle(0xeedad8, 0.65); g.fillRect(CW - 32, 14, 22, 20);
      g.fillStyle(0x7a2020, 0.7);  g.fillTriangle(CW - 21, 8, CW - 34, 16, CW - 8, 16);
      g.fillStyle(0x5c2808, 0.65); g.fillRect(CW - 26, 26, 8, 8);
      g.fillStyle(0x44aa22, 0.55); g.fillCircle(CW - 44, 20, 5); g.fillCircle(CW - 44, 28, 4);
    } else if (n === 2) {
      g.fillStyle(C_GAS_CAN, 0.5); g.fillRect(CW - 30, 10, 18, 22);
      g.fillStyle(0xffcc00, 0.5);  g.fillRect(CW - 25, 6, 8, 6);
    } else if (n === 3) {
      g.fillStyle(0x5c2d00, 0.5); g.fillRect(CW - 24, 14, 8, 22);
      g.fillStyle(0x1a5c1a, 0.4); g.fillCircle(CW - 20, 14, 13);
    } else if (n === 4) {
      g.fillStyle(C_CRICKET, 0.45); g.fillEllipse(CW - 20, 20, 22, 14);
      g.fillStyle(0x33aa33, 0.45); g.fillCircle(CW - 10, 14, 8);
    } else if (n === 5) {
      // Moon + stars
      g.fillStyle(0xffe0a0, 0.55); g.fillCircle(CW - 22, 20, 9);
      g.fillStyle(0x1a0000, 0.7);  g.fillCircle(CW - 18, 17, 7);
      g.fillStyle(0xffffff, 0.6);
      [[CW - 38, 10], [CW - 46, 22], [CW - 34, 30]].forEach(([sx, sy]) =>
        g.fillCircle(sx, sy, 1.5),
      );
    }
  }

  // ── build title bar & HUD ────────────────────────────────────────
  _buildTitleBar() {
    this.add.rectangle(CW / 2, TITLE_H / 2, CW, TITLE_H, 0x111111, 0.88).setDepth(20);
    this.add.text(10, TITLE_H / 2,
      `${this.cfg.title}: ${this.cfg.sub}  —  ${this.cfg.desc}`, {
      fontSize: '13px', fill: '#ffcc00', fontFamily: 'Courier New',
    }).setOrigin(0, 0.5).setDepth(21);
    const sp = window._spotifyConnected ? '♫ FOR CUTTING GRASS BY GOON' : '♫ NO MUSIC';
    const sc = window._spotifyConnected ? '#1DB954' : '#444';
    this.add.text(CW - 10, TITLE_H / 2, sp, {
      fontSize: '12px', fill: sc, fontFamily: 'Courier New',
    }).setOrigin(1, 0.5).setDepth(21);
  }

  _buildHUD() {
    this.add.rectangle(CW / 2, HUD_Y + HUD_H / 2, CW, HUD_H, C_HUD_BG, 0.90).setDepth(20);
    this.add.rectangle(CW / 2, CTRL_Y + CTRL_H / 2, CW, CTRL_H, 0x080808, 1.0).setDepth(20);

    // Row 1 ── gas bar
    this.add.text(10, HUD_Y + 16, 'GAS:', {
      fontSize: '13px', fill: '#aaa', fontFamily: 'Courier New',
    }).setOrigin(0, 0.5).setDepth(21);

    this.add.rectangle(215, HUD_Y + 16, 200, 18, 0x333333).setDepth(21);
    this.gasBar = this.add.rectangle(117, HUD_Y + 16, 196, 14, 0x00cc44)
      .setOrigin(0, 0.5).setDepth(22);
    this.gasPctTxt = this.add.text(215, HUD_Y + 16, '100%', {
      fontSize: '11px', fill: '#fff', fontFamily: 'Courier New',
    }).setOrigin(0.5, 0.5).setDepth(23);

    // Row 1 ── cut %
    this.cutTxt = this.add.text(340, HUD_Y + 16, 'CUT: 0%', {
      fontSize: '16px', fill: '#fff', fontFamily: 'Courier New', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(21);

    // Row 1 ── goal
    this.add.text(468, HUD_Y + 16, `GOAL: ${Math.floor(this.cfg.win * 100)}%`, {
      fontSize: '14px', fill: '#ffcc00', fontFamily: 'Courier New',
    }).setOrigin(0, 0.5).setDepth(21);

    // Row 1 ── score (stacked label + value)
    this.add.text(578, HUD_Y + 8, 'SCORE', {
      fontSize: '9px', fill: '#666', fontFamily: 'Courier New',
    }).setOrigin(0.5, 0).setDepth(21);
    this.scoreTxt = this.add.text(578, HUD_Y + 19, '0', {
      fontSize: '13px', fill: '#ffcc00', fontFamily: 'Courier New', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(21);

    // Row 1 ── level indicator dots
    for (let i = 0; i < 5; i++) {
      this.add.circle(660 + i * 16, HUD_Y + 16, 5, i < this.lvlNum ? C_MOWER : 0x333333).setDepth(21);
    }

    // Row 2 ── controls hint
    const isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    let ctrlTxt = isMobile ? 'DRAG LEFT: mow' : 'WASD / ARROWS: mow';
    if (this.cfg.stumps   > 0) ctrlTxt += isMobile ? '   HOLD DIG: dig stumps' : '   HOLD SPACE: dig stumps';
    if (this.cfg.crickets > 0) ctrlTxt += '   ⚠ AVOID CRICKETS (-30 gas)';
    if (this.cfg.dogs     > 0) ctrlTxt += '   ⚠ AVOID DOG';
    this.add.text(CW / 2, HUD_Y + 42, ctrlTxt, {
      fontSize: '11px', fill: '#556655', fontFamily: 'Courier New',
    }).setOrigin(0.5, 0.5).setDepth(21);

    // Row 3 ── live item icons
    this.iconRow = null;
    this._buildIconRow();
  }

  _buildIconRow() {
    if (this.iconRow) this.iconRow.forEach(ic => ic.gfx.destroy());
    this.iconRow = [];

    const y = HUD_Y + 63;
    let x = 12;

    for (let i = 0; i < this.cfg.cans; i++) {
      const g = this.add.graphics().setDepth(22);
      g.fillStyle(C_GAS_CAN); g.fillRect(x, y - 8, 11, 13);
      g.fillStyle(0xffcc00);  g.fillRect(x + 2, y - 12, 7, 5);
      this.iconRow.push({ gfx: g, type: 'can', index: i });
      x += 17;
    }
    x += 4;

    for (let i = 0; i < this.cfg.stumps; i++) {
      const g = this.add.graphics().setDepth(22);
      g.fillStyle(C_STUMP); g.fillCircle(x + 6, y, 6);
      this.iconRow.push({ gfx: g, type: 'stump', index: i });
      x += 17;
    }
    x += 4;

    for (let i = 0; i < this.cfg.crickets; i++) {
      const g = this.add.graphics().setDepth(22);
      g.fillStyle(C_CRICKET); g.fillEllipse(x + 8, y, 16, 10);
      g.fillStyle(0x33aa33);  g.fillCircle(x + 15, y - 3, 6);
      this.iconRow.push({ gfx: g, type: 'cricket', index: i });
      x += 20;
    }
    x += 4;

    for (let i = 0; i < this.cfg.dogs; i++) {
      const g = this.add.graphics().setDepth(22);
      g.fillStyle(C_DOG); g.fillEllipse(x + 8, y + 1, 18, 11);
      g.fillCircle(x + 17, y - 3, 7);
      this.iconRow.push({ gfx: g, type: 'dog', index: i });
      x += 24;
    }
  }

  _updateIconRow() {
    if (!this.iconRow) return;
    for (const ic of this.iconRow) {
      let used = false;
      if (ic.type === 'can')     used = !!this.cans[ic.index]?.dead;
      if (ic.type === 'stump')   used = !!this.stumps[ic.index]?.dug;
      if (ic.type === 'cricket') used = !!this.crickets[ic.index]?.splatted;
      if (ic.type === 'dog')     used = !!this.dogs[ic.index]?.scattered;
      ic.gfx.setAlpha(used ? 0.2 : 1.0);
    }
  }

  // ── lawn renderer ────────────────────────────────────────────────
  _drawLawn() {
    this.lawnGfx.clear();

    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const x = gx * TILE;
        const y = LAWN_Y + gy * TILE;
        const t = this.grid[gy][gx];

        if (t === T_HOUSE || t === T_GARDEN) {
          // drawn by level scenery — skip
        } else if (t === T_TALL) {
          this.lawnGfx.fillStyle(C_GRASS_TALL);
          this.lawnGfx.fillRect(x, y, TILE, TILE);
          this.lawnGfx.fillStyle(C_GRASS_BLADE);
          this.lawnGfx.fillTriangle(x + 3,  y + TILE, x + 7,  y + 9,  x + 11, y + TILE);
          this.lawnGfx.fillTriangle(x + 13, y + TILE, x + 17, y + 7,  x + 21, y + TILE);
          this.lawnGfx.fillTriangle(x + 22, y + TILE, x + 26, y + 10, x + 30, y + TILE);
        } else {
          this.lawnGfx.fillStyle(C_GRASS_CUT);
          this.lawnGfx.fillRect(x, y, TILE, TILE);
          this.lawnGfx.fillStyle(0x7aad3a);
          this.lawnGfx.fillRect(x + 5,  y + 20, 2, 10);
          this.lawnGfx.fillRect(x + 15, y + 18, 2, 12);
          this.lawnGfx.fillRect(x + 24, y + 20, 2, 10);
        }
      }
    }

    this.lawnGfx.lineStyle(1, 0x000000, 0.07);
    for (let gx = 0; gx <= GRID_W; gx++)
      this.lawnGfx.lineBetween(gx * TILE, LAWN_Y, gx * TILE, LAWN_Y + LAWN_H);
    for (let gy = 0; gy <= GRID_H; gy++)
      this.lawnGfx.lineBetween(0, LAWN_Y + gy * TILE, LAWN_W, LAWN_Y + gy * TILE);
  }

  // ── utility ──────────────────────────────────────────────────────
  _floatText(x, y, msg, color, size = 16) {
    const t = this.add.text(x, y, msg, {
      fontSize: `${size}px`, fill: color, fontFamily: 'Courier New', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(40);
    this.tweens.add({
      targets: t, y: y - 55, alpha: 0, duration: 1100,
      onComplete: () => t.destroy(),
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
//  LevelCompleteScene
// ═══════════════════════════════════════════════════════════════════
class LevelCompleteScene extends Phaser.Scene {
  constructor() { super({ key: 'LevelComplete' }); }

  init(data) { this.lvl = data.level; this.lvlScore = data.score || 0; }

  create() {
    this.add.rectangle(CW / 2, CH / 2, CW, CH, 0x081808);

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

    const banner = this.add.text(CW / 2, 130, 'LEVEL COMPLETE!', {
      fontSize: '56px', fill: '#ffcc00', fontFamily: 'Courier New',
      fontStyle: 'bold', stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5).setScale(0.1);
    this.tweens.add({ targets: banner, scaleX: 1, scaleY: 1, duration: 400, ease: 'Back.easeOut' });

    this.add.text(CW / 2, 225, LEVELS[this.lvl - 1].sub + ' — CLEARED!', {
      fontSize: '22px', fill: '#ffffff', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    this.add.text(CW / 2, 268, `LEVEL SCORE: ${this.lvlScore}    TOTAL: ${window._totalScore || 0}`, {
      fontSize: '16px', fill: '#ffcc00', fontFamily: 'Courier New', fontStyle: 'bold',
    }).setOrigin(0.5);

    if (this.lvl >= 5) {
      const replayUnlocked = hasWon();
      setWon();
      saveLevel(1); // completed all levels — reset saved progress
      this.time.delayedCall(2000, () => this.scene.start('Win', { replayUnlocked }));
      return;
    }

    saveLevel(this.lvl + 1); // remember where to continue next visit

    const nextCfg = LEVELS[this.lvl];
    this.add.text(CW / 2, 314, `Next: ${nextCfg.title} — "${nextCfg.sub}"`, {
      fontSize: '17px', fill: '#8bc44a', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    const btn = this.add.text(CW / 2, 385, `► LEVEL ${this.lvl + 1}`, {
      fontSize: '28px', fill: '#000', fontFamily: 'Courier New', fontStyle: 'bold',
      backgroundColor: '#ffcc00', padding: { x: 22, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setStyle({ fill: '#333' }));
    btn.on('pointerout',  () => btn.setStyle({ fill: '#000' }));
    btn.on('pointerdown', () => this.scene.start('Game', { level: this.lvl + 1 }));
    this.input.keyboard.on('keydown-ENTER', () => this.scene.start('Game', { level: this.lvl + 1 }));
    this.input.keyboard.on('keydown-SPACE', () => this.scene.start('Game', { level: this.lvl + 1 }));

    this.add.text(CW / 2, 455, 'BACK TO MENU', {
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
    this.add.rectangle(CW / 2, CH / 2, CW, CH, 0x1a0000);

    const g = this.add.graphics();
    g.fillStyle(0x888888); g.fillRect(CW / 2 - 22, 200, 44, 30);
    g.lineStyle(3, 0x444444); g.strokeRect(CW / 2 - 22, 200, 44, 30);
    g.fillStyle(0x555555); g.fillRect(CW / 2 - 22, 212, 44, 8);
    g.lineStyle(3, 0xff2222);
    [[CW / 2 - 14, 208, CW / 2 - 4, 218], [CW / 2 - 4, 208, CW / 2 - 14, 218],
     [CW / 2 + 4,  208, CW / 2 + 14, 218], [CW / 2 + 14, 208, CW / 2 + 4,  218]]
      .forEach(([x1, y1, x2, y2]) => g.lineBetween(x1, y1, x2, y2));
    g.lineStyle(2, 0x666666);
    g.strokeCircle(CW / 2, 198, 8);
    g.strokeCircle(CW / 2, 186, 6);
    g.strokeCircle(CW / 2, 176, 4);

    this.add.text(CW / 2, 130, 'OUT OF GAS!', {
      fontSize: '54px', fill: '#ff3333', fontFamily: 'Courier New',
      fontStyle: 'bold', stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5);

    this.add.text(CW / 2, 265, `Level ${this.lvl}: ${LEVELS[this.lvl - 1].sub}`, {
      fontSize: '18px', fill: '#888', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    const retry = this.add.text(CW / 2, 350, '↺  TRY AGAIN', {
      fontSize: '28px', fill: '#000', fontFamily: 'Courier New', fontStyle: 'bold',
      backgroundColor: '#ffcc00', padding: { x: 22, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    retry.on('pointerover', () => retry.setStyle({ fill: '#333' }));
    retry.on('pointerdown', () => this.scene.start('Game', { level: this.lvl }));
    this.input.keyboard.on('keydown-ENTER', () => this.scene.start('Game', { level: this.lvl }));

    this.add.text(CW / 2, 440, 'BACK TO MENU', {
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

  init(data) { this.replayUnlocked = data.replayUnlocked || false; }

  create() {
    SFX.levelDone();

    const bg = this.add.graphics();
    bg.fillStyle(0x081408); bg.fillRect(0, 0, CW, CH);
    const stripes = [0xff0000, 0xff8800, 0xffff00, 0x00cc00, 0x0088ff, 0x8800ff];
    stripes.forEach((c, i) => {
      bg.fillStyle(c, 0.08); bg.fillRect(0, i * (CH / 6), CW, CH / 6);
    });

    const vic = this.add.container(-50, CH / 2 + 60).setDepth(5);
    const vg  = this.add.graphics();
    vg.fillStyle(C_MOWER);        vg.fillRect(-22, -14, 44, 28);
    vg.lineStyle(3, 0x000000);    vg.strokeRect(-22, -14, 44, 28);
    vg.fillStyle(C_MOWER_STRIPE); vg.fillRect(-22, -4, 44, 8);
    vic.add(vg);
    this.tweens.add({
      targets: vic, x: CW + 50, duration: 3000, repeat: -1,
      onRepeat: () => { vic.x = -50; },
    });

    this.add.text(CW / 2, 75, '🏆 YOU WIN! 🏆', {
      fontSize: '58px', fill: '#ffcc00', fontFamily: 'Courier New',
      fontStyle: 'bold', stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5);

    this.add.text(CW / 2, 165, 'ALL 5 YARDS MOWED!', {
      fontSize: '28px', fill: '#ffffff', fontFamily: 'Courier New', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(CW / 2, 212, 'STUMPS REMOVED. CRICKETS DODGED. DOG OUTWITTED.', {
      fontSize: '14px', fill: '#8bc44a', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    this.add.text(CW / 2, 248, 'FOR CUTTING GRASS BY GOON PLAYED IN FULL.', {
      fontSize: '17px', fill: '#1DB954', fontFamily: 'Courier New',
    }).setOrigin(0.5);

    this.add.text(CW / 2, 284, 'GRASS: CUT.', {
      fontSize: '22px', fill: '#ffcc00', fontFamily: 'Courier New', fontStyle: 'bold',
    }).setOrigin(0.5);

    const total = window._totalScore || 0;
    this.add.text(CW / 2, 338, `FINAL SCORE: ${total}`, {
      fontSize: '28px', fill: '#ffffff', fontFamily: 'Courier New', fontStyle: 'bold',
      stroke: '#ffcc00', strokeThickness: 2,
    }).setOrigin(0.5);

    for (let i = 0; i < 60; i++) {
      const x   = Phaser.Math.Between(0, CW);
      const col = [0xffcc00, 0xff4444, 0x44ff44, 0x4488ff, 0xff44cc, 0xffffff][i % 6];
      const dot = this.add.circle(x, -15, Phaser.Math.Between(4, 10), col);
      this.tweens.add({
        targets: dot, y: CH + 20, x: x + Phaser.Math.Between(-120, 120),
        duration: Phaser.Math.Between(2000, 4000), delay: Phaser.Math.Between(0, 1200),
        repeat: -1,
      });
    }

    const play = this.add.text(CW / 2, 430, 'PLAY AGAIN', {
      fontSize: '26px', fill: '#000', fontFamily: 'Courier New', fontStyle: 'bold',
      backgroundColor: '#ffcc00', padding: { x: 24, y: 14 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    play.on('pointerover', () => play.setStyle({ fill: '#333' }));
    play.on('pointerdown', () => { window._musicPlaying = false; this.scene.start('Menu'); });
    this.input.keyboard.on('keydown-ENTER', () => { window._musicPlaying = false; this.scene.start('Menu'); });

    if (this.replayUnlocked) {
      const replay = this.add.text(CW / 2, 508, '◄◄ WATCH REPLAY ×5', {
        fontSize: '17px', fill: '#aaffaa', fontFamily: 'Courier New', fontStyle: 'bold',
        backgroundColor: '#0a1a0a', padding: { x: 18, y: 10 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      replay.on('pointerover', () => replay.setStyle({ fill: '#ffffff' }));
      replay.on('pointerout',  () => replay.setStyle({ fill: '#aaffaa' }));
      replay.on('pointerdown', () => this.scene.start('Game', { level: 1, replay: true }));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Drawing helpers
// ═══════════════════════════════════════════════════════════════════

function _drawCan(g) {
  g.fillStyle(C_GAS_CAN);   g.fillRect(-11, -10, 22, 22);
  g.lineStyle(2, 0x000000); g.strokeRect(-11, -10, 22, 22);
  g.fillStyle(0xffffff, 0.2); g.fillRect(-11, -10, 22, 5);
  g.fillStyle(0xffcc00);    g.fillRect(-6, -17, 12, 9);
  g.lineStyle(2, 0x000000); g.strokeRect(-6, -17, 12, 9);
  g.fillStyle(0xccaa00);    g.fillRect(-2, -21, 4, 6);
  g.lineStyle(3, 0x000000);
  g.beginPath(); g.moveTo(-11, -4); g.lineTo(-16, -4); g.lineTo(-16, 6); g.lineTo(-11, 6); g.strokePath();
  g.fillStyle(0xffffff, 0.6); g.fillRect(-5, -4, 10, 12);
}

function _drawStump(g) {
  g.fillStyle(0x5c2d00, 0.4); g.fillEllipse(2, 17, 32, 10);
  g.fillStyle(C_STUMP);       g.fillCircle(0, 0, 15);
  g.lineStyle(3, 0x000000);   g.strokeCircle(0, 0, 15);
  g.lineStyle(1, 0x5c2d00, 0.7);
  [10, 6, 3].forEach(r => g.strokeCircle(0, 0, r));
  g.fillStyle(0x5c2d00); g.fillCircle(0, 0, 2);
  g.lineStyle(3, 0x5c2d00);
  [[-7, 12, -13, 20], [-1, 15, 0, 22], [6, 12, 11, 20]].forEach(([x1, y1, x2, y2]) => {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
  });
}

function _drawCricket(g) {
  g.fillStyle(C_CRICKET);     g.fillEllipse(0, 2, 24, 15);
  g.lineStyle(2, 0x000000);   g.strokeEllipse(0, 2, 24, 15);
  g.fillStyle(0x33aa33);      g.fillCircle(10, -2, 8);
  g.lineStyle(2, 0x000000);   g.strokeCircle(10, -2, 8);
  g.fillStyle(0x000000);      g.fillCircle(13, -3, 2.5);
  g.fillStyle(0xffffff);      g.fillCircle(14, -4, 1);
  g.lineStyle(1, 0x000000);
  g.beginPath(); g.moveTo(12, -9);  g.lineTo(20, -20); g.strokePath();
  g.beginPath(); g.moveTo(10, -10); g.lineTo(16, -22); g.strokePath();
  g.lineStyle(2, 0x006600);
  [[-6, -3, -14, -10], [-2, -3, -8, -12], [3, -3, 2, -12],
   [-6, 8, -14, 16],   [-2, 8, -6, 16],   [3, 8, 6, 16]]
    .forEach(([x1, y1, x2, y2]) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath(); });
  g.lineStyle(3, 0x228b22);
  g.beginPath(); g.moveTo(-8, 2); g.lineTo(-18, -6); g.lineTo(-12, 14); g.strokePath();
}

function _drawDog(g) {
  // Shadow
  g.fillStyle(0x000000, 0.15); g.fillEllipse(1, 11, 34, 8);
  // Body
  g.fillStyle(C_DOG);          g.fillEllipse(0, 0, 32, 18);
  g.lineStyle(2, 0x8a6030);    g.strokeEllipse(0, 0, 32, 18);
  // Head
  g.fillStyle(C_DOG);          g.fillCircle(14, -4, 10);
  g.lineStyle(2, 0x8a6030);    g.strokeCircle(14, -4, 10);
  // Floppy ear
  g.fillStyle(0xa07040);
  g.fillTriangle(8, -12, 3, -22, 14, -16);
  g.lineStyle(1, 0x7a5020);
  g.beginPath(); g.moveTo(8, -12); g.lineTo(3, -22); g.lineTo(14, -16); g.strokePath();
  // Eye
  g.fillStyle(0x000000); g.fillCircle(18, -6, 2.5);
  g.fillStyle(0xffffff); g.fillCircle(19, -7, 1);
  // Nose
  g.fillStyle(0x3a1a00); g.fillCircle(22, -2, 2.5);
  // Tail
  g.lineStyle(4, C_DOG);
  g.beginPath(); g.moveTo(-14, -2); g.lineTo(-22, -10); g.strokePath();
  // Legs
  g.lineStyle(4, C_DOG);
  [[-8, 8, -8, 18], [0, 9, 0, 19], [6, 8, 6, 18], [12, 7, 12, 17]]
    .forEach(([x1, y1, x2, y2]) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath(); });
}

// ═══════════════════════════════════════════════════════════════════
//  Phaser config & launch
// ═══════════════════════════════════════════════════════════════════
const PHASER_CONFIG = {
  type: Phaser.AUTO,
  width:  CW,
  height: TOTAL_H,
  parent: 'game-container',
  backgroundColor: '#111',
  scene: [BootScene, MenuScene, GameScene, LevelCompleteScene, GameOverScene, WinScene],
  scale: {
    mode:       Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

window._gameInstance = new Phaser.Game(PHASER_CONFIG);
