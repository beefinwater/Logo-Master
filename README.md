# 应用icon创作大师 H5

这是一个静态 H5 原型，用来承载「应用icon创作大师」的 8-stage 工作流。

## 打开方式

推荐用本地模型服务打开，这样可以真正调用模型：

方式一，使用启动脚本：

```powershell
cd "F:\AI Codex\icon-agent-h5"
.\start.ps1
```

首次运行会自动创建 `.env.local`。打开它，把 `OPENAI_API_KEY=sk-your-key-here` 替换成你的真实 Key 后，再运行一次 `.\start.ps1`。

方式二，手动设置环境变量：

```powershell
$env:OPENAI_API_KEY="你的 OpenAI API Key"
node server.js
```

也可以在项目根目录新建 `.env.local`：

```text
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_TEXT_MODEL=gpt-4.1
OPENAI_IMAGE_MODEL=gpt-image-1
```

然后直接运行：

```powershell
node server.js
```

然后访问：

```text
http://localhost:8787
```

也可以直接双击打开静态页查看界面：

```text
F:\AI Codex\icon-agent-h5\index.html
```

但静态文件模式只能展示界面，不能真正调用模型。

## 已实现交互

- S1：产品、竞品、平台、情绪目标、角标文字、敏感点、参考素材输入
- S2：Icon 风格解析与共性建模展示
- S3：方案数量与生成方向选择
- S4：JSON Prompt 自检结果展示，不暴露内部 prompt
- S5：Icon 原图与场景展示图模拟卡片
- S6：自动质检与用户决策
- S7：微调 / 重生执行说明
- S8：多尺寸导出与交付清单

## 已接入的真实模型接口

- `GET /api/health`：检查本地模型服务与 API Key 状态
- `POST /api/analyze`：调用文本/多模态模型生成产品画像、风格签名、差异策略与 Prompt 计划
- `POST /api/generate-icons`：调用图像模型逐张生成 icon，结果保存到 `generated/`
- `POST /api/qa`：调用视觉模型对生成 icon 做自动质检

默认模型可通过环境变量调整：

```powershell
$env:OPENAI_TEXT_MODEL="gpt-4.1"
$env:OPENAI_IMAGE_MODEL="gpt-image-1"
```

## 切换到 Kimi

可以把“产品分析 / 风格建模 / 视觉质检 / 图片生成”切换到 Kimi：

```text
AI_PROVIDER=kimi
IMAGE_PROVIDER=kimi
KIMI_API_KEY=你的 Kimi API Key
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_TEXT_MODEL=kimi-k2.6
KIMI_IMAGE_MODEL=kimi-k2.6
KIMI_IMAGE_ENDPOINT=https://api.moonshot.cn/v1/images/generations
```

如果你的 Kimi 图片生成接口地址不是 `/images/generations`，只需要改 `KIMI_IMAGE_ENDPOINT`。

## 切换到阿里云百炼 / 通义万相

```text
AI_PROVIDER=aliyun
IMAGE_PROVIDER=aliyun
DASHSCOPE_API_KEY=你的 DashScope API Key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/api/v1
ALIYUN_TEXT_MODEL=qwen-plus
ALIYUN_IMAGE_MODEL=wan2.7-image
ALIYUN_IMAGE_SIZE=1K
```

图像生成会使用 DashScope 异步任务接口，生成成功后自动下载图片到 `generated/`。

## 切换到火山引擎方舟 / 豆包

```text
AI_PROVIDER=volcengine
IMAGE_PROVIDER=volcengine
ARK_API_KEY=你的火山方舟 API Key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
VOLCENGINE_TEXT_MODEL=你的文本或视觉理解模型/接入点ID
VOLCENGINE_IMAGE_MODEL=你的图像生成模型/接入点ID
```

默认会按 OpenAI 兼容格式调用：

- `POST /chat/completions`：S2 分析与 S6 质检
- `POST /images/generations`：S5 图像生成

如果你在火山控制台创建的是自定义接入点，把模型名改成对应接入点 ID 即可。

## 后续接真实服务的位置

- Google Play 检索：替换 S1 的 mock 输出
- Icon 风格分析：接入视觉模型或多模态分析接口
- JSON Prompt 构建：由后端生成并只返回校验摘要
- GPT Image 生成：S5 按方案顺序逐张生成
- Vision QA：S6 自动反解、64px 识别度和平台风险检测
- 导出服务：S8 生成 PNG 多尺寸、ZIP 和 manifest
