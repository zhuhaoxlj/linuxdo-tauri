import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link, useNavigate } from '../lib/router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, Bell, Bookmark, Check, Copy, ExternalLink, Eye, Filter, ListTree, Lock, MessageSquare, RefreshCw, Reply } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp, useSite } from '../context/AppContext';
import { api, errorText, topicPath } from '../lib/api';
import { mergePosts, topicFilterParams } from '../lib/posts';
import { useReadingProgress } from '../lib/useReadingProgress';
import { useNestedTopic } from '../lib/useNestedTopic';
import { buildProvisionalTree } from '../lib/nestedPosts';
import { number } from '../lib/format';
import { CategoryBadge, Empty, ErrorState, Loading } from '../components/Common';
import Composer from '../components/Composer';
import Dialog from '../components/Dialog';
import BookmarkDialog from '../components/BookmarkDialog';
import Post from '../components/Post';
import NestedPostList from '../components/NestedPostList';
import TopicRow from '../components/TopicRow';

function TopicToc({ headings, activeId, onSelect }) {
  if (!headings.length) return null;
  return <nav className="topic-toc" aria-label="话题目录"><span className="eyebrow">内容目录</span><div className="topic-toc-list">{headings.map(heading => <button key={heading.id} className={activeId === heading.id ? 'active' : ''} type="button" onClick={() => onSelect(heading.id)} style={{ paddingLeft: `${8 + (heading.level - 1) * 8}px` }}>{heading.text}</button>)}</div></nav>;
}

export default function TopicPage() {
  const { topicId, postNumber } = useParams();
  const { user, requestLogin } = useAuth();
  const { notify, settings } = useApp();
  const site = useSite();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const [extra, setExtra] = useState([]);
  const [composer, setComposer] = useState(null);
  const [bookmarkOpen, setBookmarkOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [headings, setHeadings] = useState([]);
  const [activeHeading, setActiveHeading] = useState('');
  const [jump, setJump] = useState(postNumber || '1');
  // 按设置里的默认值起步，进入话题直接渲染树状视图，避免先闪一帧平铺列表
  const [nestedView, setNestedView] = useState(() => settings.nestedView === true);
  const [nestedAuto, setNestedAuto] = useState(false);
  const [nestedSort, setNestedSort] = useState('old');
  const [nestedPosts, setNestedPosts] = useState([]);
  const [relocateToken, setRelocateToken] = useState(0);
  const [filter, setFilter] = useState('');
  const appliedNested = useRef('');
  const anchored = useRef('');
  const query = useQuery({
    queryKey: ['topic', topicId, postNumber || '1', filter],
    // 只看楼主的用户名取自已缓存的全量话题数据（切筛选时页面已渲染，缓存必在）；
    // 不能在渲染期读 topic——它在 query 声明之后才初始化
    queryFn: () => {
      const cached = queries.getQueryData(['topic', topicId, postNumber || '1', '']);
      return api.get('/t/' + topicId + (postNumber ? '/' + postNumber : '') + '.json', topicFilterParams(filter, cached?.details?.created_by?.username || ''));
    },
  });
  const topic = query.data;
  const posts = useMemo(() => mergePosts(topic?.post_stream?.posts || [], extra), [topic, extra]);
  const isPrivateMessage = topic?.archetype === 'private_message';
  const targetNumber = Math.max(1, Number(postNumber) || 1);
  // 树状视图数据：带楼层进入（>1 楼）时走 context 定位视图，否则拉取根回复列表。
  // 不等待话题接口，进入页面即与话题数据并行加载。
  const nested = useNestedTopic(topicId, nestedView && targetNumber > 1 ? targetNumber : null, nestedSort, nestedView);
  useEffect(() => { setExtra([]); setComposer(null); setHeadings([]); setActiveHeading(''); setJump(postNumber || '1'); setNestedPosts([]); setFilter(''); anchored.current = ''; }, [topicId, postNumber]);
  // 每个话题首次加载后应用“默认使用树形视图”设置（私信不支持，强制平铺）
  useEffect(() => {
    if (!topic?.id || appliedNested.current === String(topic.id)) return;
    appliedNested.current = String(topic.id);
    const enabled = settings.nestedView === true && topic.archetype !== 'private_message';
    setNestedAuto(enabled);
    setNestedView(enabled);
  }, [topic?.id, topic?.archetype, settings.nestedView]);
  // 树状数据加载失败时回落平铺视图（对应 FluxDO nested_fallbackToFlat）；私信的白请求静默回落
  useEffect(() => {
    if (!nestedView || !nested.query.isError) return;
    setNestedView(false);
    if (!isPrivateMessage) notify('树状视图加载失败，已切换为平铺视图');
  }, [nestedView, nested.query.isError, isPrivateMessage]);
  useEffect(() => {
    const key = topicId + ':' + postNumber;
    if (!postNumber || anchored.current === key) return;
    if (nestedView) {
      // 树模式下 1 楼滚到 OP，其余楼层由 context 定位视图负责滚动
      if (Number(postNumber) !== 1 || !nested.opPost) return;
    } else if (!posts.some(post => post.post_number === Number(postNumber))) return;
    anchored.current = key;
    requestAnimationFrame(() => document.getElementById('post-' + postNumber)?.scrollIntoView({ block: 'start' }));
  }, [topicId, postNumber, posts, nestedView, nested.opPost]);
  const nestedIdentity = nestedPosts.map(post => post.id).join(',');
  useEffect(() => {
    const root = document.querySelector('.topic-detail');
    if (!root) return undefined;
    const nodes = [...root.querySelectorAll('.forum-post .cooked h1, .forum-post .cooked h2, .forum-post .cooked h3')];
    const next = nodes.map((node, index) => {
      const id = `topic-heading-${topicId}-${index}`;
      node.id = id;
      return { id, text: node.textContent.trim(), level: Number(node.tagName.slice(1)) };
    }).filter(heading => heading.text);
    setHeadings(next);
    setActiveHeading(next[0]?.id || '');
    if (!next.length) return undefined;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
      if (visible[0]) setActiveHeading(visible[0].target.id);
    }, { root: document.querySelector('.main-scroll'), rootMargin: '-12% 0px -70% 0px', threshold: [0, 1] });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [topicId, posts, nestedIdentity]);
  const reading = useReadingProgress(topic, nestedView ? nestedPosts : posts, user, settings.recordHistory !== false);
  // nested 返回前用平铺帖子流在前端建临时树先渲染，返回后无缝替换（结构一致、折叠状态保留）
  const provisionalRoots = useMemo(() => (nestedView ? buildProvisionalTree(posts) : []), [posts, nestedView]);
  const more = useMutation({
    mutationFn: ids => api.get('/t/' + topicId + '/posts.json', { post_ids: ids, include_suggested: true }),
    onSuccess: data => setExtra(previous => mergePosts(previous, data.post_stream?.posts || data.posts || [])),
    onError: error => notify(errorText(error)),
  });
  const update = useMutation({
    mutationFn: value => api.post('/t/' + topicId + '/notifications', { notification_level: Number(value) }),
    onSuccess: () => { query.refetch(); notify('话题通知设置已更新'); },
    onError: error => notify(errorText(error)),
  });
  if (query.isPending) return <Loading label="正在加载话题…" />;
  if (query.isError) return <ErrorState error={query.error} retry={query.refetch} />;
  if (!topic?.id) return <Empty title="话题不存在或无权访问" />;
  const categories = Object.fromEntries((site.data?.categories || []).map(category => [category.id, category]));
  const stream = topic.post_stream?.stream || [];
  const loaded = new Set(posts.map(post => post.id));
  const firstIndex = posts.length ? stream.indexOf(posts[0].id) : 0;
  const previousIds = stream.slice(Math.max(0, firstIndex - 20), firstIndex).filter(id => !loaded.has(id));
  const nextIds = stream.slice(Math.max(0, firstIndex)).filter(id => !loaded.has(id)).slice(0, 20);
  const invalidateNested = () => queries.invalidateQueries({ queryKey: ['nested-topic', String(topic.id)] });
  const refresh = async () => { setExtra([]); if (nestedView) invalidateNested(); await query.refetch(); };
  const reply = () => user ? setComposer({ kind: 'reply', topicId: topic.id }) : requestLogin();
  const treeReady = nested.query.isSuccess;
  const treeNested = treeReady ? nested : { ...nested, contextMode: targetNumber > 1, opPost: posts.find(post => post.post_number === 1) || null, roots: provisionalRoots, contextChain: null, hasMoreRoots: false, loadingMore: false };
  // 筛选切换：与树状视图互斥；清掉按 id 补充的帖子避免旧流混入筛选结果
  const changeFilter = value => {
    setFilter(value);
    setExtra([]);
    if (value) setNestedView(false);
  };
  const go = target => {
    const clamped = Math.max(1, Math.min(Number(target) || 1, topic.highest_post_number || topic.posts_count));
    // 筛选模式下跳层先还原完整流（对齐 FluxDO 的筛选回落），目标楼层才可见
    if (filter) setFilter('');
    // 树模式下重复跳转同一楼层时重播定位高亮，而非依赖路由变化
    if (nestedView && clamped === targetNumber) setRelocateToken(token => token + 1);
    else navigate(topicPath(topic.id, clamped));
  };
  const viewFullTopic = () => {
    navigate(topicPath(topic.id));
    requestAnimationFrame(() => document.querySelector('.main-scroll')?.scrollTo({ top: 0, behavior: 'smooth' }));
  };
  const firstPost = posts[0];
  const topicBookmark = firstPost && (topic.bookmarks?.find(item => item.bookmarkable_id === firstPost.id && item.bookmarkable_type === 'Post') || (firstPost.bookmark_id ? { id: firstPost.bookmark_id } : null));
  const copyTopicLink = () => navigator.clipboard.writeText(window.location.href).then(() => {
    setCopied(true);
    notify('话题链接已复制');
    window.setTimeout(() => setCopied(false), 1800);
  }).catch(() => notify('复制失败，请手动复制地址栏链接'));
  const selectHeading = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const composeId = composer?.kind === 'edit' ? 'edit:' + composer.postId : 'reply:' + topic.id + ':' + (composer?.replyTo || 'topic');
  return <div className="topic-layout"><section className="topic-detail">
    <Link className="back-link" to="/"><ArrowLeft size={15} />返回话题列表</Link>
    <header className="topic-heading"><div className="topic-meta"><CategoryBadge category={categories[topic.category_id]} />{(topic.tags || []).map(tag => { const name = typeof tag === 'string' ? tag : tag?.name; return name ? <Link className="tag" key={tag?.id || name} to={'/tag/' + encodeURIComponent(name)}>#{name}</Link> : null; })}{topic.archetype === 'private_message' && <span className="tag">私信</span>}</div><h1>{topic.title}</h1><div className="topic-overview"><span><MessageSquare size={15} />{number(topic.posts_count)} 楼</span><span><Eye size={15} />{number(topic.views)} 次浏览</span>{topic.closed && <span><Lock size={15} />话题已关闭</span>}<label className="topic-filter"><Filter size={14} /><select className={filter ? 'active' : ''} aria-label="内容筛选" value={filter} onChange={event => changeFilter(event.target.value)}><option value="">全部楼层</option>{topic.has_summary && <option value="summary">热门回复</option>}<option value="op">只看楼主</option><option value="top_level">只看顶层回复</option>{topic.is_post_voting && <option value="activity">按活跃度</option>}</select></label><button className={'button text small' + (nestedView ? ' toggle-active' : '')} aria-pressed={nestedView} title={isPrivateMessage ? '私信不支持树状视图' : undefined} disabled={isPrivateMessage} onClick={() => { setNestedAuto(false); setNestedSort('old'); setFilter(''); setNestedView(view => !view); }}><ListTree size={14} />树状视图</button><button className="button text small" onClick={refresh} disabled={query.isFetching}><RefreshCw size={14} className={query.isFetching ? 'spin' : ''} />刷新</button></div></header>
    {!nestedView && previousIds.length > 0 && <button className="button secondary load-posts" disabled={more.isPending} onClick={() => more.mutate(previousIds)}><ArrowUp size={16} />加载前面的楼层</button>}
    {nestedView ? (nested.query.isPending && !provisionalRoots.length ? <Loading label="正在加载树状视图…" /> : nested.query.isError ? null : <NestedPostList topic={topic} nested={treeNested} sort={nestedSort} onSortChange={setNestedSort} onCompose={setComposer} highlightPostNumber={treeNested.contextMode ? targetNumber : null} relocateToken={relocateToken} onVisiblePosts={setNestedPosts} onViewFullTopic={viewFullTopic} onViewParentContext={target => navigate(topicPath(topic.id, target))} lineStyle={settings.nestedLineStyle || 'auto'} onChanged={() => {
      invalidateNested();
      if (extra.length) api.get('/t/' + topicId + '/posts.json', { post_ids: extra.map(item => item.id) }).then(data => setExtra(data.post_stream?.posts || data.posts || [])).catch(error => notify(errorText(error)));
    }} />)
      : <div className="post-stream">{posts.map(post => <Post key={post.id} post={post} topic={topic} onCompose={setComposer} onChanged={() => {
        invalidateNested();
        if (extra.length) api.get('/t/' + topicId + '/posts.json', { post_ids: extra.map(item => item.id) }).then(data => setExtra(data.post_stream?.posts || data.posts || [])).catch(error => notify(errorText(error)));
      }} />)}</div>}
    {!nestedView && nextIds.length > 0 && <button className="button secondary load-posts" disabled={more.isPending} onClick={() => more.mutate(nextIds)}><ArrowDown size={16} />{more.isPending ? '正在加载…' : '加载更多楼层'}</button>}
    {!nestedView && !posts.length && <Empty title="暂时没有可显示的帖子" />}
    <div className="topic-bottom-actions">{!topic.closed && topic.details?.can_create_post !== false && <button className="button primary" onClick={reply}><Reply size={17} />回复话题</button>}<a className="button secondary" href={'https://linux.do/t/' + topic.id} target="_blank" rel="noreferrer"><ExternalLink size={16} />在浏览器中打开</a></div>
    {(nestedView ? !nested.contextMode && !nested.hasMoreRoots : true) && topic.suggested_topics?.length > 0 && <section className="suggested-topics"><h2>继续阅读</h2>{topic.suggested_topics.map(item => <TopicRow key={item.id} topic={item} categories={categories} />)}</section>}
  </section><aside className="reading-rail"><div className="reading-position"><span className="eyebrow">阅读进度</span><strong>{reading.currentPost}<small> / {topic.highest_post_number || topic.posts_count}</small></strong><div className="reading-track"><i style={{ height: `${reading.progress}%` }} /></div><form onSubmit={event => { event.preventDefault(); go(jump); }}><label htmlFor="jump-post">跳转到楼层</label><div className="jump-input"><input id="jump-post" type="number" min="1" max={topic.highest_post_number || topic.posts_count} value={jump} onChange={event => setJump(event.target.value)} /><button className="icon-button" type="submit" aria-label="跳转"><ArrowDown size={16} /></button></div></form><div className="reading-jumps"><button type="button" onClick={() => go(1)}>首楼</button><button type="button" onClick={() => go(topic.highest_post_number || topic.posts_count)}>末楼</button></div><div className="topic-quick-actions" aria-label="话题快捷操作"><span className="eyebrow">快捷操作</span><button className="quick-action" type="button" onClick={() => navigate('/')}><ArrowLeft size={16} /><span>返回话题列表</span></button><button className={'quick-action ' + (topicBookmark ? 'selected' : '')} type="button" disabled={!firstPost} onClick={() => user ? setBookmarkOpen(true) : requestLogin()}><Bookmark size={16} fill={topicBookmark ? 'currentColor' : 'none'} /><span>{topicBookmark ? '编辑收藏' : '收藏话题'}</span></button><button className="quick-action" type="button" onClick={copyTopicLink}>{copied ? <Check size={16} /> : <Copy size={16} />}<span>{copied ? '已复制链接' : '复制话题链接'}</span></button><button className="quick-action" type="button" onClick={reply}><Reply size={16} /><span>回复话题</span></button></div>{user && <label className="topic-notifications"><Bell size={16} /><span>通知</span><select aria-label="话题通知级别" value={topic.details?.notification_level ?? 1} onChange={event => update.mutate(event.target.value)} disabled={update.isPending}>{[[3, '关注每条回复'], [2, '追踪话题'], [1, '常规通知'], [0, '静音话题']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}<TopicToc headings={headings} activeId={activeHeading} onSelect={selectHeading} /></div></aside>
    {bookmarkOpen && <BookmarkDialog postId={firstPost.id} bookmark={topicBookmark} onClose={() => setBookmarkOpen(false)} onSaved={() => query.refetch()} />}
    {composer && <Dialog title={composer.kind === 'edit' ? '编辑帖子' : '回复 ' + (composer.replyTo ? '#' + composer.replyTo : topic.title)} wide onClose={() => setComposer(null)}><Composer key={composeId} draftId={composeId} initial={composer} onCancel={() => setComposer(null)} onSubmitted={result => { setComposer(null); if (result.queued) return; setExtra([]); if (nestedView) invalidateNested(); navigate(topicPath(topic.id, result.post.post_number)); query.refetch(); }} /></Dialog>}
  </div>;
}
