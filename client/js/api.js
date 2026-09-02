const api = {
  base: '',
  token() { return localStorage.getItem('botdz_token'); },
  setToken(t) { if (t) localStorage.setItem('botdz_token', t); else localStorage.removeItem('botdz_token'); },

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.token();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(this.base + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  },
  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  put(path, body) { return this.request('PUT', path, body); },
  del(path) { return this.request('DELETE', path); }
};
