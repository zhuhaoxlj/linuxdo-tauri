let loading;
let initializedWith;

function loadCook() {
  if (window.__fluxdoCook) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/discourse-cook.js';
      script.onload = resolve;
      script.onerror = () => { loading = null; script.remove(); reject(new Error('Markdown 预览组件加载失败')); };
      document.head.append(script);
    });
  }
  return loading;
}

export async function cook(raw, site) {
  await loadCook();
  if (!window.__fluxdoCook.isReady() || initializedWith !== site) {
    window.__fluxdoCook.init(JSON.stringify({
      baseUri: 'https://linux.do', siteSettings: site?.site_settings || {}, site: site || {},
      customEmoji: site?.custom_emoji || {},
      tagNames: (site?.top_tags || []).map(tag => typeof tag === 'string' ? tag : tag.name),
    }));
    initializedWith = site;
  }
  return window.__fluxdoCook.cook(raw);
}
