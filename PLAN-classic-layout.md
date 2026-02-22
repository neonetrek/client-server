# Classic 4-Panel Layout + CRT Effect + Ship Sprites

## Context

The current web client shows only one view at a time (tactical OR galactic, toggled with Tab). The user wants the classic Netrek layout where both views are shown simultaneously alongside a status bar, player list, and message log. Additionally, add a CRT glow/scanline effect to simulate an old monitor, and replace the plain triangle ship rendering with distinct race/ship-type sprites sourced from the html5-netrek project.

## Three Features

1. **4-Panel Layout** - Tactical + Galactic side-by-side, status bar, player list, message log
2. **CRT Glow Effect** - Scanlines, phosphor glow on ALL drawn lines (canvas + HTML)
3. **SVG Ship Graphics** - Vector ships per race/ship-type, derived from classic sprite shapes, with CRT glow on strokes

---

## Target Layout

```
+------------------+------------------+
|    Tactical      |    Galactic      |   ~60% viewport height
|    (canvas)      |    (canvas)      |   (two squares, side-by-side)
+------------------+------------------+
|         Status Bars Strip           |   32px fixed height
+-----------------+-------------------+
|  Player List    |   Messages        |   remaining height
|  (HTML table)   |   (scrolling div) |
+-----------------+-------------------+
```

---

## Part 1: 4-Panel Layout

### `index.html` — DOM restructure + CSS

- Replace flat `#app` with: `#map-row` (two canvases), `#status-bar`, `#bottom-row` (`#player-list` + `#message-panel`)
- Remove `display:none` from galactic canvas (both always visible)
- CSS flex layout: map-row flex-row, bottom-row flex-row with `flex:1`
- Dark terminal styling for player list (monospace table) and message panel (scrolling div)
- Canvas sizing: `canvasSize = min(floor(vw/2), floor(vh*0.6))`

### `renderer.ts` — Major refactor

**Remove:**
- `showGalactic` field, `toggleView()`, `isGalacticView` getter
- Canvas-based HUD from `renderTactical()` (the `this.renderHUD()` call)
- Canvas-based message rendering from `renderTactical()`
- `renderHUD()` and `drawBar()` methods (replaced by HTML strip)

**Change:**
- Constructor: accept 3 new HTML elements (statusBar, playerList, messagePanel)
- `render()`: always call both `renderTactical()` + `renderGalactic()`, plus HTML panel updates

**Add:**
- `initStatusBar()` — DOM skeleton for SH/HU/FU/WT/ET bars with cached refs
- `updateStatusBar()` — updates bar fills + speed/armies/kills/flags each frame
- `initPlayerListHeader()` — table with header row (No, Tm, Shp, Rank, Name, Kills, Login)
- `updatePlayerList()` — rebuild tbody when player data changes (hash-based dirty check)
- `updateMessages()` — append new messages incrementally, auto-scroll to bottom

### `main.ts` — Sizing + wiring

- Grab new DOM elements (`#status-bar`, `#player-list`, `#message-panel`)
- Pass to Renderer constructor
- New `resizeLayout()`: compute `canvasSize = min(floor(vw/2), floor(vh*0.6))`, size both canvases, set panel widths/heights
- Call on load + resize

### `input.ts` — Cleanup

- Remove Tab key toggle handler (both views always visible)
- Remove `isGalacticView` guard in `onMouseDown()`

### `constants.ts` — Add RANK_NAMES

```ts
export const RANK_NAMES = ['Ensign','Lieutenant','Lt. Cmdr','Commander','Captain','Flt. Capt','Commodore','Rear Adm','Admiral'];
```

---

## Part 2: CRT Glow Effect

The CRT glow applies to **all drawn lines** — canvas strokes, text, HTML elements. This creates a unified phosphor glow aesthetic across the entire interface.

### Canvas glow (ships, phasers, grid, text)

Apply `ctx.shadowBlur` and `ctx.shadowColor` before drawing operations in renderer.ts:

```ts
// Before drawing any colored element:
ctx.shadowBlur = 6;
ctx.shadowColor = color; // match the element's color (team color, phaser color, etc.)
```

This makes every canvas line, ship outline, phaser beam, torpedo, and text label emit a soft glow matching its color. Set `ctx.shadowBlur = 0` when drawing fills that shouldn't glow (e.g. black backgrounds).

Key glow intensities:
- **Phasers**: `shadowBlur = 12` (bright weapon glow)
- **Ships/shields**: `shadowBlur = 6` (medium glow)
- **Grid lines**: `shadowBlur = 2` (subtle glow)
- **Text labels**: `shadowBlur = 4`
- **Torpedoes**: `shadowBlur = 8`

### CSS glow (HTML panels)

```css
#player-list, #message-panel, #status-bar {
  text-shadow: 0 0 4px rgba(0, 255, 0, 0.4);
}
.hud-bar-fill {
  box-shadow: 0 0 6px currentColor;
}
```

### Scanlines overlay (CSS)

```css
#map-row {
  position: relative;
}
#map-row::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px,
    transparent 1px, transparent 3px
  );
  pointer-events: none;
  z-index: 10;
}
```

### Screen vignette + contrast

```css
#app {
  filter: contrast(1.1) brightness(1.02);
}
canvas {
  box-shadow: inset 0 0 80px rgba(0,0,0,0.4);
}
```

---

## Part 3: SVG Ship Graphics

### Approach: Vector ship outlines drawn on canvas

Instead of raster PNG sprites, create **vector (path-based) ship outlines** for each race and ship type. These are drawn via Canvas2D `Path2D` objects, giving us:
- Perfect scaling at any resolution
- CRT glow via `shadowBlur` on strokes (lines glow like a real CRT)
- Team-colored strokes with dark/transparent fills
- Lightweight (no external image files to load)

### Reference: Classic Netrek sprite shapes

Use the html5-netrek PNG sprites (`https://github.com/apsillers/html5-netrek/data/img/`) as **visual reference** to trace the distinctive silhouettes of each ship per race. Each race has unique hull shapes:

- **Federation**: Angular, nacelle-forward Star Trek inspired shapes
- **Romulan**: Sleek, bird-like profiles with swept wings
- **Klingon**: Aggressive, forward-heavy with sharp angles
- **Orion**: Rounded, organic curves

Ship types per race (7 combat ships):
- **SC** (Scout) — small, fast
- **DD** (Destroyer) — medium, balanced
- **CA** (Cruiser) — standard workhorse
- **BB** (Battleship) — large, heavy
- **AS** (Assault) — troop carrier
- **SB** (Starbase) — huge, stationary
- **GA** (Galaxy) — large cruiser variant

### New file: `src/ships.ts`

Define ship outlines as normalized Path2D data (centered at origin, unit scale):

```ts
interface ShipPath {
  hull: number[][]; // polygon vertices [[x,y], ...]
  details?: number[][][]; // additional line segments for detail
}

// Map: team → shipType → ShipPath
const SHIP_PATHS: Record<number, Record<number, ShipPath>> = {
  [FED]: {
    [CRUISER]: {
      hull: [[0,-1],[0.5,0.3],[-0.5,0.3]], // simplified example
      details: [[[0,-0.5],[0.3,0.1]], [[-0.3,0.1],[0,-0.5]]], // nacelle struts
    },
    // ... other Fed ships
  },
  [ROM]: { /* Romulan ship outlines */ },
  [KLI]: { /* Klingon ship outlines */ },
  [ORI]: { /* Orion ship outlines */ },
};
```

Provide a drawing function:

```ts
export function drawShipSVG(
  ctx: CanvasRenderingContext2D,
  team: number, shipType: number,
  dir: number, // 0-255
  x: number, y: number,
  size: number, color: string
) {
  const path = SHIP_PATHS[team]?.[shipType] ?? SHIP_PATHS[FED]?.[CRUISER];
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
```

### Update `renderer.ts`

Replace the triangle body in `drawTacShip()` with a call to `drawShipSVG()`. Keep:
- Shield circle rendering
- Player label (team letter + number)
- Ship type label
- Cloak transparency

---

## Files Modified

| File | Changes |
|------|---------|
| `web-client/index.html` | DOM restructure, new CSS (layout + CRT + scanlines) |
| `web-client/src/renderer.ts` | Remove toggle/HUD/msg, add HTML panels, use SVG ships, add shadowBlur glow |
| `web-client/src/main.ts` | New sizing, new DOM refs, resize handler |
| `web-client/src/input.ts` | Remove Tab toggle + galactic guard |
| `web-client/src/constants.ts` | Add RANK_NAMES |
| `web-client/src/ships.ts` | **New** — vector ship path definitions + drawing function |

## Verification

1. `npx tsc --noEmit` — type check passes
2. `docker compose up --build -d` — rebuild and deploy
3. Open http://localhost:3000/play/ — verify:
   - Both tactical and galactic maps visible side-by-side
   - Status bars update in real-time
   - Player list shows active players with team colors
   - Message panel shows and scrolls chat
   - CRT scanlines and glow visible
   - Ship sprites render per-race with correct rotation
   - Help overlay (`?`) still works
   - Mouse controls still work on tactical canvas
   - Responsive sizing on resize
