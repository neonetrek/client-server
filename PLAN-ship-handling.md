# Faster Ship Handling — Speed & Turn Response

## Problem

Classic Netrek ship handling was designed for 1990s play conditions: 10 FPS server tick rate, 28.8k modem latency, and mouse-driven course setting. With the web client's keyboard controls (arrow keys for turning, up/down for speed), the current acceleration/deceleration and turn rates feel sluggish to modern players. A cruiser at speed 9 takes several seconds to reach full speed and turns like a barge.

The handling should feel more responsive while remaining configurable — both per-ship (preserving the scout-vs-battleship feel) and per-instance (so deployers can tune for their audience).

## Current Mechanics

### Server-Side: Speed Changes (`daemon.c:1225-1238`)

Speed changes are governed by two ship stats:
- **`s_accint`** — acceleration increment per server frame
- **`s_decint`** — deceleration increment per server frame

Each frame, `p_subspeed += s_accint` (or `s_decint` for slowing). When `p_subspeed` crosses 1000, actual speed ticks by 1. At 10 FPS:

| Ship | s_accint | s_decint | Frames to +1 speed | Time to max speed |
|------|----------|----------|--------------------|--------------------|
| Scout (max 12) | 200 | 270 | 5 | ~6.0s (0→12) |
| Destroyer (max 10) | 200 | 300 | 5 | ~5.0s (0→10) |
| Cruiser (max 9) | 150 | 200 | 6-7 | ~6.3s (0→9) |
| Battleship (max 8) | 80 | 180 | 12-13 | ~10.0s (0→8) |
| Assault (max 8) | 100 | 200 | 10 | ~8.0s (0→8) |
| Starbase (max 2-3) | 100 | 200 | 10 | ~2.0s (0→2) |
| Galaxy (max 9) | 150 | 240 | 6-7 | ~6.3s (0→9) |

### Server-Side: Turn Rate (`daemon.c:1847-1885`)

Turn rate uses `s_turns` divided by `speed^2`:

```c
sp->p_subdir += sp->p_ship.s_turns / (speed * speed);
ticks = sp->p_subdir / 1000;  // direction ticks per frame
```

At speed 0, direction sets instantly. At higher speeds:

| Ship | s_turns | Dir ticks/frame @ spd 5 | Dir ticks/frame @ spd 9 | Full turn @ spd 9 |
|------|---------|------------------------|------------------------|-------------------|
| Scout | 570000 | 22 | 7 | ~3.7s |
| Destroyer | 310000 | 12 | 3 | ~8.5s |
| Cruiser | 170000 | 6 | 2 | ~12.8s |
| Battleship | 75000 | 3 | 0.9 | ~28.4s |
| Galaxy | 192500 | 7 | 2 | ~11.1s |

### Client-Side: Arrow Key Turning (`input.ts:91-171`)

The client mirrors the server formula at 20 FPS (half the server increment per tick). Also applies a `MAX_STEP = 8` cap per tick to keep turns controllable at low speeds.

### Client-Side: Arrow Key Speed (`input.ts:107-126`)

Held arrow up/down increments desired speed by 1 every 200ms. The server then accelerates/decelerates toward the desired speed using `s_accint`/`s_decint`.

## Proposed Changes

### 1. Server-Side: Configurable Ship Handling Multipliers

Add three new sysdef parameters that act as global multipliers on the base ship stats:

```
# sysdef options (per instance via config.json)
ACCEL_MULT=1.0        # multiplier on all ships' s_accint (default 1.0)
DECEL_MULT=1.0        # multiplier on all ships' s_decint (default 1.0)
TURN_MULT=1.0         # multiplier on all ships' s_turns  (default 1.0)
```

Applied in `daemon.c` where the values are read:
- Speed: `p_subspeed += (int)(s_accint * accel_mult)` and `(int)(s_decint * decel_mult)`
- Turn: `p_subdir += (int)(s_turns * turn_mult) / (speed * speed)`

This preserves ship-to-ship ratios (scout is always nimbler than battleship) while letting deployers scale the overall responsiveness.

**Suggested presets:**

| Profile | ACCEL_MULT | DECEL_MULT | TURN_MULT | Feel |
|---------|-----------|-----------|----------|------|
| Classic | 1.0 | 1.0 | 1.0 | Original Netrek |
| Responsive | 1.5 | 1.5 | 1.5 | Noticeably snappier |
| Arcade | 2.5 | 2.5 | 2.0 | Fast and twitchy |
| Dogfight | 2.0 | 2.0 | 2.5 | Quick turns, fast combat |

### 2. Server-Side: Per-Ship Sysdef Overrides

The server already supports per-ship stat overrides in sysdef via the `shipdefs()` parser:

```
SHIP
SC s_accint 400
SC s_decint 540
SC s_turns 855000
END
```

Document this in config.json examples so deployers know they can tune individual ships without code changes. The instance sysdef in config.json can include these blocks.

### 3. Client-Side: Faster Arrow Speed Keys

Currently held ArrowUp/Down changes desired speed every 200ms (5 increments/second). This can feel slow for a ship with max speed 12 — it takes 2.4 seconds just to *request* full speed, before acceleration even starts.

**Options:**

**A) Reduce throttle interval** from 200ms to 100ms (10 increments/second). Scout goes 0→12 request in 1.2s.

**B) Speed ramping** — first press is immediate, then accelerate the repeat rate:
- First tick: instant
- 0-300ms held: 1 increment per 200ms
- 300ms+ held: 1 increment per 100ms
- 600ms+ held: 1 increment per 50ms

**C) Multi-speed jump** — holding ArrowUp at speed 0 sends max speed directly (like pressing `9` or `!`). This gives instant "go full speed" while ArrowDown still decrements one at a time for fine control.

Recommendation: **Option A** (simple, predictable).

### 4. Client-Side: Instant Max/Zero Speed Keys

Add keyboard shortcuts for instant speed extremes:

| Key | Action | Rationale |
|-----|--------|-----------|
| `Space` | Set speed to max | Quick "full speed ahead" without holding ArrowUp |
| `Backspace` | Set speed to 0 | Emergency stop |

These are purely client convenience — they just send `sendSpeed(maxSpeed)` or `sendSpeed(0)`. The server still accelerates/decelerates at `s_accint`/`s_decint` rate.

### 5. Config.json Integration

Expose the multipliers in config.json's per-instance sysdef block:

```json
{
  "instances": [
    {
      "id": "pickup",
      "name": "Standard Pickup",
      "sysdef": {
        "PRET": 0,
        "ACCEL_MULT": 1.0,
        "DECEL_MULT": 1.0,
        "TURN_MULT": 1.0
      }
    },
    {
      "id": "dogfight",
      "name": "Dogfight Arena",
      "sysdef": {
        "DOGFIGHT": 1,
        "ACCEL_MULT": 2.0,
        "DECEL_MULT": 2.0,
        "TURN_MULT": 2.5
      }
    }
  ]
}
```

## Implementation Order

1. **Client: reduce arrow speed throttle** — trivial, one constant change
2. **Client: instant max/zero speed keys** — trivial, two new key handlers
3. **Server: global multiplier sysdef params** — moderate, add 3 floats to sysdef parser + apply in daemon.c
4. **Server: per-ship sysdef documentation** — docs only, feature already exists
5. **Config.json: expose multipliers** — update entrypoint.sh sysdef generation

## Files

| File | Change |
|------|--------|
| `web-client/src/input.ts` | Reduce speed throttle, add Space/Backspace speed keys |
| `server/netrek-server/ntserv/sysdefaults.c` | Parse ACCEL_MULT, DECEL_MULT, TURN_MULT |
| `server/netrek-server/ntserv/data.c` | Declare multiplier globals |
| `server/netrek-server/ntserv/daemon.c` | Apply multipliers in speed/turn calculations |
| `server/netrek-server/include/data.h` | Extern declarations for multiplier globals |
| `entrypoint.sh` | Write float sysdef values from config.json |
| `docs/sample_sysdef.in` | Document new options |

## Non-Goals

- **Not changing movement physics** (WARP1 speed constant, SPM spatial scale). These affect torpedoes, orbits, and everything else — too wide a blast radius.
- **Not adding client-side prediction for speed**. The client already shows desired speed; actual speed comes from server. Adding prediction would cause desyncs.
- **Not changing the speed^2 turn penalty**. The quadratic relationship is core to Netrek tactics (high speed = committed to a heading). The multiplier scales the base rate but preserves the curve shape.
