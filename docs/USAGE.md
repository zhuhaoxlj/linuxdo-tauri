# 使用指南

## 快速开始

### 开发模式

```bash
# 启动开发服务器
npm run dev

# 在另一个终端启动 Tauri
npm run tauri dev
```

### 构建生产版本

```bash
# 构建前端
npm run build

# 构建 Tauri 应用
npm run tauri build
```

## 功能使用

### 知识看板

#### 1. 切换分类
点击左侧边栏的任意分类（首页、生活、工作、知识库、娱乐）即可切换到对应的看板视图。

#### 2. 添加任务
- 点击「添加新任务」按钮
- 输入任务标题（必填）
- 输入任务描述（可选）
- 点击「添加」保存

#### 3. 管理任务
- **完成任务：** 点击任务左侧的圆形复选框
- **编辑任务：** 点击任务右侧的编辑图标
- **删除任务：** 点击任务右侧的删除图标

#### 4. 查看统计
每个分类顶部会显示：
- 进行中的任务数量
- 已完成的任务数量

### LinuxDo 论坛

#### 1. 访问论坛
点击左侧边栏的「LinuxDo」分类即可进入论坛模块。

#### 2. 登录
首次使用需要登录 LinuxDo 账号，所有原有功能保持不变。

#### 3. 浏览和互动
- 浏览主题列表
- 阅读主题内容
- 发布回复
- 查看通知
- 管理书签

## 数据管理

### 数据存储
所有看板数据存储在浏览器的 localStorage 中，键名为 `board-data-v1`。

### 数据备份
目前数据保存在本地，建议定期导出备份（功能开发中）。

### 清除数据
如需清除所有数据，可以在浏览器开发者工具的 Application > Local Storage 中删除对应键值。

## 快捷操作

### 键盘快捷键（规划中）
- `Ctrl/Cmd + N` - 快速添加任务
- `Ctrl/Cmd + /` - 搜索
- `Ctrl/Cmd + 1-6` - 切换分类

## 自定义配置

### 修改分类
编辑 `src/modules/board/context/BoardContext.jsx` 中的 `DEFAULT_CATEGORIES` 数组：

```javascript
const DEFAULT_CATEGORIES = [
  { id: 'home', name: '首页', icon: '🏠', color: '#6366f1' },
  { id: 'life', name: '生活', icon: '🌟', color: '#10b981' },
  // 添加更多分类...
];
```

### 修改主题色
编辑 `tailwind.config.js` 和 `src/styles.css` 中的颜色定义。

## 常见问题

### Q: 数据会丢失吗？
A: 数据保存在本地 localStorage，除非手动清除浏览器数据，否则不会丢失。

### Q: 可以同步到云端吗？
A: 当前版本不支持云端同步，这是后续计划中的功能。

### Q: LinuxDo 模块会影响看板功能吗？
A: 不会，两个模块完全独立，互不影响。

### Q: 如何更新 LinuxDo 模块？
A: 按照架构文档的说明，从主分支合并代码到 `src/modules/linuxdo/` 目录即可。

## 技术栈

- **框架：** React 18 + React Router
- **构建：** Vite 6
- **桌面：** Tauri 2
- **样式：** TailwindCSS
- **图标：** Lucide React
- **状态：** React Context API

## 贡献指南

1. 看板功能改进提交到 `modules/board/`
2. LinuxDo 功能改进提交到 `modules/linuxdo/`
3. 保持模块独立性，避免交叉依赖
4. 遵循现有代码风格和组织结构
