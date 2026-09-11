"""UI regression helpers. All publishing and chat actions go to native-site-fixture.js."""
import base64
import json


def run(script, async_script, wait_for, screenshot, directory):
    def exists(selector):
        return script('return Boolean(document.querySelector(' + json.dumps(selector) + '));')

    def wait_selector(selector):
        wait_for(lambda: exists(selector), 'Missing element: ' + selector)

    def click(selector):
        wait_selector(selector)
        script('document.querySelector(' + json.dumps(selector) + ').click();')

    def click_text(text, within='document'):
        source = ('const node = Array.from(' + within + ".querySelectorAll('button')).find(button => button.textContent.trim() === "
                  + json.dumps(text) + ' && !button.disabled); if (!node) throw new Error("Missing enabled button"); node.click();')
        script(source)

    def fill(selector, value):
        wait_selector(selector)
        script('const node=document.querySelector(' + json.dumps(selector) + '); '
               'const proto=node.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : node.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;'
               'Object.getOwnPropertyDescriptor(proto,"value").set.call(node,' + json.dumps(value) + ');'
               'node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", {bubbles:true}));')

    def text_present(value):
        wait_for(lambda: script('return document.body.innerText.includes(' + json.dumps(value) + ');'), 'Missing text: ' + value)

    def route(path):
        script('location.hash=' + json.dumps('#' + path) + ';')

    def snap(name):
        (directory / (name + '.png')).write_bytes(base64.b64decode(screenshot()))

    order = async_script("""
      const done=arguments[arguments.length-1], order=[];
      Promise.all(['/native-slow','/native-fast'].map(path =>
        window.__TAURI_INTERNALS__.invoke('discourse_request', {path,method:'GET',body:null}).then(() => order.push(path))
      )).then(()=>done(order), e=>done({error:String(e)}));
    """)
    assert order == ['/native-fast', '/native-slow'], 'Independent forum requests are still serialized or mixed up'
    snap('feed')
    route('/topic/1')
    wait_selector('#post-1')
    wait_selector('#post-2')
    assert script("return document.querySelectorAll('.forum-post').length;") == 2
    assert script("return !window.__unsafeRendered && !document.querySelector('.cooked script,.cooked [onerror],.cooked a[href^=\"javascript:\"]');")
    click('#post-1 [aria-label="点赞"]')
    wait_for(lambda: exists('#post-1 [aria-label="取消点赞"]'), 'Like did not update')
    click('#post-1 [aria-label="添加书签"]')
    fill('[aria-label="书签备注"]', '回头继续阅读')
    click_text('保存书签')
    wait_for(lambda: not exists('dialog[open]'), 'Bookmark dialog did not close')
    wait_selector('#post-1 [aria-label="编辑书签"]')
    click_text('加载更多楼层')
    wait_selector('#post-3')
    snap('topic')

    click_text('回复', "document.querySelector('#post-2')")
    wait_selector('dialog .markdown-editor')
    fill('dialog .markdown-editor', '**原生 Markdown 预览**\n\nNative reply content with sufficient detail.')
    click_text('预览', "document.querySelector('dialog')")
    wait_for(lambda: script("return document.querySelector('.editor-preview strong')?.textContent === '原生 Markdown 预览';"), 'Markdown preview did not cook bold text')
    snap('reply-preview')
    click_text('编辑', "document.querySelector('dialog')")
    script("""
      const input=document.querySelector('dialog input[type=file]'), transfer=new DataTransfer();
      transfer.items.add(new File(['attachment content'], 'native-attachment.txt', {type:'text/plain'}));
      input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
    """)
    wait_for(lambda: script("return document.querySelector('dialog textarea')?.value.includes('upload://fixture.txt');"), 'Attachment was not inserted into the draft')
    click_text('发布回复')
    wait_for(lambda: not exists('dialog[open]'), 'Reply did not finish')
    wait_selector('#post-4')
    text_present('Native reply content with sufficient detail.')
    click('#post-4 [aria-label="编辑帖子"]')
    fill('dialog .markdown-editor', 'Edited native reply with sufficient detail.')
    click_text('保存修改')
    wait_for(lambda: not exists('dialog[open]'), 'Edit did not finish')
    text_present('Edited native reply with sufficient detail.')
    print('PASS: concurrent requests, post paging, sanitized HTML, likes, bookmarks, Markdown preview, upload, reply and edit')

    route('/compose')
    wait_selector('.compose-page .markdown-editor')
    fill('[aria-label="标题"]', 'Native migration draft title')
    fill('[aria-label="分类"]', '6')
    fill('[aria-label="正文"]', 'A persisted draft created only in the isolated native fixture.')
    route('/drafts')
    text_present('Native migration draft title')
    click('.draft-card a')
    wait_selector('.compose-page .markdown-editor')
    assert script("return document.querySelector('[aria-label=\"正文\"]').value;") == 'A persisted draft created only in the isolated native fixture.'
    snap('composer')
    click_text('发布话题', "document.querySelector('.composer')")
    text_present('Native migration draft title')
    wait_selector('.forum-post')
    route('/compose')
    wait_selector('.markdown-editor')
    fill('[aria-label="标题"]', 'Native queue regression')
    fill('[aria-label="分类"]', '6')
    fill('[aria-label="正文"]', '[queue-fixture] Submitted for moderation, never assumed published.')
    click_text('发布话题', "document.querySelector('.composer')")
    text_present('待审核内容')
    text_present('Native queue regression')
    print('PASS: draft persistence, new topic and moderation queue')

    route('/search?q=tauri')
    text_present('Tauri 2 搜索结果')
    route('/bookmarks')
    text_present('回头继续阅读')
    click('[aria-label="编辑书签"]')
    click_text('移除书签')
    text_present('还没有收藏的内容')
    route('/notifications')
    wait_selector('.notification-row.unread')
    click_text('全部已读')
    wait_for(lambda: not exists('.notification-row.unread'), 'Notifications remained unread')
    route('/user/helper')
    text_present('@helper')
    text_present('热门话题')
    route('/following')
    wait_selector('.people-grid .user-row')
    route('/badges')
    text_present('初次分享')
    route('/messages')
    wait_selector('.topic-row')
    print('PASS: search, bookmark removal, notifications, profile, follows, badges and private-message list')

    route('/chat/7')
    text_present('欢迎来到测试频道，这里的消息都是隔离测试数据。')
    fill('[aria-label="聊天消息"]', 'Native isolated chat message')
    click_text('发送', "document.querySelector('.chat-composer')")
    text_present('Native isolated chat message')
    snap('chat')
    route('/settings')
    click_text('深色')
    wait_for(lambda: script("return document.documentElement.dataset.theme === 'dark';"), 'Dark theme not applied')
    snap('settings-dark')
    click_text('浅色')
    assert script("return document.documentElement.scrollWidth <= innerWidth;"), 'Desktop UI has horizontal overflow'
    print('PASS: chat send, theme settings and desktop layout')
