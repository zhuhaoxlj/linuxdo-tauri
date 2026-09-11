import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const script = readFileSync(new URL('../src-tauri/src/site_session.js', import.meta.url), 'utf8');
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json' },
});

function bridge(fetch, runtime = {}) {
  const messages = [];
  const window = {
    location: { origin: 'https://linux.do' },
    __TAURI_INTERNALS__: { invoke: async (command, args) => messages.push({ command, args }) },
  };
  vm.runInNewContext(script, {
    window, fetch, TypeError,
    document: { readyState: 'complete', querySelector: () => null },
    FormData, Blob, Uint8Array, atob, URL, URLSearchParams, Headers, AbortController, setTimeout, clearTimeout,
    ...runtime,
  });
  return {
    messages,
    async run(task) {
      await window.__linuxdoSession({ id: 'test-request', task });
      return messages.findLast(message => message.command === 'site_response').args.reply;
    },
  };
}

test('browser callback exchanges OTP with CSRF and confirms the cookie session', async () => {
  const paths = [];
  const client = bridge(async (path, options) => {
    paths.push(path);
    assert.equal(options.credentials, 'include');
    if (path !== '/user-api-key/revoke') assert.equal(options.headers['User-Api-Key'], undefined);
    if (path === '/session/csrf.json') return json({ csrf: 'test-csrf' });
    if (path === '/session/otp/abc123') {
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'manual');
      assert.equal(options.headers['X-CSRF-Token'], 'test-csrf');
      return { ok: false, status: 0, type: 'opaqueredirect', headers: new Headers() };
    }
    if (path === '/session/current.json') return json({ current_user: { username: 'test-user' } });
    if (path === '/user-api-key/revoke') {
      assert.equal(options.headers['User-Api-Key'], 'test-key');
      return json({ success: true });
    }
    assert.fail(`Unexpected request: ${path}`);
  });
  const reply = await client.run({ action: 'login', otp: 'abc123', api_key: 'test-key' });
  assert.equal(reply.kind, 'success');
  assert.equal(reply.data.username, 'test-user');
  assert.deepEqual(paths, ['/session/csrf.json', '/session/otp/abc123', '/session/current.json', '/user-api-key/revoke']);
});

test('does not report login success when the callback yields no current user', async () => {
  const client = bridge(async path => {
    if (path === '/session/csrf.json') return json({ csrf: 'test-csrf' });
    if (path === '/session/otp/abc123') return new Response(null, { status: 200 });
    if (path === '/session/current.json') return json({ current_user: null });
    assert.fail(`Unexpected request: ${path}`);
  });
  const reply = await client.run({ action: 'login', otp: 'abc123', api_key: 'test-key' });
  assert.equal(reply.kind, 'error');
  assert.match(reply.message, /登录会话未建立/);
});

test('requests browser verification before consuming the OTP', async () => {
  let count = 0;
  const client = bridge(async path => {
    count++;
    assert.equal(path, '/session/csrf.json');
    return new Response('Verification required', { status: 403, headers: { 'cf-mitigated': 'challenge' } });
  });
  assert.equal((await client.run({ action: 'login', otp: 'abc123' })).kind, 'challenge');
  assert.equal(count, 1);
});

test('expired sessions return logged-out state; network failures are not mistaken for expiry', async () => {
  assert.equal((await bridge(async () => json({}, 401)).run({ action: 'current_user' })).data, null);
  const reply = await bridge(async () => { throw new TypeError('network'); }).run({ action: 'current_user' });
  assert.equal(reply.kind, 'error');
  assert.match(reply.message, /网络/);
});

test('hung forum requests are aborted and reported instead of staying pending', async () => {
  let triggerTimeout;
  const client = bridge((path, options) => {
    assert.equal(path, '/session/current.json');
    return new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
  }, {
    setTimeout: callback => { triggerTimeout = callback; return 1; },
    clearTimeout: () => {},
  });
  const result = client.run({ action: 'current_user' });
  await Promise.resolve();
  triggerTimeout();
  const reply = await result;
  assert.equal(reply.kind, 'error');
  assert.equal(reply.message, '网站请求超时，请检查网络后重试');
});

test('loads topics with browser cookies and surfaces HTTP errors', async () => {
  const client = bridge(async (path, options) => {
    assert.equal(path, '/latest.json');
    assert.equal(options.credentials, 'include');
    assert.equal(options.headers['User-Api-Key'], undefined);
    return json({ topic_list: { topics: [{ id: 1 }] } });
  });
  assert.equal((await client.run({ action: 'api', path: '/latest.json', method: 'GET' })).data.topic_list.topics[0].id, 1);
  const failed = await bridge(async () => json({}, 500)).run({ action: 'api', path: '/latest.json', method: 'GET' });
  assert.equal(failed.kind, 'error');
  assert.match(failed.message, /500/);
});

test('forum writes include CSRF and preserve nested JSON and array parameters', async () => {
  const body = { topic_id: 42, raw: 'A real reply', tags: ['rust', 'tauri'] };
  const client = bridge(async (path, options) => {
    if (path === '/session/csrf.json') return json({ csrf: 'write-csrf' });
    assert.equal(path, '/posts.json');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['X-CSRF-Token'], 'write-csrf');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), body);
    return json({ id: 7, topic_id: 42 });
  });
  const result = await client.run({ action: 'api', path: '/posts.json', method: 'POST', body });
  assert.equal(result.kind, 'success');
  assert.equal(result.data.id, 7);
});

test('uploads use multipart data without forcing a JSON content type', async () => {
  const client = bridge(async (path, options) => {
    if (path === '/session/csrf.json') return json({ csrf: 'upload-csrf' });
    assert.equal(path, '/uploads.json');
    assert.equal(options.headers['X-CSRF-Token'], 'upload-csrf');
    assert.equal(options.headers['Content-Type'], undefined);
    assert.equal(options.body.get('upload_type'), 'composer');
    assert.equal(options.body.get('synchronous'), 'true');
    assert.equal(options.body.get('file').name, 'note.txt');
    assert.equal(await options.body.get('file').text(), 'hello');
    return json({ id: 123, short_url: 'upload://note.txt' });
  });
  const result = await client.run({ action: 'upload', file_name: 'note.txt', content_type: 'text/plain', data: btoa('hello') });
  assert.equal(result.data.id, 123);
});

test('API validation errors and successful empty responses have distinct results', async () => {
  const rejected = await bridge(async path => path === '/session/csrf.json' ? json({ csrf: 'csrf' }) : json({ errors: ['内容太短', '请选择分类'] }, 422))
    .run({ action: 'api', path: '/posts.json', method: 'POST', body: {} });
  assert.equal(rejected.kind, 'error');
  assert.equal(rejected.message, '内容太短\n请选择分类');
  const removed = await bridge(async path => path === '/session/csrf.json' ? json({ csrf: 'csrf' }) : new Response(null, { status: 204 }))
    .run({ action: 'api', path: '/bookmarks/1.json', method: 'DELETE' });
  assert.equal(removed.kind, 'success');
  assert.equal(removed.data, null);
});
