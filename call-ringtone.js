(() => {
  if (document.body.dataset.page !== 'messages') return;
  const overlay = document.getElementById('call-overlay');
  const state = document.getElementById('call-state');
  if (!overlay || !state) return;
  let enabled = true;
  try { enabled = localStorage.getItem('ai-tutor-call-sounds') !== 'off'; } catch {}
  let context = null, timer = null, deadline = null, mode = '', observed = '', silenced = '';
  const voices = new Set();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary-button';
  button.id = 'toggle-call-sounds';
  document.querySelector('.messages-heading-actions')?.prepend(button);
  function render() {
    button.textContent = enabled ? 'Call sounds: on' : 'Call sounds: off';
    button.setAttribute('aria-pressed', String(enabled));
    button.title = 'Toggle call sounds; enabling plays a short preview';
  }
  function unlock() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!context) context = new Audio();
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch {}
  }
  function note(frequency, delay, duration, volume, type = 'sine') {
    if (!enabled || !context || context.state !== 'running') return;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = context.currentTime + delay;
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(at);
      oscillator.stop(at + duration + 0.03);
    } catch {}
  }
  function stop() {
    clearInterval(timer);
    clearTimeout(deadline);
    timer = null; deadline = null; mode = '';
    for (const voice of voices) { try { voice.stop(); } catch {} }
    voices.clear();
  }
  function phrase(kind) {
    if (kind === 'incoming') {
      [659.25, 830.61, 987.77, 830.61, 739.99, 987.77].forEach((hz, i) => {
        note(hz, i * 0.16, 0.24, 0.055, 'triangle');
        note(hz / 2, i * 0.16, 0.28, 0.025);
      });
    } else {
      [0, 0.32].forEach(at => { note(440, at, 0.22, 0.035); note(554.37, at, 0.22, 0.025); });
    }
  }
  function sync() {
    const text = state.textContent.trim();
    const key = overlay.hidden ? '' : text;
    if (key !== observed) { observed = key; silenced = ''; }
    const next = !overlay.hidden && enabled && key !== silenced
      ? (/^Incoming (voice|video) call$/.test(text) ? 'incoming' : /^Calling .+/.test(text) ? 'outgoing' : '') : '';
    if (next === mode) return;
    stop();
    if (!next) return;
    mode = next;
    phrase(next);
    timer = setInterval(() => phrase(next), next === 'incoming' ? 2400 : 3200);
    deadline = setTimeout(() => { silenced = observed; stop(); }, 35000);
  }
  button.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem('ai-tutor-call-sounds', enabled ? 'on' : 'off'); } catch {}
    render(); stop();
    if (enabled) {
      unlock(); silenced = ''; sync();
      if (!mode) setTimeout(() => { if (enabled && !mode) note(830.61, 0, 0.22, 0.05, 'triangle'); }, 80);
    }
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
