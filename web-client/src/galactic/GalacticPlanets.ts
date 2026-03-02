/**
 * Galactic map planet visuals — small textured spheres with team-colored emissive,
 * home planet ring indicators, and CSS2D labels showing name + armies + resources.
 */

import * as THREE from 'three';
import { Planet } from '../state';
import {
  TEAM_COLORS, PLREPAIR, PLFUEL, PLAGRI, PLHOME, IND, MAXPLANETS,
} from '../constants';
import { PlanetTextureManager } from '../tactical/PlanetTextures';
import { PlanetLabelData } from '../LabelRenderer';

const PLANET_RADIUS = 1200;
const PLANET_Y = 5;
const GOLDEN_ANGLE = 2.39996;
const WHITE = new THREE.Color(0xffffff);

function hexToRgb(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

interface PlanetVisual {
  group: THREE.Group;
  innerGroup: THREE.Group;
  sphere: THREE.Mesh;
  homeRing: THREE.Mesh;
  lastOwner: number;
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

      this.group.add(g);
      this.visuals.push({ group: g, innerGroup, sphere, homeRing, lastOwner: -1 });
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
    }
  }

  /** Return label data for all visible planets (for canvas overlay rendering) */
  getLabelData(planets: Planet[]): PlanetLabelData[] {
    const result: PlanetLabelData[] = [];
    for (let i = 0; i < MAXPLANETS; i++) {
      const vis = this.visuals[i];
      if (!vis.group.visible) continue;
      const planet = planets[i];
      if (!planet || !planet.name) continue;
      const teamColor = TEAM_COLORS[planet.owner] ?? '#888888';
      const pos = new THREE.Vector3(
        vis.group.position.x,
        vis.group.position.y - 10,
        vis.group.position.z + PLANET_RADIUS + 1400,
      );
      result.push({
        worldPos: pos,
        name: planet.name,
        armies: planet.armies,
        flags: planet.flags,
        teamColor,
      });
    }
    return result;
  }
}
