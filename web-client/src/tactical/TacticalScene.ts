/**
 * TacticalScene — Three.js scene, camera, lights, WebGLRenderer, per-frame entity sync.
 *
 * PerspectiveCamera looking straight down. Speed-based zoom.
 * Vapour trail via fade quad. Bloom post-processing.
 * Manages lifecycle of all sub-modules (starfield, grid, planets, ships, projectiles).
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { GameState, Player } from '../state';
import {
  TWIDTH, SHIP_STATS, PALIVE, PEXPLODE, PFREE, MAXPLAYER,
  SCOUT, DESTROYER, CRUISER, BATTLESHIP, ASSAULT, SGALAXY,
} from '../constants';

import { GridPlane } from './GridPlane';
import { Starfield3D } from './Starfield3D';
import { PlanetMeshes } from './PlanetMesh';
import { ShipMeshFactory } from './ShipMeshFactory';
import { ShipEffects } from './ShipEffects';
import { ProjectileMeshes } from './ProjectileMeshes';
import { BarrierWall } from './BarrierWall';
import { LabelRenderer } from '../LabelRenderer';

const TAC_RANGE = TWIDTH; // 20000
const FOV = 60;
const NEAR = 100;
const FAR = 50000;
const MAX_SPEED = 12;

// Full-range camera height = TAC_RANGE/2 / tan(FOV/2) ≈ 17320
const FULL_HEIGHT = (TAC_RANGE / 2) / Math.tan((FOV / 2) * Math.PI / 180);

// At speed 0 camera is zoomed in to 65% of full height (~11260)
// At max speed camera pulls back to full height
const BASE_HEIGHT = FULL_HEIGHT * 0.65;
const SPEED_ZOOM_FACTOR = 0.54; // 0.65 * (1 + 0.54) ≈ 1.0 → back to full height

// Vapour trail fade opacity (per frame)
const FADE_OPACITY = 0.12;

export class TacticalScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private webglRenderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private labelRenderer: LabelRenderer;

  // Sub-modules
  private grid: GridPlane;
  private starfield: Starfield3D;
  private planets: PlanetMeshes;
  private shipFactory: ShipMeshFactory;
  private shipEffects: ShipEffects;
  private projectiles: ProjectileMeshes;
  private barrier: BarrierWall;

  // Fade quad for vapour trail
  private fadeQuad: THREE.Mesh;
  private fadeScene: THREE.Scene;
  private fadeCamera: THREE.OrthographicCamera;

  // Speed-based zoom state
  private currentHeight = BASE_HEIGHT;

  // Ship mesh tracking — which team/type each player slot currently has
  private shipMeshKeys: string[] = new Array(MAXPLAYER).fill('');

  // Explosion tracking
  private explosionMeshes: THREE.Mesh[] = [];
  private explosionStartTimes: number[] = new Array(MAXPLAYER).fill(0);

  // Outfit showcase state
  private outfitMode = false;
  private outfitShipMeshes: THREE.Group[] = [];
  private outfitTeamKey = '';
  private outfitAngle = 0;
  private outfitCamera: THREE.OrthographicCamera;
  private outfitComposer: EffectComposer;

  // Outfit ship types displayed (excludes Starbase)
  private static readonly OUTFIT_SHIP_TYPES = [SCOUT, DESTROYER, CRUISER, BATTLESHIP, ASSAULT, SGALAXY];

  constructor(canvas: HTMLCanvasElement) {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.00002);

    // Camera
    this.camera = new THREE.PerspectiveCamera(FOV, 1, NEAR, FAR);
    this.camera.up.set(0, 0, -1); // -Z is "north" in our mapping

    // WebGL renderer — takes over the tactical canvas
    this.webglRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.webglRenderer.autoClear = false; // Manual clear for vapour trail
    this.webglRenderer.setPixelRatio(window.devicePixelRatio);
    this.webglRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.webglRenderer.toneMappingExposure = 1.2;

    // Canvas 2D label renderer (replaces CSS2DRenderer)
    this.labelRenderer = new LabelRenderer();

    // Post-processing: bloom
    this.composer = new EffectComposer(this.webglRenderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(300, 300),
      1.2,   // strength
      0.4,   // radius
      0.2    // threshold
    );
    this.composer.addPass(bloomPass);

    // Lighting
    const ambient = new THREE.AmbientLight(0x222222);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0x444466, 0.3);
    directional.position.set(5000, 20000, -5000);
    this.scene.add(directional);

    // Fade quad for vapour trail effect
    this.fadeScene = new THREE.Scene();
    this.fadeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const fadeGeo = new THREE.PlaneGeometry(2, 2);
    const fadeMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: FADE_OPACITY,
    });
    this.fadeQuad = new THREE.Mesh(fadeGeo, fadeMat);
    this.fadeScene.add(this.fadeQuad);

    // Sub-modules
    this.grid = new GridPlane();
    this.scene.add(this.grid.mesh);

    this.starfield = new Starfield3D();
    this.scene.add(this.starfield.group);

    this.planets = new PlanetMeshes();
    this.scene.add(this.planets.group);

    this.shipFactory = new ShipMeshFactory();

    this.shipEffects = new ShipEffects();
    this.scene.add(this.shipEffects.group);

    this.projectiles = new ProjectileMeshes();
    this.scene.add(this.projectiles.group);

    this.barrier = new BarrierWall();
    this.scene.add(this.barrier.group);

    // Orthographic camera for outfit showcase (no perspective distortion)
    const halfW = 2000;
    const halfH = 1500;
    this.outfitCamera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 1, 10000);
    this.outfitCamera.up.set(0, 0, -1);

    // Separate composer for outfit (uses ortho camera)
    this.outfitComposer = new EffectComposer(this.webglRenderer);
    const outfitRenderPass = new RenderPass(this.scene, this.outfitCamera);
    this.outfitComposer.addPass(outfitRenderPass);
    const outfitBloomPass = new UnrealBloomPass(
      new THREE.Vector2(300, 300),
      1.2, 0.4, 0.2,
    );
    this.outfitComposer.addPass(outfitBloomPass);

    // Pre-allocate explosion meshes
    for (let i = 0; i < MAXPLAYER; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff8800,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(200, 12, 8), mat);
      mesh.visible = false;
      mesh.position.y = 10;
      this.scene.add(mesh);
      this.explosionMeshes.push(mesh);
    }
  }

  /** Resize renderer to match canvas dimensions */
  resize(width: number, height: number) {
    const dpr = window.devicePixelRatio || 1;
    this.webglRenderer.setSize(width, height);
    this.webglRenderer.setPixelRatio(dpr);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(width * dpr, height * dpr);

    // Update outfit ortho camera to match aspect ratio
    const aspect = width / height;
    const orthoH = 1500;
    const orthoW = orthoH * aspect;
    this.outfitCamera.left = -orthoW;
    this.outfitCamera.right = orthoW;
    this.outfitCamera.top = orthoH;
    this.outfitCamera.bottom = -orthoH;
    this.outfitCamera.updateProjectionMatrix();
    this.outfitComposer.setSize(width * dpr, height * dpr);
  }

  /** Main render call for tactical view (alive/observe phases) */
  render(state: GameState) {
    this.outfitMode = false;

    const me = state.myNumber >= 0 ? state.players[state.myNumber] : null;
    if (!me || me.status === PFREE) {
      // Just render black
      this.webglRenderer.clear();
      return;
    }

    // Player position in Three.js coords: game (x, y) → Three.js (x, 0, y)
    const playerX = me.renderX;
    const playerZ = me.renderY;

    // Speed-based camera height
    const speed = me.status === PALIVE ? me.speed : 0;
    const speedRatio = speed / MAX_SPEED;
    const zoomCurve = speedRatio * speedRatio; // quadratic: stays zoomed in at low speeds
    const targetHeight = BASE_HEIGHT * (1 + zoomCurve * SPEED_ZOOM_FACTOR);
    this.currentHeight += (targetHeight - this.currentHeight) * 0.05;

    // Position camera looking straight down
    this.camera.position.set(playerX, this.currentHeight, playerZ);
    this.camera.lookAt(playerX, 0, playerZ);

    // Update sub-modules
    this.starfield.update(playerX, playerZ);
    const { halfW, halfH } = this.getVisibleHalfExtents();
    this.planets.update(state.planets, playerX, playerZ, halfW, halfH);
    this.updateShips(state, playerX, playerZ);
    this.shipEffects.update(state.players, state.myNumber, playerX, playerZ, TAC_RANGE);
    this.projectiles.update(state, playerX, playerZ, TAC_RANGE);
    this.updateExplosions(state);
    this.barrier.update(Date.now());

    // Render pipeline: vapour trail → scene → bloom
    // 1. Render fade quad (creates trail persistence)
    this.webglRenderer.render(this.fadeScene, this.fadeCamera);

    // 2. Render scene with bloom post-processing
    this.composer.render();
  }

  /** Get the visible game-space half-extents (accounts for aspect ratio and zoom) */
  getVisibleHalfExtents(): { halfW: number; halfH: number } {
    const halfH = this.currentHeight * Math.tan((FOV / 2) * Math.PI / 180);
    const halfW = halfH * this.camera.aspect;
    return { halfW, halfH };
  }

  /** Get projected 2D screen positions of outfit ship models */
  getOutfitScreenPositions(canvasWidth: number, canvasHeight: number): { x: number; y: number }[] {
    const positions: { x: number; y: number }[] = [];
    const vec = new THREE.Vector3();
    for (const mesh of this.outfitShipMeshes) {
      vec.copy(mesh.position);
      vec.project(this.outfitMode ? this.outfitCamera : this.camera);
      // Convert from NDC (-1..1) to pixel coords
      positions.push({
        x: (vec.x * 0.5 + 0.5) * canvasWidth,
        y: (-vec.y * 0.5 + 0.5) * canvasHeight,
      });
    }
    return positions;
  }

  /** Render outfit showcase: all 6 ship classes rotating in a 3x2 grid */
  renderOutfit(state: GameState, selectedTeam: number) {
    if (!this.outfitMode) {
      this.outfitMode = true;
      // Hide all tactical entities
      this.shipEffects.group.visible = false;
      this.projectiles.group.visible = false;
      this.planets.group.visible = false;
      this.grid.mesh.visible = false;
      this.barrier.group.visible = false;
      this.starfield.group.visible = true;
    }

    // Rebuild all 6 ship meshes when team changes
    const teamKey = `${selectedTeam}`;
    if (teamKey !== this.outfitTeamKey) {
      // Remove old meshes
      for (const mesh of this.outfitShipMeshes) {
        this.scene.remove(mesh);
      }
      this.outfitShipMeshes = [];

      if (selectedTeam) {
        const types = TacticalScene.OUTFIT_SHIP_TYPES;
        // 3x2 grid layout in 3D space — tight spacing so camera can zoom close
        const cols = 3;
        const spacingX = 1200;
        const spacingZ = 1200;
        for (let i = 0; i < types.length; i++) {
          const mesh = this.shipFactory.create(selectedTeam, types[i]);
          mesh.scale.multiplyScalar(0.667); // Reduce from tactical SHIP_SCALE for outfit display
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = (col - 1) * spacingX; // -1, 0, 1 → centered
          const z = (row - 0.5) * spacingZ; // -0.5, 0.5 → centered
          mesh.position.set(x, 0, z);
          this.scene.add(mesh);
          this.outfitShipMeshes.push(mesh);
        }
      }
      this.outfitTeamKey = teamKey;
    }

    // Rotate all ships — tilt toward camera so they're visible from above
    this.outfitAngle += 0.02;
    for (const mesh of this.outfitShipMeshes) {
      mesh.rotation.set(-Math.PI / 3, this.outfitAngle, 0);
    }

    // Ortho camera: top-down, no perspective distortion
    this.outfitCamera.position.set(0, 2500, 0);
    this.outfitCamera.lookAt(0, 0, 0);

    // Update starfield around origin
    this.starfield.update(0, 0);

    // Render with outfit composer (uses ortho camera)
    this.webglRenderer.clear(true, true, true);
    this.outfitComposer.render();
  }

  /** Restore tactical mode after outfit */
  restoreTacticalMode() {
    for (const mesh of this.outfitShipMeshes) {
      this.scene.remove(mesh);
    }
    this.outfitShipMeshes = [];
    this.outfitTeamKey = '';
    this.outfitMode = false;
    this.shipEffects.group.visible = true;
    this.projectiles.group.visible = true;
    this.planets.group.visible = true;
    this.grid.mesh.visible = true;
    this.barrier.group.visible = true;
    this.starfield.group.visible = true;
  }

  /** Clear the WebGL canvas (for non-tactical phases) */
  clear() {
    this.webglRenderer.clear(true, true, true);
  }

  /** Draw ship and planet labels onto a 2D canvas overlay */
  renderLabels(ctx: CanvasRenderingContext2D, width: number, height: number, planets: import('../state').Planet[]) {
    const lr = this.labelRenderer;
    const cam = this.camera;

    // Ship labels
    for (const data of this.shipEffects.getLabelData()) {
      const { x, y } = lr.project(data.worldPos, cam, width, height);
      if (x < -50 || x > width + 50 || y < -50 || y > height + 50) continue;
      lr.drawShipLabel(ctx, x, y, data.text, data.color, 11);
    }

    // Planet labels
    for (const data of this.planets.getLabelData(planets)) {
      const { x, y } = lr.project(data.worldPos, cam, width, height);
      if (x < -50 || x > width + 50 || y < -50 || y > height + 50) continue;
      lr.drawPlanetLabel(ctx, x, y, data.name, data.armies, data.flags, data.teamColor, 12);
    }
  }

  // ============================================================
  // Ship mesh management
  // ============================================================

  private updateShips(state: GameState, playerX: number, playerZ: number) {
    for (let i = 0; i < MAXPLAYER; i++) {
      const player = state.players[i];
      const alive = player.status === PALIVE;
      const exploding = player.status === PEXPLODE;

      if (!alive && !exploding) {
        this.shipMeshKeys[i] = '';
        continue;
      }

      // Check if ship mesh needs (re)creation
      const key = `${player.team}-${player.shipType}`;
      if (key !== this.shipMeshKeys[i]) {
        const mesh = this.shipFactory.create(player.team, player.shipType);
        this.shipEffects.setShipMesh(i, mesh);
        this.shipMeshKeys[i] = key;
      }
    }
  }

  // ============================================================
  // Explosions
  // ============================================================

  private updateExplosions(state: GameState) {
    const now = Date.now();
    const EXPLOSION_DURATION = 500;

    for (let i = 0; i < MAXPLAYER; i++) {
      const player = state.players[i];
      const mesh = this.explosionMeshes[i];

      if (player.status === PEXPLODE) {
        if (!this.explosionStartTimes[i]) {
          this.explosionStartTimes[i] = player.explodeStart || now;
        }

        mesh.visible = true;
        mesh.position.set(player.x, 10, player.y);

        const elapsed = now - this.explosionStartTimes[i];
        const t = Math.min(1, Math.max(0, elapsed / EXPLOSION_DURATION));

        // Expand and fade
        const scale = 1 + t * 4;
        mesh.scale.setScalar(scale);
        (mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.8;
        (mesh.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.5 * (1 - t), 0);
      } else {
        mesh.visible = false;
        this.explosionStartTimes[i] = 0;
      }
    }
  }
}
