const App = {
  socket: null,

  init() {
    window.addEventListener('hashchange', () => this.render());
    this.render();
  },

  currentUser() { return Api.user(); },

  logout() {
    Api.clearSession();
    if (this.socket) { this.socket.disconnect(); this.socket = null; }
    location.hash = '#/login';
  },

  route() {
    return location.hash.replace('#', '') || '/login';
  },

  async render() {
    const user = this.currentUser();
    const path = this.route();

    if (!user && !['/login', '/register'].includes(path)) {
      location.hash = '#/login';
      return;
    }
    if (user && ['/login', '/register'].includes(path)) {
      location.hash = user.role === 'TENANT' ? '#/browse' : user.role === 'OWNER' ? '#/my-listings' : '#/admin';
      return;
    }

    document.getElementById('app').innerHTML = this.layout(path);
    this.bindLayoutEvents();

    try {
      if (path === '/login') return this.renderLogin();
      if (path === '/register') return this.renderRegister();
      if (path === '/browse') return this.renderBrowse();
      if (path === '/profile') return this.renderProfile();
      if (path === '/sent-interests') return this.renderSentInterests();
      if (path === '/my-listings') return this.renderMyListings();
      if (path === '/new-listing') return this.renderNewListing();
      if (path === '/received-interests') return this.renderReceivedInterests();
      if (path === '/chats') return this.renderChatList();
      if (path.startsWith('/chat/')) return this.renderChatRoom(path.split('/chat/')[1]);
      if (path === '/admin') return this.renderAdmin();
      this.setMain('<div class="empty-state">Not found</div>');
    } catch (err) {
      this.setMain(`<div class="error-banner">${err.message}</div>`);
    }
  },

  layout(path) {
    const user = this.currentUser();
    if (!user) {
      return `<main id="main"></main>`;
    }
    const tabs = {
      TENANT: [['/browse', 'Browse'], ['/sent-interests', 'My Interests'], ['/chats', 'Chats'], ['/profile', 'Profile']],
      OWNER: [['/my-listings', 'My Listings'], ['/new-listing', 'Post Listing'], ['/received-interests', 'Interest Requests'], ['/chats', 'Chats']],
      ADMIN: [['/admin', 'Dashboard']],
    }[user.role] || [];

    return `
      <header class="topbar">
        <div class="brand"><span class="mark">⌂</span> Rent &amp; Flatmate Finder</div>
        <nav class="tabs">
          ${tabs.map(([href, label]) => `<button data-href="${href}" class="${this.route() === href ? 'active' : ''}">${label}</button>`).join('')}
        </nav>
        <div class="userbox">
          <span class="pill">${user.role}</span>
          <span>${user.name}</span>
          <button class="btn ghost" id="logoutBtn" style="margin:0;padding:6px 12px;">Log out</button>
        </div>
      </header>
      <main id="main"></main>
    `;
  },

  bindLayoutEvents() {
    document.querySelectorAll('nav.tabs button').forEach((btn) => {
      btn.addEventListener('click', () => { location.hash = `#${btn.dataset.href}`; });
    });
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());
  },

  setMain(html) {
    const main = document.getElementById('main');
    if (main) main.innerHTML = html;
  },

  // ---------- AUTH ----------
  renderLogin() {
    this.setMain(`
      <div class="center-form card">
        <h2>Log in</h2>
        <div id="formMsg"></div>
        <form id="loginForm">
          <label>Email</label><input type="email" name="email" required />
          <label>Password</label><input type="password" name="password" required />
          <button class="btn" type="submit">Log in</button>
        </form>
        <p class="muted">No account? <a href="#/register">Register here</a></p>
      </div>
    `);
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const { token, user } = await Api.login({ email: fd.get('email'), password: fd.get('password') });
        Api.setSession(token, user);
        location.hash = '#/browse';
        this.render();
      } catch (err) {
        document.getElementById('formMsg').innerHTML = `<div class="error-banner">${err.message}</div>`;
      }
    });
  },

  renderRegister() {
    this.setMain(`
      <div class="center-form card">
        <h2>Create account</h2>
        <div id="formMsg"></div>
        <form id="regForm">
          <label>Full name</label><input name="name" required />
          <label>Email</label><input type="email" name="email" required />
          <label>Password</label><input type="password" name="password" minlength="6" required />
          <label>I am a</label>
          <select name="role">
            <option value="TENANT">Tenant looking for a room</option>
            <option value="OWNER">Owner listing a room</option>
          </select>
          <button class="btn" type="submit">Register</button>
        </form>
        <p class="muted">Already have an account? <a href="#/login">Log in</a></p>
      </div>
    `);
    document.getElementById('regForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const { token, user } = await Api.register({
          name: fd.get('name'), email: fd.get('email'), password: fd.get('password'), role: fd.get('role'),
        });
        Api.setSession(token, user);
        this.render();
      } catch (err) {
        document.getElementById('formMsg').innerHTML = `<div class="error-banner">${err.message}</div>`;
      }
    });
  },
};
