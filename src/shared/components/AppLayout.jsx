import React, { useEffect } from 'react';
import '../../modules/board/board.css';
import '../app-shell.css';
import { useBoard } from '../../modules/board/context/BoardContext';
import { useLocation, useNavigate } from 'react-router-dom';
import AppNavItem from './AppNavItem';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export default function AppLayout({ children }) {
  const { categories, activeCategory, setActiveCategory, setReminderOpen, updateCategory } = useBoard();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return undefined;
    let active = true;
    let unlisten;
    const open = id => {
      if (!active || !id) return;
      setReminderOpen(id);
      navigate('/board');
    };
    listen('reminder-open', event => { open(event.payload); void invoke('take_reminder_open'); })
      .then(dispose => { if (active) unlisten = dispose; else dispose(); });
    invoke('take_reminder_open').then(open);
    return () => { active = false; unlisten?.(); };
  }, [navigate, setReminderOpen]);

  const handleCategoryClick = (categoryId) => {
    if (categoryId === 'linuxdo') {
      navigate('/linuxdo');
    } else if (categoryId === 'sync') {
      navigate('/sync');
    } else if (categoryId === 'knowledge') {
      setActiveCategory(categoryId);
      navigate('/knowledge');
    } else {
      setActiveCategory(categoryId);
      navigate('/board');
    }
  };

  const isLinuxDoActive = location.pathname.startsWith('/linuxdo');
  const isKnowledgeActive = location.pathname.startsWith('/knowledge');
  const isSyncActive = location.pathname.startsWith('/sync');
  const currentActive = isLinuxDoActive ? 'linuxdo' : isKnowledgeActive ? 'knowledge' : isSyncActive ? 'sync' : activeCategory;

  // 如果在 LinuxDo 模块内，不显示外层侧边栏，让 LinuxDo 使用自己的布局
  if (isLinuxDoActive) {
    return <>{children}</>;
  }

  return (
    <div className={`app-shell board-shell${isKnowledgeActive ? ' has-knowledge' : ''}`}>
      {/* 侧边栏 */}
      <aside className="app-sidebar">
        {/* Logo 区域 */}
        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden="true">知</span>
          <h1>知识看板</h1>
          <p>个人知识管理系统</p>
        </div>

        {/* 导航菜单 */}
        <nav className="app-navigation" aria-label="应用导航">
          <div className="app-nav-list">
            {categories.map(category => (
              <AppNavItem
                key={category.id}
                category={category}
                current={currentActive === category.id}
                onSelect={() => handleCategoryClick(category.id)}
                onRename={name => updateCategory(category.id, { name })}
                onChangeIcon={icon => updateCategory(category.id, { icon })}
              />
            ))}
          </div>
        </nav>

        {/* 底部信息 */}
        <div className="app-sidebar-footer">
          <p>快速启动 · 高效管理</p>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="app-main">
        {children}
      </main>
    </div>
  );
}
