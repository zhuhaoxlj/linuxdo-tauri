# 知识看板 + LinuxDo 集成应用

一个快速启动的个人知识管理看板应用，集成了 LinuxDo 论坛客户端功能。

![](https://img.shields.io/badge/React-18-blue)
![](https://img.shields.io/badge/Tauri-2-orange)
![](https://img.shields.io/badge/TailwindCSS-3-cyan)

## ✨ 特性

### 📋 知识看板
- **极速启动**：打开即显示待办看板
- **分类管理**：首页、生活、工作、知识库、娱乐五大板块
- **任务管理**：轻松添加、编辑、完成、删除任务
- **本地存储**：数据自动保存到 localStorage
- **简洁设计**：参考 Nolebase 风格，简洁美观

### 🐧 LinuxDo 论坛
- **完整集成**：保留所有论坛功能
- **独立模块**：便于后续更新和维护
- **无缝切换**：侧边栏一键切换

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# 启动 Web 开发服务器
npm run dev

# 启动 Tauri 桌面应用
npm run tauri dev
```

### 构建生产版本

```bash
# 构建前端
npm run build

# 构建桌面应用
npm run tauri build
```

## 📁 项目结构

```
src/
├── App.jsx                          # 主应用入口
├── main.jsx                         # React 启动文件
├── styles.css                       # 全局样式
├── shared/                          # 共享组件
│   └── components/
│       └── AppLayout.jsx            # 应用布局和侧边栏
├── modules/
│   ├── board/                       # 知识看板模块
│   │   ├── context/
│   │   │   └── BoardContext.jsx    # 看板状态管理
│   │   ├── components/
│   │   │   ├── TaskCard.jsx        # 任务卡片
│   │   │   └── AddTaskForm.jsx     # 添加任务表单
│   │   └── pages/
│   │       └── BoardPage.jsx       # 看板主页面
│   └── linuxdo/                     # LinuxDo 论坛模块
│       ├── LinuxDoModule.jsx        # 模块入口
│       ├── context/                 # 认证和应用上下文
│       ├── components/              # 论坛组件
│       ├── lib/                     # 工具函数
│       └── pages/                   # 论坛页面
└── assets/                          # 静态资源
```

## 🎯 使用指南

### 知识看板

1. **切换分类**：点击左侧边栏切换不同板块
2. **添加任务**：点击「添加新任务」按钮
3. **完成任务**：点击任务左侧的圆形复选框
4. **编辑/删除**：点击任务右侧的图标

双击卡片文字或空白处也可编辑，按 `Enter` 保存、`Shift+Enter` 换行、`Esc` 取消。
卡片菜单支持「置顶/取消置顶」，置顶卡片保持在所属列顶部；「复制」将卡片内容写入系统剪贴板，不创建新卡片。
纯文字按文本复制，单张纯图片按图片复制，包含文字与图片或多张图片的卡片按富文本复制；图片保留情况取决于粘贴目标是否支持富文本。

添加卡片或通过卡片菜单进入编辑后，在输入框按 `Ctrl+V`（macOS 为 `Cmd+V`）可粘贴图片。
每张卡片最多保存 4 张图片，图片会压缩至长边不超过 960 像素，以 JPEG 格式保存在本地。
点击缩略图可放大查看完整图片，按 `Esc`、点击遮罩或右上角关闭按钮退出；键盘聚焦缩略图后也可按 `Enter` 打开。
桌面版使用 Tauri 原生剪贴板读图；更新原生依赖后需要重启开发版，仅刷新网页不足以生效。

### LinuxDo 论坛

1. 点击侧边栏的「LinuxDo」进入论坛
2. 首次使用需要登录账号
3. 所有原有功能保持不变

详细使用说明请查看 [docs/USAGE.md](docs/USAGE.md)

## 🧪 图片粘贴回归

运行 `npm test` 检查剪贴板解析、原生读图、资源释放和错误处理。
Linux 原生验证需要 `WebKitWebDriver`，先复制一张图片并启动 `npm run tauri dev`，再运行：

```bash
dbus-run-session \
  --config-file tests/dbus-session.conf -- \
  /usr/bin/python3 -B tests/native-login.py --clipboard
```

原生测试使用隔离的应用数据，不更改系统剪贴板，覆盖新建、编辑、保存后重载、图片数量上限及点击放大、键盘关闭和小窗口布局。

将命令中的 `--clipboard` 改为 `--board`，可用隔离数据验证双击编辑、置顶、复制到剪贴板及菜单交互，无需准备剪贴板图片。
该模式需要 `xclip` 和已运行的 CopyQ，会临时写入测试内容并在结束后恢复原剪贴板。

## 🏗️ 架构说明

本项目采用**模块化设计**，知识看板和 LinuxDo 论坛完全独立：

- **看板模块**：负责个人任务和知识管理
- **论坛模块**：独立维护，便于合并 LinuxDo 主分支更新
- **共享层**：统一的应用布局和导航

详细架构说明请查看 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 🔄 更新 LinuxDo 模块

LinuxDo 功能位于 `src/modules/linuxdo/` 目录，可以独立更新：

```bash
# 从 LinuxDo 主分支拉取更新
git remote add linuxdo <linuxdo-repo-url>
git fetch linuxdo

# 合并更新到对应目录
# 详见 docs/MERGE_GUIDE.md
```

详细合并指南请查看 [docs/MERGE_GUIDE.md](docs/MERGE_GUIDE.md)

## 🛠️ 技术栈

- **框架**：React 18 + React Router
- **构建工具**：Vite 6
- **桌面框架**：Tauri 2
- **样式**：TailwindCSS 3
- **图标**：Lucide React
- **状态管理**：React Context API
- **数据请求**：TanStack Query (LinuxDo 模块)

## 📝 开发路线

- [x] 基础看板功能
- [x] 任务管理（CRUD）
- [x] LinuxDo 模块集成
- [x] 统一侧边栏导航
- [ ] 笔记功能
- [ ] 标签系统
- [ ] 全局搜索
- [ ] 数据导出/导入
- [ ] 深色模式
- [ ] 键盘快捷键
- [ ] 统计和可视化

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

开发规范：
- 看板功能改进提交到 `modules/board/`
- LinuxDo 功能改进提交到 `modules/linuxdo/`
- 保持模块独立性，避免交叉依赖

## 📄 许可证

查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- 界面设计灵感来自 [Nolebase](https://nolebase.ayaka.io/)
- LinuxDo 论坛客户端原始代码

---

**快速启动 · 高效管理 · 沉淀知识**

## ⚡ 性能优化

### LinuxDo 模块预加载

应用启动后会自动在后台预加载 LinuxDo 模块，点击进入时几乎无延迟：

- **优化前**：300-700ms 加载时间
- **优化后**：60-100ms 响应时间
- **提升**：70-85% 性能提升

详见：[性能优化文档](docs/PERFORMANCE_OPTIMIZATION.md)
