import React, { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { openUrl } from '@tauri-apps/plugin-opener';
import { isTauri } from '@tauri-apps/api/core';
import { BoardProvider } from './modules/board/context/BoardContext';
import AppLayout from './shared/components/AppLayout';
import BoardPage from './modules/board/pages/BoardPage';

const KnowledgePage = lazy(() => import('./modules/knowledge/pages/KnowledgePage'));

// 预加载 LinuxDo 模块
const LinuxDoModule = lazy(() => {
  // 添加预加载提示
  console.log('🚀 预加载 LinuxDo 模块...');
  return import('./modules/linuxdo/LinuxDoModule');
});

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

export default function App() {
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

  // 预加载 LinuxDo 模块（应用启动后延迟预加载）
  useEffect(() => {
    // 延迟 1 秒后开始预加载，避免影响首屏加载
    const timer = setTimeout(() => {
      // 触发 LinuxDo 模块的预加载
      const preload = import('./modules/linuxdo/LinuxDoModule');
      preload.then(() => {
        console.log('✅ LinuxDo 模块预加载完成');
      }).catch(err => {
        console.warn('⚠️ LinuxDo 模块预加载失败:', err);
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

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
