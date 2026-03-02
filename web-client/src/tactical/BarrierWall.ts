/**
 * BarrierWall — Hex-grid containment field at the edges of the galaxy.
 *
 * Four tall vertical planes at x=0, x=GWIDTH, z=0, z=GWIDTH.
 * Hexagonal grid shader matching the shield bubble aesthetic.
 * Fades from bright at the base to transparent at the top,
 * giving a "looking down into a box" perspective.
 */

import * as THREE from 'three';
import { GWIDTH } from '../constants';

const WALL_BOTTOM = -300;
const WALL_TOP = 5000;
const WALL_HEIGHT = WALL_TOP - WALL_BOTTOM;
const WALL_CENTER_Y = (WALL_BOTTOM + WALL_TOP) / 2;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

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
    return smoothstep(0.0, 0.06, abs(d - 0.5));
  }

  void main() {
    // Scale UV so hex tiles are clearly visible — wider wall = more columns
    // x covers full wall length, y covers wall height
    float hex = hexGrid(vec2(vUv.x * 60.0, vUv.y * 8.0), 1.0);

    // Edges are where hex is LOW — invert so edges are bright
    float edge = 1.0 - hex;

    // Vertical gradient: bright at bottom (vUv.y=0), fading to nothing at top
    float vertFade = 1.0 - smoothstep(0.0, 0.85, vUv.y);
    vertFade = pow(vertFade, 1.5);

    // Subtle upward scan line
    float scan = smoothstep(-0.02, 0.0, sin(vUv.y * 30.0 - uTime * 1.5)) * 0.3;

    // Gentle pulse
    float pulse = 0.9 + sin(uTime * 1.2) * 0.1;

    // Cyan / electric blue color
    vec3 cyan = vec3(0.2, 0.8, 1.0);
    vec3 white = vec3(0.7, 0.95, 1.0);
    vec3 color = mix(cyan, white, edge * 0.5);

    float alpha = (edge * 0.7 + scan) * vertFade * pulse;

    // Boost brightness on hex edges for bloom pickup
    gl_FragColor = vec4(color * (1.0 + edge * 0.4), alpha * 0.5);
  }
`;

function makeWallMaterial(timeUniform: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: timeUniform },
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
}

export class BarrierWall {
  readonly group = new THREE.Group();
  private timeUniform = { value: 0 };

  constructor() {
    const mat = makeWallMaterial(this.timeUniform);

    // West wall (x = 0)  — plane faces +X
    const west = new THREE.Mesh(new THREE.PlaneGeometry(GWIDTH, WALL_HEIGHT), mat);
    west.position.set(0, WALL_CENTER_Y, GWIDTH / 2);
    west.rotation.y = Math.PI / 2;

    // East wall (x = GWIDTH) — plane faces -X
    const east = new THREE.Mesh(new THREE.PlaneGeometry(GWIDTH, WALL_HEIGHT), mat);
    east.position.set(GWIDTH, WALL_CENTER_Y, GWIDTH / 2);
    east.rotation.y = -Math.PI / 2;

    // North wall (z = 0) — plane faces +Z
    const north = new THREE.Mesh(new THREE.PlaneGeometry(GWIDTH, WALL_HEIGHT), mat);
    north.position.set(GWIDTH / 2, WALL_CENTER_Y, 0);

    // South wall (z = GWIDTH) — plane faces -Z
    const south = new THREE.Mesh(new THREE.PlaneGeometry(GWIDTH, WALL_HEIGHT), mat);
    south.position.set(GWIDTH / 2, WALL_CENTER_Y, GWIDTH);
    south.rotation.y = Math.PI;

    // Render before stars (renderOrder -100) so barrier depth occludes stars behind it
    for (const wall of [west, east, north, south]) {
      wall.renderOrder = -200;
    }
    this.group.add(west, east, north, south);
  }

  /** Advance animation time. Call once per frame. */
  update(now: number) {
    this.timeUniform.value = now * 0.001; // seconds
  }
}
