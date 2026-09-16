export const QUARTER_MS = 15 * 60_000;
export const DEFAULT_BLOCK_MS = 60 * 60_000;

export function dayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateBounds(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  if (!match) throw new Error('日期格式无效');
  const [, year, month, day] = match.map(Number);
  const start = new Date(year, month - 1, day);
  if (dayKey(start) !== key) throw new Error('日期无效');
  return { start: start.getTime(), end: new Date(year, month - 1, day + 1).getTime() };
}

export function addDays(key, delta) {
  const { start } = dateBounds(key);
  const date = new Date(start);
  date.setDate(date.getDate() + delta);
  return dayKey(date);
}

export function snapToQuarter(value) {
  const date = new Date(value);
  date.setMinutes(Math.round((date.getMinutes() + date.getSeconds() / 60) / 15) * 15, 0, 0);
  return date.getTime();
}

export function daySegments(blocks, key) {
  const { start, end } = dateBounds(key);
  return blocks.filter(block => block.status !== 'canceled' && block.plannedEnd > start && block.plannedStart < end)
    .map(block => ({ block, start: Math.max(start, block.plannedStart), end: Math.min(end, block.plannedEnd) }))
    .sort((a, b) => a.start - b.start);
}

export function intervalMinutes(segments) {
  let total = 0;
  let lastEnd = -Infinity;
  for (const segment of [...segments].sort((a, b) => a.start - b.start)) {
    total += Math.max(0, segment.end - Math.max(segment.start, lastEnd));
    lastEnd = Math.max(lastEnd, segment.end);
  }
  return Math.round(total / 60_000);
}

export function conflictingIds(segments) {
  const ids = new Set();
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length && segments[j].start < segments[i].end; j += 1) {
      if (segments[j].start < segments[i].end) {
        ids.add(segments[i].block.id);
        ids.add(segments[j].block.id);
      }
    }
  }
  return ids;
}

export function layoutSegments(segments) {
  const result = [];
  let group = [];
  let groupEnd = -Infinity;
  const flush = () => {
    const laneEnds = [];
    for (const segment of group) {
      let lane = laneEnds.findIndex(end => end <= segment.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = segment.end;
      result.push({ ...segment, lane, lanes: 0 });
    }
    for (const item of result.slice(-group.length)) item.lanes = laneEnds.length;
    group = [];
  };
  for (const segment of segments) {
    if (group.length && segment.start >= groupEnd) flush();
    group.push(segment);
    groupEnd = Math.max(groupEnd, segment.end);
  }
  if (group.length) flush();
  return result;
}

export function cancelFutureBlocks(blocks, taskId, now = Date.now()) {
  return blocks.map(block => block.taskId === taskId && block.status === 'pending' && block.plannedStart > now
    ? { ...block, status: 'canceled', cancelReason: 'task_completed', updatedAt: new Date(now).toISOString() }
    : block);
}
