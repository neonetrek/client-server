/**
 * 3-layer particle starfield at varying depths.
 * Each layer wraps around the camera position for infinite scrolling.
 */

import * as THREE from 'three';

interface StarfieldLayer {
  points: THREE.Points;
  positions: Float32Array;
  basePositions: Float32Array;
  depth: number;
  spread: number;
}

export class Starfield3D {
  readonly group: THREE.Group;
  private layers: StarfieldLayer[] = [];

  constructor() {
    this.group = new THREE.Group();

    const layerDefs = [
      { count: 200, depth: -5000, color: 0x555555, size: 15, spread: 60000 },
      { count: 120, depth: -2000, color: 0x888888, size: 12, spread: 50000 },
      { count: 60,  depth: -500,  color: 0xbbbbbb, size: 10, spread: 40000 },
    ];

    // Seeded PRNG for deterministic positions
    let seed = 42;
    const rand = () => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; };

    for (const def of layerDefs) {
      const positions = new Float32Array(def.count * 3);
      const basePositions = new Float32Array(def.count * 3);

      for (let i = 0; i < def.count; i++) {
        const x = (rand() - 0.5) * def.spread;
        const z = (rand() - 0.5) * def.spread;
        positions[i * 3] = x;
        positions[i * 3 + 1] = def.depth;
        positions[i * 3 + 2] = z;
        basePositions[i * 3] = x;
        basePositions[i * 3 + 1] = def.depth;
        basePositions[i * 3 + 2] = z;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

      const material = new THREE.PointsMaterial({
        color: def.color,
        size: def.size,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.8,
      });

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;

      this.group.add(points);
      this.layers.push({
        points,
        positions,
        basePositions,
        depth: def.depth,
        spread: def.spread,
      });
    }
  }

  /** Recenter particle disc around camera XZ for infinite wrapping */
  update(cameraX: number, cameraZ: number) {
    for (const layer of this.layers) {
      const halfSpread = layer.spread / 2;
      const posAttr = layer.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;

      for (let i = 0; i < arr.length / 3; i++) {
        let x = layer.basePositions[i * 3] + cameraX;
        let z = layer.basePositions[i * 3 + 2] + cameraZ;

        // Wrap around camera
        x = ((x - cameraX + halfSpread) % layer.spread + layer.spread) % layer.spread - halfSpread + cameraX;
        z = ((z - cameraZ + halfSpread) % layer.spread + layer.spread) % layer.spread - halfSpread + cameraZ;

        arr[i * 3] = x;
        arr[i * 3 + 2] = z;
      }

      posAttr.needsUpdate = true;
    }
  }
}
