// terrain.js — the world: a low-poly Indonesian archipelago.
// One height function drives both the visuals and the collisions, so what you
// see is exactly what the plane can hit. All placement is seeded, so the
// layout is identical on every load (screenshots are reproducible).

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ISLANDS = [
  { x: 0,    z: 0,    r: 230, h: 62 },  // main island, holds the runway
  { x: -380, z: 60,   r: 150, h: 42 },  // cargo island
  { x: 350,  z: -280, r: 170, h: 50 },
  { x: -150, z: -420, r: 130, h: 36 },
  { x: 420,  z: 320,  r: 120, h: 30 },
  { x: -520, z: -260, r: 60,  h: 12 },  // islets
  { x: 180,  z: 480,  r: 55,  h: 10 },
  { x: 560,  z: -60,  r: 48,  h: 9 }
];

// Runway: carved flat into the south edge of the main island, east-west.
const RUNWAY = { cx: 0, cz: 150, length: 190, width: 20, elev: 12 };

// Cargo pads: flat circles where cargo is picked up and delivered.
const PADS = [
  { name: 'Pad Kargo', x: -330, z: 40, r: 16, elev: 0 },
  { name: 'Pad Antar', x: 130, z: 150, r: 16, elev: 0 }
];

const WORLD_BOUND = 850;

function baseHeight(x, z) {
  let h = 0;
  for (let i = 0; i < ISLANDS.length; i++) {
    const isl = ISLANDS[i];
    const dx = x - isl.x, dz = z - isl.z;
    const d2 = (dx * dx + dz * dz) / (isl.r * isl.r);
    if (d2 < 4) h += isl.h * Math.exp(-2 * d2);
  }
  return h;
}

function smoothstep(a, b, t) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

function terrainHeight(x, z) {
  let h = baseHeight(x, z);
  // Carve the runway flat.
  const dxr = Math.max(Math.abs(x - RUNWAY.cx) - RUNWAY.length / 2, 0);
  const dzr = Math.max(Math.abs(z - RUNWAY.cz) - RUNWAY.width / 2, 0);
  const dr = Math.sqrt(dxr * dxr + dzr * dzr);
  const w = smoothstep(0, 35, dr);
  h = RUNWAY.elev + (h - RUNWAY.elev) * w;
  // Flatten each cargo pad into a disc.
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    const d = Math.sqrt((x - p.x) * (x - p.x) + (z - p.z) * (z - p.z));
    const wp = smoothstep(p.r, p.r + 22, d);
    h = p.elev + (h - p.elev) * wp;
  }
  return h;
}

function runwayContains(x, z) {
  return Math.abs(x - RUNWAY.cx) <= RUNWAY.length / 2 &&
         Math.abs(z - RUNWAY.cz) <= RUNWAY.width / 2;
}

function padAt(x, z) {
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    const d = Math.sqrt((x - p.x) * (x - p.x) + (z - p.z) * (z - p.z));
    if (d <= p.r) return p;
  }
  return null;
}

const CLOUDS = [];

function makeGradientTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#1d6fb8');
  grad.addColorStop(0.45, '#5ea8dd');
  grad.addColorStop(0.72, '#bfe6ff');
  grad.addColorStop(1, '#eaf7ff');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,250,210,1)');
  grad.addColorStop(0.35, 'rgba(255,240,170,0.85)');
  grad.addColorStop(1, 'rgba(255,240,170,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function buildTerrain(scene) {
  // Pad elevations are sampled from the un-flattened ground.
  for (let i = 0; i < PADS.length; i++) {
    PADS[i].elev = Math.max(2, baseHeight(PADS[i].x, PADS[i].z));
  }

  // Sky dome: gradient sphere, back side.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1900, 24, 16),
    new THREE.MeshBasicMaterial({ map: makeGradientTexture(), side: THREE.BackSide, fog: false })
  );
  scene.add(sky);

  // Sun: glow sprite + light.
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), fog: false, depthWrite: false }));
  sun.position.set(950, 520, -700);
  sun.scale.set(260, 260, 1);
  scene.add(sun);
  const sunLight = new THREE.DirectionalLight(0xfff2cc, 1.15);
  sunLight.position.set(500, 700, -300);
  scene.add(sunLight);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x3a7d5a, 0.75));

  // Sea.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(4200, 4200),
    new THREE.MeshLambertMaterial({ color: 0x1e7fb8 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0;
  scene.add(sea);

  const rng = mulberry32(20261126);

  // Islands: a polar grid displaced by terrainHeight, so the visual ground
  // follows the collision height exactly — including the carved runway and
  // the flattened cargo pads. Vertex colours paint the shoreline sandy.
  for (let i = 0; i < ISLANDS.length; i++) {
    const isl = ISLANDS[i];
    const rings = 26, segs = 48;
    const positions = [], colors = [], indices = [];
    const sand = [0.91, 0.82, 0.60], green = [0.25, 0.62, 0.30];
    for (let ri = 0; ri <= rings; ri++) {
      const r = (ri / rings) * isl.r * 1.18;
      for (let sj = 0; sj <= segs; sj++) {
        const a = (sj / segs) * Math.PI * 2;
        const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
        const y = Math.max(0.4, terrainHeight(isl.x + lx, isl.z + lz));
        positions.push(lx, y, lz);
        const t = smoothstep(2, 9, y);
        colors.push(
          sand[0] + (green[0] - sand[0]) * t,
          sand[1] + (green[1] - sand[1]) * t,
          sand[2] + (green[2] - sand[2]) * t
        );
      }
    }
    for (let ri = 0; ri < rings; ri++) {
      for (let sj = 0; sj < segs; sj++) {
        const a = ri * (segs + 1) + sj, b = a + 1;
        const c = a + segs + 1, d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const hill = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    hill.position.set(isl.x, 0, isl.z);
    scene.add(hill);
  }

  // Runway strip, markings and edge lights.
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.length, 0.7, RUNWAY.width),
    new THREE.MeshLambertMaterial({ color: 0x333a40 })
  );
  strip.position.set(RUNWAY.cx, RUNWAY.elev + 0.1, RUNWAY.cz);
  scene.add(strip);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let d = -80; d <= 80; d += 20) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(8, 0.15, 1.2), dashMat);
    dash.position.set(RUNWAY.cx + d, RUNWAY.elev + 0.55, RUNWAY.cz);
    scene.add(dash);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffc861 });
  for (let d = -90; d <= 90; d += 18) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), lightMat);
      lamp.position.set(RUNWAY.cx + d, RUNWAY.elev + 0.8, RUNWAY.cz + side * (RUNWAY.width / 2 + 1.5));
      scene.add(lamp);
    }
  }

  // Windsock near the runway.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 7, 8),
    new THREE.MeshLambertMaterial({ color: 0xdddddd })
  );
  pole.position.set(RUNWAY.cx + 102, RUNWAY.elev + 3.5, RUNWAY.cz - 14);
  scene.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 4.5, 10),
    new THREE.MeshLambertMaterial({ color: 0xff7a1a })
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(RUNWAY.cx + 104.5, RUNWAY.elev + 6.6, RUNWAY.cz - 14);
  scene.add(sock);

  // Hangars and huts beside the runway.
  const hangarMat = new THREE.MeshLambertMaterial({ color: 0x7d94a6, flatShading: true });
  for (const hx of [-118, -136]) {
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 12), hangarMat);
    hangar.position.set(hx, terrainHeight(hx, 128) + 3.2, 128);
    scene.add(hangar);
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 6.2, 3.4, 4, 1),
      new THREE.MeshLambertMaterial({ color: 0x5a7086, flatShading: true })
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.set(hx, terrainHeight(hx, 128) + 8.2, 128);
    scene.add(roof);
  }

  // Palm trees on the bigger islands.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b, flatShading: true });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b3a, flatShading: true });
  function palm(x, z) {
    const y = terrainHeight(x, z);
    if (y < 2.5) return;
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.75, 7, 7), trunkMat);
    trunk.position.y = 3.5;
    trunk.rotation.z = 0.12;
    g.add(trunk);
    for (let l = 0; l < 5; l++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.6, 5), leafMat);
      const a = (l / 5) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6, 7.4, Math.sin(a) * 1.6);
      leaf.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      g.add(leaf);
    }
    g.position.set(x, y, z);
    g.rotation.y = rng() * Math.PI * 2;
    scene.add(g);
  }
  const palmSpots = [
    [40, 60], [70, 20], [-60, 80], [90, 90], [-40, -40], [30, -90],
    [-330, 90], [-420, 10], [300, -220], [390, -330], [-120, -380]
  ];
  for (let i = 0; i < palmSpots.length; i++) palm(palmSpots[i][0], palmSpots[i][1]);

  // Cargo pads: orange disc, white ring, crates on the pickup pad.
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(p.r, 28),
      new THREE.MeshLambertMaterial({ color: 0xd97b2b })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(p.x, p.elev + 0.4, p.z);
    scene.add(disc);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(p.r - 1.2, p.r, 28),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, p.elev + 0.5, p.z);
    scene.add(ring);
    if (i === 0) {
      const crateMat = new THREE.MeshLambertMaterial({ color: 0xb98a4a, flatShading: true });
      for (let c = 0; c < 3; c++) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.6), crateMat);
        crate.position.set(p.x - 4 + c * 3.4, p.elev + 1.7, p.z + (c === 1 ? -3 : 2));
        crate.rotation.y = rng() * 0.8;
        scene.add(crate);
      }
    }
  }

  // Clouds: flattened white sphere clusters, drifting slowly. Basic
  // (unlit) material keeps them bright white instead of green-tinted.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(rng() * 3);
    for (let s = 0; s < n; s++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(7 + rng() * 9, 10, 8), cloudMat);
      puff.position.set((rng() - 0.5) * 26, (rng() - 0.5) * 5, (rng() - 0.5) * 14);
      puff.scale.y = 0.55;
      g.add(puff);
    }
    g.position.set((rng() - 0.5) * 1500, 150 + rng() * 130, (rng() - 0.5) * 1500);
    g.userData.speed = 1.5 + rng() * 2.5;
    CLOUDS.push(g);
    scene.add(g);
  }
}

function updateClouds(dt) {
  for (let i = 0; i < CLOUDS.length; i++) {
    const c = CLOUDS[i];
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 900) c.position.x = -900;
  }
}
