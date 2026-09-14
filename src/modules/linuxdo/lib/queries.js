import { api } from './api.js';

// 最新话题 feed 是公开数据，游客也能看，所以可以在登录前预取。
const LATEST_PATH = '/latest.json';
const LATEST_PERIOD = 'weekly';
const SITE_STALE_TIME = 5 * 60_000;

// 预取与页面必须共用同一个键，否则命中不了缓存。
export function topicsQueryKey({ path, period, username }) {
  return ['topics', path, period, username];
}

export function topicsNextPageParam(lastPage, pages) {
  return lastPage?.topic_list?.more_topics_url && lastPage?.topic_list?.topics?.length ? pages.length : undefined;
}

export function latestTopicsQuery(username) {
  return {
    queryKey: topicsQueryKey({ path: LATEST_PATH, period: LATEST_PERIOD, username }),
    queryFn: ({ pageParam }) => api.get(LATEST_PATH, { page: pageParam || undefined }),
    initialPageParam: 0,
    getNextPageParam: topicsNextPageParam,
  };
}

export function siteQuery() {
  return { queryKey: ['site'], queryFn: () => api.get('/site.json'), staleTime: SITE_STALE_TIME };
}

// 应用启动后在其他页面调用：先触发一次请求，让 Rust 侧提前创建并加载 site-session 窗口，
// 同时把首屏要用的数据放进 react-query 缓存。任何失败都不应影响正在浏览的页面。
export async function preloadForum(queries, username) {
  const [site, topics] = await Promise.allSettled([
    queries.prefetchQuery(siteQuery()),
    queries.prefetchInfiniteQuery(latestTopicsQuery(username)),
  ]);
  return { site, topics };
}
