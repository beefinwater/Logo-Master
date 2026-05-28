# Railway deploy notes

For the minimal public deployment:

1. Push this folder to GitHub.
2. Create a Railway project from the GitHub repo.
3. Set these Railway Variables:

```text
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your-deepseek-key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_TEXT_MODEL=deepseek-v4-pro

IMAGE_PROVIDER=volcengine
ARK_API_KEY=your-ark-key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
VOLCENGINE_IMAGE_MODEL=doubao-seedream-5-0-lite-260128
VOLCENGINE_IMAGE_SIZE=2048x2048

PUBLIC_BASE_URL=https://your-railway-domain.up.railway.app
```

`PUBLIC_BASE_URL` is important. Uploaded reference images are saved under `/uploads/` and exposed as public HTTPS URLs. DeepSeek can use those URLs as `image_url` inputs only when the deployment domain is public and the response header is an image content type such as `image/png` or `image/jpeg`.

The minimal version stores generated files, exported ZIPs, and uploaded references on the app filesystem. This is enough for demo and immediate download flows, but files can be lost after a redeploy or container restart. For production, move `uploads/`, `generated/`, and `exports/` to object storage such as Cloudflare R2, S3, OSS, or COS.
