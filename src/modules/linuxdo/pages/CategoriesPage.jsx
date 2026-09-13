import React, { useState } from 'react';
import { Link } from '../lib/router';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Hash, Search } from 'lucide-react';
import { useSite } from '../context/AppContext';
import { api } from '../lib/api';
import { number } from '../lib/format';
import { Empty, ErrorState, Loading, PageHeading } from '../components/Common';

export default function CategoriesPage() {
  const site = useSite();
  const [tab, setTab] = useState('categories');
  const [filter, setFilter] = useState('');
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api.get('/tags.json'), enabled: tab === 'tags', staleTime: 300000 });
  const query = tab === 'tags' ? tags : site;
  const categories = (site.data?.categories || []).filter(category => category.name.toLowerCase().includes(filter.toLowerCase()));
  const tagGroups = [...(tags.data?.extras?.tag_groups || []), { name: '标签', tags: tags.data?.tags || [] }];
  return <><PageHeading eyebrow="EXPLORE" title="找到你的兴趣所在" description="在分类与标签之间，发现值得加入的对话。" /><div className="feed-toolbar"><div className="tabs"><button className={tab === 'categories' ? 'active' : ''} onClick={() => setTab('categories')}>全部分类</button><button className={tab === 'tags' ? 'active' : ''} onClick={() => setTab('tags')}>全部标签</button></div><label className="inline-search"><Search size={16} /><input aria-label="筛选分类或标签" placeholder="快速筛选…" value={filter} onChange={event => setFilter(event.target.value)} /></label></div>{query.isPending ? <Loading /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : tab === 'categories' ? <div className="category-grid">{categories.map(category => <Link to={`/category/${category.id}`} key={category.id} className="category-card"><span className="category-card-mark" style={{ '--category-color': /^[0-9a-f]{6}$/i.test(category.color || '') ? `#${category.color}` : 'var(--accent)' }}><Hash size={23} /></span><div><h2>{category.name}</h2><p>{category.description_text || '打开分类，看看大家正在聊什么。'}</p><span>{number(category.topic_count)} 个话题</span></div><ArrowUpRight className="card-arrow" size={17} /></Link>)}{!categories.length && <Empty title="没有匹配的分类" />}</div> : <div className="panel tag-directory">{tagGroups.map((group, index) => { const matching = group.tags.filter(tag => tag.name.toLowerCase().includes(filter.toLowerCase())); return matching.length ? <section key={`${group.name}-${index}`}><h2>{group.name}</h2><div className="tag-cloud">{matching.map(tag => <Link key={tag.id || tag.name} to={`/tag/${encodeURIComponent(tag.name)}`}>#{tag.name}<small>{number(tag.count)}</small></Link>)}</div></section> : null; })}</div>}</>;
}
