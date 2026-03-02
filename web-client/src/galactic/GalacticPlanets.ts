/**
 * Galactic map planet visuals — small textured spheres with team-colored emissive,
 * home planet ring indicators, and CSS2D labels showing name + armies + resources.
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Planet } from '../state';
import {
  TEAM_COLORS, PLREPAIR, PLFUEL, PLAGRI, PLHOME, IND, MAXPLANETS,
} from '../constants';
import { PlanetTextureManager } from '../tactical/PlanetTextures';

const PLANET_RADIUS = 1200;
const PLANET_Y = 5;
const GOLDEN_ANGLE = 2.39996;
const WHITE = new THREE.Color(0xffffff);

// Inline SVG icons (same as PlanetMesh.ts, smaller for galactic)
const SVG_REPAIR = `<svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="currentColor" style="vertical-align:-2px"><line x1="7" y1="1" x2="7" y2="3" stroke-width="1.2"/><circle cx="7" cy="1" r="0.8" fill="currentColor" stroke="none"/><rect x="3" y="3" width="8" height="6.5" rx="1" stroke-width="1"/><rect x="5" y="5" width="1.3" height="1.3" rx="0.3" fill="currentColor" stroke="none"/><rect x="7.7" y="5" width="1.3" height="1.3" rx="0.3" fill="currentColor" stroke="none"/><line x1="5" y1="8" x2="9" y2="8" stroke-width="0.8"/><line x1="4.5" y1="10.5" x2="3" y2="13" stroke-width="1"/><line x1="9.5" y1="10.5" x2="11" y2="13" stroke-width="1"/></svg>`;
const SVG_FUEL = `<svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="currentColor" style="vertical-align:-2px"><path d="M7 1L11.5 7L7 13L2.5 7Z" stroke-width="1"/><line x1="2.5" y1="7" x2="11.5" y2="7" stroke-width="0.7"/><line x1="4.8" y1="4" x2="9.2" y2="4" stroke-width="0.7"/><line x1="4.8" y1="10" x2="9.2" y2="10" stroke-width="0.7"/></svg>`;
const SVG_AGRI = `<svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="currentColor" style="vertical-align:-2px"><line x1="7" y1="4" x2="7" y2="13" stroke-width="1"/><path d="M7 4Q4 3 4 1Q6 2 7 4" fill="currentColor" stroke="none"/><path d="M7 4Q10 3 10 1Q8 2 7 4" fill="currentColor" stroke="none"/><path d="M7 7Q4 6 3.5 4Q5.5 5 7 7" fill="currentColor" stroke="none"/><path d="M7 7Q10 6 10.5 4Q8.5 5 7 7" fill="currentColor" stroke="none"/></svg>`;

function hexToRgb(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

interface PlanetVisual {
  group: THREE.Group;
  innerGroup: THREE.Group;
  sphere: THREE.Mesh;
  homeRing: THREE.Mesh;
  label: CSS2DObject;
  labelDiv: HTMLDivElement;
  lastOwner: number;
  lastLabelHtml: string;
}

export class GalacticPlanets {
  readonly group: THREE.Group;
  private visuals: PlanetVisual[] = [];
  private sphereGeo: THREE.SphereGeometry;
  private ringGeo: THREE.TorusGeometry;
  private texManager = new PlanetTextureManager();

  constructor() {
    this.group = new THREE.Group();
    this.sphereGeo = new THREE.SphereGeometry(PLANET_RADIUS, 12, 8);
    this.ringGeo = new THREE.TorusGeometry(PLANET_RADIUS * 1.3, 80, 4, 16);

    for (let i = 0; i < MAXPLANETS; i++) {
      const g = new THREE.Group();
      g.visible = false;

      // Inner group for rotation
      const innerGroup = new THREE.Group();
      const tiltX = Math.sin(i * GOLDEN_ANGLE) * 0.3;
      const tiltZ = Math.cos(i * GOLDEN_ANGLE) * 0.3;
      innerGroup.rotation.x = tiltX;
      innerGroup.rotation.z = tiltZ;

      // Planet sphere with emissive for bloom + texture slot
      const sphereMat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        emissive: 0x888888,
        emissiveIntensity: 0.8,
        metalness: 0.3,
        roughness: 0.7,
        depthWrite: true,
      });
      const sphere = new THREE.Mesh(this.sphereGeo, sphereMat);
      sphere.frustumCulled = false;
      innerGroup.add(sphere);
      g.add(innerGroup);

      // Home planet ring
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
      });
      const homeRing = new THREE.Mesh(this.ringGeo, ringMat);
      homeRing.rotation.x = Math.PI / 2;
      homeRing.visible = false;
      homeRing.frustumCulled = false;
      g.add(homeRing);

      // CSS2D label — small font, well below the planet sphere
      const labelDiv = document.createElement('div');
      labelDiv.style.cssText = 'font: 9px monospace; color: #888; text-align: center; pointer-events: none; text-shadow: 0 0 3px #000; white-space: nowrap;';
      const label = new CSS2DObject(labelDiv);
      label.position.set(0, -10, PLANET_RADIUS + 1400);
      g.add(label);

      this.group.add(g);
      this.visuals.push({ group: g, innerGroup, sphere, homeRing, label, labelDiv, lastOwner: -1, lastLabelHtml: '' });
    }
  }

  update(planets: Planet[]) {
    for (let i = 0; i < MAXPLANETS; i++) {
      const planet = planets[i];
      const vis = this.visuals[i];

      if (!planet || !planet.name) {
        vis.group.visible = false;
        continue;
      }

      vis.group.visible = true;
      vis.group.position.set(planet.x, PLANET_Y, planet.y);

      // Slow rotation
      vis.innerGroup.rotation.y += 0.002;

      // Apply procedural texture (same as tactical PlanetMesh)
      const mat = vis.sphere.material as THREE.MeshStandardMaterial;
      const tex = this.texManager.getTexture(i, planet.name, planet.flags);
      if (mat.map !== tex) {
        mat.map = tex;
        mat.emissiveMap = tex;
        mat.needsUpdate = true;
      }

      // Team-tinted color — only update when owner changes
      if (planet.owner !== vis.lastOwner) {
        const teamColor = hexToRgb(TEAM_COLORS[planet.owner] ?? TEAM_COLORS[IND]);
        mat.color.copy(teamColor).lerp(WHITE, 0.8);
        mat.emissive.copy(teamColor).lerp(WHITE, 0.7);
        mat.emissiveIntensity = 0.8;
        (vis.homeRing.material as THREE.MeshBasicMaterial).color.copy(teamColor);
        vis.lastOwner = planet.owner;
      }

      // Home ring
      vis.homeRing.visible = !!(planet.flags & PLHOME);

      // Label — only update DOM when content changes
      const hexColor = TEAM_COLORS[planet.owner] ?? '#888888';
      let html = `<span style="color:${hexColor}">${planet.name}</span>`;
      if (planet.armies > 0) {
        html += ` <span style="color:#aaa">\u2691${planet.armies}</span>`;
      }
      if (planet.flags & (PLREPAIR | PLFUEL | PLAGRI)) {
        const icons: string[] = [];
        if (planet.flags & PLREPAIR) icons.push(SVG_REPAIR);
        if (planet.flags & PLFUEL) icons.push(SVG_FUEL);
        if (planet.flags & PLAGRI) icons.push(SVG_AGRI);
        html += `<br><span style="color:#aaa;display:inline-flex;align-items:center;gap:1px">${icons.join('')}</span>`;
      }
      if (html !== vis.lastLabelHtml) {
        vis.labelDiv.innerHTML = html;
        vis.lastLabelHtml = html;
      }
    }
  }
}
