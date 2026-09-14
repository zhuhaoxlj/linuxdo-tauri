import assert from 'node:assert/strict';
import test from 'node:test';
import { restoreAuthSession, terminateAuthSession } from '../src/modules/linuxdo/lib/authSession.js';

test('cached users are confirmed by the native session before writes are enabled', async () => {
  const commands = [];
  const currentUser = { username: 'current-user' };
  const auth = await restoreAuthSession(async command => {
    commands.push(command);
    return currentUser;
  }, { user: { username: 'cached-user' }, guest: false });

  assert.deepEqual(commands, ['restore_session']);
  assert.deepEqual(auth, { user: currentUser, guest: false });
});

test('a stale cached user is removed when the native session is absent', async () => {
  const auth = await restoreAuthSession(async () => null, {
    user: { username: 'cached-user' },
    guest: false,
  });

  assert.equal(auth, null);
});

test('guest browsing survives an empty native session', async () => {
  const auth = await restoreAuthSession(async () => null, { user: null, guest: true });

  assert.deepEqual(auth, { user: null, guest: true });
});

test('logging out terminates the native session', async () => {
  const commands = [];
  await terminateAuthSession(async command => { commands.push(command); });

  assert.deepEqual(commands, ['logout']);
});
