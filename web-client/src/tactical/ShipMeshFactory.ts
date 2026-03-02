/**
 * Procedural low-poly 3D ship meshes inspired by Star Trek canon designs.
 * Each ship is a THREE.Group of geometric primitives.
 * Materials: MeshStandardMaterial + EdgesGeometry LineSegments accent highlights.
 */

import * as THREE from 'three';
import {
  FED, ROM, KLI, ORI, IND,
  SCOUT, DESTROYER, CRUISER, BATTLESHIP, ASSAULT, STARBASE, SGALAXY,
  TEAM_COLORS,
} from '../constants';

// Nacelle emissive colors per team
const NACELLE_COLORS: Record<number, number> = {
  [FED]: 0x4488ff,
  [ROM]: 0x44ff44,
  [KLI]: 0x44ff44,
  [ORI]: 0x44ffff,
  [IND]: 0x888888,
};

// Ship scale in game units (ship groups roughly this wide)
const SHIP_SCALE = 750;

function makeHullMaterial(teamColor: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: teamColor,
    emissive: teamColor,
    emissiveIntensity: 0.15,
    metalness: 0.6,
    roughness: 0.4,
  });
}

function makeNacelleMaterial(team: number): THREE.MeshStandardMaterial {
  const c = NACELLE_COLORS[team] ?? 0x888888;
  return new THREE.MeshStandardMaterial({
    color: c,
    emissive: c,
    emissiveIntensity: 0.9,
    metalness: 0.3,
    roughness: 0.2,
  });
}

function addEdges(group: THREE.Group, teamColor: string) {
  const edgeColor = new THREE.Color(teamColor);
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const edges = new THREE.EdgesGeometry(child.geometry, 30);
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: 0.7,
      }));
      line.position.copy(child.position);
      line.rotation.copy(child.rotation);
      line.scale.copy(child.scale);
      group.add(line);
    }
  });
}

// ============================================================
// Federation ships — saucer + engineering hull + nacelles
// ============================================================

function buildFedScout(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Small saucer
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 16), mat);
  saucer.scale.set(1, 1, 0.8);
  saucer.position.set(0, 0, -0.2);
  g.add(saucer);

  // Thin body stem
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.5), mat);
  body.position.set(0, 0, 0.15);
  g.add(body);

  // Underslung nacelle pod
  const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), makeNacelleMaterial(team));
  nacelle.rotation.x = Math.PI / 2;
  nacelle.position.set(0, -0.04, 0.25);
  g.add(nacelle);

  return g;
}

function buildFedDestroyer(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Wide saucer
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 18), mat);
  saucer.scale.set(1, 1, 0.8);
  saucer.position.set(0, 0, -0.15);
  g.add(saucer);

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.55), mat);
  body.position.set(0, 0, 0.2);
  g.add(body);

  // Nacelles below
  const nMat = makeNacelleMaterial(team);
  for (const side of [-1, 1]) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 6), nMat);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(side * 0.25, -0.03, 0.25);
    g.add(nacelle);
    // Pylon
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.03, 0.08), mat);
    pylon.position.set(side * 0.13, -0.015, 0.1);
    g.add(pylon);
  }

  // Dorsal weapons pod
  const pod = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.06), mat);
  pod.position.set(0, 0.035, -0.05);
  g.add(pod);

  return g;
}

function buildFedCruiser(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Large elliptical saucer
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 24), mat);
  saucer.scale.set(1, 1, 0.8);
  saucer.position.set(0, 0, -0.25);
  g.add(saucer);

  // Neck
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.25), mat);
  neck.position.set(0, 0, 0.0);
  g.add(neck);

  // Engineering hull (tapered cylinder on Z axis)
  const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.5, 8), mat);
  eng.rotation.x = Math.PI / 2;
  eng.position.set(0, 0, 0.35);
  g.add(eng);

  // Deflector dish
  const deflector = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x4488ff, emissive: 0x4488ff, emissiveIntensity: 0.8 })
  );
  deflector.position.set(0, -0.04, 0.1);
  g.add(deflector);

  // Nacelle pylons + nacelles
  const nMat = makeNacelleMaterial(team);
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.3), mat);
    pylon.position.set(side * 0.2, 0.02, 0.25);
    pylon.rotation.y = side * -0.5;
    g.add(pylon);

    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), nMat);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(side * 0.35, 0.04, 0.3);
    g.add(nacelle);
  }

  return g;
}

function buildFedBattleship(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Sleek elongated saucer (Sovereign-class)
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 24), mat);
  saucer.scale.set(0.8, 1, 1.2);
  saucer.position.set(0, 0, -0.2);
  g.add(saucer);

  // Integrated hull — longer, thicker
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.7), mat);
  hull.position.set(0, 0, 0.15);
  g.add(hull);

  // Swept-back nacelles
  const nMat = makeNacelleMaterial(team);
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.25), mat);
    pylon.position.set(side * 0.22, 0.02, 0.35);
    pylon.rotation.y = side * -0.3;
    g.add(pylon);

    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.45, 8), nMat);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(side * 0.38, 0.04, 0.35);
    g.add(nacelle);
  }

  // Deflector
  const deflector = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x4488ff, emissive: 0x4488ff, emissiveIntensity: 0.8 })
  );
  deflector.position.set(0, -0.04, -0.05);
  g.add(deflector);

  return g;
}

function buildFedAssault(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Compact blocky shape (Defiant-class)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.55), mat);
  body.position.set(0, 0, 0.05);
  g.add(body);

  // Wedge front
  const front = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 4), mat);
  front.rotation.x = -Math.PI / 2;
  front.rotation.y = Math.PI / 4;
  front.position.set(0, 0, -0.3);
  g.add(front);

  // Integrated nacelles (flush with hull)
  const nMat = makeNacelleMaterial(team);
  for (const side of [-1, 1]) {
    const nacelle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.4), nMat);
    nacelle.position.set(side * 0.18, 0.02, 0.1);
    g.add(nacelle);
  }

  return g;
}

function buildFedGalaxy(tc: string, team: number): THREE.Group {
  // Same as cruiser but larger scale
  const g = buildFedCruiser(tc, team);
  g.scale.set(1.2, 1.2, 1.2);
  return g;
}

// ============================================================
// Klingon ships — angular head + boom + wing bar
// ============================================================

function buildKliScout(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Compact head
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 6), mat);
  head.rotation.x = -Math.PI / 2;
  head.position.set(0, 0, -0.35);
  g.add(head);

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.3), mat);
  body.position.set(0, 0, -0.1);
  g.add(body);

  // Angled wings
  const nMat = makeNacelleMaterial(team);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.015, 0.08), mat);
    wing.position.set(side * 0.15, -0.01, 0.1);
    wing.rotation.z = side * 0.3; // angled down
    g.add(wing);

    // Wing tip nacelle
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), nMat);
    tip.position.set(side * 0.3, -0.03, 0.1);
    g.add(tip);
  }

  return g;
}

function buildKliDestroyer(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Pointed head
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 6), mat);
  head.rotation.x = -Math.PI / 2;
  head.position.set(0, 0, -0.4);
  g.add(head);

  // Boom
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.5), mat);
  boom.position.set(0, 0, -0.05);
  g.add(boom);

  // Wide wing bar
  const wingBar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.1), mat);
  wingBar.position.set(0, 0, 0.2);
  g.add(wingBar);

  // Nacelle pods at tips
  const nMat = makeNacelleMaterial(team);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.15, 6), nMat);
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(side * 0.3, 0, 0.25);
    g.add(tip);
  }

  return g;
}

function buildKliCruiser(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Angular command head
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 6), mat);
  head.rotation.x = -Math.PI / 2;
  head.position.set(0, 0, -0.45);
  g.add(head);

  // Long boom
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.6), mat);
  boom.position.set(0, 0, -0.05);
  g.add(boom);

  // Swept wing bar
  const wingBar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.08), mat);
  wingBar.position.set(0, 0, 0.2);
  g.add(wingBar);

  // Nacelle pods at wing tips
  const nMat = makeNacelleMaterial(team);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 6), nMat);
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(side * 0.35, 0, 0.25);
    g.add(tip);
  }

  // Dorsal spine
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.15), mat);
  spine.position.set(0, 0.04, 0.05);
  g.add(spine);

  return g;
}

function buildKliBattleship(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Massive angular head (Negh'Var)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.25), mat);
  head.position.set(0, 0, -0.4);
  g.add(head);

  // Forward taper
  const taper = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 4), mat);
  taper.rotation.x = -Math.PI / 2;
  taper.rotation.y = Math.PI / 4;
  taper.position.set(0, 0, -0.55);
  g.add(taper);

  // Heavy body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.6), mat);
  body.position.set(0, 0, 0.0);
  g.add(body);

  // Heavy wings
  const nMat = makeNacelleMaterial(team);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.025, 0.12), mat);
    wing.position.set(side * 0.22, 0, 0.15);
    g.add(wing);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 6), nMat);
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(side * 0.4, 0, 0.2);
    g.add(tip);
  }

  return g;
}

function buildKliAssault(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Raptor-class: angular forward hull
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.35, 6), mat);
  head.rotation.x = -Math.PI / 2;
  head.position.set(0, 0, -0.35);
  g.add(head);

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.45), mat);
  body.position.set(0, 0, 0.05);
  g.add(body);

  // Mid-body wings
  const nMat = makeNacelleMaterial(team);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.1), mat);
    wing.position.set(side * 0.16, 0, 0.05);
    g.add(wing);

    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), nMat);
    tip.position.set(side * 0.28, 0, 0.05);
    g.add(tip);
  }

  return g;
}

function buildKliGalaxy(tc: string, team: number): THREE.Group {
  const g = buildKliCruiser(tc, team);
  g.scale.set(1.2, 1.2, 1.2);
  return g;
}

// ============================================================
// Romulan ships — open-frame warbird design, swept wings
// ============================================================

function buildRomScout(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Small swept wings + narrow body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.4), mat);
  body.position.set(0, 0, 0);
  g.add(body);

  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.015, 0.12), mat);
    wing.position.set(side * 0.15, 0, -0.05);
    wing.rotation.y = side * 0.3;
    g.add(wing);
  }

  // Green glow engine
  const nMat = makeNacelleMaterial(team);
  const engine = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), nMat);
  engine.position.set(0, 0, 0.22);
  g.add(engine);

  return g;
}

function buildRomDestroyer(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Valdore-type: swept wings with forward prongs
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.5), mat);
  body.position.set(0, 0, 0);
  g.add(body);

  for (const side of [-1, 1]) {
    // Main swept wing
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.015, 0.1), mat);
    wing.position.set(side * 0.2, 0, 0.05);
    wing.rotation.y = side * 0.25;
    g.add(wing);

    // Forward prong
    const prong = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.2), mat);
    prong.position.set(side * 0.32, 0, -0.15);
    g.add(prong);
  }

  const nMat = makeNacelleMaterial(team);
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 6), nMat);
  engine.rotation.x = Math.PI / 2;
  engine.position.set(0, 0, 0.3);
  g.add(engine);

  return g;
}

function buildRomCruiser(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // D'deridex Warbird — upper and lower hulls with open space between
  // Upper hull (forward-swept wing)
  const upperWing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.15), mat);
  upperWing.position.set(0, 0.08, -0.1);
  g.add(upperWing);

  // Lower hull (mirror)
  const lowerWing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.15), mat);
  lowerWing.position.set(0, -0.08, -0.1);
  g.add(lowerWing);

  // Forward "beak" connection
  const beak = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.1), mat);
  beak.position.set(0, 0, -0.2);
  g.add(beak);

  // Aft connection
  const aft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.12), mat);
  aft.position.set(0, 0, 0.15);
  g.add(aft);

  // Head
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.15, 6), mat);
  head.rotation.x = -Math.PI / 2;
  head.position.set(0, 0, -0.3);
  g.add(head);

  // Green engine glow
  const nMat = makeNacelleMaterial(team);
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 6), nMat);
  engine.rotation.x = Math.PI / 2;
  engine.position.set(0, 0, 0.25);
  g.add(engine);

  return g;
}

function buildRomBattleship(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Scimitar-type: wide aggressive wings, heavy forward section
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.5), mat);
  body.position.set(0, 0, 0);
  g.add(body);

  // Wide aggressive wings
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.2), mat);
    wing.position.set(side * 0.25, 0, 0.0);
    wing.rotation.y = side * 0.15;
    g.add(wing);

    // Wing tip blades
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.3), mat);
    blade.position.set(side * 0.42, 0, -0.05);
    g.add(blade);
  }

  // Heavy forward section
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.15), mat);
  front.position.set(0, 0, -0.35);
  g.add(front);

  const nMat = makeNacelleMaterial(team);
  for (const side of [-1, 1]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 6), nMat);
    eng.rotation.x = Math.PI / 2;
    eng.position.set(side * 0.15, 0, 0.3);
    g.add(eng);
  }

  return g;
}

function buildRomAssault(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Diamond-shaped body + articulated wings
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.35), mat);
  body.rotation.y = Math.PI / 4;
  body.position.set(0, 0, 0);
  g.add(body);

  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.015, 0.12), mat);
    wing.position.set(side * 0.25, 0, 0.08);
    g.add(wing);
  }

  const nMat = makeNacelleMaterial(team);
  const engine = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), nMat);
  engine.position.set(0, 0, 0.25);
  g.add(engine);

  return g;
}

function buildRomGalaxy(tc: string, team: number): THREE.Group {
  const g = buildRomCruiser(tc, team);
  g.scale.set(1.2, 1.2, 1.2);
  return g;
}

// ============================================================
// Orion ships — organic segmented body, lateral fins
// ============================================================

function buildOriScout(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Sleek dart shape
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 8), mat);
  body.rotation.x = -Math.PI / 2;
  body.position.set(0, 0, 0);
  g.add(body);

  // Swept fins
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.01, 0.15), mat);
    fin.position.set(side * 0.1, 0, 0.1);
    fin.rotation.y = side * 0.3;
    g.add(fin);
  }

  const nMat = makeNacelleMaterial(team);
  const engine = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), nMat);
  engine.position.set(0, 0, 0.32);
  g.add(engine);

  return g;
}

function buildOriDestroyer(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Angular body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.5), mat);
  body.position.set(0, 0, 0);
  g.add(body);

  const front = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), mat);
  front.rotation.x = -Math.PI / 2;
  front.position.set(0, 0, -0.35);
  g.add(front);

  // Side-mounted engine pods
  const nMat = makeNacelleMaterial(team);
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), nMat);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 0.15, 0, 0.15);
    g.add(pod);

    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.04), mat);
    strut.position.set(side * 0.09, 0, 0.15);
    g.add(strut);
  }

  return g;
}

function buildOriCruiser(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Multi-segment organic body
  const seg1 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat);
  seg1.position.set(0, 0, -0.2);
  g.add(seg1);

  const seg2 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat);
  seg2.position.set(0, 0, 0.0);
  g.add(seg2);

  const seg3 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat);
  seg3.position.set(0, 0, 0.2);
  g.add(seg3);

  // Lateral fins
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 0.15), mat);
    fin.position.set(side * 0.14, 0, 0);
    g.add(fin);
  }

  // Engine
  const nMat = makeNacelleMaterial(team);
  const engine = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.15, 6), nMat);
  engine.rotation.x = Math.PI / 2;
  engine.position.set(0, 0, 0.35);
  g.add(engine);

  return g;
}

function buildOriBattleship(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Heavy segmented body with armored plating
  const seg1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.2), mat);
  seg1.position.set(0, 0, -0.25);
  g.add(seg1);

  const seg2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.25), mat);
  seg2.position.set(0, 0, 0);
  g.add(seg2);

  const seg3 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.2), mat);
  seg3.position.set(0, 0, 0.22);
  g.add(seg3);

  // Armored plating geometry
  for (const side of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.18), mat);
    plate.position.set(side * 0.14, 0, 0);
    g.add(plate);
  }

  const nMat = makeNacelleMaterial(team);
  for (const side of [-1, 1]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 6), nMat);
    eng.rotation.x = Math.PI / 2;
    eng.position.set(side * 0.1, 0, 0.35);
    g.add(eng);
  }

  return g;
}

function buildOriAssault(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Broad flat hull (slaver)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.5), mat);
  body.position.set(0, 0, 0);
  g.add(body);

  // Cargo bay geometry detail
  const bay = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), mat.clone());
  (bay.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.05;
  bay.position.set(0, 0.01, 0.05);
  g.add(bay);

  const nMat = makeNacelleMaterial(team);
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 6), nMat);
  engine.rotation.x = Math.PI / 2;
  engine.position.set(0, 0, 0.3);
  g.add(engine);

  return g;
}

function buildOriGalaxy(tc: string, team: number): THREE.Group {
  const g = buildOriCruiser(tc, team);
  g.scale.set(1.2, 1.2, 1.2);
  return g;
}

// ============================================================
// Starbase — shared across all races (large circular station)
// ============================================================

function buildStarbase(tc: string, team: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makeHullMaterial(tc);

  // Main disc
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 24), mat);
  g.add(disc);

  // Docking ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.35, 0.03, 6, 24),
    mat
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);

  // Central tower
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8), mat);
  tower.position.set(0, 0.15, 0);
  g.add(tower);

  // Lower pod
  const pod = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat);
  pod.position.set(0, -0.12, 0);
  g.add(pod);

  // Docking pylons
  const nMat = makeNacelleMaterial(team);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.15), mat);
    pylon.position.set(Math.cos(angle) * 0.45, 0, Math.sin(angle) * 0.45);
    pylon.rotation.y = -angle;
    g.add(pylon);

    const light = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 4), nMat);
    light.position.set(Math.cos(angle) * 0.55, 0, Math.sin(angle) * 0.55);
    g.add(light);
  }

  return g;
}

// ============================================================
// Factory with caching
// ============================================================

type BuildFn = (tc: string, team: number) => THREE.Group;

const BUILD_MAP: Record<number, Record<number, BuildFn>> = {
  [FED]: {
    [SCOUT]: buildFedScout,
    [DESTROYER]: buildFedDestroyer,
    [CRUISER]: buildFedCruiser,
    [BATTLESHIP]: buildFedBattleship,
    [ASSAULT]: buildFedAssault,
    [STARBASE]: buildStarbase,
    [SGALAXY]: buildFedGalaxy,
  },
  [KLI]: {
    [SCOUT]: buildKliScout,
    [DESTROYER]: buildKliDestroyer,
    [CRUISER]: buildKliCruiser,
    [BATTLESHIP]: buildKliBattleship,
    [ASSAULT]: buildKliAssault,
    [STARBASE]: buildStarbase,
    [SGALAXY]: buildKliGalaxy,
  },
  [ROM]: {
    [SCOUT]: buildRomScout,
    [DESTROYER]: buildRomDestroyer,
    [CRUISER]: buildRomCruiser,
    [BATTLESHIP]: buildRomBattleship,
    [ASSAULT]: buildRomAssault,
    [STARBASE]: buildStarbase,
    [SGALAXY]: buildRomGalaxy,
  },
  [ORI]: {
    [SCOUT]: buildOriScout,
    [DESTROYER]: buildOriDestroyer,
    [CRUISER]: buildOriCruiser,
    [BATTLESHIP]: buildOriBattleship,
    [ASSAULT]: buildOriAssault,
    [STARBASE]: buildStarbase,
    [SGALAXY]: buildOriGalaxy,
  },
};

export class ShipMeshFactory {
  private cache = new Map<string, THREE.Group>();

  /** Get a ship mesh group (cloned from cache). Caller owns the returned group. */
  create(team: number, shipType: number): THREE.Group {
    const key = `${team}-${shipType}`;
    let template = this.cache.get(key);

    if (!template) {
      const tc = TEAM_COLORS[team] ?? TEAM_COLORS[IND];
      const teamBuilders = BUILD_MAP[team] ?? BUILD_MAP[FED];
      const buildFn = teamBuilders[shipType] ?? teamBuilders[CRUISER] ?? buildFedCruiser;
      template = buildFn(tc, team);

      // Add edge highlights
      addEdges(template, tc);

      // Scale to game units
      template.scale.set(SHIP_SCALE, SHIP_SCALE, SHIP_SCALE);

      this.cache.set(key, template);
    }

    return template.clone();
  }
}
