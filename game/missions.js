// missions.js — the three missions of Langit Nusantara:
// 1. Cincin Langit — fly through five glowing rings in order.
// 2. Mendarat di Pulau — land on the main runway.
// 3. Antar Kargo — pick up cargo on the cargo island, deliver it to the pad
//    beside the runway. Stars are awarded per mission from time and damage.

const MISSIONS = {
  list: [
    {
      name: 'Misi 1 — Cincin Langit',
      objective: 'Terbang melewati 5 cincin',
      timeLimit: 240
    },
    {
      name: 'Misi 2 — Mendarat di Pulau',
      objective: 'Mendarat di landasan utama',
      timeLimit: 300
    },
    {
      name: 'Misi 3 — Antar Kargo',
      objective: 'Ambil kargo di Pulau Kargo, antar ke Pad Antar',
      timeLimit: 420
    }
  ],
  current: 0,
  state: 'idle',        // idle | flying | done
  timer: 0,
  rings: [],
  ringsPassed: 0,
  cargoLoaded: false,
  tookOff: false,       // the plane left the ground at least once this mission
  stars: [0, 0, 0],
  damageAtStart: 0,
  attempts: 0,
  group: null,
  nextRingMesh: null
};

const RING_SPOTS = [
  { x: 60, y: 95, z: -120 },
  { x: -80, y: 115, z: -260 },
  { x: -230, y: 105, z: -180 },
  { x: -310, y: 85, z: 40 },
  { x: -260, y: 100, z: 220 }
];

function buildRings(scene) {
  const group = new THREE.Group();
  for (let i = 0; i < RING_SPOTS.length; i++) {
    const s = RING_SPOTS[i];
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(9, 1.1, 12, 40),
      new THREE.MeshLambertMaterial({ color: 0xff9d2e, emissive: 0xcc6600, flatShading: true })
    );
    ring.position.set(s.x, s.y, s.z);
    ring.userData.index = i;
    ring.userData.baseY = s.y;
    group.add(ring);
    // Guide beacon: a faint light column under the next ring.
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, s.y, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
    );
    beacon.position.set(s.x, s.y / 2, s.z);
    beacon.userData.index = i;
    group.add(beacon);
  }
  MISSIONS.group = group;
  scene.add(group);
}

function startMission(idx) {
  MISSIONS.current = idx;
  MISSIONS.state = 'flying';
  MISSIONS.timer = 0;
  MISSIONS.ringsPassed = 0;
  MISSIONS.cargoLoaded = false;
  MISSIONS.tookOff = false;
  MISSIONS.damageAtStart = PLANE.damage;
  MISSIONS.attempts = 0;
  // Reset the rings: all orange again, first one highlighted.
  for (let i = 0; i < MISSIONS.group.children.length; i++) {
    const child = MISSIONS.group.children[i];
    if (child.geometry && child.geometry.type === 'TorusGeometry') {
      child.material.color.setHex(0xff9d2e);
      child.material.emissive.setHex(0xcc6600);
      child.visible = true;
    } else if (child.geometry && child.geometry.type === 'CylinderGeometry') {
      child.visible = true;
    }
  }
  highlightRing(0);
  updateMissionHUD();
}

function highlightRing(idx) {
  if (!MISSIONS.group) return;
  for (let i = 0; i < MISSIONS.group.children.length; i++) {
    const child = MISSIONS.group.children[i];
    if (child.geometry && child.geometry.type === 'TorusGeometry') {
      const active = child.userData.index === idx;
      child.material.emissive.setHex(active ? 0xffaa00 : 0x664400);
      child.scale.setScalar(active ? 1.12 : 1);
    }
    if (child.geometry && child.geometry.type === 'CylinderGeometry') {
      child.visible = child.userData.index === idx;
    }
  }
}

function starsFor(timeUsed, limit, damageTaken) {
  if (timeUsed <= limit * 0.55 && damageTaken <= 0) return 3;
  if (timeUsed <= limit * 0.85 && damageTaken <= 20) return 2;
  return 1;
}

function completeMission() {
  const m = MISSIONS.list[MISSIONS.current];
  const damageTaken = PLANE.damage - MISSIONS.damageAtStart;
  const stars = starsFor(MISSIONS.timer, m.timeLimit, damageTaken);
  MISSIONS.stars[MISSIONS.current] = stars;
  MISSIONS.state = 'done';
  return stars;
}

function updateMissions(dt, onRing, onLand, onCrash, onComplete) {
  if (MISSIONS.state !== 'flying') return;
  MISSIONS.timer += dt;
  if (PLANE.airborne) MISSIONS.tookOff = true;

  // Rings pulse gently; the next one breathes.
  if (MISSIONS.group) {
    const t = MISSIONS.timer;
    for (let i = 0; i < MISSIONS.group.children.length; i++) {
      const child = MISSIONS.group.children[i];
      if (child.geometry && child.geometry.type === 'TorusGeometry') {
        child.position.y = child.userData.baseY + Math.sin(t * 1.4 + child.userData.index) * 1.2;
      }
    }
  }

  const idx = MISSIONS.current;

  if (idx === 0) {
    // Ring run.
    if (MISSIONS.ringsPassed < RING_SPOTS.length) {
      const s = RING_SPOTS[MISSIONS.ringsPassed];
      const dx = PLANE.pos.x - s.x, dy = PLANE.pos.y - s.y, dz = PLANE.pos.z - s.z;
      if (dx * dx + dy * dy + dz * dz < 8.5 * 8.5) {
        MISSIONS.ringsPassed++;
        addScore(100);
        onRing(MISSIONS.ringsPassed, RING_SPOTS.length);
        // Mark the passed ring green and hide its beacon.
        for (let i = 0; i < MISSIONS.group.children.length; i++) {
          const child = MISSIONS.group.children[i];
          if (child.userData.index === MISSIONS.ringsPassed - 1) {
            if (child.geometry.type === 'TorusGeometry') {
              child.material.color.setHex(0x37d67a);
              child.material.emissive.setHex(0x1d7a44);
              child.scale.setScalar(1);
            } else {
              child.visible = false;
            }
          }
        }
        if (MISSIONS.ringsPassed >= RING_SPOTS.length) {
          const stars = completeMission();
          onComplete(stars);
        } else {
          highlightRing(MISSIONS.ringsPassed);
        }
      }
    }
  } else if (idx === 1) {
    // Landing: the plane must have taken off first, then be on the ground,
    // on the strip, slow.
    if (MISSIONS.tookOff && PLANE.landed && runwayContains(PLANE.pos.x, PLANE.pos.z) && PLANE.speed < 50) {
      addScore(250);
      const stars = completeMission();
      onLand(stars);
    }
  } else if (idx === 2) {
    // Cargo: land on the pickup pad, then on the delivery pad.
    if (PLANE.landed) {
      const pad = padAt(PLANE.pos.x, PLANE.pos.z);
      if (!MISSIONS.cargoLoaded && pad && pad.name === 'Pad Kargo') {
        MISSIONS.cargoLoaded = true;
        addScore(100);
        onRing(0, 0); // reuse the chime + banner path via callback
        showBanner('KARGO DIMUAT — ANTAR KE PAD ANTAR');
        updateMissionHUD();
      } else if (MISSIONS.tookOff && MISSIONS.cargoLoaded && pad && pad.name === 'Pad Antar') {
        addScore(300);
        const stars = completeMission();
        onComplete(stars);
      }
    }
  }

  updateMissionHUD();
}

function missionProgressText() {
  if (MISSIONS.current === 0) return MISSIONS.ringsPassed + ' / ' + RING_SPOTS.length;
  if (MISSIONS.current === 1) return PLANE.landed ? 'MENDARAT ✓' : '—';
  return MISSIONS.cargoLoaded ? 'Kargo dibawa ✓' : 'Ambil kargo';
}

function addScore(n) {
  GAME.score += n;
}
