# AGENTS.md

本文件是「应用icon创作大师」项目的 AI 开发协作规范。它继承上级目录 `F:\AI Codex\AGENTS.md` 的 Vibe Coding 流程规范，并补充本项目的特殊约束。

## 1. 项目定位

本项目是一个 H5 + Node.js 工具，用于把待投产品、竞品、参考素材和投放平台约束，转化为可投放测试的应用 Icon 素材。

当前核心流程：

1. S1 产品检索与需求输入
2. S2 产品 / 竞品 / Icon 分析
3. S3 Prompt 组装与用户确认
4. S4 Prompt 自检与 icon制作需求规格书输出
5. S5 Icon 生成
6. S6 自动质检 + 用户决策
7. S7 微调 / 重生执行
8. S8 多尺寸导出与交付

本项目只聚焦 Icon，不处理 banner、视频广告、信息流大图等其他素材类型。

## 2. 协作总规则

除非用户明确说出“开始修改代码”，否则只允许进行：

- 方案讨论
- 需求梳理
- 字段设计
- 架构建议
- 文档更新

在用户没有明确说“开始修改代码”前，不得修改运行代码，包括但不限于：

- `app.js`
- `server.js`
- `styles.css`
- `index.html`
- `icon-agent.config.json`
- `package.json`
- `package-lock.json`

如果用户明确要求“更新文档”或“补齐文档”，可以修改：

- `AGENTS.md`
- `CHANGELOG.md`
- `README.md`
- `DEPLOYMENT.md`
- `docs/*.md`

如果需求会影响运行代码，必须先输出方案、影响范围、数据结构变化、风险和验收标准，等待用户确认。

## 3. 技术栈

- 前端：原生 HTML / CSS / JavaScript
- 后端：Node.js 原生 HTTP server
- 图像处理：`sharp`
- ZIP 打包：`adm-zip`
- 配置文件：`icon-agent.config.json`
- 部署：Railway
- 代码托管：GitHub

当前模型配置通过环境变量和 `icon-agent.config.json` 管理。

## 4. 安全与密钥

严禁将真实 API Key、Token、口令写入代码、文档、日志或 Git commit。

只允许使用：

- 本地 `.env.local`
- Railway / 云平台环境变量
- `.env.example` 中的占位符

不得提交：

- `.env.local`
- `node_modules/`
- `uploads/`
- `generated/`
- `exports/`
- `github-upload/`
- 临时抓取文件

如果用户在对话中提供过真实 Key，应建议后续进行 Key 轮换。

## 5. 配置与 Prompt 管理

模型、Prompt 模板、输出 Schema 优先放在：

- `icon-agent.config.json`

不得把可配置内容硬编码进业务逻辑，除非是明确的兜底默认值。

修改 Prompt 相关能力前，必须先说明：

- 涉及哪个阶段
- 输入字段来源
- 输出字段结构
- 是否影响 S5 生成
- 是否影响外部工具调用

## 6. 数据结构原则

数据结构必须优先对齐当前真实代码流程：

- `app.js -> getApiPayload()`
- `server.js -> buildWorkflowPayload()`
- `icon-agent.config.json -> protocol_schema`
- `icon-agent.config.json -> output_schemas`
- `/api/google-play`
- `/api/analyze`
- `/api/optimize-prompts`
- `/api/check-prompts`
- `/api/generate-icons`
- `/api/regenerate-icon`
- `/api/export-icons`

未来字段可以预留，但必须放在明确的 `reserved` 对象中，不能改变当前已运行字段含义。

数据结构文档以 `docs/DATA_STRUCTURE.md` 为准。

## 7. S4 icon制作需求规格书规则

icon制作需求规格书在 S4 之后、S5 之前生成。

触发条件：

- 生成提示词已完成
- 用户已确认最终提示词
- Prompt 自检已完成，或用户明确确认继续

规格书用途：

- 作为其他素材生成工具可直接调用的 JSON 指令
- 不依赖 S5 生成结果
- 不包含 S5 后才出现的 `image_id`、`icon_url`、`scene_url`
- 具体 JSON 格式由用户提供，未提供前不得自由设计最终字段

规格书应与 `prompt_id` / `variant_tag` 对齐，便于一个任务输出多个方案规格。

## 8. S5 生成规则

S5 必须使用 S4 已确认的 `promptJson[]` 或其派生结构作为生成依据。

参考图优先级：

1. 用户上传参考图
2. 主产品 Google Play Icon
3. 竞品 Google Play Icon

若存在可用参考图，应使用“参考图 + Prompt”的生成方式。无参考图时使用纯文本生成方式。

生成结果包括：

- Icon 原图
- 场景展示图

场景展示图只用于预览，不进入最终 ZIP 交付包。

## 9. S8 导出规则

最终 ZIP 只包含多尺寸 PNG Icon 文件：

- 1024px
- 512px
- 256px
- 128px
- 64px

ZIP 不得包含：

- 场景展示 SVG
- `manifest.json`
- Prompt 文本
- 用户上传原图
- 中间调试文件

如需导出 icon制作需求规格书，应作为单独 JSON 下载项，不能默认混入 PNG ZIP，除非用户明确要求。

## 10. 测试规则

修改代码后至少运行：

```powershell
node --check server.js
node --check app.js
npm run smoke
```

涉及配置文件时，还需要验证：

```powershell
node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('icon-agent.config.json','utf8')); console.log('config ok')"
```

`npm run smoke:full` 会调用图像生成模型并消耗额度，必须先获得用户确认。

不能把未运行的测试说成已通过。

## 11. Git 与版本管理

每个有意义改动应单独提交，提交信息建议遵循 Conventional Commits：

- `feat:`
- `fix:`
- `docs:`
- `test:`
- `chore:`
- `refactor:`

推荐发布流程：

```powershell
git status
npm run smoke
git add .
git commit -m "docs: add project agent rules"
git push origin main
```

稳定版本使用 SemVer tag：

```powershell
git tag -a v0.1.1 -m "Version note"
git push origin v0.1.1
```

回滚优先使用：

```powershell
git revert <commit_id>
```

不要随意使用破坏历史的 `reset --hard`。

## 12. 文档职责

核心文档：

- `docs/PRD.md`：产品需求与功能范围
- `docs/PROJECT_PLAN.md`：项目阶段规划
- `docs/DATA_STRUCTURE.md`：当前运行时数据结构与未来预留字段
- `DEPLOYMENT.md`：部署说明
- `CHANGELOG.md`：版本变更记录

当功能、字段、接口、导出物发生变化时，必须同步更新相关文档。

## 13. 当前已知技术债

- 部分前端文案存在历史编码乱码，需要后续专项清理。
- 本地目录 `uploads/`、`generated/`、`exports/` 不适合作为长期线上存储。
- S6 自动质检仍偏轻量，后续需要增强视觉反解与 64px 可读性评分。
- 数据库和对象存储尚未接入，任务历史和文件长期保存能力不足。

这些技术债不应在无关任务中顺手修复，必须单独提出方案并获得确认。
