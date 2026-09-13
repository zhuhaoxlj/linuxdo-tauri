import React, { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import Login from './components/Login';
import Shell from './components/Shell';

// 优化后的加载组件
function Loading({ label = '加载中...' }) {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-gray-600">{label}</p>
      </div>
    </div>
  );
}

// 懒加载页面组件
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

function LinuxDoRoutes() {
  const { user, checking, guest, error, login, browse } = useAuth();
  
  // 认证检查中
  if (checking) {
    return <Loading label="正在恢复登录..." />;
  }
  
  // 未登录且非游客
  if (!user && !guest) {
    return <Login onLoginSuccess={login} onBrowse={browse} sessionError={error} />;
  }
  
  return (
    <Suspense fallback={<Loading label="加载页面..." />}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<TopicsPage />} />
          {['hot', 'top', 'new', 'unread', 'my-topics'].map(feed => (
            <Route key={feed} path={feed} element={<TopicsPage feed={feed} />} />
          ))}
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
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function LinuxDoModule() {
  return (
    <AppProvider>
      <AuthProvider>
        <LinuxDoRoutes />
      </AuthProvider>
    </AppProvider>
  );
}
