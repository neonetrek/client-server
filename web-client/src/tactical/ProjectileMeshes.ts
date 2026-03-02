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
// Cached-ref interfaces (avoid traverse/getObjectByName per frame)
// ============================================================

interface TorpRefs {
  group: THREE.Group;
  core: THREE.Mesh;
  halo: THREE.Mesh;
  light: THREE.PointLight;
  ghosts: THREE.Mesh[];
}

interface ExplosionRefs {
  group: THREE.Group;
  blast: THREE.Mesh;
}

interface BeamRefs {
  group: THREE.Group;
  outer: THREE.Mesh;
  mid: THREE.Mesh;
  core: THREE.Mesh;
}

// ============================================================
// Torpedo visuals
// ============================================================

function createTorpGroup(): TorpRefs {
  const g = new THREE.Group();

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(TORP_RADIUS, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  g.add(core);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(TORP_RADIUS * 3, 8, 6),
    new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
    })
  );
  g.add(halo);

  const light = new THREE.PointLight(0xff8800, 0.3, 800);
  g.add(light);

  const ghosts: THREE.Mesh[] = [];
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
    g.add(ghost);
    ghosts.push(ghost);
  }

  return { group: g, core, halo, light, ghosts };
}

function createExplosionGroup(): ExplosionRefs {
  const g = new THREE.Group();

  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(TORP_RADIUS * 4, 8, 6),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    })
  );
  g.add(blast);

  return { group: g, blast };
}

// ============================================================
// Phaser / Tractor beam visuals
// ============================================================

function createBeamGroup(radii: [number, number, number], opacities: [number, number, number], color: number): BeamRefs {
  const g = new THREE.Group();
  const meshes: THREE.Mesh[] = [];

  for (let i = 0; i < 3; i++) {
    const geo = new THREE.CylinderGeometry(radii[i], radii[i], 1, 6, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: opacities[i],
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    g.add(mesh);
    meshes.push(mesh);
  }

  return { group: g, outer: meshes[0], mid: meshes[1], core: meshes[2] };
}

// ============================================================
// Main projectile manager
// ============================================================

export class ProjectileMeshes {
  readonly group: THREE.Group;

  // Torpedo pools (cached refs)
  private torpRefs: TorpRefs[] = [];
  private torpExplodeRefs: ExplosionRefs[] = [];

  // Plasma pools
  private plasmaRefs: TorpRefs[] = [];
  private plasmaExplodeRefs: ExplosionRefs[] = [];

  // Phaser beams (cached refs)
  private phaserRefs: BeamRefs[] = [];

  // Tractor beams (cached refs)
  private tractorRefs: BeamRefs[] = [];

  // Base opacities for phaser layers
  private static readonly PHASER_OPACITIES: [number, number, number] = [0.1, 0.35, 0.8];

  constructor() {
    this.group = new THREE.Group();

    // Pre-allocate torpedo visuals (MAXPLAYER * MAXTORP = 256)
    const torpCount = MAXPLAYER * MAXTORP;
    for (let i = 0; i < torpCount; i++) {
      const refs = createTorpGroup();
      refs.group.visible = false;
      this.torpRefs.push(refs);
      this.group.add(refs.group);

      const erefs = createExplosionGroup();
      erefs.group.visible = false;
      this.torpExplodeRefs.push(erefs);
      this.group.add(erefs.group);
    }

    // Pre-allocate plasma visuals (MAXPLAYER)
    for (let i = 0; i < MAXPLAYER; i++) {
      const refs = createTorpGroup();
      refs.group.visible = false;
      // Make plasma pink/magenta and larger
      refs.core.material = (refs.core.material as THREE.MeshBasicMaterial).clone();
      (refs.core.material as THREE.MeshBasicMaterial).color.setHex(0xff00ff);
      (refs.halo.material as THREE.MeshBasicMaterial).color.setHex(0xff00ff);
      refs.light.color.setHex(0xff00ff);
      for (const ghost of refs.ghosts) {
        (ghost.material as THREE.MeshBasicMaterial).color.setHex(0xff00ff);
      }
      refs.group.scale.set(2, 2, 2);
      this.plasmaRefs.push(refs);
      this.group.add(refs.group);

      const erefs = createExplosionGroup();
      erefs.group.visible = false;
      (erefs.blast.material as THREE.MeshBasicMaterial).color.setHex(0xff44ff);
      erefs.group.scale.set(2, 2, 2);
      this.plasmaExplodeRefs.push(erefs);
      this.group.add(erefs.group);
    }

    // Pre-allocate phaser beams (one per player)
    for (let i = 0; i < MAXPLAYER; i++) {
      const refs = createBeamGroup([40, 20, 8], [0.1, 0.35, 0.8], 0xffa030);
      refs.group.visible = false;
      this.phaserRefs.push(refs);
      this.group.add(refs.group);
    }

    // Pre-allocate tractor beams (one per player)
    for (let i = 0; i < MAXPLAYER; i++) {
      const refs = createBeamGroup([25, 12, 5], [0.08, 0.25, 0.6], 0x00ff00);
      refs.group.visible = false;
      this.tractorRefs.push(refs);
      this.group.add(refs.group);
    }
  }

  /** Update all projectile visuals for the current frame */
  update(state: GameState, playerX: number, playerZ: number, tacRange: number) {
    const now = Date.now();
    const halfRange = tacRange / 2 + 500;

    // --- Torpedoes ---
    for (let i = 0; i < state.torps.length; i++) {
      const torp = state.torps[i];
      const refs = this.torpRefs[i];
      const erefs = this.torpExplodeRefs[i];

      if (torp.status === TMOVE) {
        const dx = torp.x - playerX;
        const dz = torp.y - playerZ;
        if (Math.abs(dx) > halfRange || Math.abs(dz) > halfRange) {
          refs.group.visible = false;
          erefs.group.visible = false;
          continue;
        }

        refs.group.visible = true;
        erefs.group.visible = false;
        refs.group.position.set(torp.x, 15, torp.y);

        // Set color based on owner
        const owner = torp.owner >= 0 && torp.owner < MAXPLAYER ? state.players[torp.owner] : null;
        const isOwn = owner?.number === state.myNumber;
        const teamColor = TEAM_COLORS[owner?.team ?? IND] ?? '#888888';
        const color = isOwn ? 0xffaa3c : new THREE.Color(teamColor).getHex();

        // Update colors via cached refs
        (refs.halo.material as THREE.MeshBasicMaterial).color.setHex(color);
        refs.light.color.setHex(color);

        // Pulsing halo
        const phase = now * 0.008 + torp.number;
        const pulse = Math.sin(phase) * 0.3 + 1.0;
        refs.halo.scale.setScalar(pulse);

        // Trail ghosts — position behind torpedo direction
        const dirRad = (torp.dir / 256) * TWO_PI;
        for (let j = 0; j < refs.ghosts.length; j++) {
          const dist = (j + 1) * TORP_RADIUS * 3;
          refs.ghosts[j].position.set(
            Math.sin(dirRad) * dist,
            0,
            Math.cos(dirRad) * dist
          );
        }

      } else if (torp.status === TEXPLODE) {
        refs.group.visible = false;
        const dx = torp.x - playerX;
        const dz = torp.y - playerZ;
        if (Math.abs(dx) > halfRange || Math.abs(dz) > halfRange) {
          erefs.group.visible = false;
          continue;
        }
        erefs.group.visible = true;
        erefs.group.position.set(torp.x, 15, torp.y);

        // Static burst via cached ref
        (erefs.blast.material as THREE.MeshBasicMaterial).opacity = 0.6;
        erefs.blast.scale.setScalar(2);
      } else {
        refs.group.visible = false;
        erefs.group.visible = false;
      }
    }

    // --- Plasmas ---
    for (let i = 0; i < state.plasmas.length; i++) {
      const plasma = state.plasmas[i];
      const refs = this.plasmaRefs[i];
      const erefs = this.plasmaExplodeRefs[i];

      if (plasma.status === PTMOVE) {
        const dx = plasma.x - playerX;
        const dz = plasma.y - playerZ;
        if (Math.abs(dx) > halfRange || Math.abs(dz) > halfRange) {
          refs.group.visible = false;
          erefs.group.visible = false;
          continue;
        }
        refs.group.visible = true;
        erefs.group.visible = false;
        refs.group.position.set(plasma.x, 15, plasma.y);
      } else if (plasma.status === PTEXPLODE) {
        refs.group.visible = false;
        const dx = plasma.x - playerX;
        const dz = plasma.y - playerZ;
        if (Math.abs(dx) > halfRange || Math.abs(dz) > halfRange) {
          erefs.group.visible = false;
          continue;
        }
        erefs.group.visible = true;
        erefs.group.position.set(plasma.x, 15, plasma.y);
      } else {
        refs.group.visible = false;
        erefs.group.visible = false;
      }
    }

    // --- Phasers ---
    for (let i = 0; i < state.phasers.length; i++) {
      const phaser = state.phasers[i];
      const refs = this.phaserRefs[i];

      if (!phaser.fuseStart || now - phaser.fuseStart > PHASER_DISPLAY_MS) {
        refs.group.visible = false;
        continue;
      }

      if (phaser.number < 0 || phaser.number >= MAXPLAYER) {
        refs.group.visible = false;
        continue;
      }

      const owner = state.players[phaser.number];
      if (!owner || owner.status !== PALIVE) {
        refs.group.visible = false;
        continue;
      }

      // Source position
      const sx = owner.x;
      const sz = owner.y;

      // Target position
      let tx: number, tz: number;
      if (phaser.status === PHHIT) {
        const target = phaser.target >= 0 && phaser.target < MAXPLAYER ? state.players[phaser.target] : null;
        if (!target) { refs.group.visible = false; continue; }
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

      refs.group.visible = true;
      refs.group.position.set(midX, 10, midZ);
      refs.group.rotation.set(0, angle, 0);

      // Scale cylinders via cached refs (no traverse)
      for (const mesh of [refs.outer, refs.mid, refs.core]) {
        mesh.scale.set(1, length, 1);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(0, 0, 0);
      }

      // Fade via cached refs (no traverse)
      const elapsed = now - phaser.fuseStart;
      const t = elapsed / PHASER_DISPLAY_MS;
      const intensity = t < 0.1 ? 1.0 : 1.0 - (t - 0.1) / 0.9;
      const alpha = intensity * intensity;

      (refs.outer.material as THREE.MeshBasicMaterial).opacity = ProjectileMeshes.PHASER_OPACITIES[0] * alpha;
      (refs.mid.material as THREE.MeshBasicMaterial).opacity = ProjectileMeshes.PHASER_OPACITIES[1] * alpha;
      (refs.core.material as THREE.MeshBasicMaterial).opacity = ProjectileMeshes.PHASER_OPACITIES[2] * alpha;
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

      if (tractorIdx >= this.tractorRefs.length) break;
      const refs = this.tractorRefs[tractorIdx++];
      refs.group.visible = true;

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

      refs.group.position.set(midX, 20, midZ);
      refs.group.rotation.set(0, angle, 0);

      const isPressor = !!(player.flags & PFPRESS);
      const beamColor = isPressor ? 0xff0000 : 0x00ff00;

      // Update all 3 layers via cached refs (no traverse)
      for (const mesh of [refs.outer, refs.mid, refs.core]) {
        mesh.scale.set(1, length, 1);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(0, 0, 0);
        (mesh.material as THREE.MeshBasicMaterial).color.setHex(beamColor);
      }
    }

    // Hide unused tractor beams
    for (let i = tractorIdx; i < this.tractorRefs.length; i++) {
      this.tractorRefs[i].group.visible = false;
    }
  }
}
