export function acknowledgedDirtyIds(dirty, queued, queuedAtStart, failed, pendingIds) {
  const acknowledged = [];
  for (const [id, revision] of queuedAtStart) {
    if (
      dirty.get(id) === revision
      && queued.get(id) === revision
      && failed.get(id) !== revision
      && !pendingIds.has(id)
    ) acknowledged.push(id);
  }
  return acknowledged;
}
