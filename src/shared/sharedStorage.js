// 开发版与正式版共享本机数据的客户端。
//
// 背景：WebKitGTK 的 localStorage 按 origin 分区，正式版（npm run tauri build）跑在
// tauri://localhost，`npm run tauri dev` 跑在 http://localhost:1420，于是同一台机器上
// 两个版本各存一份设置、草稿、阅读历史、看板与知识库笔记，互相看不见。
//
// 这里把应用数据目录下的 shared-web-storage.json（Rust 侧 shared_storage.rs 读写，
// 两个版本共用同一个 app_data_dir）当作共享层：
//   * 启动时（渲染前）bootstrapSharedStorage() 把文件里的键值合并进本机 localStorage；
//   * 之后每个键的写入都通过 writeSharedValue() 回写文件。
// 首次运行时文件由先启动的一方用自己的数据播种，正式版启动时如果发现文件是 dev 播种的，
// 会用自己的数据重新播种一次（正式版为主）。被覆盖的旧值会备份到
// <app_data_dir>/shared-web-storage-backups/。
import { invoke } from '@tauri-apps/api/core';

// 需要跨版本同步的 localStorage 键
const SHARED_KEY_PATTERNS = [/^fluxdo:/, /^board-data-v1$/, /^linuxdo-auth$/];

// `npm run tauri dev` 走 Vite 开发服务器（DEV=true），`npm run tauri build` 打包时为 false
export const APP_MODE = import.meta.env?.DEV ? 'dev' : 'build';

export function isSharedKey(key) {
  return typeof key === 'string' && SHARED_KEY_PATTERNS.some(pattern => pattern.test(key));
}

// 在浏览器里直接跑 vite（没有 Tauri 宿主）时退化为纯 localStorage，不报错
function bridgeAvailable() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

export function sharedSnapshot() {
  const entries = {};
  if (typeof localStorage === 'undefined') return entries;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!isSharedKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value !== null) entries[key] = value;
  }
  return entries;
}

// 纯函数：决定启动时如何对齐共享文件与本机数据，导出便于 tests/shared-storage.test.js 覆盖
// 返回 { entries, seededBy, saveFile, applyToLocal, backup }
export function planSharedSync({ file, local = {}, mode = APP_MODE }) {
  const localEntries = { ...local };
  // 还没有共享文件：用本机数据播种，先跑起来的版本决定初始内容
  if (!file?.entries) {
    return { entries: localEntries, seededBy: mode, saveFile: true, applyToLocal: {}, backup: {} };
  }
  const fileEntries = { ...file.entries };
  const backup = {};
  // 文件是 dev 播种的，而这次是正式版启动：以正式版数据为主，重新播种一次
  if (mode === 'build' && file.seededBy === 'dev') {
    for (const [key, value] of Object.entries(fileEntries)) {
      if (key in localEntries && localEntries[key] !== value) backup[key] = value;
    }
    return {
      entries: { ...fileEntries, ...localEntries },
      seededBy: 'build',
      saveFile: true,
      applyToLocal: {},
      backup,
    };
  }
  // 常规：文件为准写入本机；本机独有的键补进文件，避免丢数据
  const applyToLocal = {};
  for (const [key, value] of Object.entries(fileEntries)) {
    if (localEntries[key] === value) continue;
    applyToLocal[key] = value;
    if (key in localEntries) backup[key] = localEntries[key];
  }
  const entries = { ...fileEntries };
  let saveFile = false;
  for (const [key, value] of Object.entries(localEntries)) {
    if (key in fileEntries) continue;
    entries[key] = value;
    saveFile = true;
  }
  return { entries, seededBy: file.seededBy || mode, saveFile, applyToLocal, backup };
}

function applyEntries(entries) {
  for (const [key, value] of Object.entries(entries)) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error('共享数据写入本机失败：', key, error);
    }
  }
}

// 渲染前调用：把共享文件与本机数据对齐
export async function bootstrapSharedStorage() {
  if (!bridgeAvailable()) return;
  try {
    const file = await invoke('shared_storage_load');
    const plan = planSharedSync({ file, local: sharedSnapshot(), mode: APP_MODE });
    if (Object.keys(plan.backup).length) {
      await invoke('shared_storage_backup', { entries: plan.backup, label: APP_MODE });
    }
    if (plan.saveFile) {
      await invoke('shared_storage_save', { storage: { seededBy: plan.seededBy, entries: plan.entries } });
    }
    if (Object.keys(plan.applyToLocal).length) {
      applyEntries(plan.applyToLocal);
      window.dispatchEvent(new CustomEvent('fluxdo:storage'));
    }
    console.info(`[共享存储] ${APP_MODE}：共享 ${Object.keys(plan.entries).length} 个键，更新本机 ${Object.keys(plan.applyToLocal).length} 个`);
  } catch (error) {
    // 共享层失败不能拖垮应用，退化为只用自己的本机数据
    console.error('共享存储初始化失败，继续使用本机数据：', error);
  }
}

// 写入共享文件的键（value 为 null 表示删除）。localStorage 写入失败时抛出，调用方照旧处理
export function writeSharedValue(key, value) {
  if (value === null || value === undefined) {
    localStorage.removeItem(key);
    mirrorEntry(key, null);
    return;
  }
  localStorage.setItem(key, value);
  mirrorEntry(key, value);
}

export const removeSharedValue = key => writeSharedValue(key, null);

const mirrorQueues = new Map();

function enqueueMirror(key, value) {
  const previous = mirrorQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => undefined).then(() => invoke('shared_storage_put', { key, value }));
  mirrorQueues.set(key, current);
  current.finally(() => {
    if (mirrorQueues.get(key) === current) mirrorQueues.delete(key);
  }).catch(() => undefined);
  return current;
}

export async function writeSharedValueConfirmed(key, value) {
  const previous = localStorage.getItem(key);
  localStorage.setItem(key, value);
  if (!isSharedKey(key) || !bridgeAvailable()) return;
  try {
    await enqueueMirror(key, value);
  } catch (error) {
    if (localStorage.getItem(key) === value) {
      if (previous == null) localStorage.removeItem(key);
      else localStorage.setItem(key, previous);
    }
    throw new Error(`共享文件保存失败：${error}`);
  }
}

function mirrorEntry(key, value) {
  if (!isSharedKey(key) || !bridgeAvailable()) return;
  enqueueMirror(key, value).catch(error => {
    console.error('共享存储回写失败：', key, error);
  });
}
