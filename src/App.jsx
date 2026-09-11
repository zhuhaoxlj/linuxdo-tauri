import React, { lazy, Suspense, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useAuth } from './context/AuthContext';
import { useApp } from './context/AppContext';
import { errorText } from './lib/api';
import Login from './components/Login';
import Shell from './components/Shell';
import { Empty, Loading } from './components/Common';

const TopicsPage = lazy(() => import('./pages/TopicsPage'));
const TopicPage = lazy(() => import('./pages/TopicPage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const ComposePage = lazy(() => import('./pages/ComposePage'));
const BookmarksPage = lazy(() => import('./pages/BookmarksPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const DraftsPage = lazy(() => import('./pages/DraftsPage'));
const PendingPage = lazy(() => import('./pages/PendingPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const UserPage = lazy(() => import('./pages/UserPage'));
const FollowingPage = lazy(() => import('./pages/FollowingPage'));
const BadgesPage = lazy(() => import('./pages/BadgesPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

export default function App() {
  const { user, checking, guest, error, login, browse } = useAuth();
  const { notify } = useApp();
  useEffect(() => {
    const external = event => {
      if (event.defaultPrevented) return;
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.target !== '_blank' || !/^https?:\/\//i.test(anchor.href)) return;
      event.preventDefault();
      openUrl(anchor.href).catch(reason => notify(errorText(reason)));
    };
    document.addEventListener('click', external);
    return () => document.removeEventListener('click', external);
  }, [notify]);
  if (checking) return <Loading label="正在恢复登录…" />;
  if (!user && !guest) return <Login onLoginSuccess={login} onBrowse={browse} sessionError={error} />;
  return <Suspense fallback={<Loading />}><Routes><Route element={<Shell />}>
    <Route index element={<TopicsPage />} />
    {['hot', 'top', 'new', 'unread', 'my-topics'].map(feed => <Route key={feed} path={feed} element={<TopicsPage feed={feed} />} />)}
    <Route path="category/:categoryId" element={<TopicsPage />} />
    <Route path="tag/:tag" element={<TopicsPage />} />
    <Route path="topic/:topicId/:postNumber?" element={<TopicPage />} />
    <Route path="categories" element={<CategoriesPage />} />
    <Route path="search" element={<SearchPage />} />
    <Route path="compose" element={<ComposePage />} />
    <Route path="bookmarks" element={<BookmarksPage />} />
    <Route path="history" element={<HistoryPage />} />
    <Route path="drafts" element={<DraftsPage />} />
    <Route path="pending" element={<PendingPage />} />
    <Route path="notifications" element={<NotificationsPage />} />
    <Route path="messages" element={<MessagesPage />} />
    <Route path="user/:username" element={<UserPage />} />
    <Route path="following" element={<FollowingPage />} />
    <Route path="badges/:badgeId?" element={<BadgesPage />} />
    <Route path="chat/:channelId?" element={<ChatPage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="*" element={<Empty title="找不到这个页面"><a className="button primary" href="#/">回到首页</a></Empty>} />
  </Route></Routes></Suspense>;
}
