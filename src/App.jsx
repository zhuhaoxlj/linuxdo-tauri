import React, { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { openUrl } from '@tauri-apps/plugin-opener';
import { isTauri } from '@tauri-apps/api/core';
import { useQueryClient } from '@tanstack/react-query';
import { BoardProvider } from './modules/board/context/BoardContext';
import AppLayout from './shared/components/AppLayout';
import BoardPage from './modules/board/pages/BoardPage';

const KnowledgePage = lazy(() => import('./modules/knowledge/pages/KnowledgePage'));

// 预加载 LinuxDo 模块
const LinuxDoModule = lazy(() => import('./modules/linuxdo/LinuxDoModule'));

// LinuxDo 加载占位组件
function LinuxDoLoading() {
  return (
    <div className="flex items-center justify-center h-full bg-gray-50">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-gray-600">加载 LinuxDo 模块...</p>
      </div>
    </div>
  );
}

// 用户停留在看板或知识库时，就把论坛预热好：首次请求需要 Rust 侧创建并加载
// site-session 窗口，这段开销提前做掉，进入论坛时直接命中预取的数据。
const WARMUP_DELAY = 800;

export default function App() {
  const queries = useQueryClient();

  // 处理外部链接
  useEffect(() => {
    const external = event => {
      if (!isTauri()) return;
      if (event.defaultPrevented) return;
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.target !== '_blank' || !/^https?:\/\//i.test(anchor.href)) return;
      event.preventDefault();
      openUrl(anchor.href).catch(console.error);
    };
    document.addEventListener('click', external);
    return () => document.removeEventListener('click', external);
  }, []);

  // 预加载 LinuxDo 模块并预取首屏数据（应用启动后延迟执行，避免影响首屏渲染）
  useEffect(() => {
    if (!isTauri()) return undefined;
    const timer = setTimeout(() => {
      Promise.all([
        import('./modules/linuxdo/LinuxDoModule'),
        import('./modules/linuxdo/lib/queries'),
        import('./modules/linuxdo/context/AuthContext'),
      ]).then(([, { preloadForum }, { loadStoredAuth }]) =>
        preloadForum(queries, loadStoredAuth()?.user?.username)
      ).then(() => {
        console.log('✅ LinuxDo 模块与首屏数据已预取');
      }).catch(error => {
        console.warn('⚠️ LinuxDo 预加载失败:', error);
      });
    }, WARMUP_DELAY);

    return () => clearTimeout(timer);
  }, [queries]);

  return (
    <BoardProvider>
      <AppLayout>
        <Routes>
          {/* 默认路由到看板首页 */}
          <Route index element={<Navigate to="/board" replace />} />
          
          {/* 看板模块 */}
          <Route path="/board" element={<BoardPage />} />
          <Route path="/knowledge/:noteId?" element={
            <Suspense fallback={<div className="p-8" role="status">正在打开知识库…</div>}>
              <KnowledgePage />
            </Suspense>
          } />
          
          {/* LinuxDo 模块 - 使用 Suspense 包裹 */}
          <Route 
            path="/linuxdo/*" 
            element={
              <Suspense fallback={<LinuxDoLoading />}>
                <LinuxDoModule />
              </Suspense>
            } 
          />
        </Routes>
      </AppLayout>
    </BoardProvider>
  );
}
