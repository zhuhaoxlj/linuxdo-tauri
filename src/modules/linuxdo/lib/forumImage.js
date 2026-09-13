import { invoke } from '@tauri-apps/api/core';
import { errorText } from './api';

// 图片代理：主窗口的 <img> 跨站请求 linux.do 时不携带 SameSite cookie，
// 需要登录权限的图片会 403（对应 FluxDO 主域图片走带 CookieJar 客户端的方案）。
// 由 linux.do 同源的会话窗口带会话重新拉取并转 data URL；
// 成功与失败都做会话内缓存，避免同一图片反复走代理或无限重试。
const loaded = new Map();
const failed = new Set();

export async function loadForumImage(url) {
  const cached = loaded.get(url);
  if (cached) return cached;
  if (failed.has(url)) throw new Error('该图片此前代理失败');
  try {
    const { dataUrl } = await invoke('fetch_forum_image', { url });
    loaded.set(url, dataUrl);
    return dataUrl;
  } catch (error) {
    // 诊断输出：命令不存在（未重启重编译）、会话窗口 fetch 被拒、超时等都会在此可见
    console.warn('[image-proxy] 代理失败', url, errorText(error));
    failed.add(url);
    throw error;
  }
}
