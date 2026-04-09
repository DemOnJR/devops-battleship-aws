// ─── Pirate Sound Engine (Web Audio API) ───────────────────────
// All sounds are synthesized in real-time - no audio files needed!
const SoundEngine = (() => {
  let ctx = null;
  let masterGain = null;
  let bgGain = null;
  let bgPlaying = false;
  let muted = false;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(ctx.destination);
  }

  // Ensure AudioContext is resumed (browsers block autoplay)
  function resume() {
    init();
    if (ctx.state === 'suspended') ctx.resume();
  }

  // ─── Cannon Fire Sound ─────────────────────────────────────
  // Deep boom + noise burst = realistic cannon
  function cannonFire() {
    resume();
    const now = ctx.currentTime;

    // Deep boom (low frequency oscillator)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.5);
    oscGain.gain.setValueAtTime(1, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.6);

    // Explosion noise burst
    const bufferSize = ctx.sampleRate * 0.4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Bandpass filter for crunchier explosion
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.3);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.8, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noise.start(now);

    // Secondary thud
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(50, now + 0.02);
    thud.frequency.exponentialRampToValueAtTime(10, now + 0.3);
    thudGain.gain.setValueAtTime(0.6, now + 0.02);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    thud.connect(thudGain);
    thudGain.connect(masterGain);
    thud.start(now + 0.02);
    thud.stop(now + 0.4);
  }

  // ─── Splash / Miss Sound ───────────────────────────────────
  function splash() {
    resume();
    const now = ctx.currentTime;

    // Filtered white noise for water splash
    const bufferSize = ctx.sampleRate * 0.6;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin(Math.PI * i / bufferSize) * Math.pow(1 - i / bufferSize, 1.5);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(500, now + 0.5);
    filter.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    noise.start(now);

    // Subtle plop
    const plop = ctx.createOscillator();
    const plopGain = ctx.createGain();
    plop.type = 'sine';
    plop.frequency.setValueAtTime(400, now);
    plop.frequency.exponentialRampToValueAtTime(100, now + 0.15);
    plopGain.gain.setValueAtTime(0.3, now);
    plopGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    plop.connect(plopGain);
    plopGain.connect(masterGain);
    plop.start(now);
    plop.stop(now + 0.2);
  }

  // ─── Hit / Explosion Sound ─────────────────────────────────
  function hit() {
    resume();
    const now = ctx.currentTime;

    // Fire the cannon first
    cannonFire();

    // Then impact explosion (delayed)
    setTimeout(() => {
      const t = ctx.currentTime;

      // Wood cracking
      const bufLen = ctx.sampleRate * 0.3;
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 4) * (Math.random() > 0.7 ? 2 : 0.5);
      }
      const crackNoise = ctx.createBufferSource();
      crackNoise.buffer = buf;

      const crackFilter = ctx.createBiquadFilter();
      crackFilter.type = 'highpass';
      crackFilter.frequency.value = 1000;

      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(0.5, t);
      crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      crackNoise.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(masterGain);
      crackNoise.start(t);

      // Impact thud
      const impOsc = ctx.createOscillator();
      const impGain = ctx.createGain();
      impOsc.type = 'sine';
      impOsc.frequency.setValueAtTime(120, t);
      impOsc.frequency.exponentialRampToValueAtTime(30, t + 0.2);
      impGain.gain.setValueAtTime(0.6, t);
      impGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      impOsc.connect(impGain);
      impGain.connect(masterGain);
      impOsc.start(t);
      impOsc.stop(t + 0.25);
    }, 300);
  }

  // ─── Ship Sunk Sound ───────────────────────────────────────
  function sunk() {
    resume();
    hit();
    // Dramatic sinking groan
    setTimeout(() => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 1.5);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.linearRampToValueAtTime(0.3, t + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 1.5);

      // Bubbles
      for (let i = 0; i < 6; i++) {
        const bub = ctx.createOscillator();
        const bGain = ctx.createGain();
        const start = t + 0.5 + i * 0.15;
        bub.type = 'sine';
        bub.frequency.setValueAtTime(300 + Math.random() * 400, start);
        bub.frequency.exponentialRampToValueAtTime(100 + Math.random() * 200, start + 0.1);
        bGain.gain.setValueAtTime(0.1, start);
        bGain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
        bub.connect(bGain);
        bGain.connect(masterGain);
        bub.start(start);
        bub.stop(start + 0.12);
      }
    }, 600);
  }

  // ─── Reload Click Sound ────────────────────────────────────
  function reload() {
    resume();
    const now = ctx.currentTime;

    // Metallic click
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'square';
    click.frequency.setValueAtTime(800, now);
    click.frequency.exponentialRampToValueAtTime(200, now + 0.03);
    clickGain.gain.setValueAtTime(0.3, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    click.connect(clickGain);
    clickGain.connect(masterGain);
    click.start(now);
    click.stop(now + 0.05);

    // Chain rattle
    const bufLen = ctx.sampleRate * 0.15;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      d[i] = (Math.random() * 2 - 1) * 0.2 * (Math.random() > 0.85 ? 1 : 0.1);
    }
    const rattle = ctx.createBufferSource();
    rattle.buffer = buf;
    const rattleFilter = ctx.createBiquadFilter();
    rattleFilter.type = 'highpass';
    rattleFilter.frequency.value = 3000;
    const rattleGain = ctx.createGain();
    rattleGain.gain.setValueAtTime(0.4, now + 0.05);
    rattleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    rattle.connect(rattleFilter);
    rattleFilter.connect(rattleGain);
    rattleGain.connect(masterGain);
    rattle.start(now + 0.05);

    // Second click (cannon locking)
    const click2 = ctx.createOscillator();
    const click2Gain = ctx.createGain();
    click2.type = 'square';
    click2.frequency.setValueAtTime(600, now + 0.2);
    click2.frequency.exponentialRampToValueAtTime(150, now + 0.23);
    click2Gain.gain.setValueAtTime(0.25, now + 0.2);
    click2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    click2.connect(click2Gain);
    click2Gain.connect(masterGain);
    click2.start(now + 0.2);
    click2.stop(now + 0.25);
  }

  // ─── Ambient Ocean Background ──────────────────────────────
  // Layered noise loops simulating ocean waves + creaking wood
  function startBackground() {
    if (bgPlaying) return;
    resume();
    bgPlaying = true;

    bgGain = ctx.createGain();
    bgGain.gain.value = 0.25; // 25% volume as requested
    bgGain.connect(masterGain);

    // Ocean waves - looping filtered noise
    function createWaveLayer(freq, q, duration, volume) {
      function playWave() {
        if (!bgPlaying) return;
        const now = ctx.currentTime;
        const bufLen = ctx.sampleRate * duration;
        const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) {
          const env = Math.sin(Math.PI * i / bufLen);
          data[i] = (Math.random() * 2 - 1) * env;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 0.5, now);
        filter.frequency.linearRampToValueAtTime(freq, now + duration * 0.4);
        filter.frequency.linearRampToValueAtTime(freq * 0.3, now + duration);
        filter.Q.value = q;

        const gain = ctx.createGain();
        gain.gain.value = volume;

        src.connect(filter);
        filter.connect(gain);
        gain.connect(bgGain);
        src.start(now);
        src.onended = () => setTimeout(playWave, Math.random() * 1000);
      }
      playWave();
    }

    // Layer 1: Deep slow waves
    createWaveLayer(400, 0.3, 4, 0.35);
    // Layer 2: Medium waves (offset)
    setTimeout(() => createWaveLayer(600, 0.5, 3, 0.25), 1500);
    // Layer 3: High gentle wash
    setTimeout(() => createWaveLayer(1200, 0.8, 2.5, 0.15), 3000);

    // Ship creaking - occasional low groans
    function creak() {
      if (!bgPlaying) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const baseFreq = 60 + Math.random() * 40;
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.linearRampToValueAtTime(baseFreq + 15, now + 0.3);
      osc.frequency.linearRampToValueAtTime(baseFreq - 10, now + 0.8);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.1);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1);
      osc.connect(gain);
      gain.connect(bgGain);
      osc.start(now);
      osc.stop(now + 1);
      setTimeout(creak, 5000 + Math.random() * 10000);
    }
    setTimeout(creak, 3000);

    // Wind whistle
    function wind() {
      if (!bgPlaying) return;
      const now = ctx.currentTime;
      const dur = 2 + Math.random() * 3;
      const bufLen = ctx.sampleRate * dur;
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / bufLen);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800 + Math.random() * 400, now);
      filter.frequency.linearRampToValueAtTime(600 + Math.random() * 300, now + dur);
      filter.Q.value = 8;
      const gain = ctx.createGain();
      gain.gain.value = 0.06;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(bgGain);
      src.start(now);
      setTimeout(wind, (dur + 3 + Math.random() * 8) * 1000);
    }
    setTimeout(wind, 2000);
  }

  function stopBackground() {
    bgPlaying = false;
    if (bgGain) {
      bgGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
    }
  }

  function toggleMute() {
    muted = !muted;
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.7;
    return muted;
  }

  function isMuted() { return muted; }

  // UI notification sound
  function notify() {
    resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523, now);
    osc.frequency.setValueAtTime(659, now + 0.1);
    osc.frequency.setValueAtTime(784, now + 0.2);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  return { cannonFire, splash, hit, sunk, reload, startBackground, stopBackground, toggleMute, isMuted, notify, resume };
})();
