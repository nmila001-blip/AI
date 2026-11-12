(function(){
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: light)');
  let savedMode = null;
  try { savedMode = localStorage.getItem('ai-tutor-color-mode'); } catch {}
  function setMode(mode) {
    root.dataset.mode = mode;
    root.style.colorScheme = mode;
    const button = document.getElementById('color-mode-toggle');
    if (button) {
      button.textContent = mode === 'light' ? 'Dark mode' : 'Light mode';
      button.setAttribute('aria-label', 'Switch to ' + (mode === 'light' ? 'dark' : 'light') + ' mode');
    }
  }
  setMode(savedMode === 'light' || savedMode === 'dark' ? savedMode : system.matches ? 'light' : 'dark');
  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet'; sheet.href = 'appearance.css?v=1'; document.head.appendChild(sheet);
  function setupMode() {
    if (document.getElementById('color-mode-toggle')) return;
    const button = document.createElement('button');
    button.id = 'color-mode-toggle'; button.type = 'button'; button.className = 'secondary-button';
    const host = document.querySelector('.topbar, .messages-heading-actions, .messages-heading');
    if (host) host.appendChild(button);
    else { button.classList.add('color-mode-floating'); document.body.appendChild(button); }
    const workspace = document.createElement('a');
    workspace.href = 'workspace.html'; workspace.className = 'secondary-button'; workspace.textContent = 'Tasks & Games';
    if (host) host.appendChild(workspace);
    else document.querySelector('main')?.prepend(workspace);
    button.addEventListener('click', () => {
      savedMode = root.dataset.mode === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('ai-tutor-color-mode', savedMode); } catch {}
      setMode(savedMode);
    });
    setMode(root.dataset.mode);
  }
  system.addEventListener?.('change', event => { if (savedMode !== 'light' && savedMode !== 'dark') setMode(event.matches ? 'light' : 'dark'); });
  window.addEventListener('storage', event => {
    if (event.key === 'ai-tutor-color-mode') { savedMode = event.newValue; setMode(savedMode === 'light' || savedMode === 'dark' ? savedMode : system.matches ? 'light' : 'dark'); }
  });
  async function applyCosmetics(){
    try {
      const {data:{session}}=await supabaseClient.auth.getSession();
      if(!session?.user)return;
      const {data,error}=await supabaseClient.from('user_profiles')
        .select('equipped_theme,equipped_avatar,equipped_bubble').eq('user_id',session.user.id).maybeSingle();
      if(error||!data)return;
      document.body.dataset.theme=data.equipped_theme||'violet';
      document.body.dataset.bubble=data.equipped_bubble||'violet';
      const avatar=data.equipped_avatar||'spark';
      if(avatar!=='spark') document.querySelectorAll('.avatar,.large-avatar,.profile-avatar').forEach(el=>el.textContent=avatar);
    } catch(error) { console.warn('Cosmetics could not be applied:',error); }
  }
  window.applySavedCosmetics=applyCosmetics;
  function ready() { setupMode(); if(typeof supabaseClient!=='undefined') applyCosmetics(); }
  if(typeof supabaseClient!=='undefined') supabaseClient.auth.onAuthStateChange(()=>setTimeout(applyCosmetics,0));
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',ready); else ready();
})();
