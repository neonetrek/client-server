/**
 * NeoNetrek Game State
 *
 * Central data store for all game entities.
 * Updated by incoming server packets.
 */

import { MAXPLAYER, MAXPLANETS, MAXTORP, PFREE, TFREE, PTFREE, PHFREE } from './constants';

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
}

export interface Torpedo {
  number: number;     // global torp index
  owner: number;      // player number
  status: number;
  x: number;
  y: number;
  dir: number;
  war: number;
}

export interface Plasma {
  number: number;
  owner: number;
  status: number;
  x: number;
  y: number;
  war: number;
}

export interface Phaser {
  number: number;     // player number
  status: number;
  dir: number;
  x: number;          // target x
  y: number;          // target y
  target: number;
  fuse: number;       // countdown for display
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

export interface Message {
  from: number;
  to: number;
  flags: number;
  text: string;
  time: number;
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

  // Server info
  queuePos: number;

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
    fuel: 0, shield: 0, hull: 0, wTemp: 0, eTemp: 0,
  };
}

function createTorp(num: number): Torpedo {
  return {
    number: num, owner: Math.floor(num / MAXTORP),
    status: TFREE, x: 0, y: 0, dir: 0, war: 0,
  };
}

function createPlasma(num: number): Plasma {
  return { number: num, owner: num, status: PTFREE, x: 0, y: 0, war: 0 };
}

function createPhaser(num: number): Phaser {
  return { number: num, status: PHFREE, dir: 0, x: 0, y: 0, target: 0, fuse: 0 };
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
    queuePos: -1,
    armies: [0, 0, 0, 0],
    planets_owned: [0, 0, 0, 0],
  };
}
