import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from '../lib/router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api, topicPath } from '../lib/api';
import { Avatar, Empty, ErrorState, Loading, LoadMore, PageHeading } from '../components/Common';
import Cooked from '../components/Cooked';

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const term = params.get('q') || '';
  const type = params.get('type') || 'topic';
  const [input, setInput] = useState(term);
  const query = useInfiniteQuery({
    queryKey: ['search', term, type], initialPageParam: 1, enabled: Boolean(term.trim()),
    queryFn: ({ pageParam }) => api.get('/search.json', { q: term, type_filter: type, page: pageParam > 1 ? pageParam : undefined }),
    getNextPageParam: (last, pages) => last.grouped_search_result?.more_full_page_results || last.grouped_search_result?.more_users ? pages.length + 1 : undefined,
  });
  const pages = query.data?.pages || [];
  const topics = Object.fromEntries(pages.flatMap(page => page.topics || []).map(topic => [topic.id, topic]));
  const posts = pages.flatMap(page => page.posts || []);
  return <><PageHeading eyebrow="SEARCH" title="每个问题，都值得被找到" description="支持 Discourse 搜索语法，例如 in:title、@用户名、#分类、before:日期。" /><form className="search-form panel" onSubmit={event => { event.preventDefault(); setParams({ q: input, type }); }}><Search size={23} /><input aria-label="搜索关键字" placeholder="输入想了解的内容…" value={input} onChange={event => setInput(event.target.value)} /><button className="button primary" type="submit">搜索</button></form><div className="tabs section-tabs">{[['topic', '话题'], ['post', '帖子'], ['user', '用户'], ['tag', '标签']].map(([value, label]) => <button className={type === value ? 'active' : ''} key={value} onClick={() => setParams({ q: term, type: value })}>{label}</button>)}</div>{!term ? <Empty title="输入关键字，开始探索" /> : query.isPending ? <Loading label="正在搜索…" /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : <><div className="search-results">{posts.map(post => <article className="search-result panel" key={post.id}><Link className="result-title" to={topicPath(post.topic_id, post.post_number)}>{topics[post.topic_id]?.title || post.topic_title || `话题 #${post.topic_id}`}</Link><Cooked html={post.blurb || post.cooked || ''} className="search-blurb" /><div className="muted">{post.username} · #{post.post_number}</div></article>)}{pages.flatMap(page => page.users || []).map(user => <Link className="user-row panel" to={`/user/${encodeURIComponent(user.username)}`} key={user.id}><Avatar user={user} size={45} /><div><strong>{user.name || user.username}</strong><p>@{user.username}</p></div></Link>)}{pages.flatMap(page => page.tags || []).map(tag => <Link className="tag" key={tag.name || tag} to={`/tag/${encodeURIComponent(tag.name || tag)}`}>#{tag.name || tag}</Link>)}</div>{!posts.length && !pages.some(page => page.users?.length || page.tags?.length) && <Empty title="没有找到匹配的内容" description="试着缩短关键词，或换一种表达方式。" />}<LoadMore query={query} /></>}</>;
}
