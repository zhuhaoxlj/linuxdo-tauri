const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ATTACHMENT_CHUNK_SIZE = 1 << 20;
const ATTACHMENT_HEADER_SIZE = 25;

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function encryptNote(vaultKey, vaultId, note) {
  const nonce = randomBytes(12);
  const ciphertext = await crypt('encrypt', vaultKey, nonce, encoder.encode(JSON.stringify(note)), noteAad(vaultId, note.id));
  return { encryption_version: 1, nonce: toBase64(nonce), ciphertext: toBase64(ciphertext) };
}

export async function decryptNote(vaultKey, vaultId, noteId, envelope) {
  if (envelope.encryption_version !== 1) throw new Error('不支持的同步加密版本');
  const plaintext = await crypt('decrypt', vaultKey, fromBase64(envelope.nonce), fromBase64(envelope.ciphertext), noteAad(vaultId, noteId));
  const note = JSON.parse(decoder.decode(plaintext));
  if (note.id !== noteId) throw new Error('密文记录 ID 不匹配');
  return note;
}

export async function encryptAttachment(vaultKey, vaultId, blobId, plaintext) {
  const nonceBase = randomBytes(12);
  const chunks = Math.max(1, Math.ceil(plaintext.size / ATTACHMENT_CHUNK_SIZE));
  const header = new Uint8Array(ATTACHMENT_HEADER_SIZE);
  const headerView = new DataView(header.buffer);
  header[0] = 2;
  headerView.setUint32(1, ATTACHMENT_CHUNK_SIZE);
  headerView.setBigUint64(5, BigInt(plaintext.size));
  header.set(nonceBase, 13);
  const key = await crypto.subtle.importKey('raw', bytes(vaultKey), 'AES-GCM', false, ['encrypt']);
  const parts = [header.slice().buffer];
  for (let index = 0; index < chunks; index += 1) {
    const chunk = new Uint8Array(await plaintext.slice(index * ATTACHMENT_CHUNK_SIZE, (index + 1) * ATTACHMENT_CHUNK_SIZE).arrayBuffer());
    parts.push(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bytes(attachmentNonce(nonceBase, index)), additionalData: bytes(attachmentAad(vaultId, blobId, index, chunks)), tagLength: 128 }, key, bytes(chunk)));
  }
  return new Blob(parts, { type: 'application/octet-stream' });
}

export async function decryptAttachment(vaultKey, vaultId, blobId, envelope) {
  if (envelope.size < ATTACHMENT_HEADER_SIZE + 16) throw new Error('附件密文格式无效');
  const header = new Uint8Array(await envelope.slice(0, ATTACHMENT_HEADER_SIZE).arrayBuffer());
  const view = new DataView(header.buffer);
  if (header[0] !== 2 || view.getUint32(1) !== ATTACHMENT_CHUNK_SIZE) throw new Error('附件加密版本无效');
  const plaintextSize = Number(view.getBigUint64(5));
  const chunks = Math.max(1, Math.ceil(plaintextSize / ATTACHMENT_CHUNK_SIZE));
  if (!Number.isSafeInteger(plaintextSize) || envelope.size !== ATTACHMENT_HEADER_SIZE + plaintextSize + chunks * 16) throw new Error('附件密文大小无效');
  const nonceBase = header.slice(13, 25);
  const key = await crypto.subtle.importKey('raw', bytes(vaultKey), 'AES-GCM', false, ['decrypt']);
  const parts = [];
  let offset = ATTACHMENT_HEADER_SIZE;
  for (let index = 0; index < chunks; index += 1) {
    const plaintextLength = Math.min(ATTACHMENT_CHUNK_SIZE, plaintextSize - index * ATTACHMENT_CHUNK_SIZE);
    const ciphertextLength = plaintextLength + 16;
    parts.push(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(attachmentNonce(nonceBase, index)), additionalData: bytes(attachmentAad(vaultId, blobId, index, chunks)), tagLength: 128 }, key, await envelope.slice(offset, offset + ciphertextLength).arrayBuffer()));
    offset += ciphertextLength;
  }
  return new Blob(parts);
}

export async function generatePairingKeyPair() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey), privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey) };
}

export async function sealPairingEnvelope(peerPublicKey, credentials) {
  const sender = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = await pairingKey(sender.privateKey, peerPublicKey, salt, 'encrypt');
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bytes(nonce), additionalData: encoder.encode('alive-notes-pair-v1') }, key, encoder.encode(JSON.stringify(credentials)));
  return JSON.stringify({ version: 1, public_key: await crypto.subtle.exportKey('jwk', sender.publicKey), salt: toBase64(salt), nonce: toBase64(nonce), ciphertext: toBase64(new Uint8Array(ciphertext)) });
}

export async function openPairingEnvelope(privateKey, sealed) {
  const envelope = JSON.parse(sealed);
  if (envelope.version !== 1) throw new Error('配对密文版本无效');
  const key = await pairingKey(privateKey, envelope.public_key, fromBase64(envelope.salt), 'decrypt');
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(fromBase64(envelope.nonce)), additionalData: encoder.encode('alive-notes-pair-v1') }, key, bytes(fromBase64(envelope.ciphertext)));
  return JSON.parse(decoder.decode(plaintext));
}

export async function sha256Hex(value) {
  const input = typeof value === 'string' ? encoder.encode(value) : new Uint8Array(await value.arrayBuffer());
  const digest = await crypto.subtle.digest('SHA-256', bytes(input));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function randomToken(length = 32) {
  return toBase64(randomBytes(length)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function toBase64(value) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function crypt(operation, keyBytes, nonce, data, aad) {
  const key = await crypto.subtle.importKey('raw', bytes(keyBytes), 'AES-GCM', false, [operation]);
  const result = await crypto.subtle[operation]({ name: 'AES-GCM', iv: bytes(nonce), additionalData: bytes(aad), tagLength: 128 }, key, bytes(data));
  return new Uint8Array(result);
}

async function pairingKey(privateKey, publicJwk, salt, usage) {
  const importedPrivateKey = privateKey instanceof CryptoKey
    ? privateKey
    : await crypto.subtle.importKey('jwk', privateKey, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const publicKey = await crypto.subtle.importKey('jwk', publicJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, importedPrivateKey, 256);
  const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: bytes(salt), info: encoder.encode('alive-notes-pair-v1') }, material, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

function noteAad(vaultId, noteId) { return encoder.encode(`${vaultId}|note|${noteId}|1`); }
function attachmentAad(vaultId, blobId, chunk, chunks) { return encoder.encode(`${vaultId}|blob|${blobId}|2|${chunk}|${chunks}`); }
function attachmentNonce(base, chunk) { const nonce = base.slice(); const view = new DataView(nonce.buffer); view.setUint32(8, view.getUint32(8) ^ chunk); return nonce; }
function bytes(value) { return value.slice().buffer; }
