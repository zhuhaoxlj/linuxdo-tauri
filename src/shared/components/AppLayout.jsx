import React from 'react';
import '../../modules/board/board.css';
import { useBoard } from '../../modules/board/context/BoardContext';
import { useLocation, useNavigate } from 'react-router-dom';

export default function AppLayout({ children }) {
  const { categories, activeCategory, setActiveCategory } = useBoard();
  const location = useLocation();
  const navigate = useNavigate();

  const handleCategoryClick = (categoryId) => {
    if (categoryId === 'linuxdo') {
      navigate('/linuxdo');
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
  const currentActive = isLinuxDoActive ? 'linuxdo' : isKnowledgeActive ? 'knowledge' : activeCategory;

  // 如果在 LinuxDo 模块内，不显示外层侧边栏，让 LinuxDo 使用自己的布局
  if (isLinuxDoActive) {
    return <>{children}</>;
  }

  return (
    <div className={`board-shell flex h-screen bg-gray-50${isKnowledgeActive ? ' has-knowledge' : ''}`}>
      {/* 侧边栏 */}
      <aside className="app-sidebar w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo 区域 */}
        <div className="app-brand p-6 border-b border-gray-200">
          {isKnowledgeActive && <span className="app-brand-mark" aria-hidden="true">知</span>}
          <h1 className="text-xl font-bold text-gray-900">知识看板</h1>
          <p className="text-sm text-gray-500 mt-1">个人知识管理系统</p>
        </div>

        {/* 导航菜单 */}
        <nav className="app-navigation flex-1 overflow-y-auto p-4" aria-label="应用导航">
          <div className="space-y-1">
            {categories.map(category => (
              <button
                key={category.id}
                title={category.name}
                aria-current={currentActive === category.id ? 'page' : undefined}
                onClick={() => handleCategoryClick(category.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  currentActive === category.id
                    ? 'bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 font-medium shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="text-xl">{category.icon}</span>
                <span className="flex-1 text-left">{category.name}</span>
                {currentActive === category.id && (
                  <div 
                    className="w-1 h-6 rounded-full" 
                    style={{ backgroundColor: category.color }}
                  />
                )}
              </button>
            ))}
          </div>
        </nav>

        {/* 底部信息 */}
        <div className="app-sidebar-footer p-4 border-t border-gray-200 text-xs text-gray-500">
          <p>快速启动 · 高效管理</p>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
