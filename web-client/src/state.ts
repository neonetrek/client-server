/**
 * NeoNetrek Game State
 *
 * Central data store for all game entities.
 * Updated by incoming server packets.
 */

import { MAXPLAYER, MAXPLANETS, MAXTORP, PFREE, TFREE, PTFREE, PHFREE, PALIVE } from './constants';

export interface Player {
  number: number;
  team: number;
  shipType: number;
  status: number;
  flags: number;
  x: number;
  y: number;
  dir: number;       // 0-255 direction
  speed: number;
  name: string;
  login: string;
  rank: number;
  kills: number;
  hostile: number;
  war: number;
  armies: number;
  fuel: number;
  shield: number;
  hull: number;
  wTemp: number;
  eTemp: number;
  explodeStart: number; // timestamp when explosion began
  tractTarget: number;  // player being tractored/repressed (-1 = none)
  lastShield: number;   // previous shield value for hit detection
  prevDir: number;      // previous direction for banking
  hullHitTime: number;  // timestamp when hull damage was last detected
  renderX: number;      // interpolated X for rendering
  renderY: number;      // interpolated Y for rendering
  interpVx: number;     // estimated X velocity (game units/sec)
  interpVy: number;     // estimated Y velocity (game units/sec)
  lastUpdateTime: number; // performance.now() of last SP_PLAYER
}

export interface Torpedo {
  number: number;     // global torp index
  owner: number;      // player number
  status: number;
  x: number;
  y: number;
  dir: number;
  war: number;
  explodeStart: number; // timestamp when explosion began
}

export interface Plasma {
  number: number;
  owner: number;
  status: number;
  x: number;
  y: number;
  war: number;
  explodeStart: number; // timestamp when explosion began
}

export interface Phaser {
  number: number;     // player number
  status: number;
  dir: number;
  x: number;          // target x
  y: number;          // target y
  target: number;
  fuseStart: number;  // timestamp when phaser was fired
}

export interface Planet {
  number: number;
  name: string;
  x: number;
  y: number;
  owner: number;
  info: number;       // team knowledge flags
  flags: number;      // PLREPAIR, PLFUEL, etc.
  armies: number;
}

/** Client-side beam attempt for visual feedback when server rejects (out of range). */
export interface BeamAttempt {
  playerNum: number;    // who is wielding
  targetNum: number;    // targeted player
  isPressor: boolean;   // false = tractor, true = pressor
  time: number;         // Date.now() when attempt was made
}

export interface Message {
  from: number;
  to: number;
  flags: number;
  text: string;
  time: number;
}

/** Alert for a planet under attack or destroyed */
export interface PlanetAlert {
  time: number;       // Date.now() when alert was set
  attacker: string;   // attacker description from message
}

export interface GameState {
  // Connection
  connected: boolean;
  serverName: string;

  // My player
  myNumber: number;
  myTeam: number;
  teamMask: number;

  // Game phase
  phase: 'login' | 'outfit' | 'alive' | 'dead' | 'observe';

  // MOTD
  motdLines: string[];
  motdComplete: boolean;

  // Entities
  players: Player[];
  torps: Torpedo[];
  plasmas: Plasma[];
  phasers: Phaser[];
  planets: Planet[];

  // Messages
  messages: Message[];
  warningText: string;
  warningTime: number;
  _warningFromServer: boolean;

  // Planet attack alerts & loss warnings
  planetAlerts: Map<number, PlanetAlert>;  // planetIndex -> alert
  lossWarning: string;
  lossWarningTime: number;

  // Server info
  queuePos: number;

  // Client-side desired direction (set by input handler for trajectory arc)
  desiredDir: number; // -1 = no pending turn, 0-255 = target direction
  // Client-side desired speed (set by input handler for arrow-key speed control)
  desiredSpeed: number; // -1 = no pending change

  // Client-side beam attempt for visual feedback
  beamAttempt: BeamAttempt | null;

  // Ping / latency
  lastPingTime: number;
  latencyMs: number;

  // Game status
  armies: [number, number, number, number]; // FED, ROM, KLI, ORI
  planets_owned: [number, number, number, number];
}

function createPlayer(num: number): Player {
  return {
    number: num, team: 0, shipType: 0, status: PFREE, flags: 0,
    x: 0, y: 0, dir: 0, speed: 0,
    name: '', login: '', rank: 0, kills: 0,
    hostile: 0, war: 0, armies: 0,
    fuel: 0, shield: 0, hull: 0, wTemp: 0, eTemp: 0, explodeStart: 0,
    tractTarget: -1, lastShield: 0, prevDir: 0, hullHitTime: 0,
    renderX: 0, renderY: 0, interpVx: 0, interpVy: 0, lastUpdateTime: 0,
  };
}

function createTorp(num: number): Torpedo {
  return {
    number: num, owner: Math.floor(num / MAXTORP),
    status: TFREE, x: 0, y: 0, dir: 0, war: 0, explodeStart: 0,
  };
}

function createPlasma(num: number): Plasma {
  return { number: num, owner: num, status: PTFREE, x: 0, y: 0, war: 0, explodeStart: 0 };
}

function createPhaser(num: number): Phaser {
  return { number: num, status: PHFREE, dir: 0, x: 0, y: 0, target: 0, fuseStart: 0 };
}

function createPlanet(num: number): Planet {
  return { number: num, name: '', x: 0, y: 0, owner: 0, info: 0, flags: 0, armies: 0 };
}

export function createGameState(): GameState {
  const players: Player[] = [];
  for (let i = 0; i < MAXPLAYER; i++) players.push(createPlayer(i));

  const torps: Torpedo[] = [];
  for (let i = 0; i < MAXPLAYER * MAXTORP; i++) torps.push(createTorp(i));

  const plasmas: Plasma[] = [];
  for (let i = 0; i < MAXPLAYER; i++) plasmas.push(createPlasma(i));

  const phasers: Phaser[] = [];
  for (let i = 0; i < MAXPLAYER; i++) phasers.push(createPhaser(i));

  const planets: Planet[] = [];
  for (let i = 0; i < MAXPLANETS; i++) planets.push(createPlanet(i));

  return {
    connected: false,
    serverName: '',
    myNumber: -1,
    myTeam: 0,
    teamMask: 0,
    phase: 'login',
    motdLines: [],
    motdComplete: false,
    players,
    torps,
    plasmas,
    phasers,
    planets,
    messages: [],
    warningText: '',
    warningTime: 0,
    _warningFromServer: false,
    planetAlerts: new Map(),
    lossWarning: '',
    lossWarningTime: 0,
    desiredDir: -1,
    beamAttempt: null,
    desiredSpeed: -1,
    queuePos: -1,
    lastPingTime: 0,
    latencyMs: -1,
    armies: [0, 0, 0, 0],
    planets_owned: [0, 0, 0, 0],
  };
}

/** Extrapolate renderX/renderY forward using estimated velocity between server updates. */
export function interpolatePositions(players: Player[]) {
  const now = performance.now();
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.status === PALIVE && p.speed > 0 && p.lastUpdateTime > 0) {
      const dt = Math.min((now - p.lastUpdateTime) / 1000, 0.08);
      p.renderX = p.x + p.interpVx * dt;
      p.renderY = p.y + p.interpVy * dt;
    } else {
      p.renderX = p.x;
      p.renderY = p.y;
    }
  }
}
