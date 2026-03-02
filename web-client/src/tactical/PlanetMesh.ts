/**
 * 3D planet spheres with procedural textures, lat/lon grid lines, and CSS2D labels.
 * 40 planet slots, all persistent. Show/hide based on tactical range.
 * Each planet rotates on a unique deterministic tilt axis.
 */

import * as THREE from 'three';
import { Planet } from '../state';
import { TEAM_COLORS, PLREPAIR, PLFUEL, PLAGRI, PLHOME, IND, MAXPLANETS } from '../constants';
import { PlanetLabelData } from '../LabelRenderer';
import { PlanetTextureManager } from './PlanetTextures';

const PLANET_RADIUS = 600;
const PLANET_Y = 5; // layer height
const GOLDEN_ANGLE = 2.39996; // golden angle in radians for deterministic spread
const GRID_SEGMENTS = 64; // points per circle

const WHITE = new THREE.Color(0xffffff);

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

      this.group.add(g);
      this.visuals.push({ group: g, innerGroup, sphere, gridLines, homeRing });
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
      // Label position: planet group position + Z offset (below the sphere)
      const pos = new THREE.Vector3(
        vis.group.position.x,
        vis.group.position.y - 10,
        vis.group.position.z + PLANET_RADIUS + 500,
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
