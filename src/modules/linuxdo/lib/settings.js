// 应用设置默认值与本地存储迁移。保持纯函数，便于 tests/settings.test.js 直接验证。
// settingsVersion 2：树形视图由「默认关闭」改为「默认开启」，帖子评论默认按回复层级树状渲染。
export const settingsVersion = 2;
export const defaultSettings = { theme: 'system', accent: 'blue', font: 'default', uiFontSize: 14, fontSize: 16, compact: false, showAvatars: true, notifications: true, nestedView: true, nestedLineStyle: 'auto', settingsVersion };

// 合并已保存的设置。旧版本（未记录 settingsVersion）里 nestedView 默认是关闭的，
// 首次升级到 2 时统一改为默认开启；settingsVersion 落盘后，用户自己的开关不再被覆盖。
export function mergeSettings(stored) {
  const saved = stored && typeof stored === 'object' ? stored : {};
  const next = { ...defaultSettings, ...saved, settingsVersion };
  return (Number(saved.settingsVersion) || 1) < settingsVersion ? { ...next, nestedView: true } : next;
}
