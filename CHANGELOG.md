# Changelog

## v0.1.0 - Initial Deployable Version

This is the first formal baseline version of 应用icon创作大师.

### Core Capabilities

- S1 product input and Google Play lookup for the target app and up to 3 competitors.
- User reference image upload, limited to 2 images.
- S2 AI analysis for product semantics, audience, visual style, product icon, competitor icons, and prompt-ready generation fields.
- Editable platform constraint rules instead of relying only on AI-generated compliance text.
- S3 prompt assembly with configurable prompt templates and up to 2 generation variants.
- S4 prompt risk check using a configurable model prompt template.
- S5 icon generation using the confirmed S4 prompt and available reference images.
- Automatic scene preview generation for visual review in the web UI.
- S7 regeneration flow with editable original prompt and limited retry count.
- S8 multi-size PNG export for selected icons: 1024, 512, 256, 128, and 64 px.
- Export ZIP now includes only resized PNG icon files, excluding scene SVG files and manifest JSON.
- Built-in smoke test panel and CLI smoke test for quick, AI, and full workflow checks.

### Configuration

- Model providers and prompt templates are managed through `icon-agent.config.json`.
- Local secrets are read from `.env.local`, which is ignored by git.
- Public deployment secrets should be configured through Railway environment variables.

### Deployment Baseline

- Node.js server entry: `server.js`.
- Static frontend entry: `index.html`.
- Railway can deploy directly from the GitHub `main` branch.

### Validation

- `npm run smoke` passes locally.
- `node --check app.js` passes.
- `node --check server.js` passes.
- `icon-agent.config.json` parses successfully.

### Notes

- Full icon generation and full smoke tests consume image generation credits.
- Railway deployments should set `PUBLIC_BASE_URL` to the public app URL so uploaded references can be resolved correctly.
- Generated files, exports, uploads, local secrets, dependencies, and manual upload bundles are excluded from version control.
