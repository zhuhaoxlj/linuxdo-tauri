import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { buildContextChain, parseNestedChildren, parseNestedContext, parseNestedRoots } from './nestedPosts';

// 树状视图数据。target 为楼层号（>1）时拉取 context 定位（祖先链 + 目标子树），
// 否则拉取根帖子列表（page 递增分页）。对应 FluxDO nested_topic_provider.dart。
export function useNestedTopic(topicId, target, sort = 'old', enabled = true) {
  const contextMode = Boolean(target && target > 1);
  const query = useQuery({
    queryKey: ['nested-topic', String(topicId), contextMode ? target : 'root', sort],
    queryFn: () => (contextMode
      ? api.get(`/n/topic/${topicId}/context/${target}.json`, { sort, track_visit: true }).then(parseNestedContext)
      : api.get(`/n/topic/${topicId}.json`, { sort, page: 0, track_visit: true }).then(parseNestedRoots)),
    enabled,
    retry: false,
  });
  const [appended, setAppended] = useState([]);
  const [more, setMore] = useState({ page: 0, hasMore: null, loading: false });
  useEffect(() => { setAppended([]); setMore({ page: 0, hasMore: null, loading: false }); }, [topicId, contextMode, target, sort]);
  const loadMoreRoots = async () => {
    const data = query.data;
    if (!enabled || contextMode || !data || more.loading) return;
    if (!(more.hasMore === null ? data.hasMoreRoots : more.hasMore)) return;
    setMore(current => ({ ...current, loading: true }));
    try {
      const page = (more.hasMore === null ? data.page : more.page) + 1;
      const next = parseNestedRoots(await api.get(`/n/topic/${topicId}.json`, { sort, page }));
      setAppended(current => [...current, ...next.roots]);
      setMore({ page, hasMore: next.hasMoreRoots, loading: false });
    } catch {
      setMore(current => ({ ...current, loading: false }));
    }
  };
  return {
    query,
    contextMode,
    opPost: query.data?.opPost || null,
    roots: query.data && !contextMode ? [...query.data.roots, ...appended] : [],
    contextChain: query.data && contextMode ? buildContextChain(query.data) : null,
    ancestorsTruncated: Boolean(query.data?.ancestorsTruncated),
    topAncestorPostNumber: query.data?.topAncestorPostNumber || null,
    hasMoreRoots: !contextMode && (more.hasMore === null ? Boolean(query.data?.hasMoreRoots) : more.hasMore),
    loadingMore: more.loading,
    loadMoreRoots,
  };
}

// 懒加载某楼层的子回复（分页），供树卡片展开时调用
export async function fetchNestedChildren(topicId, postNumber, { sort = 'old', page = 0, depth = 1 } = {}) {
  return parseNestedChildren(await api.get(`/n/topic/${topicId}/children/${postNumber}.json`, { sort, page, depth }));
}
