# 项目规划

## 1. 当前阶段

当前项目处于“可用原型到最小可上线版”阶段。

已经具备：

- H5 前端工作流界面
- Node.js 后端服务
- Google Play 检索
- 用户参考图上传
- AI 分析与 Prompt 生成
- Prompt 风险检查
- 图像模型生成 Icon
- 场景展示图预览
- 多尺寸 PNG 导出 ZIP
- Railway 部署能力
- GitHub 代码托管准备
- smoke test 测试入口

## 2. 版本路线

### v0.1.x 基线稳定版

目标：让当前单人使用流程稳定。

任务：

- 建立 Git commit / tag 发布流程。
- 保证 `.env.local`、生成文件、上传文件不进入 Git。
- 修复 S5 参考图传递稳定性。
- 修复 S8 导出包，只保留 PNG。
- 补齐 PRD、项目规划、数据结构文档。
- 每次上线前运行 `npm run smoke`。

验收：

- 本地 quick smoke 通过。
- 线上 `/api/health` 正常。
- S8 ZIP 不包含 SVG 和 JSON。

### v0.2.x 云存储版

目标：解决线上文件丢失和外部模型访问图片不稳定问题。

建议选型：

- Cloudflare R2：存用户上传图、生成 Icon、场景图、ZIP。
- 或 Supabase Storage：如果希望数据库和存储在一个平台管理。

任务：

- 新增 Storage Provider 抽象。
- 将 `/uploads`、`/generated`、`/exports` 从本地目录迁移到对象存储。
- 所有图片生成稳定公网 HTTPS URL。
- 为文件设置 content-type。
- 增加文件过期策略或手动清理策略。

验收：

- Railway 重启后历史图片 URL 仍可访问。
- DeepSeek / 火山模型可直接读取参考图 URL。
- ZIP 下载链接部署后仍可访问。

### v0.3.x 数据库任务记录版

目标：保存任务历史、Prompt、生成结果和导出记录。

建议选型：

- Supabase Postgres
- Neon Postgres

任务：

- 新增 task 任务表。
- 保存 S1 输入、Google Play 检索结果、S2 分析结果。
- 保存 S4 Prompt 计划和 Prompt 风险检查结果。
- 保存 S5 生成图片记录。
- 保存 S6 用户选择和 S8 导出记录。
- 前端增加历史任务列表。

验收：

- 用户刷新页面后可以恢复任务。
- 可以查看每次生成使用的 Prompt。
- 可以重新导出历史选中 Icon。

### v0.4.x 质检增强版

目标：让 S6 真正承担投放可用性质检。

任务：

- 使用视觉模型反解生成图内容。
- 检查 must_include / must_not_include。
- 自动生成 64px 缩略图并评分。
- 检查主体占比、背景复杂度、对比度、文字可读性。
- 不通过方案自动标记为待重生。

验收：

- 每个 Icon 有结构化 QA 报告。
- 用户可看到通过/警告/失败原因。
- 失败方案默认不进入导出选择。

### v0.5.x 多用户与权限版

目标：支持团队使用。

任务：

- 用户登录。
- 用户隔离任务和文件。
- 项目空间 / 团队空间。
- API Key 统一由服务端管理。
- 操作日志和成本统计。

验收：

- 不同用户不能查看彼此任务。
- 管理员可以查看整体调用量。
- 能按任务统计图像生成成本。

## 3. 发布流程

建议每次发布都按以下流程：

```powershell
cd "F:\AI Codex\icon-agent-h5"
npm run smoke
git status
git add .
git commit -m "简短说明本次变更"
git push origin main
```

稳定版本打 tag：

```powershell
git tag -a v0.1.0 -m "Initial deployable version"
git push origin v0.1.0
```

## 4. 回滚策略

优先使用 revert，保留历史：

```powershell
git log --oneline
git revert <commit_id>
git push origin main
```

如果要临时查看旧版本：

```powershell
git checkout v0.1.0
```

## 5. 风险清单

- 模型接口变更：通过配置文件降低改代码频率。
- Google Play 页面结构变化：需要保留失败兜底和手动输入能力。
- Railway 临时文件丢失：v0.2 必须接对象存储。
- 图像生成成本不可控：后续要加调用次数限制和成本日志。
- Prompt 不稳定：需要版本化 Prompt 模板。

## 6. 近期建议优先级

1. 完成 Git 正式版本管理。
2. 部署当前修复版到 Railway。
3. 接入对象存储。
4. 接入数据库任务记录。
5. 增强 S6 自动质检。

