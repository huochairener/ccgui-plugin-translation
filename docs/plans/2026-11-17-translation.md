# CC GUI 翻译插件实现计划

目标：交付能从本地目录安装的中文翻译插件，支持选区翻译、右下角自动翻译面板、语言互换、设置深链、Bing / Google / 自定义 AI，以及保留原文和代码块的会话翻译。

架构：开发源码按引擎、界面、聊天兼容层拆分，用 esbuild 生成无 import 的单文件 ESM main.js。运行时使用 ctx.react、ctx.storage、ctx.ui 和 plugin_http_request。当前 SDK 0.3.25 不提供正文右键和会话读取接口；页面 DOM 兼容层等待用户明确授权，不修改宿主源码或私有 store。

技术栈：JavaScript ESM、CC GUI SDK 0.3.25、Node test runner、jsdom、Playwright（本机 Chrome）。

## 文件

- manifest.json / main.js / styles.css：可安装产物。
- src/core.js：设置校验、语言、文本分段、翻译引擎、缓存和请求调度。
- src/main.js：ctx 接入、React 面板、设置页和状态栏。
- src/conversation.js：授权后的聊天 DOM 适配、局部菜单和全局翻译控制。
- scripts/build.mjs：生成可安装插件包。自定义 AI 的模型列表通过供应商 `/models` 接口拉取；SenseNova 主机内置支持。
- tests/*.test.mjs：引擎协议、失败恢复、竞态、DOM 和界面行为。
- tests/browser.mjs：浏览器交互验收和截图。
- README.md：安装、引擎设置、权限与兼容边界。

## 约束与关键决定

- 用户已确认直接实现；不提交、推送或安装到运行中的客户端。
- 源语言默认自动检测，目标语言默认简体中文；源为自动时互换使用最近检测结果或英语。
- 输入防抖 600ms，旧请求结果不得覆盖新输入；缓存仅保存在内存，设数量上限。
- 全局翻译保留原文，可取消、重试、恢复；代码块、行内代码与路径标识符不发送给引擎，在译文中原位还原。占位符漏还原时补充到译文末尾，不静默丢字。
- 所有网络请求通过 SDK bridge；按当前 SDK 的精确主机授权规则声明支持的供应商，不绕过宿主权限。
- 不自动回退至另一引擎，避免把会话意外发送到其他供应商。
- API key 保存在插件独立 storage（非系统加密保险库），UI 默认掩码，不写日志。

## 任务与验证

- [ ] 1. 翻译核心：先写能揭示协议错误、超长 Unicode 丢字、缓存混用与凭据泄露的失败测试；实现 Bing、Google、Responses、Chat Completions、分段、去重与错误反馈；运行 node --test。
- [ ] 2. 插件界面：状态栏右侧集群首位入口（性能 / 缩放入口左侧）、浮层、语言选择互换、粘贴自动翻译、设置深链、设置持久化和连接测试；用 jsdom + 真实 React 验证旧请求晚到、存储失败和卸载清理。
- [ ] 3. 授权后的右键及会话翻译：只识别当前聊天容器，选区快照、非侵入译文、跳过代码、虚拟列表边界、取消与清理；用宿主结构 fixture 验证会话切换不串译、原文不改、失败可恢复。
- [ ] 4. 打包及验收：manifest 权限校验、单文件 ESM 语法检查、Playwright 交互及截图、真实 Bing / Google 小文本连通性测试；如环境不通，记录实际结果。

## 执行记录

- 工作目录原本仅有 .ccgui，无 Git 仓库；直接在用户指定空目录交付，无 worktree 或提交步骤。
- 已核对 D:/desktop-cc-gui-reference 的 SDK 0.3.25，缺失正文右键和完整会话读取接口；不修改该参考仓库。
