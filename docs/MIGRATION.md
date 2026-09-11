# FluxDO → Tauri 2 迁移

功能基准为本机 `../fluxdo`，快照 `41994c7e26e826d7edf2411fc47dc5e2d3d0deaf`（Flutter 0.2.28）。原项目源码保留，当前工程承接 Linux 桌面版本。新增代码沿用 GPL-3.0；`public/vendor/discourse-cook.js` 保留原文件的生成说明及 Discourse 来源。

## 结构

- React 页面按论坛功能划分，React Router 管理页面与阅读位置，TanStack Query 管理服务器数据。
- Rust 管理授权密钥、回调、窗口与会话请求；论坛 WebView 负责同源网络和 HttpOnly Cookie。远程页面只能回传会话结果，不能调用主窗口命令。
- Markdown 编辑器复用原项目的 Discourse cook bundle；帖子 HTML 由 DOMPurify 清洗后渲染。
- 草稿、阅读历史和界面设置按本机用户存储。重构不自动读取或覆盖 Flutter 的 Hive/SQLite 数据。

## 迁移状态

| 范围 | 状态 | 原项目依据 |
| --- | --- | --- |
| 浏览器授权、单实例回调、OTP 换会话、退出 | 已实现，原生隔离测试通过；真实账号待验证 | `user_api_key_service.dart`、`user_api_key_login_flow.dart` |
| 分类、标签、话题列表与详情 | 迁移中 | `_categories.dart`、`_topics.dart` |
| 发帖、回复、编辑、图片与 Markdown 预览 | 迁移中 | `_posts.dart`、`_uploads.dart`、`discourse_cook_service.dart` |
| 搜索、通知、书签、历史、草稿 | 迁移中 | `_search.dart`、`_notifications.dart`、`_drafts.dart` |
| 用户资料、关注、徽章、私信 | 待接入 | `_users.dart` |
| 聊天、实时 MessageBus、投票与管理操作 | 待接入 | `_chat.dart`、`message_bus_service.dart`、`_voting.dart` |
| 外观、阅读与快捷键设置 | 树形视图设置已接入 | `appearance_page.dart`、`reading_settings_page.dart`、`reading_defs.dart` |
| 树状回复视图（nested topic） | 已实现，待桌面真实验证 | `nested_topic.dart`、`nested_topic_provider.dart`、`_nested.dart`、`nested_post_card.dart`、`nested_post_list.dart` |
| AI、Notion、LDC/CDK、下载导出、DOH/ECH | 待迁移 | 对应 services/modules、`core/doh_proxy` |
| Android/iOS 专用适配 | 当前 Linux 范围之外 | 相机、移动后台服务、APK 更新等 |

“已实现”要求页面、接口及错误处理可以运行；仅有入口或链接不记为迁移完成。模拟接口验证与真实账号验证分别记录。

## 后续功能迁移路线

以下路线以 FluxDO 当前参考快照
[`e1bd839e`](https://github.com/Lingyan000/fluxdo/tree/e1bd839ef87825347c062fb588751a1a62e02372)
为依据，按 Linux 桌面端的收益和迁移成本排序。每项完成后应补充实现提交、测试命令和真实账号验证结果。

### 当前基线（2026-09-11）

已具备：话题列表与详情、楼层跳转、阅读进度、帖子点赞/收藏/回复、话题快捷操作、搜索、通知、书签、阅读历史、草稿、私信、聊天、用户资料、关注和徽章、树状回复视图。

尚未形成完整能力：话题筛选、可配置的楼层快捷键、独立的稍后阅读、话题导出、离线缓存、实时 MessageBus。

### 树状回复视图（2026-09-11 迁移）

- FluxDO 参考：`lib/models/nested_topic.dart`、`lib/providers/nested_topic_provider.dart`、`lib/services/discourse/_nested.dart`、`lib/widgets/nested/`、`lib/pages/topic_detail_page/widgets/nested_post_list.dart`、`lib/settings/definitions/reading_defs.dart`
- Tauri 落点：`src/lib/nestedPosts.js`（树节点解析与纯函数）、`src/lib/useNestedTopic.js`（根列表分页 + context 定位 + 子回复懒加载）、`src/components/NestedPost.jsx`（递归树卡片：L 形/直线连接线、折叠条、加载更多回复、深层子树弹框）、`src/components/NestedPostList.jsx`（排序 chips、context 横幅、展开状态）、`src/components/NestedThreadDialog.jsx`、`src/pages/TopicPage.jsx`（视图切换、带楼层进入走 context 定位、API 失败回落平铺）、`src/pages/SettingsPage.jsx`（默认使用树形视图、连接线样式）、`src/styles.css`
- 数据来自 linux.do 服务端 Discourse nested-topic 插件端点 `/n/topic/*.json`，与 FluxDO 相同；私信话题强制平铺。
- 进入话题时树接口与话题接口并行请求；nested 返回前用话题已带的平铺帖子在前端建临时树先渲染（`buildProvisionalTree`，回复 1 楼即根回复、缺失父楼层的回复临时作顶层），返回后无缝替换且折叠状态保留，默认开启时无整页等待。
- 树卡片保留 `data-post-number` 与 `post-*` 锚点，阅读进度上报、话题目录和跳层在树状模式下继续工作；展开状态以楼层号保存在列表层。
- 验证：`npm test`（含 `tests/nested-posts.test.js` 7 项树数据解析用例）、`npm run build` 通过；桌面真实账号验证待做。

### 阶段一：阅读体验（优先）

- [ ] **话题目录 TOC 与滚动定位**（代码已接入，待桌面真实验证）
  - FluxDO 参考：[`topic_toc_panel.dart`](https://github.com/Lingyan000/fluxdo/blob/e1bd839ef87825347c062fb588751a1a62e02372/lib/pages/topic_detail_page/widgets/topic_toc_panel.dart)、`topic_toc_controller.dart`
  - Tauri 落点：`src/pages/TopicPage.jsx`、`src/components/` 新增目录组件、`src/styles.css`
  - 目标：从帖子 HTML 提取 `h1`/`h2`/`h3`，右侧显示可折叠目录，滚动时高亮当前标题，点击后定位。
  - 验收：长话题至少有 5 个标题时显示目录；点击目录定位误差不超过一个视口；目录在滚动后仍可见。

- [ ] **图片查看器**（代码已接入，待桌面真实验证）
  - FluxDO 参考：`lib/pages/image_viewer_page.dart`、`lib/utils/share_utils.dart`
  - Tauri 落点：扩展 `src/components/Cooked.jsx`，新增图片查看器组件和保存原图命令。
  - 目标：点击图片放大、左右切换、ESC 关闭、复制/保存原图、加载失败提示。
  - 2026-09-12 补充：内容清洗阶段直接拆掉 Discourse lightbox 包装——图片外提、原图地址记入 `data-original` 供查看器加载原图，丢弃「文件名 尺寸 大小」meta 行与包装元素（消除包装布局空白）；cooked 图片同时约束 `max-height: 75vh`（竖长图不占数屏），加载失败的图片替换为「点击查看原图」占位条。
  - 验收：同一帖子多张图片可连续浏览；外部图片和相对图片均可打开；关闭后保持原滚动位置。

- [ ] **代码块增强**（代码已接入，待桌面真实验证）
  - FluxDO 参考：README 中的 `re_highlight`、话题渲染组件。
  - Tauri 落点：`src/components/Cooked.jsx`；项目已有 `highlight.js` 依赖。
  - 目标：语法高亮、语言标识、一键复制、长代码横向滚动。
  - 验收：Markdown fenced code 不改变原文；复制内容与代码块文本一致；未知语言不报错并保留纯文本显示。

### 阶段二：话题处理效率

- [ ] **话题筛选模式**
  - FluxDO 参考：[`_filter_actions.dart`](https://github.com/Lingyan000/fluxdo/blob/e1bd839ef87825347c062fb588751a1a62e02372/lib/pages/topic_detail_page/actions/_filter_actions.dart)
  - 建议顺序：热门回复、只看楼主、只看顶层回复、按活跃度排序；树状回复已于 2026-09-11 单独迁移完成。
  - Tauri 落点：`src/pages/TopicPage.jsx`、`src/lib/api.js`、帖子合并逻辑。
  - 验收：筛选状态可取消；刷新或加载更多不会丢失筛选；筛选后的阅读进度仍使用真实楼层号。

- [ ] **楼层键盘快捷键**
  - FluxDO 参考：[`_scroll_actions.dart`](https://github.com/Lingyan000/fluxdo/blob/e1bd839ef87825347c062fb588751a1a62e02372/lib/pages/topic_detail_page/actions/_scroll_actions.dart)、`shortcut_settings_page.dart`
  - Tauri 落点：`src/components/Shell.jsx` 与 `TopicPage.jsx`；设置页扩展快捷键配置。
  - 建议按键：`J/K` 上下楼、`U` 跳未读、`G` 回顶部、`T` 打开目录、`R` 回复。
  - 验收：输入框、编辑器和弹窗获得焦点时不拦截按键；快捷键只作用于当前话题；可关闭或恢复默认设置。

- [ ] **独立“稍后阅读”列表**
  - FluxDO 参考：`lib/providers/read_later_provider.dart`、`lib/models/read_later_item.dart`。
  - 与书签区分：书签支持备注/提醒，稍后阅读只记录话题和楼层，操作更快。
  - Tauri 落点：`src/lib/storage.js`、新增 `src/pages/ReadLaterPage.jsx`、导航入口和话题操作按钮。
  - 验收：未登录可本地使用；同一话题去重；点击条目回到保存楼层；可单条删除和批量清理。

### 阶段三：输出与分享

- [ ] **话题导出**
  - FluxDO 参考：`lib/pages/topic_detail_page/topic_more_menu_actions.dart`、`lib/widgets/share/export_sheet.dart`。
  - Tauri 落点：前端生成 Markdown/HTML，Rust 文件保存命令负责选择路径和写入。
  - 验收：导出包含标题、作者、楼层和正文；图片链接可用；保存失败有明确错误提示。

- [ ] **分享图片/干净链接**
  - FluxDO 参考：`lib/widgets/share/share_image_preview.dart`、`share_plus` 调用链。
  - 先实现复制话题链接和复制帖子链接，再评估生成长图，避免引入大规模截图依赖。

### 阶段四：高成本能力

- [ ] **离线缓存与下载管理**
  - FluxDO 参考：`lib/pages/download_list_page.dart`、`lib/providers/download_provider.dart`。
  - 需要先确定磁盘配额、缓存失效、附件权限和清理策略，不与浏览历史混用。

- [ ] **实时 MessageBus**
  - FluxDO 参考：`message_bus_service.dart`、话题详情页的实时更新处理。
  - 需要设计 Tauri/WebView 生命周期、断线重连、重复事件去重和 Query 缓存更新；在前三级稳定前暂不迁移。

### 明确不迁移项

- FluxDO 的 Flutter/移动端专用适配、相机和移动后台服务。
- DOH/ECH 原生代理：Linux Tauri 版本优先使用系统网络和现有 HTTPS 能力，除非出现明确的网络环境需求。
- 不为保持旧 Flutter 数据格式而新增 Hive/SQLite 兼容层；如未来需要导入，单独设计一次性导入工具。

### 每项功能的完成定义

1. 页面入口、接口调用和错误状态均已实现。
2. 至少有一个针对核心行为的自动化测试或可重复的本地验证命令。
3. `npm test`、`npm run build` 通过；涉及 Rust 时额外运行 `cargo test --manifest-path src-tauri/Cargo.toml --lib`。
4. 记录桌面端真实账号验证结果；仅通过 mock、单元测试或构建不算完成。

## 登录回归

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run tauri build -- --debug --no-bundle
dbus-run-session --config-file=tests/dbus-session.conf -- \
  python3 tests/native-login.py --full
```

原生测试使用 WebKitWebDriver、临时应用数据和独立 D-Bus，浏览器授权由测试脚本截获，论坛写入由测试数据代替。系统 Python 仅作为此原生测试的驱动，使用现有 `cryptography` 包；它不是应用运行依赖。

本机已移除 Flatpak `com.github.lingyan000.fluxdo` 及其沙盒数据、残留启动项。登录修复版已打包并安装为 `linux-do`；包内 `Exec=linuxdo-tauri %u` 会传递浏览器回调。
