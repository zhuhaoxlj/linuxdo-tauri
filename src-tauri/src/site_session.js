// Runs only in the forum WebView. WebKit owns the session cookies, including HttpOnly cookies.
(() => {
  if (window.location.origin !== 'https://linux.do') return;
  const invoke = (...args) => window.__TAURI_INTERNALS__.invoke(...args);
  const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  const REQUEST_TIMEOUT_MS = 15000;

  class ChallengeRequired extends Error {}

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(path, {
        credentials: 'include',
        cache: 'no-store',
        ...options,
        signal: options.signal || controller.signal,
        headers: { ...headers, ...options.headers },
      });
      if (response.headers.get('cf-mitigated') === 'challenge') throw new ChallengeRequired();
      return response;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('网站请求超时，请检查网络后重试');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function readJson(response, description) {
    if (response.status === 204) return null;
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error(`${description}失败（HTTP ${response.status}），请重试`);
    }
    const data = await response.json();
    if (!response.ok || data?.success === false) {
      const message = Array.isArray(data?.errors) ? data.errors.join('\n') : data?.error || data?.message;
      throw new Error(message || `${description}失败（HTTP ${response.status}），请重试`);
    }
    return data;
  }

  async function apiRequest(task) {
    const options = { method: task.method };
    if (task.method !== 'GET') {
      const csrf = await readJson(await request('/session/csrf.json'), '获取操作验证信息');
      if (!csrf?.csrf) throw new Error('登录会话已过期，请重新登录');
      options.headers = { 'X-CSRF-Token': csrf.csrf, 'Content-Type': 'application/json' };
      if (task.body != null) options.body = JSON.stringify(task.body);
    }
    const data = await readJson(await request(task.path, options), '论坛请求');
    if (task.path === '/site.json' && data) {
      try {
        const preloaded = JSON.parse(document.querySelector('#data-preloaded')?.dataset.preloaded || '{}');
        if (preloaded.siteSettings) data.site_settings = typeof preloaded.siteSettings === 'string' ? JSON.parse(preloaded.siteSettings) : preloaded.siteSettings;
      } catch { /* The API response remains usable if the page has no preloaded settings. */ }
    }
    return data;
  }

  async function currentUser() {
    const response = await request('/session/current.json');
    if (response.status === 401 || response.status === 403) return null;
    const data = await readJson(response, '确认登录状态');
    return data.current_user?.username ? data.current_user : null;
  }

  window.__linuxdoSession = async ({ id, task }) => {
    try {
      let data;
      if (task.action === 'login') {
        const csrf = await readJson(await request('/session/csrf.json'), '获取登录验证信息');
        if (!csrf.csrf) throw new Error('网站未返回登录验证信息，请重试');
        const response = await request(`/session/otp/${task.otp}`, {
          method: 'POST',
          // The successful POST sets _t and redirects. Do not follow it to the full forum page.
          redirect: 'manual',
          headers: { 'X-CSRF-Token': csrf.csrf },
        });
        if (!response.ok && response.type !== 'opaqueredirect') {
          throw new Error(`登录令牌兑换失败（HTTP ${response.status}），请重新授权`);
        }
        data = await currentUser();
        if (!data) throw new Error('网站授权已返回，但登录会话未建立，请重新授权');
        // This OTP-only key cannot read forum APIs. Revoke only the key created by this login.
        try {
          await request('/user-api-key/revoke', {
            method: 'POST', headers: { 'User-Api-Key': task.api_key },
          });
        } catch { /* The established cookie session is independent of this disposable key. */ }
      } else if (task.action === 'current_user') {
        data = await currentUser();
      } else if (task.action === 'api') {
        data = await apiRequest(task);
      } else if (task.action === 'upload') {
        const csrf = await readJson(await request('/session/csrf.json'), '获取上传验证信息');
        const form = new FormData();
        const bytes = Uint8Array.from(atob(task.data), character => character.charCodeAt(0));
        form.append('file', new Blob([bytes], { type: task.content_type }), task.file_name);
        form.append('upload_type', 'composer');
        form.append('synchronous', 'true');
        data = await readJson(await request('/uploads.json', {
          method: 'POST', headers: { 'X-CSRF-Token': csrf.csrf }, body: form,
        }), '上传附件');
      } else {
        throw new Error('未知的会话请求');
      }
      await invoke('site_response', { id, reply: { kind: 'success', data } });
    } catch (error) {
      const reply = error instanceof ChallengeRequired
        ? { kind: 'challenge' }
        : { kind: 'error', message: error instanceof TypeError ? '网络连接失败，请检查网络后重试' : error.message };
      await invoke('site_response', { id, reply });
    }
  };

  const ready = () => invoke('site_ready', {
    challenge: Boolean(window._cf_chl_opt)
      || Boolean(document.querySelector('script[src*="/cdn-cgi/challenge-platform/"]')),
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready, { once: true });
  } else {
    ready();
  }
})();
