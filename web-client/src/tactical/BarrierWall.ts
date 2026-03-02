/**
 * BarrierWall — Glowing energy barrier at the edges of the galaxy.
 *
 * Four tall vertical planes at x=0, x=GWIDTH, z=0, z=GWIDTH.
 * Custom shader creates animated pink/purple energy streaks.
 * Additive blending makes it glow through the existing bloom pass.
 */

import * as THREE from 'three';
import { GWIDTH } from '../constants';

const WALL_BOTTOM = -500;
const WALL_TOP = 2000;
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

  void main() {
    // Vertical energy streaks at varying frequencies
    float streak1 = sin(vUv.x * 40.0 + uTime * 2.0) * 0.5 + 0.5;
    float streak2 = sin(vUv.x * 80.0 - uTime * 3.0) * 0.5 + 0.5;
    float streak3 = sin(vUv.x * 15.0 + uTime * 1.5) * 0.5 + 0.5;
    float streaks = streak1 * 0.4 + streak2 * 0.3 + streak3 * 0.3;

    // Vertical gradient — brightest in the middle, fading at edges
    float vertGrad = 1.0 - abs(vUv.y - 0.5) * 2.0;
    vertGrad = pow(vertGrad, 0.5);

    // Horizontal scroll wave
    float scroll = sin(vUv.x * 5.0 + uTime) * 0.3 + 0.7;

    // Overall pulse
    float pulse = sin(uTime * 0.8) * 0.15 + 0.85;

    // Pink → purple color gradient driven by streak pattern
    vec3 pink   = vec3(1.0, 0.27, 1.0);
    vec3 purple = vec3(0.53, 0.27, 1.0);
    vec3 color  = mix(purple, pink, streaks);

    float alpha = streaks * vertGrad * scroll * pulse * 0.6;
    gl_FragColor = vec4(color * (0.8 + streaks * 0.5), alpha);
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
    depthWrite: false,
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

    this.group.add(west, east, north, south);
  }

  /** Advance animation time. Call once per frame. */
  update(now: number) {
    this.timeUniform.value = now * 0.001; // seconds
  }
}
