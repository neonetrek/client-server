/**
 * NeoNetrek Renderer
 *
 * Three.js WebGL tactical view + Canvas 2D galactic view (side-by-side),
 * plus HTML status bar, player list, and message panel.
 * Overlay canvas for warning text, help, MOTD, and outfit UI.
 */

import { GameState, Player, Message } from './state';
import {
  GWIDTH,
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

const TWO_PI = Math.PI * 2;

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
  private galCtx: CanvasRenderingContext2D;
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

    // Galactic canvas stays 2D
    this.galCtx = galCanvas.getContext('2d')!;

    // Label container for CSS2DRenderer
    const labelContainer = document.getElementById('tactical-labels')!;

    // Create Three.js tactical scene (takes over #tactical canvas for WebGL)
    this.tacticalScene = new TacticalScene(tacCanvas, labelContainer);

    this.initStatusBar();
    this.initPlayerListHeader();
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

    // Galactic canvas: standard 2D (square)
    this.galCanvas.width = galSize * dpr;
    this.galCanvas.height = galSize * dpr;
    this.galCanvas.style.width = `${galSize}px`;
    this.galCanvas.style.height = `${galSize}px`;
    this.galCtx = this.galCanvas.getContext('2d')!;
    this.galCtx.scale(dpr, dpr);
    this.galCtx.font = '10px monospace';

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
      // 3D outfit showcase — all 6 ship classes
      this.tacticalScene.renderOutfit(this.state, this.state.myTeam);

      // Outfit UI on overlay canvas
      this.renderOutfit(oCtx, w, h, this.state.myTeam);

      // Clear galactic during outfit
      const gCtx = this.galCtx;
      const gSize = this._galCanvasSize;
      gCtx.fillStyle = '#000';
      gCtx.fillRect(0, 0, gSize, gSize);

      if (this._showHelp) this.renderHelp(oCtx, w, h);
      this.isTacticalMode = false;
      return;
    }

    // Login phase: show MOTD on overlay, black tactical
    if (this.state.phase === 'login' || !this.state.players[this.state.myNumber] ||
        this.state.players[this.state.myNumber]?.status === PFREE) {
      if (this.isTacticalMode) {
        this.tacticalScene.restoreTacticalMode();
        this.isTacticalMode = false;
      }
      this.tacticalScene.clear();
      this.renderMOTD(oCtx, w, h);
      this.renderGalactic();
      this.updateStatusBar();
      this.updatePlayerList();
      this.updateMessages();
      if (this._showHelp) this.renderHelp(oCtx, w, h);
      return;
    }

    // Alive/observe — 3D tactical rendering
    if (!this.isTacticalMode) {
      this.tacticalScene.restoreTacticalMode();
      this.isTacticalMode = true;
    }

    this.tacticalScene.render(this.state);
    this.renderGalactic();

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

    // Update HTML panels
    this.updateStatusBar();
    this.updatePlayerList();
    this.updateMessages();

    if (this._showHelp) this.renderHelp(oCtx, w, h);
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
  // Galactic View (Canvas 2D — unchanged)
  // ============================================================

  private renderGalactic() {
    const ctx = this.galCtx;
    const s = this.state;
    const size = this._galCanvasSize;
    const scale = size / GWIDTH;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = '10px monospace';

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);

    // Grid - quadrant borders
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
    ctx.stroke();

    // Team labels in corners
    ctx.font = '12px monospace';
    ctx.fillStyle = TEAM_COLORS[ROM]; ctx.fillText('ROM', 8, 16);
    ctx.fillStyle = TEAM_COLORS[KLI]; ctx.fillText('KLI', size - 36, 16);
    ctx.fillStyle = TEAM_COLORS[FED]; ctx.fillText('FED', 8, size - 8);
    ctx.fillStyle = TEAM_COLORS[ORI]; ctx.fillText('ORI', size - 36, size - 8);
    ctx.font = '10px monospace';

    // Draw planets
    ctx.textAlign = 'center';
    for (const planet of s.planets) {
      if (!planet.name) continue;
      const sx = planet.x * scale;
      const sy = planet.y * scale;
      const color = TEAM_COLORS[planet.owner] ?? '#888';

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, TWO_PI);
      ctx.fill();

      ctx.fillText(planet.name.substring(0, 3), sx, sy + 12);
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
      ctx.fillText(`${teamLetter}${player.number}`, sx, sy + 4);
    }
    ctx.textAlign = 'left';

    // Tactical viewport box — matches actual camera frustum dimensions
    if (s.myNumber >= 0 && s.players[s.myNumber].status === PALIVE) {
      const me = s.players[s.myNumber];
      const { halfW, halfH } = this.tacticalScene.getVisibleHalfExtents();
      const mx = me.x * scale;
      const my = me.y * scale;
      const sw = halfW * scale;
      const sh = halfH * scale;

      ctx.strokeStyle = '#444';
      ctx.strokeRect(mx - sw, my - sh, sw * 2, sh * 2);
    }

    ctx.restore();
  }

  // ============================================================
  // Outfit Selection Screen (overlay canvas for UI, 3D for ship)
  // ============================================================

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

    const gap = 10;
    const teamPad = 10;
    const boxW = Math.min(90, Math.floor((w - teamPad * 2 - (teams.length - 1) * gap) / teams.length));
    const boxH = 40;
    const totalW = teams.length * boxW + (teams.length - 1) * gap;
    const startX = (w - totalW) / 2;
    const teamY = 38;

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
      ctx.lineWidth = selected ? 3 : 1;
      ctx.strokeRect(x, teamY, boxW, boxH);

      ctx.fillStyle = available ? t.color : '#444';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(t.name, x + boxW / 2, teamY + 18);

      ctx.font = '10px monospace';
      ctx.fillStyle = available ? '#aaa' : '#333';
      ctx.fillText(`[${t.key}]`, x + boxW / 2, teamY + 33);
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

      // Determine panel size relative to canvas height
      const panelW = Math.floor(w * 0.30);
      const panelH = Math.floor(h * 0.28);

      for (let i = 0; i < ships.length; i++) {
        const s = ships[i];
        const pos = screenPositions[i];
        if (!pos) continue;

        // Center panel on the projected ship position, clamped to canvas bounds
        const pad = 4;
        const px = Math.round(Math.max(pad, Math.min(w - panelW - pad, pos.x - panelW / 2)));
        const py = Math.round(Math.max(pad, Math.min(h - panelH - pad, pos.y - panelH / 2)));

        // Panel background — semi-transparent so 3D model shows through
        ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
        ctx.fillRect(px, py, panelW, panelH);
        ctx.strokeStyle = teamColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, panelW, panelH);

        const cx = px + panelW / 2;

        // Ship name at top of panel
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = teamColor;
        ctx.textAlign = 'center';
        ctx.fillText(s.name, cx, py + 16);

        // Stats at bottom of panel
        ctx.font = '10px monospace';
        ctx.fillStyle = '#999';
        if (s.stats) {
          const statsY = py + panelH - 40;
          ctx.fillText(`Spd:${s.stats.speed}  Sh:${s.stats.shields}`, cx, statsY);
          ctx.fillText(`Hu:${s.stats.hull}  Arm:${s.stats.maxArmies}`, cx, statsY + 13);
        }

        // Key binding at very bottom
        ctx.font = '11px monospace';
        ctx.fillStyle = '#aaa';
        ctx.fillText(`[${s.key}]`, cx, py + panelH - 6);
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
    ctx.font = 'bold 18px monospace';
    ctx.fillText('KEYBOARD COMMANDS', w / 2, 32);

    ctx.font = '10px monospace';
    ctx.fillStyle = '#666';
    ctx.fillText('Press ? to toggle  |  Press any key to dismiss', w / 2, 48);

    const col1x = w * 0.15;
    const col2x = w * 0.58;
    const lineH = 16;
    let y: number;

    ctx.textAlign = 'left';
    ctx.font = '11px monospace';

    // Column 1: Movement & Combat
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

    // Column 2
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
