/**
 * Animated tactical viewport indicator for the galactic map.
 * Shows the player's tactical camera frustum as a pulsing rectangle
 * with HUD-style corner brackets. Uses mesh planes for visible edges.
 */

import * as THREE from 'three';
import { TEAM_COLORS, IND } from '../constants';

const VIEWPORT_Y = 50;
const BRACKET_FRAC = 0.15; // fraction of edge length for corner brackets
const EDGE_WIDTH = 500;    // game units — visible at galactic scale
const BRACKET_WIDTH = 700; // slightly thicker for brackets

// Vertex shader — pass through with time uniform for animation
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader — pulsing fill with team color
const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;

  varying vec2 vUv;

  void main() {
    float pulse = 0.6 + sin(uTime * 3.0) * 0.2;
    gl_FragColor = vec4(uColor, uOpacity * pulse);
  }
`;

/** Create a flat XZ-plane mesh used as a thick line segment. */
function makeEdge(color: number, opacity: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

export class GalacticViewport {
  readonly group: THREE.Group;

  // 4 rectangle edge meshes
  private edges: THREE.Mesh[] = [];
  // 8 bracket arm meshes (4 corners × 2 arms)
  private brackets: THREE.Mesh[] = [];
  // Fill plane
  private fillMesh: THREE.Mesh;
  private fillUniforms: { uTime: { value: number }; uColor: { value: THREE.Color }; uOpacity: { value: number } };

  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;

    // 4 rectangle edges
    for (let i = 0; i < 4; i++) {
      const edge = makeEdge(0x888888, 0.7);
      this.edges.push(edge);
      this.group.add(edge);
    }

    // 8 bracket arms (brighter)
    for (let i = 0; i < 8; i++) {
      const arm = makeEdge(0xffffff, 0.9);
      this.brackets.push(arm);
      this.group.add(arm);
    }

    // Fill plane
    this.fillUniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x888888) },
      uOpacity: { value: 0.08 },
    };
    const fillMat = new THREE.ShaderMaterial({
      uniforms: this.fillUniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const fillGeo = new THREE.PlaneGeometry(1, 1);
    fillGeo.rotateX(-Math.PI / 2);
    this.fillMesh = new THREE.Mesh(fillGeo, fillMat);
    this.fillMesh.frustumCulled = false;
    this.fillMesh.renderOrder = 2;
    this.group.add(this.fillMesh);
  }

  update(playerX: number, playerZ: number, halfW: number, halfH: number, team: number) {
    this.group.visible = true;

    const x0 = playerX - halfW;
    const x1 = playerX + halfW;
    const z0 = playerZ - halfH;
    const z1 = playerZ + halfH;
    const w = x1 - x0;
    const h = z1 - z0;
    const y = VIEWPORT_Y;

    // Position/scale the 4 edge meshes (each is a thin rectangle)
    // Top edge: horizontal strip at z0
    this.edges[0].position.set((x0 + x1) / 2, y, z0);
    this.edges[0].scale.set(w, 1, EDGE_WIDTH);
    // Bottom edge: horizontal strip at z1
    this.edges[1].position.set((x0 + x1) / 2, y, z1);
    this.edges[1].scale.set(w, 1, EDGE_WIDTH);
    // Left edge: vertical strip at x0
    this.edges[2].position.set(x0, y, (z0 + z1) / 2);
    this.edges[2].scale.set(EDGE_WIDTH, 1, h);
    // Right edge: vertical strip at x1
    this.edges[3].position.set(x1, y, (z0 + z1) / 2);
    this.edges[3].scale.set(EDGE_WIDTH, 1, h);

    // Corner brackets — short L-arms
    const bw = w * BRACKET_FRAC;
    const bh = h * BRACKET_FRAC;

    // Top-left: horizontal arm
    this.brackets[0].position.set(x0 + bw / 2, y, z0);
    this.brackets[0].scale.set(bw, 1, BRACKET_WIDTH);
    // Top-left: vertical arm
    this.brackets[1].position.set(x0, y, z0 + bh / 2);
    this.brackets[1].scale.set(BRACKET_WIDTH, 1, bh);

    // Top-right: horizontal arm
    this.brackets[2].position.set(x1 - bw / 2, y, z0);
    this.brackets[2].scale.set(bw, 1, BRACKET_WIDTH);
    // Top-right: vertical arm
    this.brackets[3].position.set(x1, y, z0 + bh / 2);
    this.brackets[3].scale.set(BRACKET_WIDTH, 1, bh);

    // Bottom-right: horizontal arm
    this.brackets[4].position.set(x1 - bw / 2, y, z1);
    this.brackets[4].scale.set(bw, 1, BRACKET_WIDTH);
    // Bottom-right: vertical arm
    this.brackets[5].position.set(x1, y, z1 - bh / 2);
    this.brackets[5].scale.set(BRACKET_WIDTH, 1, bh);

    // Bottom-left: horizontal arm
    this.brackets[6].position.set(x0 + bw / 2, y, z1);
    this.brackets[6].scale.set(bw, 1, BRACKET_WIDTH);
    // Bottom-left: vertical arm
    this.brackets[7].position.set(x0, y, z1 - bh / 2);
    this.brackets[7].scale.set(BRACKET_WIDTH, 1, bh);

    // Fill plane
    this.fillMesh.position.set(playerX, y - 1, playerZ);
    this.fillMesh.scale.set(w, 1, h);

    // Team color
    const teamColor = TEAM_COLORS[team] ?? TEAM_COLORS[IND];
    for (const edge of this.edges) {
      (edge.material as THREE.MeshBasicMaterial).color.set(teamColor);
    }
    for (const arm of this.brackets) {
      (arm.material as THREE.MeshBasicMaterial).color.set(teamColor);
    }
    this.fillUniforms.uColor.value.set(teamColor);

    // Animate
    this.fillUniforms.uTime.value = Date.now() * 0.001;

    // Pulse edge opacity
    const pulse = 0.5 + Math.sin(Date.now() * 0.003) * 0.2;
    for (const edge of this.edges) {
      (edge.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
  }

  hide() {
    this.group.visible = false;
  }
}
