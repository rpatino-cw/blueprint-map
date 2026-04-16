// ════════════════════════════════════════════════════════════════
// AUTH — Google Sign-In gate (CoreWeave accounts only)
// ════════════════════════════════════════════════════════════════

const BPAuth = (() => {
  const KEY = 'bp_auth';
  const HD  = 'coreweave.com';

  function init(clientId, onReady) {
    if (!clientId) {
      err('Google Client ID not configured — see README');
      return;
    }

    const s = load();
    if (s && s.exp > Date.now()) {
      open(s);
      onReady(s);
      return;
    }

    localStorage.removeItem(KEY);
    document.getElementById('auth-overlay').style.display = '';

    google.accounts.id.initialize({
      client_id: clientId,
      callback: r => verify(r, onReady),
      auto_select: true,
      hd: HD,
    });

    google.accounts.id.renderButton(
      document.getElementById('g-signin-btn'),
      { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 280 }
    );

    google.accounts.id.prompt();
  }

  function verify(response, onReady) {
    try {
      const p = jwt(response.credential);
      if (p.hd !== HD) { err('Access restricted to @coreweave.com'); return; }
      const s = { email: p.email, name: p.name, picture: p.picture, exp: p.exp * 1000 };
      localStorage.setItem(KEY, JSON.stringify(s));
      open(s);
      onReady(s);
    } catch (e) { err('Authentication failed — try again'); }
  }

  function open(s) {
    document.getElementById('auth-overlay').style.display = 'none';
    document.querySelector('.app').style.display = '';
    const avatar = document.getElementById('user-avatar');
    if (avatar && s.picture) {
      avatar.src = s.picture;
      avatar.title = s.name + ' (' + s.email + ')';
      avatar.parentElement.style.display = '';
    }
  }

  function err(msg) {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function jwt(t) {
    return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  }

  function signOut() {
    localStorage.removeItem(KEY);
    try { google.accounts.id.disableAutoSelect(); } catch(e) {}
    location.reload();
  }

  return { init, signOut, getSession: load };
})();
