import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, Bell, Bookmark, Check, Copy, ExternalLink, Eye, Lock, MessageSquare, RefreshCw, Reply } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp, useSite } from '../context/AppContext';
import { api, errorText, topicPath } from '../lib/api';
import { mergePosts } from '../lib/posts';
import { useReadingProgress } from '../lib/useReadingProgress';
import { number } from '../lib/format';
import { CategoryBadge, Empty, ErrorState, Loading } from '../components/Common';
import Composer from '../components/Composer';
import Dialog from '../components/Dialog';
import BookmarkDialog from '../components/BookmarkDialog';
import Post from '../components/Post';
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
  const [extra, setExtra] = useState([]);
  const [composer, setComposer] = useState(null);
  const [bookmarkOpen, setBookmarkOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [headings, setHeadings] = useState([]);
  const [activeHeading, setActiveHeading] = useState('');
  const [jump, setJump] = useState(postNumber || '1');
  const anchored = useRef('');
  const query = useQuery({
    queryKey: ['topic', topicId, postNumber || '1'],
    queryFn: () => api.get('/t/' + topicId + (postNumber ? '/' + postNumber : '') + '.json'),
  });
  const topic = query.data;
  const posts = useMemo(() => mergePosts(topic?.post_stream?.posts || [], extra), [topic, extra]);
  useEffect(() => { setExtra([]); setComposer(null); setHeadings([]); setActiveHeading(''); setJump(postNumber || '1'); anchored.current = ''; }, [topicId, postNumber]);
  useEffect(() => {
    const key = topicId + ':' + postNumber;
    if (postNumber && posts.some(post => post.post_number === Number(postNumber)) && anchored.current !== key) {
      anchored.current = key;
      requestAnimationFrame(() => document.getElementById('post-' + postNumber)?.scrollIntoView({ block: 'start' }));
    }
  }, [topicId, postNumber, posts]);
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
  }, [topicId, posts]);
  const reading = useReadingProgress(topic, posts, user, settings.recordHistory !== false);
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
  const refresh = async () => { setExtra([]); await query.refetch(); };
  const reply = () => user ? setComposer({ kind: 'reply', topicId: topic.id }) : requestLogin();
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
    <header className="topic-heading"><div className="topic-meta"><CategoryBadge category={categories[topic.category_id]} />{(topic.tags || []).map(tag => { const name = typeof tag === 'string' ? tag : tag?.name; return name ? <Link className="tag" key={tag?.id || name} to={'/tag/' + encodeURIComponent(name)}>#{name}</Link> : null; })}{topic.archetype === 'private_message' && <span className="tag">私信</span>}</div><h1>{topic.title}</h1><div className="topic-overview"><span><MessageSquare size={15} />{number(topic.posts_count)} 楼</span><span><Eye size={15} />{number(topic.views)} 次浏览</span>{topic.closed && <span><Lock size={15} />话题已关闭</span>}<button className="button text small" onClick={refresh} disabled={query.isFetching}><RefreshCw size={14} className={query.isFetching ? 'spin' : ''} />刷新</button></div></header>
    {previousIds.length > 0 && <button className="button secondary load-posts" disabled={more.isPending} onClick={() => more.mutate(previousIds)}><ArrowUp size={16} />加载前面的楼层</button>}
    <div className="post-stream">{posts.map(post => <Post key={post.id} post={post} topic={topic} onCompose={setComposer} onChanged={() => {
      if (extra.length) api.get('/t/' + topicId + '/posts.json', { post_ids: extra.map(item => item.id) }).then(data => setExtra(data.post_stream?.posts || data.posts || [])).catch(error => notify(errorText(error)));
    }} />)}</div>
    {nextIds.length > 0 && <button className="button secondary load-posts" disabled={more.isPending} onClick={() => more.mutate(nextIds)}><ArrowDown size={16} />{more.isPending ? '正在加载…' : '加载更多楼层'}</button>}
    {!posts.length && <Empty title="暂时没有可显示的帖子" />}
    <div className="topic-bottom-actions">{!topic.closed && topic.details?.can_create_post !== false && <button className="button primary" onClick={reply}><Reply size={17} />回复话题</button>}<a className="button secondary" href={'https://linux.do/t/' + topic.id} target="_blank" rel="noreferrer"><ExternalLink size={16} />在浏览器中打开</a></div>
    {topic.suggested_topics?.length > 0 && <section className="suggested-topics"><h2>继续阅读</h2>{topic.suggested_topics.map(item => <TopicRow key={item.id} topic={item} categories={categories} />)}</section>}
  </section><aside className="reading-rail"><div className="reading-position"><span className="eyebrow">阅读进度</span><strong>{reading.currentPost}<small> / {topic.highest_post_number || topic.posts_count}</small></strong><div className="reading-track"><i style={{ height: `${reading.progress}%` }} /></div><form onSubmit={event => { event.preventDefault(); navigate(topicPath(topic.id, Math.max(1, Math.min(Number(jump) || 1, topic.highest_post_number || topic.posts_count)))); }}><label htmlFor="jump-post">跳转到楼层</label><div className="jump-input"><input id="jump-post" type="number" min="1" max={topic.highest_post_number || topic.posts_count} value={jump} onChange={event => setJump(event.target.value)} /><button className="icon-button" type="submit" aria-label="跳转"><ArrowDown size={16} /></button></div></form><div className="reading-jumps"><Link to={topicPath(topic.id, 1)}>首楼</Link><Link to={topicPath(topic.id, topic.highest_post_number || topic.posts_count)}>末楼</Link></div><div className="topic-quick-actions" aria-label="话题快捷操作"><span className="eyebrow">快捷操作</span><button className="quick-action" type="button" onClick={() => navigate('/')}><ArrowLeft size={16} /><span>返回话题列表</span></button><button className={'quick-action ' + (topicBookmark ? 'selected' : '')} type="button" disabled={!firstPost} onClick={() => user ? setBookmarkOpen(true) : requestLogin()}><Bookmark size={16} fill={topicBookmark ? 'currentColor' : 'none'} /><span>{topicBookmark ? '编辑收藏' : '收藏话题'}</span></button><button className="quick-action" type="button" onClick={copyTopicLink}>{copied ? <Check size={16} /> : <Copy size={16} />}<span>{copied ? '已复制链接' : '复制话题链接'}</span></button><button className="quick-action" type="button" onClick={reply}><Reply size={16} /><span>回复话题</span></button></div>{user && <label className="topic-notifications"><Bell size={16} /><span>通知</span><select aria-label="话题通知级别" value={topic.details?.notification_level ?? 1} onChange={event => update.mutate(event.target.value)} disabled={update.isPending}>{[[3, '关注每条回复'], [2, '追踪话题'], [1, '常规通知'], [0, '静音话题']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}<TopicToc headings={headings} activeId={activeHeading} onSelect={selectHeading} /></div></aside>
    {bookmarkOpen && <BookmarkDialog postId={firstPost.id} bookmark={topicBookmark} onClose={() => setBookmarkOpen(false)} onSaved={() => query.refetch()} />}
    {composer && <Dialog title={composer.kind === 'edit' ? '编辑帖子' : '回复 ' + (composer.replyTo ? '#' + composer.replyTo : topic.title)} wide onClose={() => setComposer(null)}><Composer key={composeId} draftId={composeId} initial={composer} onCancel={() => setComposer(null)} onSubmitted={result => { setComposer(null); if (result.queued) return; setExtra([]); navigate(topicPath(topic.id, result.post.post_number)); query.refetch(); }} /></Dialog>}
  </div>;
}
