// hud.js — the instruments: DOM readouts, the attitude indicator canvas,
// banners and the title / pause / crash / mission / complete screens.

function $(id) { return document.getElementById(id); }

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function headingDeg() {
  let deg = (-PLANE.heading * 180 / Math.PI) % 360;
  if (deg < 0) deg += 360;
  return Math.round(deg);
}

function updateHUD() {
  $('hud-alt').textContent = Math.max(0, Math.round(PLANE.pos.y));
  $('hud-spd').textContent = Math.round(PLANE.speed * 3.6);
  $('hud-hdg').textContent = ('00' + headingDeg()).slice(-3) + '°';
  $('hud-thr').textContent = Math.round(PLANE.throttle * 100);
  $('hud-score').textContent = GAME.score;
  $('fuel-value').textContent = Math.round(PLANE.fuel) + '%';
  $('damage-value').textContent = Math.round(PLANE.damage) + '%';
  const fuelBar = $('fuel-bar');
  fuelBar.style.width = PLANE.fuel + '%';
  fuelBar.classList.toggle('low', PLANE.fuel < 25);
  $('damage-bar').style.width = PLANE.damage + '%';
  $('throttle-bar').style.width = (PLANE.throttle * 100) + '%';
  drawAttitude();
}

function updateMissionHUD() {
  const m = MISSIONS.list[MISSIONS.current];
  $('mission-name').textContent = m.name;
  let obj = m.objective;
  if (MISSIONS.current === 2 && MISSIONS.cargoLoaded) obj = 'Antar kargo ke Pad Antar (dekat landasan)';
  $('mission-objective').textContent = obj;
  $('mission-progress').textContent = missionProgressText();
  $('mission-timer').textContent = fmtTime(MISSIONS.timer);
}

function drawAttitude() {
  const c = $('attitude');
  const g = c.getContext('2d');
  const W = c.width, H = c.height, cx = W / 2, cy = H / 2;
  g.clearRect(0, 0, W, H);
  g.save();
  g.beginPath();
  g.arc(cx, cy, 66, 0, Math.PI * 2);
  g.clip();
  // Sky and ground, rotated by roll, shifted by pitch.
  g.translate(cx, cy);
  g.rotate(-PLANE.roll);
  const pitchPx = PLANE.pitch * 90;
  g.translate(0, pitchPx);
  g.fillStyle = '#2f7fd0';
  g.fillRect(-80, -140, 160, 140);
  g.fillStyle = '#7a5a34';
  g.fillRect(-80, 0, 160, 140);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-80, 0);
  g.lineTo(80, 0);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 1;
  for (const p of [-0.2, 0.2]) {
    g.beginPath();
    g.moveTo(-34, p * 90);
    g.lineTo(34, p * 90);
    g.stroke();
  }
  g.restore();
  // Fixed aircraft symbol + bezel.
  g.strokeStyle = '#ffe9a8';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - 26, cy);
  g.lineTo(cx + 26, cy);
  g.moveTo(cx, cy - 4);
  g.lineTo(cx, cy + 4);
  g.stroke();
  g.strokeStyle = '#8fd8ff';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, 66, 0, Math.PI * 2);
  g.stroke();
}

let bannerTimer = null;
function showBanner(text, ms) {
  const b = $('banner');
  b.textContent = text;
  b.classList.remove('hidden');
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(function () { b.classList.add('hidden'); }, ms || 2200);
}

function showScreen(id) {
  const ids = ['screen-title', 'screen-pause', 'screen-crash', 'screen-mission', 'screen-complete'];
  for (let i = 0; i < ids.length; i++) {
    $(ids[i]).classList.toggle('hidden', ids[i] !== id);
  }
  $('hud').classList.toggle('hidden', id === 'screen-title');
}

function hideScreens() {
  const ids = ['screen-title', 'screen-pause', 'screen-crash', 'screen-mission', 'screen-complete'];
  for (let i = 0; i < ids.length; i++) $(ids[i]).classList.add('hidden');
  $('hud').classList.remove('hidden');
}
