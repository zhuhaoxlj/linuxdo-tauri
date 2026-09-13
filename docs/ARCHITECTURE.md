# 项目架构说明

## 概述

本项目整合了**个人知识管理看板**和**LinuxDo 论坛客户端**两大功能模块，采用模块化设计，确保代码分离和独立维护。

## 目录结构

```
src/
├── App.jsx                          # 主应用入口，整合所有模块
├── main.jsx                         # React 应用启动文件
├── styles.css                       # 全局样式
├── shared/                          # 共享组件
│   └── components/
│       └── AppLayout.jsx            # 统一的应用布局和侧边栏
├── modules/
│   ├── board/                       # 知识看板模块
│   │   ├── context/
│   │   │   └── BoardContext.jsx    # 看板数据管理（任务、笔记、分类）
│   │   ├── components/
│   │   │   ├── TaskCard.jsx        # 任务卡片组件
│   │   │   └── AddTaskForm.jsx     # 添加任务表单
│   │   └── pages/
│   │       └── BoardPage.jsx       # 看板主页面
│   └── linuxdo/                     # LinuxDo 论坛模块（独立维护）
│       ├── LinuxDoModule.jsx        # LinuxDo 模块入口
│       ├── context/                 # 论坛认证和应用上下文
│       ├── components/              # 论坛组件
│       ├── lib/                     # 论坛工具函数
│       └── pages/                   # 论坛页面
└── assets/                          # 静态资源
```

## 功能模块

### 1. 知识看板模块 (`modules/board/`)

**核心功能：**
- ✅ 快速启动，打开即显示待办看板
- ✅ 分类管理：首页、生活、工作、知识库、娱乐
- ✅ 任务管理：添加、编辑、完成、删除
- ✅ 本地存储：自动保存到 localStorage
- ✅ 响应式设计：简洁美观的卡片布局

**数据结构：**
- 分类（Categories）：预设的固定分类
- 任务（Tasks）：包含标题、描述、分类、完成状态、创建时间
- 笔记（Notes）：预留扩展功能

### 2. LinuxDo 论坛模块 (`modules/linuxdo/`)

**核心功能：**
- ✅ 论坛浏览、主题阅读
- ✅ 用户认证、消息通知
- ✅ 搜索、书签、草稿
- ✅ 完整保留原有功能

**独立性设计：**
- 所有原有代码迁移到 `modules/linuxdo/` 目录
- 独立的路由和状态管理
- 不依赖看板模块
- 方便从主分支合并更新

### 3. 共享层 (`shared/`)

**AppLayout 组件：**
- 统一的侧边栏导航
- 自动切换看板和论坛模块
- 响应式布局设计

## 路由设计

```javascript
/                    → 重定向到 /board
/board               → 知识看板主页（根据侧边栏选择的分类显示）
/linuxdo/*           → LinuxDo 论坛模块（所有原有路由）
```

## 数据流

### 看板模块
```
BoardContext (全局状态)
    ↓
BoardPage (页面)
    ↓
TaskCard / AddTaskForm (组件)
    ↓
localStorage (持久化)
```

### LinuxDo 模块
```
AuthContext + AppContext (原有状态管理)
    ↓
LinuxDoModule (模块入口)
    ↓
Shell + Pages (原有页面结构)
```

## 样式设计

- **主题色：** 靛蓝色系（Indigo）
- **风格：** 简洁、现代、扁平化
- **布局：** 侧边栏 + 主内容区
- **动画：** 平滑过渡和悬停效果

## 扩展指南

### 添加新的看板分类
修改 `src/modules/board/context/BoardContext.jsx` 中的 `DEFAULT_CATEGORIES`

### 更新 LinuxDo 模块
1. 从主分支拉取最新代码
2. 将更新应用到 `src/modules/linuxdo/` 目录
3. 确保 `LinuxDoModule.jsx` 的导入路径正确

### 添加新功能
- 看板相关：在 `modules/board/` 下添加
- 论坛相关：在 `modules/linuxdo/` 下添加
- 通用功能：在 `shared/` 下添加

## 性能优化

- ✅ React lazy loading（懒加载）
- ✅ 路由级代码分割
- ✅ localStorage 本地缓存
- ✅ 组件级 memo 优化（可扩展）

## 后续开发建议

1. **笔记功能：** 完善知识库的笔记编辑和展示
2. **标签系统：** 为任务添加标签分类
3. **搜索功能：** 全局搜索任务和笔记
4. **数据导出：** 支持导出为 Markdown/JSON
5. **主题切换：** 支持浅色/深色模式
6. **快捷键：** 添加键盘快捷键支持
7. **统计视图：** 任务完成度统计和可视化
