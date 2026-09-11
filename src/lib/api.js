import { invoke } from '@tauri-apps/api/core';

export function pathWithQuery(path, params = {}) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) value.forEach(item => query.append(`${name}[]`, String(item)));
    else query.set(name, String(value));
  }
  return query.size ? `${path}?${query}` : path;
}

export const api = {
  get: (path, params) => invoke('discourse_request', { path: pathWithQuery(path, params), method: 'GET', body: null }),
  post: (path, body) => invoke('discourse_request', { path, method: 'POST', body: body ?? null }),
  put: (path, body) => invoke('discourse_request', { path, method: 'PUT', body: body ?? null }),
  delete: (path, params) => invoke('discourse_request', { path: pathWithQuery(path, params), method: 'DELETE', body: null }),
};

export function uploadFile(file) {
  if (file.size > 30 * 1024 * 1024) return Promise.reject(new Error('单个附件不能超过 30 MB'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取附件失败'));
    reader.onload = () => resolve(invoke('upload_file', {
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      data: String(reader.result).split(',')[1],
    }));
    reader.readAsDataURL(file);
  });
}

export function errorText(error) {
  if (typeof error === 'string') return error;
  return error?.message || '操作失败，请稍后重试';
}

export function topicPath(id, postNumber) {
  return `/topic/${id}${postNumber ? `/${postNumber}` : ''}`;
}

export function internalPath(href) {
  let url;
  try { url = new URL(href, 'https://linux.do'); } catch { return null; }
  if (url.origin !== 'https://linux.do') return null;
  const topic = url.pathname.match(/^\/t\/(\d+)(?:\/(\d+))?\/?$/)
    || url.pathname.match(/^\/t\/[^/]+\/(\d+)(?:\/(\d+))?\/?$/);
  if (topic) return topicPath(topic[1], topic[2]);
  const user = url.pathname.match(/^\/u\/([^/]+)\/?$/);
  if (user) return `/user/${encodeURIComponent(decodeURIComponent(user[1]))}`;
  return null;
}
