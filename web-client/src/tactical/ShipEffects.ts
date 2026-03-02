/**
 * Per-ship visual effects as child objects of the ship group.
 * Shield bubble, cloak, exhaust, banking, damage sparks, temp glow, labels.
 */

import * as THREE from 'three';
import { Player } from '../state';
import { ShipLabelData } from '../LabelRenderer';
import {
  PFSHIELD, PFCLOAK, PFTRACT, PFPRESS,
  SHIP_STATS, TEAM_COLORS, TEAM_LETTERS, SHIP_SHORT, IND,
  FED, ROM, KLI, ORI,
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

// ============================================================
// Warp trail — two glowing strips behind nacelles
// ============================================================

const TRAIL_SEGMENTS = 32; // vertices along trail length
const TRAIL_WIDTH = 60;    // half-width of each trail strip in game units
const TRAIL_MAX_LENGTH = 6000; // game units at max speed
const TRAIL_MIN_LENGTH = 300;  // at very low speeds
const NACELLE_OFFSET = 180;    // lateral offset from ship center (game units)
const NACELLE_Z_START = 200;   // how far aft of ship center the trail begins

const NACELLE_COLORS: Record<number, number> = {
  [FED]: 0x4488ff,
  [ROM]: 0x44ff44,
  [KLI]: 0x44ff44,
  [ORI]: 0x44ffff,
  [IND]: 0x888888,
};

const trailVertexShader = /* glsl */ `
  attribute float alpha;
  attribute float aFrac;
  attribute float aSide;
  uniform float uTrailLen;
  uniform float uXOffset;
  varying float vAlpha;
  void main() {
    vAlpha = alpha;
    float z = 200.0 + aFrac * uTrailLen;
    float widthScale = 1.0 - aFrac * 0.6;
    float x = uXOffset + aSide * 60.0 * widthScale;
    vec3 pos = vec3(x, 0.0, z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const trailFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uBrightness;
  varying float vAlpha;
  void main() {
    // Bright core that fades along the trail
    float a = vAlpha * uBrightness;
    // Slight glow bloom at the front
    vec3 color = uColor * (1.0 + vAlpha * 0.5);
    gl_FragColor = vec4(color, a);
  }
`;

/** Build a trail strip geometry with GPU-driven positioning via aFrac/aSide attributes */
function buildTrailGeometry(): THREE.BufferGeometry {
  const vertCount = (TRAIL_SEGMENTS + 1) * 2;
  const positions = new Float32Array(vertCount * 3); // placeholder, shader overrides
  const alphas = new Float32Array(vertCount);
  const fracs = new Float32Array(vertCount);
  const sides = new Float32Array(vertCount);
  const indices: number[] = [];

  for (let i = 0; i <= TRAIL_SEGMENTS; i++) {
    const t = i / TRAIL_SEGMENTS; // 0 = ship end, 1 = tail end
    const leftIdx = i * 2;
    const rightIdx = i * 2 + 1;

    // Alpha: bright at ship (t=0), fading to 0 at tail (t=1)
    const a = (1 - t) * (1 - t); // quadratic falloff
    alphas[leftIdx] = a;
    alphas[rightIdx] = a;

    // Fraction along trail (constant per vertex, used by shader)
    fracs[leftIdx] = t;
    fracs[rightIdx] = t;

    // Side: -1 for left, +1 for right (used by shader for X offset)
    sides[leftIdx] = -1;
    sides[rightIdx] = 1;

    // Quad indices
    if (i < TRAIL_SEGMENTS) {
      const bl = leftIdx;
      const br = rightIdx;
      const tl = leftIdx + 2;
      const tr = rightIdx + 2;
      indices.push(bl, br, tl);
      indices.push(br, tr, tl);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('alpha', new THREE.Float32BufferAttribute(alphas, 1));
  geo.setAttribute('aFrac', new THREE.Float32BufferAttribute(fracs, 1));
  geo.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 1));
  geo.setIndex(indices);
  return geo;
}

const EXPLOSION_COUNT = 40;
const EXPLOSION_DURATION = 600;
const SHIP_EXTENT = 375; // half of SHIP_SCALE — particles should cover this

/** Seed explosion pattern into base/velocity/delay/size arrays.
 *  4 patterns chosen randomly on each hit. */
function seedExplosion(
  basePos: Float32Array, velocity: Float32Array,
  delay: Float32Array, size: Float32Array, count: number,
) {
  const pattern = Math.floor(Math.random() * 4);

  switch (pattern) {
    case 0: { // SCATTER — particles across the whole ship, fly outward
      for (let j = 0; j < count; j++) {
        const ang = Math.random() * Math.PI * 2;
        const r = (0.3 + Math.random() * 0.7) * SHIP_EXTENT;
        basePos[j * 3]     = Math.cos(ang) * r;
        basePos[j * 3 + 1] = (Math.random() - 0.5) * 60;
        basePos[j * 3 + 2] = Math.sin(ang) * r;
        const spd = 400 + Math.random() * 600;
        velocity[j * 3]     = Math.cos(ang) * spd * (0.5 + Math.random());
        velocity[j * 3 + 1] = Math.random() * 200;
        velocity[j * 3 + 2] = Math.sin(ang) * spd * (0.5 + Math.random());
        delay[j] = Math.random() * 0.35;
        size[j] = Math.random() < 0.15 ? 3 + Math.random() * 2 : 1 + Math.random() * 2;
      }
      break;
    }
    case 1: { // DIRECTIONAL — impact from one side, debris sprays opposite
      const hitAng = Math.random() * Math.PI * 2;
      const sprayAng = hitAng + Math.PI;
      for (let j = 0; j < count; j++) {
        // Spawn near the impact point
        const spread = Math.random() * 0.8;
        const a = hitAng + (Math.random() - 0.5) * 1.2;
        const r = (0.4 + spread) * SHIP_EXTENT;
        basePos[j * 3]     = Math.cos(a) * r;
        basePos[j * 3 + 1] = (Math.random() - 0.5) * 50;
        basePos[j * 3 + 2] = Math.sin(a) * r;
        // Spray away from impact
        const sAng = sprayAng + (Math.random() - 0.5) * 1.5;
        const spd = 500 + Math.random() * 800;
        velocity[j * 3]     = Math.cos(sAng) * spd;
        velocity[j * 3 + 1] = Math.random() * 300;
        velocity[j * 3 + 2] = Math.sin(sAng) * spd;
        delay[j] = Math.random() * 0.2;
        size[j] = Math.random() < 0.2 ? 3 + Math.random() * 2 : 1 + Math.random() * 1.5;
      }
      break;
    }
    case 2: { // RING — expanding ring of debris
      const ringAng = Math.random() * Math.PI * 2; // slight random tilt
      for (let j = 0; j < count; j++) {
        const a = (j / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const r = (0.6 + Math.random() * 0.4) * SHIP_EXTENT;
        basePos[j * 3]     = Math.cos(a + ringAng) * r;
        basePos[j * 3 + 1] = (Math.random() - 0.5) * 40;
        basePos[j * 3 + 2] = Math.sin(a + ringAng) * r;
        const spd = 300 + Math.random() * 500;
        velocity[j * 3]     = Math.cos(a + ringAng) * spd;
        velocity[j * 3 + 1] = (Math.random() - 0.5) * 100;
        velocity[j * 3 + 2] = Math.sin(a + ringAng) * spd;
        delay[j] = (j / count) * 0.15 + Math.random() * 0.1;
        size[j] = 1.5 + Math.random() * 2;
      }
      break;
    }
    case 3: { // MULTI-POP — 3-4 small clustered pops at random spots on the ship
      const numPops = 3 + Math.floor(Math.random() * 2);
      const perPop = Math.floor(count / numPops);
      for (let p = 0; p < numPops; p++) {
        const cAng = Math.random() * Math.PI * 2;
        const cR = (0.3 + Math.random() * 0.7) * SHIP_EXTENT;
        const cx = Math.cos(cAng) * cR;
        const cz = Math.sin(cAng) * cR;
        const popDelay = p * 0.12 + Math.random() * 0.05;
        for (let k = 0; k < perPop; k++) {
          const j = p * perPop + k;
          if (j >= count) break;
          basePos[j * 3]     = cx + (Math.random() - 0.5) * 80;
          basePos[j * 3 + 1] = (Math.random() - 0.5) * 50;
          basePos[j * 3 + 2] = cz + (Math.random() - 0.5) * 80;
          const a = Math.random() * Math.PI * 2;
          const spd = 200 + Math.random() * 500;
          velocity[j * 3]     = Math.cos(a) * spd;
          velocity[j * 3 + 1] = Math.random() * 200;
          velocity[j * 3 + 2] = Math.sin(a) * spd;
          delay[j] = popDelay + Math.random() * 0.08;
          size[j] = Math.random() < 0.25 ? 2.5 + Math.random() * 2 : 1 + Math.random() * 1.5;
        }
      }
      // Fill any remaining
      for (let j = numPops * perPop; j < count; j++) {
        basePos[j * 3] = 0; basePos[j * 3 + 1] = -99999; basePos[j * 3 + 2] = 0;
        velocity[j * 3] = 0; velocity[j * 3 + 1] = 0; velocity[j * 3 + 2] = 0;
        delay[j] = 1; size[j] = 0;
      }
      break;
    }
  }
}

interface ShipVisualState {
  group: THREE.Group;          // root group in the scene (positioned at ship coords)
  shipMesh: THREE.Group | null; // the ship model (child of group)
  shield: THREE.Mesh;
  shieldUniforms: { uTime: { value: number }; uOpacity: { value: number }; uHitFlash: { value: number }; uColor: { value: THREE.Color } };
  cloak: THREE.Mesh;
  cloakUniforms: { uTime: { value: number }; uOpacity: { value: number }; uHitFlash: { value: number }; uColor: { value: THREE.Color } };
  trailLeft: THREE.Mesh;
  trailRight: THREE.Mesh;
  trailLeftUniforms: { uColor: { value: THREE.Color }; uBrightness: { value: number }; uTrailLen: { value: number }; uXOffset: { value: number } };
  trailRightUniforms: { uColor: { value: THREE.Color }; uBrightness: { value: number }; uTrailLen: { value: number }; uXOffset: { value: number } };
  explosion: THREE.Points;
  expPositions: Float32Array;
  expBasePos: Float32Array;
  expVelocity: Float32Array;
  expDelay: Float32Array;   // per-particle start delay (0..0.4 of duration)
  expSize: Float32Array;    // per-particle max pixel size
  // State tracking
  bankAngle: number;
  shieldHitTime: number;
  lastShield: number;
  hullHitTime: number;
  lastHull: number;
  prevDir: number;
  lastTeam: number;
  lastShipType: number;
  lastLabelText: string;
  lastLabelColor: string;
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

      // Warp trail strips (left + right nacelle) — GPU-driven positioning
      const sharedTrailGeo = buildTrailGeometry();
      const trailLeftUniforms = {
        uColor: { value: new THREE.Color(0x4488ff) },
        uBrightness: { value: 0 },
        uTrailLen: { value: 0 },
        uXOffset: { value: -NACELLE_OFFSET },
      };
      const trailLeftMat = new THREE.ShaderMaterial({
        uniforms: trailLeftUniforms,
        vertexShader: trailVertexShader,
        fragmentShader: trailFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const trailLeft = new THREE.Mesh(sharedTrailGeo, trailLeftMat);
      trailLeft.frustumCulled = false;
      trailLeft.visible = false;
      g.add(trailLeft);

      const trailRightUniforms = {
        uColor: { value: new THREE.Color(0x4488ff) },
        uBrightness: { value: 0 },
        uTrailLen: { value: 0 },
        uXOffset: { value: NACELLE_OFFSET },
      };
      const trailRightMat = new THREE.ShaderMaterial({
        uniforms: trailRightUniforms,
        vertexShader: trailVertexShader,
        fragmentShader: trailFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const trailRight = new THREE.Mesh(sharedTrailGeo, trailRightMat);
      trailRight.frustumCulled = false;
      trailRight.visible = false;
      g.add(trailRight);

      // Hull damage explosion particles — own dedicated arrays
      const expPositions = new Float32Array(EXPLOSION_COUNT * 3);
      const expBasePos = new Float32Array(EXPLOSION_COUNT * 3);
      const expVelocity = new Float32Array(EXPLOSION_COUNT * 3);
      const expDelay = new Float32Array(EXPLOSION_COUNT);
      const expSize = new Float32Array(EXPLOSION_COUNT);
      const expGeo = new THREE.BufferGeometry();
      expGeo.setAttribute('position', new THREE.BufferAttribute(expPositions, 3));
      const expMat = new THREE.PointsMaterial({
        color: 0xffaa33,
        size: 10,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });
      const explosion = new THREE.Points(expGeo, expMat);
      explosion.frustumCulled = false;
      explosion.visible = false;
      g.add(explosion);

      this.group.add(g);
      this.states.push({
        group: g,
        shipMesh: null,
        shield,
        shieldUniforms,
        cloak,
        cloakUniforms,
        trailLeft,
        trailRight,
        trailLeftUniforms,
        trailRightUniforms,
        explosion,
        expPositions,
        expBasePos,
        expVelocity,
        expDelay,
        expSize,
        bankAngle: 0,
        shieldHitTime: 0,
        lastShield: 0,
        hullHitTime: 0,
        lastHull: 0,
        prevDir: 0,
        lastTeam: -1,
        lastShipType: -1,
        lastLabelText: '',
        lastLabelColor: '',
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

      // Warp trail strips — GPU-driven, just update uniforms
      if (player.speed > 0 && state.shipMesh) {
        const stats = SHIP_STATS[player.shipType];
        const maxSpeed = stats?.speed ?? 12;
        const t = player.speed / maxSpeed;
        const trailLen = TRAIL_MIN_LENGTH + t * t * (TRAIL_MAX_LENGTH - TRAIL_MIN_LENGTH);
        const brightness = 0.4 + t * 0.6;

        // Set trail color + length via uniforms (no CPU vertex updates)
        const nacColor = NACELLE_COLORS[player.team] ?? NACELLE_COLORS[IND];
        state.trailLeftUniforms.uColor.value.set(nacColor);
        state.trailLeftUniforms.uBrightness.value = brightness;
        state.trailLeftUniforms.uTrailLen.value = trailLen;

        state.trailRightUniforms.uColor.value.set(nacColor);
        state.trailRightUniforms.uBrightness.value = brightness;
        state.trailRightUniforms.uTrailLen.value = trailLen;

        state.trailLeft.visible = true;
        state.trailRight.visible = true;

        // Match ship banking so trails tilt with the ship
        state.trailLeft.rotation.z = state.shipMesh.rotation.z;
        state.trailLeft.rotation.y = state.shipMesh.rotation.y;
        state.trailRight.rotation.z = state.shipMesh.rotation.z;
        state.trailRight.rotation.y = state.shipMesh.rotation.y;
      } else {
        state.trailLeft.visible = false;
        state.trailRight.visible = false;
      }

      // Hull damage explosions — detect damage increase (hull field = damage taken, higher = worse)
      if (player.hull > state.lastHull && state.lastHull >= 0) {
        state.hullHitTime = now;
        seedExplosion(state.expBasePos, state.expVelocity, state.expDelay, state.expSize, EXPLOSION_COUNT);
      }
      const hullHitAge = now - state.hullHitTime;
      if (state.hullHitTime > 0 && hullHitAge < EXPLOSION_DURATION) {
        state.explosion.visible = true;
        const tNorm = hullHitAge / EXPLOSION_DURATION; // 0..1
        const tSec = hullHitAge / 1000;

        // Per-particle: advance positions, hide if not yet started or already faded
        const posArr = state.expPositions;
        let maxSize = 0;
        for (let j = 0; j < EXPLOSION_COUNT; j++) {
          const j3 = j * 3;
          const delay = state.expDelay[j];
          const localT = (tNorm - delay) / (1 - delay); // particle-local 0..1
          if (localT < 0 || localT > 1) {
            // Not yet started or done — park off-screen
            posArr[j3] = 0; posArr[j3 + 1] = -99999; posArr[j3 + 2] = 0;
          } else {
            const localSec = (hullHitAge - delay * EXPLOSION_DURATION) / 1000;
            posArr[j3]     = state.expBasePos[j3]     + state.expVelocity[j3]     * localSec;
            posArr[j3 + 1] = state.expBasePos[j3 + 1] + state.expVelocity[j3 + 1] * localSec;
            posArr[j3 + 2] = state.expBasePos[j3 + 2] + state.expVelocity[j3 + 2] * localSec;
          }
          if (state.expSize[j] > maxSize) maxSize = state.expSize[j];
        }
        const posAttr = state.explosion.geometry.getAttribute('position') as THREE.BufferAttribute;
        posAttr.needsUpdate = true;

        const fade = Math.max(0, 1.0 - tNorm * tNorm);
        const mat = state.explosion.material as THREE.PointsMaterial;
        mat.opacity = fade;
        mat.size = maxSize * fade;
        mat.color.setRGB(1.0, 0.3 + 0.6 * fade, fade * 0.2);
      } else {
        state.explosion.visible = false;
      }

      // Label text computation — stored for getLabelData()
      const isMe = player.number === myNumber;
      const tc = TEAM_COLORS[player.team] ?? TEAM_COLORS[IND];
      const labelColor = isMe ? '#ffffff' : tc;
      const teamLetter = TEAM_LETTERS[player.team] ?? '?';
      const shipShort = SHIP_SHORT[player.shipType] ?? '??';
      let labelText = `${teamLetter}${player.number}\n${shipShort}`;
      if (player.kills >= 1) labelText += `\n${'★'.repeat(Math.min(5, Math.floor(player.kills)))}`;
      if (player.armies > 0) labelText += `\n♦${player.armies}`;

      state.lastLabelText = labelText;
      state.lastLabelColor = labelColor;

      // Update tracking
      state.lastShield = player.shield;
      state.lastHull = player.hull;
      state.prevDir = player.dir;
    }
  }

  /** Return label data for all visible ships (for canvas overlay rendering) */
  getLabelData(): ShipLabelData[] {
    const result: ShipLabelData[] = [];
    for (const state of this.states) {
      if (!state.group.visible || !state.lastLabelText) continue;
      // Label position: ship group position + Z offset (700 units south)
      const pos = new THREE.Vector3(
        state.group.position.x,
        state.group.position.y,
        state.group.position.z + 700,
      );
      result.push({ worldPos: pos, text: state.lastLabelText, color: state.lastLabelColor });
    }
    return result;
  }
}
