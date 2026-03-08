/**
 * NeoNetrek Renderer
 *
 * Three.js WebGL tactical view + Three.js WebGL galactic view (side-by-side),
 * plus HTML status bar, player list, and message panel.
 * Overlay canvas for warning text, help, MOTD, and outfit UI.
 */

import { GameState, Message } from './state';
import {
  PALIVE, PEXPLODE, PFREE,
  PFSHIELD, PFCLOAK, PFORBIT, PFREPAIR, PFBOMB,
  PFGREEN, PFYELLOW, PFRED,
  TEAM_COLORS, TEAM_LETTERS, SHIP_SHORT, SHIP_STATS,
  RANK_NAMES,
  FED, ROM, KLI, ORI,
  SCOUT, DESTROYER, CRUISER, BATTLESHIP, ASSAULT, SGALAXY,
  MAXPLAYER,
  MINDIV, MTEAM, MALL, MGOD,
} from './constants';
import { TacticalScene } from './tactical/TacticalScene';
import { GalacticScene } from './galactic/GalacticScene';
import { AudioEngine } from './audio';

// Status bar configuration
interface BarRef {
  fill: HTMLElement;
  value: HTMLElement;
}

export class Renderer {
  private tacCanvas: HTMLCanvasElement;
  private galCanvas: HTMLCanvasElement;
  private overlayCanvas: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;
  private galOverlayCanvas: HTMLCanvasElement;
  private galOverlayCtx: CanvasRenderingContext2D;
  private galacticScene: GalacticScene;
  private state: GameState;
  private _tacWidth: number;
  private _tacHeight: number;
  private _galCanvasSize: number;
  private _showHelp = false;
  loginFormVisible = false;

  // Three.js tactical scene
  private tacticalScene: TacticalScene;
  private isTacticalMode = false;

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

  // Audio engine for engine hum
  private audio: AudioEngine | null = null;

  // Player list dirty check
  private lastPlayerHash = '';

  // Message tracking
  private lastMessageCount = 0;

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

    this._tacWidth = 300;
    this._tacHeight = 300;
    this._galCanvasSize = 300;

    // Overlay canvas (2D) sits on top of WebGL tactical canvas
    this.overlayCanvas = document.getElementById('tactical-overlay') as HTMLCanvasElement;
    this.overlayCtx = this.overlayCanvas.getContext('2d')!;

    // Galactic overlay canvas (2D) sits on top of WebGL galactic canvas
    this.galOverlayCanvas = document.getElementById('galactic-overlay') as HTMLCanvasElement;
    this.galOverlayCtx = this.galOverlayCanvas.getContext('2d')!;

    // Create Three.js tactical scene (takes over #tactical canvas for WebGL)
    this.tacticalScene = new TacticalScene(tacCanvas);

    // Create Three.js galactic scene (separate WebGL context)
    this.galacticScene = new GalacticScene(galCanvas);

    this.initStatusBar();
    this.initPlayerListHeader();
  }

  setAudio(audio: AudioEngine) {
    this.audio = audio;
  }

  get canvasSize(): number {
    return this._tacHeight; // backward compat: square-equivalent (height)
  }

  get canvasWidth(): number {
    return this._tacWidth;
  }

  get canvasHeight(): number {
    return this._tacHeight;
  }

  /** Called on window resize to update canvas dimensions */
  resizeCanvases(tacWidth: number, tacHeight: number, galSize: number) {
    this._tacWidth = tacWidth;
    this._tacHeight = tacHeight;
    this._galCanvasSize = galSize;
    const dpr = window.devicePixelRatio || 1;

    // Galactic canvas: Three.js WebGL (square)
    this.galCanvas.style.width = `${galSize}px`;
    this.galCanvas.style.height = `${galSize}px`;
    this.galacticScene.resize(galSize, galSize);

    // Galactic overlay canvas: 2D for labels (matches galactic)
    this.galOverlayCanvas.width = galSize * dpr;
    this.galOverlayCanvas.height = galSize * dpr;
    this.galOverlayCanvas.style.width = `${galSize}px`;
    this.galOverlayCanvas.style.height = `${galSize}px`;
    this.galOverlayCtx = this.galOverlayCanvas.getContext('2d')!;
    this.galOverlayCtx.scale(dpr, dpr);

    // Tactical canvas: WebGL (rectangular)
    this.tacCanvas.style.width = `${tacWidth}px`;
    this.tacCanvas.style.height = `${tacHeight}px`;

    // Overlay canvas: 2D for text overlays (matches tactical)
    this.overlayCanvas.width = tacWidth * dpr;
    this.overlayCanvas.height = tacHeight * dpr;
    this.overlayCanvas.style.width = `${tacWidth}px`;
    this.overlayCanvas.style.height = `${tacHeight}px`;
    this.overlayCtx = this.overlayCanvas.getContext('2d')!;
    this.overlayCtx.scale(dpr, dpr);
    this.overlayCtx.font = '11px monospace';

    // Resize Three.js renderer
    this.tacticalScene.resize(tacWidth, tacHeight);
  }

  set helpVisible(v: boolean) {
    this._showHelp = v;
  }

  render() {
    const w = this._tacWidth;
    const h = this._tacHeight;
    const oCtx = this.overlayCtx;

    // Clear overlay canvas
    oCtx.clearRect(0, 0, w, h);

    // Show outfit screen during outfit/dead phases
    if (this.state.phase === 'outfit' || this.state.phase === 'dead') {
      this.audio?.stopEngine();
      // Clean up login scene if transitioning from login
      this.tacticalScene.cleanupLogin();
      // 3D outfit showcase — all 6 ship classes
      this.tacticalScene.renderOutfit(this.state, this.state.myTeam);

      // Outfit UI on overlay canvas
      this.renderOutfit(oCtx, w, h, this.state.myTeam);

      // Clear galactic during outfit (both 3D scene and 2D overlay labels)
      this.galacticScene.clear();
      this.galOverlayCtx.clearRect(0, 0, this._galCanvasSize, this._galCanvasSize);

      this.updateStatusBar();
      if (this._showHelp) this.renderHelp(this.galOverlayCtx, this._galCanvasSize, this._galCanvasSize);
      this.isTacticalMode = false;
      return;
    }

    // Login phase: show MOTD on overlay, cinematic 3D login scene
    if (this.state.phase === 'login' || !this.state.players[this.state.myNumber] ||
        this.state.players[this.state.myNumber]?.status === PFREE) {
      this.audio?.stopEngine();
      if (this.isTacticalMode) {
        this.tacticalScene.restoreTacticalMode();
        this.isTacticalMode = false;
      }
      this.tacticalScene.renderLogin();
      this.renderMOTD(oCtx, w, h);
      this.renderGalactic();
      this.updateStatusBar();
      this.updatePlayerList();
      this.updateMessages();
      if (this._showHelp) this.renderHelp(this.galOverlayCtx, this._galCanvasSize, this._galCanvasSize);
      return;
    }

    // Alive/observe — 3D tactical rendering
    if (!this.isTacticalMode) {
      this.tacticalScene.cleanupLogin();
      this.tacticalScene.restoreTacticalMode();
      this.isTacticalMode = true;
    }

    this.tacticalScene.render(this.state);
    this.tacticalScene.renderLabels(oCtx, w, h, this.state.planets);
    this.renderGalactic();

    // Drive engine hum from player speed
    if (this.audio) {
      const me = this.state.players[this.state.myNumber];
      if (me && me.status === PALIVE) {
        this.audio.startEngine();
        const maxSpeed = SHIP_STATS[me.shipType]?.speed ?? 12;
        this.audio.updateEngine(me.speed, maxSpeed);
      } else {
        this.audio.stopEngine();
      }
    }

    // Warning text on overlay
    const s = this.state;
    if (s.warningText && Date.now() - s.warningTime < 3000) {
      oCtx.fillStyle = '#ff0000';
      oCtx.shadowBlur = 4;
      oCtx.shadowColor = '#ff0000';
      oCtx.font = '14px monospace';
      oCtx.textAlign = 'center';
      oCtx.fillText(s.warningText, w / 2, 20);
      oCtx.textAlign = 'left';
      oCtx.font = '11px monospace';
      oCtx.shadowBlur = 0;
    }

    // Loss warning banner (prominent pulsing alert when enemy is about to win)
    if (s.lossWarning && Date.now() - s.lossWarningTime < 10000) {
      this.renderLossWarning(oCtx, w, h, s.lossWarning, s.lossWarningTime);
    }

    // Update HTML panels
    this.updateStatusBar();
    this.updatePlayerList();
    this.updateMessages();

    if (this._showHelp) this.renderHelp(this.galOverlayCtx, this._galCanvasSize, this._galCanvasSize);
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

    const sep1 = document.createElement('span');
    sep1.className = 'hud-sep';
    sep1.textContent = '|';
    this.statusBarEl.appendChild(sep1);

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

    const sep2 = document.createElement('span');
    sep2.className = 'hud-sep';
    sep2.textContent = '|';
    this.statusBarEl.appendChild(sep2);

    this.flagsEl = document.createElement('span');
    this.flagsEl.className = 'hud-flags';
    this.statusBarEl.appendChild(this.flagsEl);

    const sep3 = document.createElement('span');
    sep3.className = 'hud-sep';
    sep3.textContent = '|';
    this.statusBarEl.appendChild(sep3);

    this.lagEl = document.createElement('span');
    this.lagEl.className = 'hud-lag';
    this.statusBarEl.appendChild(this.lagEl);

    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    this.statusBarEl.appendChild(spacer);

    const helpHint = document.createElement('span');
    helpHint.style.color = '#555';
    helpHint.style.fontSize = '10px';
    helpHint.textContent = '? = help';
    this.statusBarEl.appendChild(helpHint);
  }

  private updateStatusBar() {
    const me = this.state.myNumber >= 0 ? this.state.players[this.state.myNumber] : null;
    const active = me && me.status !== PFREE && this.state.phase === 'alive';

    // Disabled appearance when not actively playing
    this.statusBarEl.style.opacity = active ? '1' : '0.35';

    if (!active) {
      this.setBar('sh', 0, 100);
      this.setBar('hu', 0, 100);
      this.setBar('fu', 0, 100);
      this.setBar('wt', 0, 100);
      this.setBar('et', 0, 100);
      this.speedEl.textContent = 'Spd:0';
      this.armiesEl.textContent = 'Arm:0';
      this.killsEl.textContent = 'K:0.00';
      this.flagsEl.textContent = '';
      this.alertEl.style.background = '#00880044';
      this.lagEl.textContent = '';
      return;
    }

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

    const flags: string[] = [];
    if (me.flags & PFSHIELD) flags.push('SH');
    if (me.flags & PFCLOAK) flags.push('CL');
    if (me.flags & PFORBIT) flags.push('OR');
    if (me.flags & PFREPAIR) flags.push('RP');
    if (me.flags & PFBOMB) flags.push('BM');
    this.flagsEl.textContent = flags.join(' ');

    let alertBg = '#00880044';
    if (me.flags & PFRED) alertBg = '#88000044';
    else if (me.flags & PFYELLOW) alertBg = '#88880044';
    this.alertEl.style.background = alertBg;

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
    const clamped = Math.max(0, value);
    const pct = Math.min(100, (clamped / max) * 100);
    bar.fill.style.width = `${pct}%`;
    bar.value.textContent = `${clamped}`;
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

    for (let i = this.lastMessageCount; i < msgs.length; i++) {
      const msg = msgs[i];
      const div = document.createElement('div');
      div.className = 'msg-line ' + this.getMessageClass(msg);
      div.textContent = msg.text;
      this.messagePanelEl.appendChild(div);
    }
    this.lastMessageCount = msgs.length;

    this.messagePanelEl.scrollTop = this.messagePanelEl.scrollHeight;
  }

  private getMessageClass(msg: Message): string {
    const text = msg.text;

    if (msg.flags & MGOD) return 'msg-god';

    if (msg.from >= MAXPLAYER) {
      if (/was (killed|ghostbusted)|destroyed by|blew up/.test(text)) return 'msg-kill';
      if (/taken over|captured|bombed|coup/.test(text)) return 'msg-take';
      return 'msg-system';
    }

    if (msg.flags & MINDIV) return 'msg-individual';
    if (msg.flags & MTEAM) return 'msg-team';
    if (msg.flags & MALL) return 'msg-all';

    return 'msg-system';
  }

  // ============================================================
  // Loss Warning Banner (overlay canvas)
  // ============================================================

  private renderLossWarning(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    text: string,
    startTime: number,
  ) {
    const now = Date.now();
    const age = now - startTime;
    const fade = Math.max(0, 1 - age / 10000); // fade out over 10s
    const pulse = 0.6 + 0.4 * Math.sin(now / 200); // fast pulse

    ctx.save();

    // Semi-transparent red banner background
    const bannerH = 32;
    const bannerY = 36; // below the warning text area
    ctx.fillStyle = `rgba(180, 0, 0, ${fade * pulse * 0.5})`;
    ctx.fillRect(0, bannerY, w, bannerH);

    // Border lines
    ctx.strokeStyle = `rgba(255, 60, 0, ${fade * pulse * 0.8})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, bannerY);
    ctx.lineTo(w, bannerY);
    ctx.moveTo(0, bannerY + bannerH);
    ctx.lineTo(w, bannerY + bannerH);
    ctx.stroke();

    // Text
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 8 * pulse;
    ctx.fillStyle = `rgba(255, 255, 50, ${fade * (0.7 + 0.3 * pulse)})`;
    ctx.fillText(`\u26A0 ${text}`, w / 2, bannerY + bannerH / 2);

    ctx.restore();
  }

  // ============================================================
  // Galactic View (Three.js WebGL)
  // ============================================================

  private renderGalactic() {
    const galSize = this._galCanvasSize;
    const gCtx = this.galOverlayCtx;

    // Clear galactic overlay
    gCtx.clearRect(0, 0, galSize, galSize);

    this.galacticScene.render(this.state, this.tacticalScene.getVisibleHalfExtents());
    this.galacticScene.renderLabels(gCtx, galSize, galSize, this.state);
  }

  // ============================================================
  // Outfit Selection Screen (overlay canvas for UI, 3D for ship)
  // ============================================================

  private drawTeamLogo(
    ctx: CanvasRenderingContext2D,
    team: number,
    cx: number,
    cy: number,
    size: number,
    color: string,
    glow: boolean,
  ) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
    }
    const s = size / 2;

    if (team === FED) {
      // Delta / chevron — upward-pointing arrowhead with horizontal bar
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);            // top point
      ctx.lineTo(cx - s * 0.7, cy + s * 0.6);  // bottom-left
      ctx.lineTo(cx, cy + s * 0.15);     // inner notch
      ctx.lineTo(cx + s * 0.7, cy + s * 0.6);  // bottom-right
      ctx.closePath();
      ctx.stroke();
      // horizontal bar
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.55, cy + s * 0.25);
      ctx.lineTo(cx + s * 0.55, cy + s * 0.25);
      ctx.stroke();
    } else if (team === ROM) {
      // Raptor wings — spread bird-of-prey silhouette
      ctx.beginPath();
      // left wing
      ctx.moveTo(cx, cy - s * 0.3);
      ctx.lineTo(cx - s, cy + s * 0.1);
      ctx.lineTo(cx - s * 0.85, cy + s * 0.55);
      ctx.lineTo(cx - s * 0.3, cy + s * 0.2);
      // body diamond
      ctx.lineTo(cx, cy + s * 0.7);
      // right wing (mirror)
      ctx.lineTo(cx + s * 0.3, cy + s * 0.2);
      ctx.lineTo(cx + s * 0.85, cy + s * 0.55);
      ctx.lineTo(cx + s, cy + s * 0.1);
      ctx.lineTo(cx, cy - s * 0.3);
      ctx.closePath();
      ctx.stroke();
      // head
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.3);
      ctx.lineTo(cx, cy - s * 0.75);
      ctx.stroke();
    } else if (team === KLI) {
      // Trefoil — vertical blade with swept wings
      ctx.beginPath();
      // central blade
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx - s * 0.12, cy + s * 0.1);
      ctx.lineTo(cx + s * 0.12, cy + s * 0.1);
      ctx.closePath();
      ctx.stroke();
      // left wing
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.12, cy - s * 0.1);
      ctx.lineTo(cx - s * 0.9, cy + s * 0.7);
      ctx.lineTo(cx - s * 0.55, cy + s * 0.45);
      ctx.stroke();
      // right wing
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.12, cy - s * 0.1);
      ctx.lineTo(cx + s * 0.9, cy + s * 0.7);
      ctx.lineTo(cx + s * 0.55, cy + s * 0.45);
      ctx.stroke();
      // crossbar
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.5, cy + s * 0.3);
      ctx.lineTo(cx + s * 0.5, cy + s * 0.3);
      ctx.stroke();
    } else if (team === ORI) {
      // 8-pointed compass star
      const inner = s * 0.35;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 - Math.PI / 2;
        const r = i % 2 === 0 ? s : inner;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }

    ctx.restore();
  }

  renderOutfit(ctx: CanvasRenderingContext2D, w: number, h: number, selectedTeam: number) {
    // Title
    ctx.fillStyle = '#0f0';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT TEAM & SHIP', w / 2, 26);

    const mask = this.state.teamMask;
    const teams = [
      { flag: FED, name: 'Federation', key: 'f', color: TEAM_COLORS[FED] },
      { flag: ROM, name: 'Romulan',    key: 'r', color: TEAM_COLORS[ROM] },
      { flag: KLI, name: 'Klingon',    key: 'k', color: TEAM_COLORS[KLI] },
      { flag: ORI, name: 'Orion',      key: 'o', color: TEAM_COLORS[ORI] },
    ];

    const gap = 14;
    const teamPad = 10;
    const boxW = Math.min(110, Math.floor((w - teamPad * 2 - (teams.length - 1) * gap) / teams.length));
    const boxH = 90;
    const totalW = teams.length * boxW + (teams.length - 1) * gap;
    const startX = (w - totalW) / 2;
    const teamY = 38;

    const now = Date.now();

    for (let i = 0; i < teams.length; i++) {
      const t = teams[i];
      const x = startX + i * (boxW + gap);
      const available = !!(mask & t.flag);
      const selected = selectedTeam === t.flag;

      // Background fill
      if (selected) {
        ctx.fillStyle = t.color + '33';
        ctx.fillRect(x, teamY, boxW, boxH);
      } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.50)';
        ctx.fillRect(x, teamY, boxW, boxH);
      }

      // Border — pulsing glow for selected
      if (selected) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 300);
        ctx.save();
        ctx.shadowColor = t.color;
        ctx.shadowBlur = 6 + pulse * 10;
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, teamY, boxW, boxH);
        ctx.restore();
      } else {
        ctx.strokeStyle = available ? t.color : '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, teamY, boxW, boxH);
      }

      // Logo
      const logoCx = x + boxW / 2;
      const logoCy = teamY + 24;
      const logoColor = available ? t.color : '#444';
      this.drawTeamLogo(ctx, t.flag, logoCx, logoCy, 32, logoColor, available && selected);

      // Team name
      ctx.fillStyle = available ? t.color : '#444';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(t.name, x + boxW / 2, teamY + 56);

      // Key binding
      ctx.font = '10px monospace';
      ctx.fillStyle = available ? '#aaa' : '#333';
      ctx.fillText(`[ ${t.key} ]`, x + boxW / 2, teamY + 74);
    }

    if (selectedTeam) {
      // Ship panels — positioned around projected 3D ship model centers
      const ships = [
        { type: SCOUT,      name: 'Scout',      key: 's', stats: SHIP_STATS[SCOUT] },
        { type: DESTROYER,  name: 'Destroyer',   key: 'd', stats: SHIP_STATS[DESTROYER] },
        { type: CRUISER,    name: 'Cruiser',     key: 'c', stats: SHIP_STATS[CRUISER] },
        { type: BATTLESHIP, name: 'Battleship',  key: 'b', stats: SHIP_STATS[BATTLESHIP] },
        { type: ASSAULT,    name: 'Assault',     key: 'a', stats: SHIP_STATS[ASSAULT] },
        { type: SGALAXY,    name: 'Galaxy',      key: 'g', stats: SHIP_STATS[SGALAXY] },
      ];

      const screenPositions = this.tacticalScene.getOutfitScreenPositions(w, h);
      const teamColor = TEAM_COLORS[selectedTeam];

      // Compute panel size from actual ship screen spacing (3 cols, 2 rows)
      let panelW = Math.floor(w * 0.22);
      let panelH = Math.floor(h * 0.38);
      if (screenPositions.length >= 6) {
        const colGap = Math.abs(screenPositions[1].x - screenPositions[0].x);
        const rowGap = Math.abs(screenPositions[3].y - screenPositions[0].y);
        if (colGap > 0) panelW = Math.floor(colGap * 0.92);
        if (rowGap > 0) panelH = Math.floor(rowGap * 0.88);
      }

      // Stat bar config — labels, max values, stat keys
      const statBars: { label: string; key: keyof typeof ships[0]['stats']; max: number }[] = [
        { label: 'SPD', key: 'speed',      max: 12 },
        { label: 'SHD', key: 'shields',    max: 130 },
        { label: 'HUL', key: 'hull',       max: 200 },
        { label: 'ARM', key: 'maxArmies',  max: 20 },
      ];

      for (let i = 0; i < ships.length; i++) {
        const s = ships[i];
        const pos = screenPositions[i];
        if (!pos) continue;

        // Center panel on the projected ship position, clamped to canvas bounds
        const pad = 4;
        const px = Math.round(Math.max(pad, Math.min(w - panelW - pad, pos.x - panelW / 2)));
        const py = Math.round(Math.max(pad, Math.min(h - panelH - pad, pos.y - panelH / 2)));

        // Panel background — semi-transparent so 3D model shows through
        ctx.fillStyle = 'rgba(0, 0, 0, 0.50)';
        ctx.fillRect(px, py, panelW, panelH);
        ctx.strokeStyle = teamColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, panelW, panelH);

        const cx = px + panelW / 2;

        // Ship name at top of panel with subtle underline
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = teamColor;
        ctx.textAlign = 'center';
        ctx.fillText(s.name, cx, py + 16);
        // underline
        const nameW = ctx.measureText(s.name).width;
        ctx.strokeStyle = teamColor + '44';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - nameW / 2, py + 19);
        ctx.lineTo(cx + nameW / 2, py + 19);
        ctx.stroke();

        // Stat bars at bottom of panel
        if (s.stats) {
          const barW = Math.min(60, panelW - 50);
          const barH = 4;
          const barStartX = cx - barW / 2 + 12;
          const barsTopY = py + panelH - 56;

          for (let b = 0; b < statBars.length; b++) {
            const bar = statBars[b];
            const by = barsTopY + b * 11;
            const val = s.stats[bar.key] as number;
            const fraction = Math.min(1, val / bar.max);

            // Label
            ctx.font = '9px monospace';
            ctx.fillStyle = '#777';
            ctx.textAlign = 'right';
            ctx.fillText(bar.label, barStartX - 4, by + 4);

            // Bar background
            ctx.fillStyle = '#222';
            ctx.fillRect(barStartX, by, barW, barH);

            // Bar fill
            ctx.fillStyle = teamColor;
            ctx.fillRect(barStartX, by, Math.round(barW * fraction), barH);
          }
        }

        // Key binding at very bottom
        ctx.font = '11px monospace';
        ctx.fillStyle = '#aaa';
        ctx.textAlign = 'center';
        ctx.fillText(`[ ${s.key} ]`, cx, py + panelH - 6);
      }
    } else {
      ctx.fillStyle = '#666';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Select a team to see available ships', w / 2, teamY + boxH + 30);
    }

    // Player rank and info
    const me = this.state.players[this.state.myNumber];
    if (me) {
      const rankName = RANK_NAMES[me.rank] ?? `Rank ${me.rank}`;
      ctx.fillStyle = '#888';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Rank: ${rankName}`, 10, h - 14);
      ctx.textAlign = 'right';
      ctx.fillText(`Teams: 0x${mask.toString(16)}`, w - 10, h - 14);
    }

    // Queue position
    if (this.state.queuePos >= 0) {
      ctx.fillStyle = '#ff0';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Queue position: ${this.state.queuePos}`, w / 2, h - 30);
    }

    // Warning text
    if (this.state.warningText && (Date.now() - this.state.warningTime) < 5000) {
      ctx.fillStyle = '#ff0';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.state.warningText, w / 2, h - 48);
    }
  }

  // ============================================================
  // MOTD / Login Screen (overlay canvas)
  // ============================================================

  private renderMOTD(ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Semi-transparent gradient behind text for readability over 3D scene
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)');
    grad.addColorStop(0.85, 'rgba(0, 0, 0, 0.15)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#0f0';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NEONETREK', w / 2, 40);

    ctx.font = '11px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('A modern Netrek client', w / 2, 58);
    ctx.textAlign = 'left';

    ctx.font = '11px monospace';
    ctx.fillStyle = '#0a0';
    const startLine = Math.max(0, this.state.motdLines.length - 25);
    for (let i = startLine; i < this.state.motdLines.length; i++) {
      const y = 80 + (i - startLine) * 14;
      if (y > h - 80) break;
      ctx.fillText(this.state.motdLines[i], 10, y);
    }

    if (!this.loginFormVisible) {
      ctx.textAlign = 'center';
      ctx.font = '14px monospace';
      if (this.state.warningText) {
        ctx.fillStyle = '#ff0';
        ctx.fillText(this.state.warningText, w / 2, h - 50);
      }

      if (!this.state.connected) {
        ctx.font = '12px monospace';
        ctx.fillStyle = '#f00';
        ctx.fillText('Connecting...', w / 2, h - 20);
      }
      ctx.textAlign = 'left';
    }
  }

  // ============================================================
  // Help Overlay (overlay canvas)
  // ============================================================

  private renderHelp(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.save();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';

    ctx.fillStyle = '#0f0';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('KEYBOARD COMMANDS', w / 2, 24);

    ctx.font = '10px monospace';
    ctx.fillStyle = '#666';
    ctx.fillText('Press ? to dismiss', w / 2, 38);

    const col1x = w * 0.05;
    const col2x = w * 0.52;
    const lineH = 14;
    let y: number;

    ctx.textAlign = 'left';
    ctx.font = '10px monospace';

    // Column 1: Movement & Combat
    y = 56;
    ctx.fillStyle = '#0cf';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('MOVEMENT', col1x, y);
    y += lineH + 2;
    ctx.font = '10px monospace';

    const movementKeys = [
      ['\u2190/\u2192', 'Turn left/right (hold)'],
      ['\u2191/\u2193', 'Speed up/down (hold)'],
      ['Space', 'Max speed'],
      ['Backspace', 'Emergency stop'],
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

    y += 6;
    ctx.fillStyle = '#0cf';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('WEAPONS', col1x, y);
    y += lineH + 2;
    ctx.font = '10px monospace';

    const weaponKeys = [
      ['w / Right click', 'Fire torpedo'],
      ['e / Mid click', 'Fire phaser (e=auto-aim)'],
      ['t', 'Fire plasma'],
      ['d', 'Det enemy torps'],
    ];
    for (const [key, desc] of weaponKeys) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(key, col1x, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(desc, col1x + 90, y);
      y += lineH;
    }

    y += 6;
    ctx.fillStyle = '#0cf';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('DEFENSE', col1x, y);
    y += lineH + 2;
    ctx.font = '10px monospace';

    const defenseKeys = [
      ['s', 'Toggle shields'],
      ['f', 'Toggle cloak'],
      ['g', 'Toggle repair'],
    ];
    for (const [key, desc] of defenseKeys) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(key, col1x, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(desc, col1x + 90, y);
      y += lineH;
    }

    y += 6;
    ctx.fillStyle = '#0cf';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('TRACTOR / REPRESSOR', col1x, y);
    y += lineH + 2;
    ctx.font = '10px monospace';

    const tractorKeys = [
      ['q', 'Tractor beam (lock nearest)'],
      ['r', 'Repressor (lock nearest)'],
    ];
    for (const [key, desc] of tractorKeys) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(key, col1x, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(desc, col1x + 90, y);
      y += lineH;
    }

    // Column 2
    y = 56;
    ctx.fillStyle = '#0cf';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('PLANET OPS', col2x, y);
    y += lineH + 2;
    ctx.font = '10px monospace';

    const planetKeys = [
      ['c', 'Toggle orbit'],
      ['b', 'Toggle bombing'],
      ['z', 'Beam up armies'],
      ['x', 'Beam down armies'],
    ];
    for (const [key, desc] of planetKeys) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(key, col2x, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(desc, col2x + 80, y);
      y += lineH;
    }

    y += 6;
    ctx.fillStyle = '#0cf';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('COMMUNICATION', col2x, y);
    y += lineH + 2;
    ctx.font = '10px monospace';

    const chatKeys = [
      [';', 'Chat to ALL'],
      ['Enter', 'Chat to TEAM'],
      ['Esc', 'Cancel chat'],
    ];
    for (const [key, desc] of chatKeys) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(key, col2x, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(desc, col2x + 80, y);
      y += lineH;
    }

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

    y += 6;
    ctx.fillStyle = '#0cf';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('VIEW & OTHER', col2x, y);
    y += lineH + 2;
    ctx.font = '10px monospace';

    const viewKeys = [
      ['W', 'Declare war (all)'],
      ['M', 'Toggle sound'],
      ['Shift+Q x2', 'Quit game (disconnect)'],
      ['?', 'This help screen'],
    ];
    for (const [key, desc] of viewKeys) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(key, col2x, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(desc, col2x + 80, y);
      y += lineH;
    }

    y += 6;
    ctx.fillStyle = '#0cf';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('OUTFIT SCREEN', col2x, y);
    y += lineH + 2;
    ctx.font = '10px monospace';

    const outfitKeys = [
      ['F/R/K/O', 'Select team'],
      ['S/D/C/B/A/G', 'Select ship'],
    ];
    for (const [key, desc] of outfitKeys) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(key, col2x, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(desc, col2x + 80, y);
      y += lineH;
    }

    ctx.restore();
  }
}
