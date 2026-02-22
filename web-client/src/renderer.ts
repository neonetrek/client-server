/**
 * NeoNetrek Renderer
 *
 * Canvas 2D rendering for tactical and galactic views.
 */

import { GameState, Player, Torpedo, Phaser, Planet } from './state';
import {
  GWIDTH, TWIDTH,
  PALIVE, PEXPLODE, PFREE,
  TMOVE, TEXPLODE,
  PTMOVE, PTEXPLODE,
  PHMISS, PHHIT, PHHIT2,
  PFSHIELD, PFCLOAK, PFORBIT, PFREPAIR, PFBOMB,
  PFGREEN, PFYELLOW, PFRED,
  PLREPAIR, PLFUEL, PLAGRI, PLHOME,
  TEAM_COLORS, TEAM_LETTERS, SHIP_SHORT, SHIP_STATS,
  FED, ROM, KLI, ORI, IND,
  SCOUT, DESTROYER, CRUISER, BATTLESHIP, ASSAULT, SGALAXY,
  MAXTORP, MAXPLAYER,
} from './constants';

const TAC_SIZE = 500;  // Tactical canvas logical size
const GAL_SIZE = 500;  // Galactic canvas logical size

// How many galactic units fit in the tactical view
const TAC_RANGE = TWIDTH; // 20000

export class Renderer {
  private tacCanvas: HTMLCanvasElement;
  private galCanvas: HTMLCanvasElement;
  private tacCtx: CanvasRenderingContext2D;
  private galCtx: CanvasRenderingContext2D;
  private state: GameState;
  private showGalactic = false;

  constructor(tacCanvas: HTMLCanvasElement, galCanvas: HTMLCanvasElement, state: GameState) {
    this.tacCanvas = tacCanvas;
    this.galCanvas = galCanvas;
    this.state = state;

    // Set canvas sizes with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const size = Math.min(window.innerWidth, window.innerHeight - 120);

    for (const canvas of [tacCanvas, galCanvas]) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    }

    this.tacCtx = tacCanvas.getContext('2d')!;
    this.galCtx = galCanvas.getContext('2d')!;

    this.tacCtx.scale(dpr, dpr);
    this.galCtx.scale(dpr, dpr);

    this.tacCtx.font = '11px monospace';
    this.galCtx.font = '10px monospace';
  }

  get canvasSize(): number {
    return parseInt(this.tacCanvas.style.width);
  }

  toggleView() {
    this.showGalactic = !this.showGalactic;
    this.tacCanvas.style.display = this.showGalactic ? 'none' : 'block';
    this.galCanvas.style.display = this.showGalactic ? 'block' : 'none';
  }

  get isGalacticView(): boolean {
    return this.showGalactic;
  }

  render() {
    // Show outfit screen during outfit/dead phases
    if (this.state.phase === 'outfit' || this.state.phase === 'dead') {
      this.renderOutfit(this.tacCtx, this.canvasSize, this.state.myTeam);
      return;
    }

    if (this.showGalactic) {
      this.renderGalactic();
    } else {
      this.renderTactical();
    }
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
    if (!me || me.status === PFREE) {
      this.renderMOTD(ctx, size);
      return;
    }

    const cx = me.x;
    const cy = me.y;

    // Draw grid lines (every 5000 galactic units)
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    const gridSpacing = 5000;
    const scale = size / TAC_RANGE;
    for (let gx = 0; gx <= GWIDTH; gx += gridSpacing) {
      const sx = (gx - cx + TAC_RANGE / 2) * scale;
      if (sx >= 0 && sx <= size) {
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, size);
        ctx.stroke();
      }
    }
    for (let gy = 0; gy <= GWIDTH; gy += gridSpacing) {
      const sy = (gy - cy + TAC_RANGE / 2) * scale;
      if (sy >= 0 && sy <= size) {
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(size, sy);
        ctx.stroke();
      }
    }

    // Draw planets in tactical range
    for (const planet of s.planets) {
      if (!planet.name) continue;
      const sx = (planet.x - cx + TAC_RANGE / 2) * scale;
      const sy = (planet.y - cy + TAC_RANGE / 2) * scale;
      if (sx < -30 || sx > size + 30 || sy < -30 || sy > size + 30) continue;
      this.drawTacPlanet(ctx, planet, sx, sy);
    }

    // Draw torpedoes
    for (const torp of s.torps) {
      if (torp.status === TMOVE) {
        const sx = (torp.x - cx + TAC_RANGE / 2) * scale;
        const sy = (torp.y - cy + TAC_RANGE / 2) * scale;
        if (sx < -5 || sx > size + 5 || sy < -5 || sy > size + 5) continue;

        const owner = torp.owner >= 0 && torp.owner < MAXPLAYER ? s.players[torp.owner] : null;
        ctx.fillStyle = owner && owner.number === s.myNumber
          ? '#fff'
          : (TEAM_COLORS[owner?.team ?? IND] ?? '#888');
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (torp.status === TEXPLODE) {
        const sx = (torp.x - cx + TAC_RANGE / 2) * scale;
        const sy = (torp.y - cy + TAC_RANGE / 2) * scale;
        ctx.fillStyle = '#ff8800';
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw plasmas
    for (const plasma of s.plasmas) {
      if (plasma.status === PTMOVE) {
        const sx = (plasma.x - cx + TAC_RANGE / 2) * scale;
        const sy = (plasma.y - cy + TAC_RANGE / 2) * scale;
        if (sx < -10 || sx > size + 10 || sy < -10 || sy > size + 10) continue;
        ctx.fillStyle = '#ff00ff';
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (plasma.status === PTEXPLODE) {
        const sx = (plasma.x - cx + TAC_RANGE / 2) * scale;
        const sy = (plasma.y - cy + TAC_RANGE / 2) * scale;
        ctx.fillStyle = '#ff44ff';
        ctx.beginPath();
        ctx.arc(sx, sy, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw phasers
    for (const phaser of s.phasers) {
      if (phaser.fuse <= 0) continue;
      phaser.fuse--;

      if (phaser.number < 0 || phaser.number >= MAXPLAYER) continue;
      const owner = s.players[phaser.number];
      if (!owner || owner.status !== PALIVE) continue;

      const sx1 = (owner.x - cx + TAC_RANGE / 2) * scale;
      const sy1 = (owner.y - cy + TAC_RANGE / 2) * scale;
      let sx2: number, sy2: number;

      if (phaser.status === PHHIT || phaser.status === PHHIT2) {
        sx2 = (phaser.x - cx + TAC_RANGE / 2) * scale;
        sy2 = (phaser.y - cy + TAC_RANGE / 2) * scale;
      } else {
        // Miss - draw in direction
        const angle = (phaser.dir / 256) * Math.PI * 2 - Math.PI / 2;
        sx2 = sx1 + Math.cos(angle) * 200;
        sy2 = sy1 + Math.sin(angle) * 200;
      }

      ctx.strokeStyle = phaser.number === s.myNumber ? '#00ff00' : (TEAM_COLORS[owner.team] ?? '#888');
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // Draw ships
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

    // Draw HUD
    this.renderHUD(ctx, size, me);

    // Draw warning text
    if (s.warningText && Date.now() - s.warningTime < 3000) {
      ctx.fillStyle = '#ff0000';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(s.warningText, size / 2, 20);
      ctx.textAlign = 'left';
      ctx.font = '11px monospace';
    }

    // Draw messages (last 3)
    const recentMsgs = s.messages.slice(-3);
    ctx.font = '11px monospace';
    for (let i = 0; i < recentMsgs.length; i++) {
      const msg = recentMsgs[i];
      const age = Date.now() - msg.time;
      if (age > 10000) continue;
      const alpha = Math.max(0, 1 - age / 10000);
      ctx.fillStyle = `rgba(0, 255, 0, ${alpha})`;
      ctx.fillText(msg.text, 8, size - 40 + i * 14);
    }

    ctx.restore();
  }

  private drawTacShip(ctx: CanvasRenderingContext2D, player: Player, sx: number, sy: number) {
    const isMe = player.number === this.state.myNumber;
    const color = isMe ? '#fff' : (TEAM_COLORS[player.team] ?? '#888');
    const angle = (player.dir / 256) * Math.PI * 2 - Math.PI / 2;

    // Shield circle
    if (player.flags & PFSHIELD) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, 14, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ship body - triangle pointing in direction
    const shipSize = 10;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(angle) * shipSize, sy + Math.sin(angle) * shipSize);
    ctx.lineTo(
      sx + Math.cos(angle + 2.4) * shipSize * 0.7,
      sy + Math.sin(angle + 2.4) * shipSize * 0.7
    );
    ctx.lineTo(
      sx + Math.cos(angle - 2.4) * shipSize * 0.7,
      sy + Math.sin(angle - 2.4) * shipSize * 0.7
    );
    ctx.closePath();
    ctx.fill();

    // Label: team letter + player number
    const teamLetter = TEAM_LETTERS[player.team] ?? '?';
    const label = `${teamLetter}${player.number}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(label, sx, sy + 24);

    // Ship type
    const shipType = SHIP_SHORT[player.shipType] ?? '??';
    ctx.fillStyle = '#888';
    ctx.fillText(shipType, sx, sy + 34);
    ctx.textAlign = 'left';
  }

  private drawTacPlanet(ctx: CanvasRenderingContext2D, planet: Planet, sx: number, sy: number) {
    const color = TEAM_COLORS[planet.owner] ?? '#888';
    const radius = 12;

    // Planet circle
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Fill slightly
    ctx.fillStyle = color + '33';
    ctx.fill();

    // Home planet indicator
    if (planet.flags & PLHOME) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Resource indicators
    let indicators = '';
    if (planet.flags & PLREPAIR) indicators += 'R';
    if (planet.flags & PLFUEL) indicators += 'F';
    if (planet.flags & PLAGRI) indicators += 'A';

    // Planet name
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(planet.name.substring(0, 3), sx, sy + radius + 12);

    // Army count
    if (planet.armies > 0) {
      ctx.fillText(`${planet.armies}`, sx, sy + 4);
    }

    // Resource indicators
    if (indicators) {
      ctx.fillStyle = '#666';
      ctx.fillText(indicators, sx, sy + radius + 22);
    }
    ctx.textAlign = 'left';
  }

  private drawExplosion(ctx: CanvasRenderingContext2D, sx: number, sy: number, startTime: number) {
    const EXPLOSION_DURATION = 500; // ms
    const elapsed = Date.now() - (startTime || Date.now());
    const t = Math.min(1, Math.max(0, elapsed / EXPLOSION_DURATION));
    const radius = 10 + t * 20;
    const alpha = 1 - t;
    ctx.fillStyle = `rgba(255, ${Math.floor(128 * (1 - t))}, 0, ${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Secondary ring for visual impact
    if (t < 0.7) {
      ctx.strokeStyle = `rgba(255, 255, 0, ${0.5 * (1 - t / 0.7)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ============================================================
  // HUD
  // ============================================================

  private renderHUD(ctx: CanvasRenderingContext2D, size: number, me: Player) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = '11px monospace';

    const barWidth = 120;
    const barHeight = 8;
    const x = size - barWidth - 12;
    let y = 12;

    // Get ship-specific max values
    const stats = SHIP_STATS[me.shipType];
    const maxShield = stats?.shields ?? 100;
    const maxHull = stats?.hull ?? 100;
    const maxFuel = stats?.fuel ?? 10000;

    // Alert color background indicator
    let alertColor = '#008800';
    if (me.flags & PFRED) alertColor = '#880000';
    else if (me.flags & PFYELLOW) alertColor = '#888800';

    ctx.fillStyle = alertColor + '44';
    ctx.fillRect(x - 4, y - 4, barWidth + 16, 152);

    // Shields
    this.drawBar(ctx, 'SH', me.shield, maxShield, x, y, barWidth, barHeight, '#00ccff');
    y += 16;

    // Hull (damage)
    this.drawBar(ctx, 'HU', me.hull, maxHull, x, y, barWidth, barHeight, '#cc8800');
    y += 16;

    // Fuel
    this.drawBar(ctx, 'FU', me.fuel, maxFuel, x, y, barWidth, barHeight, '#00ff00');
    y += 16;

    // Weapon temp
    this.drawBar(ctx, 'WT', me.wTemp, 1200, x, y, barWidth, barHeight, '#ff4444');
    y += 16;

    // Engine temp
    this.drawBar(ctx, 'ET', me.eTemp, 1200, x, y, barWidth, barHeight, '#ff8844');
    y += 16;

    // Speed and armies
    ctx.fillStyle = '#0f0';
    ctx.fillText(`Spd: ${me.speed}  Arm: ${me.armies}  K: ${me.kills.toFixed(2)}`, x, y + 8);
    y += 16;

    // Flags
    const flags: string[] = [];
    if (me.flags & PFSHIELD) flags.push('SH');
    if (me.flags & PFCLOAK) flags.push('CL');
    if (me.flags & PFORBIT) flags.push('OR');
    if (me.flags & PFREPAIR) flags.push('RP');
    if (me.flags & PFBOMB) flags.push('BM');
    ctx.fillText(flags.join(' '), x, y + 8);
    y += 16;

    // Latency
    if (this.state.latencyMs >= 0) {
      const lag = this.state.latencyMs;
      ctx.fillStyle = lag < 100 ? '#0f0' : lag < 250 ? '#ff0' : '#f00';
      ctx.fillText(`Lag: ${lag}ms`, x, y + 8);
    }

    ctx.restore();
  }

  private drawBar(
    ctx: CanvasRenderingContext2D,
    label: string, value: number, max: number,
    x: number, y: number, w: number, h: number, color: string
  ) {
    const pct = Math.min(1, Math.max(0, value / max));

    ctx.fillStyle = '#888';
    ctx.fillText(label, x - 24, y + h);

    // Background
    ctx.fillStyle = '#222';
    ctx.fillRect(x, y, w, h);

    // Fill
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * pct, h);

    // Value
    ctx.fillStyle = '#fff';
    ctx.fillText(`${value}`, x + w + 4, y + h);
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

    // Grid - quadrant borders
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
    ctx.stroke();

    // Team labels in corners
    ctx.font = '12px monospace';
    ctx.fillStyle = TEAM_COLORS[FED]; ctx.fillText('FED', 8, 16);
    ctx.fillStyle = TEAM_COLORS[ROM]; ctx.fillText('ROM', size - 36, 16);
    ctx.fillStyle = TEAM_COLORS[KLI]; ctx.fillText('KLI', 8, size - 8);
    ctx.fillStyle = TEAM_COLORS[ORI]; ctx.fillText('ORI', size - 36, size - 8);
    ctx.font = '10px monospace';

    // Draw planets
    for (const planet of s.planets) {
      if (!planet.name) continue;
      const sx = planet.x * scale;
      const sy = planet.y * scale;
      const color = TEAM_COLORS[planet.owner] ?? '#888';

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.fillText(planet.name.substring(0, 3), sx, sy + 12);
      ctx.textAlign = 'left';
    }

    // Draw players
    for (const player of s.players) {
      if (player.status !== PALIVE) continue;

      const sx = player.x * scale;
      const sy = player.y * scale;
      const color = player.number === s.myNumber ? '#fff' : (TEAM_COLORS[player.team] ?? '#888');
      const teamLetter = TEAM_LETTERS[player.team] ?? '?';

      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.fillText(`${teamLetter}${player.number}`, sx, sy + 4);
      ctx.textAlign = 'left';
    }

    // Draw my tactical range box
    if (s.myNumber >= 0 && s.players[s.myNumber].status === PALIVE) {
      const me = s.players[s.myNumber];
      const halfRange = (TAC_RANGE / 2) * scale;
      const mx = me.x * scale;
      const my = me.y * scale;

      ctx.strokeStyle = '#444';
      ctx.strokeRect(mx - halfRange, my - halfRange, halfRange * 2, halfRange * 2);
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

    // Title
    ctx.fillStyle = '#0f0';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT TEAM & SHIP', size / 2, 30);

    const mask = this.state.teamMask;
    const teams = [
      { flag: FED, name: 'Federation', key: 'F', color: TEAM_COLORS[FED] },
      { flag: ROM, name: 'Romulan',    key: 'R', color: TEAM_COLORS[ROM] },
      { flag: KLI, name: 'Klingon',    key: 'K', color: TEAM_COLORS[KLI] },
      { flag: ORI, name: 'Orion',      key: 'O', color: TEAM_COLORS[ORI] },
    ];

    const boxW = 100;
    const boxH = 60;
    const gap = 16;
    const totalW = teams.length * boxW + (teams.length - 1) * gap;
    const startX = (size - totalW) / 2;
    const teamY = 55;

    // Draw team boxes
    for (let i = 0; i < teams.length; i++) {
      const t = teams[i];
      const x = startX + i * (boxW + gap);
      const available = !!(mask & t.flag);
      const selected = selectedTeam === t.flag;

      // Box background
      if (selected) {
        ctx.fillStyle = t.color + '44';
        ctx.fillRect(x, teamY, boxW, boxH);
      }

      // Box border
      ctx.strokeStyle = available ? t.color : '#333';
      ctx.lineWidth = selected ? 3 : 1;
      ctx.strokeRect(x, teamY, boxW, boxH);

      // Team name
      ctx.fillStyle = available ? t.color : '#444';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(t.name, x + boxW / 2, teamY + 25);

      // Key hint
      ctx.font = '11px monospace';
      ctx.fillStyle = available ? '#aaa' : '#333';
      ctx.fillText(`[${t.key}]`, x + boxW / 2, teamY + 45);
    }

    // Ship selection (shown when team is selected)
    if (selectedTeam) {
      const ships = [
        { type: SCOUT,      name: 'Scout',      short: 'SC', key: 'S', stats: SHIP_STATS[SCOUT] },
        { type: DESTROYER,  name: 'Destroyer',   short: 'DD', key: 'D', stats: SHIP_STATS[DESTROYER] },
        { type: CRUISER,    name: 'Cruiser',     short: 'CA', key: 'C', stats: SHIP_STATS[CRUISER] },
        { type: BATTLESHIP, name: 'Battleship',  short: 'BB', key: 'B', stats: SHIP_STATS[BATTLESHIP] },
        { type: ASSAULT,    name: 'Assault',     short: 'AS', key: 'A', stats: SHIP_STATS[ASSAULT] },
        { type: SGALAXY,    name: 'Galaxy',      short: 'GA', key: 'G', stats: SHIP_STATS[SGALAXY] ?? SHIP_STATS[CRUISER] },
      ];

      ctx.fillStyle = '#888';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Choose a ship:', size / 2, teamY + boxH + 30);

      // Ship cards
      const shipW = 72;
      const shipH = 120;
      const shipGap = 8;
      const totalShipW = ships.length * shipW + (ships.length - 1) * shipGap;
      const shipStartX = (size - totalShipW) / 2;
      const shipY = teamY + boxH + 45;

      const teamColor = TEAM_COLORS[selectedTeam];

      for (let i = 0; i < ships.length; i++) {
        const s = ships[i];
        const x = shipStartX + i * (shipW + shipGap);

        // Card background
        ctx.fillStyle = '#111';
        ctx.fillRect(x, shipY, shipW, shipH);
        ctx.strokeStyle = teamColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, shipY, shipW, shipH);

        // Ship icon (triangle)
        const cx = x + shipW / 2;
        const cy = shipY + 25;
        const iconSize = 12;
        ctx.fillStyle = teamColor;
        ctx.beginPath();
        ctx.moveTo(cx, cy - iconSize);
        ctx.lineTo(cx - iconSize * 0.7, cy + iconSize * 0.5);
        ctx.lineTo(cx + iconSize * 0.7, cy + iconSize * 0.5);
        ctx.closePath();
        ctx.fill();

        // Ship name
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = teamColor;
        ctx.textAlign = 'center';
        ctx.fillText(s.name, cx, shipY + 50);

        // Stats
        ctx.font = '9px monospace';
        ctx.fillStyle = '#888';
        if (s.stats) {
          ctx.fillText(`Spd:${s.stats.speed}`, cx, shipY + 65);
          ctx.fillText(`Sh:${s.stats.shields}`, cx, shipY + 77);
          ctx.fillText(`Hu:${s.stats.hull}`, cx, shipY + 89);
          ctx.fillText(`Arm:${s.stats.maxArmies}`, cx, shipY + 101);
        }

        // Key hint
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

    // Queue position
    if (this.state.queuePos >= 0) {
      ctx.fillStyle = '#ff0';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Queue position: ${this.state.queuePos}`, size / 2, size - 30);
    }

    ctx.restore();
  }

  // ============================================================
  // MOTD / Login Screen
  // ============================================================

  private renderMOTD(ctx: CanvasRenderingContext2D, size: number) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);

    // Title
    ctx.fillStyle = '#0f0';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NEONETREK', size / 2, 40);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('A modern Netrek client', size / 2, 58);
    ctx.textAlign = 'left';

    // MOTD text
    ctx.font = '11px monospace';
    ctx.fillStyle = '#0a0';
    const startLine = Math.max(0, this.state.motdLines.length - 30);
    for (let i = startLine; i < this.state.motdLines.length; i++) {
      const y = 80 + (i - startLine) * 14;
      if (y > size - 20) break;
      ctx.fillText(this.state.motdLines[i], 10, y);
    }

    // Connection status
    ctx.fillStyle = this.state.connected ? '#0f0' : '#f00';
    ctx.textAlign = 'center';
    ctx.fillText(
      this.state.connected ? 'Connected - Press Enter to login' : 'Connecting...',
      size / 2, size - 10
    );
    ctx.textAlign = 'left';
  }
}
