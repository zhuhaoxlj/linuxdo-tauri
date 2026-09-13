import assert from 'node:assert/strict';
import test from 'node:test';
import { linkSegments, openExternalLink, openLinkFromEvent, trimUrlEnd } from '../src/modules/board/lib/links.js';

function linkEnvironment(context, { native = true } = {}) {
  const commands = [];
  const opened = [];
  const globals = {
    isTauri: native,
    window: {
      __TAURI_INTERNALS__: {
        async invoke(command, args) {
          commands.push({ command, args });
        },
      },
      open(...args) {
        opened.push(args);
        return {};
      },
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    context.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
  return { commands, opened };
}

test('plain card text stays a single text segment', () => {
  assert.deepEqual(linkSegments('整理本周的学习笔记'), [{ type: 'text', value: '整理本周的学习笔记' }]);
  assert.deepEqual(linkSegments(''), []);
  assert.deepEqual(linkSegments(undefined), []);
});

test('urls are split out of the surrounding card text', () => {
  assert.deepEqual(linkSegments('参考 https://github.com/victorqin/motion_inbetweening 的实现'), [
    { type: 'text', value: '参考 ' },
    { type: 'link', value: 'https://github.com/victorqin/motion_inbetweening' },
    { type: 'text', value: ' 的实现' },
  ]);
});

test('multiple lines and multiple links keep their original text', () => {
  assert.deepEqual(linkSegments('第一行 https://example.com/a\n第二行 http://example.com/b'), [
    { type: 'text', value: '第一行 ' },
    { type: 'link', value: 'https://example.com/a' },
    { type: 'text', value: '\n第二行 ' },
    { type: 'link', value: 'http://example.com/b' },
  ]);
});

test('uppercase schemes are recognised', () => {
  assert.deepEqual(linkSegments('HTTPS://EXAMPLE.COM/Path'), [
    { type: 'link', value: 'HTTPS://EXAMPLE.COM/Path' },
  ]);
});

test('trailing punctuation outside the url is left as text', () => {
  assert.deepEqual(linkSegments('看 https://example.com/a。'), [
    { type: 'text', value: '看 ' },
    { type: 'link', value: 'https://example.com/a' },
    { type: 'text', value: '。' },
  ]);
  assert.deepEqual(linkSegments('见 (https://example.com/a)'), [
    { type: 'text', value: '见 (' },
    { type: 'link', value: 'https://example.com/a' },
    { type: 'text', value: ')' },
  ]);
});

test('balanced parentheses inside a url are preserved', () => {
  assert.equal(trimUrlEnd('https://en.wikipedia.org/wiki/Foo_(bar)'), 'https://en.wikipedia.org/wiki/Foo_(bar)');
  assert.equal(trimUrlEnd('https://example.com/a))'), 'https://example.com/a');
});

test('a scheme without a host is not treated as a link', () => {
  assert.deepEqual(linkSegments('https://'), [{ type: 'text', value: 'https://' }]);
});

test('a plain click stays in the app while Ctrl or Cmd click opens the browser', async context => {
  const { commands, opened } = linkEnvironment(context);
  const url = 'https://example.com/plain';
  assert.equal(await openLinkFromEvent({ ctrlKey: false, metaKey: false }, url), false);
  assert.deepEqual(commands, []);
  assert.equal(await openLinkFromEvent({ ctrlKey: true }, url), true);
  assert.equal(await openLinkFromEvent({ metaKey: true }, url), true);
  assert.deepEqual(commands.map(({ command }) => command), ['plugin:opener|open_url', 'plugin:opener|open_url']);
  assert.deepEqual(opened, []);
});

test('native builds hand the url to the system browser', async context => {
  const { commands, opened } = linkEnvironment(context);
  await openExternalLink('https://github.com/victorqin/motion_inbetweening');
  assert.deepEqual(commands, [{
    command: 'plugin:opener|open_url',
    args: { url: 'https://github.com/victorqin/motion_inbetweening', with: undefined },
  }]);
  assert.deepEqual(opened, []);
});

test('the browser path uses window.open instead of native commands', async context => {
  const { commands, opened } = linkEnvironment(context, { native: false });
  await openExternalLink('https://example.com/board');
  assert.deepEqual(opened, [['https://example.com/board', '_blank', 'noopener,noreferrer']]);
  assert.deepEqual(commands, []);
});

test('non http schemes are rejected before reaching the browser', async context => {
  const { commands, opened } = linkEnvironment(context);
  await assert.rejects(openExternalLink('javascript:alert(1)'), /仅支持打开/);
  await assert.rejects(openExternalLink('file:///etc/passwd'), /仅支持打开/);
  assert.deepEqual(commands, []);
  assert.deepEqual(opened, []);
});
