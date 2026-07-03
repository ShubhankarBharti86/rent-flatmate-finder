const API_BASE = 'https://rent-flatmate-finder-backend-17ha.onrender.com/api';

const Api = {
  token() { return localStorage.getItem('rff_token'); },
  user() {
    try { return JSON.parse(localStorage.getItem('rff_user') || 'null'); } catch { return null; }
  },
  setSession(token, user) {
    localStorage.setItem('rff_token', token);
    localStorage.setItem('rff_user', JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem('rff_token');
    localStorage.removeItem('rff_user');
  },

  async request(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && this.token()) headers.Authorization = `Bearer ${this.token()}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }

    if (!res.ok) {
      const message = (data && data.error) || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return data;
  },

  register(payload) { return this.request('/auth/register', { method: 'POST', body: payload, auth: false }); },
  login(payload) { return this.request('/auth/login', { method: 'POST', body: payload, auth: false }); },

  getMyProfile() { return this.request('/tenant-profile/me'); },
  saveMyProfile(payload) { return this.request('/tenant-profile/me', { method: 'PUT', body: payload }); },

  browseListings(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/listings${qs ? `?${qs}` : ''}`);
  },
  getListing(id) { return this.request(`/listings/${id}`); },
  createListing(payload) { return this.request('/listings', { method: 'POST', body: payload }); },
  myListings() { return this.request('/listings/mine'); },
  fillListing(id) { return this.request(`/listings/${id}/fill`, { method: 'PATCH' }); },

  expressInterest(listingId) { return this.request('/interests', { method: 'POST', body: { listingId } }); },
  interestsReceived() { return this.request('/interests/received'); },
  interestsSent() { return this.request('/interests/sent'); },
  decideInterest(id, status) { return this.request(`/interests/${id}`, { method: 'PATCH', body: { status } }); },

  myChats() { return this.request('/chats'); },
  chatMessages(chatId) { return this.request(`/chats/${chatId}/messages`); },

  adminStats() { return this.request('/admin/stats'); },
  adminUsers() { return this.request('/admin/users'); },
  adminListings() { return this.request('/admin/listings'); },
  adminDeleteUser(id) { return this.request(`/admin/users/${id}`, { method: 'DELETE' }); },
  adminDeleteListing(id) { return this.request(`/admin/listings/${id}`, { method: 'DELETE' }); },
};
