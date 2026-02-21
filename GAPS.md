# NeoNetrek - Known Gaps & TODO

A review of the current implementation, organized by priority.

## HIGH Priority - Correctness Issues

### 1. Missing Bounds Checking on Player/Entity Indices (net.ts, renderer.ts)

**11 locations** where server-provided indices are used to access arrays without validation.
If the server sends an out-of-range player number, the client will crash or behave unpredictably.

**Affected packets in `net.ts`:**
- `SP_PLAYER` (line ~118): `s.players[pnum]` - no bounds check
- `SP_PLAYER_INFO` (line ~131): `s.players[pnum]`
- `SP_KILLS` (line ~140): `s.players[pnum].kills`
- `SP_PSTATUS` (line ~149): `s.players[pnum].status`
- `SP_FLAGS` (line ~166): `s.players[pnum].flags`
- `SP_PL_LOGIN` (line ~322): `s.players[pnum].rank`
- `SP_HOSTILE` (line ~333): `s.players[pnum].war`
- `SP_PHASER` (line ~245): `s.phasers[pnum]`

**In `renderer.ts`:**
- Line ~146: `s.players[torp.owner]` - torp.owner not validated
- Line ~188: `s.players[phaser.number]` - phaser.number not validated

**Fix:** Add `if (pnum < 0 || pnum >= MAXPLAYER) return;` guards to every packet handler.

### 2. Unknown Packet Discards Entire Buffer (net.ts, line ~81)

When an unrecognized packet type is encountered, the entire remaining receive buffer is thrown away:
```typescript
offset = this.recvBuffer.length;
break;
```
This means if a new/unknown packet appears mid-stream, all subsequent valid packets in that chunk are lost. Need a packet skip table or at minimum try advancing by 4 bytes.

### 3. Protocol Parsing Has No Buffer Overflow Protection (protocol.ts)

`unpack()` doesn't verify the DataView has enough bytes for the format string. Could throw `RangeError` if given a truncated packet. Should check `offset + field.size <= buffer.byteLength` before each read.

## MEDIUM Priority - Missing Features

### 4. No Way to Send Chat Messages

`sendMessage()` exists in `net.ts` but there's no keyboard binding or text input UI to compose messages. This is core to Netrek team play.

**Need:**
- A key (traditional: `;` or `Enter`) to enter message mode
- Team/All/Individual message destination selection
- Text input field that captures keypresses
- Message display panel (currently shows last 3 messages as fading overlays)

### 5. Missing Weapon/Ability Key Bindings

The protocol layer supports these but no keyboard bindings exist:
- **Plasma torps** (`sendPlasma`) - traditional key: `f`
- **Tractor beam** (`sendTractor`) - traditional key: `t` + click target
- **Repressor beam** (`sendRepress`) - traditional key: `y` + click target
- **War declaration** (`sendWar`) - traditional key: `W`
- **Planet lock** (`sendPlanlock`) - traditional key: `l` + click planet
- **Player lock** (`sendPlaylock`) - traditional key: `l` + click player

### 6. Speed Keys Only Go to 9

Can't set speed 10, 11, or 12 via keyboard. Traditional Netrek uses `Shift+0` through `Shift+2` or `%`/`)` for higher speeds. Currently only `%`/`)` maps to speed 12 — speeds 10-11 are unreachable.

### 7. Repair/Bomb Don't Toggle

`sendRepair(true)` is always called — can never turn repair off from keyboard. Same issue with `sendBomb(true)`. These should be toggles like shield/cloak.

### 8. HUD Uses Hardcoded Max Values

Fuel bar assumes max 10000, weapon/engine temp assumes max 1000. These don't match per-ship stats (e.g., Starbase has 60000 fuel, Scout has 5000). Should use `SHIP_STATS[me.shipType]` for accurate bars.

### 9. SP_YOU Packet Field Mapping Uncertain

The YOU packet format `!bbbbbbxxIlllhhhh` has ambiguous field ordering. Comments in net.ts indicate uncertainty about tractor field position and possible duplicated temp fields. Need to verify against C server source (`ntserv/socket.c`).

### 10. Login Input Doesn't Enforce Length Limits

Name, password, and login fields accept unlimited input but the protocol truncates to 16 bytes. Should show the 16-char limit in the UI and prevent over-typing.

### 11. WebSocket Error Doesn't Update State

`ws.onerror` logs the error but doesn't set `state.connected = false` or trigger a reconnection attempt. Client appears frozen instead of showing "Disconnected."

## LOW Priority - Polish

### 12. No Visual for MOTD-to-Outfit Transition

After login, there's no clear visual transition from the MOTD screen to the team/ship selection screen. The outfit prompt appears as a warning text overlay.

**Need:** A proper team selection screen showing which teams are available (from `teamMask`), player counts per team, and ship selection UI.

### 13. Missing Galactic Ship Types

Galaxy (SGALAXY) and ATT ships are not selectable in the outfit screen (only SC, DD, CA, BB, AS, SB are mapped).

### 14. No Planet Home Flag Indicator

Homeworld planets (`PLHOME`) should have a special visual indicator. Currently all planets look the same except for team color.

### 15. No Sound Effects

No audio at all — torpedoes, phasers, explosions, alerts would benefit from sound.

### 16. No Reconnect Logic

If the WebSocket drops, there's no auto-reconnect. User must refresh the page.

### 17. Explosion Animation Not Frame-Synced

Uses `Date.now() % 500` for animation timing. Could appear jerky on high-refresh displays. Should use a frame counter or accumulated delta time.

### 18. No Connection Status / Latency Display

No ping/latency measurement displayed. The SP_PING/CP_PING_RESPONSE roundtrip could be used to show connection quality.

## Architecture Gaps

### 19. No UDP Support

The original Netrek protocol uses UDP for position updates (high-frequency, loss-tolerant) and TCP for everything else. This implementation is TCP-only via WebSocket. Not a problem in practice since the WS proxy runs on localhost relative to the C server, but means slightly higher latency for position updates from the browser.

### 20. Docker Image Not Yet Tested End-to-End

The Dockerfile, supervisord config, and entrypoint exist but haven't been built and tested as a running Docker container. The C server compilation in Docker needs verification (deps, configure flags, etc.).

### 21. No Health Check Endpoint

The WS proxy should expose a `/health` endpoint for container orchestrators (Railway, Fly.io, Kubernetes) to check liveness.

## Summary

| Priority | Count | Description |
|----------|-------|-------------|
| HIGH | 3 | Bounds checking, buffer handling, protocol safety |
| MEDIUM | 8 | Missing features, incorrect behavior |
| LOW | 7 | Polish, UX, sound, reconnection |
| Architecture | 3 | Docker testing, UDP, health checks |
