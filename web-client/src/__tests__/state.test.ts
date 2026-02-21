/**
 * Game state tests
 */

import { describe, it, expect } from 'vitest';
import { createGameState } from '../state';
import { MAXPLAYER, MAXPLANETS, MAXTORP, PFREE, TFREE, PTFREE, PHFREE } from '../constants';

describe('createGameState', () => {
  it('creates correct number of players', () => {
    const state = createGameState();
    expect(state.players).toHaveLength(MAXPLAYER);
  });

  it('creates correct number of torpedoes', () => {
    const state = createGameState();
    expect(state.torps).toHaveLength(MAXPLAYER * MAXTORP);
  });

  it('creates correct number of plasmas', () => {
    const state = createGameState();
    expect(state.plasmas).toHaveLength(MAXPLAYER);
  });

  it('creates correct number of phasers', () => {
    const state = createGameState();
    expect(state.phasers).toHaveLength(MAXPLAYER);
  });

  it('creates correct number of planets', () => {
    const state = createGameState();
    expect(state.planets).toHaveLength(MAXPLANETS);
  });

  it('initializes all players as PFREE', () => {
    const state = createGameState();
    for (const p of state.players) {
      expect(p.status).toBe(PFREE);
    }
  });

  it('initializes all torps as TFREE', () => {
    const state = createGameState();
    for (const t of state.torps) {
      expect(t.status).toBe(TFREE);
    }
  });

  it('assigns correct torpedo owners', () => {
    const state = createGameState();
    // Player 0 owns torps 0-7, player 1 owns 8-15, etc.
    for (let i = 0; i < MAXPLAYER * MAXTORP; i++) {
      expect(state.torps[i].owner).toBe(Math.floor(i / MAXTORP));
    }
  });

  it('initializes player numbers correctly', () => {
    const state = createGameState();
    for (let i = 0; i < MAXPLAYER; i++) {
      expect(state.players[i].number).toBe(i);
    }
  });

  it('starts disconnected in login phase', () => {
    const state = createGameState();
    expect(state.connected).toBe(false);
    expect(state.phase).toBe('login');
    expect(state.myNumber).toBe(-1);
  });
});
