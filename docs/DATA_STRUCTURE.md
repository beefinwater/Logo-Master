# 数据结构方案

本文档以当前代码真实流程为准，字段名称优先对齐：

- 前端请求聚合：`app.js -> getApiPayload()`
- 后端流程标准化：`server.js -> buildWorkflowPayload()`
- 配置 Schema：`icon-agent.config.json`
- 后端接口：`server.js` 中 `/api/*` 路由

后续数据库表设计必须从这些结构映射，不应另起一套字段命名。

## 1. 当前运行时总 Payload

前端每次调用后端模型/生成/导出接口时，核心请求体来自 `getApiPayload()`。

```json
{
  "product": "",
  "competitors": "",
  "platform": "Google Ads",
  "platform_constraints_import": [],
  "platformRules": "",
  "emphasis": "",
  "sensitive": "",
  "emotion": [],
  "textEnabled": "否",
  "badgeText": "",
  "reference": "",
  "referenceFiles": [],
  "googlePlayProfile": null,
  "googlePlayReferences": null,
  "competitorGooglePlayProfiles": [],
  "competitorGooglePlayReferences": [],
  "count": 2,
  "directions": [],
  "modelAnalysis": null,
  "promptJson": [],
  "promptTemplate": "",
  "promptOptimizations": [],
  "generatedImages": [],
  "selectedImageIds": []
}
```

字段说明：

| 字段 | 类型 | 来源 | 用途 |
| --- | --- | --- | --- |
| `product` | string | S1 用户输入 | 待投产品名称 |
| `competitors` | string | S1 用户输入，逗号拼接 | 竞品名称，最多 3 个 |
| `platform` | string | S1 用户选择 | Google Ads / Meta / TikTok |
| `platform_constraints_import` | array/object | 前端规则解析 | 当前平台约束结构 |
| `platformRules` | string | 前端可编辑规则 | S2/S4 使用的平台规则文本 |
| `emphasis` | string | 用户输入 | 需要强调的方向 |
| `sensitive` | string | 用户输入 | 敏感点或避让点 |
| `emotion` | string[] | 用户选择 | 情绪目标，最多 3 个 |
| `textEnabled` | string | 用户选择 | 是否加角标，当前使用中文值 |
| `badgeText` | string | 用户输入 | 角标文字 |
| `reference` | string | 用户输入 | 参考素材说明 |
| `referenceFiles` | ReferenceFile[] | 上传组件 | 用户上传参考图，最多 2 张 |
| `googlePlayProfile` | GooglePlayProfile | `/api/google-play` | 主产品资料 |
| `googlePlayReferences` | VisualReferencePack | `/api/google-play` | 主产品视觉素材 |
| `competitorGooglePlayProfiles` | GooglePlayProfile[] | `/api/google-play` | 竞品资料 |
| `competitorGooglePlayReferences` | CompetitorVisualReference[] | `/api/google-play` | 竞品 Icon 资料 |
| `count` | number/string | S3 用户选择 | 生成方案数，当前最多 2 |
| `directions` | string[] | S3 用户选择 | 保守 / 点击强化 / 极致夸张 |
| `modelAnalysis` | AnalysisResult | `/api/analyze` | S2 分析结果 |
| `promptJson` | PromptJson[] | 前端组装或 S4 优化 | S5 生成唯一依据 |
| `promptTemplate` | string | 前端可编辑模板 | S3/S4 Prompt 组装模板 |
| `promptOptimizations` | PromptPlanItem[] | `/api/optimize-prompts` | 模型生成的 Prompt 方案 |
| `generatedImages` | GeneratedImage[] | `/api/generate-icons` | 已生成图片 |
| `selectedImageIds` | string[] | S6 用户选择 | S8 导出依据 |

## 2. ReferenceFile

来自前端上传区，当前由 `/api/upload-reference` 返回信息补齐。

```json
{
  "name": "",
  "size": 0,
  "type": "image/png",
  "dataUrl": "",
  "url": "/uploads/file.png",
  "publicUrl": "https://domain/uploads/file.png",
  "uploadStatus": "done"
}
```

当前规则：

- 最多 2 张。
- 前端会保留 `dataUrl`。
- 线上生成时，后端优先将本应用 `/uploads/` 文件转为 data URL 后传给图像模型，避免模型下载公网 URL 超时。
- DeepSeek 视觉输入要求公网稳定直连图片 URL，因此本地/私有 URL 会被跳过或降级为文本说明。

## 3. S1 Google Play 输出

接口：`POST /api/google-play`

返回：

```json
{
  "ok": true,
  "google_play": {
    "product_profile": {},
    "competitor_profiles": [],
    "visual_reference_pack": {},
    "competitor_visual_reference_pack": [],
    "source_apps": []
  }
}
```

### 3.1 GooglePlayProfile

当前由 `parseGooglePlayDetail()` 返回。

```json
{
  "role": "product",
  "app_id": "",
  "app_title": "",
  "developer": "",
  "category": "",
  "rating": "",
  "installs": "",
  "short_description": "",
  "detail_url": ""
}
```

竞品的 `role` 为 `competitor`。

### 3.2 VisualReferencePack

主产品视觉素材结构：

```json
{
  "icon": "",
  "featureGraphic": "",
  "screenshots": [],
  "visual_rules": []
}
```

### 3.3 CompetitorVisualReference

竞品视觉素材结构：

```json
{
  "app_id": "",
  "title": "",
  "icon": "",
  "screenshots": []
}
```

## 4. 后端标准化 Workflow

函数：`server.js -> buildWorkflowPayload(input)`

S2 分析和 S4 Prompt 计划都会基于这个结构。

```json
{
  "product": "",
  "competitors": "",
  "platform": "Google Ads",
  "imported_platform_rules": "",
  "emotion_target": [],
  "text_spec": {
    "enabled": false,
    "no_text": true
  },
  "emphasis": "",
  "sensitive": "",
  "reference_notes": "",
  "uploaded_files": [],
  "google_play_profile": null,
  "google_play_visual_reference_pack": null,
  "competitor_google_play_profiles": [],
  "competitor_google_play_icons": [],
  "variant_count": 2,
  "directions": []
}
```

### 4.1 text_spec

不加文字：

```json
{
  "enabled": false,
  "no_text": true
}
```

加文字：

```json
{
  "enabled": true,
  "text": "",
  "position": "右下角角标",
  "max_chars": 5
}
```

### 4.2 uploaded_files

注意：`buildWorkflowPayload()` 中只保留文件元数据，不保留 dataUrl 和 publicUrl。

```json
[
  {
    "name": "",
    "type": "image/png",
    "size": 0
  }
]
```

### 4.3 competitor_google_play_icons

```json
[
  {
    "app_id": "",
    "title": "",
    "icon": ""
  }
]
```

## 5. S2 分析输出

接口：`POST /api/analyze`

返回：

```json
{
  "ok": true,
  "analysis": {}
}
```

当前优先使用 `icon-agent.config.json -> output_schemas.s2_analysis`。

```json
{
  "ICON_CREATIVE_PROTOCOL": {},
  "product_analysis": {
    "core_gameplay": "",
    "theme": "",
    "art_style": "",
    "visual_style": "",
    "target_audience": "",
    "core_selling_points": [],
    "ad_expressible_points": []
  },
  "product_icon_analysis": {
    "image_content": "",
    "main_subject": "",
    "visual_style": "",
    "color_features": "",
    "composition_features": "",
    "text_features": "",
    "small_size_readability": "",
    "identity_cues": []
  },
  "competitor_icon_analysis": [],
  "common_icon_signature": {
    "subject_pattern": "",
    "composition_pattern": "",
    "color_pattern": "",
    "rendering_pattern": "",
    "emotion_pattern": "",
    "text_or_badge_pattern": "",
    "market_effective_formula": []
  },
  "differentiation_opportunities": {
    "keep": [],
    "strengthen": [],
    "avoid_copying": [],
    "possible_breakthrough_points": []
  },
  "generation_prompt_fields": {},
  "locked_insights_for_next_stage": {
    "identity_anchor": "",
    "reference_priority": [
      "user_uploaded_reference",
      "product_icon",
      "competitor_icons"
    ],
    "must_include_candidates": [],
    "must_not_include_candidates": [],
    "style_keywords": [],
    "risk_flags": []
  }
}
```

后端会通过 `normalizeAnalysisResult()` 补齐：

- `ICON_CREATIVE_PROTOCOL`
- `generation_prompt_fields`
- `locked_insights_for_next_stage.reference_priority`

## 6. ICON_CREATIVE_PROTOCOL

当前协议 Schema 来自 `icon-agent.config.json -> protocol_schema.ICON_CREATIVE_PROTOCOL`。

顶层字段：

```json
{
  "META": {},
  "PRODUCT_SYSTEM": {},
  "SUBJECT_SYSTEM": {},
  "VISUAL_SYSTEM": {},
  "MARKET_SYSTEM": {},
  "USER_SYSTEM": {},
  "TEXT_SYSTEM": {},
  "CTR_SYSTEM": {},
  "USABILITY_SYSTEM": {},
  "COMPLIANCE_SYSTEM": {}
}
```

当前固定 Prompt 字段名来自 `prompt_field_names`：

```json
[
  "game_genre",
  "setting",
  "core_narrative",
  "scene_context",
  "subject_type",
  "archetype",
  "pose",
  "facial_expression",
  "camera_angle",
  "eye_contact",
  "render_style",
  "detail_level",
  "lighting_style",
  "color_strategy",
  "surface_finish",
  "background_story",
  "curiosity_trigger",
  "urgency_trigger",
  "emotional_reaction_trigger",
  "dramatic_visual_tension",
  "value_desire",
  "symbol_set"
]
```

## 7. S3/S4 Prompt 计划

接口：`POST /api/optimize-prompts`

返回：

```json
{
  "ok": true,
  "prompt_plan": []
}
```

### 7.1 PromptPlanItem

当前由 `normalizePromptPlan()` 输出。

```json
{
  "variant_tag": "",
  "creative_rationale": "",
  "generation_mode": "",
  "reference_image_policy": {
    "use_user_uploaded_references": true,
    "use_product_icon_reference": true,
    "use_competitor_icon_references": true,
    "reference_priority": [
      "user_uploaded_reference",
      "product_icon",
      "competitor_icons"
    ]
  },
  "generation_prompt_fields": {},
  "final_prompt": "",
  "prompt": "",
  "negative_constraints": [],
  "quality_checkpoints": []
}
```

### 7.2 optimize-prompts 内部输入

`optimizePromptsConfigured()` 会组装：

```json
{
  "workflow": {},
  "model_analysis": {},
  "icon_creative_protocol": {},
  "selected_directions": [],
  "variant_count": 2,
  "reference_summary": {
    "has_user_uploads": false,
    "uploaded_reference_public_urls": [],
    "has_product_icon": false,
    "product_icon_url": "",
    "competitor_icon_count": 0,
    "competitor_icon_urls": []
  }
}
```

## 8. PromptJson

前端生成函数：`buildPromptJsonFromState()`

S5 生成唯一依据是 `promptJson[]`。

```json
{
  "task_id": "app-icon-master-2026-demo",
  "prompt_id": "s4_prompt_1",
  "variant_tag": "",
  "platform": "Google Ads",
  "asset_type": "icon",
  "render_spec": {
    "ratio": "1:1",
    "size": 1024,
    "no_text": true
  },
  "subject": {
    "product": "",
    "app_id": "",
    "category": "",
    "recommended_subject": ""
  },
  "style": {
    "common_signature": {},
    "style_params": {},
    "differentiation": {},
    "platform_constraints": []
  },
  "composition": {
    "layout": "centered single dominant subject",
    "subject_scale": "70-82% of canvas",
    "background": "simple clean high-contrast background",
    "small_size_rule": "must remain readable at 64px"
  },
  "emotion": [],
  "constraints": {
    "must_include": [],
    "must_not_include": [],
    "brand_colors": []
  },
  "text_spec": {
    "enabled": false,
    "no_text": true
  },
  "generation": {
    "n": 1,
    "source": "S3 confirmed prompt_json",
    "mode": "text_to_image"
  },
  "prompt_text": ""
}
```

如果模型优化返回了 `final_prompt` / `prompt` / `generation_prompt`，`prompt_text` 会优先使用模型返回的最终提示词。

## 9. S4 Prompt 自检

接口：`POST /api/check-prompts`

返回：

```json
{
  "ok": true,
  "report": {}
}
```

### 9.1 PromptCheckInput

后端内部结构：

```json
{
  "platform": "Google Ads",
  "product": "",
  "prompt_count": 2,
  "prompt_items": [
    {
      "prompt_id": "",
      "variant_tag": "",
      "prompt_text": "",
      "must_include": [],
      "must_not_include": [],
      "text_spec": {}
    }
  ]
}
```

### 9.2 PromptCheckReport

由 `normalizePromptCheck()` 规范化：

```json
{
  "overall_status": "pass",
  "summary": "",
  "checked_items": [
    {
      "prompt_id": "",
      "variant_tag": "",
      "status": "pass",
      "risk_level": "none",
      "risk_categories": [],
      "flagged_terms": [],
      "reason": "",
      "rewrite_suggestions": []
    }
  ],
  "global_rewrite_suggestions": []
}
```

## 10. S5 生成结果

接口：`POST /api/generate-icons`

返回：

```json
{
  "ok": true,
  "images": []
}
```

### 10.1 GeneratedImage

由 `generateIcons()` 返回。

```json
{
  "image_id": "",
  "scene_image_id": "",
  "prompt_id": "",
  "variant_tag": "",
  "url": "/generated/icon.png",
  "scene_url": "/generated/icon_scene.svg",
  "prompt_summary": "",
  "prompt_source": "S4 prompt_json",
  "reference_image_count": 0,
  "reference_image_sources": [],
  "reference_image_errors": [],
  "generation_mode": "text_to_image",
  "scene_generation_mode": "scene_template_composite"
}
```

前端收到后会补充：

```json
{
  "prompt_text": "",
  "version": 1,
  "regenerate_count": 0
}
```

### 10.2 参考图生成策略

后端 `generationReferenceInputItems(input)` 按以下优先级取图：

1. 用户上传参考图，最多 2 张。
2. 主产品 Google Play Icon。
3. 竞品 Google Play Icon。

最终传给图像模型的是 `referenceImages[]`。有参考图时：

```json
{
  "generation_mode": "image_to_image_with_prompt"
}
```

无参考图时：

```json
{
  "generation_mode": "text_to_image"
}
```

## 11. S7 重生结果

接口：`POST /api/regenerate-icon`

请求体在通用 Payload 基础上额外包含：

```json
{
  "image": {},
  "promptText": "",
  "promptJson": {}
}
```

返回：

```json
{
  "ok": true,
  "image": {
    "image_id": "",
    "scene_image_id": "",
    "parent_image_id": "",
    "version": 2,
    "regenerate_count": 1,
    "prompt_id": "",
    "prompt_text": "",
    "variant_tag": "",
    "url": "/generated/icon.png",
    "scene_url": "/generated/icon_scene.svg",
    "prompt_summary": "",
    "prompt_source": "S7 edited original prompt",
    "reference_image_count": 0,
    "reference_image_sources": [],
    "reference_image_errors": [],
    "generation_mode": "text_to_image",
    "scene_generation_mode": "scene_template_composite"
  }
}
```

限制：

- `regenerate_count >= 2` 时后端拒绝继续重生。

## 12. S8 导出结果

接口：`POST /api/export-icons`

返回：

```json
{
  "ok": true,
  "export": {
    "package_id": "",
    "zip_url": "/exports/package.zip",
    "files": []
  }
}
```

### 12.1 ExportFile

```json
{
  "image_id": "",
  "size": 1024,
  "filename": "",
  "url": "/exports/package/file.png"
}
```

当前导出规则：

- 默认尺寸：`1024, 512, 256, 128, 64`
- ZIP 只包含 PNG。
- 不包含场景展示 SVG。
- 不包含 manifest JSON。

## 13. QA 结果

接口：`POST /api/qa`

返回：

```json
{
  "ok": true,
  "reports": []
}
```

当前 `qaImages()` 输出与前端展示绑定，后续如果增强视觉质检，应保持 `reports[]` 作为数组结构，并逐步补齐：

```json
{
  "image_id": "",
  "status": "pass",
  "checks": [],
  "notes": []
}
```

## 14. Smoke Test 结果

接口：`POST /api/smoke-test`

请求：

```json
{
  "mode": "quick"
}
```

返回：

```json
{
  "ok": true,
  "result": {
    "ok": true,
    "mode": "quick",
    "started_at": "",
    "finished_at": "",
    "base_url": "",
    "steps": [],
    "io": {}
  }
}
```

mode 可选：

- `quick`：不调用模型。
- `ai`：调用 S2/S4。
- `full`：调用 S2/S4/S5/S8，会消耗图像生成额度。

## 15. 当前文件存储路径

当前版本仍使用本地目录：

```text
uploads/     用户上传参考图
generated/   生成 Icon 和场景 SVG
exports/     多尺寸 PNG 和 ZIP
```

对应 URL：

```text
/uploads/{filename}
/generated/{filename}
/exports/{package_or_file}
```

这些目录已被 `.gitignore` 忽略，不进入版本管理。

## 16. 未来数据库映射建议

未来接数据库时，字段应从当前结构映射，避免重命名。

建议最小表：

### 16.1 tasks

保存 `getApiPayload()` 的主任务字段。

```sql
create table tasks (
  id text primary key,
  product text not null,
  competitors text not null default '',
  platform text not null,
  platform_rules text not null default '',
  emotion jsonb not null default '[]',
  text_enabled text not null default '否',
  badge_text text not null default '',
  reference text not null default '',
  count int not null default 2,
  directions jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 16.2 task_snapshots

保存每个阶段的完整 JSON，便于回放和回滚。

```sql
create table task_snapshots (
  id text primary key,
  task_id text references tasks(id),
  stage text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
```

### 16.3 assets

保存当前 `referenceFiles`、`GeneratedImage.url`、`scene_url`、`ExportFile.url` 对应文件。

```sql
create table assets (
  id text primary key,
  task_id text references tasks(id),
  asset_role text not null,
  name text,
  size bigint,
  type text,
  url text not null,
  public_url text,
  storage_key text,
  created_at timestamptz not null default now()
);
```

### 16.4 google_play_results

保存 `/api/google-play` 的完整返回。

```sql
create table google_play_results (
  id text primary key,
  task_id text references tasks(id),
  google_play jsonb not null,
  created_at timestamptz not null default now()
);
```

### 16.5 analysis_results

保存 `/api/analyze` 的返回。

```sql
create table analysis_results (
  id text primary key,
  task_id text references tasks(id),
  analysis jsonb not null,
  created_at timestamptz not null default now()
);
```

### 16.6 prompt_plans

保存 `promptOptimizations` 和最终 `promptJson`。

```sql
create table prompt_plans (
  id text primary key,
  task_id text references tasks(id),
  prompt_optimizations jsonb not null default '[]',
  prompt_json jsonb not null default '[]',
  prompt_template text,
  prompt_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);
```

### 16.7 generated_images

保存 `/api/generate-icons` 和 `/api/regenerate-icon` 返回。

```sql
create table generated_images (
  id text primary key,
  task_id text references tasks(id),
  image jsonb not null,
  created_at timestamptz not null default now()
);
```

### 16.8 export_packages

保存 `/api/export-icons` 返回。

```sql
create table export_packages (
  id text primary key,
  task_id text references tasks(id),
  export jsonb not null,
  created_at timestamptz not null default now()
);
```

### 16.9 competitors

竞品实体 MVP 表。前期只保留支撑竞品入库、竞品看板、评分、手动/定时更新所需的基础字段。

```json
{
  "competitor_id": "",
  "product_id": "",
  "competitor_name": "",
  "app_id": "",
  "store_url": "",
  "developer": "",
  "category": "",
  "short_description": "",
  "icon_url": "",
  "source_query": "",
  "raw_profile": {},
  "total_score": 0,
  "score_breakdown": {},
  "score_reasons": {},
  "decision": "manual_review",
  "config_version": "",
  "last_generated_at": "",
  "generated_by": "manual",
  "needs_refresh": false,
  "refresh_reason": "",
  "created_at": "",
  "updated_at": ""
}
```

字段说明：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `competitor_id` | string | 竞品唯一 ID |
| `product_id` | string | 关联本品 |
| `competitor_name` | string | 竞品名称 |
| `app_id` | string | Google Play 包名 |
| `store_url` | string | 商店链接 |
| `developer` | string | 开发商 |
| `category` | string | 商店分类 |
| `short_description` | string | 商店短描述 |
| `icon_url` | string | 竞品 Icon |
| `source_query` | string | 当时用于检索该竞品的关键词 |
| `raw_profile` | object | 原始抓取结果备份 |
| `total_score` | number | 当前总分 |
| `score_breakdown` | object | 单项得分明细 |
| `score_reasons` | object | 单项得分原因 |
| `decision` | string | 分层结果 |
| `config_version` | string | 本次评分使用的规则版本 |
| `last_generated_at` | string | 上次评分生成时间，精确到分钟 |
| `generated_by` | string | 评分来源：手动更新或定时更新 |
| `needs_refresh` | boolean | 是否因配置变更需要重新评分 |
| `refresh_reason` | string | 待更新原因 |
| `created_at` | string | 创建时间 |
| `updated_at` | string | 更新时间 |

`decision` 枚举：

```json
[
  "auto_accept",
  "manual_review",
  "auto_reject"
]
```

`score_breakdown` 示例：

```json
{
  "category_match": 5,
  "name_keyword_similarity": 2,
  "business_model_match": 1,
  "same_developer_bonus": 0
}
```

建议数据库表：

```sql
create table competitors (
  competitor_id text primary key,
  product_id text not null,
  competitor_name text not null,
  app_id text,
  store_url text,
  developer text,
  category text,
  short_description text,
  icon_url text,
  source_query text,
  raw_profile jsonb not null default '{}',
  total_score numeric not null default 0,
  score_breakdown jsonb not null default '{}',
  score_reasons jsonb not null default '{}',
  decision text not null default 'manual_review',
  config_version text,
  last_generated_at timestamptz,
  generated_by text not null default 'manual',
  needs_refresh boolean not null default false,
  refresh_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 16.10 competitor_scoring_configs

竞品评分配置表。每次用户调整配置后生成新的配置版本，后续手动更新和定时更新都使用当前 `is_active = true` 的最新配置。

```json
{
  "config_id": "",
  "config_version": "v1.0.0",
  "is_active": true,
  "scoring_rules": {},
  "review_thresholds": {},
  "created_at": "",
  "updated_at": ""
}
```

名称关键词近似度规则：

```json
{
  "name_keyword_similarity": {
    "exact_core_keyword_match": {
      "label": "核心关键词高度重合",
      "description": "本品和竞品名称中有核心词完全一致或主干词高度一致",
      "default_score": 3,
      "min_score": -10,
      "max_score": 10,
      "editable": true
    },
    "semantic_keyword_match": {
      "label": "关键词语义近似",
      "description": "无完全相同词，但存在明显同义或近义关系",
      "default_score": 2,
      "min_score": -10,
      "max_score": 10,
      "editable": true
    },
    "weak_topic_match": {
      "label": "关键词弱相关",
      "description": "只有题材、场景、玩法词间接相关",
      "default_score": 1,
      "min_score": -10,
      "max_score": 10,
      "editable": true
    },
    "no_keyword_relation": {
      "label": "名称关键词无关",
      "description": "名称层面无明显关键词关系",
      "default_score": 0,
      "min_score": -10,
      "max_score": 10,
      "editable": true
    }
  }
}
```

不设置 `misleading_or_cross_category`。跨品类或误导情况应交给分类匹配、商业模式匹配、敏感信号等其他维度处理。

审核阈值配置：

```json
{
  "review_thresholds": {
    "auto_accept_min_score": {
      "label": "自动入库",
      "description": "总分大于等于该值，直接进入竞品库",
      "default_score": 5,
      "min_score": -50,
      "max_score": 50,
      "editable": true
    },
    "auto_reject_max_score": {
      "label": "自动排除",
      "description": "总分小于等于该值，自动排除",
      "default_score": 1,
      "min_score": -50,
      "max_score": 50,
      "editable": true
    }
  }
}
```

推荐分层逻辑：

```text
total_score >= auto_accept_min_score -> auto_accept
total_score <= auto_reject_max_score -> auto_reject
其他 -> manual_review
```

建议数据库表：

```sql
create table competitor_scoring_configs (
  config_id text primary key,
  config_version text not null,
  is_active boolean not null default false,
  scoring_rules jsonb not null default '{}',
  review_thresholds jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

当前前端运行态会额外保存：

```json
{
  "competitor_auto_update_enabled": false
}
```

说明：该字段用于控制浏览器端 1 分钟自动刷新评分的开关。未来接入云数据库和服务端定时任务后，可迁移为服务端 job 配置。

### 16.11 竞品配置变更处理

配置调整后，不直接覆盖已存竞品评分结果。

保存新配置时：

1. 创建新的 `config_version`。
2. 将新配置标记为 `is_active = true`。
3. 将旧配置标记为 `is_active = false`。
4. 将受影响竞品标记为 `needs_refresh = true`。

手动更新：

```json
{
  "generated_by": "manual",
  "config_version": "active_config_version",
  "last_generated_at": "2026-06-05 14:32",
  "needs_refresh": false
}
```

定时自动更新：

```json
{
  "generated_by": "scheduled",
  "config_version": "active_config_version",
  "last_generated_at": "2026-06-05 14:32",
  "needs_refresh": false
}
```

定时任务建议只处理 `needs_refresh = true` 的竞品，并设置批量上限，避免一次性全量重算。

## 17. 迁移原则

- API 字段保持当前命名，不为数据库重新命名。
- 数据库优先保存完整 JSON，再逐步拆常用检索字段。
- Prompt 模板、模型配置继续以 `icon-agent.config.json` 为主，后续再做版本化。
- 对象存储接入后，`url/publicUrl` 字段继续保留，只把文件来源从本地目录替换为云存储。

## 18. 预留字段规范

当前代码尚未实现、但后续大概率需要的能力，可以在数据结构中预留字段。预留字段必须遵守以下规则：

- 不改变当前已运行字段的含义。
- 不替换当前字段，只做补充。
- 字段名使用 `reserved_` 前缀，或统一放入 `reserved` 对象。
- 当前接口可以忽略这些字段。
- 后续真正实现功能时，再把字段从 `reserved` 提升为正式字段。

推荐预留结构：

```json
{
  "reserved": {
    "storage": {},
    "database": {},
    "user": {},
    "billing": {},
    "qa": {},
    "versioning": {},
    "workflow": {}
  }
}
```

## 19. 当前结构中的建议预留字段

### 19.1 通用 Payload 预留

可追加到 `getApiPayload()` 对应的任务上下文中。

```json
{
  "reserved": {
    "task_id": "",
    "user_id": "",
    "project_id": "",
    "workspace_id": "",
    "session_id": "",
    "schema_version": "current-runtime-v1",
    "client_version": "",
    "source": "web"
  }
}
```

用途：

- `task_id`：未来保存历史任务。
- `user_id`：未来支持登录和多用户。
- `project_id` / `workspace_id`：未来支持团队项目空间。
- `schema_version`：后续字段升级时用于兼容。
- `client_version`：定位线上问题。

### 19.2 ReferenceFile 预留

当前字段：

```json
{
  "name": "",
  "size": 0,
  "type": "image/png",
  "dataUrl": "",
  "url": "",
  "publicUrl": "",
  "uploadStatus": ""
}
```

建议预留：

```json
{
  "reserved": {
    "asset_id": "",
    "storage_provider": "",
    "storage_bucket": "",
    "storage_key": "",
    "checksum": "",
    "width": 0,
    "height": 0,
    "expires_at": "",
    "is_public": true
  }
}
```

用途：

- 对象存储接入后，`storage_*` 保存云端文件位置。
- `checksum` 用于去重和校验。
- `width/height` 用于视觉模型和前端预览。
- `expires_at` 用于临时 URL 管理。

### 19.3 GooglePlayProfile 预留

当前字段：

```json
{
  "role": "product",
  "app_id": "",
  "app_title": "",
  "developer": "",
  "category": "",
  "rating": "",
  "installs": "",
  "short_description": "",
  "detail_url": ""
}
```

建议预留：

```json
{
  "reserved": {
    "country": "US",
    "language": "en",
    "price": "",
    "iap": false,
    "content_rating": "",
    "last_updated": "",
    "version": "",
    "review_count": "",
    "raw_html_snapshot_url": "",
    "parse_status": "success"
  }
}
```

用途：

- 后续支持不同国家和语言的 Google Play 解析。
- 保留解析状态，方便处理 Google Play 抓取失败。
- 保存页面快照，便于复查历史任务。

### 19.4 AnalysisResult 预留

当前 `analysis` 已包含 `ICON_CREATIVE_PROTOCOL`、`product_analysis`、`product_icon_analysis`、`competitor_icon_analysis`、`generation_prompt_fields` 等字段。

建议预留：

```json
{
  "reserved": {
    "model_provider": "",
    "model_name": "",
    "model_request_id": "",
    "model_latency_ms": 0,
    "token_usage": {},
    "cost_estimate": {},
    "raw_model_output": "",
    "input_image_count": 0,
    "skipped_image_reasons": []
  }
}
```

用途：

- 成本统计。
- 调试模型输出。
- 记录哪些图片没有被模型读取。
- 后续比较不同模型分析质量。

### 19.5 PromptJson 预留

当前 `promptJson[]` 是 S5 的唯一生成依据。

建议预留：

```json
{
  "reserved": {
    "prompt_version": "",
    "template_version": "",
    "template_id": "",
    "prompt_hash": "",
    "approved_by_user": false,
    "approved_at": "",
    "safety_check_id": "",
    "expected_generation_mode": "",
    "reference_asset_ids": []
  }
}
```

用途：

- Prompt 模板版本管理。
- 用户确认记录。
- Prompt 去重。
- 绑定参考图资产 ID。

### 19.6 GeneratedImage 预留

当前字段：

```json
{
  "image_id": "",
  "scene_image_id": "",
  "prompt_id": "",
  "variant_tag": "",
  "url": "",
  "scene_url": "",
  "prompt_summary": "",
  "prompt_source": "",
  "reference_image_count": 0,
  "reference_image_sources": [],
  "reference_image_errors": [],
  "generation_mode": "",
  "scene_generation_mode": ""
}
```

建议预留：

```json
{
  "reserved": {
    "image_provider": "",
    "image_model": "",
    "model_request_id": "",
    "seed": "",
    "width": 1024,
    "height": 1024,
    "mime_type": "image/png",
    "has_alpha": true,
    "storage_asset_id": "",
    "qa_report_id": "",
    "selected": false,
    "rejected_reason": ""
  }
}
```

用途：

- 记录图像生成模型。
- 记录透明背景检测结果。
- 记录 QA 和用户选择。
- 后续支持生成复现和成本追踪。

### 19.7 QA Report 预留

当前 QA 仍是轻量结构，后续建议预留：

```json
{
  "reserved": {
    "vision_reverse_caption": "",
    "must_include_hits": [],
    "must_not_include_hits": [],
    "identity_match_score": 0,
    "readability_64px_score": 0,
    "contrast_score": 0,
    "subject_occupancy_score": 0,
    "background_clutter_score": 0,
    "text_readability_score": 0,
    "final_recommendation": "pass"
  }
}
```

用途：

- 后续真正实现 S6 自动质检。
- 将审美判断转化为可解释评分。

### 19.8 ExportPackage 预留

当前 S8 导出只包含 PNG ZIP。

建议预留：

```json
{
  "reserved": {
    "export_id": "",
    "storage_asset_id": "",
    "zip_checksum": "",
    "download_expires_at": "",
    "include_scene_preview": false,
    "include_manifest": false,
    "platform_preset": "generic"
  }
}
```

用途：

- 云存储下载链接管理。
- 后续如果某些平台需要 manifest，可通过布尔字段开启，但默认仍关闭。
- 校验 ZIP 完整性。

## 20. 预留字段落库策略

在数据库中不建议立刻为所有预留字段建独立列。建议：

- 当前核心检索字段单独建列。
- 预留字段整体放在 `reserved jsonb`。
- 当某个预留字段开始被频繁查询，再拆成正式列。

示例：

```sql
alter table tasks add column reserved jsonb not null default '{}';
alter table assets add column reserved jsonb not null default '{}';
alter table generated_images add column reserved jsonb not null default '{}';
alter table export_packages add column reserved jsonb not null default '{}';
```

## 21. 兼容原则

新增预留字段时，前端和后端都必须允许缺省：

```js
const reserved = input.reserved || {};
```

任何预留字段不能成为当前 S1-S8 主流程的必填字段。只有当功能正式上线后，才可以进入必填校验。
