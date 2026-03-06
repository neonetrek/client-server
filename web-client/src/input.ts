/**
 * NeoNetrek Input Handler
 *
 * Handles keyboard and mouse input, translating them
 * to Netrek protocol commands.
 */

import { NetrekConnection } from './net';
import { GameState } from './state';
import { Renderer } from './renderer';
import { LoginFormController } from './login-form';
import {
  PFSHIELD, PFCLOAK, PFORBIT, PFREPAIR, PFBOMB, PFTRACT, PFPRESS,
  FED, ROM, KLI, ORI,
  SCOUT, DESTROYER, CRUISER, BATTLESHIP, ASSAULT, STARBASE, SGALAXY,
  MALL, MTEAM, MINDIV,
  SHIP_STATS, PALIVE, TRACTDIST, PHASEDIST, MAXPLAYER, TWIDTH,
} from './constants';

export class InputHandler {
  private net: NetrekConnection;
  private state: GameState;
  private renderer: Renderer;
  private keysDown = new Set<string>();
  private loginState: 'waiting' | 'formActive' | 'done' = 'waiting';
  loginForm!: LoginFormController;

  // Chat state
  private chatMode = false;
  private chatBuffer = '';
  private chatTarget: 'all' | 'team' | number = 'all'; // 'all', 'team', or player number

  // Help overlay
  private showHelp = false;

  // Quit confirmation
  private quitPending = false;

  // Arrow-key turning: last direction sent to avoid spamming dupes
  private lastSentDir = -1;
  // Fractional turn accumulator (mirrors server's p_subdir)
  private turnSubDir = 0;
  // Throttle for held ArrowUp/Down speed changes
  private lastSpeedTickTime = 0;

  // Beam attempt retry interval (retries lock-on every 1s for up to 5s)
  private beamRetryInterval: ReturnType<typeof setInterval> | null = null;

  // Mouse cursor position in galactic coords (null = no mouse, keyboard-only)
  private cursorGX: number | null = null;
  private cursorGY: number | null = null;
  private lastMouseMoveTime = 0;

  constructor(net: NetrekConnection, state: GameState, renderer: Renderer) {
    this.net = net;
    this.state = state;
    this.renderer = renderer;
  }

  get isChatting(): boolean { return this.chatMode; }
  get chatText(): string { return this.chatBuffer; }
  get isHelpVisible(): boolean { return this.showHelp; }
  setLoginDone() {
    this.loginState = 'done';
  }

  get chatTargetLabel(): string {
    if (this.chatTarget === 'all') return 'ALL';
    if (this.chatTarget === 'team') return 'TEAM';
    return `Player ${this.chatTarget}`;
  }

  /** Reset login/chat state (called on reconnect) */
  resetLoginState() {
    this.loginState = 'waiting';
    this.chatMode = false;
    this.chatBuffer = '';
    this.state.desiredSpeed = -1;
    this.loginForm?.reset();
    this.loginForm?.hide();
  }

  setup(canvas: HTMLCanvasElement) {
    document.addEventListener('keydown', (e) => { this.net.notifyInput(); this.onKeyDown(e); });
    document.addEventListener('keyup', (e) => { this.net.notifyInput(); this.onKeyUp(e); });
    canvas.addEventListener('mousedown', (e) => { this.net.notifyInput(); this.onMouseDown(e, canvas); });
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e, canvas));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Called each render tick to process held arrow keys for continuous turning.
   *  Turn rate matches the server's changedir() formula (newturn mode):
   *    per server frame (10 FPS): p_subdir += s_turns / (speed^2)
   *    direction ticks = p_subdir / 1000
   *  Client ticks at 20 FPS (REDRAW_RATE=50ms), so we accumulate half per tick. */
  tickHeldKeys() {
    if (this.chatMode) return;
    if (this.state.phase !== 'alive') {
      // Clean up beam retry if we left alive phase (death, disconnect, etc.)
      if (this.beamRetryInterval) this.cancelBeamAttempt();
      return;
    }

    const me = this.state.players[this.state.myNumber];
    if (!me) return;

    // Held ArrowUp/Down: increment/decrement desired speed, throttled
    const up = this.keysDown.has('ArrowUp');
    const down = this.keysDown.has('ArrowDown');
    if (up || down) {
      const now = Date.now();
      if (now - this.lastSpeedTickTime >= 200) {
        this.lastSpeedTickTime = now;
        const maxSpeed = SHIP_STATS[me.shipType]?.speed ?? 12;
        const base = this.state.desiredSpeed >= 0 ? this.state.desiredSpeed : me.speed;
        let newSpeed = base;
        if (up) newSpeed = Math.min(base + 1, maxSpeed);
        if (down) newSpeed = Math.max(base - 1, 0);
        if (newSpeed !== base) {
          this.state.desiredSpeed = newSpeed;
          this.net.sendSpeed(newSpeed);
        }
      }
    } else {
      this.lastSpeedTickTime = 0;
    }

    // Clear desiredSpeed once actual speed has caught up
    if (this.state.desiredSpeed >= 0 && me.speed === this.state.desiredSpeed) {
      this.state.desiredSpeed = -1;
    }

    const left = this.keysDown.has('ArrowLeft');
    const right = this.keysDown.has('ArrowRight');
    if (!left && !right) {
      this.turnSubDir = 0;
      return;
    }

    const speed = me.speed;
    const sTurns = SHIP_STATS[me.shipType]?.turns ?? 170000;
    let step: number;

    // Max step per tick to keep arrow keys controllable at low speeds
    // 8 dir/tick at 20 FPS = 160 dir/sec = full circle in ~1.6s
    const MAX_STEP = 8;

    if (speed === 0) {
      // At speed 0 the server sets direction instantly
      step = MAX_STEP;
      this.turnSubDir = 0;
    } else {
      // Accumulate fractional turn: server adds s_turns/(speed^2) per frame at 10 FPS,
      // client ticks at 20 FPS so add half that per tick
      this.turnSubDir += sTurns / (speed * speed * 2);
      step = Math.min(Math.floor(this.turnSubDir / 1000), MAX_STEP);
      if (step < 1) return;
      this.turnSubDir %= 1000;
    }

    let newDir = me.dir;
    if (left) newDir = (me.dir - step + 256) & 0xFF;
    if (right) newDir = (me.dir + step) & 0xFF;

    // Dedup: don't resend if we already sent this direction
    if (newDir === this.lastSentDir) return;
    this.lastSentDir = newDir;

    this.net.sendDirection(newDir);
    this.state.desiredDir = newDir;
  }

  private onKeyDown(e: KeyboardEvent) {
    // Don't intercept keys while the login form is active
    if (this.loginForm?.isVisible) return;

    this.keysDown.add(e.key);

    // Help toggle works in any phase
    if (e.key === '?') {
      this.showHelp = !this.showHelp;
      return;
    }

    // Dismiss help on any other key
    if (this.showHelp) {
      this.showHelp = false;
      return;
    }

    // Chat mode intercepts all keys
    if (this.chatMode) {
      this.handleChatInput(e);
      return;
    }

    // Handle login flow
    if (this.state.phase === 'login') {
      this.handleLoginInput(e);
      return;
    }

    // Handle outfit selection
    if (this.state.phase === 'outfit' || this.state.phase === 'dead') {
      this.handleOutfitInput(e);
      return;
    }

    // Gameplay keys
    if (this.state.phase === 'alive') {
      this.handleGameplayInput(e);
    }
  }

  private onKeyUp(e: KeyboardEvent) {
    this.keysDown.delete(e.key);
  }

  private handleLoginInput(e: KeyboardEvent) {
    if (!this.state.connected) return;

    switch (this.loginState) {
      case 'waiting':
        if (e.key === 'Enter') {
          e.preventDefault(); // prevent Enter from propagating to form input
          this.loginState = 'formActive';
          this.loginForm.show();
        }
        break;

      case 'formActive':
        // Form handles all input via stopPropagation; nothing to do here
        break;

      case 'done':
        // Phase may have transitioned to 'outfit' between frames
        if (this.state.phase === 'outfit' || this.state.phase === 'dead') {
          this.handleOutfitInput(e);
        } else if (e.key === 'Enter') {
          e.preventDefault(); // prevent Enter from propagating to form input
          // Login was rejected — re-show form for retry (keep username, clear password)
          this.loginState = 'formActive';
          this.loginForm.clearPassword();
          this.loginForm.show();
        }
        break;
    }
  }

  private handleOutfitInput(e: KeyboardEvent) {
    // Team selection
    const teamMap: Record<string, number> = {
      'f': FED, 'F': FED,
      'r': ROM, 'R': ROM,
      'k': KLI, 'K': KLI,
      'o': ORI, 'O': ORI,
    };

    const team = teamMap[e.key];
    if (team !== undefined) {
      console.log(`[input] Team key '${e.key}' → team=${team}, teamMask=0x${this.state.teamMask.toString(16)}, match=${!!(this.state.teamMask & team)}`);
      if (this.state.teamMask & team) {
        this.state.myTeam = team;
        this.state.warningText = 'Ship: (s)cout (d)estroyer (c)ruiser (b)attleship (a)ssault (g)alaxy';
        this.state.warningTime = Date.now();
      } else {
        this.state.warningText = 'That team is not available';
        this.state.warningTime = Date.now();
      }
      return;
    }

    // Ship selection (only if team is chosen)
    if (this.state.myTeam) {
      const shipMap: Record<string, number> = {
        's': SCOUT, 'd': DESTROYER, 'c': CRUISER,
        'b': BATTLESHIP, 'a': ASSAULT, 'g': SGALAXY,
      };
      const ship = shipMap[e.key.toLowerCase()];
      if (ship !== undefined) {
        this.net.sendOutfit(this.state.myTeam, ship);
        this.state.warningText = 'Outfitting...';
        this.state.warningTime = Date.now();
      }
    } else {
      this.state.warningText = 'Select team: (f)ed (r)om (k)li (o)ri';
      this.state.warningTime = Date.now();
    }
  }

  private handleGameplayInput(e: KeyboardEvent) {
    const key = e.key;
    const me = this.state.players[this.state.myNumber];
    if (!me) return;

    // Speed keys: 0-9, shift combos for 10-12
    const maxSpeed = SHIP_STATS[me.shipType]?.speed ?? 12;
    let speedReq = -1;
    if (key >= '0' && key <= '9') speedReq = parseInt(key);
    else if (key === '!' || key === ')') speedReq = 10;
    else if (key === '@') speedReq = 11;
    else if (key === '#' || key === '%') speedReq = 12;
    if (speedReq >= 0) {
      const clamped = Math.min(speedReq, maxSpeed);
      if (clamped !== me.speed) {
        this.state.desiredSpeed = clamped;
        this.net.sendSpeed(clamped);
      }
      e.preventDefault();
      return;
    }

    // ArrowUp/ArrowDown handled in tickHeldKeys() for reliable held-key behavior
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      e.preventDefault();
      return;
    }

    switch (key) {
      // === WEAPONS (top row: W E T) ===

      // Torpedo (keyboard alternative to right-click)
      case 'w':
        this.net.sendTorp(me.dir);
        break;

      // Phaser — auto-target nearest enemy within phaser range
      case 'e':
        this.net.sendPhaser(this.directionToNearestEnemy() ?? me.dir);
        break;

      // Plasma torpedo
      case 't':
      case 'T':
        this.net.sendPlasma(me.dir);
        break;

      // === DEFENSE (home row: S D F G) ===

      // Shields toggle
      case 's':
        this.net.sendShield(!(me.flags & PFSHIELD));
        break;

      // Det enemy torps
      case 'd':
        this.net.sendDetTorps();
        break;

      // Cloak toggle
      case 'f':
        this.net.sendCloak(!(me.flags & PFCLOAK));
        break;

      // Repair toggle
      case 'g':
        this.net.sendRepair(!(me.flags & PFREPAIR));
        break;

      // === PLANET OPS (bottom row: Z X C B) ===

      // Beam up
      case 'z':
        this.net.sendBeam(true);
        break;

      // Beam down
      case 'x':
        this.net.sendBeam(false);
        break;

      // Orbit toggle
      case 'c':
        this.net.sendOrbit(!(me.flags & PFORBIT));
        break;

      // Bomb toggle
      case 'b':
        this.net.sendBomb(!(me.flags & PFBOMB));
        break;

      // Tractor beam
      case 'q': {
        if (this.state.beamAttempt) {
          // Attempt in progress — cancel
          this.net.sendTractor(false, 0);
          this.cancelBeamAttempt();
        } else if (me.flags & (PFTRACT | PFPRESS)) {
          // Currently locked (tractor or pressor) — break
          if (me.flags & PFTRACT) this.net.sendTractor(false, 0);
          if (me.flags & PFPRESS) this.net.sendRepress(false, 0);
        } else {
          // Start new tractor attempt
          const target = this.findNearestTarget();
          if (target >= 0) this.startBeamAttempt(false, target);
        }
        break;
      }

      // Pressor beam
      case 'r': {
        if (this.state.beamAttempt) {
          // Attempt in progress — cancel
          this.net.sendRepress(false, 0);
          this.cancelBeamAttempt();
        } else if (me.flags & (PFTRACT | PFPRESS)) {
          // Currently locked (tractor or pressor) — break
          if (me.flags & PFTRACT) this.net.sendTractor(false, 0);
          if (me.flags & PFPRESS) this.net.sendRepress(false, 0);
        } else {
          // Start new pressor attempt
          const target = this.findNearestTarget();
          if (target >= 0) this.startBeamAttempt(true, target);
        }
        break;
      }

      // War declaration: Shift+W (not CapsLock+W)
      case 'W': {
        if (!e.shiftKey) { this.net.sendTorp(me.dir); break; }
        const enemies = (FED | ROM | KLI | ORI) & ~me.team;
        this.net.sendWar(enemies);
        this.state.warningText = 'Declared war on all enemies';
        this.state.warningTime = Date.now();
        break;
      }

      // Planet lock (lock onto nearest planet)
      case 'l':
        // Will be enhanced with click-targeting later
        break;

      // Enter chat mode
      case ';':
        this.chatMode = true;
        this.chatBuffer = '';
        this.chatTarget = 'all';
        this.state.warningText = '[ALL] > _';
        this.state.warningTime = Date.now();
        e.preventDefault();
        break;

      // Team chat
      case 'Enter':
        this.chatMode = true;
        this.chatBuffer = '';
        this.chatTarget = 'team';
        this.state.warningText = '[TEAM] > _';
        this.state.warningTime = Date.now();
        e.preventDefault();
        break;

      // Mute toggle
      case 'M': {
        const muted = this.net.audio.toggleMute();
        this.state.warningText = muted ? 'Sound: OFF' : 'Sound: ON';
        this.state.warningTime = Date.now();
        break;
      }

      // Quit game (disconnect and return to login)
      case 'Q':
        if (e.shiftKey && !e.repeat) {
          if (!this.quitPending) {
            this.quitPending = true;
            this.state.warningText = 'Press Shift+Q again to quit';
            this.state.warningTime = Date.now();
            setTimeout(() => { this.quitPending = false; }, 3000);
          } else {
            this.quitPending = false;
            this.net.quitAndReconnect();
          }
        }
        break;
    }
  }

  /** Start a 5s beam lock-on attempt with automatic retries every 1s. */
  private startBeamAttempt(isPressor: boolean, target: number) {
    const me = this.state.players[this.state.myNumber];

    // Send initial request
    if (isPressor) {
      this.net.sendRepress(true, target);
    } else {
      this.net.sendTractor(true, target);
    }

    this.state.beamAttempt = {
      playerNum: me.number, targetNum: target,
      isPressor, time: Date.now(),
    };

    // Retry every 1s until confirmed or 5s timeout
    this.clearBeamRetry();
    this.beamRetryInterval = setInterval(() => {
      const attempt = this.state.beamAttempt;
      if (!attempt) { this.clearBeamRetry(); return; }

      const me = this.state.players[this.state.myNumber];
      if (!me || me.status !== PALIVE) { this.cancelBeamAttempt(); return; }

      // Server confirmed the lock
      const confirmed = attempt.isPressor
        ? !!(me.flags & PFPRESS)
        : !!(me.flags & PFTRACT);
      if (confirmed) { this.cancelBeamAttempt(); return; }

      // 5s timeout — give up
      if (Date.now() - attempt.time > 5000) { this.cancelBeamAttempt(); return; }

      // Resend lock request
      if (attempt.isPressor) {
        this.net.sendRepress(true, attempt.targetNum);
      } else {
        this.net.sendTractor(true, attempt.targetNum);
      }
    }, 1000);
  }

  private cancelBeamAttempt() {
    this.state.beamAttempt = null;
    this.clearBeamRetry();
  }

  private clearBeamRetry() {
    if (this.beamRetryInterval !== null) {
      clearInterval(this.beamRetryInterval);
      this.beamRetryInterval = null;
    }
  }

  private handleChatInput(e: KeyboardEvent) {
    e.preventDefault();

    if (e.key === 'Escape') {
      this.chatMode = false;
      this.chatBuffer = '';
      this.state.warningText = '';
      return;
    }

    if (e.key === 'Enter') {
      if (this.chatBuffer.length > 0) {
        const group = this.chatTarget === 'all' ? MALL
          : this.chatTarget === 'team' ? MTEAM
          : MINDIV;
        const to = typeof this.chatTarget === 'number' ? this.chatTarget : 0;
        this.net.sendMessage(to, group, this.chatBuffer);
      }
      this.chatMode = false;
      this.chatBuffer = '';
      this.state.warningText = '';
      return;
    }

    if (e.key === 'Backspace') {
      this.chatBuffer = this.chatBuffer.slice(0, -1);
    } else if (e.key.length === 1 && this.chatBuffer.length < 79) {
      this.chatBuffer += e.key;
    }

    const prefix = this.chatTarget === 'all' ? '[ALL]' : this.chatTarget === 'team' ? '[TEAM]' : `[P${this.chatTarget}]`;
    this.state.warningText = `${prefix} > ${this.chatBuffer}_`;
    this.state.warningTime = Date.now();
  }

  /** Convert canvas pixel coordinates to galactic coordinates. */
  private canvasToGalactic(mx: number, my: number): { gx: number; gy: number } | null {
    const me = this.state.players[this.state.myNumber];
    if (!me) return null;
    const size = this.renderer.canvasSize;
    const scale = size / TWIDTH;
    const gx = me.x + (mx - size / 2) / scale;
    const gy = me.y + (my - size / 2) / scale;
    return { gx, gy };
  }

  private onMouseMove(e: MouseEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const pos = this.canvasToGalactic(mx, my);
    if (pos) {
      this.cursorGX = pos.gx;
      this.cursorGY = pos.gy;
      this.lastMouseMoveTime = Date.now();
    }
  }

  /**
   * Find the nearest enemy within phaser range and return the netrek
   * direction (0-255) toward them, or null if no target found.
   */
  private directionToNearestEnemy(): number | null {
    const s = this.state;
    const me = s.players[s.myNumber];
    if (!me) return null;

    let bestNum = -1;
    let bestDist = Infinity;

    for (let i = 0; i < MAXPLAYER; i++) {
      if (i === me.number) continue;
      const p = s.players[i];
      if (p.status !== PALIVE) continue;
      if (p.flags & PFCLOAK) continue;

      const dx = p.x - me.x;
      const dy = p.y - me.y;
      const dist = dx * dx + dy * dy;
      if (dist > PHASEDIST * PHASEDIST) continue;
      if (dist < bestDist) {
        bestDist = dist;
        bestNum = i;
      }
    }

    if (bestNum < 0) return null;
    const target = s.players[bestNum];
    const dx = target.x - me.x;
    const dy = target.y - me.y;
    // Same conversion as mouse click: atan2(dy, dx) + PI/2 → netrek dir
    const angle = Math.atan2(dy, dx);
    return Math.round(((angle + Math.PI / 2) / (Math.PI * 2)) * 256 + 256) & 0xFF;
  }

  /**
   * Find the nearest alive, non-cloaked player within range.
   * Mouse users: nearest to cursor. Keyboard-only: nearest in ship direction.
   * Returns player number or -1 if none found.
   */
  private findNearestTarget(): number {
    const s = this.state;
    const me = s.players[s.myNumber];
    if (!me) return -1;

    const useCursor = this.cursorGX !== null && (Date.now() - this.lastMouseMoveTime < 5000);
    const refX = useCursor ? this.cursorGX! : me.x;
    const refY = useCursor ? this.cursorGY! : me.y;

    // Only consider targets within 125% of tractor range
    const maxRange = TRACTDIST * (SHIP_STATS[me.shipType]?.tractRng ?? 1.0) * 1.25;

    let bestNum = -1;
    let bestDist = Infinity;

    // For keyboard-only: compute ship direction vector for angular weighting
    const shipAngle = (me.dir / 256) * Math.PI * 2 - Math.PI / 2; // netrek dir to radians

    for (let i = 0; i < MAXPLAYER; i++) {
      if (i === me.number) continue;
      const p = s.players[i];
      if (p.status !== PALIVE) continue;
      if (p.flags & PFCLOAK) continue; // can't target cloaked

      const dx = p.x - me.x;
      const dy = p.y - me.y;
      const distFromMe = Math.sqrt(dx * dx + dy * dy);
      if (distFromMe > maxRange) continue;

      if (useCursor) {
        const cdx = p.x - refX;
        const cdy = p.y - refY;
        const distFromCursor = Math.sqrt(cdx * cdx + cdy * cdy);
        if (distFromCursor < bestDist) {
          bestDist = distFromCursor;
          bestNum = i;
        }
      } else {
        // Keyboard-only: weight by angular proximity to ship heading
        const angleToPlayer = Math.atan2(dy, dx);
        let angleDiff = Math.abs(angleToPlayer - shipAngle);
        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

        // Score: prefer close + on-heading
        const score = distFromMe * (1 + angleDiff * 2);
        if (score < bestDist) {
          bestDist = score;
          bestNum = i;
        }
      }
    }

    return bestNum;
  }

  private onMouseDown(e: MouseEvent, canvas: HTMLCanvasElement) {
    if (this.chatMode) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cw = this.renderer.canvasWidth;
    const ch = this.renderer.canvasHeight;

    // Outfit screen: click on team/ship boxes
    if (this.state.phase === 'outfit' || this.state.phase === 'dead') {
      this.handleOutfitClick(mx, my, cw);
      return;
    }

    if (this.state.phase !== 'alive') return;

    // Calculate direction from center of canvas
    const dx = mx - cw / 2;
    const dy = my - ch / 2;
    const angle = Math.atan2(dy, dx);
    // Convert to netrek direction (0-255, 0=north, clockwise)
    const dir = Math.round(((angle + Math.PI / 2) / (Math.PI * 2)) * 256) & 0xFF;

    if (e.button === 0) {
      // Left click: set course
      this.state.desiredDir = dir;
      this.net.sendDirection(dir);
    } else if (e.button === 1) {
      // Middle click: fire phaser
      this.net.sendPhaser(dir);
      e.preventDefault();
    } else if (e.button === 2) {
      // Right click: fire torpedo
      this.net.sendTorp(dir);
      e.preventDefault();
    }
  }

  private handleOutfitClick(mx: number, my: number, size: number) {
    const teams = [
      { flag: FED }, { flag: ROM }, { flag: KLI }, { flag: ORI },
    ];
    const ships = [SCOUT, DESTROYER, CRUISER, BATTLESHIP, ASSAULT, SGALAXY];

    // Team box layout (must match renderer)
    const gap = 14;
    const teamPad = 10;
    const boxW = Math.min(110, Math.floor((size - teamPad * 2 - (teams.length - 1) * gap) / teams.length));
    const boxH = 90;
    const totalW = teams.length * boxW + (teams.length - 1) * gap;
    const startX = (size - totalW) / 2;
    const teamY = 38;

    // Check team box clicks
    for (let i = 0; i < teams.length; i++) {
      const x = startX + i * (boxW + gap);
      if (mx >= x && mx <= x + boxW && my >= teamY && my <= teamY + boxH) {
        const team = teams[i].flag;
        if (this.state.teamMask & team) {
          this.state.myTeam = team;
          this.state.warningText = 'Ship: (s)cout (d)estroyer (c)ruiser (b)attleship (a)ssault (g)alaxy';
          this.state.warningTime = Date.now();
        }
        return;
      }
    }

    // Ship box layout (must match renderer)
    if (!this.state.myTeam) return;
    const shipGap = 6;
    const shipPad = 10;
    const shipW = Math.min(72, Math.floor((size - shipPad * 2 - (ships.length - 1) * shipGap) / ships.length));
    const shipH = 120;
    const totalShipW = ships.length * shipW + (ships.length - 1) * shipGap;
    const shipStartX = (size - totalShipW) / 2;
    const shipY = teamY + boxH + 45;

    for (let i = 0; i < ships.length; i++) {
      const x = shipStartX + i * (shipW + shipGap);
      if (mx >= x && mx <= x + shipW && my >= shipY && my <= shipY + shipH) {
        this.net.sendOutfit(this.state.myTeam, ships[i]);
        this.state.warningText = 'Outfitting...';
        this.state.warningTime = Date.now();
        return;
      }
    }
  }
}
