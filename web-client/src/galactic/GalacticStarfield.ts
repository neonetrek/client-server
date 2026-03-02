/**
 * Static starfield for the galactic map background.
 * ~120 faint particles spread across the galaxy at Y=-50.
 * No update needed — purely decorative.
 */

import * as THREE from 'three';
import { GWIDTH } from '../constants';

const STAR_COUNT = 120;
const STAR_Y = -50;

export class GalacticStarfield {
  readonly points: THREE.Points;

  constructor() {
    // Seeded PRNG (same pattern as Starfield3D.ts)
    let seed = 7777;
    const rand = () => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; };

    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);

    for (let i = 0; i < STAR_COUNT; i++) {
      positions[i * 3] = rand() * GWIDTH;
      positions[i * 3 + 1] = STAR_Y;
      positions[i * 3 + 2] = rand() * GWIDTH;

      // Faint white/blue/yellow tints
      const tint = rand();
      const brightness = 0.3 + rand() * 0.4;
      if (tint < 0.33) {
        colors[i * 3] = brightness;
        colors[i * 3 + 1] = brightness;
        colors[i * 3 + 2] = brightness * 1.2;
      } else if (tint < 0.66) {
        colors[i * 3] = brightness * 1.1;
        colors[i * 3 + 1] = brightness * 1.1;
        colors[i * 3 + 2] = brightness * 0.8;
      } else {
        colors[i * 3] = brightness;
        colors[i * 3 + 1] = brightness;
        colors[i * 3 + 2] = brightness;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.5,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      depthTest: true,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -100;
  }
}
