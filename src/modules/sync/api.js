export const MAST_ORIGIN = globalThis.__LINUXDO_MAST_ORIGIN__ || import.meta.env?.VITE_MAST_ORIGIN || 'https://mast.lindum.top';
const DEVICE_API = `${MAST_ORIGIN}/a/notes-sync/v1`;
const MAX_PUSH_BYTES = 1024 * 1024;
const MAX_PUSH_ITEMS = 100;

export class SyncApiError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}

export async function createPairRequest(name, publicKey, claimHash) {
  return request(`${DEVICE_API}/pair/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, public_key: JSON.stringify(publicKey), claim_hash: claimHash }) });
}
export async function claimPairRequest(requestId, claimSecret) { return request(`${DEVICE_API}/pair/requests/${encodeURIComponent(requestId)}`, { headers: { 'X-Pair-Claim': claimSecret } }); }
export async function approvePairRequest(token, requestId, approval) { return request(`${DEVICE_API}/pair/requests/${encodeURIComponent(requestId)}/approve`, auth(token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token_hash: approval.tokenHash, token_prefix: approval.tokenPrefix, sealed_key: approval.sealedKey }) })); }
export async function pullChanges(token, after) { return request(`${DEVICE_API}/sync/pull?after=${after}&limit=200`, auth(token)); }
export async function listDevices(token) { return request(`${DEVICE_API}/devices`, auth(token)).then(data => data.devices); }
export async function revokeDevice(token, deviceId) { return request(`${DEVICE_API}/devices/${encodeURIComponent(deviceId)}`, auth(token, { method: 'DELETE' })); }

export async function pushMutations(token, mutations) {
  const response = await request(`${DEVICE_API}/sync/push`, auth(token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pushBody(mutations)) }));
  return response.results;
}

export function mutationBatches(mutations) {
  const batches = [];
  let current = [];
  for (const mutation of mutations) {
    const candidate = [...current, mutation];
    if (candidate.length <= MAX_PUSH_ITEMS && bodySize(pushBody(candidate)) <= MAX_PUSH_BYTES) { current = candidate; continue; }
    if (!current.length) throw new SyncApiError('mutation_too_large', '单条加密记录超过 1 MiB 同步上限', 0);
    batches.push(current);
    current = [mutation];
    if (bodySize(pushBody(current)) > MAX_PUSH_BYTES) throw new SyncApiError('mutation_too_large', '单条加密记录超过 1 MiB 同步上限', 0);
  }
  if (current.length) batches.push(current);
  return batches;
}

export async function uploadBlob(token, blobId, noteId, ciphertext, digest) {
  const response = await fetch(`${DEVICE_API}/blobs/${encodeURIComponent(blobId)}?note_id=${encodeURIComponent(noteId)}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'X-Ciphertext-SHA256': digest }, body: ciphertext });
  if (!response.ok) throw await apiError(response, '附件上传失败');
}
export async function downloadBlob(token, blobId) {
  const response = await fetch(`${DEVICE_API}/blobs/${encodeURIComponent(blobId)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw await apiError(response, '附件下载失败');
  return response.blob();
}

function pushBody(mutations) { return { mutations: mutations.map(item => ({ mutation_id: item.mutationId, note_id: item.noteId, base_version: item.baseVersion, envelope: item.envelope })) }; }
function bodySize(body) { return new TextEncoder().encode(JSON.stringify(body)).byteLength; }
function auth(token, init = {}) { return { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } }; }
async function request(url, init) { const response = await fetch(url, init); const data = await response.json().catch(() => ({})); if (!response.ok) throw new SyncApiError(data.error || 'request_failed', data.message || response.statusText, response.status); return data; }
async function apiError(response, fallback) { const data = await response.json().catch(() => ({})); return new SyncApiError(data.error || 'request_failed', data.message || fallback, response.status); }
