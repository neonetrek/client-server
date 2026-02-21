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
  PFSHIELD, PFCLOAK, PFORBIT, PFREPAIR,
  FED, ROM, KLI, ORI,
  SCOUT, DESTROYER, CRUISER, BATTLESHIP, ASSAULT, STARBASE,
  TWIDTH,
} from './constants';

export class InputHandler {
  private net: NetrekConnection;
  private state: GameState;
  private renderer: Renderer;
  private keysDown = new Set<string>();
  private loginState: 'waiting' | 'enterName' | 'enterPassword' | 'enterLogin' | 'done' = 'waiting';
  private inputBuffer = '';
  private userName = '';
  private userPassword = '';
  private userLogin = '';

  constructor(net: NetrekConnection, state: GameState, renderer: Renderer) {
    this.net = net;
    this.state = state;
    this.renderer = renderer;
  }

  setup(canvas: HTMLCanvasElement) {
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => this.onKeyUp(e));
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e, canvas));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown(e: KeyboardEvent) {
    this.keysDown.add(e.key);

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
        } else if (e.key.length === 1) {
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
          // Send login packet
          this.net.sendLogin(this.userName, this.userPassword, this.userName);
          this.state.warningText = `Logging in as ${this.userName}...`;
          this.state.warningTime = Date.now();
          // Request updates at 50ms
          this.net.sendUpdates(50000);
        } else if (e.key === 'Backspace') {
          this.inputBuffer = this.inputBuffer.slice(0, -1);
          this.state.warningText = `Password: ${'*'.repeat(this.inputBuffer.length)}_`;
          this.state.warningTime = Date.now();
        } else if (e.key.length === 1) {
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
      // Check if team is in mask
      if (this.state.teamMask & team) {
        this.state.myTeam = team;
        this.state.warningText = `Select ship: (s)cout (d)estroyer (c)ruiser (b)attleship (a)ssault`;
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
        'b': BATTLESHIP, 'a': ASSAULT, 'o': STARBASE,
      };
      const ship = shipMap[e.key.toLowerCase()];
      if (ship !== undefined) {
        this.net.sendOutfit(this.state.myTeam, ship);
        this.state.warningText = 'Outfitting...';
        this.state.warningTime = Date.now();
      }
    } else {
      // Show team selection prompt
      this.state.warningText = 'Select team: (f)ed (r)om (k)li (o)ri';
      this.state.warningTime = Date.now();
    }
  }

  private handleGameplayInput(e: KeyboardEvent) {
    const key = e.key;

    // Speed keys: 0-9, followed by shift variants for 10+
    if (key >= '0' && key <= '9') {
      this.net.sendSpeed(parseInt(key));
      e.preventDefault();
      return;
    }

    // Max speed with %
    if (key === '%' || key === ')') {
      this.net.sendSpeed(12);
      e.preventDefault();
      return;
    }

    switch (key) {
      // Shields toggle
      case 's':
      case 'S':
        this.net.sendShield(!(this.state.players[this.state.myNumber]?.flags & PFSHIELD));
        break;

      // Cloak toggle
      case 'c':
      case 'C':
        this.net.sendCloak(!(this.state.players[this.state.myNumber]?.flags & PFCLOAK));
        break;

      // Repair toggle
      case 'R':
        this.net.sendRepair(true);
        break;

      // Orbit
      case 'o':
        this.net.sendOrbit(!(this.state.players[this.state.myNumber]?.flags & PFORBIT));
        break;

      // Bomb
      case 'b':
        this.net.sendBomb(true);
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

      // Toggle tactical/galactic
      case 'Tab':
        this.renderer.toggleView();
        e.preventDefault();
        break;

      // Quit
      case 'q':
      case 'Q':
        if (e.shiftKey) {
          this.net.sendQuit();
        }
        break;
    }
  }

  private onMouseDown(e: MouseEvent, canvas: HTMLCanvasElement) {
    if (this.state.phase !== 'alive') return;
    if (this.renderer.isGalacticView) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const size = this.renderer.canvasSize;

    // Calculate direction from center of canvas
    const dx = mx - size / 2;
    const dy = my - size / 2;
    const angle = Math.atan2(dy, dx);
    // Convert to netrek direction (0-255, 0=north, clockwise)
    let dir = Math.round(((angle + Math.PI / 2) / (Math.PI * 2)) * 256) & 0xFF;

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
