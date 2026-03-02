/**
 * GalacticScene — Three.js scene for the galactic map view.
 *
 * OrthographicCamera looking straight down at the full galaxy.
 * Separate WebGLRenderer (not shared with tactical).
 * Lighter bloom than tactical for the dense small view.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { GameState } from '../state';
import { GWIDTH, PALIVE, PFREE } from '../constants';

import { GalacticGrid } from './GalacticGrid';
import { GalacticStarfield } from './GalacticStarfield';
import { GalacticPlanets } from './GalacticPlanets';
import { GalacticPlayers } from './GalacticPlayers';
import { GalacticViewport } from './GalacticViewport';
import { LabelRenderer } from '../LabelRenderer';

const PADDING = 2000;
const CAMERA_Y = 5000;

export class GalacticScene {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private webglRenderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private labelRenderer: LabelRenderer;

  // Sub-modules
  private grid: GalacticGrid;
  private starfield: GalacticStarfield;
  private planets: GalacticPlanets;
  private players: GalacticPlayers;
  private viewport: GalacticViewport;

  constructor(canvas: HTMLCanvasElement) {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // Orthographic camera covering full galaxy.
    // Camera at galaxy center looking down. Ortho bounds are symmetric around camera position.
    // With camera at (GWIDTH/2, Y, GWIDTH/2), we need ±(GWIDTH/2 + PADDING) in each axis.
    const half = GWIDTH / 2 + PADDING;
    this.camera = new THREE.OrthographicCamera(-half, half, half, -half, 1, 10000);
    this.camera.position.set(GWIDTH / 2, CAMERA_Y, GWIDTH / 2);
    this.camera.up.set(0, 0, -1); // -Z = north (matches tactical)
    this.camera.lookAt(GWIDTH / 2, 0, GWIDTH / 2);

    // WebGL renderer
    this.webglRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.webglRenderer.setPixelRatio(window.devicePixelRatio);
    this.webglRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.webglRenderer.toneMappingExposure = 1.0;

    // Canvas 2D label renderer (replaces CSS2DRenderer)
    this.labelRenderer = new LabelRenderer();

    // Post-processing: lighter bloom than tactical
    this.composer = new EffectComposer(this.webglRenderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(300, 300),
      0.6,   // strength (tactical uses 1.2)
      0.3,   // radius
      0.4,   // threshold (tactical uses 0.2)
    );
    this.composer.addPass(bloomPass);

    // Ambient light — brighter than tactical since top-down flat view
    const ambient = new THREE.AmbientLight(0x333333);
    this.scene.add(ambient);

    // Sub-modules
    this.grid = new GalacticGrid();
    this.scene.add(this.grid.group);

    this.starfield = new GalacticStarfield();
    this.scene.add(this.starfield.points);

    this.planets = new GalacticPlanets();
    this.scene.add(this.planets.group);

    this.players = new GalacticPlayers();
    this.scene.add(this.players.group);

    this.viewport = new GalacticViewport();
    this.scene.add(this.viewport.group);
  }

  resize(width: number, height: number) {
    const dpr = window.devicePixelRatio || 1;
    this.webglRenderer.setSize(width, height);
    this.webglRenderer.setPixelRatio(dpr);

    // Maintain correct ortho frustum for the canvas aspect ratio.
    // Camera is at (GWIDTH/2, Y, GWIDTH/2), so ortho bounds are symmetric around origin.
    const half = GWIDTH / 2 + PADDING;
    const aspect = width / height;
    if (aspect >= 1) {
      // Wider than tall: expand horizontal
      this.camera.left = -half * aspect;
      this.camera.right = half * aspect;
      this.camera.top = half;
      this.camera.bottom = -half;
    } else {
      // Taller than wide: expand vertical
      this.camera.left = -half;
      this.camera.right = half;
      this.camera.top = half / aspect;
      this.camera.bottom = -half / aspect;
    }
    this.camera.updateProjectionMatrix();
    this.composer.setSize(width * dpr, height * dpr);
  }

  render(state: GameState, halfExtents: { halfW: number; halfH: number }) {
    // Update sub-modules
    this.planets.update(state.planets);
    this.players.update(state.players, state.myNumber);

    // Viewport indicator
    const me = state.myNumber >= 0 ? state.players[state.myNumber] : null;
    if (me && me.status === PALIVE) {
      this.viewport.update(me.x, me.y, halfExtents.halfW, halfExtents.halfH, me.team);
    } else {
      this.viewport.hide();
    }

    // Render
    this.composer.render();
  }

  /** Draw planet and player labels onto a 2D canvas overlay */
  renderLabels(ctx: CanvasRenderingContext2D, width: number, height: number, state: GameState) {
    const lr = this.labelRenderer;
    const cam = this.camera;

    // Planet labels
    for (const data of this.planets.getLabelData(state.planets)) {
      const { x, y } = lr.project(data.worldPos, cam, width, height);
      if (x < -50 || x > width + 50 || y < -50 || y > height + 50) continue;
      lr.drawPlanetLabel(ctx, x, y, data.name, data.armies, data.flags, data.teamColor, 9);
    }

    // Player labels
    for (const data of this.players.getLabelData()) {
      const { x, y } = lr.project(data.worldPos, cam, width, height);
      if (x < -50 || x > width + 50 || y < -50 || y > height + 50) continue;
      lr.drawShipLabel(ctx, x, y, data.text, data.color, 8);
    }
  }

  clear() {
    this.webglRenderer.clear(true, true, true);
  }
}
