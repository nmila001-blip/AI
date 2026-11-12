(() => {
  if (document.body.dataset.page !== 'messages') return;
  const overlay = document.getElementById('call-overlay');
  const state = document.getElementById('call-state');
  const host = document.querySelector('.messages-heading-actions');
  if (!overlay || !state || !host) return;
  const presets = {
    neon: { name: 'Neon', notes: [659.25, 830.61, 987.77, 830.61, 739.99, 987.77], step: 0.16, duration: 0.24, wave: 'triangle', volume: 0.055 },
    arcade: { name: 'Arcade', notes: [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50, 1318.51], step: 0.11, duration: 0.13, wave: 'square', volume: 0.022 },
    crystal: { name: 'Crystal', notes: [783.99, 987.77, 1174.66, 1567.98], step: 0.24, duration: 0.65, wave: 'sine', volume: 0.065 },
    orbit: { name: 'Orbit', notes: [440, 554.37, 659.25, 880, 659.25, 554.37], step: 0.20, duration: 0.38, wave: 'triangle', volume: 0.05 },
    classic: { name: 'Classic', notes: [880, 698.46, 880, 698.46, 880, 698.46], step: 0.10, duration: 0.12, wave: 'sine', volume: 0.065 }
  };
  let enabled = true, selected = 'neon';
  try {
    enabled = localStorage.getItem('ai-tutor-call-sounds') !== 'off';
    const saved = localStorage.getItem('ai-tutor-ringtone');
    if (Object.hasOwn(presets, saved)) selected = saved;
  } catch {}
  let context = null, timer = null, deadline = null, mode = '', observed = '', silenced = '', generation = 0;
  const voices = new Set();
  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'secondary-button'; button.id = 'toggle-call-sounds';
  const label = document.createElement('label');
  label.htmlFor = 'call-ringtone-select'; label.textContent = 'Ringtone';
  const select = document.createElement('select');
  select.id = 'call-ringtone-select'; select.className = 'secondary-button';
  for (const [id, preset] of Object.entries(presets)) select.add(new Option(preset.name, id));
  select.value = selected;
  const preview = document.createElement('button');
  preview.type = 'button'; preview.className = 'secondary-button'; preview.textContent = 'Preview';
  const status = document.createElement('span');
  status.setAttribute('role', 'status'); status.style.fontSize = '12px';
  controls.append(button, label, select, preview, status); host.prepend(controls);
  function render() {
    button.textContent = enabled ? 'Call sounds: on' : 'Call sounds: off';
    button.setAttribute('aria-pressed', String(enabled));
    button.title = 'Toggle call sounds';
    preview.disabled = !enabled || !overlay.hidden;
    preview.title = !enabled ? 'Enable call sounds to preview' : !overlay.hidden ? 'Preview is available outside calls' : 'Play selected ringtone once';
  }
  async function unlock() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return false;
      if (!context) context = new Audio();
      if (context.state === 'suspended') await context.resume();
      return context.state === 'running';
    } catch { return false; }
  }
  function note(frequency, delay, duration, volume, type = 'sine') {
    if (!enabled || !context || context.state !== 'running') return;
    try {
      const oscillator = context.createOscillator(), gain = context.createGain();
      const at = context.currentTime + delay;
      oscillator.type = type; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      oscillator.connect(gain); gain.connect(context.destination); voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(at); oscillator.stop(at + duration + 0.03);
    } catch {}
  }
  function stop() {
    generation++; clearInterval(timer); clearTimeout(deadline);
    timer = null; deadline = null; mode = '';
    for (const voice of voices) { try { voice.stop(); } catch {} }
    voices.clear();
  }
  function phrase(kind) {
    if (kind === 'incoming') {
      const p = presets[selected];
      p.notes.forEach((hz, i) => {
        note(hz, i * p.step, p.duration, p.volume, p.wave);
        if (selected === 'neon' || selected === 'orbit') note(hz / 2, i * p.step, p.duration + 0.04, 0.025);
        if (selected === 'crystal') note(hz * 2, i * p.step, 0.35, 0.012);
      });
    } else {
      [0, 0.32].forEach(at => { note(440, at, 0.22, 0.035); note(554.37, at, 0.22, 0.025); });
    }
  }
  function sync() {
    render();
    const text = state.textContent.trim(), key = overlay.hidden ? '' : text;
    if (key !== observed) { observed = key; silenced = ''; }
    const next = !overlay.hidden && enabled && key !== silenced
      ? (/^Incoming (voice|video) call$/.test(text) ? 'incoming' : /^Calling .+/.test(text) ? 'outgoing' : '') : '';
    if (next === mode) { if (!overlay.hidden && !next) stop(); return; }
    stop(); if (!next) return;
    mode = next; phrase(next);
    timer = setInterval(() => phrase(next), next === 'incoming' ? 2400 : 3200);
    deadline = setTimeout(() => { silenced = observed; stop(); }, 35000);
  }
  button.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem('ai-tutor-call-sounds', enabled ? 'on' : 'off'); } catch {}
    stop(); status.textContent = ''; render();
    if (enabled) { unlock(); silenced = ''; sync(); }
  });
  select.addEventListener('change', () => {
    selected = select.value;
    try { localStorage.setItem('ai-tutor-ringtone', selected); } catch {}
    status.textContent = presets[selected].name + ' selected';
    if (overlay.hidden) stop();
  });
  preview.addEventListener('click', async () => {
    if (!enabled || !overlay.hidden) return;
    stop(); const ticket = generation;
    const ready = await unlock();
    if (ticket !== generation || !enabled || !overlay.hidden) return;
    if (!ready) { status.textContent = 'Sound could not start. Check browser audio settings.'; return; }
    status.textContent = presets[selected].name + ' preview'; phrase('incoming');
  });
  document.addEventListener('pointerdown', () => { if (enabled) unlock(); }, { passive: true });
  document.addEventListener('keydown', () => { if (enabled) unlock(); });
  document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('#call-accept, #call-decline, #call-hangup')) { silenced = observed; stop(); }
  }, true);
  new MutationObserver(sync).observe(overlay, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true });
  window.addEventListener('pagehide', stop);
  render(); sync();
})();
