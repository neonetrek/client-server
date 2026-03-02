/**
 * 3D grid plane at y=0 with 5000-unit spacing.
 * Repositioned each frame to align with grid boundaries near camera.
 */

import * as THREE from 'three';
import { GWIDTH } from '../constants';

const GRID_SPACING = 5000;
const GRID_COLOR = 0x111111;

export class GridPlane {
  readonly mesh: THREE.LineSegments;

  constructor() {
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];

    // Lines spanning entire galaxy + buffer
    const extent = GWIDTH + GRID_SPACING * 2;
    for (let v = -GRID_SPACING; v <= GWIDTH + GRID_SPACING; v += GRID_SPACING) {
      // X-parallel lines (along X axis)
      positions.push(-GRID_SPACING, 0, v, extent, 0, v);
      // Z-parallel lines (along Z axis)
      positions.push(v, 0, -GRID_SPACING, v, 0, extent);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: GRID_COLOR,
      transparent: true,
      opacity: 0.6,
    });

    this.mesh = new THREE.LineSegments(geometry, material);
    this.mesh.frustumCulled = false;
  }
}
