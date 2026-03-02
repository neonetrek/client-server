/**
 * 3D planet spheres with procedural textures, lat/lon grid lines, and CSS2D labels.
 * 40 planet slots, all persistent. Show/hide based on tactical range.
 * Each planet rotates on a unique deterministic tilt axis.
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Planet } from '../state';
import { TEAM_COLORS, PLREPAIR, PLFUEL, PLAGRI, PLHOME, IND, MAXPLANETS } from '../constants';
import { PlanetTextureManager } from './PlanetTextures';

const PLANET_RADIUS = 600;
const PLANET_Y = 5; // layer height
const GOLDEN_ANGLE = 2.39996; // golden angle in radians for deterministic spread
const GRID_SEGMENTS = 64; // points per circle

const WHITE = new THREE.Color(0xffffff);

function hexToRgb(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

// Inline SVG icons for planet resources (14x14, monochrome via currentColor)
const SVG_REPAIR = `<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" style="vertical-align:-3px"><line x1="7" y1="1" x2="7" y2="3" stroke-width="1.2"/><circle cx="7" cy="1" r="0.8" fill="currentColor" stroke="none"/><rect x="3" y="3" width="8" height="6.5" rx="1" stroke-width="1"/><rect x="5" y="5" width="1.3" height="1.3" rx="0.3" fill="currentColor" stroke="none"/><rect x="7.7" y="5" width="1.3" height="1.3" rx="0.3" fill="currentColor" stroke="none"/><line x1="5" y1="8" x2="9" y2="8" stroke-width="0.8"/><line x1="4.5" y1="10.5" x2="3" y2="13" stroke-width="1"/><line x1="9.5" y1="10.5" x2="11" y2="13" stroke-width="1"/></svg>`;

const SVG_FUEL = `<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" style="vertical-align:-3px"><path d="M7 1L11.5 7L7 13L2.5 7Z" stroke-width="1"/><line x1="2.5" y1="7" x2="11.5" y2="7" stroke-width="0.7"/><line x1="4.8" y1="4" x2="9.2" y2="4" stroke-width="0.7"/><line x1="4.8" y1="10" x2="9.2" y2="10" stroke-width="0.7"/></svg>`;

const SVG_AGRI = `<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" style="vertical-align:-3px"><line x1="7" y1="4" x2="7" y2="13" stroke-width="1"/><path d="M7 4Q4 3 4 1Q6 2 7 4" fill="currentColor" stroke="none"/><path d="M7 4Q10 3 10 1Q8 2 7 4" fill="currentColor" stroke="none"/><path d="M7 7Q4 6 3.5 4Q5.5 5 7 7" fill="currentColor" stroke="none"/><path d="M7 7Q10 6 10.5 4Q8.5 5 7 7" fill="currentColor" stroke="none"/><path d="M7 10Q4.5 9 4 7Q5.5 8.5 7 10" fill="currentColor" stroke="none"/><path d="M7 10Q9.5 9 10 7Q8.5 8.5 7 10" fill="currentColor" stroke="none"/></svg>`;

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

  // Texture manager
  private texManager = new PlanetTextureManager();
  private lastPlanetName: string[] = [];
  private lastFlags: number[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.sphereGeo = new THREE.SphereGeometry(PLANET_RADIUS, 24, 16);
    this.ringGeo = new THREE.TorusGeometry(PLANET_RADIUS * 1.15, 15, 4, 24);
    this.gridGeo = buildGridGeometry();

    for (let i = 0; i < MAXPLANETS; i++) {
      this.lastPlanetName.push('');
      this.lastFlags.push(-1);

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
        depthWrite: true, // Occlude stars behind planets; ships at Y=10 are still closer than planets at Y=5
      });
      const sphere = new THREE.Mesh(this.sphereGeo, sphereMat);
      innerGroup.add(sphere);

      // Grid lines (lat/lon wireframe)
      const gridMat = new THREE.LineBasicMaterial({
        color: 0x888888,
        transparent: true,
        opacity: 0.15,
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
      // Z-offset moves label south on screen, clear of the sphere
      const labelDiv = document.createElement('div');
      labelDiv.style.cssText = 'font: 12px monospace; color: #888; text-align: center; pointer-events: none; text-shadow: 0 0 3px #000;';
      const label = new CSS2DObject(labelDiv);
      label.position.set(0, -10, PLANET_RADIUS + 500);
      g.add(label);

      this.group.add(g);
      this.visuals.push({ group: g, innerGroup, sphere, gridLines, homeRing, label, labelDiv });
    }
  }

  /** Sync planet visuals with game state */
  update(planets: Planet[], playerX: number, playerZ: number, halfW: number, halfH: number) {
    // Use actual camera frustum extents + buffer so planets don't pop in at the edges
    const bufferW = halfW + PLANET_RADIUS * 3;
    const bufferH = halfH + PLANET_RADIUS * 3;

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

      // Visibility check against camera frustum extents
      const dx = wx - playerX;
      const dz = wz - playerZ;
      if (Math.abs(dx) > bufferW || Math.abs(dz) > bufferH) {
        vis.group.visible = false;
        continue;
      }

      vis.group.visible = true;
      vis.group.position.set(wx, PLANET_Y, wz);

      // Rotate inner group (slow spin on tilted axis)
      vis.innerGroup.rotation.y += 0.003;

      // Apply procedural texture when name or flags change
      const mat = vis.sphere.material as THREE.MeshStandardMaterial;
      const tex = this.texManager.getTexture(i, planet.name, planet.flags);
      if (mat.map !== tex) {
        mat.map = tex;
        mat.emissiveMap = tex; // Self-lit so texture is visible in dim scene lighting
        mat.needsUpdate = true;
      }

      // Team-tinted color: mostly white so texture detail dominates, subtle team tint
      const teamColor = hexToRgb(TEAM_COLORS[planet.owner] ?? TEAM_COLORS[IND]);
      mat.color.copy(teamColor).lerp(WHITE, 0.8);
      mat.emissive.copy(teamColor).lerp(WHITE, 0.7);
      mat.emissiveIntensity = 0.8;
      (vis.gridLines.material as THREE.LineBasicMaterial).color.copy(teamColor);

      // Home planet ring
      vis.homeRing.visible = !!(planet.flags & PLHOME);

      // Label: Name + armies on line 1, resource icons on line 2
      const hexColor = TEAM_COLORS[planet.owner] ?? '#888888';
      let html = `<span style="color:${hexColor}">${planet.name}</span>`;
      if (planet.armies > 0) {
        html += ` <span style="color:#aaa">⚑${planet.armies}</span>`;
      }
      if (planet.flags & (PLREPAIR | PLFUEL | PLAGRI)) {
        const icons: string[] = [];
        if (planet.flags & PLREPAIR) icons.push(SVG_REPAIR);
        if (planet.flags & PLFUEL) icons.push(SVG_FUEL);
        if (planet.flags & PLAGRI) icons.push(SVG_AGRI);
        const sep = '<span style="color:#555;margin:0 1px">│</span>';
        html += `<br><span style="color:#aaa;border:1px solid #555;border-radius:3px;padding:1px 3px;background:rgba(0,0,0,0.5);display:inline-flex;align-items:center">${icons.join(sep)}</span>`;
      }
      vis.labelDiv.innerHTML = html;
      vis.labelDiv.style.whiteSpace = 'nowrap';
    }
  }
}
