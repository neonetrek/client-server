# Configurable Bot Difficulty

## Problem

All PRET-spawned bots play at the same skill level — full-strength AI with instant reactions, perfect dodge prediction, and optimal strategy. New players get destroyed immediately. There's no way for deployers to tune bot difficulty per instance via config.json.

## Current Difficulty Mechanics

### The `human` Skill Variable

robotd already has a built-in difficulty system via the login format `r1hXYZ`:
- **X** = skill level (0-9): 0 = expert AI, higher = slower/worse
- **Y** = player type: `o`=ogger, `p`=cautious, `s`=runner, `d`=defender, `f`=dogfighter, anything else = normal

The `_state.human` value (set from X) affects:

| Behavior | How `human` makes bots worse | Code |
|----------|------------------------------|------|
| Phaser accuracy | Subtracts `RANDOM() % 1000` from phaser range | robot.c:1141 |
| Dodge lookahead | `lookahead = 15 - human` (fewer ticks predicted) | dmessage.c:1009 |
| Reaction delay | Random delay before turning/firing: `RANDOM() % human` | robot.c:1446-1457 |
| Speed changes | Artificial delay before adjusting speed | robot.c:1442-1451 |
| Plasma detection | Ignores near-fused plasma at higher `human` values | robot.c:1166 |

### How PRET Spawns Bots

`pret.c:685` spawns all bots with the same login:
```c
"-X", PRE_T_ROBOT_LOGIN,  // = "Pre_T_Robot!"
```

This means:
- All bots get `human = 0` (expert AI)
- All bots get `PT_NORMAL` (no specialization)
- No variation between bots

### Other Tuning Levers (Hardcoded Today)

| Parameter | Current Value | Effect |
|-----------|--------------|--------|
| `tdanger_dist` | 1500 | Distance at which torps are considered dangerous |
| Fight distances | 9000-12000 (by ship) | How close before engaging |
| Damage flee threshold | 75% | When to disengage |
| Fuel flee threshold | 10% | When to disengage |
| Bomb army threshold | 5 armies | When a planet is worth bombing |

## Proposed Changes

### 1. New Sysdef: `PRET_DIFFICULTY` (0-9)

Add a sysdef parameter that controls the `human` skill level passed to PRET-spawned bots.

```
PRET_DIFFICULTY=0    # 0=expert (default, current behavior)
                     # 3=medium (noticeable delays, worse aim)
                     # 6=easy (slow reactions, poor dodge, misses often)
                     # 9=beginner (very slow, minimal dodge, bad aim)
```

**Implementation:** Modify `pret.c:start_a_robot()` to construct the login string with the configured difficulty digit:

```c
// Instead of fixed "Pre_T_Robot!"
// Build login like "r1h3nPre_T" where 3 = difficulty level
char login[16];
snprintf(login, sizeof(login), "r1h%dn%.6s", pret_difficulty, "Pre_T");
```

The robotd `main.c` already parses this format and sets `_state.human` accordingly. No changes needed in robotd itself.

### 2. Config.json Integration

Expose via the per-instance sysdef block:

```json
{
  "instances": [
    {
      "id": "pickup",
      "name": "Standard Pickup",
      "sysdef": { "PRET": 0 }
    },
    {
      "id": "beginner",
      "name": "Beginner Practice",
      "description": "Easy bots for learning the game",
      "sysdef": {
        "PRET": 1,
        "PRET_DIFFICULTY": 6
      }
    },
    {
      "id": "advanced",
      "name": "Advanced Practice",
      "description": "Challenging bots for experienced players",
      "sysdef": {
        "PRET": 1,
        "PRET_DIFFICULTY": 2
      }
    }
  ]
}
```

### 3. Difficulty Presets

Suggested mappings for documentation:

| Difficulty | `PRET_DIFFICULTY` | Reactions | Dodge | Aim | Strategy |
|------------|-------------------|-----------|-------|-----|----------|
| Expert | 0 | Instant | Full lookahead (15 ticks) | Perfect phaser range | Full (ogg, bomb, escort) |
| Hard | 2 | ~50ms jitter | Good (13 ticks) | Slight range reduction | Full |
| Medium | 4 | ~100ms jitter | Moderate (11 ticks) | Noticeable misses | Simplified |
| Easy | 6 | ~200ms jitter | Poor (9 ticks) | Frequent misses | Basic dogfight |
| Beginner | 9 | ~400ms jitter | Minimal (6 ticks) | Very inaccurate | Passive |

### 4. Mixed Difficulty (Future Enhancement)

Instead of all bots at one difficulty, PRET could spawn a mix — e.g. 2 hard bots and 2 easy bots per team. This would require a new sysdef like `PRET_DIFFICULTY_RANGE` or a comma-separated list.

Not in scope for the initial implementation, but the login-based difficulty system makes it trivial — each bot just gets a different login string.

### 5. Player Type Variation (Future Enhancement)

PRET could also vary bot specializations by appending a player type character to the login:

```c
// Rotate through types: normal, ogger, defender, dogfighter
const char types[] = "nodf";
char type = types[bot_index % 4];
snprintf(login, sizeof(login), "r1h%d%c%.5s", difficulty, type, "Pre_T");
```

This creates more interesting team dynamics — some bots ogg carriers, some defend, some just dogfight. Currently all bots play the same balanced style.

## Files

| File | Change |
|------|--------|
| `server/netrek-server/include/data.h` | `extern int pret_difficulty;` |
| `server/netrek-server/ntserv/data.c` | `int pret_difficulty = 0;` |
| `server/netrek-server/include/sysdefaults.h` | Add `PRET_DIFFICULTY` sysdef entry |
| `server/netrek-server/robots/pret.c` | Use `pret_difficulty` in login string for `start_a_robot()` |
| `entrypoint.sh` | Write `PRET_DIFFICULTY` from config.json sysdef block |

## Non-Goals

- **Not modifying robotd AI code.** The `human` variable already degrades bot performance across all the right dimensions. We just need to set it.
- **Not adding new difficulty dimensions.** The existing phaser jitter, reaction delay, and dodge lookahead scaling is well-tuned from decades of use.
- **Not exposing individual tuning knobs** (tdanger_dist, fight distances, thresholds). A single 0-9 slider is simpler for deployers than a dozen parameters.
