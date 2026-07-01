Object.assign(App, {
  // ---------- OWNER: MY LISTINGS ----------
  async renderMyListings() {
    this.setMain('<div class="card">Loading…</div>');
    const listings = await Api.myListings();
    if (!listings.length) {
      this.setMain(`<div class="empty-state">You haven't posted any listings yet. <br/><button class="btn" onclick="location.hash='#/new-listing'">Post your first listing</button></div>`);
      return;
    }
    this.setMain(`
      <div id="ownerListings">
        ${listings.map((l) => `
          <div class="card listing-card">
            <div class="listing-photo">🏠</div>
            <div style="flex:1;">
              <div class="split">
                <h3 style="margin:0;">${l.location} — ₹${l.rent.toLocaleString('en-IN')}/mo</h3>
                <span class="tag">${l.isFilled ? 'FILLED' : 'OPEN'}</span>
              </div>
              <div style="margin:8px 0;">
                <span class="tag">${l.roomType.replace('_',' ')}</span>
                <span class="tag">${l.furnishingStatus.replace('_',' ')}</span>
                <span class="tag">Available ${new Date(l.availableFrom).toLocaleDateString()}</span>
              </div>
              ${l.description ? `<p>${l.description}</p>` : ''}
              ${!l.isFilled ? `<button class="btn ghost fill-btn" data-id="${l.id}">Mark as filled</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `);
    document.querySelectorAll('.fill-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await Api.fillListing(btn.dataset.id);
        this.renderMyListings();
      });
    });
  },

  // ---------- OWNER: NEW LISTING ----------
  renderNewListing() {
    this.setMain(`
      <div class="card" style="max-width:560px;">
        <h2>Post a room listing</h2>
        <div id="formMsg"></div>
        <form id="listingForm">
          <label>Location</label><input name="location" required />
          <div class="grid cols-2">
            <div><label>Rent (₹/mo)</label><input type="number" name="rent" required /></div>
            <div><label>Available from</label><input type="date" name="availableFrom" required /></div>
          </div>
          <div class="grid cols-2">
            <div><label>Room type</label>
              <select name="roomType">
                <option value="PRIVATE_ROOM">Private room</option>
                <option value="SHARED_ROOM">Shared room</option>
                <option value="STUDIO">Studio</option>
                <option value="ENTIRE_FLAT">Entire flat</option>
              </select>
            </div>
            <div><label>Furnishing</label>
              <select name="furnishingStatus">
                <option value="FURNISHED">Furnished</option>
                <option value="SEMI_FURNISHED">Semi-furnished</option>
                <option value="UNFURNISHED">Unfurnished</option>
              </select>
            </div>
          </div>
          <label>Description (optional)</label>
          <textarea name="description"></textarea>
          <button class="btn" type="submit">Post listing</button>
        </form>
      </div>
    `);
    document.getElementById('listingForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await Api.createListing({
          location: fd.get('location'),
          rent: Number(fd.get('rent')),
          availableFrom: fd.get('availableFrom'),
          roomType: fd.get('roomType'),
          furnishingStatus: fd.get('furnishingStatus'),
          description: fd.get('description'),
        });
        location.hash = '#/my-listings';
      } catch (err) {
        document.getElementById('formMsg').innerHTML = `<div class="error-banner">${err.message}</div>`;
      }
    });
  },

  // ---------- OWNER: RECEIVED INTERESTS ----------
  async renderReceivedInterests() {
    this.setMain('<div class="card">Loading…</div>');
    const interests = await Api.interestsReceived();
    if (!interests.length) {
      this.setMain('<div class="empty-state">No interest requests yet.</div>');
      return;
    }
    this.setMain(`
      <div id="interestList">
        ${interests.map((i) => `
          <div class="card">
            <div class="split">
              <h3 style="margin:0;">${i.tenant.name}</h3>
              <span class="tag">${i.status}</span>
            </div>
            <p class="muted">${i.tenant.email}</p>
            <p>For listing: <strong>${i.listing.location} — ₹${i.listing.rent}</strong></p>
            ${i.tenant.tenantProfile ? `<p class="muted">Looking in ${i.tenant.tenantProfile.preferredLocation}, budget ₹${i.tenant.tenantProfile.budgetMin}-${i.tenant.tenantProfile.budgetMax}</p>` : ''}
            ${i.status === 'PENDING' ? `
              <div class="row">
                <button class="btn" data-action="ACCEPTED" data-id="${i.id}">Accept</button>
                <button class="btn danger" data-action="DECLINED" data-id="${i.id}">Decline</button>
              </div>
            ` : i.status === 'ACCEPTED' ? `<button class="btn ghost" onclick="location.hash='#/chats'">Go to chat</button>` : ''}
          </div>
        `).join('')}
      </div>
    `);
    document.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await Api.decideInterest(btn.dataset.id, btn.dataset.action);
          this.renderReceivedInterests();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  },
});
