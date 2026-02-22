# NeoNetrek - Known Gaps & TODO

A review of the current implementation, organized by priority.
Items marked with [FIXED] have been addressed.

## HIGH Priority - Correctness Issues

### 1. [FIXED] Missing Bounds Checking on Player/Entity Indices
All packet handlers now validate indices with `validPlayer()`, `validPlanet()`, `validTorp()` guards. Renderer validates `torp.owner` and `phaser.number` before array access.

### 2. [FIXED] Unknown Packet Discards Entire Buffer
Now skips 4 bytes on unknown packet type (Netrek packets are 4-byte aligned) and continues processing remaining data.

### 3. [FIXED] Protocol Parsing Has No Buffer Overflow Protection
`unpack()` now checks `offset + totalSize > buffer.byteLength` and throws `RangeError`. Packet handlers wrapped in try/catch.

## MEDIUM Priority - Missing Features

### 4. [FIXED] No Way to Send Chat Messages
Added chat system: `;` for ALL chat, `Enter` for TEAM chat, `Escape` to cancel. Full text input with 79-char limit, displays target in warning overlay.

### 5. [FIXED] Missing Weapon/Ability Key Bindings
Added: plasma (`f`), tractor (`t`/`T`), repressor (`y`/`Y`), war declaration (`W`), speed 10-12 (`!`/`@`/`#`).

### 6. [FIXED] Speed Keys Only Go to 9
`!` = 10, `@` = 11, `#`/`%` = 12.

### 7. [FIXED] Repair/Bomb Don't Toggle
Both now read current flag state and toggle.

### 8. [FIXED] HUD Uses Hardcoded Max Values
Now uses `SHIP_STATS[me.shipType]` for shield, hull, and fuel maximums.

### 9. [FIXED] SP_YOU Packet Field Mapping Uncertain
Verified against C source `include/packets.h`. Corrected field order: `type, pnum, hostile, swar, armies, tractor, pad, pad, flags, damage, shield, fuel, etemp, wtemp, whydead, whodead`.

### 10. [FIXED] Login Input Doesn't Enforce Length Limits
Capped at 15 characters (16-byte field minus null terminator).

### 11. [FIXED] WebSocket Error Doesn't Update State
`ws.onerror` now sets `state.connected = false` and calls `onStateUpdate()`.

## LOW Priority - Polish

### 12. [FIXED] No Visual for MOTD-to-Outfit Transition
Added full outfit selection UI with team boxes (color-coded, availability-checked) and ship cards showing stats (speed, shields, hull, armies). Replaces text-only prompts.

### 13. [FIXED] Missing Galactic Ship Types
Galaxy ship added to outfit selection (`g` key). ATT not added (intentionally restricted).

### 14. [FIXED] No Planet Home Flag Indicator
Home planets now display a white outer ring.

### 15. [FIXED] No Sound Effects
Added Web Audio API synthesized sound engine (`audio.ts`). Procedurally generated sounds for: torpedo fire, torpedo explosion, phaser fire, plasma fire, ship explosion. Mute toggle with `M` key.

### 16. [FIXED] No Reconnect Logic
Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, 16s). Max 5 attempts before showing "refresh page" message. Reconnect status shown in warning overlay. Intentional disconnects skip reconnect.

### 17. [FIXED] Explosion Animation Not Frame-Synced
Explosions now track `explodeStart` timestamp per player. Animation uses elapsed time from start rather than `Date.now() % 500`. Added secondary ring visual effect.

### 18. [FIXED] No Connection Status / Latency Display
Latency measured from SP_PING roundtrip timing, blended with server-reported lag. Displayed in HUD with color coding: green (<100ms), yellow (<250ms), red (>=250ms).

## Architecture Gaps

### 19. No UDP Support
TCP-only via WebSocket. Not a problem in practice (WS proxy is localhost to C server), but means slightly higher latency for position updates from the browser.

### 20. Docker Image Not Yet Tested End-to-End
The Dockerfile and configs exist. Web client Vite build verified. Docker daemon not available in dev environment for full container build test. All individual components (C server source, ws-proxy, web client) are present and correctly referenced.

### 21. [FIXED] No Health Check Endpoint
Added `/health` endpoint returning JSON with status, uptime, connection count, and netrek host/port.

## Remaining Summary

| Priority | Remaining | Description |
|----------|-----------|-------------|
| HIGH | 0 | All fixed |
| MEDIUM | 0 | All fixed |
| LOW | 0 | All fixed |
| Architecture | 2 | Docker e2e testing (needs daemon), UDP (design choice) |

## Test Coverage

- **105 tests** across 4 test files, all passing
- Protocol: pack/unpack round-trips, overflow protection, format parsing, 4-byte alignment
- State: entity creation, initial values, torpedo ownership
- Constants: team flags, ship stats, dimensions consistency
- Pack args: all CP packet size/field count verification
