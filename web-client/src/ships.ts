/**
 * NeoNetrek Vector Ship Graphics
 *
 * Path-based ship outlines for each race and ship type, drawn on canvas.
 * Shapes are derived from classic Netrek sprite silhouettes.
 * All coordinates are normalized: centered at origin, unit scale (~-1 to 1).
 * Ships point "up" (toward -Y) at rest; rotation is applied at draw time.
 */

import {
  FED, ROM, KLI, ORI, IND,
  SCOUT, DESTROYER, CRUISER, BATTLESHIP, ASSAULT, STARBASE as STARBASE_TYPE, SGALAXY,
} from './constants';

interface ShipPath {
  hull: number[][];       // polygon vertices [[x,y], ...]
  details?: number[][][]; // additional line segments for detail strokes
}

// ============================================================
// Federation — angular, nacelle-forward Star Trek inspired
// ============================================================

const FED_SCOUT: ShipPath = {
  hull: [[0, -1], [0.4, -0.2], [0.6, 0.3], [0.3, 0.7], [-0.3, 0.7], [-0.6, 0.3], [-0.4, -0.2]],
  details: [[[0.4, -0.2], [0.7, -0.5]], [[-0.4, -0.2], [-0.7, -0.5]]],
};

const FED_DESTROYER: ShipPath = {
  hull: [[0, -1], [0.35, -0.3], [0.5, 0.1], [0.5, 0.6], [0.2, 0.8], [-0.2, 0.8], [-0.5, 0.6], [-0.5, 0.1], [-0.35, -0.3]],
  details: [[[0.35, -0.3], [0.75, -0.6]], [[-0.35, -0.3], [-0.75, -0.6]]],
};

const FED_CRUISER: ShipPath = {
  hull: [[0, -1], [0.2, -0.5], [0.3, 0], [0.3, 0.5], [0.15, 0.8], [-0.15, 0.8], [-0.3, 0.5], [-0.3, 0], [-0.2, -0.5]],
  details: [
    [[0.3, 0], [0.8, -0.3]],    // right nacelle strut
    [[-0.3, 0], [-0.8, -0.3]],  // left nacelle strut
    [[0.8, -0.5], [0.8, -0.1]], // right nacelle
    [[-0.8, -0.5], [-0.8, -0.1]], // left nacelle
  ],
};

const FED_BATTLESHIP: ShipPath = {
  hull: [[0, -1], [0.3, -0.5], [0.45, 0], [0.45, 0.5], [0.25, 0.9], [-0.25, 0.9], [-0.45, 0.5], [-0.45, 0], [-0.3, -0.5]],
  details: [
    [[0.45, -0.1], [0.9, -0.4]],
    [[-0.45, -0.1], [-0.9, -0.4]],
    [[0.9, -0.6], [0.9, -0.2]],
    [[-0.9, -0.6], [-0.9, -0.2]],
    [[0, -0.5], [0, 0.3]], // dorsal line
  ],
};

const FED_ASSAULT: ShipPath = {
  hull: [[0, -0.8], [0.4, -0.2], [0.5, 0.4], [0.4, 0.9], [-0.4, 0.9], [-0.5, 0.4], [-0.4, -0.2]],
  details: [
    [[0.4, -0.2], [0.7, -0.4]],
    [[-0.4, -0.2], [-0.7, -0.4]],
    [[-0.25, 0.2], [0.25, 0.2]], // cargo bay line
  ],
};

const FED_GALAXY: ShipPath = {
  hull: [[0, -1], [0.25, -0.4], [0.35, 0.1], [0.35, 0.6], [0.15, 0.9], [-0.15, 0.9], [-0.35, 0.6], [-0.35, 0.1], [-0.25, -0.4]],
  details: [
    [[0.35, 0.1], [0.85, -0.2]],
    [[-0.35, 0.1], [-0.85, -0.2]],
    [[0.85, -0.4], [0.85, 0]],
    [[-0.85, -0.4], [-0.85, 0]],
  ],
};

// ============================================================
// Romulan — sleek bird-like profiles with swept wings
// ============================================================

const ROM_SCOUT: ShipPath = {
  hull: [[0, -1], [0.3, -0.3], [0.8, 0.1], [0.5, 0.5], [0.2, 0.6], [-0.2, 0.6], [-0.5, 0.5], [-0.8, 0.1], [-0.3, -0.3]],
};

const ROM_DESTROYER: ShipPath = {
  hull: [[0, -1], [0.25, -0.4], [0.9, 0], [0.6, 0.5], [0.2, 0.7], [-0.2, 0.7], [-0.6, 0.5], [-0.9, 0], [-0.25, -0.4]],
  details: [[[0, -0.6], [0, 0.3]]],
};

const ROM_CRUISER: ShipPath = {
  hull: [[0, -1], [0.2, -0.5], [0.95, 0.1], [0.7, 0.5], [0.2, 0.8], [-0.2, 0.8], [-0.7, 0.5], [-0.95, 0.1], [-0.2, -0.5]],
  details: [
    [[0, -0.6], [0, 0.4]],       // spine
    [[0.2, -0.2], [0.6, 0.1]],   // right wing strut
    [[-0.2, -0.2], [-0.6, 0.1]], // left wing strut
  ],
};

const ROM_BATTLESHIP: ShipPath = {
  hull: [[0, -1], [0.25, -0.5], [1, 0.1], [0.8, 0.6], [0.3, 0.9], [-0.3, 0.9], [-0.8, 0.6], [-1, 0.1], [-0.25, -0.5]],
  details: [
    [[0, -0.6], [0, 0.5]],
    [[0.3, -0.1], [0.7, 0.2]],
    [[-0.3, -0.1], [-0.7, 0.2]],
  ],
};

const ROM_ASSAULT: ShipPath = {
  hull: [[0, -0.8], [0.3, -0.3], [0.8, 0.2], [0.5, 0.7], [0.2, 0.9], [-0.2, 0.9], [-0.5, 0.7], [-0.8, 0.2], [-0.3, -0.3]],
  details: [[[-0.2, 0.2], [0.2, 0.2]]],
};

const ROM_GALAXY: ShipPath = {
  hull: [[0, -1], [0.2, -0.5], [1, 0.05], [0.75, 0.5], [0.2, 0.85], [-0.2, 0.85], [-0.75, 0.5], [-1, 0.05], [-0.2, -0.5]],
  details: [
    [[0, -0.6], [0, 0.4]],
    [[0.25, 0], [0.65, 0.15]],
    [[-0.25, 0], [-0.65, 0.15]],
  ],
};

// ============================================================
// Klingon — aggressive, forward-heavy with sharp angles
// ============================================================

const KLI_SCOUT: ShipPath = {
  hull: [[0, -1], [0.5, -0.1], [0.7, 0.3], [0.3, 0.6], [-0.3, 0.6], [-0.7, 0.3], [-0.5, -0.1]],
};

const KLI_DESTROYER: ShipPath = {
  hull: [[0, -1], [0.15, -0.4], [0.6, -0.1], [0.8, 0.4], [0.3, 0.7], [-0.3, 0.7], [-0.8, 0.4], [-0.6, -0.1], [-0.15, -0.4]],
  details: [[[0, -0.5], [0, 0.3]]],
};

const KLI_CRUISER: ShipPath = {
  hull: [[0, -1], [0.15, -0.5], [0.2, -0.1], [0.7, 0.1], [0.9, 0.5], [0.3, 0.8], [-0.3, 0.8], [-0.9, 0.5], [-0.7, 0.1], [-0.2, -0.1], [-0.15, -0.5]],
  details: [
    [[0.2, -0.1], [0.7, 0.1]],  // right wing bar
    [[-0.2, -0.1], [-0.7, 0.1]], // left wing bar
    [[0, -0.5], [0, 0.3]],
  ],
};

const KLI_BATTLESHIP: ShipPath = {
  hull: [[0, -1], [0.2, -0.5], [0.25, -0.1], [0.8, 0.15], [1, 0.5], [0.35, 0.9], [-0.35, 0.9], [-1, 0.5], [-0.8, 0.15], [-0.25, -0.1], [-0.2, -0.5]],
  details: [
    [[0.25, -0.1], [0.8, 0.15]],
    [[-0.25, -0.1], [-0.8, 0.15]],
    [[0, -0.5], [0, 0.5]],
  ],
};

const KLI_ASSAULT: ShipPath = {
  hull: [[0, -0.8], [0.3, -0.2], [0.7, 0.2], [0.6, 0.7], [0.2, 0.9], [-0.2, 0.9], [-0.6, 0.7], [-0.7, 0.2], [-0.3, -0.2]],
  details: [[[-0.2, 0.2], [0.2, 0.2]]],
};

const KLI_GALAXY: ShipPath = {
  hull: [[0, -1], [0.2, -0.5], [0.25, -0.1], [0.75, 0.1], [0.95, 0.5], [0.3, 0.85], [-0.3, 0.85], [-0.95, 0.5], [-0.75, 0.1], [-0.25, -0.1], [-0.2, -0.5]],
  details: [
    [[0.25, -0.1], [0.75, 0.1]],
    [[-0.25, -0.1], [-0.75, 0.1]],
    [[0, -0.5], [0, 0.4]],
  ],
};

// ============================================================
// Orion — rounded, organic curves
// ============================================================

const ORI_SCOUT: ShipPath = {
  hull: [[0, -0.9], [0.4, -0.5], [0.6, 0], [0.5, 0.4], [0.3, 0.6], [-0.3, 0.6], [-0.5, 0.4], [-0.6, 0], [-0.4, -0.5]],
};

const ORI_DESTROYER: ShipPath = {
  hull: [[0, -1], [0.35, -0.5], [0.6, -0.1], [0.65, 0.3], [0.5, 0.6], [0.2, 0.8], [-0.2, 0.8], [-0.5, 0.6], [-0.65, 0.3], [-0.6, -0.1], [-0.35, -0.5]],
};

const ORI_CRUISER: ShipPath = {
  hull: [[0, -1], [0.3, -0.6], [0.55, -0.2], [0.7, 0.2], [0.6, 0.6], [0.3, 0.85], [-0.3, 0.85], [-0.6, 0.6], [-0.7, 0.2], [-0.55, -0.2], [-0.3, -0.6]],
  details: [
    [[0, -0.5], [0, 0.4]],
    [[0.3, 0], [0.5, 0.1]],
    [[-0.3, 0], [-0.5, 0.1]],
  ],
};

const ORI_BATTLESHIP: ShipPath = {
  hull: [[0, -1], [0.35, -0.6], [0.6, -0.2], [0.75, 0.25], [0.65, 0.65], [0.35, 0.9], [-0.35, 0.9], [-0.65, 0.65], [-0.75, 0.25], [-0.6, -0.2], [-0.35, -0.6]],
  details: [
    [[0, -0.5], [0, 0.5]],
    [[0.35, 0], [0.55, 0.15]],
    [[-0.35, 0], [-0.55, 0.15]],
  ],
};

const ORI_ASSAULT: ShipPath = {
  hull: [[0, -0.8], [0.4, -0.3], [0.6, 0.1], [0.55, 0.5], [0.3, 0.8], [-0.3, 0.8], [-0.55, 0.5], [-0.6, 0.1], [-0.4, -0.3]],
  details: [[[-0.2, 0.15], [0.2, 0.15]]],
};

const ORI_GALAXY: ShipPath = {
  hull: [[0, -1], [0.3, -0.6], [0.6, -0.15], [0.75, 0.25], [0.6, 0.65], [0.3, 0.9], [-0.3, 0.9], [-0.6, 0.65], [-0.75, 0.25], [-0.6, -0.15], [-0.3, -0.6]],
  details: [
    [[0, -0.5], [0, 0.5]],
    [[0.35, 0.05], [0.55, 0.15]],
    [[-0.35, 0.05], [-0.55, 0.15]],
  ],
};

// ============================================================
// Starbase — shared across all races (large, circular station)
// ============================================================

const STARBASE_PATH: ShipPath = {
  hull: [
    [0, -1], [0.38, -0.92], [0.71, -0.71], [0.92, -0.38],
    [1, 0], [0.92, 0.38], [0.71, 0.71], [0.38, 0.92],
    [0, 1], [-0.38, 0.92], [-0.71, 0.71], [-0.92, 0.38],
    [-1, 0], [-0.92, -0.38], [-0.71, -0.71], [-0.38, -0.92],
  ],
  details: [
    // Inner ring
    [[0, -0.5], [0.35, -0.35], [0.5, 0], [0.35, 0.35], [0, 0.5], [-0.35, 0.35], [-0.5, 0], [-0.35, -0.35], [0, -0.5]],
    // Docking pylons
    [[0, -1], [0, -0.5]],
    [[1, 0], [0.5, 0]],
    [[0, 1], [0, 0.5]],
    [[-1, 0], [-0.5, 0]],
  ],
};

// ============================================================
// Ship path lookup: team → shipType → ShipPath
// ============================================================

const FED_SHIPS: Record<number, ShipPath> = {
  [SCOUT]: FED_SCOUT,
  [DESTROYER]: FED_DESTROYER,
  [CRUISER]: FED_CRUISER,
  [BATTLESHIP]: FED_BATTLESHIP,
  [ASSAULT]: FED_ASSAULT,
  [STARBASE_TYPE]: STARBASE_PATH,
  [SGALAXY]: FED_GALAXY,
};

const ROM_SHIPS: Record<number, ShipPath> = {
  [SCOUT]: ROM_SCOUT,
  [DESTROYER]: ROM_DESTROYER,
  [CRUISER]: ROM_CRUISER,
  [BATTLESHIP]: ROM_BATTLESHIP,
  [ASSAULT]: ROM_ASSAULT,
  [STARBASE_TYPE]: STARBASE_PATH,
  [SGALAXY]: ROM_GALAXY,
};

const KLI_SHIPS: Record<number, ShipPath> = {
  [SCOUT]: KLI_SCOUT,
  [DESTROYER]: KLI_DESTROYER,
  [CRUISER]: KLI_CRUISER,
  [BATTLESHIP]: KLI_BATTLESHIP,
  [ASSAULT]: KLI_ASSAULT,
  [STARBASE_TYPE]: STARBASE_PATH,
  [SGALAXY]: KLI_GALAXY,
};

const ORI_SHIPS: Record<number, ShipPath> = {
  [SCOUT]: ORI_SCOUT,
  [DESTROYER]: ORI_DESTROYER,
  [CRUISER]: ORI_CRUISER,
  [BATTLESHIP]: ORI_BATTLESHIP,
  [ASSAULT]: ORI_ASSAULT,
  [STARBASE_TYPE]: STARBASE_PATH,
  [SGALAXY]: ORI_GALAXY,
};

const SHIP_PATHS: Record<number, Record<number, ShipPath>> = {
  [FED]: FED_SHIPS,
  [ROM]: ROM_SHIPS,
  [KLI]: KLI_SHIPS,
  [ORI]: ORI_SHIPS,
  [IND]: FED_SHIPS, // fallback
};

/**
 * Draw a vector ship on canvas.
 *
 * @param ctx - canvas rendering context
 * @param team - team constant (FED, ROM, KLI, ORI)
 * @param shipType - ship type constant (SCOUT, CRUISER, etc.)
 * @param dir - netrek direction 0-255 (0=north, clockwise)
 * @param x - screen x position
 * @param y - screen y position
 * @param size - ship render size in pixels (radius)
 * @param color - team color string
 */
export function drawShipSVG(
  ctx: CanvasRenderingContext2D,
  team: number, shipType: number,
  dir: number,
  x: number, y: number,
  size: number, color: string,
) {
  const teamPaths = SHIP_PATHS[team] ?? SHIP_PATHS[FED];
  const path = teamPaths[shipType] ?? teamPaths[CRUISER] ?? FED_CRUISER;
  const angle = (dir / 256) * Math.PI * 2 - Math.PI / 2;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(size, size);

  // CRT glow on ship lines
  ctx.shadowBlur = 6;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 / size;

  // Draw hull outline
  ctx.beginPath();
  const hull = path.hull;
  ctx.moveTo(hull[0][0], hull[0][1]);
  for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i][0], hull[i][1]);
  ctx.closePath();

  // Subtle fill
  ctx.fillStyle = color + '18';
  ctx.fill();
  ctx.stroke();

  // Draw detail lines
  if (path.details) {
    ctx.lineWidth = 0.8 / size;
    for (const seg of path.details) {
      ctx.beginPath();
      ctx.moveTo(seg[0][0], seg[0][1]);
      for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i][0], seg[i][1]);
      ctx.stroke();
    }
  }

  ctx.restore();
}
