export const number = value => new Intl.NumberFormat('zh-CN', { notation: Number(value) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(Number(value) || 0);

export function relativeTime(value) {
  if (!value) return '';
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (!Number.isFinite(elapsed)) return '';
  if (elapsed < 60000) return '刚刚';
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)} 分钟前`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)} 小时前`;
  if (elapsed < 604800000) return `${Math.floor(elapsed / 86400000)} 天前`;
  return new Date(value).toLocaleDateString('zh-CN');
}

export function absoluteUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value, 'https://linux.do');
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export function avatarUrl(template, size = 80) {
  if (!template) return '';
  const url = absoluteUrl(template.replace('{size}', String(size)));
  // Discourse serves public avatars through this CDN. The linux.do endpoint can
  // reject desktop WebView requests with 403 before redirecting to the same file.
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'linux.do'
      && (parsed.pathname.startsWith('/user_avatar/') || parsed.pathname.startsWith('/letter_avatar/'))) {
      parsed.hostname = 'cdn.ldstatic.com';
      return parsed.href;
    }
  } catch { /* absoluteUrl already filtered invalid URLs */ }
  return url;
}
