/**
 * Per-ship visual effects as child objects of the ship group.
 * Shield bubble, cloak, exhaust, banking, damage sparks, temp glow, labels.
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Player } from '../state';
import {
  PFSHIELD, PFCLOAK, PFTRACT, PFPRESS,
  SHIP_STATS, TEAM_COLORS, TEAM_LETTERS, SHIP_SHORT, IND,
  MAXPLAYER,
} from '../constants';

const TWO_PI = Math.PI * 2;
const SHIELD_RADIUS = 600; // game units
const CLOAK_RADIUS = 450;  // smaller than shield

// Shield bubble shader — faint hexagon grid wireframe
const shieldVertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  void main() {
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vLocalPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const shieldFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uHitFlash;
  uniform vec3 uColor;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;

  // Hex distance — returns distance to nearest hex edge
  float hexDist(vec2 p) {
    p = abs(p);
    return max(dot(p, normalize(vec2(1.0, 1.732))), p.x);
  }

  // Hex grid: returns edge proximity (0 = on edge, 1 = center of hex)
  float hexGrid(vec2 uv, float scale) {
    uv *= scale;
    vec2 r = vec2(1.0, 1.732);
    vec2 h = r * 0.5;
    vec2 a = mod(uv, r) - h;
    vec2 b = mod(uv - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    float d = hexDist(gv);
    // Sharp hex edge lines
    return smoothstep(0.0, 0.06, abs(d - 0.5));
  }

  void main() {
    // Use local sphere position to derive stable UV for hex grid
    // Spherical coordinates from local position (avoids UV seam issues)
    vec3 n = normalize(vLocalPos);
    float u = atan(n.z, n.x) / 6.2832 + 0.5;
    float v = asin(clamp(n.y, -1.0, 1.0)) / 3.1416 + 0.5;

    // Hex grid — 0 on edges, 1 in cell centers
    float hex = hexGrid(vec2(u * 6.0, v * 4.0), 3.0);

    // Edge lines are where hex is LOW — invert so edges are bright
    float edge = 1.0 - hex;

    // Faint base alpha from edges only
    float alpha = edge * uOpacity;

    // Hit flash — entire bubble brightens
    alpha += uHitFlash * 0.3;
    vec3 color = mix(uColor, vec3(1.0, 1.0, 1.0), uHitFlash * 0.5);

    // Subtle pulse on edges
    float pulse = 0.9 + sin(uTime * 2.0) * 0.1;
    alpha *= pulse;

    gl_FragColor = vec4(color, alpha);
  }
`;

const SPARK_COUNT = 24;
const SPARK_HIT_DURATION = 600; // ms of bright burst on hull hit

interface ShipVisualState {
  group: THREE.Group;          // root group in the scene (positioned at ship coords)
  shipMesh: THREE.Group | null; // the ship model (child of group)
  shield: THREE.Mesh;
  shieldUniforms: { uTime: { value: number }; uOpacity: { value: number }; uHitFlash: { value: number }; uColor: { value: THREE.Color } };
  cloak: THREE.Mesh;
  cloakUniforms: { uTime: { value: number }; uOpacity: { value: number }; uHitFlash: { value: number }; uColor: { value: THREE.Color } };
  exhaust: THREE.Points;
  exhaustPositions: Float32Array;
  sparks: THREE.Points;
  sparkPositions: Float32Array;
  label: CSS2DObject;
  labelDiv: HTMLDivElement;
  // State tracking
  bankAngle: number;
  shieldHitTime: number;
  lastShield: number;
  prevDir: number;
  lastTeam: number;
  lastShipType: number;
}

export class ShipEffects {
  private states: ShipVisualState[] = [];
  readonly group: THREE.Group;

  // Shared geometry
  private shieldGeo: THREE.SphereGeometry;
  private cloakGeo: THREE.SphereGeometry;

  constructor() {
    this.group = new THREE.Group();
    this.shieldGeo = new THREE.SphereGeometry(SHIELD_RADIUS, 48, 32);
    this.cloakGeo = new THREE.SphereGeometry(CLOAK_RADIUS, 48, 32);

    for (let i = 0; i < MAXPLAYER; i++) {
      const g = new THREE.Group();
      g.visible = false;

      // Shield bubble — faint hex grid wireframe
      const shieldUniforms = {
        uTime: { value: 0 },
        uOpacity: { value: 0.3 },
        uHitFlash: { value: 0 },
        uColor: { value: new THREE.Color(0x4488ff) },
      };
      const shieldMat = new THREE.ShaderMaterial({
        uniforms: shieldUniforms,
        vertexShader: shieldVertexShader,
        fragmentShader: shieldFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const shield = new THREE.Mesh(this.shieldGeo, shieldMat);
      shield.visible = false;
      g.add(shield);

      // Cloak bubble — grey hex grid, smaller than shield
      const cloakUniforms = {
        uTime: { value: 0 },
        uOpacity: { value: 0.25 },
        uHitFlash: { value: 0 },
        uColor: { value: new THREE.Color(0x888888) },
      };
      const cloakMat = new THREE.ShaderMaterial({
        uniforms: cloakUniforms,
        vertexShader: shieldVertexShader,
        fragmentShader: shieldFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const cloak = new THREE.Mesh(this.cloakGeo, cloakMat);
      cloak.visible = false;
      g.add(cloak);

      // Exhaust particles
      const exhaustCount = 7;
      const exhaustPositions = new Float32Array(exhaustCount * 3);
      const exhaustGeo = new THREE.BufferGeometry();
      exhaustGeo.setAttribute('position', new THREE.Float32BufferAttribute(exhaustPositions, 3));
      const exhaustMat = new THREE.PointsMaterial({
        color: 0xff8c00,
        size: 80,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
      });
      const exhaust = new THREE.Points(exhaustGeo, exhaustMat);
      exhaust.frustumCulled = false;
      g.add(exhaust);

      // Hull damage sparks
      const sparkPositions = new Float32Array(SPARK_COUNT * 3);
      const sparkGeo = new THREE.BufferGeometry();
      sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(sparkPositions, 3));
      const sparkMat = new THREE.PointsMaterial({
        color: 0xff6600,
        size: 200,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });
      const sparks = new THREE.Points(sparkGeo, sparkMat);
      sparks.frustumCulled = false;
      sparks.visible = false;
      g.add(sparks);

      // CSS2D Label
      const labelDiv = document.createElement('div');
      labelDiv.style.cssText = 'font: 11px monospace; text-align: center; pointer-events: none; text-shadow: 0 0 4px #000, 0 0 2px #000; white-space: pre-line; line-height: 1.3;';
      const label = new CSS2DObject(labelDiv);
      label.position.set(0, 0, 700); // below ship in Three.js space (positive Z = south in game)
      g.add(label);

      this.group.add(g);
      this.states.push({
        group: g,
        shipMesh: null,
        shield,
        shieldUniforms,
        cloak,
        cloakUniforms,
        exhaust,
        exhaustPositions,
        sparks,
        sparkPositions,
        label,
        labelDiv,
        bankAngle: 0,
        shieldHitTime: 0,
        lastShield: 0,
        prevDir: 0,
        lastTeam: -1,
        lastShipType: -1,
      });
    }
  }

  /** Get the state for a player slot (to set ship mesh) */
  getState(playerNum: number): ShipVisualState {
    return this.states[playerNum];
  }

  /** Set or replace the ship mesh for a player */
  setShipMesh(playerNum: number, mesh: THREE.Group) {
    const state = this.states[playerNum];
    if (state.shipMesh) {
      state.group.remove(state.shipMesh);
    }
    state.shipMesh = mesh;
    // Ship mesh is at Y=10 (ship layer)
    mesh.position.set(0, 0, 0);
    state.group.add(mesh);
  }

  /** Update all ship visual states for current frame */
  update(players: Player[], myNumber: number, playerX: number, playerZ: number, tacRange: number) {
    const now = Date.now();
    const halfRange = tacRange / 2 + 1000;

    for (let i = 0; i < MAXPLAYER; i++) {
      const player = players[i];
      const state = this.states[i];

      // Skip free/invisible players
      const alive = player.status === 2; // PALIVE
      const exploding = player.status === 3; // PEXPLODE
      if (!alive && !exploding) {
        state.group.visible = false;
        continue;
      }

      // Cloaked enemy
      if ((player.flags & PFCLOAK) && player.number !== myNumber) {
        state.group.visible = false;
        continue;
      }

      // Range check
      const dx = player.x - playerX;
      const dz = player.y - playerZ;
      if (Math.abs(dx) > halfRange || Math.abs(dz) > halfRange) {
        state.group.visible = false;
        continue;
      }

      state.group.visible = true;
      state.group.position.set(player.x, 10, player.y);

      // Rotation: game dir 0-255 → radians. Dir 0 = north (-Z in Three.js)
      // Ship models point toward -Z by default, so rotation.y = angle from north CW
      const angle = (player.dir / 256) * TWO_PI;
      state.group.rotation.y = -angle;

      // Ship mesh & cloak
      const cloaked = !!(player.flags & PFCLOAK);
      if (state.shipMesh) {
        // Hide ship model when cloaked, show cloak hex bubble instead
        state.shipMesh.visible = !cloaked;

        // Banking (heading lean + roll, visible from top-down camera)
        let dirDelta = player.dir - state.prevDir;
        if (dirDelta > 128) dirDelta -= 256;
        if (dirDelta < -128) dirDelta += 256;
        const targetBank = Math.max(-110, Math.min(110, dirDelta * 10.0));
        // Asymmetric smoothing: snap into bank fast, hold and decay slowly
        const smoothing = Math.abs(targetBank) > 1 ? 0.35 : 0.03;
        state.bankAngle += (targetBank - state.bankAngle) * smoothing;
        const bankRad = (state.bankAngle * Math.PI) / 180;
        state.shipMesh.rotation.z = -bankRad;        // 3D roll
        state.shipMesh.rotation.y = -bankRad * 0.5;  // heading lean into turn (top-down visible)

        // Temperature glow — increase emissive
        const maxTemp = Math.max(player.wTemp, player.eTemp);
        const tempRatio = maxTemp / 1200;
        if (tempRatio > 0.15) {
          const intensity = (tempRatio - 0.15) / 0.85;
          state.shipMesh.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
              child.material.emissiveIntensity = 0.15 + intensity * 0.5;
            }
          });
        }
      }

      // Shield bubble
      const hasShield = !!(player.flags & PFSHIELD);
      state.shield.visible = hasShield;
      if (hasShield) {
        const stats = SHIP_STATS[player.shipType];
        const maxShield = stats?.shields ?? 100;
        const shieldRatio = player.shield / maxShield;

        // Hit detection
        if (player.shield < state.lastShield) {
          state.shieldHitTime = now;
        }
        const hitAge = now - state.shieldHitTime;
        const hitFlash = hitAge < 300 ? Math.max(0, 1 - hitAge / 300) : 0;

        // Update shader uniforms
        state.shieldUniforms.uTime.value = now * 0.001;
        state.shieldUniforms.uOpacity.value = 0.2 + shieldRatio * 0.3;
        state.shieldUniforms.uHitFlash.value = hitFlash;

        // Pulse scale
        const pulse = 1 + Math.sin(now * 0.003) * 0.015;
        state.shield.scale.setScalar(pulse);

        // Match ship banking so shield tilts with the ship
        if (state.shipMesh) {
          state.shield.rotation.z = state.shipMesh.rotation.z;
          state.shield.rotation.y = state.shipMesh.rotation.y;
        }
      }

      // Cloak bubble (own ship only — enemies are hidden entirely)
      state.cloak.visible = cloaked;
      if (cloaked) {
        state.cloakUniforms.uTime.value = now * 0.001;
        state.cloakUniforms.uOpacity.value = 0.2 + Math.sin(now * 0.005) * 0.05;

        // Match ship banking
        if (state.shipMesh) {
          state.cloak.rotation.z = state.shipMesh.rotation.z;
          state.cloak.rotation.y = state.shipMesh.rotation.y;
        }
      }

      // Exhaust particles
      if (player.speed > 0 && state.shipMesh) {
        state.exhaust.visible = true;
        const stats = SHIP_STATS[player.shipType];
        const maxSpeed = stats?.speed ?? 12;
        const t = player.speed / maxSpeed;
        const count = state.exhaustPositions.length / 3;

        for (let j = 0; j < count; j++) {
          const frac = (j + 1) / count;
          const dist = 200 + frac * (200 + 600 * t);
          const spread = (Math.random() - 0.5) * 100 * frac;
          // Exhaust goes backward in local space (positive Z = aft)
          state.exhaustPositions[j * 3] = spread;
          state.exhaustPositions[j * 3 + 1] = 0;
          state.exhaustPositions[j * 3 + 2] = dist;
        }
        (state.exhaust.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        (state.exhaust.material as THREE.PointsMaterial).opacity = 0.3 + t * 0.5;
      } else {
        state.exhaust.visible = false;
      }

      // Hull damage sparks — burst when hull decreases (set by net.ts)
      const hullHitAge = now - player.hullHitTime;
      if (player.hullHitTime > 0 && hullHitAge < SPARK_HIT_DURATION) {
        state.sparks.visible = true;
        const t = hullHitAge / SPARK_HIT_DURATION;
        const fade = 1.0 - t * t;

        // Distribute sparks randomly within the 3D shield sphere
        for (let j = 0; j < SPARK_COUNT; j++) {
          const r = SHIELD_RADIUS * Math.cbrt(Math.random());
          const theta = Math.random() * TWO_PI;
          const phi = Math.acos(2 * Math.random() - 1);
          state.sparkPositions[j * 3] = r * Math.sin(phi) * Math.cos(theta);
          state.sparkPositions[j * 3 + 1] = r * Math.cos(phi);
          state.sparkPositions[j * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        (state.sparks.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        (state.sparks.material as THREE.PointsMaterial).opacity = fade;
        (state.sparks.material as THREE.PointsMaterial).size = 200;

        const sparkColor = (state.sparks.material as THREE.PointsMaterial).color;
        sparkColor.setRGB(1.0, 0.6 + 0.4 * fade, fade * 0.5);
      } else {
        state.sparks.visible = false;
      }

      // Label
      const isMe = player.number === myNumber;
      const tc = TEAM_COLORS[player.team] ?? TEAM_COLORS[IND];
      const teamLetter = TEAM_LETTERS[player.team] ?? '?';
      const shipShort = SHIP_SHORT[player.shipType] ?? '??';
      let labelText = `${teamLetter}${player.number}`;
      labelText += `\n${shipShort}`;
      if (player.kills >= 1) labelText += `\n${'★'.repeat(Math.min(5, Math.floor(player.kills)))}`;
      if (player.armies > 0) labelText += `\n♦${player.armies}`;

      state.labelDiv.style.color = isMe ? '#ffffff' : tc;
      state.labelDiv.textContent = labelText;

      // Update tracking
      state.lastShield = player.shield;
      state.prevDir = player.dir;
    }
  }
}
