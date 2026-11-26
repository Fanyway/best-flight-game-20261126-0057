// audio.js — all sound is WebAudio oscillators, no audio files, no network.
// Engine hum follows throttle and speed; chimes, thuds and fanfares are short
// oscillator envelopes. Nothing here loads or fetches anything.

const AudioSys = {
  ctx: null,
  master: null,
  engineOsc1: null,
  engineOsc2: null,
  engineGain: null,
  windOsc: null,
  windGain: null,
  muted: false,
  started: false,

  init: function () {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);

      // Engine: two detuned oscillators through a low-pass filter.
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      this.engineOsc1 = this.ctx.createOscillator();
      this.engineOsc1.type = 'sawtooth';
      this.engineOsc1.frequency.value = 55;
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc2.type = 'square';
      this.engineOsc2.frequency.value = 110;
      const osc2Gain = this.ctx.createGain();
      osc2Gain.gain.value = 0.4;
      this.engineOsc1.connect(this.engineGain);
      this.engineOsc2.connect(osc2Gain);
      osc2Gain.connect(this.engineGain);
      this.engineGain.connect(filter);
      filter.connect(this.master);
      this.engineOsc1.start();
      this.engineOsc2.start();

      // Wind whistle: a high sine whose gain follows airspeed.
      this.windOsc = this.ctx.createOscillator();
      this.windOsc.type = 'sine';
      this.windOsc.frequency.value = 620;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.0;
      this.windOsc.connect(this.windGain);
      this.windGain.connect(this.master);
      this.windOsc.start();

      this.started = true;
    } catch (e) {
      this.started = false;
    }
  },

  resume: function () {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  setEngine: function (throttle, speed01, airborne) {
    if (!this.started || this.muted) return;
    const t = this.ctx.currentTime;
    const base = 42 + throttle * 58 + speed01 * 22;
    this.engineOsc1.frequency.setTargetAtTime(base, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(base * 2.01, t, 0.08);
    this.engineGain.gain.setTargetAtTime(airborne ? 0.05 + throttle * 0.09 : 0.03 + throttle * 0.05, t, 0.1);
    this.windOsc.frequency.setTargetAtTime(480 + speed01 * 620, t, 0.1);
    this.windGain.gain.setTargetAtTime(airborne ? speed01 * 0.045 : 0.0, t, 0.15);
  },

  blip: function (freq, dur, type, vol, when) {
    if (!this.started || this.muted) return;
    const t0 = this.ctx.currentTime + (when || 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.22, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  },

  ring: function () {
    this.blip(659, 0.35, 'sine', 0.25, 0);
    this.blip(988, 0.5, 'sine', 0.22, 0.09);
  },

  land: function () {
    if (!this.started || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t0);
    osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.28);
    g.gain.setValueAtTime(0.4, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 0.35);
    this.blip(523, 0.3, 'triangle', 0.18, 0.05);
  },

  crash: function () {
    if (!this.started || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t0);
    osc.frequency.exponentialRampToValueAtTime(28, t0 + 0.7);
    g.gain.setValueAtTime(0.35, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.75);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 0.8);
  },

  fanfare: function () {
    const notes = [523, 659, 784, 1047];
    for (let i = 0; i < notes.length; i++) {
      this.blip(notes[i], 0.45, 'triangle', 0.22, i * 0.13);
    }
  },

  warning: function () {
    this.blip(440, 0.18, 'square', 0.1, 0);
    this.blip(440, 0.18, 'square', 0.1, 0.22);
  },

  toggleMute: function () {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }
};
