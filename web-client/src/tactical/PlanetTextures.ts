/**
 * Procedural planet textures based on Star Trek lore.
 * Each planet gets a deterministic texture from its name, with terrain-type palettes
 * and facility overlay icons (Repair/Fuel/Agri).
 */

import * as THREE from 'three';
import { PLREPAIR, PLFUEL, PLAGRI } from '../constants';

// ============================================================
// Seeded PRNG (matches Starfield3D.ts pattern)
// ============================================================

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function makeRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ============================================================
// Terrain types & palettes
// ============================================================

type TerrainType = 'terran' | 'desert' | 'volcanic' | 'ice' | 'gas' | 'ocean' | 'jungle' | 'barren' | 'toxic';

const TERRAIN_PALETTES: Record<TerrainType, [number, number, number][]> = {
  terran:   [[40,160,50],  [70,200,130], [35,100,180], [180,165,120], [100,190,100]],
  desert:   [[194,154,90], [160,120,60], [210,180,120],[140,100,50],  [180,160,100]],
  volcanic: [[40,10,10],   [120,30,10],  [200,80,20],  [60,20,20],   [160,50,10]],
  ice:      [[200,220,240],[160,200,230],[220,240,255],[180,210,240], [140,180,220]],
  gas:      [[180,140,100],[200,170,130],[160,120,80], [220,190,150], [140,100,60]],
  ocean:    [[20,60,140],  [30,80,160],  [15,50,120],  [40,100,180],  [25,70,150]],
  jungle:   [[20,80,20],   [40,120,30],  [60,100,20],  [30,90,40],    [50,70,15]],
  barren:   [[100,90,80],  [120,110,100],[80,70,60],   [140,130,120], [90,80,70]],
  toxic:    [[80,120,40],  [100,140,60], [60,100,30],  [120,160,50],  [70,90,35]],
};

const ALL_TERRAIN_TYPES: TerrainType[] = [
  'terran', 'desert', 'volcanic', 'ice', 'gas', 'ocean', 'jungle', 'barren', 'toxic',
];

/** Map known Netrek planet names to lore-appropriate terrain types */
const KNOWN_PLANETS: Record<string, TerrainType> = {
  // Federation
  'Earth':       'terran',
  'Deneb':       'terran',
  'Ceti Alpha':  'barren',
  'Altair':      'desert',
  'Vega':        'gas',
  'Alpha Cent':  'terran',
  'Rigel':       'gas',
  'Canopus':     'ocean',
  'Spica':       'ice',
  'Procyon':     'terran',
  // Romulan
  'Romulus':     'desert',
  'Remus':       'barren',
  'Eridani':     'volcanic',
  'Aldeberan':   'gas',
  'Regulus':     'ocean',
  'Cappella':    'ice',
  'Tauri':       'desert',
  'Draconis':    'volcanic',
  'Sirius':      'terran',
  'Indi':        'jungle',
  // Klingon
  'Klingus':     'volcanic',
  'Praxis':      'volcanic',
  'Pollux':      'barren',
  'Arcturus':    'gas',
  'Ursae Maj':   'ice',
  'Herculis':    'desert',
  'Lyrae':       'terran',
  'Scorpii':     'toxic',
  'Antares':     'gas',
  'Beta Crucis': 'ice',
  // Orion
  'Orion':       'jungle',
  'Castor':      'terran',
  'Oberon':      'ice',
  'Gemini':      'desert',
  'Sagittari':   'gas',
  'Mira':        'volcanic',
  'Cygni':       'ocean',
  'Achernar':    'barren',
  'Tau Ceti':    'terran',
  'Pleides':     'toxic',
};

// ============================================================
// Noise generation
// ============================================================

const TEX_SIZE = 128;

/** Generate a 2D grid of random values at given resolution */
function makeNoiseGrid(res: number, rng: () => number): Float32Array {
  const grid = new Float32Array(res * res);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  return grid;
}

/** Bilinear interpolation sampling from a noise grid */
function sampleNoise(grid: Float32Array, res: number, u: number, v: number): number {
  const fx = u * res;
  const fy = v * res;
  const x0 = Math.floor(fx) % res;
  const y0 = Math.floor(fy) % res;
  const x1 = (x0 + 1) % res;
  const y1 = (y0 + 1) % res;
  const sx = fx - Math.floor(fx);
  const sy = fy - Math.floor(fy);

  const v00 = grid[y0 * res + x0];
  const v10 = grid[y0 * res + x1];
  const v01 = grid[y1 * res + x0];
  const v11 = grid[y1 * res + x1];

  const top = v00 + (v10 - v00) * sx;
  const bot = v01 + (v11 - v01) * sx;
  return top + (bot - top) * sy;
}

/** Generate base texture canvas for a planet name */
function generateBaseTexture(name: string): HTMLCanvasElement {
  const seed = hashName(name);
  const rng = makeRng(seed);

  // Determine terrain type
  const terrain: TerrainType = KNOWN_PLANETS[name] ??
    ALL_TERRAIN_TYPES[seed % ALL_TERRAIN_TYPES.length];
  const palette = TERRAIN_PALETTES[terrain];

  // 3-octave value noise grids
  const g8 = makeNoiseGrid(8, rng);
  const g16 = makeNoiseGrid(16, rng);
  const g32 = makeNoiseGrid(32, rng);

  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
  const data = imgData.data;

  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      const u = px / TEX_SIZE;
      const v = py / TEX_SIZE;

      // Combine octaves with decreasing weight
      const n = sampleNoise(g8, 8, u, v) * 0.5 +
                sampleNoise(g16, 16, u, v) * 0.3 +
                sampleNoise(g32, 32, u, v) * 0.2;

      // Map noise to palette index with blending
      const fi = n * (palette.length - 1);
      const i0 = Math.floor(fi);
      const i1 = Math.min(i0 + 1, palette.length - 1);
      const t = fi - i0;

      const c0 = palette[i0];
      const c1 = palette[i1];
      const r = c0[0] + (c1[0] - c0[0]) * t;
      const g = c0[1] + (c1[1] - c0[1]) * t;
      const b = c0[2] + (c1[2] - c0[2]) * t;

      const idx = (py * TEX_SIZE + px) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

// ============================================================
// Facility overlay icons
// ============================================================

/** Draw facility icons onto a canvas */
function drawFacilityOverlays(ctx: CanvasRenderingContext2D, flags: number) {
  const s = TEX_SIZE;

  // REPAIR: white cross/wrench, top-left quadrant
  if (flags & PLREPAIR) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const cx = s * 0.2, cy = s * 0.2, arm = s * 0.06;
    ctx.beginPath();
    ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy);
    ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm);
    ctx.stroke();
  }

  // FUEL: yellow lightning bolt, top-right quadrant
  if (flags & PLFUEL) {
    ctx.fillStyle = 'rgba(255, 220, 40, 0.85)';
    ctx.beginPath();
    const bx = s * 0.8, by = s * 0.15;
    const sc = s * 0.04;
    ctx.moveTo(bx - sc * 0.5, by);
    ctx.lineTo(bx + sc * 1, by);
    ctx.lineTo(bx - sc * 0.2, by + sc * 1.5);
    ctx.lineTo(bx + sc * 0.5, by + sc * 1.2);
    ctx.lineTo(bx - sc * 1, by + sc * 3);
    ctx.lineTo(bx + sc * 0.2, by + sc * 1.5);
    ctx.lineTo(bx - sc * 0.5, by + sc * 1.8);
    ctx.closePath();
    ctx.fill();
  }

  // AGRI: green circle/leaf, bottom-center
  if (flags & PLAGRI) {
    ctx.fillStyle = 'rgba(40, 200, 40, 0.85)';
    const ax = s * 0.5, ay = s * 0.82, r = s * 0.05;
    ctx.beginPath();
    ctx.arc(ax, ay, r, 0, Math.PI * 2);
    ctx.fill();
    // Small leaf accent
    ctx.strokeStyle = 'rgba(40, 200, 40, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay - r);
    ctx.quadraticCurveTo(ax + r * 1.5, ay - r * 2, ax + r * 0.5, ay - r * 0.3);
    ctx.stroke();
  }
}

// ============================================================
// PlanetTextureManager
// ============================================================

const FACILITY_MASK = PLREPAIR | PLFUEL | PLAGRI;

export class PlanetTextureManager {
  private baseCache = new Map<string, HTMLCanvasElement>();
  private textureCache = new Map<number, THREE.CanvasTexture>();
  // Per-planet composite canvases (reused, one per slot that needs a texture)
  private compositeCache = new Map<number, HTMLCanvasElement>();
  private lastFlags = new Map<number, number>();
  private lastName = new Map<number, string>();

  /** Get (or create/update) a THREE.CanvasTexture for a planet slot */
  getTexture(planetIndex: number, name: string, flags: number): THREE.CanvasTexture {
    const facFlags = flags & FACILITY_MASK;
    const prevFlags = this.lastFlags.get(planetIndex) ?? -1;
    const prevName = this.lastName.get(planetIndex) ?? '';

    const existing = this.textureCache.get(planetIndex);
    if (existing && prevName === name && prevFlags === facFlags) {
      return existing;
    }

    // Get or generate base texture
    let base = this.baseCache.get(name);
    if (!base) {
      base = generateBaseTexture(name);
      this.baseCache.set(name, base);
    }

    // Reuse composite canvas per planet slot (avoid creating new DOM elements)
    let composite = this.compositeCache.get(planetIndex);
    if (!composite) {
      composite = document.createElement('canvas');
      composite.width = TEX_SIZE;
      composite.height = TEX_SIZE;
      this.compositeCache.set(planetIndex, composite);
    }
    const ctx = composite.getContext('2d')!;
    ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
    ctx.drawImage(base, 0, 0);
    drawFacilityOverlays(ctx, facFlags);

    // Create or update THREE texture
    let tex = this.textureCache.get(planetIndex);
    if (tex) {
      tex.image = composite;
      tex.needsUpdate = true;
    } else {
      tex = new THREE.CanvasTexture(composite);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textureCache.set(planetIndex, tex);
    }

    this.lastFlags.set(planetIndex, facFlags);
    this.lastName.set(planetIndex, name);
    return tex;
  }
}
