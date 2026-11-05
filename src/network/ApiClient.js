/**
 * HARPIA Universe - ApiClient
 * Cliente REST modular para comunicação com o backend Fastify.
 */
export class ApiClient {
  constructor(baseUrl) {
    // FIX BUG-API1: empty string ('') is falsy but valid for relative URLs — handle explicitly
    // FIX BUG-API2: window.location.origin on port 5173 (Vite dev server) would point to wrong port
    // Default explicitly to port 8000 to match the Fastify server
    if (baseUrl !== undefined) {
      this.baseUrl = baseUrl;
    } else {
      this.baseUrl = 'http://localhost:8000';
    }
  }

  // FIX BUG-API3: wrap all localStorage access in try/catch — can throw in sandboxed iframes
  // or private browsing with storage blocked, or on QuotaExceededError
  get token() {
    try {
      return localStorage.getItem('harpia_token') || null;
    } catch(e) {
      return null;
    }
  }

  setToken(token) {
    try {
      if (token) {
        localStorage.setItem('harpia_token', token);
      } else {
        localStorage.removeItem('harpia_token');
      }
    } catch(e) {}
  }

  get user() {
    try {
      return JSON.parse(localStorage.getItem('harpia_user')) || null;
    } catch {
      return null;
    }
  }

  setUser(user) {
    try {
      if (user) {
        localStorage.setItem('harpia_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('harpia_user');
      }
    } catch(e) {}
  }

  async request(endpoint, options = {}) {
    // FIX BUG-API4: normalise headers keys to avoid Content-Type vs content-type collision
    const headers = {};
    for (const [k, v] of Object.entries(options.headers || {})) {
      headers[k.toLowerCase()] = v;
    }

    // Only set application/json if no content-type already set and body is a plain string
    if (options.body && typeof options.body === 'string' && !headers['content-type']) {
      headers['content-type'] = 'application/json';
    }

    if (this.token) {
      headers['authorization'] = `Bearer ${this.token}`;
    }

    // FIX BUG-API5: normalise URL to prevent double-slash when baseUrl has trailing slash
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = this.baseUrl.replace(/\/+$/, '') + normalizedEndpoint;

    // FIX BUG-API6: add request timeout via AbortController to prevent hanging promises
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000); // 15 second timeout

    let res;
    try {
      res = await fetch(url, { ...options, headers, signal: controller.signal });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw Object.assign(new Error('Request timeout'), { status: 408 });
      }
      throw err;
    }
    clearTimeout(timeoutId);

    // FIX BUG-API7: preserve raw response text when JSON parsing fails (e.g. HTML 502 pages)
    let data;
    try {
      data = await res.json();
    } catch (_) {
      // Non-JSON response — preserve the raw text for debugging
      const text = await res.text().catch(() => '');
      data = { _raw: text };
    }

    if (!res.ok) {
      const message = data.detail || data.message || data._raw || `Erro ${res.status}`;
      const error = new Error(message);
      error.status = res.status;
      error.data = data;

      // FIX BUG-API8: on 401 clear stale credentials so caller/state can react
      if (res.status === 401) {
        this.setToken(null);
        this.setUser(null);
      }

      throw error;
    }

    return data;
  }

  // Auth
  login(username, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  }

  register(username, email, password) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    });
  }

  getMe() {
    return this.request('/auth/me');
  }

  // Economia / Daily Reward
  getDailyReward() {
    return this.request('/pilot/daily-reward');
  }

  claimDailyReward() {
    return this.request('/pilot/daily-reward', {
      method: 'POST'
    });
  }

  // Frotas & Hangar
  fetchHangarData() {
    return this.request('/pilot/hangar');
  }

  syncStorage(payload) {
    // FIX BUG-API9: guard against undefined payload to avoid sending bodyless POST
    if (!payload) return Promise.resolve();
    return this.request('/pilot/storage/sync', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  launchFleet(payload) {
    return this.request('/fleets/launch', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  recallFleet(payload) {
    return this.request('/fleets/recall', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // Mercado & Carga
  fetchMarketOrders() {
    return this.request('/market/orders');
  }

  createMarketOrder(payload) {
    return this.request('/market/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  cancelMarketOrder(orderId) {
    // FIX BUG-API10: guard against undefined orderId and encode it to prevent URL injection
    if (orderId === undefined || orderId === null) {
      console.warn('[ApiClient] cancelMarketOrder: orderId is undefined');
      return Promise.reject(new Error('orderId is required'));
    }
    return this.request(`/market/orders/${encodeURIComponent(orderId)}`, {
      method: 'DELETE'
    });
  }

  buyMarketOrder(orderId) {
    // FIX BUG-API11: guard against undefined orderId — JSON.stringify({orderId:undefined}) === '{}'
    if (orderId === undefined || orderId === null) {
      console.warn('[ApiClient] buyMarketOrder: orderId is undefined');
      return Promise.reject(new Error('orderId is required'));
    }
    return this.request('/market/buy', {
      method: 'POST',
      body: JSON.stringify({ orderId })
    });
  }

  sellMarketOre({ itemId = 'ferrox', amount = 1, pricePerUnit = 120 } = {}) {
    // FIX BUG-API12: validate numeric inputs before sending to prevent bad market orders
    const safeAmount = Math.floor(Number(amount));
    const safePrice  = Math.floor(Number(pricePerUnit));
    if (!safeAmount || safeAmount <= 0 || !safePrice || safePrice <= 0) {
      return Promise.reject(new Error('Invalid amount or price for market sell'));
    }
    return this.request('/market/sell', {
      method: 'POST',
      body: JSON.stringify({ itemId, amount: safeAmount, pricePerUnit: safePrice })
    });
  }
}

export const api = new ApiClient();
