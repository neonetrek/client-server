/**
 * NeoNetrek Input Handler
 *
 * Handles keyboard and mouse input, translating them
 * to Netrek protocol commands.
 */

import { NetrekConnection } from './net';
import { GameState } from './state';
import { Renderer } from './renderer';
import {
  PFSHIELD, PFCLOAK, PFORBIT, PFREPAIR, PFBOMB,
  FED, ROM, KLI, ORI,
  SCOUT, DESTROYER, CRUISER, BATTLESHIP, ASSAULT, STARBASE, SGALAXY,
  MALL, MTEAM, MINDIV,
} from './constants';

const MAX_LOGIN_LEN = 15; // 16 bytes minus null terminator

export class InputHandler {
  private net: NetrekConnection;
  private state: GameState;
  private renderer: Renderer;
  private keysDown = new Set<string>();
  private loginState: 'waiting' | 'enterName' | 'enterPassword' | 'done' = 'waiting';
  private inputBuffer = '';
  private userName = '';
  private userPassword = '';

  // Chat state
  private chatMode = false;
  private chatBuffer = '';
  private chatTarget: 'all' | 'team' | number = 'all'; // 'all', 'team', or player number

  constructor(net: NetrekConnection, state: GameState, renderer: Renderer) {
    this.net = net;
    this.state = state;
    this.renderer = renderer;
  }

  get isChatting(): boolean { return this.chatMode; }
  get chatText(): string { return this.chatBuffer; }
  get chatTargetLabel(): string {
    if (this.chatTarget === 'all') return 'ALL';
    if (this.chatTarget === 'team') return 'TEAM';
    return `Player ${this.chatTarget}`;
  }

  /** Reset login/chat state (called on reconnect) */
  resetLoginState() {
    this.loginState = 'waiting';
    this.inputBuffer = '';
    this.userName = '';
    this.userPassword = '';
    this.chatMode = false;
    this.chatBuffer = '';
  }

  setup(canvas: HTMLCanvasElement) {
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => this.onKeyUp(e));
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e, canvas));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown(e: KeyboardEvent) {
    this.keysDown.add(e.key);

    // Chat mode intercepts all keys
    if (this.chatMode) {
      this.handleChatInput(e);
      return;
    }

    // Handle login flow
    if (this.state.phase === 'login') {
      this.handleLoginInput(e);
      return;
    }

    // Handle outfit selection
    if (this.state.phase === 'outfit' || this.state.phase === 'dead') {
      this.handleOutfitInput(e);
      return;
    }

    // Gameplay keys
    if (this.state.phase === 'alive') {
      this.handleGameplayInput(e);
    }
  }

  private onKeyUp(e: KeyboardEvent) {
    this.keysDown.delete(e.key);
  }

  private handleLoginInput(e: KeyboardEvent) {
    if (!this.state.connected) return;

    switch (this.loginState) {
      case 'waiting':
        if (e.key === 'Enter') {
          this.loginState = 'enterName';
          this.inputBuffer = '';
          this.state.warningText = 'Enter name (or press Enter for guest):';
          this.state.warningTime = Date.now();
        }
        break;

      case 'enterName':
        if (e.key === 'Enter') {
          this.userName = this.inputBuffer || 'guest';
          this.inputBuffer = '';
          this.loginState = 'enterPassword';
          this.state.warningText = 'Enter password (or press Enter for none):';
          this.state.warningTime = Date.now();
        } else if (e.key === 'Backspace') {
          this.inputBuffer = this.inputBuffer.slice(0, -1);
          this.state.warningText = `Name: ${this.inputBuffer}_`;
          this.state.warningTime = Date.now();
        } else if (e.key.length === 1 && this.inputBuffer.length < MAX_LOGIN_LEN) {
          this.inputBuffer += e.key;
          this.state.warningText = `Name: ${this.inputBuffer}_`;
          this.state.warningTime = Date.now();
        }
        break;

      case 'enterPassword':
        if (e.key === 'Enter') {
          this.userPassword = this.inputBuffer;
          this.inputBuffer = '';
          this.loginState = 'done';
          this.net.sendLogin(this.userName, this.userPassword, this.userName);
          this.state.warningText = `Logging in as ${this.userName}...`;
          this.state.warningTime = Date.now();
          this.net.sendUpdates(50000);
        } else if (e.key === 'Backspace') {
          this.inputBuffer = this.inputBuffer.slice(0, -1);
          this.state.warningText = `Password: ${'*'.repeat(this.inputBuffer.length)}_`;
          this.state.warningTime = Date.now();
        } else if (e.key.length === 1 && this.inputBuffer.length < MAX_LOGIN_LEN) {
          this.inputBuffer += e.key;
          this.state.warningText = `Password: ${'*'.repeat(this.inputBuffer.length)}_`;
          this.state.warningTime = Date.now();
        }
        break;
    }
  }

  private handleOutfitInput(e: KeyboardEvent) {
    // Team selection
    const teamMap: Record<string, number> = {
      'f': FED, 'F': FED,
      'r': ROM, 'R': ROM,
      'k': KLI, 'K': KLI,
      'o': ORI, 'O': ORI,
    };

    const team = teamMap[e.key];
    if (team !== undefined) {
      if (this.state.teamMask & team) {
        this.state.myTeam = team;
        this.state.warningText = 'Ship: (s)cout (d)estroyer (c)ruiser (b)attleship (a)ssault (g)alaxy';
        this.state.warningTime = Date.now();
      } else {
        this.state.warningText = 'That team is not available';
        this.state.warningTime = Date.now();
      }
      return;
    }

    // Ship selection (only if team is chosen)
    if (this.state.myTeam) {
      const shipMap: Record<string, number> = {
        's': SCOUT, 'd': DESTROYER, 'c': CRUISER,
        'b': BATTLESHIP, 'a': ASSAULT, 'g': SGALAXY,
      };
      const ship = shipMap[e.key.toLowerCase()];
      if (ship !== undefined) {
        this.net.sendOutfit(this.state.myTeam, ship);
        this.state.warningText = 'Outfitting...';
        this.state.warningTime = Date.now();
      }
    } else {
      this.state.warningText = 'Select team: (f)ed (r)om (k)li (o)ri';
      this.state.warningTime = Date.now();
    }
  }

  private handleGameplayInput(e: KeyboardEvent) {
    const key = e.key;
    const me = this.state.players[this.state.myNumber];
    if (!me) return;

    // Speed keys: 0-9
    if (key >= '0' && key <= '9') {
      this.net.sendSpeed(parseInt(key));
      e.preventDefault();
      return;
    }

    // Speed 10-12 via shift+number
    if (key === '!' || key === ')') { this.net.sendSpeed(10); e.preventDefault(); return; }
    if (key === '@') { this.net.sendSpeed(11); e.preventDefault(); return; }
    if (key === '#' || key === '%') { this.net.sendSpeed(12); e.preventDefault(); return; }

    switch (key) {
      // Shields toggle
      case 's':
        this.net.sendShield(!(me.flags & PFSHIELD));
        break;

      // Cloak toggle
      case 'c':
        this.net.sendCloak(!(me.flags & PFCLOAK));
        break;

      // Repair toggle
      case 'R':
        this.net.sendRepair(!(me.flags & PFREPAIR));
        break;

      // Orbit toggle
      case 'o':
        this.net.sendOrbit(!(me.flags & PFORBIT));
        break;

      // Bomb toggle
      case 'b':
        this.net.sendBomb(!(me.flags & PFBOMB));
        break;

      // Beam up
      case 'z':
        this.net.sendBeam(true);
        break;

      // Beam down
      case 'x':
        this.net.sendBeam(false);
        break;

      // Det enemy torps
      case 'd':
        this.net.sendDetTorps();
        break;

      // Plasma torpedo
      case 'f':
      case 'F':
        // Fire plasma in current direction (last mouse direction)
        this.net.sendPlasma(me.dir);
        break;

      // Tractor beam toggle (targets nearest enemy - simplified)
      case 't':
        this.net.sendTractor(true, 0); // target selected by server proximity
        break;
      case 'T':
        this.net.sendTractor(false, 0);
        break;

      // Repressor toggle
      case 'y':
        this.net.sendRepress(true, 0);
        break;
      case 'Y':
        this.net.sendRepress(false, 0);
        break;

      // War declaration: cycle through enemy teams
      case 'W': {
        const enemies = (FED | ROM | KLI | ORI) & ~me.team;
        this.net.sendWar(enemies);
        this.state.warningText = 'Declared war on all enemies';
        this.state.warningTime = Date.now();
        break;
      }

      // Planet lock (lock onto nearest planet)
      case 'l':
        // Will be enhanced with click-targeting later
        break;

      // Toggle tactical/galactic
      case 'Tab':
        this.renderer.toggleView();
        e.preventDefault();
        break;

      // Enter chat mode
      case ';':
        this.chatMode = true;
        this.chatBuffer = '';
        this.chatTarget = 'all';
        this.state.warningText = '[ALL] > _';
        this.state.warningTime = Date.now();
        e.preventDefault();
        break;

      // Team chat
      case 'Enter':
        this.chatMode = true;
        this.chatBuffer = '';
        this.chatTarget = 'team';
        this.state.warningText = '[TEAM] > _';
        this.state.warningTime = Date.now();
        e.preventDefault();
        break;

      // Mute toggle
      case 'M': {
        const muted = this.net.audio.toggleMute();
        this.state.warningText = muted ? 'Sound: OFF' : 'Sound: ON';
        this.state.warningTime = Date.now();
        break;
      }

      // Quit
      case 'Q':
        if (e.shiftKey) {
          this.net.sendQuit();
        }
        break;
    }
  }

  private handleChatInput(e: KeyboardEvent) {
    e.preventDefault();

    if (e.key === 'Escape') {
      this.chatMode = false;
      this.chatBuffer = '';
      this.state.warningText = '';
      return;
    }

    if (e.key === 'Enter') {
      if (this.chatBuffer.length > 0) {
        const group = this.chatTarget === 'all' ? MALL
          : this.chatTarget === 'team' ? MTEAM
          : MINDIV;
        const to = typeof this.chatTarget === 'number' ? this.chatTarget : 0;
        this.net.sendMessage(to, group, this.chatBuffer);
      }
      this.chatMode = false;
      this.chatBuffer = '';
      this.state.warningText = '';
      return;
    }

    if (e.key === 'Backspace') {
      this.chatBuffer = this.chatBuffer.slice(0, -1);
    } else if (e.key.length === 1 && this.chatBuffer.length < 79) {
      this.chatBuffer += e.key;
    }

    const prefix = this.chatTarget === 'all' ? '[ALL]' : this.chatTarget === 'team' ? '[TEAM]' : `[P${this.chatTarget}]`;
    this.state.warningText = `${prefix} > ${this.chatBuffer}_`;
    this.state.warningTime = Date.now();
  }

  private onMouseDown(e: MouseEvent, canvas: HTMLCanvasElement) {
    if (this.state.phase !== 'alive') return;
    if (this.renderer.isGalacticView) return;
    if (this.chatMode) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const size = this.renderer.canvasSize;

    // Calculate direction from center of canvas
    const dx = mx - size / 2;
    const dy = my - size / 2;
    const angle = Math.atan2(dy, dx);
    // Convert to netrek direction (0-255, 0=north, clockwise)
    const dir = Math.round(((angle + Math.PI / 2) / (Math.PI * 2)) * 256) & 0xFF;

    if (e.button === 0) {
      // Left click: set course
      this.net.sendDirection(dir);
    } else if (e.button === 1) {
      // Middle click: fire phaser
      this.net.sendPhaser(dir);
      e.preventDefault();
    } else if (e.button === 2) {
      // Right click: fire torpedo
      this.net.sendTorp(dir);
      e.preventDefault();
    }
  }
}
