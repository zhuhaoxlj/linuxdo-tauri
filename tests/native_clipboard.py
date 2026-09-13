import base64
import json


def run(script, wait_for, webdriver, screenshot, directory):
    def click(selector):
        element = webdriver('POST', '/element', {'using': 'css selector', 'value': selector})
        element_id = element['element-6066-11e4-a52e-4f735466cecf']
        webdriver('POST', f'/element/{element_id}/click', {})

    def press_keys(*values):
        webdriver('POST', '/actions', {'actions': [{
            'type': 'key', 'id': 'clipboard-keyboard', 'actions': [
                *({'type': 'keyDown', 'value': value} for value in values),
                *({'type': 'keyUp', 'value': value} for value in reversed(values)),
            ],
        }]})

    def paste():
        press_keys('\ue009', 'v')

    def image_count(selector):
        return script('return document.querySelectorAll(' + json.dumps(selector) + ').length;')

    def check_preview(selector, name):
        before = script("return localStorage.getItem('board-data-v1');")
        click(selector)
        wait_for(lambda: script("return document.querySelector('.kanban-image-preview')?.matches(':modal');"),
                 'Thumbnail click did not open a modal preview')
        wait_for(lambda: script("return document.querySelector('.kanban-image-full')?.naturalWidth > 0;"),
                 'Full image did not decode')
        assert script('return document.querySelector(".kanban-image-full").src === document.querySelector('
                      + json.dumps(selector) + ').querySelector("img").src;')
        assert script("""
          const image = document.querySelector('.kanban-image-full');
          const rect = image.getBoundingClientRect();
          return rect.width > 72 && rect.height > 72
            && rect.left >= 0 && rect.top >= 0
            && rect.right <= innerWidth && rect.bottom <= innerHeight
            && Math.abs(rect.width / rect.height - image.naturalWidth / image.naturalHeight) < 0.02;
        """), 'Preview is cropped, distorted, clipped or still thumbnail-sized'
        click('.kanban-image-full')
        assert script("return document.querySelector('.kanban-image-preview').open;"), 'Clicking the image closed it'
        press_keys('\ue004')
        assert script("return document.activeElement?.closest('.kanban-image-preview') !== null;"), \
            'Tab escaped the modal'
        (directory / (name + '-preview.png')).write_bytes(base64.b64decode(screenshot()))
        press_keys('\ue00c')
        wait_for(lambda: not script("return Boolean(document.querySelector('.kanban-image-preview'));"),
                 'Escape did not close the preview')
        assert script('return document.activeElement === document.querySelector(' + json.dumps(selector) + ');'), \
            'Closing the preview did not restore thumbnail focus'
        press_keys('\ue007')
        wait_for(lambda: script("return Boolean(document.querySelector('.kanban-image-preview[open]'));"),
                 'Enter did not open the focused thumbnail')
        click('.kanban-image-preview-close')
        wait_for(lambda: not script("return Boolean(document.querySelector('.kanban-image-preview'));"),
                 'Close button did not dismiss the preview')
        click(selector)
        webdriver('POST', '/actions', {'actions': [{
            'type': 'pointer', 'id': 'preview-mouse', 'parameters': {'pointerType': 'mouse'},
            'actions': [
                {'type': 'pointerMove', 'origin': 'viewport', 'x': 8, 'y': 8},
                {'type': 'pointerDown', 'button': 0},
                {'type': 'pointerUp', 'button': 0},
            ],
        }]})
        wait_for(lambda: not script("return Boolean(document.querySelector('.kanban-image-preview'));"),
                 'Clicking the backdrop did not close the preview')
        assert script("return localStorage.getItem('board-data-v1');") == before, 'Preview changed saved cards'

    def observe_clipboard():
        script("""
          window.__clipboardCommands = [];
          window.__clipboardFailRead = false;
          const fetch = window.fetch;
          window.fetch = (input, options) => {
            const url = new URL(input, location.href);
            const command = url.protocol === 'ipc:' ? decodeURIComponent(url.pathname.slice(1)) : null;
            if (command) window.__clipboardCommands.push(command);
            if (window.__clipboardFailRead && command === 'plugin:clipboard-manager|read_image') {
              return Promise.resolve(new Response(JSON.stringify('Native clipboard regression failure'), {
                status: 400,
                headers: { 'Tauri-Response': 'error', 'Content-Type': 'application/json' },
              }));
            }
            return fetch(input, options);
          };
          document.addEventListener('paste', event => {
            window.__clipboardPaste = {
              trusted: event.isTrusted,
              types: Array.from(event.clipboardData.types),
              files: event.clipboardData.files.length,
            };
          }, true);
        """)

    wait_for(lambda: script("return Boolean(document.querySelector('.kanban-add-button'));"),
             'Board did not load')
    assert script("return (JSON.parse(localStorage.getItem('board-data-v1'))?.tasks || []).length === 0;"), \
        'Expected an empty isolated board; stop before changing any existing card'
    observe_clipboard()
    click('.kanban-add-button')
    wait_for(lambda: script("return document.activeElement?.matches('.kanban-add-form textarea');"),
             'New card editor did not focus')
    paste()
    wait_for(lambda: image_count('.kanban-add-form img') == 1,
             'Image paste produced no preview; the system clipboard must contain an image')
    print('Native paste:', script('return window.__clipboardPaste;'), flush=True)
    assert script("return window.__clipboardPaste.trusted;"), 'Paste was not a native keyboard event'
    assert script("return window.__clipboardCommands.includes('plugin:clipboard-manager|read_image');")
    assert script("return window.__clipboardCommands.includes('plugin:resources|close');")
    wait_for(lambda: script("return document.querySelector('.kanban-add-form img').naturalWidth > 0;"),
             'Pasted image did not decode')
    assert script("return document.querySelector('.kanban-add-form img').naturalWidth <= 960;")
    (directory / 'clipboard-preview.png').write_bytes(base64.b64decode(screenshot()))
    print('PASS: native Ctrl+V, clipboard read permission, image preview and resource cleanup',
          script('return window.__clipboardPaste;'))
    check_preview('.kanban-add-form .kanban-image-open', 'draft-image')
    assert image_count('.kanban-card') == 0, 'Preview submitted the draft form'
    print('PASS: draft image enlargement, keyboard focus and three close methods')

    script("""
      const editor = document.querySelector('.kanban-add-form textarea');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, '原生图片粘贴回归测试');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    """)
    click('.kanban-add-confirm')
    wait_for(lambda: image_count('.kanban-card img') == 1, 'New card did not save its image')
    wait_for(lambda: script("return JSON.parse(localStorage.getItem('board-data-v1')).tasks[0]?.images.length === 1;"),
             'New card image was not persisted')
    script('location.reload();')
    wait_for(lambda: image_count('.kanban-card img') == 1, 'Saved image did not survive reload')
    check_preview('.kanban-card .kanban-image-open', 'saved-image')
    webdriver('POST', '/window/rect', {'width': 520, 'height': 560})
    check_preview('.kanban-card .kanban-image-open', 'small-window-image')
    webdriver('POST', '/window/rect', {'width': 1200, 'height': 800})
    print('PASS: saved image enlargement and small-window layout')
    observe_clipboard()
    click('.kanban-card [aria-label="卡片操作"]')
    wait_for(lambda: script("return Boolean(document.querySelector('.kanban-menu'));"), 'Card menu did not open')
    click('.kanban-menu button')
    wait_for(lambda: script("return document.activeElement?.matches('.kanban-card-editor');"),
             'Existing card editor did not focus')
    for expected in range(2, 5):
        paste()
        wait_for(lambda: image_count('.kanban-card img') == expected,
                 'Existing card did not append the pasted image')
    paste()
    wait_for(lambda: script("return document.querySelector('.kanban-card [role=alert]')?.textContent.includes('4 张图片');"),
             'Image limit did not show a message')
    assert image_count('.kanban-card img') == 4
    assert script("return window.__clipboardCommands.filter(command => command === 'plugin:clipboard-manager|read_image').length === 3;")
    (directory / 'clipboard-card.png').write_bytes(base64.b64decode(screenshot()))
    print('PASS: persisted card images, editing paste and the four-image limit')

    click('.kanban-card .kanban-image-remove')
    wait_for(lambda: image_count('.kanban-card img') == 3, 'Image removal did not update the card')
    script("window.__clipboardFailRead = true; document.querySelector('.kanban-card-editor').focus();")
    paste()
    wait_for(lambda: script("return document.querySelector('.kanban-card [role=alert]')?.textContent.includes('图片读取失败');"),
             'Native clipboard error was silently discarded')
    assert image_count('.kanban-card img') == 3, 'Failed paste changed existing images'
    print('PASS: failed clipboard reads show an error and keep existing images')
    check_preview('.kanban-card .kanban-image-thumb:nth-child(2) .kanban-image-open', 'editing-image')
    assert script("return Boolean(document.querySelector('.kanban-card-editor'));"), 'Preview ended card editing'
    print('PASS: enlargement during editing preserves the editor and images')
