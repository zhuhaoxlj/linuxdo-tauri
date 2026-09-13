"""Linux native regression. Use tests/dbus-session.conf; requires WebKitWebDriver."""
import argparse
import base64
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from urllib.parse import parse_qs, urlencode, urlparse


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--binary', type=Path, default=Path('src-tauri/target/debug/linuxdo-tauri'))
    parser.add_argument('--full', action='store_true', help='Also run the login exchange with isolated forum fixtures')
    parser.add_argument('--migration', action='store_true', help='Exercise the migrated forum pages against isolated fixtures')
    parser.add_argument('--clipboard', action='store_true', help='Test board paste using the current clipboard image without changing it')
    args = parser.parse_args()
    args.full = args.full or args.migration
    if args.clipboard and args.full:
        parser.error('--clipboard cannot be combined with --full or --migration')
    binary = str(args.binary.resolve())
    directory = Path(tempfile.mkdtemp(prefix='linuxdo-native-test-'))
    (directory / 'config').mkdir()
    # Read existing GNOME network settings while keeping app data and MIME registration isolated.
    dconf = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config')) / 'dconf'
    if dconf.exists():
        (directory / 'config/dconf').symlink_to(dconf, target_is_directory=True)
    env = dict(os.environ, TAURI_WEBVIEW_AUTOMATION='true',
               XDG_DATA_HOME=str(directory / 'data'), XDG_CONFIG_HOME=str(directory / 'config'),
               NO_AT_BRIDGE='1', GTK_USE_PORTAL='0', GIO_USE_VFS='local')
    browser_url = directory / 'authorization-url'
    if args.full:
        tools = directory / 'bin'
        tools.mkdir()
        opener = tools / 'xdg-open'
        opener.write_text('#!/bin/sh\numask 077\nprintf "%s" "$1" > "$LINUXDO_TEST_AUTH_URL"\n')
        opener.chmod(0o700)
        env.update(PATH=f'{tools}:{env["PATH"]}', LINUXDO_TEST_AUTH_URL=str(browser_url))
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]

    def call(method, path, payload=None):
        data = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(f'http://127.0.0.1:{port}{path}', data=data, method=method,
                                         headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            raise AssertionError(error.read().decode()) from error
        return result.get('value')

    def wait_for(check, description, timeout=20):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            value = check()
            if value:
                return value
            time.sleep(0.1)
        raise AssertionError(description)

    session = None
    log = (directory / 'driver.log').open('w')
    driver = subprocess.Popen(['WebKitWebDriver', f'--port={port}', '--host=127.0.0.1'], env=env, stdout=log, stderr=log)
    try:
        for _ in range(50):
            try:
                call('GET', '/status')
                break
            except urllib.error.URLError:
                time.sleep(0.1)
        session = call('POST', '/session', {'capabilities': {'alwaysMatch': {
            'browserName': 'wry', 'webkitgtk:browserOptions': {'binary': binary},
        }}})['sessionId']

        def script(source):
            return call('POST', f'/session/{session}/execute/sync', {'script': source, 'args': []})

        def async_script(source):
            return call('POST', f'/session/{session}/execute/async', {'script': source, 'args': []})

        if args.clipboard:
            from native_clipboard import run

            def paste():
                call('POST', f'/session/{session}/actions', {'actions': [{
                    'type': 'key', 'id': 'clipboard-keyboard', 'actions': [
                        {'type': 'keyDown', 'value': '\ue009'},
                        {'type': 'keyDown', 'value': 'v'},
                        {'type': 'keyUp', 'value': 'v'},
                        {'type': 'keyUp', 'value': '\ue009'},
                    ],
                }]})

            run(script, wait_for, paste,
                lambda: call('GET', f'/session/{session}/screenshot'), directory)
            print('Artifacts:', directory)
            return

        wait_for(lambda: script("return Boolean(document.querySelector('button:not([disabled])'));"), 'Login listener never became ready')
        child = subprocess.Popen([binary, 'discourse://auth_redirect?payload=native-regression'], env=env, stdout=log, stderr=log)
        try:
            assert child.wait(timeout=5) == 0, 'Callback process failed'
        except subprocess.TimeoutExpired as error:
            child.terminate()
            child.wait(timeout=5)
            raise AssertionError('Browser callback started a second app instead of returning to the original process') from error
        wait_for(lambda: script("return document.body.innerText.includes('登录请求已失效');"), 'Original window did not receive the callback')
        subprocess.run([binary, 'discourse://auth_redirect?payload=native-regression'], env=env, stdout=log, stderr=log, check=True, timeout=5)
        screenshot = call('GET', f'/session/{session}/screenshot')
        (directory / 'callback.png').write_bytes(base64.b64decode(screenshot))
        print('PASS: callbacks reach the existing native window without starting another instance')
        if args.full:
            from cryptography.hazmat.primitives import serialization
            from cryptography.hazmat.primitives.asymmetric import padding

            main_window = call('GET', f'/session/{session}/window')
            script("document.querySelector('button:not([disabled])').click();")
            wait_for(browser_url.exists, 'Browser authorization URL was not opened')
            parameters = parse_qs(urlparse(browser_url.read_text()).query)
            public_key = serialization.load_pem_public_key(parameters['public_key'][0].encode())
            encrypt = lambda value: base64.b64encode(public_key.encrypt(value.encode(), padding.PKCS1v15())).decode()
            payload = json.dumps({'key': 'native-fixture-key', 'nonce': parameters['nonce'][0]})
            callback = 'discourse://auth_redirect?' + urlencode({
                'payload': encrypt(payload), 'oneTimePassword': encrypt('abc123def456'),
            })
            # Warm the forum with a read-only request, then replace fetch before exchanging any OTP.
            # A fast page load can otherwise dispatch the login before the test fixture is installed.
            script("window.__nativeWarmup = window.__TAURI_INTERNALS__.invoke('discourse_request',{path:'/site.json',method:'GET',body:null}).catch(()=>null);")
            windows = wait_for(lambda: (handles if len(handles := call('GET', f'/session/{session}/window/handles')) > 1 else None),
                               'Forum session window was not created', timeout=30)
            forum_window = next(window for window in windows if window != main_window)
            call('POST', f'/session/{session}/window', {'handle': forum_window})
            try:
                wait_for(lambda: script("return location.origin === 'https://linux.do' && typeof window.__linuxdoSession === 'function';"),
                         'Forum session bridge was not initialized', timeout=30)
            except AssertionError:
                print('Forum diagnostic:', script("return {origin:location.origin,path:location.pathname,title:document.title,ready:document.readyState,bridge:typeof window.__linuxdoSession,tauri:typeof window.__TAURI_INTERNALS__};"))
                print('Artifacts:', directory)
                raise
            fixture = Path(__file__).with_name('native-site-fixture.js').read_text()
            script(fixture)
            script("""
              window.__nativeTasks=[];
              const original=window.__linuxdoSession;
              window.__linuxdoSession=packet=>{
                const record={action:packet.task.action,state:'started'}; window.__nativeTasks.push(record);
                return original(packet).then(()=>record.state='finished',e=>{record.state='error';record.error=String(e)});
              };
            """)
            denied = async_script("const done=arguments[arguments.length-1]; window.__TAURI_INTERNALS__.invoke('start_oauth_flow').then(()=>done(false),()=>done(true));")
            assert denied is True, 'Remote forum page was allowed to call a main-window command'
            async_script("const done=arguments[arguments.length-1]; window.__TAURI_INTERNALS__.invoke('site_ready',{challenge:false}).then(()=>done(true),e=>done(String(e)));")
            call('POST', f'/session/{session}/window', {'handle': main_window})
            subprocess.run([binary, callback], env=env, stdout=log, stderr=log, check=True, timeout=5)
            wait_for(lambda: script("return (document.querySelector('.current-user')?.title === 'native-test-user' || document.body.innerText.includes('native-test-user')) && document.body.innerText.includes('Native login regression topic');"),
                     'Login did not reach the authenticated topic list', timeout=30)
            restored = async_script("const done=arguments[arguments.length-1]; window.__TAURI_INTERNALS__.invoke('restore_session').then(done,e=>done({error:String(e)}));")
            assert restored.get('username') == 'native-test-user', 'Native cookie session could not be restored'
            screenshot = call('GET', f'/session/{session}/screenshot')
            (directory / 'authenticated.png').write_bytes(base64.b64decode(screenshot))
            if args.migration:
                from native_migration import run
                run(script, async_script, wait_for,
                    lambda: call('GET', f'/session/{session}/screenshot'), directory)
            script("Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('退出登录')).click();")
            wait_for(lambda: script("return document.body.innerText.includes('浏览器登录');"), 'Logout did not return to login')
            restored = async_script("const done=arguments[arguments.length-1]; window.__TAURI_INTERNALS__.invoke('restore_session').then(done,e=>done({error:String(e)}));")
            assert restored is None, 'Logout left the native session cookie behind'
            print('PASS: browser login, encrypted callback, OTP exchange, topics, cookie restore, logout and IPC permissions')
        print('Artifacts:', directory)
    except Exception:
        print('Failure artifacts:', directory)
        if session:
            try:
                (directory / 'failure.png').write_bytes(base64.b64decode(call('GET', f'/session/{session}/screenshot')))
                (directory / 'failure.txt').write_text(script("return document.body.innerText;"))
                if args.full and 'forum_window' in locals():
                    call('POST', f'/session/{session}/window', {'handle': forum_window})
                    diagnostic = script("return {origin:location.origin,ready:document.readyState,fixture:Boolean(window.__fixture),tasks:window.__nativeTasks,calls:window.__fixture?.calls.map(c=>({path:c.path,method:c.method}))};")
                    (directory / 'forum-diagnostic.json').write_text(json.dumps(diagnostic, ensure_ascii=False, indent=2))
            except Exception:
                pass
        raise
    finally:
        if session:
            try:
                call('DELETE', f'/session/{session}')
            except Exception:
                pass
        driver.terminate()
        driver.wait(timeout=5)
        log.close()


if __name__ == '__main__':
    main()
