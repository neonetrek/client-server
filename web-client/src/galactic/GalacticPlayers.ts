/**
 * Galactic map player markers — flat directional triangles with team colors,
 * own player highlighted in white with a pulsing halo ring.
 * CSS2D labels show team letter + number and ship type.
 */

import * as THREE from 'three';
import { Player } from '../state';
import {
  PALIVE, PFCLOAK, PFORBIT,
  TEAM_COLORS, TEAM_LETTERS, SHIP_SHORT, IND,
  MAXPLAYER,
} from '../constants';
import { ShipLabelData } from '../LabelRenderer';

const MARKER_RADIUS = 800;
const MARKER_HEIGHT = 20;
const MARKER_Y = 10;
const HALO_RADIUS = 1200;
const TWO_PI = Math.PI * 2;

interface PlayerVisual {
  group: THREE.Group;
  cone: THREE.Mesh;
  halo: THREE.Mesh;
  lastColor: string;
  lastLabelText: string;
  lastLabelColor: string;
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

      this.group.add(g);
      this.visuals.push({ group: g, cone, halo, lastColor: '', lastLabelText: '', lastLabelColor: '' });
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

      // Color — only update material when color string changes
      const isMe = player.number === myNumber;
      const color = isMe ? '#ffffff' : (TEAM_COLORS[player.team] ?? TEAM_COLORS[IND]);
      if (color !== vis.lastColor) {
        (vis.cone.material as THREE.MeshBasicMaterial).color.set(color);
        vis.lastColor = color;
      }

      // Halo for own player
      vis.halo.visible = isMe;
      if (isMe) {
        const pulse = 0.3 + Math.sin(now * 0.004) * 0.15;
        (vis.halo.material as THREE.MeshBasicMaterial).opacity = pulse;
      }

      // Label text computation — stored for getLabelData()
      const tc = isMe ? '#ffffff' : (TEAM_COLORS[player.team] ?? '#888');
      const teamLetter = TEAM_LETTERS[player.team] ?? '?';
      const shipCode = SHIP_SHORT[player.shipType] ?? '??';
      vis.lastLabelText = `${teamLetter}${player.number}\n${shipCode}`;
      vis.lastLabelColor = tc;
    }
  }

  /** Return label data for all visible players (for canvas overlay rendering) */
  getLabelData(): ShipLabelData[] {
    const result: ShipLabelData[] = [];
    for (const vis of this.visuals) {
      if (!vis.group.visible || !vis.lastLabelText) continue;
      const pos = new THREE.Vector3(
        vis.group.position.x,
        vis.group.position.y - 10,
        vis.group.position.z + MARKER_RADIUS + 800,
      );
      result.push({ worldPos: pos, text: vis.lastLabelText, color: vis.lastLabelColor });
    }
    return result;
  }
}
