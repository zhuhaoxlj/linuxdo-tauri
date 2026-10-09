import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('deb declares the tools needed for audio capture and automatic installation resolves dependencies', () => {
  const config = JSON.parse(read('../src-tauri/tauri.conf.json'));
  assert.ok(config.bundle.linux.deb.depends.includes('pulseaudio-utils'));
  assert.match(read('../scripts/tauri.sh'), /pkexec \/usr\/bin\/apt-get install --no-remove/);
});

test('audio start publishes initial state before spawning a worker that may immediately fail', () => {
  const source = read('../src-tauri/src/audio.rs');
  const start = source.slice(source.indexOf('pub fn audio_start('), source.indexOf('pub fn audio_stop('));
  assert.ok(start.indexOf('let capture = start_capture()?') < start.indexOf('mute_local_output(Some(&app))'));
  assert.ok(start.indexOf('s.streaming = true') < start.indexOf('std::thread::spawn'));
});

test('audio command responses cannot overwrite newer worker failure events', () => {
  const source = read('../src/shared/components/AppLayout.jsx');
  const toggle = source.slice(source.indexOf('const toggleAudio ='), source.indexOf('const startDrag ='));
  assert.match(toggle, /invoke\(command\)/);
  assert.doesNotMatch(toggle, /\.then\(/);
});
