import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Bookmark, ChevronRight, Compass, FilePenLine, Flame, History, LayoutGrid, LogOut, Menu, MessageCircle, MessagesSquare, Plus, Search, Settings, Sparkles, Trophy, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp, useSite } from '../context/AppContext';
import { api, errorText } from '../lib/api';
import { Avatar } from './Common';

const navigation = [
  { label: '发现', items: [['/', '最新话题', Compass], ['/hot', '热门讨论', Flame], ['/top', '精华排行', Sparkles], ['/categories', '分类与标签', LayoutGrid]] },
  { label: '我的空间', items: [['/bookmarks', '我的书签', Bookmark], ['/history', '阅读历史', History], ['/drafts', '草稿箱', FilePenLine], ['/my-topics', '我的话题', MessagesSquare]] },
  { label: '社区', items: [['/notifications', '通知', Bell], ['/messages', '私信', MessageCircle], ['/chat', '聊天', MessagesSquare], ['/following', '关注', Users], ['/badges', '社区徽章', Trophy]] },
];

export default function Shell() {
  const { user, logout, requestLogin } = useAuth();
  const { notify, settings } = useApp();
  const site = useSite();
  const navigate = useNavigate();
  const location = useLocation();
  const search = useRef(null);
  const scroll = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const notifications = useQuery({
    queryKey: ['notifications', 'count'], enabled: Boolean(user) && settings.notifications,
    queryFn: () => api.get('/notifications.json', { limit: 1 }),
    staleTime: 30_000, refetchInterval: 60_000, refetchIntervalInBackground: false,
  });
  const unread = notifications.data?.unread_notifications || notifications.data?.unread_personal_notifications || 0;

  useEffect(() => {
    setOpen(false);
    scroll.current?.scrollTo({ top: 0 });
  }, [location.pathname]);
  useEffect(() => {
    const shortcut = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); search.current?.focus();
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  return <div className={`app-shell ${settings.compact ? 'compact' : ''}`}>
    {open && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <Link className="brand" to="/"><img src="/fluxdo.png" alt="" /><span>Flux<span className="brand-accent">DO</span><small>与好奇心同行</small></span></Link>
      <nav aria-label="主导航" className="sidebar-nav">
        {navigation.map(group => <div className="nav-group" key={group.label}><p>{group.label}</p>{group.items.map(([to, title, Icon]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={19} strokeWidth={1.75} /><span>{title}</span>{to === '/notifications' && unread > 0 && <b className="badge-count">{unread > 99 ? '99+' : unread}</b>}</NavLink>)}</div>)}
        {site.data?.categories?.length > 0 && <div className="nav-group category-nav"><p>常逛的分类<Link to="/categories" aria-label="查看全部分类"><ChevronRight size={16} /></Link></p>{site.data.categories.filter(category => !category.parent_category_id).slice(0, 6).map(category => <NavLink to={`/category/${category.id}`} key={category.id} className="nav-item"><span className="category-dot" style={{ background: /^[0-9a-f]{6}$/i.test(category.color || '') ? `#${category.color}` : 'var(--accent)' }} /><span>{category.name}</span></NavLink>)}</div>}
      </nav>
      <div className="sidebar-bottom"><NavLink className="nav-item" to="/settings"><Settings size={19} strokeWidth={1.75} /><span>设置</span></NavLink><div className="community-caption"><span className="online-dot" />Linux.do 技术社区</div></div>
    </aside>
    <div className="app-main">
      <header className="topbar">
        <button className="icon-button menu-button" aria-label="打开导航" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</button>
        <form className="global-search" onSubmit={event => { event.preventDefault(); if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`); }}><Search size={18} /><input ref={search} aria-label="搜索话题、用户和标签" placeholder="搜索话题、用户和标签…" value={query} onChange={event => setQuery(event.target.value)} /><kbd>Ctrl K</kbd></form>
        <div className="topbar-actions"><button className="button primary compose-shortcut" onClick={() => user ? navigate('/compose') : requestLogin()}><Plus size={17} /><span>发布话题</span></button><Link to="/notifications" className="icon-button" aria-label="通知"><Bell size={20} />{unread > 0 && <i className="notification-dot" />}</Link>{user ? <><Link to={`/user/${encodeURIComponent(user.username)}`} className="current-user" title={user.username}><Avatar user={user} size={33} /><span>{user.username}</span></Link><button className="icon-button" title="退出登录" aria-label="退出登录" onClick={() => logout().catch(error => notify(errorText(error)))}><LogOut size={18} /><span className="sr-only">退出登录</span></button></> : <button className="button secondary" onClick={requestLogin}>登录</button>}</div>
      </header>
      <main className="main-scroll" ref={scroll}><div className="page-container"><Outlet /></div></main>
    </div>
  </div>;
}
