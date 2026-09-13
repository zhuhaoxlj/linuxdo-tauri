import base64
import json
import subprocess


def run(script, wait_for, webdriver, screenshot, directory):
    snapshot = subprocess.check_output(['copyq', 'eval', '''
      var data = {};
      str(clipboard('?')).split(String.fromCharCode(10)).forEach(function(mime) {
        if (mime.indexOf('/') !== -1) data[mime] = clipboard(mime);
      });
      print(toBase64(pack(data)));
    '''], timeout=15)
    try:
        run_checks(script, wait_for, webdriver, screenshot, directory)
    finally:
        subprocess.run(['copyq', 'eval', '''
          var data = unpack(fromBase64(arguments[1]));
          var values = [];
          Object.keys(data).forEach(function(mime) { values.push(mime, data[mime]); });
          if (values.length) copy.apply(this, values);
          else copy('');
          undefined;
        ''', '-'], input=snapshot, check=True, timeout=15)


def run_checks(script, wait_for, webdriver, screenshot, directory):
    def element(selector):
        return webdriver('POST', '/element', {'using': 'css selector', 'value': selector})

    def click(selector):
        target = element(selector)['element-6066-11e4-a52e-4f735466cecf']
        webdriver('POST', f'/element/{target}/click', {})

    def double_click(selector):
        webdriver('POST', '/actions', {'actions': [{
            'type': 'pointer', 'id': 'board-mouse', 'parameters': {'pointerType': 'mouse'},
            'actions': [
                {'type': 'pointerMove', 'origin': element(selector), 'x': 0, 'y': 0},
                {'type': 'pointerDown', 'button': 0}, {'type': 'pointerUp', 'button': 0},
                {'type': 'pause', 'duration': 80},
                {'type': 'pointerDown', 'button': 0}, {'type': 'pointerUp', 'button': 0},
            ],
        }]})

    def press(key):
        webdriver('POST', '/actions', {'actions': [{
            'type': 'key', 'id': 'board-keyboard', 'actions': [
                {'type': 'keyDown', 'value': key}, {'type': 'keyUp', 'value': key},
            ],
        }]})

    def card(task_id):
        return '.kanban-card[data-task-id=' + json.dumps(task_id) + ']'

    def tasks():
        return script("return JSON.parse(localStorage.getItem('board-data-v1')).tasks;")

    def task(task_id):
        return next(item for item in tasks() if item['id'] == task_id)

    def column_ids(column):
        selector = '[data-column-id=' + json.dumps(column) + '] .kanban-card'
        return script('return Array.from(document.querySelectorAll(' + json.dumps(selector)
                      + '), card => card.dataset.taskId);')

    def edit_value(task_id, value):
        selector = card(task_id) + ' textarea'
        script('const editor = document.querySelector(' + json.dumps(selector) + ');'
               'Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(editor, '
               + json.dumps(value) + '); editor.dispatchEvent(new Event("input", {bubbles:true}));')

    def open_menu(task_id):
        click(card(task_id) + ' [aria-label="卡片操作"]')
        wait_for(lambda: script('return Boolean(document.querySelector(".kanban-menu"));'),
                 'Card menu did not open')

    def menu_action(task_id, label):
        open_menu(task_id)
        index = script('return Array.from(document.querySelectorAll(".kanban-menu button"))'
                       '.findIndex(button => button.textContent.trim() === ' + json.dumps(label) + ');')
        assert index >= 0, 'Missing menu action: ' + label
        click(f'.kanban-menu button:nth-child({index + 1})')
        wait_for(lambda: not script('return Boolean(document.querySelector(".kanban-menu"));'),
                 'Card action did not close its menu')

    def copy_content(task_id):
        menu_action(task_id, '复制')
        selector = card(task_id) + ' [role="status"]'
        wait_for(lambda: script('return document.querySelector(' + json.dumps(selector)
                                + ')?.textContent.includes("已复制到剪贴板");'),
                 'Copy did not report successful clipboard writing')

    def clipboard(mime):
        target = 'UTF8_STRING' if mime == 'text/plain' else mime
        return subprocess.check_output(['xclip', '-selection', 'clipboard', '-t', target, '-o'], timeout=5)

    wait_for(lambda: script('return Boolean(document.querySelector(".kanban-add-button"));'),
             'Board did not load')
    assert not tasks(), 'Expected an empty isolated board; stop before changing existing cards'
    script("""
      const canvas = document.createElement('canvas');
      canvas.width = 240; canvas.height = 160;
      const context = canvas.getContext('2d');
      context.fillStyle = '#4974bb'; context.fillRect(0, 0, 240, 160);
      const firstImage = canvas.toDataURL('image/png');
      context.fillStyle = '#258269'; context.fillRect(0, 0, 240, 160);
      const secondImage = canvas.toDataURL('image/png');
      localStorage.setItem('board-data-v1', JSON.stringify({
        activeCategory: 'home', notes: [], tasks: [
          {id:'first', title:'第一张卡片', category:'home', column:'inbox', images:[]},
          {id:'images', title:'带图卡片', category:'home', column:'inbox', images:[firstImage, secondImage]},
          {id:'third', title:'第三张卡片', category:'home', column:'inbox', images:[]},
          {id:'other-column', title:'', category:'home', column:'todo', images:[firstImage]},
          {id:'other-category', title:'其他分类卡片', category:'life', column:'inbox', images:[]},
        ],
      }));
      location.reload();
    """)
    wait_for(lambda: column_ids('inbox') == ['first', 'images', 'third'], 'Fixture cards did not load')

    double_click(card('first') + ' .kanban-card-title')
    wait_for(lambda: script('return document.activeElement?.matches(".kanban-card-editor");'),
             'Double-click did not focus the card editor')
    edit_value('first', '双击编辑已保存')
    press('\ue007')
    wait_for(lambda: task('first')['title'] == '双击编辑已保存', 'Enter did not save the edit')
    double_click(card('first') + ' .kanban-card-title')
    edit_value('first', '取消的修改')
    press('\ue00c')
    assert task('first')['title'] == '双击编辑已保存'
    double_click(card('first') + ' [aria-label="卡片操作"]')
    assert not script('return Boolean(document.querySelector(".kanban-card-editor"));'), \
        'Double-clicking the menu also entered editing'
    if script('return Boolean(document.querySelector(".kanban-menu"));'):
        press('\ue00c')
    click(card('images') + ' .kanban-image-open')
    double_click('.kanban-image-full')
    assert not script('return Boolean(document.querySelector(".kanban-card-editor"));'), \
        'Double-clicking the image preview also entered editing'
    press('\ue00c')
    print('PASS: native double-click editing, save, cancel and interactive target exclusions', flush=True)

    menu_action('images', '置顶')
    wait_for(lambda: column_ids('inbox') == ['images', 'first', 'third'], 'Pinned card did not move to the top')
    assert task('images')['pinned'] is True
    assert column_ids('todo') == ['other-column']
    assert task('other-category')['category'] == 'life'
    script('location.reload();')
    wait_for(lambda: column_ids('inbox') == ['images', 'first', 'third'], 'Pin did not survive reload')
    open_menu('images')
    labels = script('return Array.from(document.querySelectorAll(".kanban-menu button"), button => button.textContent.trim());')
    assert labels == ['编辑', '取消置顶', '复制', '删除']
    (directory / 'board-pinned-menu.png').write_bytes(base64.b64decode(screenshot()))
    press('\ue00c')
    menu_action('images', '取消置顶')
    wait_for(lambda: column_ids('inbox') == ['first', 'images', 'third'], 'Unpin did not restore ordinary card order')
    menu_action('images', '置顶')
    print('PASS: pin/unpin, column isolation, menu entries and persisted ordering', flush=True)

    original = tasks()
    copy_content('first')
    assert clipboard('text/plain').decode() == task('first')['title']
    assert tasks() == original, 'Text copy changed or duplicated a card'
    copy_content('images')
    assert clipboard('text/plain').decode() == task('images')['title']
    html = clipboard('text/html').decode()
    assert task('images')['title'] in html
    assert all(src in html for src in task('images')['images']), 'Rich copy lost a card image'
    assert tasks() == original, 'Rich copy changed or duplicated a card'
    (directory / 'board-copied.png').write_bytes(base64.b64decode(screenshot()))
    copy_content('other-column')
    png = clipboard('image/png')
    assert png.startswith(b'\x89PNG\r\n\x1a\n')
    assert int.from_bytes(png[16:20], 'big') == 240 and int.from_bytes(png[20:24], 'big') == 160
    assert tasks() == original, 'Image copy changed or duplicated a card'
    print('PASS: real system clipboard text, rich content and image writes without new cards', flush=True)

    script("""
      window.__boardFetch = window.fetch;
      window.fetch = (input, options) => {
        const url = new URL(input, location.href);
        if (url.protocol === 'ipc:' && decodeURIComponent(url.pathname).endsWith('|write_text')) {
          return Promise.resolve(new Response(JSON.stringify('Clipboard regression failure'), {
            status:400, headers:{'Tauri-Response':'error','Content-Type':'application/json'},
          }));
        }
        return window.__boardFetch(input, options);
      };
    """)
    menu_action('first', '复制')
    wait_for(lambda: script('return document.querySelector("[data-task-id=first] [role=alert]")?.textContent.includes("复制失败");'),
             'Failed clipboard write did not show an error')
    assert tasks() == original and clipboard('image/png') == png
    script('window.fetch = window.__boardFetch;')
    print('PASS: copy failures show an error and preserve existing clipboard contents and cards', flush=True)

    double_click(card('first') + ' .kanban-card-title')
    edit_value('first', '复制时保存当前编辑')
    copy_content('first')
    assert clipboard('text/plain').decode() == '复制时保存当前编辑'
    assert task('first')['title'] == '复制时保存当前编辑' and len(tasks()) == 5
    print('PASS: copying during editing writes the latest text without duplicating a card', flush=True)

    script("""
      const source = document.querySelector('[data-task-id="images"]');
      source.dispatchEvent(new DragEvent('dragstart', {bubbles:true, dataTransfer:new DataTransfer()}));
    """)
    script("""
      const column = document.querySelector('[data-column-id="todo"]');
      column.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, dataTransfer:new DataTransfer()}));
    """)
    wait_for(lambda: column_ids('todo') == ['images', 'other-column'], 'Moving a pinned card did not preserve pinning')
    assert task('images')['column'] == 'todo' and task('images')['pinned'] is True
    webdriver('POST', '/window/rect', {'width': 900, 'height': 420})
    open_menu('images')
    assert script("""
      const rect = document.querySelector('.kanban-menu').getBoundingClientRect();
      return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    """), 'Expanded menu overflows the small window'
    (directory / 'board-small-menu.png').write_bytes(base64.b64decode(screenshot()))
    press('\ue00c')
    print('PASS: pinned card movement and expanded menu placement in a small window', flush=True)
