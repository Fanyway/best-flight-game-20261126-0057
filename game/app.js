// app.js — boot, the render loop, input, camera, collisions and the game
// state machine (title -> flying -> paused / mission done / crashed / complete).
// Supports ?shot=cover|rings|landing poses for deterministic screenshots.

const GAME = {
  state: 'title',
  score: 0,
  justLanded: false,
  lowFuelAt: 0,
  boundAt: 0
};

const input = {
  throttleUp: false, throttleDown: false,
  pitchUp: false, pitchDown: false,
  rollLeft: false, rollRight: false,
  boost: false,
  mouseRoll: 0, mousePitch: 0
};

let renderer, scene, camera, clock;
let mouseSteering = false;
let SHOT = null;

window.GAME = GAME;
window.PLANE = PLANE;
window.MISSIONS = MISSIONS;

function boot() {
  const params = new URLSearchParams(window.location.search);
  SHOT = params.get('shot');

  const canvas = document.getElementById('scene');
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe8f7, 420, 1700);

  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 4000);

  buildTerrain(scene);
  scene.add(createPlane());
  buildRings(scene);

  PLANE.pos = new THREE.Vector3(0, 0, 0);
  resetPlane();

  clock = new THREE.Clock();
  bindInput();
  window.addEventListener('resize', onResize);

  if (SHOT) {
    poseForShot(SHOT);
  } else {
    showScreen('screen-title');
  }

  renderer.setAnimationLoop(tick);
}

function poseForShot(shot) {
  AudioSys.init();
  GAME.score = shot === 'landing' ? 350 : shot === 'rings' ? 100 : 0;
  startMission(shot === 'landing' ? 1 : 0);
  if (shot === 'cover') {
    PLANE.pos.set(10, 70, 300);
    PLANE.heading = 0.02;
    PLANE.pitch = 0;
    PLANE.roll = 0.04;
    PLANE.speed = 58;
    PLANE.throttle = 0.65;
    PLANE.fuel = 82;
    PLANE.airborne = true;
    PLANE.landed = false;
  } else if (shot === 'rings') {
    MISSIONS.ringsPassed = 1;
    highlightRing(1);
    PLANE.pos.set(-60, 118, -210);
    PLANE.heading = 0.38;
    PLANE.pitch = -0.02;
    PLANE.roll = 0.25;
    PLANE.speed = 62;
    PLANE.throttle = 0.7;
    PLANE.fuel = 64;
    PLANE.airborne = true;
    PLANE.landed = false;
  } else if (shot === 'landing') {
    // Final approach at an angle, so the runway reads in profile.
    PLANE.pos.set(180, 45, 320);
    PLANE.heading = 0.81;
    PLANE.pitch = -0.05;
    PLANE.roll = 0;
    PLANE.speed = 38;
    PLANE.throttle = 0.35;
    PLANE.fuel = 45;
    PLANE.airborne = true;
    PLANE.landed = false;
  }
  PLANE.group.position.copy(PLANE.pos);
  PLANE.group.rotation.set(0, 0, 0);
  PLANE.group.rotateY(PLANE.heading);
  PLANE.group.rotateX(PLANE.pitch);
  PLANE.group.rotateZ(PLANE.roll);
  GAME.state = 'flying';
  hideScreens();
  updateHUD();
  updateMissionHUD();
  updateCamera(0.05, true);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function bindInput() {
  const keymap = {
    KeyW: 'throttleUp', ArrowUp: 'pitchUp',
    KeyS: 'throttleDown', ArrowDown: 'pitchDown',
    ArrowLeft: 'rollLeft', KeyA: 'rollLeft',
    ArrowRight: 'rollRight', KeyD: 'rollRight',
    Space: 'boost'
  };
  window.addEventListener('keydown', function (e) {
    if (keymap[e.code] !== undefined) {
      input[keymap[e.code]] = true;
      e.preventDefault();
    }
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyR') startGame();
    if (e.code === 'KeyM') {
      const muted = AudioSys.toggleMute();
      showBanner(muted ? 'SUARA MATI' : 'SUARA HIDUP', 1200);
    }
    if (e.code === 'Enter') {
      if (GAME.state === 'title') startGame();
      else if (GAME.state === 'mission') {
        if (MISSIONS.current >= MISSIONS.list.length - 1) showComplete();
        else nextMission();
      }
      else if (GAME.state === 'crashed' || GAME.state === 'complete') startGame();
    }
  });
  window.addEventListener('keyup', function (e) {
    if (keymap[e.code] !== undefined) input[keymap[e.code]] = false;
  });

  // Mouse steering: hold the mouse button and move to steer.
  const canvas = document.getElementById('scene');
  canvas.addEventListener('pointerdown', function (e) {
    mouseSteering = true;
    steerFromPointer(e);
  });
  window.addEventListener('pointermove', function (e) {
    if (mouseSteering) steerFromPointer(e);
  });
  window.addEventListener('pointerup', function () {
    mouseSteering = false;
    input.mouseRoll = 0;
    input.mousePitch = 0;
  });

  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-resume').addEventListener('click', togglePause);
  document.getElementById('btn-restart-pause').addEventListener('click', startGame);
  document.getElementById('btn-retry').addEventListener('click', startGame);
  document.getElementById('btn-next').addEventListener('click', nextMission);
  document.getElementById('btn-again').addEventListener('click', startGame);
}

function steerFromPointer(e) {
  const nx = (e.clientX / window.innerWidth - 0.5) * 2;
  const ny = (e.clientY / window.innerHeight - 0.5) * 2;
  input.mouseRoll = Math.max(-1, Math.min(1, nx));
  input.mousePitch = Math.max(-1, Math.min(1, -ny));
}

function startGame() {
  AudioSys.init();
  AudioSys.resume();
  GAME.score = 0;
  GAME.justLanded = false;
  resetPlane();
  startMission(0);
  GAME.state = 'flying';
  hideScreens();
  updateHUD();
  updateCamera(0.05, true);
  showBanner('MISI 1 — LEWATI 5 CINCIN');
}

function nextMission() {
  if (MISSIONS.current >= MISSIONS.list.length - 1) return;
  startMission(MISSIONS.current + 1);
  GAME.state = 'flying';
  hideScreens();
  showBanner(MISSIONS.list[MISSIONS.current].name.toUpperCase());
}

function togglePause() {
  if (GAME.state === 'flying') {
    GAME.state = 'paused';
    showScreen('screen-pause');
  } else if (GAME.state === 'paused') {
    GAME.state = 'flying';
    hideScreens();
  }
}

function handleMissionDone(stars) {
  AudioSys.fanfare();
  GAME.state = 'mission';
  document.getElementById('mission-done-title').textContent =
    MISSIONS.current >= MISSIONS.list.length - 1 ? 'MISI TERAKHIR SELESAI!' : 'MISI SELESAI!';
  document.getElementById('mission-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  document.getElementById('mission-done-text').textContent =
    MISSIONS.current >= MISSIONS.list.length - 1
      ? 'Semua kargo sampai. Kamu pilot Nusantara sejati!'
      : 'Bagus! Lanjut ke misi berikutnya.';
  document.getElementById('mission-score').textContent = GAME.score;
  document.getElementById('btn-next').textContent =
    MISSIONS.current >= MISSIONS.list.length - 1 ? 'Lihat Hasil Akhir →' : 'Misi Berikutnya →';
  showScreen('screen-mission');
  if (MISSIONS.current >= MISSIONS.list.length - 1) {
    document.getElementById('btn-next').onclick = showComplete;
  } else {
    document.getElementById('btn-next').onclick = nextMission;
  }
}

function showComplete() {
  const totalStars = MISSIONS.stars[0] + MISSIONS.stars[1] + MISSIONS.stars[2];
  document.getElementById('final-stars').textContent = '★'.repeat(Math.max(1, Math.round(totalStars / 3))) + '☆'.repeat(3 - Math.max(1, Math.round(totalStars / 3)));
  document.getElementById('final-score').textContent = GAME.score;
  document.getElementById('final-note').textContent =
    totalStars >= 8 ? 'Sempurna! Sembilan bintang nyaris — langit Nusantara milikmu!'
    : totalStars >= 6 ? 'Pilot Nusantara yang hebat! Coba lagi untuk 9 bintang.'
    : 'Semua misi selesai. Terbang lagi untuk bintang lebih banyak!';
  GAME.state = 'complete';
  showScreen('screen-complete');
}

function crash(reason) {
  if (GAME.state !== 'flying') return;
  GAME.state = 'crashed';
  AudioSys.crash();
  AudioSys.setEngine(0, 0, false);
  document.getElementById('crash-reason').textContent = reason;
  document.getElementById('crash-score').textContent = GAME.score;
  showScreen('screen-crash');
}

function checkGroundContact() {
  if (!PLANE.airborne) return;
  const ground = terrainHeight(PLANE.pos.x, PLANE.pos.z);
  if (PLANE.pos.y > ground + 1.9) return;
  const vy = PLANE.vy;
  const overRunway = runwayContains(PLANE.pos.x, PLANE.pos.z);
  const pad = padAt(PLANE.pos.x, PLANE.pos.z);
  const onSea = ground < 0.6;
  if ((overRunway || pad) && vy > -6 && PLANE.speed < 50) {
    PLANE.airborne = false;
    PLANE.landed = true;
    PLANE.pos.y = ground + 1.9;
    PLANE.pitch = 0;
    PLANE.roll = 0;
    AudioSys.land();
    if (!GAME.justLanded) {
      showBanner(pad ? 'MENDARAT DI ' + pad.name.toUpperCase() + ' ✓' : 'MENDARAT ✓');
      GAME.justLanded = true;
    }
  } else if (vy > -2.5 && PLANE.speed < 22 && !onSea) {
    PLANE.damage += 15;
    PLANE.pos.y = ground + 2.6;
    PLANE.pitch = 0.12;
    showBanner('PENDARATAN KASAR! -15%');
    AudioSys.land();
    if (PLANE.damage >= 100) crash('Pesawat rusak parah setelah pendaratan kasar.');
  } else if (onSea) {
    crash('Jatuh ke laut. Jaga ketinggian di atas air!');
  } else {
    crash('Menabrak daratan. Terbang lebih tinggi di atas bukit!');
  }
}

function updateCamera(dt, snap) {
  const fwd = forwardVector();
  const desired = PLANE.pos.clone().addScaledVector(fwd, -16);
  desired.y += 5.2;
  if (snap) {
    camera.position.copy(desired);
  } else {
    const k = 1 - Math.pow(0.002, dt);
    camera.position.lerp(desired, k);
  }
  const look = PLANE.pos.clone().addScaledVector(fwd, 14);
  look.y += 1.2;
  camera.lookAt(look);
  const targetFov = 62 + (PLANE.speed / FLIGHT.maxSpeed) * 10;
  if (Math.abs(camera.fov - targetFov) > 0.2) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (GAME.state === 'title') {
    // Slow orbit around the parked plane as a living backdrop.
    const a = t * 0.12;
    camera.position.set(
      PLANE.pos.x + Math.sin(a) * 26,
      PLANE.pos.y + 9,
      PLANE.pos.z + Math.cos(a) * 26
    );
    camera.lookAt(PLANE.pos.x, PLANE.pos.y + 1, PLANE.pos.z);
    updateClouds(dt);
  } else if (GAME.state === 'flying') {
    if (SHOT) {
      // Posed screenshot state: the scene stays exactly as set.
      if (PLANE.propeller) PLANE.propeller.rotation.z += (2 + PLANE.throttle * 26) * dt;
      updateClouds(dt * 0.2);
    } else {
      updatePlane(dt, input);
      if (PLANE.airborne) GAME.justLanded = false;
      checkGroundContact();
      updateMissions(dt,
        function (passed, total) {
          if (total > 0) {
            AudioSys.ring();
            showBanner('CINCIN ' + passed + '/' + total + '! +100');
          } else {
            AudioSys.ring();
          }
        },
        function (stars) { handleMissionDone(stars); },
        function () {},
        function (stars) { handleMissionDone(stars); }
      );
      if (PLANE.damage >= 100 && GAME.state === 'flying') {
        crash(PLANE.crashReason || 'Pesawat rusak parah.');
      }
      // Low-fuel and boundary warnings, throttled.
      if (PLANE.fuel < 25 && PLANE.airborne && t - GAME.lowFuelAt > 10) {
        GAME.lowFuelAt = t;
        showBanner('⚠ BAHAN BAKAR RENDAH — MENDARAT UNTUK ISI ULANG');
        AudioSys.warning();
      }
      const dist = Math.sqrt(PLANE.pos.x * PLANE.pos.x + PLANE.pos.z * PLANE.pos.z);
      if (dist > WORLD_BOUND - 60 && t - GAME.boundAt > 8) {
        GAME.boundAt = t;
        showBanner('KEMBALI KE AREA MISI');
      }
      AudioSys.setEngine(PLANE.throttle, PLANE.speed / FLIGHT.maxSpeed, PLANE.airborne);
    }
    updateCamera(dt);
    updateClouds(dt);
    updateHUD();
  }
  // paused / mission / crashed / complete: freeze the frame, keep rendering.

  renderer.render(scene, camera);
}

boot();
