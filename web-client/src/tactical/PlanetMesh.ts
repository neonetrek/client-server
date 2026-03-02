/**
 * 3D planet spheres with atmosphere halos, lat/lon grid lines, and CSS2D labels.
 * 40 planet slots, all persistent. Show/hide based on tactical range.
 * Each planet rotates on a unique deterministic tilt axis.
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Planet } from '../state';
import { TEAM_COLORS, PLREPAIR, PLFUEL, PLAGRI, PLHOME, IND, MAXPLANETS } from '../constants';

const PLANET_RADIUS = 600;
const PLANET_Y = 5; // layer height
const GOLDEN_ANGLE = 2.39996; // golden angle in radians for deterministic spread
const GRID_SEGMENTS = 64; // points per circle

function hexToRgb(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

/** Build shared lat/lon grid geometry (unit sphere, scaled by PLANET_RADIUS) */
function buildGridGeometry(): THREE.BufferGeometry {
  const points: number[] = [];

  // 5 latitude circles at -60°, -30°, 0°, 30°, 60°
  for (let lat = -60; lat <= 60; lat += 30) {
    const phi = (90 - lat) * Math.PI / 180;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    for (let j = 0; j <= GRID_SEGMENTS; j++) {
      const theta = (j / GRID_SEGMENTS) * Math.PI * 2;
      points.push(
        PLANET_RADIUS * sinPhi * Math.cos(theta),
        PLANET_RADIUS * cosPhi,
        PLANET_RADIUS * sinPhi * Math.sin(theta),
      );
    }
  }

  // 6 longitude great circles at 0°, 30°, 60°, 90°, 120°, 150°
  for (let lon = 0; lon < 180; lon += 30) {
    const thetaBase = lon * Math.PI / 180;
    for (let j = 0; j <= GRID_SEGMENTS; j++) {
      const phi = (j / GRID_SEGMENTS) * Math.PI;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      // Each great circle goes full 360° — use both sides of the plane
      points.push(
        PLANET_RADIUS * sinPhi * Math.cos(thetaBase),
        PLANET_RADIUS * cosPhi,
        PLANET_RADIUS * sinPhi * Math.sin(thetaBase),
      );
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geo;
}

interface PlanetVisual {
  group: THREE.Group;
  innerGroup: THREE.Group; // rotates: contains sphere + grid
  sphere: THREE.Mesh;
  gridLines: THREE.LineLoop;
  homeRing: THREE.Mesh;
  label: CSS2DObject;
  labelDiv: HTMLDivElement;
}

export class PlanetMeshes {
  readonly group: THREE.Group;
  private visuals: PlanetVisual[] = [];

  // Shared geometries
  private sphereGeo: THREE.SphereGeometry;
  private ringGeo: THREE.TorusGeometry;
  private gridGeo: THREE.BufferGeometry;

  constructor() {
    this.group = new THREE.Group();
    this.sphereGeo = new THREE.SphereGeometry(PLANET_RADIUS, 12, 8);
    this.ringGeo = new THREE.TorusGeometry(PLANET_RADIUS * 1.15, 15, 4, 24);
    this.gridGeo = buildGridGeometry();

    for (let i = 0; i < MAXPLANETS; i++) {
      const g = new THREE.Group();
      g.visible = false;

      // Inner group rotates (sphere + grid lines)
      const innerGroup = new THREE.Group();
      const tiltX = Math.sin(i * GOLDEN_ANGLE) * 0.4;
      const tiltZ = Math.cos(i * GOLDEN_ANGLE) * 0.4;
      innerGroup.rotation.x = tiltX;
      innerGroup.rotation.z = tiltZ;

      // Planet sphere
      const sphereMat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        emissive: 0x888888,
        emissiveIntensity: 0.1,
        metalness: 0.3,
        roughness: 0.7,
        depthWrite: false, // Let ships render on top of planets
      });
      const sphere = new THREE.Mesh(this.sphereGeo, sphereMat);
      innerGroup.add(sphere);

      // Grid lines (lat/lon wireframe)
      const gridMat = new THREE.LineBasicMaterial({
        color: 0x888888,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
      });
      const gridLines = new THREE.LineLoop(this.gridGeo, gridMat);
      innerGroup.add(gridLines);

      g.add(innerGroup);

      // Home planet ring (outer group — doesn't rotate)
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
      });
      const homeRing = new THREE.Mesh(this.ringGeo, ringMat);
      homeRing.rotation.x = Math.PI / 2;
      homeRing.visible = false;
      g.add(homeRing);

      // CSS2D label (outer group — doesn't rotate)
      const labelDiv = document.createElement('div');
      labelDiv.style.cssText = 'font: 11px monospace; color: #888; text-align: center; pointer-events: none; text-shadow: 0 0 3px #000;';
      const label = new CSS2DObject(labelDiv);
      label.position.set(0, -PLANET_RADIUS - 80, 0);
      g.add(label);

      this.group.add(g);
      this.visuals.push({ group: g, innerGroup, sphere, gridLines, homeRing, label, labelDiv });
    }
  }

  /** Sync planet visuals with game state */
  update(planets: Planet[], playerX: number, playerZ: number, tacRange: number) {
    const halfRange = tacRange / 2 + PLANET_RADIUS * 2;

    for (let i = 0; i < MAXPLANETS; i++) {
      const planet = planets[i];
      const vis = this.visuals[i];

      if (!planet || !planet.name) {
        vis.group.visible = false;
        continue;
      }

      // Map game (x,y) to Three.js (x, PLANET_Y, z)
      const wx = planet.x;
      const wz = planet.y;

      // Visibility check (within tactical range + buffer)
      const dx = wx - playerX;
      const dz = wz - playerZ;
      if (Math.abs(dx) > halfRange || Math.abs(dz) > halfRange) {
        vis.group.visible = false;
        continue;
      }

      vis.group.visible = true;
      vis.group.position.set(wx, PLANET_Y, wz);

      // Rotate inner group (slow spin on tilted axis)
      vis.innerGroup.rotation.y += 0.003;

      // Update color based on owner
      const color = hexToRgb(TEAM_COLORS[planet.owner] ?? TEAM_COLORS[IND]);
      (vis.sphere.material as THREE.MeshStandardMaterial).color.copy(color);
      (vis.sphere.material as THREE.MeshStandardMaterial).emissive.copy(color);
      (vis.gridLines.material as THREE.LineBasicMaterial).color.copy(color);

      // Home planet ring
      vis.homeRing.visible = !!(planet.flags & PLHOME);

      // Label text
      let text = planet.name.substring(0, 3);
      if (planet.armies > 0) text += `\n${planet.armies}`;
      let resources = '';
      if (planet.flags & PLREPAIR) resources += 'R';
      if (planet.flags & PLFUEL) resources += 'F';
      if (planet.flags & PLAGRI) resources += 'A';
      if (resources) text += `\n${resources}`;

      const hexColor = TEAM_COLORS[planet.owner] ?? '#888888';
      vis.labelDiv.style.color = hexColor;
      vis.labelDiv.textContent = text;
      vis.labelDiv.style.whiteSpace = 'pre-line';
    }
  }
}
