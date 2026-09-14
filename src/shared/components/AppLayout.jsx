import React from 'react';
import '../../modules/board/board.css';
import '../app-shell.css';
import { useBoard } from '../../modules/board/context/BoardContext';
import { useLocation, useNavigate } from 'react-router-dom';

export default function AppLayout({ children }) {
  const { categories, activeCategory, setActiveCategory } = useBoard();
  const location = useLocation();
  const navigate = useNavigate();

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
              <button
                key={category.id}
                type="button"
                title={category.name}
                aria-current={currentActive === category.id ? 'page' : undefined}
                onClick={() => handleCategoryClick(category.id)}
                className="app-nav-item"
              >
                <span className="app-nav-icon">{category.icon}</span>
                <span className="app-nav-label">{category.name}</span>
                {currentActive === category.id && (
                  <div
                    className="app-nav-marker"
                    style={{ backgroundColor: category.color }}
                  />
                )}
              </button>
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
