import assert from 'node:assert/strict';
import test from 'node:test';
import { copyCardContent } from '../src/modules/board/lib/clipboardContent.js';

function clipboardEnvironment(context, { native = true, failure, imageFailure = false } = {}) {
  const commands = [];
  const browserWrites = [];
  const globals = {
    isTauri: native,
    window: {
      __TAURI_INTERNALS__: {
        async invoke(command, args) {
          commands.push({ command, args });
          if (command === failure) throw new Error('Clipboard write denied');
          if (command === 'plugin:image|from_bytes') return 42;
        },
      },
    },
    navigator: { clipboard: {
      async writeText(text) { browserWrites.push(text); },
      async write(items) { browserWrites.push(items); },
    } },
    ClipboardItem: class {
      constructor(data) { this.data = data; }
    },
    Image: class {
      naturalWidth = 240;
      naturalHeight = 160;
      set src(value) { queueMicrotask(() => imageFailure ? this.onerror() : this.onload()); }
    },
    document: { createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        getContext: () => ({ drawImage() {} }),
        toBlob(callback, type) {
          assert.equal(type, 'image/png');
          callback(new Blob(['png-image'], { type }));
        },
      };
    } },
  };
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    context.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
  return { commands, browserWrites };
}

test('copy writes the exact card text to the native clipboard without changing the card', async context => {
  const { commands } = clipboardEnvironment(context);
  const task = { id: 'original', title: '卡片内容\nhttps://example.com', images: [], pinned: true };
  const before = structuredClone(task);
  await copyCardContent(task);
  assert.deepEqual(commands, [{
    command: 'plugin:clipboard-manager|write_text', args: { text: task.title, label: undefined },
  }]);
  assert.deepEqual(task, before);
});

test('mixed card content writes escaped HTML with all images and a plain text representation', async context => {
  const { commands } = clipboardEnvironment(context);
  const title = '<script>alert("hi")</script>\nA & B';
  const images = ['data:image/jpeg;base64,first', 'data:image/jpeg;base64,second'];
  await copyCardContent({ title, images });
  assert.equal(commands.length, 1);
  assert.equal(commands[0].command, 'plugin:clipboard-manager|write_html');
  assert.equal(commands[0].args.altText, title);
  assert.ok(commands[0].args.html.includes('&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt;<br>A &amp; B'));
  for (const src of images) assert.ok(commands[0].args.html.includes(`src="${src}"`));
  assert.equal(commands[0].args.html.match(/<img /g).length, 2);
});

test('an image-only card writes a native image and releases its resource', async context => {
  const { commands } = clipboardEnvironment(context);
  await copyCardContent({ images: ['data:image/jpeg;base64,image'] });
  assert.deepEqual(commands.map(({ command }) => command), [
    'plugin:image|from_bytes', 'plugin:clipboard-manager|write_image', 'plugin:resources|close',
  ]);
  assert.deepEqual(commands[1].args, { image: 42 });
  assert.deepEqual(commands[2].args, { rid: 42 });
});

test('native image resources close even if clipboard writing fails', async context => {
  const { commands } = clipboardEnvironment(context, { failure: 'plugin:clipboard-manager|write_image' });
  await assert.rejects(copyCardContent({ images: ['image'] }), /denied/);
  assert.equal(commands.at(-1).command, 'plugin:resources|close');
});

test('invalid image and empty card copies fail without overwriting the clipboard', async context => {
  const { commands } = clipboardEnvironment(context, { imageFailure: true });
  await assert.rejects(copyCardContent({ images: ['broken-image'] }), /无法读取/);
  await assert.rejects(copyCardContent({ title: '  ' }), /没有可复制/);
  assert.deepEqual(commands, []);
});

test('the browser path writes text without invoking native commands', async context => {
  const { commands, browserWrites } = clipboardEnvironment(context, { native: false });
  await copyCardContent({ title: '浏览器复制' });
  assert.deepEqual(browserWrites, ['浏览器复制']);
  assert.deepEqual(commands, []);
});

test('the browser path provides both plain text and HTML for mixed content', async context => {
  const { commands, browserWrites } = clipboardEnvironment(context, { native: false });
  await copyCardContent({ title: '带图卡片', images: ['data:image/png;base64,image'] });
  const item = browserWrites[0][0];
  assert.equal(await item.data['text/plain'].text(), '带图卡片');
  assert.ok((await item.data['text/html'].text()).includes('<img '));
  assert.deepEqual(commands, []);
});

test('the browser image write starts within the user gesture while PNG conversion is pending', async context => {
  const { browserWrites } = clipboardEnvironment(context, { native: false });
  const pending = copyCardContent({ images: ['image'] });
  assert.equal(browserWrites.length, 1);
  const png = await browserWrites[0][0].data['image/png'];
  assert.equal(png.type, 'image/png');
  await pending;
});
