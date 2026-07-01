Object.assign(App, {
  // ---------- TENANT PROFILE ----------
  async renderProfile() {
    this.setMain('<div class="card">Loading…</div>');
    let profile = null;
    try { profile = await Api.getMyProfile(); } catch (e) { /* no profile yet */ }

    this.setMain(`
      <div class="card" style="max-width:520px;">
        <h2>Your tenant profile</h2>
        <p class="muted">This is what owners' listings get compared against for AI compatibility scoring.</p>
        <div id="formMsg"></div>
        <form id="profileForm">
          <label>Preferred location</label>
          <input name="preferredLocation" required value="${profile?.preferredLocation || ''}" />
          <div class="grid cols-2">
            <div><label>Budget min (₹/mo)</label><input type="number" name="budgetMin" required value="${profile?.budgetMin ?? ''}" /></div>
            <div><label>Budget max (₹/mo)</label><input type="number" name="budgetMax" required value="${profile?.budgetMax ?? ''}" /></div>
          </div>
          <label>Move-in date</label>
          <input type="date" name="moveInDate" required value="${profile?.moveInDate ? profile.moveInDate.substring(0,10) : ''}" />
          <label>Bio (optional - helps the AI judge room type/furnishing fit)</label>
          <textarea name="bio">${profile?.bio || ''}</textarea>
          <button class="btn" type="submit">Save profile</button>
        </form>
      </div>
    `);

    document.getElementById('profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await Api.saveMyProfile({
          preferredLocation: fd.get('preferredLocation'),
          budgetMin: Number(fd.get('budgetMin')),
          budgetMax: Number(fd.get('budgetMax')),
          moveInDate: fd.get('moveInDate'),
          bio: fd.get('bio'),
        });
        document.getElementById('formMsg').innerHTML = '<div class="success-banner">Profile saved.</div>';
      } catch (err) {
        document.getElementById('formMsg').innerHTML = `<div class="error-banner">${err.message}</div>`;
      }
    });
  },

  // ---------- BROWSE LISTINGS (TENANT) ----------
  async renderBrowse() {
    this.setMain('<div class="card">Loading listings…</div>');

    let listings;
    try {
      listings = await Api.browseListings();
    } catch (err) {
      if (err.message.includes('profile')) {
        this.setMain(`<div class="card"><p>${err.message}</p><button class="btn" onclick="location.hash='#/profile'">Create profile</button></div>`);
        return;
      }
      this.setMain(`<div class="error-banner">${err.message}</div>`);
      return;
    }

    if (!listings.length) {
      this.setMain('<div class="empty-state">No open listings match your filters right now. Check back soon.</div>');
      return;
    }

    const scoreClass = (s) => s >= 80 ? 'score-high' : s >= 50 ? 'score-mid' : 'score-low';

    this.setMain(`
      <div class="row" style="margin-bottom:14px;">
        <input id="locFilter" placeholder="Filter by location" style="max-width:220px;" />
        <input id="minRentFilter" type="number" placeholder="Min rent" style="max-width:120px;" />
        <input id="maxRentFilter" type="number" placeholder="Max rent" style="max-width:120px;" />
        <button class="btn secondary" id="filterBtn" style="margin-top:0;">Filter</button>
      </div>
      <div id="listingsList">
        ${listings.map((l) => this.listingCardHtml(l, scoreClass)).join('')}
      </div>
    `);

    document.getElementById('filterBtn').addEventListener('click', async () => {
      const params = {};
      const loc = document.getElementById('locFilter').value.trim();
      const min = document.getElementById('minRentFilter').value;
      const max = document.getElementById('maxRentFilter').value;
      if (loc) params.location = loc;
      if (min) params.minRent = min;
      if (max) params.maxRent = max;
      const filtered = await Api.browseListings(params);
      document.getElementById('listingsList').innerHTML = filtered.length
        ? filtered.map((l) => this.listingCardHtml(l, scoreClass)).join('')
        : '<div class="empty-state">No listings match those filters.</div>';
      this.bindInterestButtons();
    });

    this.bindInterestButtons();
  },

  listingCardHtml(l, scoreClass) {
    return `
      <div class="card listing-card">
        <div class="listing-photo">🏠</div>
        <div style="flex:1;">
          <div class="split">
            <h3 style="margin:0;">${l.location} — ₹${l.rent.toLocaleString('en-IN')}/mo</h3>
            <span class="score-badge ${scoreClass(l.compatibility.score)}">${l.compatibility.score}% match</span>
          </div>
          <p class="muted" style="margin:4px 0;">${l.compatibility.explanation} <em>(${l.compatibility.source === 'LLM' ? 'AI' : 'rule-based'})</em></p>
          <div style="margin:8px 0;">
            <span class="tag">${l.roomType.replace('_',' ')}</span>
            <span class="tag">${l.furnishingStatus.replace('_',' ')}</span>
            <span class="tag">Available ${new Date(l.availableFrom).toLocaleDateString()}</span>
          </div>
          ${l.description ? `<p>${l.description}</p>` : ''}
          <p class="muted">Owner: ${l.owner?.name || '—'}</p>
          <button class="btn interest-btn" data-id="${l.id}">Express interest</button>
        </div>
      </div>
    `;
  },

  bindInterestButtons() {
    document.querySelectorAll('.interest-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Sending…';
        try {
          await Api.expressInterest(btn.dataset.id);
          btn.textContent = 'Interest sent ✓';
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Express interest';
          alert(err.message);
        }
      });
    });
  },

  // ---------- SENT INTERESTS (TENANT) ----------
  async renderSentInterests() {
    this.setMain('<div class="card">Loading…</div>');
    const interests = await Api.interestsSent();
    if (!interests.length) {
      this.setMain('<div class="empty-state">You haven\'t expressed interest in any listings yet.</div>');
      return;
    }
    this.setMain(`
      <table class="card">
        <thead><tr><th>Listing</th><th>Owner</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${interests.map((i) => `
            <tr>
              <td>${i.listing.location} — ₹${i.listing.rent}</td>
              <td>${i.owner.name}</td>
              <td><span class="tag">${i.status}</span></td>
              <td>${i.status === 'ACCEPTED' ? `<button class="btn ghost" onclick="location.hash='#/chats'">Go to chat</button>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `);
  },
});
