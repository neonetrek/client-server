# T-Mode with Bots

## Problem

Tournament Mode (T-Mode) requires `tournplayers` (default 5) **human** players per team on at least 2 teams. The server explicitly excludes bots (`PFROBOT` flag) from this count. With a small player base, T-Mode may never trigger, meaning stats are never recorded and the game feels low-stakes even with bots filling slots.

## Current Mechanism

`is_tournament_mode()` in `daemon.c:418-449` counts alive players per team, skipping any with the `PFROBOT` flag:

```c
if (!(p->p_flags & PFROBOT)) {   // skip bots
    count[p->p_team]++;
}
if (count[FED] >= tournplayers) quorum[i++] = FED;
```

`TOURN` is already a sysdef parameter (`sysdefaults.h:94`) that sets `tournplayers`. Configurable via config.json today.

## Options

### A) Lower `TOURN` threshold (config only, no code change)

Set `"TOURN": 1` in the instance sysdef. T-Mode triggers with just 1 human per team (2 humans total). Bots still don't count, but the bar is so low it doesn't matter.

```json
{
  "id": "bots",
  "sysdef": {
    "PRET": 1,
    "TOURN": 1
  }
}
```

**Pros:** Zero code changes. Works today via config.json.
**Cons:** T-Mode with 1 human + 7 bots could feel like stat farming.

### B) New sysdef flag: `TOURN_COUNT_ROBOTS`

Add a boolean sysdef parameter. When enabled, `is_tournament_mode()` counts bots toward the `tournplayers` threshold.

```c
// daemon.c is_tournament_mode() — one line changed
if (!(p->p_flags & PFROBOT) || tourn_count_robots) {
    count[p->p_team]++;
}
```

```json
{
  "id": "bots",
  "sysdef": {
    "PRET": 1,
    "TOURN": 3,
    "TOURN_COUNT_ROBOTS": 1
  }
}
```

**Pros:** Deployers set a meaningful threshold (e.g. 3 per team, bots + humans combined). Configurable per instance.
**Cons:** Small server-side code change.

### C) Hybrid: require minimum humans, count bots for the rest

New sysdef `TOURN_MIN_HUMANS` — T-Mode requires at least N humans per team, but bots count toward the full `tournplayers` threshold.

```c
// Count humans separately
if (!(p->p_flags & PFROBOT)) human_count[p->p_team]++;
count[p->p_team]++;  // count everyone

// Require both: enough humans AND enough total
if (human_count[team] >= tourn_min_humans && count[team] >= tournplayers)
    quorum[i++] = team;
```

```json
{
  "id": "bots",
  "sysdef": {
    "PRET": 1,
    "TOURN": 4,
    "TOURN_MIN_HUMANS": 1
  }
}
```

**Pros:** Most flexible — prevents pure bot stat farming while enabling small-group T-Mode.
**Cons:** More complex, two new parameters.

## Recommendation

Start with **Option A** (`"TOURN": 1`) for immediate results — zero code, just config. If stat integrity matters later, implement **Option B** as it's the simplest code change (one boolean, one line in `daemon.c`).

## Files (Option B)

| File | Change |
|------|--------|
| `server/netrek-server/include/data.h` | `extern int tourn_count_robots;` |
| `server/netrek-server/ntserv/data.c` | `int tourn_count_robots = 0;` |
| `server/netrek-server/include/sysdefaults.h` | Add `TOURN_COUNT_ROBOTS` sysdef entry |
| `server/netrek-server/ntserv/daemon.c` | Modify `is_tournament_mode()` robot check |
| `entrypoint.sh` | Write `TOURN_COUNT_ROBOTS` from config.json sysdef block |
