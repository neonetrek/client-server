/**
 * 3D torpedo, plasma, phaser, and tractor beam visuals with object pools.
 */

import * as THREE from 'three';
import { GameState, Torpedo, Plasma, Phaser, Player } from '../state';
import {
  TMOVE, TEXPLODE, PTMOVE, PTEXPLODE,
  PHMISS, PHHIT, PHHIT2,
  PFTRACT, PFPRESS, PALIVE,
  TEAM_COLORS, IND, MAXTORP, MAXPLAYER,
} from '../constants';

const TWO_PI = Math.PI * 2;
const TORP_RADIUS = 20;
const PLASMA_RADIUS = 40;
const PHASER_DISPLAY_MS = 500;

// ============================================================
// Torpedo visuals
// ============================================================

function createTorpGroup(): THREE.Group {
  const g = new THREE.Group();

  // Core: bright sphere
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(TORP_RADIUS, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  core.name = 'core';
  g.add(core);

  // Halo: larger translucent sphere
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(TORP_RADIUS * 3, 8, 6),
    new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
    })
  );
  halo.name = 'halo';
  g.add(halo);

  // Point light
  const light = new THREE.PointLight(0xff8800, 0.3, 800);
  light.name = 'light';
  g.add(light);

  // Trail ghosts
  for (let i = 0; i < 3; i++) {
    const ghost = new THREE.Mesh(
      new THREE.SphereGeometry(TORP_RADIUS * 0.7, 6, 4),
      new THREE.MeshBasicMaterial({
        color: 0xff8800,
        transparent: true,
        opacity: 0.2 - i * 0.06,
        blending: THREE.AdditiveBlending,
      })
    );
    ghost.name = `ghost${i}`;
    g.add(ghost);
  }

  return g;
}

function createExplosionGroup(): THREE.Group {
  const g = new THREE.Group();

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(TORP_RADIUS * 4, 8, 6),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    })
  );
  sphere.name = 'blast';
  g.add(sphere);

  return g;
}

// ============================================================
// Phaser beam visuals
// ============================================================

function createPhaserGroup(): THREE.Group {
  const g = new THREE.Group();

  // 3-layer beam: outer glow, mid, core
  // Using cylinders stretched between source and target
  for (const [name, radius, opacity] of [
    ['outer', 40, 0.1],
    ['mid', 20, 0.35],
    ['core', 8, 0.8],
  ] as [string, number, number][]) {
    const geo = new THREE.CylinderGeometry(radius, radius, 1, 6, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffa030,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    g.add(mesh);
  }

  return g;
}

// ============================================================
// Tractor/Pressor beam visuals
// ============================================================

function createTractorGroup(): THREE.Group {
  const g = new THREE.Group();

  for (const [name, radius, opacity] of [
    ['outer', 25, 0.08],
    ['mid', 12, 0.25],
    ['core', 5, 0.6],
  ] as [string, number, number][]) {
    const geo = new THREE.CylinderGeometry(radius, radius, 1, 6, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    g.add(mesh);
  }

  return g;
}

// ============================================================
// Main projectile manager
// ============================================================

export class ProjectileMeshes {
  readonly group: THREE.Group;

  // Torpedo pools
  private torpGroups: THREE.Group[] = [];
  private torpExplodeGroups: THREE.Group[] = [];

  // Plasma pools (reuse torp style but bigger)
  private plasmaGroups: THREE.Group[] = [];
  private plasmaExplodeGroups: THREE.Group[] = [];

  // Phaser beams
  private phaserGroups: THREE.Group[] = [];

  // Tractor beams
  private tractorGroups: THREE.Group[] = [];

  constructor() {
    this.group = new THREE.Group();

    // Pre-allocate torpedo visuals (MAXPLAYER * MAXTORP = 256)
    const torpCount = MAXPLAYER * MAXTORP;
    for (let i = 0; i < torpCount; i++) {
      const tg = createTorpGroup();
      tg.visible = false;
      this.torpGroups.push(tg);
      this.group.add(tg);

      const eg = createExplosionGroup();
      eg.visible = false;
      this.torpExplodeGroups.push(eg);
      this.group.add(eg);
    }

    // Pre-allocate plasma visuals (MAXPLAYER)
    for (let i = 0; i < MAXPLAYER; i++) {
      const pg = createTorpGroup();
      pg.visible = false;
      // Make plasma pink/magenta and larger
      pg.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshBasicMaterial;
          mat.color.setHex(0xff00ff);
        }
        if (child instanceof THREE.PointLight) {
          child.color.setHex(0xff00ff);
        }
      });
      pg.scale.set(2, 2, 2);
      this.plasmaGroups.push(pg);
      this.group.add(pg);

      const peg = createExplosionGroup();
      peg.visible = false;
      peg.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          (child.material as THREE.MeshBasicMaterial).color.setHex(0xff44ff);
        }
      });
      peg.scale.set(2, 2, 2);
      this.plasmaExplodeGroups.push(peg);
      this.group.add(peg);
    }

    // Pre-allocate phaser beams (one per player)
    for (let i = 0; i < MAXPLAYER; i++) {
      const ph = createPhaserGroup();
      ph.visible = false;
      this.phaserGroups.push(ph);
      this.group.add(ph);
    }

    // Pre-allocate tractor beams (one per player)
    for (let i = 0; i < MAXPLAYER; i++) {
      const tr = createTractorGroup();
      tr.visible = false;
      this.tractorGroups.push(tr);
      this.group.add(tr);
    }
  }

  /** Update all projectile visuals for the current frame */
  update(state: GameState, playerX: number, playerZ: number, tacRange: number) {
    const now = Date.now();
    const halfRange = tacRange / 2 + 500;

    // --- Torpedoes ---
    for (let i = 0; i < state.torps.length; i++) {
      const torp = state.torps[i];
      const tg = this.torpGroups[i];
      const eg = this.torpExplodeGroups[i];

      if (torp.status === TMOVE) {
        const dx = torp.x - playerX;
        const dz = torp.y - playerZ;
        if (Math.abs(dx) > halfRange || Math.abs(dz) > halfRange) {
          tg.visible = false;
          eg.visible = false;
          continue;
        }

        tg.visible = true;
        eg.visible = false;
        tg.position.set(torp.x, 15, torp.y);

        // Set color based on owner
        const owner = torp.owner >= 0 && torp.owner < MAXPLAYER ? state.players[torp.owner] : null;
        const isOwn = owner?.number === state.myNumber;
        const teamColor = TEAM_COLORS[owner?.team ?? IND] ?? '#888888';
        const color = isOwn ? 0xffaa3c : new THREE.Color(teamColor).getHex();

        // Update colors
        const halo = tg.getObjectByName('halo') as THREE.Mesh | undefined;
        if (halo) (halo.material as THREE.MeshBasicMaterial).color.setHex(color);
        const light = tg.getObjectByName('light') as THREE.PointLight | undefined;
        if (light) light.color.setHex(color);

        // Pulsing halo
        const phase = now * 0.008 + torp.number;
        const pulse = Math.sin(phase) * 0.3 + 1.0;
        if (halo) halo.scale.setScalar(pulse);

        // Trail ghosts — position behind torpedo direction
        const dirRad = (torp.dir / 256) * TWO_PI;
        for (let j = 0; j < 3; j++) {
          const ghost = tg.getObjectByName(`ghost${j}`) as THREE.Mesh | undefined;
          if (ghost) {
            const dist = (j + 1) * TORP_RADIUS * 3;
            // Trail goes backward: +sin(dir) in X, +cos(dir) in Z (since dir 0 = north = -Z)
            ghost.position.set(
              Math.sin(dirRad) * dist,
              0,
              Math.cos(dirRad) * dist
            );
          }
        }

      } else if (torp.status === TEXPLODE) {
        tg.visible = false;
        const dx = torp.x - playerX;
        const dz = torp.y - playerZ;
        if (Math.abs(dx) > halfRange || Math.abs(dz) > halfRange) {
          eg.visible = false;
          continue;
        }
        eg.visible = true;
        eg.position.set(torp.x, 15, torp.y);

        // Expand and fade
        const blast = eg.getObjectByName('blast') as THREE.Mesh | undefined;
        if (blast) {
          // Since we don't have exact explosion start, just show a static burst
          (blast.material as THREE.MeshBasicMaterial).opacity = 0.6;
          blast.scale.setScalar(2);
        }
      } else {
        tg.visible = false;
        eg.visible = false;
      }
    }

    // --- Plasmas ---
    for (let i = 0; i < state.plasmas.length; i++) {
      const plasma = state.plasmas[i];
      const pg = this.plasmaGroups[i];
      const peg = this.plasmaExplodeGroups[i];

      if (plasma.status === PTMOVE) {
        const dx = plasma.x - playerX;
        const dz = plasma.y - playerZ;
        if (Math.abs(dx) > halfRange || Math.abs(dz) > halfRange) {
          pg.visible = false;
          peg.visible = false;
          continue;
        }
        pg.visible = true;
        peg.visible = false;
        pg.position.set(plasma.x, 15, plasma.y);
      } else if (plasma.status === PTEXPLODE) {
        pg.visible = false;
        const dx = plasma.x - playerX;
        const dz = plasma.y - playerZ;
        if (Math.abs(dx) > halfRange || Math.abs(dz) > halfRange) {
          peg.visible = false;
          continue;
        }
        peg.visible = true;
        peg.position.set(plasma.x, 15, plasma.y);
      } else {
        pg.visible = false;
        peg.visible = false;
      }
    }

    // --- Phasers ---
    for (let i = 0; i < state.phasers.length; i++) {
      const phaser = state.phasers[i];
      const pg = this.phaserGroups[i];

      if (!phaser.fuseStart || now - phaser.fuseStart > PHASER_DISPLAY_MS) {
        pg.visible = false;
        continue;
      }

      if (phaser.number < 0 || phaser.number >= MAXPLAYER) {
        pg.visible = false;
        continue;
      }

      const owner = state.players[phaser.number];
      if (!owner || owner.status !== PALIVE) {
        pg.visible = false;
        continue;
      }

      // Source position
      const sx = owner.x;
      const sz = owner.y;

      // Target position
      let tx: number, tz: number;
      if (phaser.status === PHHIT) {
        const target = phaser.target >= 0 && phaser.target < MAXPLAYER ? state.players[phaser.target] : null;
        if (!target) { pg.visible = false; continue; }
        tx = target.x;
        tz = target.y;
      } else if (phaser.status === PHHIT2) {
        tx = phaser.x;
        tz = phaser.y;
      } else {
        const angle = (phaser.dir / 256) * TWO_PI;
        tx = sx + Math.sin(angle) * 6000;
        tz = sz - Math.cos(angle) * 6000;
      }

      // Position beam between source and target
      const midX = (sx + tx) / 2;
      const midZ = (sz + tz) / 2;
      const dx = tx - sx;
      const dz = tz - sz;
      const length = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dx, dz);

      pg.visible = true;
      pg.position.set(midX, 10, midZ);
      pg.rotation.set(0, angle, 0);

      // Scale cylinder height to beam length
      pg.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.scale.set(1, length, 1);
          child.rotation.x = Math.PI / 2;
          child.position.set(0, 0, 0);
        }
      });

      // Fade
      const elapsed = now - phaser.fuseStart;
      const t = elapsed / PHASER_DISPLAY_MS;
      const intensity = t < 0.1 ? 1.0 : 1.0 - (t - 0.1) / 0.9;
      const alpha = intensity * intensity;

      pg.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshBasicMaterial;
          const baseOpacity = child.name === 'outer' ? 0.1 : child.name === 'mid' ? 0.35 : 0.8;
          mat.opacity = baseOpacity * alpha;
        }
      });
    }

    // --- Tractor / Pressor beams ---
    let tractorIdx = 0;
    for (const player of state.players) {
      if (player.status !== PALIVE) continue;
      if (!(player.flags & (PFTRACT | PFPRESS))) continue;
      const target = player.tractTarget;
      if (target < 0 || target >= MAXPLAYER) continue;
      const tp = state.players[target];
      if (tp.status !== PALIVE) continue;

      if (tractorIdx >= this.tractorGroups.length) break;
      const tg = this.tractorGroups[tractorIdx++];
      tg.visible = true;

      const sx = player.x;
      const sz = player.y;
      const tx = tp.x;
      const tz = tp.y;

      const midX = (sx + tx) / 2;
      const midZ = (sz + tz) / 2;
      const dx = tx - sx;
      const dz = tz - sz;
      const length = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dx, dz);

      tg.position.set(midX, 20, midZ);
      tg.rotation.set(0, angle, 0);

      const isPressor = !!(player.flags & PFPRESS);
      const beamColor = isPressor ? 0xff0000 : 0x00ff00;

      tg.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.scale.set(1, length, 1);
          child.rotation.x = Math.PI / 2;
          child.position.set(0, 0, 0);
          (child.material as THREE.MeshBasicMaterial).color.setHex(beamColor);
        }
      });
    }

    // Hide unused tractor beams
    for (let i = tractorIdx; i < this.tractorGroups.length; i++) {
      this.tractorGroups[i].visible = false;
    }
  }
}
