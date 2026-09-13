import base64
import json


def run(script, wait_for, paste, screenshot, directory):
    def click(selector):
        script('document.querySelector(' + json.dumps(selector) + ').click();')

    def image_count(selector):
        return script('return document.querySelectorAll(' + json.dumps(selector) + ').length;')

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
