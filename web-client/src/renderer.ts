/**
 * NeoNetrek Renderer
 *
 * Canvas 2D rendering for tactical and galactic views (always side-by-side),
 * plus HTML status bar, player list, and message panel.
 * CRT glow effect via shadowBlur on all drawn elements.
 */

import { GameState, Player, Torpedo, Phaser, Planet, Message } from './state';
import {
  GWIDTH, TWIDTH,
  PALIVE, PEXPLODE, PFREE,
  TMOVE, TEXPLODE,
  PTMOVE, PTEXPLODE,
  PHMISS, PHHIT, PHHIT2,
  PFSHIELD, PFCLOAK, PFORBIT, PFREPAIR, PFBOMB, PFTRACT, PFPRESS,
  PFGREEN, PFYELLOW, PFRED,
  PLREPAIR, PLFUEL, PLAGRI, PLHOME,
  TEAM_COLORS, TEAM_LETTERS, SHIP_SHORT, SHIP_STATS,
  RANK_NAMES,
  FED, ROM, KLI, ORI, IND,
  SCOUT, DESTROYER, CRUISER, BATTLESHIP, ASSAULT, SGALAXY,
  MAXTORP, MAXPLAYER,
  MVALID, MINDIV, MTEAM, MALL, MGOD,
} from './constants';
import { drawShipSVG } from './ships';

// How many galactic units fit in the tactical view
const TAC_RANGE = TWIDTH; // 20000
const TWO_PI = Math.PI * 2;

// Parallax starfield configuration
const STAR_TILE_SIZE = 20000; // galactic units — matches tactical range so no visible repeat
interface Star { x: number; y: number; size: number; brightness: number }
interface StarLayer { stars: Star[]; parallaxFactor: number; color: string }

function generateStarLayers(): StarLayer[] {
  // Seeded PRNG (simple LCG) for deterministic star positions
  let seed = 42;
  const rand = () => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; };

  const layers: StarLayer[] = [
    { stars: [], parallaxFactor: 0.02, color: '#555' },  // far — dim, slow
    { stars: [], parallaxFactor: 0.05, color: '#888' },  // mid
    { stars: [], parallaxFactor: 0.1,  color: '#bbb' },  // near — bright, fast
  ];
  const counts = [50, 30, 15]; // stars per tile per layer (tile = full tactical range)

  for (let i = 0; i < layers.length; i++) {
    for (let j = 0; j < counts[i]; j++) {
      layers[i].stars.push({
        x: rand() * STAR_TILE_SIZE,
        y: rand() * STAR_TILE_SIZE,
        size: 0.5 + rand() * (i === 2 ? 1.5 : i === 1 ? 1.0 : 0.5),
        brightness: 0.3 + rand() * 0.7,
      });
    }
  }
  return layers;
}

// Pre-computed translucent team colors for planet fill
const TEAM_COLORS_ALPHA: Record<number, string> = {};
for (const [team, color] of Object.entries(TEAM_COLORS)) {
  TEAM_COLORS_ALPHA[Number(team)] = color + '33';
}

// Status bar configuration
interface BarRef {
  fill: HTMLElement;
  value: HTMLElement;
}

export class Renderer {
  private tacCanvas: HTMLCanvasElement;
  private galCanvas: HTMLCanvasElement;
  private tacCtx: CanvasRenderingContext2D;
  private galCtx: CanvasRenderingContext2D;
  private state: GameState;
  private _canvasSize: number;
  private _showHelp = false;
  loginFormVisible = false;

  // HTML panel elements
  private statusBarEl: HTMLElement;
  private playerListEl: HTMLElement;
  private messagePanelEl: HTMLElement;

  // Cached status bar refs
  private bars: Record<string, BarRef> = {};
  private speedEl!: HTMLElement;
  private armiesEl!: HTMLElement;
  private killsEl!: HTMLElement;
  private flagsEl!: HTMLElement;
  private lagEl!: HTMLElement;
  private alertEl!: HTMLElement;

  // Player list dirty check
  private lastPlayerHash = '';

  // Message tracking
  private lastMessageCount = 0;

  // Parallax starfield
  private starLayers: StarLayer[];

  // Ship visual effect state
  private bankAngles = new Float32Array(32);
  private shieldHitTime = new Float64Array(32);

  // Smoothed trajectory angles (lerped each frame for smooth transitions)
  private smoothCurAngle = 0;
  private smoothTargetAngle = 0;
  private smoothTurning = false;
  private trajectoryInited = false;

  constructor(
    tacCanvas: HTMLCanvasElement,
    galCanvas: HTMLCanvasElement,
    state: GameState,
    statusBar: HTMLElement,
    playerList: HTMLElement,
    messagePanel: HTMLElement,
  ) {
    this.tacCanvas = tacCanvas;
    this.galCanvas = galCanvas;
    this.state = state;
    this.statusBarEl = statusBar;
    this.playerListEl = playerList;
    this.messagePanelEl = messagePanel;

    this._canvasSize = 300; // will be set by resizeLayout

    this.tacCtx = tacCanvas.getContext('2d')!;
    this.galCtx = galCanvas.getContext('2d')!;

    this.starLayers = generateStarLayers();
    this.initStatusBar();
    this.initPlayerListHeader();
  }

  get canvasSize(): number {
    return this._canvasSize;
  }

  /** Called on window resize to update canvas dimensions */
  resizeCanvases(size: number) {
    this._canvasSize = size;
    const dpr = window.devicePixelRatio || 1;

    for (const canvas of [this.tacCanvas, this.galCanvas]) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    }

    this.tacCtx = this.tacCanvas.getContext('2d')!;
    this.galCtx = this.galCanvas.getContext('2d')!;
    this.tacCtx.scale(dpr, dpr);
    this.galCtx.scale(dpr, dpr);
    this.tacCtx.font = '11px monospace';
    this.galCtx.font = '10px monospace';
  }

  set helpVisible(v: boolean) {
    this._showHelp = v;
  }

  render() {
    // Show outfit screen during outfit/dead phases
    if (this.state.phase === 'outfit' || this.state.phase === 'dead') {
      this.renderOutfit(this.tacCtx, this.canvasSize, this.state.myTeam);
      // Clear galactic during outfit
      const gCtx = this.galCtx;
      const gSize = this.canvasSize;
      gCtx.fillStyle = '#000';
      gCtx.fillRect(0, 0, gSize, gSize);

      if (this._showHelp) this.renderHelp(this.tacCtx, this.canvasSize);
      return;
    }

    // Always render both views side-by-side
    this.renderTactical();
    this.renderGalactic();

    // Update HTML panels
    this.updateStatusBar();
    this.updatePlayerList();
    this.updateMessages();

    if (this._showHelp) this.renderHelp(this.tacCtx, this.canvasSize);
  }

  // ============================================================
  // Status Bar (HTML)
  // ============================================================

  private initStatusBar() {
    const bars = [
      { id: 'sh', label: 'SH', color: '#00ccff' },
      { id: 'hu', label: 'HU', color: '#cc8800' },
      { id: 'fu', label: 'FU', color: '#00ff00' },
      { id: 'wt', label: 'WT', color: '#ff4444' },
      { id: 'et', label: 'ET', color: '#ff8844' },
    ];

    // Alert background wrapper
    const alertEl = document.createElement('span');
    alertEl.className = 'hud-group';
    alertEl.id = 'hud-alert';
    alertEl.style.padding = '2px 6px';
    alertEl.style.borderRadius = '2px';
    this.alertEl = alertEl;

    for (const bar of bars) {
      const group = document.createElement('span');
      group.className = 'hud-group';

      const label = document.createElement('span');
      label.className = 'hud-label';
      label.textContent = bar.label;

      const barBg = document.createElement('span');
      barBg.className = 'hud-bar';

      const fill = document.createElement('span');
      fill.className = 'hud-bar-fill';
      fill.style.backgroundColor = bar.color;
      fill.style.color = bar.color;
      fill.style.width = '0%';
      barBg.appendChild(fill);

      const value = document.createElement('span');
      value.className = 'hud-value';
      value.textContent = '0';

      group.appendChild(label);
      group.appendChild(barBg);
      group.appendChild(value);
      alertEl.appendChild(group);

      this.bars[bar.id] = { fill, value };
    }

    this.statusBarEl.appendChild(alertEl);

    // Separator
    const sep1 = document.createElement('span');
    sep1.className = 'hud-sep';
    sep1.textContent = '|';
    this.statusBarEl.appendChild(sep1);

    // Speed / Armies / Kills
    const textGroup = document.createElement('span');
    textGroup.className = 'hud-group';

    this.speedEl = document.createElement('span');
    this.speedEl.className = 'hud-text';
    this.speedEl.textContent = 'Spd:0';
    textGroup.appendChild(this.speedEl);

    this.armiesEl = document.createElement('span');
    this.armiesEl.className = 'hud-text';
    this.armiesEl.textContent = 'Arm:0';
    textGroup.appendChild(this.armiesEl);

    this.killsEl = document.createElement('span');
    this.killsEl.className = 'hud-text';
    this.killsEl.textContent = 'K:0.00';
    textGroup.appendChild(this.killsEl);

    this.statusBarEl.appendChild(textGroup);

    // Separator
    const sep2 = document.createElement('span');
    sep2.className = 'hud-sep';
    sep2.textContent = '|';
    this.statusBarEl.appendChild(sep2);

    // Flags
    this.flagsEl = document.createElement('span');
    this.flagsEl.className = 'hud-flags';
    this.statusBarEl.appendChild(this.flagsEl);

    // Separator
    const sep3 = document.createElement('span');
    sep3.className = 'hud-sep';
    sep3.textContent = '|';
    this.statusBarEl.appendChild(sep3);

    // Lag
    this.lagEl = document.createElement('span');
    this.lagEl.className = 'hud-lag';
    this.statusBarEl.appendChild(this.lagEl);

    // Spacer to push help hint right
    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    this.statusBarEl.appendChild(spacer);

    // Persistent help hint
    const helpHint = document.createElement('span');
    helpHint.style.color = '#555';
    helpHint.style.fontSize = '10px';
    helpHint.textContent = '? = help';
    this.statusBarEl.appendChild(helpHint);
  }

  private updateStatusBar() {
    const me = this.state.myNumber >= 0 ? this.state.players[this.state.myNumber] : null;
    if (!me || me.status === PFREE) return;

    const stats = SHIP_STATS[me.shipType];
    const maxShield = stats?.shields ?? 100;
    const maxHull = stats?.hull ?? 100;
    const maxFuel = stats?.fuel ?? 10000;

    this.setBar('sh', me.shield, maxShield);
    this.setBar('hu', maxHull - me.hull, maxHull);
    this.setBar('fu', me.fuel, maxFuel);
    this.setBar('wt', me.wTemp, 1200);
    this.setBar('et', me.eTemp, 1200);

    const ds = this.state.desiredSpeed;
    this.speedEl.textContent = (ds >= 0 && ds !== me.speed)
      ? `Spd:${me.speed}\u2192${ds}`
      : `Spd:${me.speed}`;
    this.armiesEl.textContent = `Arm:${me.armies}`;
    this.killsEl.textContent = `K:${me.kills.toFixed(2)}`;

    // Flags
    const flags: string[] = [];
    if (me.flags & PFSHIELD) flags.push('SH');
    if (me.flags & PFCLOAK) flags.push('CL');
    if (me.flags & PFORBIT) flags.push('OR');
    if (me.flags & PFREPAIR) flags.push('RP');
    if (me.flags & PFBOMB) flags.push('BM');
    this.flagsEl.textContent = flags.join(' ');

    // Alert color
    let alertBg = '#00880044';
    if (me.flags & PFRED) alertBg = '#88000044';
    else if (me.flags & PFYELLOW) alertBg = '#88880044';
    this.alertEl.style.background = alertBg;

    // Lag
    if (this.state.latencyMs >= 0) {
      const lag = this.state.latencyMs;
      const lagColor = lag < 100 ? '#0f0' : lag < 250 ? '#ff0' : '#f00';
      this.lagEl.style.color = lagColor;
      this.lagEl.textContent = `${lag}ms`;
    }
  }

  private setBar(id: string, value: number, max: number) {
    const bar = this.bars[id];
    if (!bar) return;
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    bar.fill.style.width = `${pct}%`;
    bar.value.textContent = `${value}`;
  }

  // ============================================================
  // Player List (HTML table)
  // ============================================================

  private initPlayerListHeader() {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const col of ['No', 'Tm', 'Shp', 'Rank', 'Name', 'Kills', 'Login']) {
      const th = document.createElement('th');
      th.textContent = col;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    tbody.id = 'player-tbody';
    table.appendChild(tbody);

    this.playerListEl.appendChild(table);
  }

  private updatePlayerList() {
    // Build hash of active players for dirty check
    const s = this.state;
    let hash = '';
    for (const p of s.players) {
      if (p.status === PFREE) continue;
      hash += `${p.number}:${p.team}:${p.shipType}:${p.rank}:${p.name}:${p.kills}:${p.login}:${p.status};`;
    }
    if (hash === this.lastPlayerHash) return;
    this.lastPlayerHash = hash;

    const tbody = document.getElementById('player-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    for (const p of s.players) {
      if (p.status === PFREE) continue;

      const tr = document.createElement('tr');
      const color = TEAM_COLORS[p.team] ?? '#888';
      tr.style.color = p.number === s.myNumber ? '#fff' : color;

      const cells = [
        `${TEAM_LETTERS[p.team] ?? '?'}${p.number}`,
        TEAM_LETTERS[p.team] ?? '?',
        SHIP_SHORT[p.shipType] ?? '??',
        RANK_NAMES[p.rank] ?? `R${p.rank}`,
        p.name || '?',
        p.kills.toFixed(2),
        p.login || '',
      ];

      for (const text of cells) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }
  }

  // ============================================================
  // Message Panel (HTML)
  // ============================================================

  private updateMessages() {
    const msgs = this.state.messages;
    if (msgs.length === this.lastMessageCount) return;

    // Append only new messages
    for (let i = this.lastMessageCount; i < msgs.length; i++) {
      const msg = msgs[i];
      const div = document.createElement('div');
      div.className = 'msg-line ' + this.getMessageClass(msg);
      div.textContent = msg.text;
      this.messagePanelEl.appendChild(div);
    }
    this.lastMessageCount = msgs.length;

    // Auto-scroll to bottom
    this.messagePanelEl.scrollTop = this.messagePanelEl.scrollHeight;
  }

  /** Classify a message for color coding based on flags and content. */
  private getMessageClass(msg: Message): string {
    const text = msg.text;

    // God/admin messages
    if (msg.flags & MGOD) return 'msg-god';

    // Detect server kill/take announcements by content patterns
    // These arrive as MALL from the server (from=255 or similar high numbers)
    if (msg.from >= MAXPLAYER) {
      if (/was (killed|ghostbusted)|destroyed by|blew up/.test(text)) return 'msg-kill';
      if (/taken over|captured|bombed|coup/.test(text)) return 'msg-take';
      return 'msg-system';
    }

    // Player messages — classify by audience flag
    if (msg.flags & MINDIV) return 'msg-individual';
    if (msg.flags & MTEAM) return 'msg-team';
    if (msg.flags & MALL) return 'msg-all';

    return 'msg-system';
  }

  // ============================================================
  // Parallax Starfield & Trajectory Line
  // ============================================================

  private renderStarfield(ctx: CanvasRenderingContext2D, size: number, playerX: number, playerY: number) {
    const scale = size / TAC_RANGE;
    const tilePx = STAR_TILE_SIZE * scale;

    for (const layer of this.starLayers) {
      const offsetGX = playerX * layer.parallaxFactor;
      const offsetGY = playerY * layer.parallaxFactor;
      const tileOffsetX = ((offsetGX % STAR_TILE_SIZE) + STAR_TILE_SIZE) % STAR_TILE_SIZE * scale;
      const tileOffsetY = ((offsetGY % STAR_TILE_SIZE) + STAR_TILE_SIZE) % STAR_TILE_SIZE * scale;
      const tilesX = Math.ceil(size / tilePx) + 1;
      const tilesY = Math.ceil(size / tilePx) + 1;

      for (const star of layer.stars) {
        const starBasePxX = star.x * scale;
        const starBasePxY = star.y * scale;
        // Pre-compute alpha color once per star
        const a = Math.round(star.brightness * 255);
        ctx.fillStyle = `rgba(${a},${a},${a},1)`;
        const d = Math.max(1, Math.round(star.size));

        for (let tx = 0; tx < tilesX; tx++) {
          const sx = starBasePxX + tx * tilePx - tileOffsetX;
          if (sx < -d || sx > size + d) continue;
          for (let ty = 0; ty < tilesY; ty++) {
            const sy = starBasePxY + ty * tilePx - tileOffsetY;
            if (sy < -d || sy > size + d) continue;
            ctx.fillRect(sx, sy, d, d);
          }
        }
      }
    }
  }

  /**
   * Trajectory prediction: smooth curve from current heading to desired heading,
   * then straight to screen edge. Uses the server's s_turns to scale the curve
   * length — sluggish ships (BB) curve wider, nimble ships (SC) curve tighter.
   */
  private renderTrajectoryLine(ctx: CanvasRenderingContext2D, size: number, me: Player) {
    if (me.speed <= 0) return;

    const screenCx = size / 2;
    const screenCy = size / 2;

    // Current heading as canvas angle
    const curAngle = (me.dir / 256) * TWO_PI - Math.PI / 2;
    const desDir = this.state.desiredDir;

    // Determine target angle
    let targetAngle = curAngle;
    let turning = false;
    if (desDir >= 0 && desDir !== me.dir) {
      targetAngle = (desDir / 256) * TWO_PI - Math.PI / 2;
      // Normalize delta to shortest path
      let delta = targetAngle - curAngle;
      if (delta > Math.PI) delta -= TWO_PI;
      if (delta < -Math.PI) delta += TWO_PI;
      targetAngle = curAngle + delta;
      turning = true;
    }

    // --- Smooth transitions via angle lerping ---
    if (!this.trajectoryInited) {
      this.smoothCurAngle = curAngle;
      this.smoothTargetAngle = targetAngle;
      this.smoothTurning = turning;
      this.trajectoryInited = true;
    }

    // Lerp factor — higher = faster transition (0.15 = ~6 frames to settle)
    const lerpRate = 0.15;

    // Lerp current angle (shortest path on circle)
    let dCur = curAngle - this.smoothCurAngle;
    if (dCur > Math.PI) dCur -= TWO_PI;
    if (dCur < -Math.PI) dCur += TWO_PI;
    this.smoothCurAngle += dCur * lerpRate;

    // Lerp target angle
    let dTgt = targetAngle - this.smoothTargetAngle;
    if (dTgt > Math.PI) dTgt -= TWO_PI;
    if (dTgt < -Math.PI) dTgt += TWO_PI;
    this.smoothTargetAngle += dTgt * lerpRate;

    // Smooth the turning flag — blend curve steps toward 0 when not turning
    this.smoothTurning = turning || Math.abs(dTgt) > 0.02;

    const useCurAngle = this.smoothCurAngle;
    const useTargetAngle = this.smoothTargetAngle;
    const useTurning = this.smoothTurning;

    // Build path as polyline
    const stepSize = 3; // pixels per step
    const totalSteps = Math.ceil((size * 0.85) / stepSize);

    // Remaining angle delta drives curve length
    let smoothDelta = useTargetAngle - useCurAngle;
    if (smoothDelta > Math.PI) smoothDelta -= TWO_PI;
    if (smoothDelta < -Math.PI) smoothDelta += TWO_PI;
    const absSmoothDelta = Math.abs(smoothDelta);

    // Curve length scales with BOTH turn angle and speed:
    // - bigger turn = longer curve (proportional to delta)
    // - higher speed = longer curve (more distance covered during turn)
    // At speed 9 + 180-degree turn: ~60% of total path is curved
    // At speed 2 + 45-degree turn: ~8% of total path is curved
    const curveSteps = useTurning && absSmoothDelta > 0.01
      ? Math.max(20, Math.round(
          totalSteps * 0.6 * (absSmoothDelta / Math.PI) * Math.min(1.5, me.speed / 6)
        ))
      : 0;

    let x = screenCx;
    let y = screenCy;
    const points: { x: number; y: number }[] = [{ x, y }];

    for (let i = 1; i <= totalSteps; i++) {
      let angle: number;
      if (curveSteps > 0 && i <= curveSteps) {
        const t = i / curveSteps;
        const eased = t * t * (3 - 2 * t);
        angle = useCurAngle + smoothDelta * eased;
      } else {
        angle = curveSteps > 0 ? useTargetAngle : useCurAngle;
      }

      x += Math.cos(angle) * stepSize;
      y += Math.sin(angle) * stepSize;
      points.push({ x, y });

      if (x < -20 || x > size + 20 || y < -20 || y > size + 20) break;
    }

    if (points.length < 2) return;

    // Draw with oscilloscope glow (3-pass)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    // Wide outer bloom
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.02)';
    ctx.lineWidth = 24;
    ctx.shadowBlur = 40;
    ctx.shadowColor = 'rgba(0, 255, 0, 0.3)';
    ctx.stroke();

    // Mid glow
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.03)';
    ctx.lineWidth = 10;
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(0, 255, 0, 0.4)';
    ctx.stroke();

    // Faint core
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.12)';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0, 255, 0, 0.6)';
    ctx.stroke();

    ctx.restore();
  }

  // ============================================================
  // Tactical View
  // ============================================================

  private renderTactical() {
    const ctx = this.tacCtx;
    const s = this.state;
    const size = this.canvasSize;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = '11px monospace';

    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);

    const me = s.myNumber >= 0 ? s.players[s.myNumber] : null;
    if (!me || me.status === PFREE || s.phase === 'login') {
      this.renderMOTD(ctx, size);
      ctx.restore();
      return;
    }

    const cx = me.x;
    const cy = me.y;

    // Parallax starfield (behind everything)
    this.renderStarfield(ctx, size, cx, cy);

    // Draw grid lines (every 5000 galactic units) - CRT subtle glow
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 2;
    ctx.shadowColor = '#1a1a1a';
    const gridSpacing = 5000;
    const scale = size / TAC_RANGE;
    ctx.beginPath();
    for (let gx = 0; gx <= GWIDTH; gx += gridSpacing) {
      const sx = (gx - cx + TAC_RANGE / 2) * scale;
      if (sx >= 0 && sx <= size) {
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, size);
      }
    }
    for (let gy = 0; gy <= GWIDTH; gy += gridSpacing) {
      const sy = (gy - cy + TAC_RANGE / 2) * scale;
      if (sy >= 0 && sy <= size) {
        ctx.moveTo(0, sy);
        ctx.lineTo(size, sy);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw planets in tactical range
    ctx.textAlign = 'center';
    for (const planet of s.planets) {
      if (!planet.name) continue;
      const sx = (planet.x - cx + TAC_RANGE / 2) * scale;
      const sy = (planet.y - cy + TAC_RANGE / 2) * scale;
      if (sx < -30 || sx > size + 30 || sy < -30 || sy > size + 30) continue;
      this.drawTacPlanet(ctx, planet, sx, sy);
    }
    ctx.textAlign = 'left';

    // Draw torpedoes — TNG photon torpedo style with glowing orbs and motion trails
    const torpNow = Date.now();
    for (const torp of s.torps) {
      if (torp.status === TMOVE) {
        const sx = (torp.x - cx + TAC_RANGE / 2) * scale;
        const sy = (torp.y - cy + TAC_RANGE / 2) * scale;
        if (sx < -20 || sx > size + 20 || sy < -20 || sy > size + 20) continue;

        const owner = torp.owner >= 0 && torp.owner < MAXPLAYER ? s.players[torp.owner] : null;
        const isOwn = owner !== null && owner.number === s.myNumber;
        const teamColor = TEAM_COLORS[owner?.team ?? IND] ?? '#888';

        // Base color: own torps warm orange-white, enemy torps team-colored
        const baseR = isOwn ? 255 : parseInt(teamColor.slice(1, 3), 16);
        const baseG = isOwn ? 170 : parseInt(teamColor.slice(3, 5), 16);
        const baseB = isOwn ? 60  : parseInt(teamColor.slice(5, 7), 16);
        const brightR = Math.min(255, baseR + 80);
        const brightG = Math.min(255, baseG + 80);
        const brightB = Math.min(255, baseB + 80);

        // Direction for trail (opposite of travel direction)
        const dirRad = (torp.dir / 256) * TWO_PI - Math.PI / 2;
        const trailDx = -Math.cos(dirRad);
        const trailDy = -Math.sin(dirRad);

        // Per-torp pulsing phase
        const phase = torpNow * 0.008 + torp.number;
        const pulse = Math.sin(phase) * 0.3 + 1.0; // 0.7–1.3

        // Layer 1: Motion trail — ghost circles behind the torp
        ctx.shadowBlur = 0;
        for (let i = 1; i <= 3; i++) {
          const dist = i * 5;
          const gx = sx + trailDx * dist;
          const gy = sy + trailDy * dist;
          const alpha = 0.3 - i * 0.08;
          const radius = 2.5 - i * 0.5;
          ctx.fillStyle = `rgba(${baseR},${baseG},${baseB},${alpha})`;
          ctx.beginPath();
          ctx.arc(gx, gy, Math.max(radius, 0.5), 0, TWO_PI);
          ctx.fill();
        }

        // Layer 2: Light shafts — spiky rays radiating from center (signature TNG look)
        const shaftCount = 5;
        const shaftRotation = torpNow * 0.001 + torp.number * 1.5;
        ctx.lineWidth = 1;
        for (let i = 0; i < shaftCount; i++) {
          const angle = shaftRotation + (i / shaftCount) * TWO_PI;
          const length = (8 + Math.sin(phase + i) * 3) * pulse;
          const ex = sx + Math.cos(angle) * length;
          const ey = sy + Math.sin(angle) * length;
          const grad = ctx.createLinearGradient(sx, sy, ex, ey);
          grad.addColorStop(0, `rgba(${brightR},${brightG},${brightB},0.6)`);
          grad.addColorStop(1, `rgba(${brightR},${brightG},${brightB},0)`);
          ctx.strokeStyle = grad;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }

        // Layer 3: Outer halo — radial gradient, transparent center to team-tinted edge
        const haloRadius = 6 * pulse;
        const haloGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, haloRadius);
        haloGrad.addColorStop(0, `rgba(${baseR},${baseG},${baseB},0)`);
        haloGrad.addColorStop(0.4, `rgba(${baseR},${baseG},${baseB},0.15)`);
        haloGrad.addColorStop(1, `rgba(${baseR},${baseG},${baseB},0.3)`);
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(sx, sy, haloRadius, 0, TWO_PI);
        ctx.fill();

        // Layer 4: Bright core — near-white hot center with glow
        ctx.shadowBlur = 6;
        ctx.shadowColor = `rgb(${baseR},${baseG},${baseB})`;
        ctx.fillStyle = isOwn ? '#fff8e0' : `rgb(${brightR},${brightG},${brightB})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, TWO_PI);
        ctx.fill();
        ctx.shadowBlur = 0;

      } else if (torp.status === TEXPLODE) {
        const sx = (torp.x - cx + TAC_RANGE / 2) * scale;
        const sy = (torp.y - cy + TAC_RANGE / 2) * scale;
        if (sx < -20 || sx > size + 20 || sy < -20 || sy > size + 20) continue;

        const owner = torp.owner >= 0 && torp.owner < MAXPLAYER ? s.players[torp.owner] : null;
        const isOwn = owner !== null && owner.number === s.myNumber;
        const teamColor = TEAM_COLORS[owner?.team ?? IND] ?? '#888';
        const r = isOwn ? 255 : parseInt(teamColor.slice(1, 3), 16);
        const g = isOwn ? 170 : parseInt(teamColor.slice(3, 5), 16);
        const b = isOwn ? 60  : parseInt(teamColor.slice(5, 7), 16);

        // Layer 1: Glow sphere — radial gradient burst
        const glowGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 10);
        glowGrad.addColorStop(0, `rgba(${Math.min(255, r + 100)},${Math.min(255, g + 100)},${Math.min(255, b + 100)},0.9)`);
        glowGrad.addColorStop(0.5, `rgba(${r},${g},${b},0.4)`);
        glowGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(sx, sy, 10, 0, TWO_PI);
        ctx.fill();

        // Layer 2: Flash core — bright white center
        ctx.shadowBlur = 12;
        ctx.shadowColor = `rgb(${r},${g},${b})`;
        ctx.fillStyle = '#ffffffee';
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, TWO_PI);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Draw plasmas
    for (const plasma of s.plasmas) {
      if (plasma.status === PTMOVE) {
        const sx = (plasma.x - cx + TAC_RANGE / 2) * scale;
        const sy = (plasma.y - cy + TAC_RANGE / 2) * scale;
        if (sx < -10 || sx > size + 10 || sy < -10 || sy > size + 10) continue;
        ctx.fillStyle = '#ff00ff';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ff00ff';
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, TWO_PI);
        ctx.fill();
      } else if (plasma.status === PTEXPLODE) {
        const sx = (plasma.x - cx + TAC_RANGE / 2) * scale;
        const sy = (plasma.y - cy + TAC_RANGE / 2) * scale;
        ctx.fillStyle = '#ff44ff';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ff44ff';
        ctx.beginPath();
        ctx.arc(sx, sy, 8, 0, TWO_PI);
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;

    // Draw phasers — Star Trek style layered beam with fade-out
    const PHASER_DISPLAY_MS = 500;
    const now = Date.now();
    for (const phaser of s.phasers) {
      if (!phaser.fuseStart || now - phaser.fuseStart > PHASER_DISPLAY_MS) continue;

      if (phaser.number < 0 || phaser.number >= MAXPLAYER) continue;
      const owner = s.players[phaser.number];
      if (!owner || owner.status !== PALIVE) continue;

      const sx1 = (owner.x - cx + TAC_RANGE / 2) * scale;
      const sy1 = (owner.y - cy + TAC_RANGE / 2) * scale;
      let sx2: number, sy2: number;

      if (phaser.status === PHHIT) {
        const target = phaser.target >= 0 && phaser.target < MAXPLAYER ? s.players[phaser.target] : null;
        if (!target) continue;
        sx2 = (target.x - cx + TAC_RANGE / 2) * scale;
        sy2 = (target.y - cy + TAC_RANGE / 2) * scale;
      } else if (phaser.status === PHHIT2) {
        sx2 = (phaser.x - cx + TAC_RANGE / 2) * scale;
        sy2 = (phaser.y - cy + TAC_RANGE / 2) * scale;
      } else {
        const angle = (phaser.dir / 256) * TWO_PI - Math.PI / 2;
        const phaserRange = 6000 * scale;
        sx2 = sx1 + Math.cos(angle) * phaserRange;
        sy2 = sy1 + Math.sin(angle) * phaserRange;
      }

      // Fade: bright flash then decay
      const elapsed = now - phaser.fuseStart;
      const t = elapsed / PHASER_DISPLAY_MS;
      // Quick flash in first 10%, then smooth decay
      const intensity = t < 0.1 ? 1.0 : 1.0 - (t - 0.1) / 0.9;
      const alpha = intensity * intensity; // quadratic falloff

      const isOwn = phaser.number === s.myNumber;
      // TNG-style orange/amber for own, team color for others
      const baseR = isOwn ? 255 : 255;
      const baseG = isOwn ? 160 : 100;
      const baseB = isOwn ? 40 : 40;
      const teamColor = TEAM_COLORS[owner.team] ?? '#888';

      ctx.save();
      ctx.lineCap = 'round';

      // Layer 1: wide outer glow
      ctx.strokeStyle = isOwn
        ? `rgba(${baseR}, ${baseG}, ${baseB}, ${alpha * 0.15})`
        : teamColor.replace(')', `, ${alpha * 0.15})`).replace('rgb(', 'rgba(').replace('#', '');
      // Use team color for outer glow on enemy phasers
      if (!isOwn) {
        ctx.strokeStyle = `rgba(${baseR}, ${baseG}, ${baseB}, ${alpha * 0.12})`;
      }
      ctx.strokeStyle = `rgba(${baseR}, ${baseG}, ${baseB}, ${alpha * 0.15})`;
      ctx.shadowBlur = 30 * intensity;
      ctx.shadowColor = `rgba(${baseR}, ${baseG}, ${baseB}, ${alpha * 0.5})`;
      ctx.lineWidth = 12 * intensity;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();

      // Layer 2: mid beam
      ctx.strokeStyle = `rgba(${baseR}, ${baseG}, ${baseB}, ${alpha * 0.5})`;
      ctx.shadowBlur = 15 * intensity;
      ctx.shadowColor = `rgba(${baseR}, ${Math.min(baseG + 60, 255)}, ${baseB}, ${alpha})`;
      ctx.lineWidth = 5 * intensity;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();

      // Layer 3: bright core
      const coreR = Math.min(baseR + 80, 255);
      const coreG = Math.min(baseG + 120, 255);
      const coreB = Math.min(baseB + 100, 255);
      ctx.strokeStyle = `rgba(${coreR}, ${coreG}, ${coreB}, ${alpha * 0.9})`;
      ctx.shadowBlur = 6 * intensity;
      ctx.shadowColor = `rgba(255, 255, 200, ${alpha})`;
      ctx.lineWidth = 2 * intensity;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();

      ctx.restore();
    }

    // --- #4 Tractor/pressor beams ---
    for (const player of s.players) {
      if (player.status !== PALIVE) continue;
      if (!(player.flags & (PFTRACT | PFPRESS))) continue;
      const target = player.tractTarget;
      if (target < 0 || target >= MAXPLAYER) continue;
      const tp = s.players[target];
      if (tp.status !== PALIVE) continue;

      const sx1 = (player.x - cx + TAC_RANGE / 2) * scale;
      const sy1 = (player.y - cy + TAC_RANGE / 2) * scale;
      const sx2 = (tp.x - cx + TAC_RANGE / 2) * scale;
      const sy2 = (tp.y - cy + TAC_RANGE / 2) * scale;

      const isPressor = !!(player.flags & PFPRESS);
      const beamColor = isPressor ? 'rgba(255, 0, 0,' : 'rgba(0, 255, 0,';

      ctx.save();
      ctx.lineCap = 'round';

      // Layer 1: wide glow
      ctx.strokeStyle = `${beamColor} 0.08)`;
      ctx.shadowBlur = 8;
      ctx.shadowColor = `${beamColor} 0.3)`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();

      // Layer 2: core
      ctx.strokeStyle = `${beamColor} 0.4)`;
      ctx.shadowBlur = 4;
      ctx.shadowColor = `${beamColor} 0.6)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();

      // Layer 3: dashed bright center
      ctx.strokeStyle = `${beamColor} 0.7)`;
      ctx.shadowBlur = 2;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.restore();
    }

    // Trajectory line (behind ships, on top of projectiles) — only when alive
    if (me.status === PALIVE) {
      this.renderTrajectoryLine(ctx, size, me);
    } else {
      this.trajectoryInited = false;
    }

    // Draw ships
    ctx.textAlign = 'center';
    for (const player of s.players) {
      if (player.status !== PALIVE && player.status !== PEXPLODE) continue;
      if (player.flags & PFCLOAK && player.number !== s.myNumber) continue;

      const sx = (player.x - cx + TAC_RANGE / 2) * scale;
      const sy = (player.y - cy + TAC_RANGE / 2) * scale;
      if (sx < -20 || sx > size + 20 || sy < -20 || sy > size + 20) continue;

      if (player.status === PEXPLODE) {
        this.drawExplosion(ctx, sx, sy, player.explodeStart);
        continue;
      }

      this.drawTacShip(ctx, player, sx, sy);
    }
    ctx.textAlign = 'left';

    // Draw warning text
    if (s.warningText && Date.now() - s.warningTime < 3000) {
      ctx.fillStyle = '#ff0000';
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#ff0000';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(s.warningText, size / 2, 20);
      ctx.textAlign = 'left';
      ctx.font = '11px monospace';
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  private drawTacShip(ctx: CanvasRenderingContext2D, player: Player, sx: number, sy: number) {
    const isMe = player.number === this.state.myNumber;
    const color = isMe ? '#fff' : (TEAM_COLORS[player.team] ?? '#888');
    const now = Date.now();
    const stats = SHIP_STATS[player.shipType];
    const maxShield = stats?.shields ?? 100;
    const maxHull = stats?.hull ?? 100;
    const maxFuel = stats?.fuel ?? 10000;

    // --- #3 Cloak shimmer (replaces simple globalAlpha=0.3) ---
    if (player.flags & PFCLOAK) {
      // Time-bucketed alpha jitter (changes every ~150ms)
      const bucket = Math.floor(now / 150);
      const hash = ((bucket * 2654435761) >>> 0) / 4294967296;
      ctx.globalAlpha = 0.15 + hash * 0.25;

      // ~20% chance of green static noise
      if (Math.random() < 0.2) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 255, 0, 0.15)';
        for (let i = 0; i < 8; i++) {
          const nx = sx + (Math.random() - 0.5) * 28;
          const ny = sy + (Math.random() - 0.5) * 28;
          ctx.fillRect(nx, ny, 1 + Math.random() * 2, 1);
        }
        ctx.restore();
      }
    }

    // --- #6 Fuel gauge ring (own ship only, before shield) ---
    if (isMe) {
      const fuelRatio = player.fuel / maxFuel;
      const sweep = fuelRatio * TWO_PI;
      const fuelColor = fuelRatio > 0.5 ? '#00ff00' : fuelRatio > 0.25 ? '#ffff00' : '#ff0000';
      ctx.save();
      ctx.globalAlpha = (player.flags & PFCLOAK) ? ctx.globalAlpha * 0.6 : 0.6;
      ctx.strokeStyle = fuelColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      // Start from top (-PI/2), sweep clockwise
      ctx.arc(sx, sy, 17, -Math.PI / 2, -Math.PI / 2 + sweep);
      ctx.stroke();
      ctx.restore();
      // Restore cloak alpha if needed
      if (player.flags & PFCLOAK) {
        const bucket = Math.floor(now / 150);
        const hash = ((bucket * 2654435761) >>> 0) / 4294967296;
        ctx.globalAlpha = 0.15 + hash * 0.25;
      }
    }

    // --- #1 Shield bubble (replaces 1px stroke circle) ---
    if (player.flags & PFSHIELD) {
      const shieldRatio = player.shield / maxShield;
      const pulseRadius = 14 + Math.sin(now * 0.004) * 0.5;

      // Detect shield hit for flicker
      if (player.shield < player.lastShield) {
        this.shieldHitTime[player.number] = now;
      }
      const hitAge = now - this.shieldHitTime[player.number];
      const flickering = hitAge < 200;
      const flickerAlpha = flickering ? (0.3 + Math.random() * 0.4) : 1.0;

      // Energy field dome — bright at edge, transparent center
      const cloakAlpha = player.flags & PFCLOAK ? ctx.globalAlpha : 1;
      const rgb = color === '#fff' ? '160,200,255' : '80,160,255';
      ctx.save();
      ctx.globalAlpha = cloakAlpha * flickerAlpha * shieldRatio;
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, pulseRadius);
      grad.addColorStop(0, `rgba(${rgb}, 0)`);
      grad.addColorStop(0.5, `rgba(${rgb}, 0)`);
      grad.addColorStop(0.8, `rgba(${rgb}, 0.08)`);
      grad.addColorStop(0.95, `rgba(${rgb}, 0.25)`);
      grad.addColorStop(1, `rgba(${rgb}, 0.4)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, pulseRadius, 0, TWO_PI);
      ctx.fill();

      // Bright edge ring
      ctx.globalAlpha = cloakAlpha * flickerAlpha * (0.4 + shieldRatio * 0.6);
      ctx.strokeStyle = `rgba(${rgb}, 0.9)`;
      ctx.shadowBlur = 8;
      ctx.shadowColor = `rgba(${rgb}, 0.6)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(sx, sy, pulseRadius, 0, TWO_PI);
      ctx.stroke();
      ctx.restore();

      // Restore cloak alpha
      if (player.flags & PFCLOAK) {
        const bucket = Math.floor(now / 150);
        const hash = ((bucket * 2654435761) >>> 0) / 4294967296;
        ctx.globalAlpha = 0.15 + hash * 0.25;
      }
    }

    // Engine exhaust trail — scales with speed
    if (player.speed > 0) {
      const maxSpeed = stats?.speed ?? 12;
      const t = player.speed / maxSpeed;
      const rad = (player.dir / 256) * TWO_PI - Math.PI / 2;
      const exDx = -Math.cos(rad);
      const exDy = -Math.sin(rad);
      const trailLen = 8 + 20 * t;
      const particles = 3 + Math.floor(4 * t);

      // Engine light pool — colored glow cast on space behind ship
      const poolDist = 10 + 8 * t;
      const poolX = sx + exDx * poolDist;
      const poolY = sy + exDy * poolDist;
      const poolRadius = 8 + 12 * t;
      ctx.save();
      const poolGrad = ctx.createRadialGradient(poolX, poolY, 0, poolX, poolY, poolRadius);
      poolGrad.addColorStop(0, `rgba(255, 140, 0, ${0.08 * t})`);
      poolGrad.addColorStop(1, 'rgba(255, 140, 0, 0)');
      ctx.fillStyle = poolGrad;
      ctx.beginPath();
      ctx.arc(poolX, poolY, poolRadius, 0, TWO_PI);
      ctx.fill();
      ctx.restore();

      ctx.save();
      for (let i = 0; i < particles; i++) {
        const frac = (i + 1) / particles;
        const dist = 6 + frac * trailLen;
        const spread = (Math.random() - 0.5) * 4 * frac;
        const px = sx + exDx * dist + exDy * spread;
        const py = sy + exDy * dist - exDx * spread;
        const alpha = (1 - frac) * 0.7 * t;
        const sz = (1 - frac * 0.6) * (1.5 + t);

        ctx.fillStyle = `rgba(255, ${150 + Math.floor(105 * (1 - frac))}, 0, ${alpha})`;
        ctx.shadowBlur = 4 + 6 * t * (1 - frac);
        ctx.shadowColor = `rgba(255, ${100 + Math.floor(100 * (1 - frac))}, 0, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, sz, 0, TWO_PI);
        ctx.fill();
      }
      ctx.restore();
    }

    // --- #2 Damage sparks ---
    const damageRatio = player.hull / maxHull; // hull = damage taken
    if (damageRatio > 0.25) {
      const sparkCount = Math.min(5, Math.ceil(damageRatio * 5));
      ctx.save();
      for (let i = 0; i < sparkCount; i++) {
        if (Math.random() < 0.4) continue; // 40% random culling for flicker
        const angle = Math.random() * TWO_PI;
        const dist = 4 + Math.random() * 10;
        const spx = sx + Math.cos(angle) * dist;
        const spy = sy + Math.sin(angle) * dist;
        const sparkColors = ['#ffffff', '#ffff00', '#ff8800'];
        ctx.fillStyle = sparkColors[Math.floor(Math.random() * sparkColors.length)];
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#ffff00';
        ctx.fillRect(spx, spy, 1 + Math.random(), 1);
      }
      ctx.restore();
    }

    // --- #5 Ship banking (3D foreshortening) ---
    // Compute bank angle from direction delta
    let dirDelta = player.dir - player.prevDir;
    if (dirDelta > 128) dirDelta -= 256;
    if (dirDelta < -128) dirDelta += 256;
    // Max 25 degrees bank for visible foreshortening
    const targetBankDeg = Math.max(-25, Math.min(25, dirDelta * 2.5));
    this.bankAngles[player.number] += (targetBankDeg - this.bankAngles[player.number]) * 0.15;
    const bankDeg = this.bankAngles[player.number];
    const bankRad = (bankDeg * Math.PI) / 180;
    // Perpendicular scale: cos(bankAngle) squishes the ship across its width
    const perpScale = Math.cos(bankRad); // 1.0 = level, ~0.91 at max bank

    // #7 Weapon temperature glow — drawn before ship SVG
    const maxTemp = Math.max(player.wTemp, player.eTemp);
    const tempRatio = maxTemp / 1200;
    if (tempRatio > 0.15) {
      ctx.save();
      const intensity = (tempRatio - 0.15) / 0.85; // 0..1
      const r = 255;
      const g = Math.floor(160 * (1 - intensity * 0.6));
      const b = 0;
      ctx.globalAlpha = 0.1 + intensity * 0.3;
      ctx.shadowBlur = 8 + intensity * 12;
      ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.8)`;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.1 + intensity * 0.3})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }

    // Ship body — 3D banking via perpendicular scale transform
    const headingRad = (player.dir / 256) * TWO_PI - Math.PI / 2;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(headingRad);       // align to heading axis
    ctx.scale(1, perpScale);      // squish perpendicular to heading
    ctx.rotate(-headingRad);      // rotate back
    ctx.translate(-sx, -sy);
    drawShipSVG(ctx, player.team, player.shipType, player.dir, sx, sy, 11, color);
    ctx.restore();

    // Label: team letter + player number (existing)
    ctx.shadowBlur = 4;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    const teamLetter = TEAM_LETTERS[player.team] ?? '?';
    ctx.fillText(`${teamLetter}${player.number}`, sx, sy + 24);

    // --- #9 Kill count pips ---
    if (player.kills >= 1.0) {
      const wholeKills = Math.floor(player.kills);
      ctx.save();
      ctx.font = '8px monospace';
      ctx.fillStyle = '#ffcc00';
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#ffcc00';
      let killText: string;
      if (wholeKills <= 5) {
        killText = '\u2605'.repeat(wholeKills);
      } else {
        killText = `\u2605${wholeKills}`;
      }
      ctx.fillText(killText, sx, sy + 44);
      ctx.restore();
      ctx.font = '11px monospace';
    }

    // Ship type (existing)
    ctx.fillStyle = '#888';
    ctx.shadowColor = '#888';
    ctx.shadowBlur = 4;
    ctx.fillText(SHIP_SHORT[player.shipType] ?? '??', sx, sy + 34);
    ctx.shadowBlur = 0;

    // --- #8 Army count badge ---
    if (player.armies > 0) {
      const badgeX = sx + 10;
      const badgeY = sy - 10;
      const badgeColor = TEAM_COLORS[player.team] ?? '#888';
      ctx.save();
      ctx.fillStyle = badgeColor;
      ctx.shadowBlur = 3;
      ctx.shadowColor = badgeColor;
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, 5, 0, TWO_PI);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#000';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${player.armies}`, badgeX, badgeY);
      ctx.textBaseline = 'alphabetic';
      ctx.font = '11px monospace';
      ctx.restore();
    }

    // Update tracking for next frame
    player.lastShield = player.shield;
    player.prevDir = player.dir;

    // Restore alpha
    if (player.flags & PFCLOAK) {
      ctx.globalAlpha = 1;
    }
  }

  private drawTacPlanet(ctx: CanvasRenderingContext2D, planet: Planet, sx: number, sy: number) {
    const color = TEAM_COLORS[planet.owner] ?? '#888';
    const radius = 12;

    // Atmosphere halo — soft glow ring around planet
    ctx.save();
    const haloRadius = radius + 8;
    const haloGrad = ctx.createRadialGradient(sx, sy, radius - 2, sx, sy, haloRadius);
    // Parse hex color to RGB for proper rgba() stops
    const hc = color;
    const hr = parseInt(hc.slice(1, 3), 16);
    const hg = parseInt(hc.slice(3, 5), 16);
    const hb = parseInt(hc.slice(5, 7), 16);
    haloGrad.addColorStop(0, `rgba(${hr}, ${hg}, ${hb}, 0.15)`);
    haloGrad.addColorStop(0.5, `rgba(${hr}, ${hg}, ${hb}, 0.06)`);
    haloGrad.addColorStop(1, `rgba(${hr}, ${hg}, ${hb}, 0)`);
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(sx, sy, haloRadius, 0, TWO_PI);
    ctx.fill();
    ctx.restore();

    // Planet circle with CRT glow
    ctx.shadowBlur = 4;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, TWO_PI);
    ctx.stroke();

    // Fill slightly
    ctx.shadowBlur = 0;
    ctx.fillStyle = TEAM_COLORS_ALPHA[planet.owner] ?? '#88888833';
    ctx.fill();

    // Home planet indicator
    if (planet.flags & PLHOME) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#fff';
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#fff';
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 3, 0, TWO_PI);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Resource indicators
    let indicators = '';
    if (planet.flags & PLREPAIR) indicators += 'R';
    if (planet.flags & PLFUEL) indicators += 'F';
    if (planet.flags & PLAGRI) indicators += 'A';

    // Planet name
    ctx.shadowBlur = 4;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.fillText(planet.name.substring(0, 3), sx, sy + radius + 12);

    // Army count
    if (planet.armies > 0) {
      ctx.fillText(`${planet.armies}`, sx, sy + 4);
    }

    // Resource indicators
    if (indicators) {
      ctx.fillStyle = '#666';
      ctx.shadowColor = '#666';
      ctx.fillText(indicators, sx, sy + radius + 22);
    }
    ctx.shadowBlur = 0;
  }

  private drawExplosion(ctx: CanvasRenderingContext2D, sx: number, sy: number, startTime: number) {
    if (!startTime) return;
    const EXPLOSION_DURATION = 500;
    const elapsed = Date.now() - startTime;
    const t = Math.min(1, Math.max(0, elapsed / EXPLOSION_DURATION));
    const radius = 10 + t * 20;
    const alpha = 1 - t;

    ctx.shadowBlur = 12;
    ctx.shadowColor = `rgba(255, 128, 0, ${alpha})`;
    ctx.fillStyle = `rgba(255, ${Math.floor(128 * (1 - t))}, 0, ${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, TWO_PI);
    ctx.fill();

    if (t < 0.7) {
      ctx.strokeStyle = `rgba(255, 255, 0, ${0.5 * (1 - t / 0.7)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 5, 0, TWO_PI);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  // ============================================================
  // Galactic View
  // ============================================================

  private renderGalactic() {
    const ctx = this.galCtx;
    const s = this.state;
    const size = this.canvasSize;
    const scale = size / GWIDTH;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = '10px monospace';

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);

    // Grid - quadrant borders with subtle glow
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 2;
    ctx.shadowColor = '#222';
    ctx.beginPath();
    ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Team labels in corners
    ctx.font = '12px monospace';
    ctx.shadowBlur = 4;

    ctx.fillStyle = TEAM_COLORS[ROM]; ctx.shadowColor = TEAM_COLORS[ROM];
    ctx.fillText('ROM', 8, 16);
    ctx.fillStyle = TEAM_COLORS[KLI]; ctx.shadowColor = TEAM_COLORS[KLI];
    ctx.fillText('KLI', size - 36, 16);
    ctx.fillStyle = TEAM_COLORS[FED]; ctx.shadowColor = TEAM_COLORS[FED];
    ctx.fillText('FED', 8, size - 8);
    ctx.fillStyle = TEAM_COLORS[ORI]; ctx.shadowColor = TEAM_COLORS[ORI];
    ctx.fillText('ORI', size - 36, size - 8);
    ctx.shadowBlur = 0;
    ctx.font = '10px monospace';

    // Draw planets
    ctx.textAlign = 'center';
    for (const planet of s.planets) {
      if (!planet.name) continue;
      const sx = planet.x * scale;
      const sy = planet.y * scale;
      const color = TEAM_COLORS[planet.owner] ?? '#888';

      ctx.fillStyle = color;
      ctx.shadowBlur = 4;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, TWO_PI);
      ctx.fill();

      ctx.fillText(planet.name.substring(0, 3), sx, sy + 12);
      ctx.shadowBlur = 0;
    }

    // Draw players
    for (const player of s.players) {
      if (player.status !== PALIVE) continue;
      if (player.flags & PFCLOAK && player.number !== s.myNumber) continue;

      const sx = player.x * scale;
      const sy = player.y * scale;
      const color = player.number === s.myNumber ? '#fff' : (TEAM_COLORS[player.team] ?? '#888');
      const teamLetter = TEAM_LETTERS[player.team] ?? '?';

      ctx.fillStyle = color;
      ctx.shadowBlur = 4;
      ctx.shadowColor = color;
      ctx.fillText(`${teamLetter}${player.number}`, sx, sy + 4);
      ctx.shadowBlur = 0;
    }
    ctx.textAlign = 'left';

    // Draw my tactical range box
    if (s.myNumber >= 0 && s.players[s.myNumber].status === PALIVE) {
      const me = s.players[s.myNumber];
      const halfRange = (TAC_RANGE / 2) * scale;
      const mx = me.x * scale;
      const my = me.y * scale;

      ctx.strokeStyle = '#444';
      ctx.shadowBlur = 2;
      ctx.shadowColor = '#444';
      ctx.strokeRect(mx - halfRange, my - halfRange, halfRange * 2, halfRange * 2);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  // ============================================================
  // Outfit Selection Screen
  // ============================================================

  renderOutfit(ctx: CanvasRenderingContext2D, size: number, selectedTeam: number) {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);

    // Title with CRT glow
    ctx.fillStyle = '#0f0';
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#0f0';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT TEAM & SHIP', size / 2, 30);
    ctx.shadowBlur = 0;

    const mask = this.state.teamMask;
    const teams = [
      { flag: FED, name: 'Federation', key: 'f', color: TEAM_COLORS[FED] },
      { flag: ROM, name: 'Romulan',    key: 'r', color: TEAM_COLORS[ROM] },
      { flag: KLI, name: 'Klingon',    key: 'k', color: TEAM_COLORS[KLI] },
      { flag: ORI, name: 'Orion',      key: 'o', color: TEAM_COLORS[ORI] },
    ];

    const gap = 12;
    const teamPad = 10;
    const boxW = Math.min(100, Math.floor((size - teamPad * 2 - (teams.length - 1) * gap) / teams.length));
    const boxH = 60;
    const totalW = teams.length * boxW + (teams.length - 1) * gap;
    const startX = (size - totalW) / 2;
    const teamY = 55;

    // Draw team boxes
    for (let i = 0; i < teams.length; i++) {
      const t = teams[i];
      const x = startX + i * (boxW + gap);
      const available = !!(mask & t.flag);
      const selected = selectedTeam === t.flag;

      if (selected) {
        ctx.fillStyle = t.color + '44';
        ctx.fillRect(x, teamY, boxW, boxH);
      }

      ctx.strokeStyle = available ? t.color : '#333';
      ctx.shadowBlur = selected ? 6 : 0;
      ctx.shadowColor = t.color;
      ctx.lineWidth = selected ? 3 : 1;
      ctx.strokeRect(x, teamY, boxW, boxH);
      ctx.shadowBlur = 0;

      ctx.fillStyle = available ? t.color : '#444';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(t.name, x + boxW / 2, teamY + 25);

      ctx.font = '11px monospace';
      ctx.fillStyle = available ? '#aaa' : '#333';
      ctx.fillText(`[${t.key}]`, x + boxW / 2, teamY + 45);
    }

    // Ship selection
    if (selectedTeam) {
      const ships = [
        { type: SCOUT,      name: 'Scout',      short: 'SC', key: 's', stats: SHIP_STATS[SCOUT] },
        { type: DESTROYER,  name: 'Destroyer',   short: 'DD', key: 'd', stats: SHIP_STATS[DESTROYER] },
        { type: CRUISER,    name: 'Cruiser',     short: 'CA', key: 'c', stats: SHIP_STATS[CRUISER] },
        { type: BATTLESHIP, name: 'Battleship',  short: 'BB', key: 'b', stats: SHIP_STATS[BATTLESHIP] },
        { type: ASSAULT,    name: 'Assault',     short: 'AS', key: 'a', stats: SHIP_STATS[ASSAULT] },
        { type: SGALAXY,    name: 'Galaxy',      short: 'GA', key: 'g', stats: SHIP_STATS[SGALAXY] },
      ];

      ctx.fillStyle = '#888';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Choose a ship:', size / 2, teamY + boxH + 30);

      const shipGap = 6;
      const shipPad = 10;
      const shipW = Math.min(72, Math.floor((size - shipPad * 2 - (ships.length - 1) * shipGap) / ships.length));
      const shipH = 120;
      const totalShipW = ships.length * shipW + (ships.length - 1) * shipGap;
      const shipStartX = (size - totalShipW) / 2;
      const shipY = teamY + boxH + 45;

      const teamColor = TEAM_COLORS[selectedTeam];

      for (let i = 0; i < ships.length; i++) {
        const s = ships[i];
        const x = shipStartX + i * (shipW + shipGap);

        ctx.fillStyle = '#111';
        ctx.fillRect(x, shipY, shipW, shipH);
        ctx.strokeStyle = teamColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, shipY, shipW, shipH);

        // Ship icon — use vector ship instead of triangle
        const cx = x + shipW / 2;
        const cy = shipY + 25;
        drawShipSVG(ctx, selectedTeam, s.type, 0, cx, cy, 14, teamColor);

        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = teamColor;
        ctx.textAlign = 'center';
        ctx.fillText(s.name, cx, shipY + 50);

        ctx.font = '9px monospace';
        ctx.fillStyle = '#888';
        if (s.stats) {
          ctx.fillText(`Spd:${s.stats.speed}`, cx, shipY + 65);
          ctx.fillText(`Sh:${s.stats.shields}`, cx, shipY + 77);
          ctx.fillText(`Hu:${s.stats.hull}`, cx, shipY + 89);
          ctx.fillText(`Arm:${s.stats.maxArmies}`, cx, shipY + 101);
        }

        ctx.font = '11px monospace';
        ctx.fillStyle = '#aaa';
        ctx.fillText(`[${s.key}]`, cx, shipY + shipH - 4);
      }
    } else {
      ctx.fillStyle = '#666';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Select a team to see available ships', size / 2, teamY + boxH + 30);
    }

    // Player rank and info
    const me = this.state.players[this.state.myNumber];
    if (me) {
      const rankName = RANK_NAMES[me.rank] ?? `Rank ${me.rank}`;
      ctx.fillStyle = '#888';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Rank: ${rankName}`, 10, size - 14);
      ctx.textAlign = 'right';
      ctx.fillText(`Teams: 0x${mask.toString(16)}`, size - 10, size - 14);
    }

    // Queue position
    if (this.state.queuePos >= 0) {
      ctx.fillStyle = '#ff0';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Queue position: ${this.state.queuePos}`, size / 2, size - 30);
    }

    // Warning text (server messages like rank requirements)
    if (this.state.warningText && (Date.now() - this.state.warningTime) < 5000) {
      ctx.fillStyle = '#ff0';
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#ff0';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.state.warningText, size / 2, size - 48);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  // ============================================================
  // MOTD / Login Screen
  // ============================================================

  private renderMOTD(ctx: CanvasRenderingContext2D, size: number) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#0f0';
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#0f0';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NEONETREK', size / 2, 40);
    ctx.shadowBlur = 0;

    ctx.font = '11px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('A modern Netrek client', size / 2, 58);
    ctx.textAlign = 'left';

    ctx.font = '11px monospace';
    ctx.fillStyle = '#0a0';
    const startLine = Math.max(0, this.state.motdLines.length - 25);
    for (let i = startLine; i < this.state.motdLines.length; i++) {
      const y = 80 + (i - startLine) * 14;
      if (y > size - 80) break;
      ctx.fillText(this.state.motdLines[i], 10, y);
    }

    // Skip bottom prompts when the HTML login form is overlaid
    if (!this.loginFormVisible) {
      ctx.textAlign = 'center';
      ctx.font = '14px monospace';
      if (this.state.warningText) {
        ctx.fillStyle = '#ff0';
        ctx.fillText(this.state.warningText, size / 2, size - 50);
      }

      if (!this.state.connected) {
        ctx.font = '12px monospace';
        ctx.fillStyle = '#f00';
        ctx.fillText('Connecting...', size / 2, size - 20);
      }
      ctx.textAlign = 'left';
    }
  }

  // ============================================================
  // Help Overlay
  // ============================================================

  private renderHelp(ctx: CanvasRenderingContext2D, size: number) {
    ctx.save();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.fillRect(0, 0, size, size);

    ctx.textAlign = 'center';

    ctx.fillStyle = '#0f0';
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#0f0';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('KEYBOARD COMMANDS', size / 2, 32);
    ctx.shadowBlur = 0;

    ctx.font = '10px monospace';
    ctx.fillStyle = '#666';
    ctx.fillText('Press ? to toggle  |  Press any key to dismiss', size / 2, 48);

    const col1x = size * 0.15;
    const col2x = size * 0.58;
    const lineH = 16;
    let y: number;

    ctx.textAlign = 'left';
    ctx.font = '11px monospace';

    // --- Column 1: Movement & Combat ---
    y = 72;

    ctx.fillStyle = '#0cf';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('MOVEMENT', col1x, y);
    y += lineH + 2;
    ctx.font = '11px monospace';

    const movementKeys = [
      ['\u2190/\u2192', 'Turn left/right (hold)'],
      ['\u2191/\u2193', 'Speed up/down'],
      ['0-9', 'Set speed directly'],
      ['!/@/#', 'Speed 10/11/12'],
      ['Left click', 'Set course'],
    ];
    for (const [key, desc] of movementKeys) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(key, col1x, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(desc, col1x + 90, y);
      y += lineH;
    }

    y += 8;
    ctx.fillStyle = '#0cf';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('WEAPONS', col1x, y);
    y += lineH + 2;
    ctx.font = '11px monospace';

    const weaponKeys = [
      ['t / Right click', 'Fire torpedo'],
      ['p / Mid click', 'Fire phaser'],
      ['f', 'Fire plasma'],
      ['d', 'Det enemy torps'],
    ];
    for (const [key, desc] of weaponKeys) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(key, col1x, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(desc, col1x + 90, y);
      y += lineH;
    }

    y += 8;
    ctx.fillStyle = '#0cf';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('DEFENSE', col1x, y);
    y += lineH + 2;
    ctx.font = '11px monospace';

    const defenseKeys = [
      ['s', 'Toggle shields'],
      ['c', 'Toggle cloak'],
      ['R', 'Toggle repair'],
    ];
    for (const [key, desc] of defenseKeys) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(key, col1x, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(desc, col1x + 90, y);
      y += lineH;
    }

    y += 8;
    ctx.fillStyle = '#0cf';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('TRACTOR / REPRESSOR', col1x, y);
    y += lineH + 2;
    ctx.font = '11px monospace';

    const tractorKeys = [
      ['r', 'Tractor beam toggle'],
      ['y', 'Repressor toggle'],
    ];
    for (const [key, desc] of tractorKeys) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(key, col1x, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(desc, col1x + 90, y);
      y += lineH;
    }

    // --- Column 2: Actions & View ---
    y = 72;

    ctx.fillStyle = '#0cf';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('PLANET OPS', col2x, y);
    y += lineH + 2;
    ctx.font = '11px monospace';

    const planetKeys = [
      ['o', 'Toggle orbit'],
      ['b', 'Toggle bombing'],
      ['z', 'Beam up armies'],
      ['x', 'Beam down armies'],
    ];
    for (const [key, desc] of planetKeys) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(key, col2x, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(desc, col2x + 70, y);
      y += lineH;
    }

    y += 8;
    ctx.fillStyle = '#0cf';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('COMMUNICATION', col2x, y);
    y += lineH + 2;
    ctx.font = '11px monospace';

    const chatKeys = [
      [';', 'Chat to ALL'],
      ['Enter', 'Chat to TEAM'],
      ['Esc', 'Cancel chat'],
    ];
    for (const [key, desc] of chatKeys) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(key, col2x, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(desc, col2x + 70, y);
      y += lineH;
    }

    // Message color legend
    y += 4;
    ctx.font = '10px monospace';
    const colorLegend: [string, string][] = [
      ['#0f0', 'ALL chat'],
      ['#ff0', 'TEAM chat'],
      ['#0cf', 'Private msg'],
      ['#f80', 'Kills'],
      ['#f0f', 'Planet ops'],
      ['#888', 'System'],
    ];
    for (const [color, label] of colorLegend) {
      ctx.fillStyle = color;
      ctx.fillText(`■ ${label}`, col2x, y);
      y += 12;
    }
    ctx.font = '11px monospace';

    y += 8;
    ctx.fillStyle = '#0cf';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('VIEW & OTHER', col2x, y);
    y += lineH + 2;
    ctx.font = '11px monospace';

    const viewKeys = [
      ['W', 'Declare war (all)'],
      ['M', 'Toggle sound'],
      ['Shift+Q', 'Quit game'],
      ['?', 'This help screen'],
    ];
    for (const [key, desc] of viewKeys) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(key, col2x, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(desc, col2x + 70, y);
      y += lineH;
    }

    y += 8;
    ctx.fillStyle = '#0cf';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('OUTFIT SCREEN', col2x, y);
    y += lineH + 2;
    ctx.font = '11px monospace';

    const outfitKeys = [
      ['F/R/K/O', 'Select team'],
      ['S/D/C/B/A/G', 'Select ship'],
    ];
    for (const [key, desc] of outfitKeys) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(key, col2x, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(desc, col2x + 70, y);
      y += lineH;
    }

    ctx.restore();
  }
}
