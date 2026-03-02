/**
 * Galactic map player markers — flat directional triangles with team colors,
 * own player highlighted in white with a pulsing halo ring.
 * CSS2D labels show team letter + number and ship type.
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Player } from '../state';
import {
  PALIVE, PFCLOAK, PFORBIT,
  TEAM_COLORS, TEAM_LETTERS, SHIP_SHORT, IND,
  MAXPLAYER,
} from '../constants';

const MARKER_RADIUS = 800;
const MARKER_HEIGHT = 20;
const MARKER_Y = 10;
const HALO_RADIUS = 1200;
const TWO_PI = Math.PI * 2;

interface PlayerVisual {
  group: THREE.Group;
  cone: THREE.Mesh;
  halo: THREE.Mesh;
  label: CSS2DObject;
  labelDiv: HTMLDivElement;
}

export class GalacticPlayers {
  readonly group: THREE.Group;
  private visuals: PlayerVisual[] = [];
  private coneGeo: THREE.ConeGeometry;
  private haloGeo: THREE.TorusGeometry;

  constructor() {
    this.group = new THREE.Group();
    // Cone pointing toward -Z (forward) when rotation.y = 0
    this.coneGeo = new THREE.ConeGeometry(MARKER_RADIUS, MARKER_HEIGHT, 3);
    // Rotate geometry so the cone tip points toward -Z
    this.coneGeo.rotateX(Math.PI / 2);
    this.coneGeo.rotateZ(Math.PI); // tip forward

    this.haloGeo = new THREE.TorusGeometry(HALO_RADIUS, 60, 4, 16);

    for (let i = 0; i < MAXPLAYER; i++) {
      const g = new THREE.Group();
      g.visible = false;

      // Directional triangle
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0x888888,
        transparent: true,
        opacity: 0.9,
      });
      const cone = new THREE.Mesh(this.coneGeo, coneMat);
      cone.frustumCulled = false;
      g.add(cone);

      // Pulsing halo ring (own player only)
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.4,
      });
      const halo = new THREE.Mesh(this.haloGeo, haloMat);
      halo.rotation.x = Math.PI / 2;
      halo.visible = false;
      halo.frustumCulled = false;
      g.add(halo);

      // CSS2D label — small font, below the marker
      const labelDiv = document.createElement('div');
      labelDiv.style.cssText = 'font: 8px monospace; text-align: center; pointer-events: none; text-shadow: 0 0 3px #000; white-space: pre-line; line-height: 1.2;';
      const label = new CSS2DObject(labelDiv);
      label.position.set(0, -10, MARKER_RADIUS + 800);
      g.add(label);

      this.group.add(g);
      this.visuals.push({ group: g, cone, halo, label, labelDiv });
    }
  }

  update(players: Player[], myNumber: number) {
    const now = Date.now();

    for (let i = 0; i < MAXPLAYER; i++) {
      const player = players[i];
      const vis = this.visuals[i];

      if (player.status !== PALIVE) {
        vis.group.visible = false;
        continue;
      }

      // Hide cloaked enemies
      if ((player.flags & PFCLOAK) && player.number !== myNumber) {
        vis.group.visible = false;
        continue;
      }

      vis.group.visible = true;

      // Position — offset orbiting ships slightly
      let px = player.x;
      const pz = player.y;
      if (player.flags & PFORBIT) {
        const offset = ((player.number % 4) - 1.5) * 1500;
        px += offset;
      }
      vis.group.position.set(px, MARKER_Y, pz);

      // Rotation from player direction
      const angle = (player.dir / 256) * TWO_PI;
      vis.group.rotation.y = -angle;

      // Color
      const isMe = player.number === myNumber;
      const color = isMe ? '#ffffff' : (TEAM_COLORS[player.team] ?? TEAM_COLORS[IND]);
      (vis.cone.material as THREE.MeshBasicMaterial).color.set(color);

      // Halo for own player
      vis.halo.visible = isMe;
      if (isMe) {
        const pulse = 0.3 + Math.sin(now * 0.004) * 0.15;
        (vis.halo.material as THREE.MeshBasicMaterial).opacity = pulse;
      }

      // Label
      const tc = isMe ? '#ffffff' : (TEAM_COLORS[player.team] ?? '#888');
      const teamLetter = TEAM_LETTERS[player.team] ?? '?';
      const shipCode = SHIP_SHORT[player.shipType] ?? '??';
      vis.labelDiv.style.color = tc;
      vis.labelDiv.textContent = `${teamLetter}${player.number}\n${shipCode}`;
    }
  }
}
