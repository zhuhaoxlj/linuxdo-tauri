import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

const urlPattern = /https?:\/\/[^\s<>"']+/gi;
const trailingPunctuation = /[.,;:!?、。，；：！？'"”’]/;
const closers = { ')': '(', ']': '[', '}': '{', '）': '（', '】': '【', '》': '《', '」': '「', '』': '『' };
const schemeLength = 'https://'.length;

function occurrences(value, character) {
  return value.split(character).length - 1;
}

export function trimUrlEnd(url) {
  let value = url;
  while (value) {
    const last = value[value.length - 1];
    if (trailingPunctuation.test(last)) {
      value = value.slice(0, -1);
      continue;
    }
    const opener = closers[last];
    if (opener && occurrences(value, last) > occurrences(value, opener)) {
      value = value.slice(0, -1);
      continue;
    }
    break;
  }
  return value;
}

export function linkSegments(text) {
  const source = typeof text === 'string' ? text : '';
  const segments = [];
  let cursor = 0;
  urlPattern.lastIndex = 0;
  for (const match of source.matchAll(urlPattern)) {
    const url = trimUrlEnd(match[0]);
    if (url.length <= schemeLength) continue;
    if (match.index > cursor) segments.push({ type: 'text', value: source.slice(cursor, match.index) });
    segments.push({ type: 'link', value: url });
    cursor = match.index + url.length;
  }
  if (cursor < source.length) segments.push({ type: 'text', value: source.slice(cursor) });
  return segments;
}

export async function openExternalLink(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error('仅支持打开 http 或 https 链接');
  if (isTauri()) {
    await openUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function openLinkFromEvent(event, url) {
  if (!(event?.ctrlKey || event?.metaKey)) return false;
  await openExternalLink(url);
  return true;
}
