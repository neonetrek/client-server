/**
 * NeoNetrek Network Layer
 *
 * Manages WebSocket connection to the proxy,
 * decodes incoming server packets, and provides
 * methods to send client packets.
 */

import { SP, SP_BY_CODE, CP, pack, unpack, formatSize } from './protocol';
import { GameState } from './state';
import { AudioEngine } from './audio';
import {
  PALIVE, PEXPLODE, PDEAD, POUTFIT, POBSERV, PFREE,
  TMOVE, TEXPLODE, PTMOVE, PTEXPLODE,
  PHHIT, PHHIT2, PHMISS,
  MAXPLAYER, MAXPLANETS, MAXTORP,
} from './constants';

export class NetrekConnection {
  private ws: WebSocket | null = null;
  private recvBuffer: Uint8Array = new Uint8Array(0);
  private state: GameState;
  private onStateUpdate: () => void;
  private wsUrl: string = '';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  readonly audio = new AudioEngine();

  constructor(state: GameState, onStateUpdate: () => void) {
    this.state = state;
    this.onStateUpdate = onStateUpdate;
  }

  connect(url: string) {
    this.wsUrl = url;
    this.intentionalClose = false;
    this.doConnect();
  }

  private doConnect() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log('[net] Connected to server');
      this.state.connected = true;
      this.reconnectAttempts = 0;
      // Send CP_SOCKET to identify ourselves
      this.sendSocket(10, 0); // version 10
      this.onStateUpdate();
    };

    this.ws.onmessage = (event) => {
      const data = new Uint8Array(event.data as ArrayBuffer);
      this.appendData(data);
      this.processPackets();
      this.onStateUpdate();
    };

    this.ws.onclose = () => {
      console.log('[net] Connection closed');
      this.state.connected = false;
      this.onStateUpdate();
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (err) => {
      console.error('[net] WebSocket error:', err);
      this.state.connected = false;
      this.onStateUpdate();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const MAX_RECONNECT = 5;
    if (this.reconnectAttempts >= MAX_RECONNECT) {
      this.state.warningText = 'Connection lost. Refresh page to retry.';
      this.state.warningTime = Date.now();
      this.onStateUpdate();
      return;
    }
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
    this.reconnectAttempts++;
    console.log(`[net] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT})`);
    this.state.warningText = `Reconnecting in ${Math.round(delay / 1000)}s...`;
    this.state.warningTime = Date.now();
    this.onStateUpdate();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.recvBuffer = new Uint8Array(0);
      this.doConnect();
    }, delay);
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.sendBye();
      this.ws.close();
      this.ws = null;
    }
  }

  private appendData(data: Uint8Array) {
    const combined = new Uint8Array(this.recvBuffer.length + data.length);
    combined.set(this.recvBuffer);
    combined.set(data, this.recvBuffer.length);
    this.recvBuffer = combined;
  }

  private processPackets() {
    let offset = 0;

    while (offset < this.recvBuffer.length) {
      const packetType = this.recvBuffer[offset];
      const def = SP_BY_CODE.get(packetType);

      if (!def) {
        // Unknown packet - try to skip by scanning for next known packet type.
        // Netrek packets are always 4-byte aligned, so advance by 4.
        console.warn(`[net] Unknown packet type: ${packetType} at offset ${offset}, skipping 4 bytes`);
        offset += 4;
        continue;
      }

      if (offset + def.size > this.recvBuffer.length) {
        // Incomplete packet, wait for more data
        break;
      }

      try {
        const view = new DataView(this.recvBuffer.buffer, this.recvBuffer.byteOffset + offset, def.size);
        this.handlePacket(def.name, view);
      } catch (e) {
        console.error(`[net] Error handling packet ${def.name}:`, e);
      }
      offset += def.size;
    }

    // Keep remaining bytes
    if (offset > 0) {
      this.recvBuffer = this.recvBuffer.slice(offset);
    }
  }

  // Bounds check helpers
  private validPlayer(n: number): boolean { return n >= 0 && n < MAXPLAYER; }
  private validPlanet(n: number): boolean { return n >= 0 && n < MAXPLANETS; }
  private validTorp(n: number): boolean { return n >= 0 && n < MAXPLAYER * MAXTORP; }

  private handlePacket(name: string, view: DataView) {
    const s = this.state;

    switch (name) {
      case 'MOTD': {
        const fields = unpack(SP.MOTD.format, view);
        const line = fields[1] as string;
        s.motdLines.push(line);
        break;
      }

      case 'YOU': {
        // Verified against C source (include/packets.h):
        // struct you_spacket: type, pnum, hostile, swar, armies, tractor, pad, pad,
        //   flags(I), damage(l), shield(l), fuel(l), etemp(h), wtemp(h), whydead(h), whodead(h)
        const f = unpack(SP.YOU.format, view);
        const pnum = f[1] as number;
        if (!this.validPlayer(pnum)) break;
        s.myNumber = pnum;
        const me = s.players[pnum];
        me.hostile = f[2] as number;
        me.war = f[3] as number;
        me.armies = f[4] as number;
        // f[5] = tractor (bit 0x40 = active)
        me.flags = f[6] as number;
        me.hull = f[7] as number;    // damage = hull damage taken
        me.shield = f[8] as number;
        me.fuel = f[9] as number;
        me.eTemp = f[10] as number;
        me.wTemp = f[11] as number;
        // f[12] = whydead, f[13] = whodead
        break;
      }

      case 'PLAYER': {
        const f = unpack(SP.PLAYER.format, view);
        const pnum = f[1] as number;
        if (!this.validPlayer(pnum)) break;
        const p = s.players[pnum];
        p.dir = f[2] as number;
        p.speed = f[3] as number;
        p.x = f[4] as number;
        p.y = f[5] as number;
        break;
      }

      case 'PLAYER_INFO': {
        const f = unpack(SP.PLAYER_INFO.format, view);
        const pnum = f[1] as number;
        if (!this.validPlayer(pnum)) break;
        const p = s.players[pnum];
        p.shipType = f[2] as number;
        p.team = f[3] as number;
        break;
      }

      case 'KILLS': {
        const f = unpack(SP.KILLS.format, view);
        const pnum = f[1] as number;
        if (!this.validPlayer(pnum)) break;
        s.players[pnum].kills = (f[2] as number) / 100; // kills are *100
        break;
      }

      case 'PSTATUS': {
        const f = unpack(SP.PSTATUS.format, view);
        const pnum = f[1] as number;
        if (!this.validPlayer(pnum)) break;
        const status = f[2] as number;
        // Track explosion start time for frame-synced animation
        if (status === PEXPLODE && s.players[pnum].status !== PEXPLODE) {
          s.players[pnum].explodeStart = Date.now();
          this.audio.playShipExplode();
        }
        s.players[pnum].status = status;

        // Update our phase
        if (pnum === s.myNumber) {
          if (status === PALIVE) s.phase = 'alive';
          else if (status === POUTFIT) s.phase = 'outfit';
          else if (status === PDEAD || status === PEXPLODE) s.phase = 'dead';
          else if (status === POBSERV) s.phase = 'observe';
        }
        break;
      }

      case 'FLAGS': {
        const f = unpack(SP.FLAGS.format, view);
        const pnum = f[1] as number;
        if (!this.validPlayer(pnum)) break;
        // f[2] = tractor target
        s.players[pnum].flags = f[3] as number;
        break;
      }

      case 'PLANET': {
        const f = unpack(SP.PLANET.format, view);
        const pnum = f[1] as number;
        if (!this.validPlanet(pnum)) break;
        const pl = s.planets[pnum];
        pl.owner = f[2] as number;
        pl.info = f[3] as number;
        pl.flags = f[4] as number;
        pl.armies = f[5] as number;
        break;
      }

      case 'PLANET_LOC': {
        const f = unpack(SP.PLANET_LOC.format, view);
        const pnum = f[1] as number;
        if (!this.validPlanet(pnum)) break;
        const pl = s.planets[pnum];
        pl.x = f[2] as number;
        pl.y = f[3] as number;
        pl.name = f[4] as string;
        break;
      }

      case 'TORP_INFO': {
        const f = unpack(SP.TORP_INFO.format, view);
        const war = f[1] as number;
        const status = f[2] as number;
        const tnum = f[3] as number;
        if (!this.validTorp(tnum)) break;
        // Play sound on status transition
        const oldTorpStatus = s.torps[tnum].status;
        if (status === TEXPLODE && oldTorpStatus !== TEXPLODE) {
          this.audio.playTorpExplode();
        } else if (status === TMOVE && oldTorpStatus !== TMOVE && s.torps[tnum].owner === s.myNumber) {
          this.audio.playTorpFire();
        }
        s.torps[tnum].status = status;
        s.torps[tnum].war = war;
        break;
      }

      case 'TORP': {
        const f = unpack(SP.TORP.format, view);
        const dir = f[1] as number;
        const tnum = f[2] as number;
        if (!this.validTorp(tnum)) break;
        s.torps[tnum].x = f[3] as number;
        s.torps[tnum].y = f[4] as number;
        s.torps[tnum].dir = dir;
        break;
      }

      case 'PHASER': {
        const f = unpack(SP.PHASER.format, view);
        const pnum = f[1] as number;
        if (!this.validPlayer(pnum)) break;
        const phaserStatus = f[2] as number;
        s.phasers[pnum].status = phaserStatus;
        s.phasers[pnum].dir = f[3] as number;
        s.phasers[pnum].x = f[4] as number;
        s.phasers[pnum].y = f[5] as number;
        s.phasers[pnum].target = f[6] as number;
        s.phasers[pnum].fuse = 10; // display for ~10 frames
        // Play phaser sound for our player
        if (pnum === s.myNumber && (phaserStatus === PHHIT || phaserStatus === PHHIT2 || phaserStatus === PHMISS)) {
          this.audio.playPhaserFire();
        }
        break;
      }

      case 'PLASMA_INFO': {
        const f = unpack(SP.PLASMA_INFO.format, view);
        const war = f[1] as number;
        const status = f[2] as number;
        const pnum = f[3] as number;
        if (!this.validPlayer(pnum)) break;
        const oldPlasmaStatus = s.plasmas[pnum].status;
        if (status === PTMOVE && oldPlasmaStatus !== PTMOVE && pnum === s.myNumber) {
          this.audio.playPlasmaFire();
        } else if (status === PTEXPLODE && oldPlasmaStatus !== PTEXPLODE) {
          this.audio.playTorpExplode();
        }
        s.plasmas[pnum].status = status;
        s.plasmas[pnum].war = war;
        break;
      }

      case 'PLASMA': {
        const f = unpack(SP.PLASMA.format, view);
        const pnum = f[1] as number;
        if (!this.validPlayer(pnum)) break;
        s.plasmas[pnum].x = f[2] as number;
        s.plasmas[pnum].y = f[3] as number;
        break;
      }

      case 'MESSAGE': {
        const f = unpack(SP.MESSAGE.format, view);
        const flags = f[1] as number;
        const from = f[2] as number;
        const to = f[3] as number;
        const text = f[4] as string;
        s.messages.push({ from, to, flags, text, time: Date.now() });
        // Keep last 100 messages
        if (s.messages.length > 100) s.messages.shift();
        break;
      }

      case 'WARNING': {
        const f = unpack(SP.WARNING.format, view);
        s.warningText = f[1] as string;
        s.warningTime = Date.now();
        break;
      }

      case 'LOGIN': {
        const f = unpack(SP.LOGIN.format, view);
        // f[1] = accept flag
        s.motdComplete = true;
        break;
      }

      case 'MASK': {
        const f = unpack(SP.MASK.format, view);
        s.teamMask = f[1] as number;
        break;
      }

      case 'PICKOK': {
        const f = unpack(SP.PICKOK.format, view);
        const ok = f[1] as number;
        if (ok) {
          s.phase = 'alive';
        }
        break;
      }

      case 'PL_LOGIN': {
        const f = unpack(SP.PL_LOGIN.format, view);
        const pnum = f[1] as number;
        if (!this.validPlayer(pnum)) break;
        s.players[pnum].rank = f[2] as number;
        s.players[pnum].name = f[3] as string;
        // f[4] = monitor
        s.players[pnum].login = f[5] as string;
        break;
      }

      case 'HOSTILE': {
        const f = unpack(SP.HOSTILE.format, view);
        const pnum = f[1] as number;
        if (!this.validPlayer(pnum)) break;
        s.players[pnum].war = f[2] as number;
        s.players[pnum].hostile = f[3] as number;
        break;
      }

      case 'QUEUE': {
        const f = unpack(SP.QUEUE.format, view);
        s.queuePos = f[1] as number;
        break;
      }

      case 'PING': {
        // Respond to server pings immediately and measure latency
        const f = unpack(SP.PING.format, view);
        const num = f[1] as number;
        const serverLag = f[2] as number; // server-measured roundtrip in ms
        // Use server-reported lag if available, else measure client-side
        if (s.lastPingTime > 0) {
          const clientRoundtrip = Date.now() - s.lastPingTime;
          s.latencyMs = serverLag > 0
            ? Math.round((serverLag + clientRoundtrip) / 2)
            : clientRoundtrip;
        } else if (serverLag > 0) {
          s.latencyMs = serverLag;
        }
        s.lastPingTime = Date.now();
        this.sendPingResponse(num);
        break;
      }

      case 'FEATURE': {
        const f = unpack(SP.FEATURE.format, view);
        console.log('[net] Feature:', f[5]);
        break;
      }

      case 'RESERVED': {
        const f = unpack(SP.RESERVED.format, view);
        this.sendReserved(f[1] as string);
        break;
      }

      case 'STATUS':
      case 'STATS':
        // Silently consume
        break;

      default:
        break;
    }
  }

  // ============================================================
  // Client packet senders
  // ============================================================

  private send(data: ArrayBuffer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  sendSocket(version: number, _udpPort: number) {
    this.send(pack(CP.SOCKET.format, CP.SOCKET.code, 0, 0, version));
  }

  sendLogin(name: string, password: string, login: string) {
    this.send(pack(CP.LOGIN.format, CP.LOGIN.code, 0, name, password, login));
  }

  sendOutfit(team: number, ship: number) {
    this.send(pack(CP.OUTFIT.format, CP.OUTFIT.code, team, ship));
  }

  sendSpeed(speed: number) {
    this.send(pack(CP.SPEED.format, CP.SPEED.code, speed));
  }

  sendDirection(dir: number) {
    this.send(pack(CP.DIRECTION.format, CP.DIRECTION.code, dir & 0xFF));
  }

  sendTorp(dir: number) {
    this.send(pack(CP.TORP.format, CP.TORP.code, dir & 0xFF));
  }

  sendPhaser(dir: number) {
    this.send(pack(CP.PHASER.format, CP.PHASER.code, dir & 0xFF));
  }

  sendShield(up: boolean) {
    this.send(pack(CP.SHIELD.format, CP.SHIELD.code, up ? 1 : 0));
  }

  sendCloak(on: boolean) {
    this.send(pack(CP.CLOAK.format, CP.CLOAK.code, on ? 1 : 0));
  }

  sendRepair(on: boolean) {
    this.send(pack(CP.REPAIR.format, CP.REPAIR.code, on ? 1 : 0));
  }

  sendOrbit(on: boolean) {
    this.send(pack(CP.ORBIT.format, CP.ORBIT.code, on ? 1 : 0));
  }

  sendBomb(on: boolean) {
    this.send(pack(CP.BOMB.format, CP.BOMB.code, on ? 1 : 0));
  }

  sendBeam(up: boolean) {
    // up = true: beam up armies, false: beam down
    this.send(pack(CP.BEAM.format, CP.BEAM.code, up ? 1 : 2));
  }

  sendDetTorps() {
    this.send(pack(CP.DET_TORPS.format, CP.DET_TORPS.code));
  }

  sendDetMyTorp(torpNum: number) {
    this.send(pack(CP.DET_MYTORP.format, CP.DET_MYTORP.code, torpNum));
  }

  sendTractor(on: boolean, playerNum: number) {
    this.send(pack(CP.TRACTOR.format, CP.TRACTOR.code, on ? 1 : 0, playerNum));
  }

  sendRepress(on: boolean, playerNum: number) {
    this.send(pack(CP.REPRESS.format, CP.REPRESS.code, on ? 1 : 0, playerNum));
  }

  sendPlasma(dir: number) {
    this.send(pack(CP.PLASMA.format, CP.PLASMA.code, dir & 0xFF));
  }

  sendMessage(to: number, group: number, text: string) {
    this.send(pack(CP.MESSAGE.format, CP.MESSAGE.code, group, to, text));
  }

  sendWar(newWar: number) {
    this.send(pack(CP.WAR.format, CP.WAR.code, newWar));
  }

  sendPlanlock(planetNum: number) {
    this.send(pack(CP.PLANLOCK.format, CP.PLANLOCK.code, planetNum));
  }

  sendPlaylock(playerNum: number) {
    this.send(pack(CP.PLAYLOCK.format, CP.PLAYLOCK.code, playerNum));
  }

  sendUpdates(usecs: number) {
    this.send(pack(CP.UPDATES.format, CP.UPDATES.code, usecs));
  }

  sendBye() {
    this.send(pack(CP.BYE.format, CP.BYE.code));
  }

  sendQuit() {
    this.send(pack(CP.QUIT.format, CP.QUIT.code));
  }

  private sendPingResponse(num: number) {
    this.send(pack(CP.PING_RESPONSE.format, CP.PING_RESPONSE.code, num, 0, 0, 0));
  }

  private sendReserved(data: string) {
    this.send(pack(CP.RESERVED.format, CP.RESERVED.code, data));
  }

  sendFeature(type: number, arg1: number, arg2: number, value: number, name: string) {
    this.send(pack(CP.FEATURE.format, CP.FEATURE.code, type, arg1, arg2, value, name));
  }
}
