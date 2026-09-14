import QRCode from 'qrcode';
import { approvePairRequest, claimPairRequest, createPairRequest, MAST_ORIGIN } from './api';
import { generatePairingKeyPair, openPairingEnvelope, randomToken, sealPairingEnvelope, sha256Hex } from './crypto';
import { replaceVault } from './database';

export async function createPairingSession(name) {
  const keys = await generatePairingKeyPair();
  const claimSecret = randomToken(32);
  const created = await createPairRequest(name, keys.publicKey, await sha256Hex(claimSecret));
  const code = JSON.stringify({ version: 1, origin: MAST_ORIGIN, requestId: created.request_id, name, publicKey: keys.publicKey });
  return { requestId: created.request_id, claimSecret, keys, code, qrCode: await QRCode.toDataURL(code, { width: 320, margin: 2 }), expiresAt: created.expires_at };
}

export async function claimPairingSession(session) {
  const result = await claimPairRequest(session.requestId, session.claimSecret);
  if (result.status !== 'approved' || !result.sealed_key || !result.device) return undefined;
  const credentials = await openPairingEnvelope(session.keys.privateKey, result.sealed_key);
  const config = { key: 'vault', vaultId: credentials.vaultId, vaultKey: credentials.vaultKey, deviceId: result.device.id, deviceName: result.device.name, deviceToken: credentials.deviceToken, cursor: 0 };
  await replaceVault(config);
  return config;
}

export async function approvePairingCode(config, code) {
  const request = parsePairingCode(code);
  const token = randomToken(32);
  const sealedKey = await sealPairingEnvelope(request.publicKey, { vaultId: config.vaultId, vaultKey: config.vaultKey, deviceToken: token });
  await approvePairRequest(config.deviceToken, request.requestId, { tokenHash: await sha256Hex(token), tokenPrefix: token.slice(0, 8), sealedKey });
}

export function parsePairingCode(code) {
  const request = JSON.parse(code);
  if (request.version !== 1 || request.origin !== MAST_ORIGIN || typeof request.requestId !== 'string' || !request.requestId || typeof request.name !== 'string' || !request.name.trim() || !request.publicKey) throw new Error('配对信息与当前服务器不匹配');
  return { ...request, name: request.name.trim() };
}
