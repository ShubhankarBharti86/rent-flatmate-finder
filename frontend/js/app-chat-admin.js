Object.assign(App, {
  // ---------- CHAT LIST ----------
  async renderChatList() {
    this.setMain('<div class="card">Loading…</div>');
    const chats = await Api.myChats();
    const user = this.currentUser();
    if (!chats.length) {
      this.setMain('<div class="empty-state">No active chats yet. Chats unlock once an interest is accepted.</div>');
      return;
    }
    this.setMain(`
      <div>
        ${chats.map((c) => {
          const other = user.role === 'TENANT' ? c.owner.name : c.tenant.name;
          return `
            <div class="card row" style="cursor:pointer;" onclick="location.hash='#/chat/${c.id}'">
              <div style="flex:1;">
                <strong>${other}</strong>
                <p class="muted" style="margin:2px 0 0;">${c.interest.listing.location} — ₹${c.interest.listing.rent}</p>
              </div>
              <span class="tag">Open</span>
            </div>
          `;
        }).join('')}
      </div>
    `);
  },

  // ---------- CHAT ROOM ----------
  async renderChatRoom(chatId) {
    this.setMain('<div class="card">Loading chat…</div>');
    const user = this.currentUser();
    const messages = await Api.chatMessages(chatId);

    this.setMain(`
      <button class="btn ghost" onclick="location.hash='#/chats'" style="margin-bottom:12px;">← Back to chats</button>
      <div class="chat-window">
        <div class="chat-messages" id="chatMessages">
          ${messages.map((m) => this.messageHtml(m, user)).join('')}
        </div>
        <div class="chat-input-row">
          <input id="chatInput" placeholder="Type a message…" />
          <button class="btn" id="sendBtn" style="margin-top:0;">Send</button>
        </div>
      </div>
    `);

    const box = document.getElementById('chatMessages');
    box.scrollTop = box.scrollHeight;

    this.connectSocket();
    this.socket.emit('join_chat', { chatId });

    const handleNewMessage = (msg) => {
      if (msg.chatId !== chatId) return;
      box.insertAdjacentHTML('beforeend', this.messageHtml(msg, user));
      box.scrollTop = box.scrollHeight;
    };
    this.socket.off('new_message');
    this.socket.on('new_message', handleNewMessage);

    const send = () => {
      const input = document.getElementById('chatInput');
      const content = input.value.trim();
      if (!content) return;
      this.socket.emit('send_message', { chatId, content });
      input.value = '';
    };
    document.getElementById('sendBtn').addEventListener('click', send);
    document.getElementById('chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send();
    });
  },

  messageHtml(m, user) {
    const mine = m.senderId === user.id || m.sender?.id === user.id;
    return `<div class="msg ${mine ? 'mine' : 'theirs'}">${m.content}</div>`;
  },

  connectSocket() {
    if (this.socket && this.socket.connected) return;
    this.socket = io({ auth: { token: Api.token() } });
  },

  // ---------- ADMIN ----------
  async renderAdmin() {
    this.setMain('<div class="card">Loading dashboard…</div>');
    const [stats, users, listings] = await Promise.all([Api.adminStats(), Api.adminUsers(), Api.adminListings()]);

    this.setMain(`
      <div class="grid cols-2">
        <div class="card"><h3>Users</h3><p style="font-size:1.8rem;margin:0;">${stats.users.total}</p>
          <p class="muted">${stats.users.tenants} tenants · ${stats.users.owners} owners</p></div>
        <div class="card"><h3>Listings</h3><p style="font-size:1.8rem;margin:0;">${stats.listings.total}</p>
          <p class="muted">${stats.listings.open} open · ${stats.listings.filled} filled</p></div>
        <div class="card"><h3>Interests</h3><p style="font-size:1.8rem;margin:0;">${stats.interests}</p></div>
        <div class="card"><h3>Chats / Messages</h3><p style="font-size:1.8rem;margin:0;">${stats.chats} / ${stats.messages}</p></div>
      </div>

      <h3 style="margin-top:24px;">Users</h3>
      <table class="card">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
        <tbody>
          ${users.map((u) => `<tr>
            <td>${u.name}</td><td>${u.email}</td><td>${u.role}</td>
            <td>${u.role !== 'ADMIN' ? `<button class="btn danger del-user" data-id="${u.id}" style="margin:0;padding:4px 10px;font-size:.8rem;">Delete</button>` : ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      <h3 style="margin-top:24px;">Listings</h3>
      <table class="card">
        <thead><tr><th>Location</th><th>Rent</th><th>Owner</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${listings.map((l) => `<tr>
            <td>${l.location}</td><td>₹${l.rent}</td><td>${l.owner.name}</td><td>${l.isFilled ? 'Filled' : 'Open'}</td>
            <td><button class="btn danger del-listing" data-id="${l.id}" style="margin:0;padding:4px 10px;font-size:.8rem;">Delete</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    `);

    document.querySelectorAll('.del-user').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Delete this user?')) return;
      await Api.adminDeleteUser(btn.dataset.id);
      this.renderAdmin();
    }));
    document.querySelectorAll('.del-listing').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Delete this listing?')) return;
      await Api.adminDeleteListing(btn.dataset.id);
      this.renderAdmin();
    }));
  },
});

App.init();
