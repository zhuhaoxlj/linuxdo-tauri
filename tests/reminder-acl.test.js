import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const buildScript = readFileSync(new URL('../src-tauri/build.rs', import.meta.url), 'utf8');
const capability = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8'));
const handler = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const mainPermissions = new Set(capability.permissions);

for (const command of ['reminder_status', 'take_reminder_open']) {
  test(`${command} is registered and permitted in the main window`, () => {
    assert.match(handler, new RegExp(`reminders::${command},`));
    assert.ok(buildScript.includes(`"${command}"`), `${command} is missing from the Tauri app manifest`);
    assert.ok(mainPermissions.has(`allow-${command.replaceAll('_', '-')}`), `${command} is not allowed in the main window`);
  });
}
