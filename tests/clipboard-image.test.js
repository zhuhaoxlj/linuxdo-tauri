import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_CARD_IMAGES, imageFilesFromClipboard, imagesFromClipboardEvent } from '../src/modules/board/lib/clipboardImage.js';

function clipboardEvent(data = {}) {
  return {
    clipboardData: { files: [], items: [], types: [], ...data },
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
}

function installGlobals(context, values) {
  for (const [name, value] of Object.entries(values)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    context.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
}

function imageEnvironment(context, { native = true, failure, encodeFailure = false } = {}) {
  const commands = [];
  const canvases = [];
  const pixels = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]);
  installGlobals(context, {
    isTauri: native,
    window: {
      __TAURI_INTERNALS__: {
        async invoke(command, args) {
          commands.push({ command, args });
          if (command === failure) throw new Error('Clipboard test failure');
          if (command === 'plugin:clipboard-manager|read_image') return 42;
          assert.equal(args.rid, 42);
          if (command === 'plugin:image|size') return { width: 2, height: 1 };
          if (command === 'plugin:image|rgba') return pixels;
          if (command === 'plugin:resources|close') return;
          throw new Error(`Unexpected command: ${command}`);
        },
      },
    },
    ImageData: class {
      constructor(data, width, height) {
        Object.assign(this, { data, width, height });
      }
    },
    Image: class {
      width = 1920;
      height = 1080;
      set src(value) { queueMicrotask(() => this.onload()); }
    },
    document: {
      createElement(tag) {
        assert.equal(tag, 'canvas');
        const canvas = {
          context: {
            fillRect() {},
            drawImage(source) { this.source = source; },
            putImageData(data) { this.pixels = data; },
          },
          getContext() { return this.context; },
          toDataURL(type, quality) {
            if (encodeFailure) throw new Error('Image encoding failed');
            assert.equal(type, 'image/jpeg');
            assert.equal(quality, 0.8);
            return 'data:image/jpeg;base64,test-image';
          },
        };
        canvases.push(canvas);
        return canvas;
      },
    },
  });
  context.mock.method(URL, 'createObjectURL', () => 'blob:test-image');
  const revoke = context.mock.method(URL, 'revokeObjectURL', () => {});
  return { commands, canvases, pixels, revoke };
}

test('clipboard image extraction accepts files and items without duplicating an image', () => {
  const image = new Blob(['image'], { type: 'image/png' });
  const text = new Blob(['text'], { type: 'text/plain' });
  const item = { kind: 'file', type: image.type, getAsFile: () => image };
  assert.deepEqual(imageFilesFromClipboard(clipboardEvent({ files: [text, image], items: [item] })), [image]);
  assert.deepEqual(imageFilesFromClipboard(clipboardEvent({ items: [item] })), [image]);
  assert.deepEqual(imageFilesFromClipboard(clipboardEvent({ items: [{ ...item, getAsFile: () => null }] })), []);
});

test('an empty WebKit paste payload reads the native image and closes its resource', async context => {
  const { commands, canvases, pixels } = imageEnvironment(context);
  const event = clipboardEvent();
  const pending = imagesFromClipboardEvent(event);
  assert.equal(event.defaultPrevented, true, 'Cancel paste before awaiting native IPC');
  assert.deepEqual(await pending, ['data:image/jpeg;base64,test-image']);
  assert.deepEqual(commands.map(({ command }) => command), [
    'plugin:clipboard-manager|read_image', 'plugin:image|size', 'plugin:image|rgba', 'plugin:resources|close',
  ]);
  assert.deepEqual(canvases[0].context.pixels.data, new Uint8ClampedArray(pixels));
  assert.equal(canvases[1].width, 2);
  assert.equal(canvases[1].height, 1);
});

test('browser image paste is canceled synchronously and keeps using file compression', async context => {
  const { commands, canvases, revoke } = imageEnvironment(context);
  const event = clipboardEvent({ files: [new Blob(['image'], { type: 'image/png' })], types: ['Files'] });
  const pending = imagesFromClipboardEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(await pending, ['data:image/jpeg;base64,test-image']);
  assert.deepEqual(commands, []);
  assert.equal(canvases[0].width, 960);
  assert.equal(canvases[0].height, 540);
  assert.equal(revoke.mock.callCount(), 1);
});

test('ordinary text paste is untouched even when the card is full', async context => {
  const { commands } = imageEnvironment(context);
  const event = clipboardEvent({ types: ['text/plain', 'text/html'] });
  assert.deepEqual(await imagesFromClipboardEvent(event, 0), []);
  assert.equal(event.defaultPrevented, false);
  assert.deepEqual(commands, []);
});

test('an empty browser paste never attempts a native clipboard call', async context => {
  const { commands } = imageEnvironment(context, { native: false });
  const event = clipboardEvent();
  assert.deepEqual(await imagesFromClipboardEvent(event), []);
  assert.equal(event.defaultPrevented, false);
  assert.deepEqual(commands, []);
});

test('a full card reports its image limit without reading another native image', async context => {
  const { commands } = imageEnvironment(context);
  const event = clipboardEvent();
  await assert.rejects(imagesFromClipboardEvent(event, 0), new RegExp(`${MAX_CARD_IMAGES} 张图片`));
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(commands, []);
});

test('file paste only processes the available image slots', async context => {
  const { canvases } = imageEnvironment(context);
  const image = new Blob(['image'], { type: 'image/png' });
  assert.equal((await imagesFromClipboardEvent(clipboardEvent({ files: [image, image] }), 1)).length, 1);
  assert.equal(canvases.length, 1);
});

test('native read failures are actionable instead of silently returning an empty list', async context => {
  imageEnvironment(context, { failure: 'plugin:clipboard-manager|read_image' });
  await assert.rejects(imagesFromClipboardEvent(clipboardEvent()), /图片读取失败/);
});

test('native image resources close when reading pixels fails', async context => {
  const { commands } = imageEnvironment(context, { failure: 'plugin:image|rgba' });
  await assert.rejects(imagesFromClipboardEvent(clipboardEvent()), /图片读取失败/);
  assert.equal(commands.at(-1).command, 'plugin:resources|close');
});

test('native image resources close when canvas encoding fails', async context => {
  const { commands } = imageEnvironment(context, { encodeFailure: true });
  await assert.rejects(imagesFromClipboardEvent(clipboardEvent()), /图片读取失败/);
  assert.equal(commands.at(-1).command, 'plugin:resources|close');
});
