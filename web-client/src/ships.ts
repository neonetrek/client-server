/**
 * NeoNetrek Vector Ship Graphics
 *
 * Wireframe ship outlines for each race and ship type, drawn on canvas.
 * Shapes traced from classic Netrek 20x20 XBM/BMP sprite silhouettes.
 * All coordinates normalized: centered at origin, scale ~-1 to 1.
 * Ships point "up" (toward -Y) at rest; rotation applied at draw time.
 */

import {
  FED, ROM, KLI, ORI, IND,
  SCOUT, DESTROYER, CRUISER, BATTLESHIP, ASSAULT, STARBASE as STARBASE_TYPE, SGALAXY,
} from './constants';

export interface ShipPath {
  hull: number[][];       // polygon vertices [[x,y], ...]
  details?: number[][][]; // additional line segments for detail strokes
}

// ============================================================
// Federation — saucer + body + nacelle struts (Enterprise)
// ============================================================

const FED_SCOUT: ShipPath = {
  // Saucer section + thin stem (lollipop shape)
  hull: [
    [0, -0.8],
    [0.2, -0.75], [0.32, -0.6], [0.38, -0.45], [0.32, -0.3], [0.15, -0.15],
    [0.08, -0.05], [0.08, 0.65],
    [-0.08, 0.65], [-0.08, -0.05],
    [-0.15, -0.15], [-0.32, -0.3], [-0.38, -0.45], [-0.32, -0.6], [-0.2, -0.75],
  ],
};

const FED_DESTROYER: ShipPath = {
  // Saucer + thin body, nacelle tubes on sides
  hull: [
    [0, -0.8],
    [0.2, -0.75], [0.35, -0.55], [0.4, -0.35], [0.35, -0.15], [0.15, 0],
    [0.08, 0.05], [0.08, 0.85],
    [-0.08, 0.85], [-0.08, 0.05],
    [-0.15, 0], [-0.35, -0.15], [-0.4, -0.35], [-0.35, -0.55], [-0.2, -0.75],
  ],
  details: [
    [[0.15, -0.05], [0.35, 0.05]],    // right strut
    [[0.35, 0.15], [0.35, 0.85]],      // right nacelle tube
    [[-0.15, -0.05], [-0.35, 0.05]],   // left strut
    [[-0.35, 0.15], [-0.35, 0.85]],    // left nacelle tube
  ],
};

const FED_CRUISER: ShipPath = {
  // Classic Enterprise: saucer + body + prominent nacelle struts
  hull: [
    [0, -0.8],
    [0.2, -0.75], [0.35, -0.55], [0.4, -0.35], [0.35, -0.15], [0.15, 0],
    [0.08, 0.05], [0.08, 0.9],
    [-0.08, 0.9], [-0.08, 0.05],
    [-0.15, 0], [-0.35, -0.15], [-0.4, -0.35], [-0.35, -0.55], [-0.2, -0.75],
  ],
  details: [
    [[0.15, -0.05], [0.35, 0.1]],     // right upper strut
    [[0.15, 0.05], [0.35, 0.2]],      // right lower strut
    [[0.35, -0.05], [0.35, 0.9]],     // right nacelle tube
    [[-0.15, -0.05], [-0.35, 0.1]],   // left upper strut
    [[-0.15, 0.05], [-0.35, 0.2]],    // left lower strut
    [[-0.35, -0.05], [-0.35, 0.9]],   // left nacelle tube
  ],
};

const FED_BATTLESHIP: ShipPath = {
  // Larger saucer, thicker nacelles
  hull: [
    [0, -0.9],
    [0.2, -0.85], [0.38, -0.65], [0.45, -0.4], [0.38, -0.15], [0.15, 0.05],
    [0.08, 0.1], [0.08, 0.9],
    [-0.08, 0.9], [-0.08, 0.1],
    [-0.15, 0.05], [-0.38, -0.15], [-0.45, -0.4], [-0.38, -0.65], [-0.2, -0.85],
  ],
  details: [
    [[0.15, 0], [0.4, 0.1]],          // right upper strut
    [[0.15, 0.15], [0.4, 0.25]],      // right lower strut
    [[0.4, -0.1], [0.4, 0.9]],        // right nacelle
    [[-0.15, 0], [-0.4, 0.1]],        // left upper strut
    [[-0.15, 0.15], [-0.4, 0.25]],    // left lower strut
    [[-0.4, -0.1], [-0.4, 0.9]],      // left nacelle
    [[0, -0.4], [0, 0.3]],            // dorsal spine
  ],
};

const FED_ASSAULT: ShipPath = {
  // Saucer + wide troop-carrier body
  hull: [
    [0, -0.8],
    [0.2, -0.75], [0.35, -0.55], [0.4, -0.35], [0.35, -0.15],
    [0.5, -0.05], [0.5, 0.85],
    [-0.5, 0.85], [-0.5, -0.05],
    [-0.35, -0.15], [-0.4, -0.35], [-0.35, -0.55], [-0.2, -0.75],
  ],
  details: [
    [[-0.3, 0.15], [0.3, 0.15]],      // cargo bay line
    [[-0.3, 0.55], [0.3, 0.55]],      // lower cargo bay line
  ],
};

const FED_GALAXY: ShipPath = {
  // Extra-large saucer + nacelles
  hull: [
    [0, -0.75],
    [0.25, -0.75], [0.5, -0.55], [0.6, -0.25], [0.5, 0.05], [0.25, 0.05],
    [0.15, 0.15], [0.15, 0.85],
    [-0.15, 0.85], [-0.15, 0.15],
    [-0.25, 0.05], [-0.5, 0.05], [-0.6, -0.25], [-0.5, -0.55], [-0.25, -0.75],
  ],
  details: [
    [[0.25, 0.15], [0.45, 0.2]],      // right strut
    [[0.45, 0.05], [0.45, 0.85]],     // right nacelle
    [[-0.25, 0.15], [-0.45, 0.2]],    // left strut
    [[-0.45, 0.05], [-0.45, 0.85]],   // left nacelle
  ],
};

// ============================================================
// Klingon — head + thin boom + wide wing bar (D7/Bird of Prey)
// ============================================================

const KLI_SCOUT: ShipPath = {
  // Small angular head + thin boom + cross-wing + tail
  hull: [
    [0, -0.75],
    [0.25, -0.55], [0.15, -0.35],
    [0.08, -0.25], [0.08, -0.05],
    [0.45, -0.05], [0.45, 0.25],
    [0.08, 0.25], [0.08, 0.65],
    [-0.08, 0.65], [-0.08, 0.25],
    [-0.45, 0.25], [-0.45, -0.05],
    [-0.08, -0.05], [-0.08, -0.25],
    [-0.15, -0.35], [-0.25, -0.55],
  ],
};

const KLI_DESTROYER: ShipPath = {
  // Pointed head + thin boom + wide wing bar at bottom
  hull: [
    [0, -0.75],
    [0.15, -0.55], [0.1, -0.35],
    [0.08, -0.25], [0.08, -0.05],
    [0.15, 0.05],
    [0.65, 0.2], [0.65, 0.55],
    [0.15, 0.55], [0.15, 0.65],
    [-0.15, 0.65], [-0.15, 0.55],
    [-0.65, 0.55], [-0.65, 0.2],
    [-0.15, 0.05],
    [-0.08, -0.05], [-0.08, -0.25],
    [-0.1, -0.35], [-0.15, -0.55],
  ],
  details: [
    [[0, -0.3], [0, 0.4]],            // spine
  ],
};

const KLI_CRUISER: ShipPath = {
  // Small head + long thin boom + wide wing bar
  hull: [
    [0, -0.8],
    [0.2, -0.65], [0.15, -0.45],
    [0.08, -0.35], [0.08, 0.05],
    [0.55, 0.05], [0.55, 0.35],
    [0.15, 0.35], [0.15, 0.65],
    [-0.15, 0.65], [-0.15, 0.35],
    [-0.55, 0.35], [-0.55, 0.05],
    [-0.08, 0.05], [-0.08, -0.35],
    [-0.15, -0.45], [-0.2, -0.65],
  ],
  details: [
    [[0, -0.4], [0, 0.5]],            // spine
  ],
};

const KLI_BATTLESHIP: ShipPath = {
  // Forked nose + thick body + very wide wings
  hull: [
    [0, -0.85],
    [0.15, -0.65], [0.3, -0.35], [0.25, -0.05],
    [0.6, -0.05], [0.6, 0.35],
    [0.08, 0.35], [0.08, 0.75],
    [-0.08, 0.75], [-0.08, 0.35],
    [-0.6, 0.35], [-0.6, -0.05],
    [-0.25, -0.05], [-0.3, -0.35], [-0.15, -0.65],
  ],
  details: [
    [[0, -0.85], [0, -0.45]],         // fork notch
    [[0, -0.1], [0, 0.55]],           // spine
  ],
};

const KLI_ASSAULT: ShipPath = {
  // Pointed head + body + wide wing section + lower body
  hull: [
    [0, -0.8],
    [0.15, -0.55], [0.1, -0.35],
    [0.08, -0.15], [0.08, -0.05],
    [0.55, -0.05], [0.55, 0.35],
    [0.15, 0.35], [0.15, 0.55],
    [0.25, 0.55], [0.25, 0.85],
    [-0.25, 0.85], [-0.25, 0.55],
    [-0.15, 0.55], [-0.15, 0.35],
    [-0.55, 0.35], [-0.55, -0.05],
    [-0.08, -0.05], [-0.08, -0.15],
    [-0.1, -0.35], [-0.15, -0.55],
  ],
  details: [
    [[0, -0.4], [0, 0.5]],            // spine
  ],
};

const KLI_GALAXY: ShipPath = {
  // Tiny head + very long body + very wide swept wings near bottom
  hull: [
    [0, -0.8],
    [0.15, -0.55], [0.1, -0.35],
    [0.08, -0.25], [0.08, 0.05],
    [0.85, 0.15], [0.85, 0.35],
    [0.4, 0.45], [0.3, 0.55],
    [0.15, 0.55], [0.15, 0.85],
    [-0.15, 0.85], [-0.15, 0.55],
    [-0.3, 0.55], [-0.4, 0.45],
    [-0.85, 0.35], [-0.85, 0.15],
    [-0.08, 0.05], [-0.08, -0.25],
    [-0.1, -0.35], [-0.15, -0.55],
  ],
  details: [
    [[0, -0.4], [0, 0.6]],            // spine
  ],
};

// ============================================================
// Romulan — wide horizontal wing spread (Warbird / Bird of Prey)
// ============================================================

const ROM_SCOUT: ShipPath = {
  // Wide horizontal cross shape with vertical wingtip extensions
  hull: [
    [0, -0.15],
    [0.15, -0.15],
    [0.45, -0.45], [0.55, -0.45],
    [0.55, 0.45], [0.45, 0.45],
    [0.15, 0.15],
    [0, 0.15],
    [-0.15, 0.15],
    [-0.45, 0.45], [-0.55, 0.45],
    [-0.55, -0.45], [-0.45, -0.45],
    [-0.15, -0.15],
  ],
  details: [
    [[0, -0.25], [0, 0.25]],          // center body
    [[-0.35, 0], [0.35, 0]],          // wing bar
  ],
};

const ROM_DESTROYER: ShipPath = {
  // Small head + thin body + very wide wing bar + tail
  hull: [
    [0, -0.85],
    [0.15, -0.55], [0.1, -0.35],
    [0.08, -0.15],
    [0.7, -0.15], [0.7, 0.15],
    [0.25, 0.25], [0.15, 0.35],
    [0.15, 0.85],
    [-0.15, 0.85], [-0.15, 0.35],
    [-0.25, 0.25], [-0.7, 0.15],
    [-0.7, -0.15],
    [-0.08, -0.15], [-0.1, -0.35],
    [-0.15, -0.55],
  ],
  details: [
    [[0, -0.5], [0, 0.6]],            // spine
  ],
};

const ROM_CRUISER: ShipPath = {
  // Very wide flat bird-of-prey wings, minimal body
  hull: [
    [0, -0.25],
    [0.25, -0.45], [0.7, -0.45],
    [0.7, 0.45],
    [0.25, 0.15],
    [0, 0.25],
    [-0.25, 0.15],
    [-0.7, 0.45],
    [-0.7, -0.45], [-0.25, -0.45],
  ],
  details: [
    [[0, -0.3], [0, 0.15]],           // spine
    [[0.2, -0.1], [0.5, 0.05]],       // right wing strut
    [[-0.2, -0.1], [-0.5, 0.05]],     // left wing strut
  ],
};

const ROM_BATTLESHIP: ShipPath = {
  // Even wider wings at top + body/tail section below
  hull: [
    [0, -0.75],
    [0.25, -0.75], [0.7, -0.75],
    [0.7, 0.15],
    [0.45, 0.15], [0.45, 0.85],
    [-0.45, 0.85], [-0.45, 0.15],
    [-0.7, 0.15],
    [-0.7, -0.75], [-0.25, -0.75],
  ],
  details: [
    [[0, -0.5], [0, 0.5]],            // spine
    [[0.25, -0.1], [0.55, 0.05]],     // right wing strut
    [[-0.25, -0.1], [-0.55, 0.05]],   // left wing strut
    [[0.3, 0.35], [0.3, 0.7]],        // right nacelle stub
    [[-0.3, 0.35], [-0.3, 0.7]],      // left nacelle stub
  ],
};

const ROM_ASSAULT: ShipPath = {
  // Oval body + wide midsection + narrow tail
  hull: [
    [0, -0.8],
    [0.2, -0.65], [0.3, -0.45],
    [0.55, -0.35], [0.55, 0.05],
    [0.45, 0.15], [0.3, 0.2],
    [0.2, 0.55], [0.15, 0.85],
    [-0.15, 0.85], [-0.2, 0.55],
    [-0.3, 0.2], [-0.45, 0.15],
    [-0.55, 0.05], [-0.55, -0.35],
    [-0.3, -0.45], [-0.2, -0.65],
  ],
  details: [
    [[-0.25, 0.05], [0.25, 0.05]],    // waist line
  ],
};

const ROM_GALAXY: ShipPath = {
  // Small head + large swept wings expanding downward
  hull: [
    [0, -0.8],
    [0.1, -0.55], [0.1, -0.35],
    [0.7, -0.05], [0.7, 0.05],
    [0.45, 0.15],
    [0.25, 0.35],
    [0, 0.55],
    [-0.25, 0.35],
    [-0.45, 0.15],
    [-0.7, 0.05], [-0.7, -0.05],
    [-0.1, -0.35], [-0.1, -0.55],
  ],
  details: [
    [[0, -0.5], [0, 0.35]],           // spine
    [[0.2, 0.05], [0.5, 0.05]],       // right wing bar
    [[-0.2, 0.05], [-0.5, 0.05]],     // left wing bar
  ],
};

// ============================================================
// Orion — segmented organic body with multiple width sections
// ============================================================

const ORI_SCOUT: ShipPath = {
  // Diamond head + thin neck + cross section + two legs
  hull: [
    [0, -0.75],
    [0.15, -0.55], [0.1, -0.35],
    [0.3, -0.15], [0.1, 0.05],
    [0.2, 0.15],
    [0.2, 0.65],
    [-0.2, 0.65],
    [-0.2, 0.15],
    [-0.1, 0.05], [-0.3, -0.15],
    [-0.1, -0.35], [-0.15, -0.55],
  ],
  details: [
    [[0, -0.3], [0, 0.15]],           // center spine
    [[-0.15, -0.05], [0.15, -0.05]],  // cross piece
  ],
};

const ORI_DESTROYER: ShipPath = {
  // Oval head tapering wider toward bottom with struts
  hull: [
    [0, -0.85],
    [0.15, -0.65], [0.2, -0.25],
    [0.5, 0.05], [0.6, 0.25],
    [0.5, 0.45],
    [0.35, 0.45], [0.35, 0.85],
    [-0.35, 0.85], [-0.35, 0.45],
    [-0.5, 0.45],
    [-0.6, 0.25], [-0.5, 0.05],
    [-0.2, -0.25], [-0.15, -0.65],
  ],
  details: [
    [[0, -0.5], [0, 0.6]],            // spine
  ],
};

const ORI_CRUISER: ShipPath = {
  // Oval head + cross-wings + wider lower body
  hull: [
    [0, -0.75],
    [0.2, -0.45], [0.1, -0.25],
    [0.45, -0.05], [0.6, 0.25],
    [0.5, 0.5], [0.35, 0.55],
    [0.35, 0.85],
    [-0.35, 0.85], [-0.35, 0.55],
    [-0.5, 0.5], [-0.6, 0.25],
    [-0.45, -0.05], [-0.1, -0.25],
    [-0.2, -0.45],
  ],
  details: [
    [[0, -0.4], [0, 0.5]],            // spine
    [[0.2, 0.05], [0.4, 0.15]],       // right strut
    [[-0.2, 0.05], [-0.4, 0.15]],     // left strut
  ],
};

const ORI_BATTLESHIP: ShipPath = {
  // Tall, narrow, segmented body
  hull: [
    [0, -0.8],
    [0.2, -0.55], [0.25, -0.25],
    [0.35, -0.15], [0.35, 0.1],
    [0.25, 0.2],
    [0.4, 0.35], [0.4, 0.85],
    [-0.4, 0.85], [-0.4, 0.35],
    [-0.25, 0.2],
    [-0.35, 0.1], [-0.35, -0.15],
    [-0.25, -0.25], [-0.2, -0.55],
  ],
  details: [
    [[0, -0.5], [0, 0.6]],            // spine
    [[-0.2, 0.05], [0.2, 0.05]],      // cross piece
  ],
};

const ORI_ASSAULT: ShipPath = {
  // Stacked diamond segments, widening toward bottom
  hull: [
    [0, -0.75],
    [0.2, -0.45], [0.1, -0.25],
    [0.2, -0.15], [0.1, 0.05],
    [0.6, 0.35], [0.6, 0.55],
    [0.35, 0.55], [0.25, 0.85],
    [-0.25, 0.85], [-0.35, 0.55],
    [-0.6, 0.55], [-0.6, 0.35],
    [-0.1, 0.05], [-0.2, -0.15],
    [-0.1, -0.25], [-0.2, -0.45],
  ],
};

const ORI_GALAXY: ShipPath = {
  // Complex multi-section organic shape with cross-pieces
  hull: [
    [0, -0.75],
    [0.2, -0.45],
    [0.45, -0.35], [0.55, -0.15],
    [0.35, 0.05],
    [0.5, 0.25], [0.5, 0.45],
    [0.35, 0.55], [0.3, 0.85],
    [-0.3, 0.85], [-0.35, 0.55],
    [-0.5, 0.45], [-0.5, 0.25],
    [-0.35, 0.05],
    [-0.55, -0.15], [-0.45, -0.35],
    [-0.2, -0.45],
  ],
  details: [
    [[0, -0.45], [0, 0.55]],          // spine
    [[0.2, -0.05], [0.35, 0.05]],     // right inner strut
    [[-0.2, -0.05], [-0.35, 0.05]],   // left inner strut
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

export const SHIP_PATHS: Record<number, Record<number, ShipPath>> = {
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
  // Ships point up (-Y); dir 0=north needs no rotation
  const angle = (dir / 256) * Math.PI * 2;

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
