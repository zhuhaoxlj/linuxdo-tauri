import { openDB } from 'idb';
import { fromBase64, randomBytes, toBase64 } from './crypto';

let database;

function db() {
  database ||= openDB('linuxdo-workspace-sync', 1, {
    upgrade(store) {
      store.createObjectStore('config', { keyPath: 'key' });
      store.createObjectStore('records', { keyPath: 'id' });
      store.createObjectStore('outbox', { keyPath: 'noteId' });
      store.createObjectStore('attachments', { keyPath: 'id' });
    },
  });
  return database;
}

export async function loadVault() {
  const stored = await (await db()).get('config', 'vault');
  if (!stored) return undefined;
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buffer(fromBase64(stored.nonce)), additionalData: buffer(vaultAad(stored)), tagLength: 128 }, stored.wrappingKey, buffer(fromBase64(stored.ciphertext)));
  const secrets = JSON.parse(new TextDecoder().decode(plaintext));
  return { key: 'vault', vaultId: stored.vaultId, vaultKey: secrets.vaultKey, deviceId: stored.deviceId, deviceName: stored.deviceName, deviceToken: secrets.deviceToken, cursor: stored.cursor };
}

export async function saveVault(config) {
  await (await db()).put('config', await sealVault(config));
}

export async function replaceVault(config) {
  const store = await db();
  const sealed = await sealVault(config);
  const transaction = store.transaction(['config', 'records', 'outbox', 'attachments'], 'readwrite');
  const configStore = transaction.objectStore('config');
  await Promise.all([
    configStore.clear(),
    configStore.put(sealed),
    transaction.objectStore('records').clear(),
    transaction.objectStore('outbox').clear(),
    transaction.objectStore('attachments').clear(),
  ]);
  await transaction.done;
}

export async function clearVault() {
  const transaction = (await db()).transaction(['config', 'records', 'outbox', 'attachments'], 'readwrite');
  await Promise.all([
    transaction.objectStore('config').clear(),
    transaction.objectStore('records').clear(),
    transaction.objectStore('outbox').clear(),
    transaction.objectStore('attachments').clear(),
  ]);
  await transaction.done;
}
export async function listRecords() { return (await db()).getAll('records'); }
export async function listOutbox() { return (await db()).getAll('outbox'); }
export async function getAttachment(id) { return (await db()).get('attachments', id); }
export async function saveAttachment(attachment) { await (await db()).put('attachments', attachment); }
export async function listPendingAttachments() { return (await db()).getAll('attachments').then(items => items.filter(item => item.uploaded === 0)); }
export async function markAttachmentUploaded(id) { const store = await db(); const item = await store.get('attachments', id); if (item) await store.put('attachments', { ...item, uploaded: 1 }); }

export async function saveRecordAndMutation(record, mutation) {
  const transaction = (await db()).transaction(['records', 'outbox'], 'readwrite');
  const current = await transaction.objectStore('records').get(record.id);
  const version = Math.max(record.serverVersion || 0, current?.serverVersion || 0);
  await Promise.all([
    transaction.objectStore('records').put({ ...record, serverVersion: version }),
    transaction.objectStore('outbox').put({ ...mutation, baseVersion: version }),
  ]);
  await transaction.done;
}

export async function acknowledgeMutation(record, mutationId) {
  const transaction = (await db()).transaction(['records', 'outbox'], 'readwrite');
  const pending = await transaction.objectStore('outbox').get(record.id);
  const latest = await transaction.objectStore('records').get(record.id);
  if (pending?.mutationId === mutationId) {
    await Promise.all([transaction.objectStore('records').put(record), transaction.objectStore('outbox').delete(record.id)]);
  } else if (pending) {
    await Promise.all([
      transaction.objectStore('records').put({ ...(latest || record), serverVersion: record.serverVersion, syncState: 'pending' }),
      transaction.objectStore('outbox').put({ ...pending, baseVersion: record.serverVersion }),
    ]);
  }
  await transaction.done;
}

export async function rebaseMutation(noteId, baseVersion) {
  const transaction = (await db()).transaction('outbox', 'readwrite');
  const store = transaction.objectStore('outbox');
  const mutation = await store.get(noteId);
  if (mutation) await store.put({ ...mutation, baseVersion });
  await transaction.done;
}

export async function savePulled(config, records) {
  const stored = await sealVault(config);
  const transaction = (await db()).transaction(['config', 'records'], 'readwrite');
  await Promise.all([
    ...records.map(record => transaction.objectStore('records').put(record)),
    transaction.objectStore('config').put(stored),
  ]);
  await transaction.done;
}

async function sealVault(config) {
  const current = await (await db()).get('config', 'vault');
  const wrappingKey = current?.vaultId === config.vaultId && current.deviceId === config.deviceId
    ? current.wrappingKey
    : await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const nonce = randomBytes(12);
  const stored = { key: 'vault', version: 1, vaultId: config.vaultId, deviceId: config.deviceId, deviceName: config.deviceName, cursor: config.cursor, wrappingKey, nonce: toBase64(nonce), ciphertext: '' };
  const plaintext = new TextEncoder().encode(JSON.stringify({ vaultKey: config.vaultKey, deviceToken: config.deviceToken }));
  stored.ciphertext = toBase64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buffer(nonce), additionalData: buffer(vaultAad(stored)), tagLength: 128 }, wrappingKey, plaintext)));
  return stored;
}

function vaultAad(config) { return new TextEncoder().encode(`alive-notes-config|${config.version}|${config.vaultId}|${config.deviceId}`); }
function buffer(value) { return value.slice().buffer; }
