import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = read('../src-tauri/build.rs');
const handler = read('../src-tauri/src/lib.rs');
const capability = JSON.parse(read('../src-tauri/capabilities/default.json'));

for (const command of ['relay_settings', 'save_relay_settings']) {
  test(`${command} is registered and permitted only in the main window`, () => {
    assert.match(handler, new RegExp(`lan::${command},`));
    assert.ok(manifest.includes(`"${command}"`));
    assert.ok(capability.permissions.includes(`allow-${command.replaceAll('_', '-')}`));
    const siteCapability = JSON.parse(read('../src-tauri/capabilities/site-session.json'));
    assert.ok(!siteCapability.permissions.includes(`allow-${command.replaceAll('_', '-')}`));
  });
}

test('phone connection is reachable from global settings without loading the forum module', () => {
  const page = read('../src/shared/components/GlobalSettingsPage.jsx');
  assert.match(page, /<PhoneConnectionSettings\s*\/>/);
  assert.doesNotMatch(page, /from .*modules\/linuxdo/);
  assert.match(read('../src/App.jsx'), /path="\/settings"/);
  assert.match(read('../src/shared/components/AppLayout.jsx'), /<NavLink to="\/settings"/);
  assert.match(read('../src/shared/components/AppLayout.jsx'), /isSettingsActive \? 'settings'/);
  assert.match(read('../src/shared/components/LanStatusBadge.jsx'), /to="\/settings"/);
  assert.match(read('../src/shared/components/LanStatusBadge.jsx'), /configurationRequired/);
});

test('the old forum phone settings link redirects before forum login', () => {
  const app = read('../src/App.jsx');
  assert.match(app, /location.pathname === '\/linuxdo\/settings'/);
  assert.match(app, /get\('tab'\) === 'phone'/);
  assert.match(app, /element=\{legacyPhoneSettings \? <Navigate to="\/settings" replace/);
  const page = read('../src/modules/linuxdo/pages/SettingsPage.jsx');
  assert.match(page, /tab === 'phone'.*<Navigate to="\/settings" replace/);
  assert.doesNotMatch(page, /<PhoneConnectionSettings/);
});
