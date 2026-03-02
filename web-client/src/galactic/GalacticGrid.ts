/**
 * Galactic grid — quadrant border lines, galaxy boundary, and team corner labels.
 * Uses thin mesh planes instead of LineSegments for visible width.
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GWIDTH, TEAM_COLORS, FED, ROM, KLI, ORI } from '../constants';

const HALF = GWIDTH / 2;
const LINE_Y = 2;
const CROSS_THICKNESS = 800;  // game units — ~2.4px at 300px canvas
const EDGE_THICKNESS = 600;
const CROSS_COLOR = 0x3a5a3a;
const EDGE_COLOR = 0x2a4a2a;

function makeLine(
  cx: number, cz: number,
  lengthX: number, lengthZ: number,
  color: number, opacity: number,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(lengthX, lengthZ);
  geo.rotateX(-Math.PI / 2); // lay flat on XZ plane
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, LINE_Y, cz);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return mesh;
}

export class GalacticGrid {
  readonly group: THREE.Group;

  constructor() {
    this.group = new THREE.Group();

    // Quadrant cross — vertical center line
    this.group.add(makeLine(HALF, HALF, CROSS_THICKNESS, GWIDTH, CROSS_COLOR, 0.9));
    // Quadrant cross — horizontal center line
    this.group.add(makeLine(HALF, HALF, GWIDTH, CROSS_THICKNESS, CROSS_COLOR, 0.9));

    // Galaxy boundary — four edge strips
    this.group.add(makeLine(HALF, 0, GWIDTH, EDGE_THICKNESS, EDGE_COLOR, 0.7));           // top
    this.group.add(makeLine(HALF, GWIDTH, GWIDTH, EDGE_THICKNESS, EDGE_COLOR, 0.7));      // bottom
    this.group.add(makeLine(0, HALF, EDGE_THICKNESS, GWIDTH, EDGE_COLOR, 0.7));            // left
    this.group.add(makeLine(GWIDTH, HALF, EDGE_THICKNESS, GWIDTH, EDGE_COLOR, 0.7));       // right

    // Team labels in corners (CSS2D)
    const labels: [string, number, number, number][] = [
      ['ROM', ROM, 4000, 4000],           // top-left
      ['KLI', KLI, GWIDTH - 4000, 4000],  // top-right
      ['FED', FED, 4000, GWIDTH - 4000],  // bottom-left
      ['ORI', ORI, GWIDTH - 4000, GWIDTH - 4000], // bottom-right
    ];

    for (const [name, team, x, z] of labels) {
      const div = document.createElement('div');
      div.style.cssText = `font: bold 14px monospace; color: ${TEAM_COLORS[team]}; text-shadow: 0 0 6px ${TEAM_COLORS[team]}44; pointer-events: none; opacity: 0.7;`;
      div.textContent = name;
      const obj = new CSS2DObject(div);
      obj.position.set(x, 0, z);
      this.group.add(obj);
    }
  }
}
