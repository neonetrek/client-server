/**
 * LabelRenderer — Canvas 2D overlay label drawing.
 *
 * Replaces CSS2DRenderer for ship/planet labels. Projects 3D world positions
 * to 2D canvas coordinates and draws text + resource icons directly on a
 * canvas overlay, eliminating DOM overhead from 70+ repositioned divs per frame.
 */

import * as THREE from 'three';
import { PLREPAIR, PLFUEL, PLAGRI } from './constants';

const _vec = new THREE.Vector3();

export interface ShipLabelData {
  worldPos: THREE.Vector3;
  text: string;
  color: string;
}

export interface PlanetLabelData {
  worldPos: THREE.Vector3;
  name: string;
  armies: number;
  flags: number;
  teamColor: string;
}

export class LabelRenderer {
  /** Project a 3D world position to 2D canvas pixel coordinates */
  project(
    worldPos: THREE.Vector3,
    camera: THREE.Camera,
    width: number,
    height: number,
  ): { x: number; y: number } {
    _vec.copy(worldPos).project(camera);
    return {
      x: (_vec.x * 0.5 + 0.5) * width,
      y: (-_vec.y * 0.5 + 0.5) * height,
    };
  }

  /** Draw a ship label (multiline monospace text with shadow) */
  drawShipLabel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    color: string,
    fontSize: number,
  ) {
    ctx.save();
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.fillStyle = color;

    const lineHeight = fontSize * 1.3;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, y + i * lineHeight);
    }

    ctx.restore();
  }

  /** Draw a planet label (name + armies + resource icons below) */
  drawPlanetLabel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    name: string,
    armies: number,
    flags: number,
    teamColor: string,
    fontSize: number,
  ) {
    ctx.save();
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;

    // Planet name in team color
    let labelText = name;
    if (armies > 0) {
      labelText += ` \u2691${armies}`;
    }
    ctx.fillStyle = teamColor;
    ctx.fillText(labelText, x, y);

    // Resource icons below the name
    if (flags & (PLREPAIR | PLFUEL | PLAGRI)) {
      const iconY = y + fontSize * 1.3;
      const iconSize = Math.max(8, fontSize - 2);
      this.drawResourceIcons(ctx, x, iconY, flags, iconSize);
    }

    ctx.restore();
  }

  /** Draw resource icons (wrench, diamond, leaf) as canvas paths */
  drawResourceIcons(
    ctx: CanvasRenderingContext2D,
    cx: number,
    y: number,
    flags: number,
    size: number,
  ) {
    const icons: number[] = [];
    if (flags & PLREPAIR) icons.push(PLREPAIR);
    if (flags & PLFUEL) icons.push(PLFUEL);
    if (flags & PLAGRI) icons.push(PLAGRI);
    if (icons.length === 0) return;

    const gap = size * 1.4;
    const totalWidth = (icons.length - 1) * gap;
    let ix = cx - totalWidth / 2;

    ctx.save();
    ctx.strokeStyle = '#aaa';
    ctx.fillStyle = '#aaa';
    ctx.lineWidth = 1;
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 2;

    for (const icon of icons) {
      if (icon === PLREPAIR) {
        this.drawWrench(ctx, ix, y, size);
      } else if (icon === PLFUEL) {
        this.drawDiamond(ctx, ix, y, size);
      } else if (icon === PLAGRI) {
        this.drawLeaf(ctx, ix, y, size);
      }
      ix += gap;
    }

    ctx.restore();
  }

  /** Wrench icon — angled wrench shape */
  private drawWrench(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    const h = s / 2;
    ctx.beginPath();
    // Handle (diagonal line)
    ctx.moveTo(cx - h * 0.3, cy + h);
    ctx.lineTo(cx + h * 0.3, cy - h * 0.3);
    // Jaw (open top)
    ctx.moveTo(cx + h * 0.3, cy - h * 0.3);
    ctx.lineTo(cx - h * 0.2, cy - h);
    ctx.moveTo(cx + h * 0.3, cy - h * 0.3);
    ctx.lineTo(cx + h * 0.8, cy - h);
    ctx.stroke();
  }

  /** Diamond/rhombus icon with horizontal line */
  private drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    const h = s / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - h);       // top
    ctx.lineTo(cx + h * 0.6, cy); // right
    ctx.lineTo(cx, cy + h);       // bottom
    ctx.lineTo(cx - h * 0.6, cy); // left
    ctx.closePath();
    ctx.stroke();
    // Horizontal line through middle
    ctx.beginPath();
    ctx.moveTo(cx - h * 0.4, cy);
    ctx.lineTo(cx + h * 0.4, cy);
    ctx.stroke();
  }

  /** Leaf icon — stem with two leaf curves */
  private drawLeaf(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    const h = s / 2;
    // Stem
    ctx.beginPath();
    ctx.moveTo(cx, cy - h * 0.4);
    ctx.lineTo(cx, cy + h);
    ctx.stroke();
    // Left leaf
    ctx.beginPath();
    ctx.moveTo(cx, cy - h * 0.2);
    ctx.quadraticCurveTo(cx - h * 0.8, cy - h * 0.6, cx - h * 0.1, cy - h);
    ctx.stroke();
    // Right leaf
    ctx.beginPath();
    ctx.moveTo(cx, cy - h * 0.2);
    ctx.quadraticCurveTo(cx + h * 0.8, cy - h * 0.6, cx + h * 0.1, cy - h);
    ctx.stroke();
  }
}
