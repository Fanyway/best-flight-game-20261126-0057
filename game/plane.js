// plane.js — the aircraft mesh (built from primitives, red-white livery) and
// the arcade flight model: throttle sets speed, bank turns the plane, pitch
// climbs and dives, fuel drains, hard ground contact damages it.

const PLANE = {
  pos: null,        // THREE.Vector3
  heading: 0,       // radians, 0 = -Z (north), grows clockwise
  pitch: 0,         // radians, positive = nose up
  roll: 0,          // radians, positive = bank right
  speed: 0,         // m/s
  throttle: 0,      // 0..1
  fuel: 100,        // 0..100
  damage: 0,        // 0..100
  airborne: false,
  landed: false,
  boosting: false,
  vy: 0,            // vertical speed, m/s
  group: null,
  propeller: null,
  onGroundTime: 0,
  crashReason: null
};

const FLIGHT = {
  maxSpeed: 92,
  stallSpeed: 22,
  accel: 7,
  climbBleed: 0.55,
  turnRate: 0.85,
  maxBank: 0.65,
  maxPitch: 0.38,
  fuelDrainBase: 0.10,
  fuelDrainThrottle: 0.42,
  boostDrain: 1.1
};

function createPlane() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xf5f2ea, flatShading: true });
  const red = new THREE.MeshLambertMaterial({ color: 0xd21f2b, flatShading: true });
  const glass = new THREE.MeshLambertMaterial({ color: 0x2a6db0, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b2f33, flatShading: true });

  // Fuselage: nose cone + body + tail cone, along Z (nose = -Z).
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.85, 5.4, 10), white);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.6, 10), red);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.5;
  g.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.8, 10), white);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 3.6;
  g.add(tail);

  // Red cheatline stripe along the fuselage.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.28, 4.6), red);
  stripe.position.set(0, 0.15, 0.1);
  g.add(stripe);

  // Cockpit canopy.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 8), glass);
  canopy.scale.set(1, 0.75, 1.6);
  canopy.position.set(0, 0.85, -0.9);
  g.add(canopy);

  // Main wing + tailplane + fin.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.22, 2.1), white);
  wing.position.set(0, -0.1, 0.2);
  g.add(wing);
  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 2.1), red);
  wingTipL.position.set(-5.6, -0.1, 0.2);
  g.add(wingTipL);
  const wingTipR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 2.1), red);
  wingTipR.position.set(5.6, -0.1, 0.2);
  g.add(wingTipR);
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 1.3), white);
  tailplane.position.set(0, 0.15, 4.1);
  g.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.0, 1.5), red);
  fin.position.set(0, 1.0, 4.0);
  g.add(fin);

  // Propeller: spinning hub + two blades.
  const prop = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 8), dark);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x1c1e20, flatShading: true });
  for (const s of [-1, 1]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.4, 0.12), bladeMat);
    blade.position.y = s * 1.7;
    prop.add(blade);
  }
  prop.position.z = -4.5;
  g.add(prop);
  PLANE.propeller = prop;

  // Fixed landing gear.
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), dark);
    leg.position.set(s * 1.3, -1.25, -0.6);
    g.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(s * 1.3, -1.8, -0.6);
    g.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 8), dark);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -1.15, 3.9);
  g.add(tailWheel);

  PLANE.group = g;
  return g;
}

function resetPlane() {
  PLANE.pos.set(RUNWAY.cx - 70, RUNWAY.elev + 1.9, RUNWAY.cz);
  PLANE.heading = -Math.PI / 2; // facing east, down the runway
  PLANE.pitch = 0;
  PLANE.roll = 0;
  PLANE.speed = 0;
  PLANE.throttle = 0;
  PLANE.fuel = 100;
  PLANE.damage = 0;
  PLANE.crashReason = null;
  PLANE.airborne = false;
  PLANE.landed = true;
  PLANE.boosting = false;
  PLANE.vy = 0;
  PLANE.onGroundTime = 0;
}

function forwardVector() {
  const h = PLANE.heading, p = PLANE.pitch;
  return new THREE.Vector3(-Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p));
}

function updatePlane(dt, input) {
  // Throttle.
  if (input.throttleUp) PLANE.throttle = Math.min(1, PLANE.throttle + 0.55 * dt);
  if (input.throttleDown) PLANE.throttle = Math.max(0, PLANE.throttle - 0.55 * dt);
  PLANE.boosting = input.boost && PLANE.fuel > 0 && PLANE.airborne;

  // Bank and pitch ease toward the commanded values (keys or mouse steering).
  const keyRoll = (input.rollRight ? 1 : 0) * FLIGHT.maxBank - (input.rollLeft ? 1 : 0) * FLIGHT.maxBank;
  const keyPitch = (input.pitchUp ? 1 : 0) * FLIGHT.maxPitch - (input.pitchDown ? 1 : 0) * FLIGHT.maxPitch;
  const targetRoll = Math.max(-FLIGHT.maxBank, Math.min(FLIGHT.maxBank,
    keyRoll + (input.mouseRoll || 0) * FLIGHT.maxBank));
  const targetPitch = Math.max(-FLIGHT.maxPitch, Math.min(FLIGHT.maxPitch,
    keyPitch + (input.mousePitch || 0) * FLIGHT.maxPitch));
  const rollRate = input.rollLeft || input.rollRight || input.mouseRoll ? 2.4 : 1.1;
  PLANE.roll += Math.max(-rollRate * dt, Math.min(rollRate * dt, targetRoll - PLANE.roll));
  PLANE.pitch += Math.max(-2.0 * dt, Math.min(2.0 * dt, targetPitch - PLANE.pitch));

  // Bank turns the plane; pitch trades speed for climb.
  const speed01 = PLANE.speed / FLIGHT.maxSpeed;
  PLANE.heading -= Math.sin(PLANE.roll) * FLIGHT.turnRate * (0.25 + speed01) * dt;
  const targetSpeed = PLANE.throttle * FLIGHT.maxSpeed * (PLANE.boosting ? 1.35 : 1);
  const rate = targetSpeed > PLANE.speed ? FLIGHT.accel : FLIGHT.accel * 0.55;
  PLANE.speed += Math.max(-rate * dt, Math.min(rate * dt, targetSpeed - PLANE.speed));
  PLANE.speed -= Math.sin(PLANE.pitch) * 9.8 * FLIGHT.climbBleed * dt;
  if (PLANE.fuel <= 0) PLANE.speed = Math.max(0, PLANE.speed - 6 * dt);
  PLANE.speed = Math.max(0, PLANE.speed);

  // Vertical motion: climb with pitch once above stall speed, sink when slow.
  const fwd = forwardVector();
  let vy = Math.sin(PLANE.pitch) * PLANE.speed;
  if (!PLANE.airborne) {
    if (PLANE.speed > FLIGHT.stallSpeed + 4 && PLANE.pitch > 0.05) {
      PLANE.airborne = true;
      PLANE.landed = false;
    }
  }
  if (PLANE.airborne) {
    if (PLANE.speed < FLIGHT.stallSpeed) vy -= (FLIGHT.stallSpeed - PLANE.speed) * 0.55;
    PLANE.vy = vy;
    PLANE.pos.x += fwd.x * PLANE.speed * dt;
    PLANE.pos.y += vy * dt;
    PLANE.pos.z += fwd.z * PLANE.speed * dt;
  } else {
    PLANE.vy = 0;
    PLANE.pos.x += fwd.x * PLANE.speed * dt;
    PLANE.pos.z += fwd.z * PLANE.speed * dt;
    const groundY = terrainHeight(PLANE.pos.x, PLANE.pos.z);
    PLANE.pos.y = groundY + 1.9;
    PLANE.pitch = 0;
    PLANE.roll *= Math.max(0, 1 - 3 * dt);
    PLANE.onGroundTime += dt;
    // Rolling off the island into the sea at speed is a crash.
    if (groundY < 0.6 && PLANE.speed > 12) {
      PLANE.damage = 100;
      PLANE.crashReason = 'Tergelincir ke laut saat meluncur di darat.';
    }
    // Refuel while parked on a runway or pad.
    if (PLANE.onGroundTime > 0.5) PLANE.fuel = Math.min(100, PLANE.fuel + 22 * dt);
    // Rolling drag.
    PLANE.speed = Math.max(0, PLANE.speed - (PLANE.throttle > 0.05 ? -0.5 : 4) * dt);
  }

  // Fuel drain.
  if (PLANE.airborne) {
    let drain = FLIGHT.fuelDrainBase + FLIGHT.fuelDrainThrottle * PLANE.throttle;
    if (PLANE.boosting) drain += FLIGHT.boostDrain;
    PLANE.fuel = Math.max(0, PLANE.fuel - drain * dt);
  }

  // Soft world edge: warn and steer back.
  const dist = Math.sqrt(PLANE.pos.x * PLANE.pos.x + PLANE.pos.z * PLANE.pos.z);
  if (dist > WORLD_BOUND) {
    const back = Math.atan2(-PLANE.pos.x, -PLANE.pos.z);
    let diff = back - PLANE.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    PLANE.heading += Math.max(-0.5 * dt, Math.min(0.5 * dt, diff));
  }

  // Pose the mesh.
  PLANE.group.position.copy(PLANE.pos);
  PLANE.group.rotation.set(0, 0, 0);
  PLANE.group.rotateY(PLANE.heading);
  PLANE.group.rotateX(PLANE.pitch);
  PLANE.group.rotateZ(PLANE.roll);
  if (PLANE.propeller) {
    PLANE.propeller.rotation.z += (2 + PLANE.throttle * 26) * dt;
  }
}
