import { downloadBlob, mutationBatches, pullChanges, pushMutations, uploadBlob } from './api';
import { decryptAttachment, decryptNote, encryptAttachment, encryptNote, fromBase64, sha256Hex } from './crypto';
import { acknowledgeMutation, getAttachment, listOutbox, listPendingAttachments, listRecords, markAttachmentUploaded, rebaseMutation, saveAttachment, savePulled, saveRecordAndMutation } from './database';
import { noteToRecord, resolveConflict, taskToRecord } from './workspace';

export async function queueRecord(config, record, images) {
  const prepared = images ? await withImageAttachments(config, record, images) : record;
  const payload = stripLocalFields(prepared);
  const mutation = { noteId: payload.id, mutationId: crypto.randomUUID(), baseVersion: prepared.serverVersion || 0, envelope: await encryptNote(fromBase64(config.vaultKey), config.vaultId, payload) };
  await saveRecordAndMutation({ ...prepared, syncState: 'pending' }, mutation);
}

export async function queueWorkspaceSnapshot(config, snapshot, knownRecords = []) {
  const known = new Map(knownRecords.map(record => [record.id, record]));
  let queued = 0;
  for (const task of snapshot.tasks) {
    const record = taskToRecord(task);
    if (!known.has(record.id) || record.updatedAt > known.get(record.id).updatedAt) { await queueRecord(config, record, task.images || []); queued += 1; }
  }
  for (const note of snapshot.notes) {
    const record = noteToRecord(note);
    if (!known.has(record.id) || record.updatedAt > known.get(record.id).updatedAt) { await queueRecord(config, record); queued += 1; }
  }
  for (const record of snapshot.tombstones || []) {
    if (!known.has(record.id) || record.updatedAt > known.get(record.id).updatedAt) { await queueRecord(config, record); queued += 1; }
  }
  return queued;
}

export async function synchronize(config) {
  const key = fromBase64(config.vaultKey);
  for (const attachment of await listPendingAttachments()) {
    await uploadBlob(config.deviceToken, attachment.id, attachment.noteId, attachment.ciphertext, attachment.sha256);
    await markAttachmentUploaded(attachment.id);
  }
  const outbox = await listOutbox();
  const records = new Map((await listRecords()).map(record => [record.id, record]));
  for (const batch of mutationBatches(outbox)) {
    for (const result of await pushMutations(config.deviceToken, batch)) {
      const mutation = batch.find(item => item.mutationId === result.mutation_id);
      const local = mutation && records.get(mutation.noteId);
      if (!mutation || !local) continue;
      if (result.status === 'applied' && result.version) {
        const clean = { ...local, serverVersion: result.version, syncState: 'clean' };
        await acknowledgeMutation(clean, mutation.mutationId);
        records.set(clean.id, clean);
      } else if (result.status === 'conflict' && result.current) {
        const remote = { ...await decryptNote(key, config.vaultId, result.current.note_id, result.current), serverVersion: result.current.version, syncState: 'clean' };
        await acknowledgeMutation(remote, mutation.mutationId);
        const { primary, conflict, retry } = resolveConflict(local, remote);
        await queueRecord(config, conflict);
        if (retry) await queueRecord(config, retry);
        records.set(primary.id, primary);
        records.set(conflict.id, conflict);
      } else if (result.status === 'conflict') {
        await rebaseMutation(mutation.noteId, 0);
      }
    }
  }
  let cursor = config.cursor;
  while (true) {
    const pulled = await pullChanges(config.deviceToken, cursor);
    const pendingIds = new Set((await listOutbox()).map(item => item.noteId));
    const remote = [];
    for (const change of pulled.changes) {
      if (pendingIds.has(change.note_id)) break;
      remote.push({ ...await decryptNote(key, config.vaultId, change.note_id, change), serverVersion: change.version, syncState: 'clean' });
      cursor = change.sequence;
    }
    if (remote.length === pulled.changes.length) cursor = pulled.next_sequence;
    const updated = { ...config, cursor };
    await savePulled(updated, remote);
    remote.forEach(record => records.set(record.id, record));
    config = updated;
    if (pulled.changes.length < 200 || remote.length !== pulled.changes.length) break;
  }
  const pendingIds = new Set((await listOutbox()).map(item => item.noteId));
  return { config, records: await listRecords(), pending: pendingIds.size, pendingIds };
}

export async function hydrateCardImages(config, records) {
  const key = fromBase64(config.vaultKey);
  const images = new Map();
  for (const record of records.filter(item => item.kind === 'board_card' && !item.trashedAt)) {
    const current = [];
    for (const attachment of (record.attachments || []).filter(item => item.mime?.startsWith('image/'))) {
      let cached = await getAttachment(attachment.id);
      if (!cached) {
        const ciphertext = await downloadBlob(config.deviceToken, attachment.id);
        cached = { id: attachment.id, noteId: record.id, ciphertext, sha256: await sha256Hex(ciphertext), uploaded: 1 };
        await saveAttachment(cached);
      }
      const blob = await decryptAttachment(key, config.vaultId, attachment.id, cached.ciphertext);
      current.push(await blobToDataUrl(new Blob([blob], { type: attachment.mime })));
    }
    if (current.length) images.set(record.id, current);
  }
  return images;
}

async function withImageAttachments(config, record, imageDataUrls) {
  const key = fromBase64(config.vaultKey);
  const attachments = [];
  for (const [index, dataUrl] of imageDataUrls.entries()) {
    const source = dataUrlToBlob(dataUrl);
    const id = `img-${await sha256Hex(`${record.id}|${dataUrl}`)}`;
    const cached = await getAttachment(id);
    if (!cached) {
      const ciphertext = await encryptAttachment(key, config.vaultId, id, source);
      await saveAttachment({ id, noteId: record.id, ciphertext, sha256: await sha256Hex(ciphertext), uploaded: 0 });
    }
    attachments.push({ id, name: `card-image-${index + 1}.${extension(source.type)}`, mime: source.type || 'image/png', size: source.size });
  }
  return { ...record, attachments };
}

function stripLocalFields(record) { const { serverVersion, syncState, ...payload } = record; return payload; }
function extension(mime) { return mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'; }
function dataUrlToBlob(value) { const [header, encoded] = value.split(',', 2); const mime = header.match(/^data:([^;]+)/)?.[1] || 'image/png'; const binary = atob(encoded); return new Blob([Uint8Array.from(binary, char => char.charCodeAt(0))], { type: mime }); }
function blobToDataUrl(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); }
