// NeoNetrek constants - derived from the original Netrek protocol

// Galaxy dimensions
export const GWIDTH = 100000;
export const TWIDTH = 20000;

// Update rates
export const UPDATE_RATE = 50000; // server update interval (microseconds)
export const REDRAW_RATE = 50;    // client redraw interval (ms) = 20 fps

// Combat distances
export const EXPDIST = 350;       // torp explosion range
export const SHIPDAMDIST = 3000;  // exploding ship damage range

// Teams
export const IND = 0x0;
export const FED = 0x1;
export const ROM = 0x2;
export const KLI = 0x4;
export const ORI = 0x8;
export const ALL_TEAMS = FED | ROM | KLI | ORI;

export const TEAM_NAMES: Record<number, string> = {
  [IND]: 'Independent',
  [FED]: 'Federation',
  [ROM]: 'Romulan',
  [KLI]: 'Klingon',
  [ORI]: 'Orion',
};

export const TEAM_SHORT: Record<number, string> = {
  [IND]: 'IND', [FED]: 'FED', [ROM]: 'ROM', [KLI]: 'KLI', [ORI]: 'ORI',
};

export const TEAM_LETTERS: Record<number, string> = {
  [IND]: 'I', [FED]: 'F', [ROM]: 'R', [KLI]: 'K', [ORI]: 'O',
};

export const TEAM_COLORS: Record<number, string> = {
  [IND]: '#888888',
  [FED]: '#ffff00', // yellow
  [ROM]: '#ff0000', // red
  [KLI]: '#00ff00', // green
  [ORI]: '#00ccff', // cyan
};

// Player states
export const PFREE = 0;
export const POUTFIT = 1;
export const PALIVE = 2;
export const PEXPLODE = 3;
export const PDEAD = 4;
export const POBSERV = 5;

// Torpedo states
export const TFREE = 0;
export const TMOVE = 1;
export const TEXPLODE = 2;
export const TDET = 3;
export const TOFF = 4;
export const TSTRAIGHT = 5;

export const MAXTORP = 8;

// Plasma states
export const PTFREE = 0;
export const PTMOVE = 1;
export const PTEXPLODE = 2;
export const PTDET = 3;

// Player flags
export const PFSHIELD   = 0x0001;
export const PFREPAIR   = 0x0002;
export const PFBOMB     = 0x0004;
export const PFORBIT    = 0x0008;
export const PFCLOAK    = 0x0010;
export const PFWEP      = 0x0020;
export const PFENG      = 0x0040;
export const PFROBOT    = 0x0080;
export const PFBEAMUP   = 0x0100;
export const PFBEAMDOWN = 0x0200;
export const PFSELFDEST = 0x0400;
export const PFGREEN    = 0x0800;
export const PFYELLOW   = 0x1000;
export const PFRED      = 0x2000;
export const PFPLOCK    = 0x4000;
export const PFPLLOCK   = 0x8000;
export const PFCOPILOT  = 0x10000;
export const PFWAR      = 0x20000;
export const PFPRACTR   = 0x40000;
export const PFDOCK     = 0x80000;
export const PFREFIT    = 0x100000;
export const PFREFITTING = 0x200000;
export const PFTRACT    = 0x400000;
export const PFPRESS    = 0x800000;

// Tractor/pressor beam range (galactic units)
export const TRACTDIST  = 6000;
export const PFDOCKOK   = 0x1000000;
export const PFSEEN     = 0x2000000;
export const PFOBSERV   = 0x8000000;
export const PFTWARP    = 0x40000000;

// Ship types
export const SCOUT = 0;
export const DESTROYER = 1;
export const CRUISER = 2;
export const BATTLESHIP = 3;
export const ASSAULT = 4;
export const STARBASE = 5;
export const SGALAXY = 6;
export const ATT = 7;
export const NUM_TYPES = 8;

export const SHIP_NAMES: Record<number, string> = {
  [SCOUT]: 'Scout',
  [DESTROYER]: 'Destroyer',
  [CRUISER]: 'Cruiser',
  [BATTLESHIP]: 'Battleship',
  [ASSAULT]: 'Assault',
  [STARBASE]: 'Starbase',
  [SGALAXY]: 'Galaxy',
  [ATT]: 'ATT',
};

export const SHIP_SHORT: Record<number, string> = {
  [SCOUT]: 'SC', [DESTROYER]: 'DD', [CRUISER]: 'CA',
  [BATTLESHIP]: 'BB', [ASSAULT]: 'AS', [STARBASE]: 'SB',
  [SGALAXY]: 'GA', [ATT]: 'AT',
};

export interface ShipStats {
  speed: number;
  maxArmies: number;
  shields: number;
  hull: number;
  fuel: number;
  turns: number;   // server s_turns value for turn rate calculation
  tractRng: number; // tractor range multiplier (effective range = TRACTDIST * tractRng)
}

export const SHIP_STATS: Record<number, ShipStats> = {
  [SCOUT]:      { speed: 12, maxArmies: 2,  shields: 75,  hull: 75,  fuel: 5000,  turns: 570000, tractRng: 0.7 },
  [DESTROYER]:  { speed: 10, maxArmies: 5,  shields: 85,  hull: 85,  fuel: 7000,  turns: 310000, tractRng: 0.9 },
  [CRUISER]:    { speed: 9,  maxArmies: 10, shields: 100, hull: 100, fuel: 10000, turns: 170000, tractRng: 1.0 },
  [BATTLESHIP]: { speed: 8,  maxArmies: 6,  shields: 130, hull: 130, fuel: 14000, turns: 75000,  tractRng: 1.2 },
  [ASSAULT]:    { speed: 8,  maxArmies: 20, shields: 80,  hull: 200, fuel: 6000,  turns: 120000, tractRng: 0.7 },
  [STARBASE]:   { speed: 2,  maxArmies: 25, shields: 500, hull: 600, fuel: 60000, turns: 50000,  tractRng: 1.5 },
  [SGALAXY]:    { speed: 9,  maxArmies: 10, shields: 100, hull: 100, fuel: 12000, turns: 85000,  tractRng: 1.0 },
};

// Planet flags
export const PLREPAIR = 0x010;
export const PLFUEL   = 0x020;
export const PLAGRI   = 0x040;
export const PLREDRAW = 0x080;
export const PLHOME   = 0x100;
export const PLCOUP   = 0x200;
export const PLCHEAP  = 0x400;
export const PLCORE   = 0x800;

// Phaser states
export const PHFREE  = 0x00;
export const PHHIT   = 0x01;
export const PHMISS  = 0x02;
export const PHHIT2  = 0x04;

// Message flags
export const MVALID  = 0x01;
export const MINDIV  = 0x02;
export const MTEAM   = 0x04;
export const MALL    = 0x08;
export const MGOD    = 0x10;

// Bad version codes
export const BADVERSION_SOCKET  = 0;
export const BADVERSION_DENIED  = 1;
export const BADVERSION_NOSLOT  = 2;
export const BADVERSION_BANNED  = 3;
export const BADVERSION_DOWN    = 4;
export const BADVERSION_SILENCE = 5;

// Rank names (indexed by rank number from server)
export const RANK_NAMES = [
  'Ensign', 'Lieutenant', 'Lt. Cmdr', 'Commander',
  'Captain', 'Flt. Capt', 'Commodore', 'Rear Adm', 'Admiral',
];

// Max players
export const MAXPLAYER = 32;
export const MAXPLANETS = 40;
