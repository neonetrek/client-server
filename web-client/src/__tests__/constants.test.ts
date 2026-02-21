/**
 * Constants validation tests
 *
 * Ensures game constants are internally consistent.
 */

import { describe, it, expect } from 'vitest';
import {
  FED, ROM, KLI, ORI, IND, ALL_TEAMS,
  SCOUT, DESTROYER, CRUISER, BATTLESHIP, ASSAULT, STARBASE, SGALAXY, ATT, NUM_TYPES,
  TEAM_NAMES, TEAM_COLORS, TEAM_LETTERS,
  SHIP_NAMES, SHIP_SHORT, SHIP_STATS,
  PFSHIELD, PFREPAIR, PFBOMB, PFORBIT, PFCLOAK,
  GWIDTH, TWIDTH,
  MAXPLAYER, MAXPLANETS, MAXTORP,
} from '../constants';

describe('team constants', () => {
  it('teams are distinct bit flags', () => {
    expect(FED & ROM).toBe(0);
    expect(FED & KLI).toBe(0);
    expect(FED & ORI).toBe(0);
    expect(ROM & KLI).toBe(0);
    expect(ROM & ORI).toBe(0);
    expect(KLI & ORI).toBe(0);
  });

  it('ALL_TEAMS is union of all playable teams', () => {
    expect(ALL_TEAMS).toBe(FED | ROM | KLI | ORI);
  });

  it('IND is zero', () => {
    expect(IND).toBe(0);
  });

  it('all teams have names, colors, and letters', () => {
    for (const team of [IND, FED, ROM, KLI, ORI]) {
      expect(TEAM_NAMES[team]).toBeDefined();
      expect(TEAM_COLORS[team]).toBeDefined();
      expect(TEAM_LETTERS[team]).toBeDefined();
    }
  });
});

describe('ship constants', () => {
  it('ship types are 0-7', () => {
    expect(SCOUT).toBe(0);
    expect(DESTROYER).toBe(1);
    expect(CRUISER).toBe(2);
    expect(BATTLESHIP).toBe(3);
    expect(ASSAULT).toBe(4);
    expect(STARBASE).toBe(5);
    expect(SGALAXY).toBe(6);
    expect(ATT).toBe(7);
    expect(NUM_TYPES).toBe(8);
  });

  it('all ship types have names and short codes', () => {
    for (let i = 0; i < NUM_TYPES; i++) {
      expect(SHIP_NAMES[i]).toBeDefined();
      expect(SHIP_SHORT[i]).toBeDefined();
    }
  });

  it('playable ships have stats', () => {
    for (const type of [SCOUT, DESTROYER, CRUISER, BATTLESHIP, ASSAULT, STARBASE]) {
      const stats = SHIP_STATS[type];
      expect(stats).toBeDefined();
      expect(stats.speed).toBeGreaterThan(0);
      expect(stats.shields).toBeGreaterThan(0);
      expect(stats.hull).toBeGreaterThan(0);
      expect(stats.fuel).toBeGreaterThan(0);
      expect(stats.maxArmies).toBeGreaterThanOrEqual(0);
    }
  });

  it('scout is fastest, starbase is slowest', () => {
    expect(SHIP_STATS[SCOUT].speed).toBeGreaterThan(SHIP_STATS[STARBASE].speed);
  });

  it('starbase has most shields', () => {
    for (const type of [SCOUT, DESTROYER, CRUISER, BATTLESHIP, ASSAULT]) {
      expect(SHIP_STATS[STARBASE].shields).toBeGreaterThan(SHIP_STATS[type].shields);
    }
  });
});

describe('player flags', () => {
  it('common flags are distinct bits', () => {
    const flags = [PFSHIELD, PFREPAIR, PFBOMB, PFORBIT, PFCLOAK];
    for (let i = 0; i < flags.length; i++) {
      for (let j = i + 1; j < flags.length; j++) {
        expect(flags[i] & flags[j]).toBe(0);
      }
    }
  });
});

describe('dimensions', () => {
  it('galaxy is 100000x100000', () => {
    expect(GWIDTH).toBe(100000);
  });

  it('tactical is 20000 (1/5 of galaxy)', () => {
    expect(TWIDTH).toBe(20000);
    expect(GWIDTH / TWIDTH).toBe(5);
  });

  it('MAXPLAYER is 32, MAXPLANETS is 40', () => {
    expect(MAXPLAYER).toBe(32);
    expect(MAXPLANETS).toBe(40);
  });

  it('MAXTORP is 8', () => {
    expect(MAXTORP).toBe(8);
  });
});
