import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Link } from '../lib/router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowUpRight, RefreshCw, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../context/AppContext';
import { api } from '../lib/api';
import { topicsNextPageParam, topicsQueryKey } from '../lib/queries';
import { Empty, ErrorState, Loading, LoadMore, PageHeading } from '../components/Common';
import TopicRow from '../components/TopicRow';

const feeds = { latest: ['最新话题', '看看社区里正在发生什么'], hot: ['热门讨论', '正在引发共鸣的话题'], top: ['精华排行', '值得停下来，认真读一读'], new: ['新话题', '发现你还没见过的内容'], unread: ['未读话题', '接着上一次的对话'], 'my-topics': ['我的话题', '你的每一次分享，都留在这里'] };

export default function TopicsPage({ feed = 'latest' }) {
  const { categoryId, tag } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, requestLogin } = useAuth();
  const site = useSite();
  const categories = Object.fromEntries((site.data?.categories || []).map(category => [category.id, category]));
  const category = categories[categoryId];
  const filter = searchParams.get('filter') || feed;
  const period = searchParams.get('period') || 'weekly';
  const privateFeed = ['new', 'unread', 'my-topics'].includes(feed);
  let path = `/${filter}.json`;
  if (category) {
    const parent = categories[category.parent_category_id];
    path = `/c/${parent ? `${encodeURIComponent(parent.slug)}/` : ''}${encodeURIComponent(category.slug)}/${category.id}/l/${filter}.json`;
  } else if (tag) path = `/tag/${encodeURIComponent(tag)}/l/${filter}.json`;
  else if (feed === 'my-topics' && user) path = `/topics/created-by/${encodeURIComponent(user.username)}.json`;
  const query = useInfiniteQuery({
    queryKey: topicsQueryKey({ path, period, username: user?.username }), initialPageParam: 0,
    enabled: (!categoryId || Boolean(category)) && (!privateFeed || Boolean(user)),
    queryFn: ({ pageParam }) => api.get(path, { page: pageParam || undefined, period: filter === 'top' ? period : undefined }),
    getNextPageParam: topicsNextPageParam,
  });
  const pages = query.data?.pages || [];
  const users = Object.fromEntries(pages.flatMap(page => page.users || []).map(value => [value.id, value]));
  const topics = [...new Map(pages.flatMap(page => page.topic_list?.topics || []).map(topic => [topic.id, topic])).values()];
  const [title, description] = category ? [category.name, category.description_text] : tag ? [`#${tag}`, '围绕同一个兴趣，遇见新的观点'] : feeds[feed] || feeds.latest;
  const changeFilter = value => setSearchParams({ filter: value });

  return <div className="community-layout"><section className="community-feed">
    <PageHeading eyebrow="COMMUNITY" title={title} description={description} actions={<button className="icon-button" title="刷新话题" aria-label="刷新话题" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw size={18} className={query.isFetching ? 'spin' : ''} /></button>} />
    <div className="feed-toolbar"><div className="tabs" aria-label="话题筛选">{categoryId || tag ? [['latest', '最新'], ['hot', '热门'], ['top', '精华']].map(([value, label]) => <button className={filter === value ? 'active' : ''} key={value} onClick={() => changeFilter(value)}>{label}</button>) : <><Link to="/" className={feed === 'latest' ? 'active' : ''}>最新</Link><Link to="/new" className={feed === 'new' ? 'active' : ''}>新话题</Link><Link to="/unread" className={feed === 'unread' ? 'active' : ''}>未读</Link><Link to="/hot" className={feed === 'hot' ? 'active' : ''}>热门</Link></>}</div>{filter === 'top' && <select aria-label="排行时间范围" value={period} onChange={event => setSearchParams({ ...Object.fromEntries(searchParams), period: event.target.value })}>{[['daily', '今天'], ['weekly', '本周'], ['monthly', '本月'], ['yearly', '今年'], ['all', '全部时间']].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>}</div>
    {privateFeed && !user ? <Empty title="登录后查看你的话题"><button className="button primary" onClick={requestLogin}>浏览器登录</button></Empty> : categoryId && site.isError ? <ErrorState error={site.error} retry={site.refetch} /> : categoryId && site.isSuccess && !category ? <Empty title="分类不存在或暂时无法访问" /> : query.isPending ? <Loading /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : <><div className="topic-list">{topics.map(topic => <TopicRow key={topic.id} topic={topic} users={users} categories={categories} />)}</div>{!topics.length && <Empty title="暂时没有话题" description="换个筛选条件，或稍后再回来看看。" />}<LoadMore query={query} /></>}
  </section><aside className="community-aside"><div className="welcome-note"><Sparkles size={23} /><h2>让有价值的对话<br />继续发生。</h2><p>真诚、友善、团结、专业。<br />从一个问题开始，分享你的发现。</p><Link to="/compose" className="text-link">写下你的想法<ArrowUpRight size={16} /></Link></div><section className="aside-section"><h3>探索分类<Link to="/categories">全部<Chevron /></Link></h3>{(site.data?.categories || []).filter(item => !item.parent_category_id).slice(0, 8).map(item => <Link to={`/category/${item.id}`} key={item.id} className="aside-category"><span>{item.name}</span><small>{item.topic_count?.toLocaleString('zh-CN')}</small></Link>)}</section>{site.data?.top_tags?.length > 0 && <section className="aside-section"><h3>热门标签</h3><div className="tag-cloud">{site.data.top_tags.slice(0, 12).map(item => { const value = typeof item === 'string' ? item : item.name; return <Link key={value} to={`/tag/${encodeURIComponent(value)}`}>#{value}</Link>; })}</div></section>}<p className="aside-footer">FluxDO · 为好奇而相聚</p></aside></div>;
}

function Chevron() { return <ArrowUpRight size={13} />; }
