const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { execFile } = require("node:child_process");
const sharp = require("sharp");
const AdmZip = require("adm-zip");

const rootDir = __dirname;
const appConfig = loadAppConfig();
const outputDir = path.join(rootDir, "generated");
const exportDir = path.join(rootDir, "exports");
const uploadDir = path.join(rootDir, "uploads");
const port = Number(process.env.PORT || 8787);

loadLocalEnv();

const apiKey = process.env.OPENAI_API_KEY || "";
const aiProvider = (process.env.AI_PROVIDER || appConfig.models?.text?.provider || "openai").toLowerCase();
const imageProvider = (process.env.IMAGE_PROVIDER || appConfig.models?.image?.provider || "openai").toLowerCase();
const kimiApiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || "";
const kimiBaseUrl = (process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1").replace(/\/+$/, "");
const deepseekApiKey = process.env.DEEPSEEK_API_KEY || "";
const deepseekBaseUrl = (process.env.DEEPSEEK_BASE_URL || appConfig.models?.text?.base_url || "https://api.deepseek.com/v1").replace(/\/+$/, "");
const dashscopeApiKey = process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_API_KEY || "";
const dashscopeBaseUrl = (process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/api/v1").replace(/\/+$/, "");
const arkApiKey = process.env.ARK_API_KEY || process.env.VOLCENGINE_API_KEY || "";
const arkBaseUrl = (process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/+$/, "");
const textModel = process.env.OPENAI_TEXT_MODEL || "gpt-4.1";
const kimiTextModel = process.env.KIMI_TEXT_MODEL || "kimi-k2.6";
const deepseekTextModel = process.env.DEEPSEEK_TEXT_MODEL || appConfig.models?.text?.model || "deepseek-v4-pro";
const aliyunTextModel = process.env.ALIYUN_TEXT_MODEL || "qwen-plus";
const volcengineTextModel = process.env.VOLCENGINE_TEXT_MODEL || process.env.ARK_TEXT_MODEL || "doubao-seed-1-6-251015";
const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const kimiImageModel = process.env.KIMI_IMAGE_MODEL || process.env.KIMI_TEXT_MODEL || "kimi-k2.6";
const kimiImageEndpoint = process.env.KIMI_IMAGE_ENDPOINT || `${kimiBaseUrl}/images/generations`;
const aliyunImageModel = process.env.ALIYUN_IMAGE_MODEL || "wan2.7-image";
const aliyunImageSize = process.env.ALIYUN_IMAGE_SIZE || "1K";
const volcengineImageModel = process.env.VOLCENGINE_IMAGE_MODEL || process.env.ARK_IMAGE_MODEL || appConfig.models?.image?.model || "doubao-seedream-3-0-t2i-250415";
const volcengineImageSize = process.env.VOLCENGINE_IMAGE_SIZE || appConfig.models?.image?.size || "2048x2048";

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(exportDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

function loadLocalEnv() {
  const envPath = path.join(rootDir, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadAppConfig() {
  const configPath = path.join(rootDir, "icon-agent.config.json");
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    console.warn(`Failed to read icon-agent.config.json: ${error.message}`);
    return {};
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".zip": "application/zip",
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    ...corsHeaders(),
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 30 * 1024 * 1024) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function parseDataUrl(dataUrl = "") {
  const match = String(dataUrl).match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error("Invalid image data URL.");
  return {
    mime: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], "base64"),
  };
}

function renderTemplate(template = "", values = {}) {
  return String(template).replace(/\{([A-Z0-9_]+)\}/g, (_, key) => {
    const value = values[key];
    if (typeof value === "string") return value;
    return JSON.stringify(value ?? "", null, 2);
  });
}

function extensionFromMime(mime = "") {
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  return "";
}

function publicBaseUrl(req) {
  const configured = (process.env.PUBLIC_BASE_URL || process.env.APP_PUBLIC_URL || "").replace(/\/+$/, "");
  if (configured) return configured;
  const proto = req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http");
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${port}`;
  return `${String(proto).split(",")[0]}://${String(host).split(",")[0]}`;
}

async function uploadReferenceImage(input, req) {
  const { mime, buffer } = parseDataUrl(input.dataUrl || input.image || "");
  if (!mime.startsWith("image/")) throw new Error("Only image uploads are supported.");
  if (buffer.length > 8 * 1024 * 1024) throw new Error("Reference image must be 8MB or smaller.");

  const ext = extensionFromMime(mime);
  if (!ext) throw new Error(`Unsupported image type: ${mime}`);

  const safeBase = sanitizeFileName(path.basename(input.name || "reference", path.extname(input.name || ""))) || "reference";
  const id = `${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
  const filename = `${safeBase}_${id}${ext}`;
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, buffer);

  const urlPath = `/uploads/${filename}`;
  return {
    id,
    name: input.name || filename,
    type: mime,
    size: buffer.length,
    url: urlPath,
    public_url: `${publicBaseUrl(req)}${urlPath}`,
  };
}

async function openaiFetch(endpoint, payload) {
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY. Please set it before starting the server.");
  }

  try {
    return await openaiFetchWithNode(endpoint, payload);
  } catch (error) {
    if (!/fetch failed|Connect Timeout|UND_ERR_CONNECT_TIMEOUT/i.test(error.message + " " + (error.cause?.code || ""))) {
      throw error;
    }
    console.warn("Node fetch failed; retrying OpenAI request through PowerShell HTTPS.");
    return openaiFetchWithPowerShell(endpoint, payload);
  }
}

async function kimiFetch(endpoint, payload) {
  if (!kimiApiKey) {
    throw new Error("Missing KIMI_API_KEY. Please set it in .env.local before starting the server.");
  }

  const response = await fetch(`${kimiBaseUrl}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kimiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseOpenAIResponse(response.status, response.statusText, await response.text());
}

async function deepseekFetch(endpoint, payload) {
  if (!deepseekApiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY. Please set it in .env.local before starting the server.");
  }

  const response = await fetch(`${deepseekBaseUrl}/${endpoint.replace(/^\/+/, "")}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deepseekApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseOpenAIResponse(response.status, response.statusText, await response.text());
}

async function kimiFetchAbsolute(url, payload) {
  if (!kimiApiKey) {
    throw new Error("Missing KIMI_API_KEY. Please set it in .env.local before starting the server.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kimiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseOpenAIResponse(response.status, response.statusText, await response.text());
}

async function dashscopeFetch(pathname, payload, options = {}) {
  if (!dashscopeApiKey) {
    throw new Error("Missing DASHSCOPE_API_KEY. Please set it in .env.local before starting the server.");
  }

  const response = await fetch(`${dashscopeBaseUrl}/${pathname.replace(/^\/+/, "")}`, {
    method: options.method || "POST",
    headers: {
      Authorization: `Bearer ${dashscopeApiKey}`,
      "Content-Type": "application/json",
      ...(options.async ? { "X-DashScope-Async": "enable" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  return parseOpenAIResponse(response.status, response.statusText, await response.text());
}

async function dashscopeGet(pathname) {
  if (!dashscopeApiKey) {
    throw new Error("Missing DASHSCOPE_API_KEY. Please set it in .env.local before starting the server.");
  }

  const response = await fetch(`${dashscopeBaseUrl}/${pathname.replace(/^\/+/, "")}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${dashscopeApiKey}` },
  });

  return parseOpenAIResponse(response.status, response.statusText, await response.text());
}

async function arkFetch(pathname, payload) {
  if (!arkApiKey) {
    throw new Error("Missing ARK_API_KEY. Please set it in .env.local before starting the server.");
  }

  const response = await fetch(`${arkBaseUrl}/${pathname.replace(/^\/+/, "")}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${arkApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseOpenAIResponse(response.status, response.statusText, await response.text());
}

async function openaiFetchWithNode(endpoint, payload) {
  const response = await fetch(`https://api.openai.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseOpenAIResponse(response.status, response.statusText, await response.text());
}

function parseOpenAIResponse(status, statusText, text) {
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (status < 200 || status >= 300) {
    const message = data?.error?.message || data?.raw || statusText || `HTTP ${status}`;
    throw new Error(message);
  }

  return data;
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { maxBuffer: 1024 * 1024 * 80, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function openaiFetchWithPowerShell(endpoint, payload) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "icon-agent-openai-"));
  const bodyPath = path.join(tmpDir, "request.json");
  const responsePath = path.join(tmpDir, "response.json");
  const statusPath = path.join(tmpDir, "status.txt");
  fs.writeFileSync(bodyPath, JSON.stringify(payload), "utf8");

  const command = `
$ErrorActionPreference = "Stop"
$body = Get-Content -LiteralPath ${psQuote(bodyPath)} -Raw
try {
  Add-Type -AssemblyName System.Net.Http
  $client = [System.Net.Http.HttpClient]::new()
  $client.Timeout = [TimeSpan]::FromSeconds(300)
  $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $env:OPENAI_API_KEY)
  $content = [System.Net.Http.StringContent]::new($body, [System.Text.Encoding]::UTF8, "application/json")
  $response = $client.PostAsync(${psQuote(`https://api.openai.com/v1/${endpoint}`)}, $content).Result
  $responseBody = $response.Content.ReadAsStringAsync().Result
  Set-Content -LiteralPath ${psQuote(statusPath)} -Value ([int]$response.StatusCode) -Encoding ASCII
  Set-Content -LiteralPath ${psQuote(responsePath)} -Value $responseBody -Encoding UTF8
  if (-not $response.IsSuccessStatusCode) { exit 1 }
} catch {
  $status = 500
  $content = $_.Exception.Message
  if (Test-Path ${psQuote(statusPath)}) { $status = [int](Get-Content -LiteralPath ${psQuote(statusPath)} -Raw) }
  if (Test-Path ${psQuote(responsePath)}) { $content = Get-Content -LiteralPath ${psQuote(responsePath)} -Raw }
  Set-Content -LiteralPath ${psQuote(statusPath)} -Value $status -Encoding ASCII
  Set-Content -LiteralPath ${psQuote(responsePath)} -Value $content -Encoding UTF8
  exit 1
}
`;

  try {
    await execFileAsync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      env: { ...process.env, OPENAI_API_KEY: apiKey },
    });
  } catch {
    // The PowerShell script writes the response body/status even for OpenAI 4xx/5xx errors.
  }

  const status = Number(fs.existsSync(statusPath) ? fs.readFileSync(statusPath, "utf8").trim() : "500");
  const text = fs.existsSync(responsePath) ? fs.readFileSync(responsePath, "utf8") : "";
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return parseOpenAIResponse(status, `HTTP ${status}`, text);
}

async function fetchTextWithFallback(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (response.ok) return response.text();
    throw new Error(`HTTP ${response.status}`);
  } catch {
    return fetchTextWithPowerShell(url);
  }
}

async function fetchTextWithPowerShell(url) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "icon-agent-web-"));
  const outputPath = path.join(tmpDir, "response.txt");
  const statusPath = path.join(tmpDir, "status.txt");
  const command = `
$ErrorActionPreference = "Stop"
try {
  $headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"; "Accept-Language" = "en-US,en;q=0.9" }
  $response = Invoke-WebRequest -Uri ${psQuote(url)} -Headers $headers -TimeoutSec 60
  Set-Content -LiteralPath ${psQuote(statusPath)} -Value ([int]$response.StatusCode) -Encoding ASCII
  Set-Content -LiteralPath ${psQuote(outputPath)} -Value $response.Content -Encoding UTF8
} catch {
  Set-Content -LiteralPath ${psQuote(statusPath)} -Value 500 -Encoding ASCII
  Set-Content -LiteralPath ${psQuote(outputPath)} -Value $_.Exception.Message -Encoding UTF8
  exit 1
}
`;

  try {
    await execFileAsync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      maxBuffer: 1024 * 1024 * 30,
    });
  } catch {
    // Read the captured response below.
  }

  const status = Number(fs.existsSync(statusPath) ? fs.readFileSync(statusPath, "utf8").trim() : "500");
  const text = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (status < 200 || status >= 300) throw new Error(`Fetch failed for ${url}: ${text || status}`);
  return text;
}

async function fetchWithFallbackBinary(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mime: response.headers.get("content-type")?.split(";")[0] || "image/png",
    };
  } catch {
    return fetchBinaryWithPowerShell(url);
  }
}

async function fetchBinaryWithPowerShell(url) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "icon-agent-img-"));
  const outputPath = path.join(tmpDir, "image.bin");
  const metaPath = path.join(tmpDir, "meta.json");
  const command = `
$ErrorActionPreference = "Stop"
try {
  Add-Type -AssemblyName System.Net.Http
  $client = [System.Net.Http.HttpClient]::new()
  $client.Timeout = [TimeSpan]::FromSeconds(90)
  $client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
  $response = $client.GetAsync(${psQuote(url)}).Result
  $bytes = $response.Content.ReadAsByteArrayAsync().Result
  [System.IO.File]::WriteAllBytes(${psQuote(outputPath)}, $bytes)
  $mime = "image/png"
  if ($response.Content.Headers.ContentType) { $mime = $response.Content.Headers.ContentType.MediaType }
  @{ status = [int]$response.StatusCode; mime = $mime } | ConvertTo-Json | Set-Content -LiteralPath ${psQuote(metaPath)} -Encoding UTF8
  if (-not $response.IsSuccessStatusCode) { exit 1 }
} catch {
  @{ status = 500; mime = "image/png"; error = $_.Exception.Message } | ConvertTo-Json | Set-Content -LiteralPath ${psQuote(metaPath)} -Encoding UTF8
  exit 1
}
`;

  try {
    await execFileAsync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      maxBuffer: 1024 * 1024 * 30,
    });
  } catch {
    // Inspect the meta file below.
  }

  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8").replace(/^\uFEFF/, "")) : { status: 500 };
  if (!fs.existsSync(outputPath) || meta.status < 200 || meta.status >= 300) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(meta.error || `Image download failed: HTTP ${meta.status}`);
  }
  const buffer = fs.readFileSync(outputPath);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return { buffer, mime: meta.mime || "image/png" };
}

function extractText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  const chunks = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" || content.type === "text") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function htmlDecode(value = "") {
  return String(value)
    .replace(/\\u003d/g, "=")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\n/g, "\n");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function imageInputItems(files = []) {
  return files
    .filter((file) => (file.publicUrl || file.dataUrl) && file.type?.startsWith("image/"))
    .slice(0, 2)
    .map((file) => ({
      type: "input_image",
      image_url: file.dataUrl || localUploadDataUrlFromPublicUrl(file.publicUrl) || (String(file.publicUrl || "").includes("/uploads/") ? "" : file.publicUrl),
      public_url: file.publicUrl || "",
      detail: "low",
      name: file.name || "",
      file_type: file.type || "",
    }))
    .filter((item) => item.image_url);
}

function mimeTypeFromFileName(filename = "") {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return "image/png";
}

function localUploadDataUrlFromPublicUrl(publicUrl = "") {
  if (!publicUrl) return "";
  let pathname = "";
  try {
    pathname = new URL(publicUrl, getPublicBaseUrl()).pathname;
  } catch {
    pathname = publicUrl;
  }
  if (!pathname.startsWith("/uploads/")) return "";
  const filename = path.basename(decodeURIComponent(pathname));
  const resolved = path.resolve(uploadDir, filename);
  if (!resolved.startsWith(path.resolve(uploadDir) + path.sep) || !fs.existsSync(resolved)) return "";
  const buffer = fs.readFileSync(resolved);
  return `data:${mimeTypeFromFileName(filename)};base64,${buffer.toString("base64")}`;
}

async function visualReferenceInputItems(input) {
  const uploaded = imageInputItems(input.referenceFiles);
  const refs = getGooglePlayReferences(input);
  const competitorRefs = getCompetitorGooglePlayReferences(input);
  const googlePlayUrls = [
    refs.icon,
    refs.featureGraphic,
    ...(refs.screenshots || []).slice(0, 4),
    ...competitorRefs.map((item) => item.icon),
  ].filter(Boolean);

  if (aiProvider === "deepseek") {
    const googlePlay = googlePlayUrls.map((url) => ({
      type: "input_image",
      image_url: url,
      public_url: url,
      detail: "low",
    }));
    return [...uploaded, ...googlePlay].slice(0, 8);
  }

  const googlePlay = [];
  for (const url of googlePlayUrls) {
    try {
      googlePlay.push({
        type: "input_image",
        image_url: await imageUrlToDataUrl(url),
        public_url: url,
        detail: "low",
      });
    } catch (error) {
      console.warn(`Failed to inline Google Play image: ${url} ${error.message}`);
    }
  }
  return [...uploaded, ...googlePlay].slice(0, 8);
}

async function generationReferenceInputItems(input) {
  const uploaded = imageInputItems(input.referenceFiles).map((item, index) => ({
    image: item.image_url,
    source: `用户上传参考图 ${index + 1}`,
  }));
  const refs = getGooglePlayReferences(input);
  const competitorRefs = getCompetitorGooglePlayReferences(input);
  const googlePlayUrls = [
    refs.icon ? { url: refs.icon, source: "主产品 Google Play icon" } : null,
    ...competitorRefs.map((item, index) => (item.icon ? { url: item.icon, source: `竞品 Google Play icon ${index + 1}` } : null)),
  ].filter(Boolean);

  const googlePlay = [];
  const errors = [];
  for (const item of googlePlayUrls) {
    try {
      googlePlay.push({
        image: await imageUrlToDataUrl(normalizeGoogleImageUrl(item.url)),
        source: item.source,
      });
    } catch (error) {
      errors.push({ url: item.url, source: item.source, error: error.message });
      console.warn(`Failed to inline generation reference image: ${item.url} ${error.message}`);
    }
  }

  const refsWithSources = [...uploaded, ...googlePlay].slice(0, 5);
  return {
    images: refsWithSources.filter((item) => item.image).map((item) => item.image),
    sources: refsWithSources.filter((item) => item.image).map((item) => item.source),
    errors,
  };
}

function getCompetitorGooglePlayReferences(input) {
  const packs =
    input.competitorGooglePlayReferences ||
    input.competitor_google_play_references ||
    input.competitor_visual_reference_pack ||
    input.googlePlay?.competitor_visual_reference_pack ||
    [];
  return packs.map((item) => ({
    icon: item.icon || item.app_icon || "",
  }));
}

function normalizeGoogleImageUrl(url) {
  if (!url || !url.includes("play-lh.googleusercontent.com")) return url;
  if (/=[whs]\d+/.test(url)) return url;
  return `${url}=w1024-h1024-rw`;
}

function getGooglePlayReferences(input) {
  const refs =
    input.googlePlayReferences ||
    input.google_play_visual_reference_pack ||
    input.visual_reference_pack ||
    input.googlePlay?.visual_reference_pack ||
    {};
  return {
    icon: refs.icon || refs.app_icon || "",
    featureGraphic: refs.featureGraphic || refs.feature_graphic || refs.feature || "",
    screenshots: refs.screenshots || refs.screen_shots || [],
  };
}

async function imageUrlToDataUrl(url) {
  const response = await fetchWithFallbackBinary(url);
  const mime = response.mime || "image/png";
  return `data:${mime};base64,${response.buffer.toString("base64")}`;
}

async function runStructuredAnalysis({ text, images = [] }) {
  if (aiProvider === "volcengine") {
    const content = [
      { type: "text", text },
      ...images.map((image) => ({
        type: "image_url",
        image_url: { url: image.image_url },
      })),
    ];

    const response = await arkFetch("chat/completions", {
      model: volcengineTextModel,
      messages: [{ role: "user", content }],
      temperature: 0.2,
    });

    return response.choices?.[0]?.message?.content || "";
  }

  if (aiProvider === "aliyun") {
    const content = [
      { type: "text", text },
      ...images.map((image) => ({
        type: "image_url",
        image_url: { url: image.image_url },
      })),
    ];

    const response = await dashscopeFetch("services/aigc/text-generation/generation", {
      model: aliyunTextModel,
      input: { messages: [{ role: "user", content }] },
      parameters: { temperature: 0.2 },
    });

    return response.output?.text || response.output?.choices?.[0]?.message?.content || "";
  }

  if (aiProvider === "kimi") {
    const content = [
      { type: "text", text },
      ...images.map((image) => ({
        type: "image_url",
        image_url: { url: image.image_url },
      })),
    ];

    const response = await kimiFetch("chat/completions", {
      model: kimiTextModel,
      messages: [{ role: "user", content }],
      temperature: 0.2,
    });

    return response.choices?.[0]?.message?.content || "";
  }

  if (aiProvider === "deepseek") {
    const { publicImages, skippedImages } = await deepseekImageInputs(images);
    const imageNotes = skippedImages.length
      ? `\n\nSome reference images are not passed as image_url because they are not stable public direct image URLs. Use these source notes as reference context, and do not claim pixel-level certainty for them:\n${skippedImages
          .map((note, index) => `- Skipped reference ${index + 1}: ${note}`)
          .join("\n")}`
      : "";
    const content = [
      { type: "text", text: `${text}${imageNotes}` },
      ...publicImages.map((url) => ({
        type: "image_url",
        image_url: { url },
      })),
    ];

    let response;
    try {
      response = await deepseekFetch("chat/completions", {
        model: deepseekTextModel,
        messages: [{ role: "user", content: publicImages.length ? content : `${text}${imageNotes}` }],
        temperature: 0.2,
      });
    } catch (error) {
      if (!publicImages.length || !/image_url|unknown variant|expected `text`|expected text/i.test(error.message)) throw error;
      response = await deepseekFetch("chat/completions", {
        model: deepseekTextModel,
        messages: [
          {
            role: "user",
            content: `${text}\n\nImage URL inputs were validated as public direct image URLs, but the current DeepSeek endpoint rejected image_url content. Fall back to text-only analysis using these reference URLs as context:\n${publicImages
              .map((url, index) => `- Reference ${index + 1}: ${url}`)
              .join("\n")}${imageNotes}`,
          },
        ],
        temperature: 0.2,
      });
    }

    return response.choices?.[0]?.message?.content || "";
  }

  const response = await openaiFetch("responses", {
    model: textModel,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text }, ...images],
      },
    ],
  });

  return extractText(response);
}

function referenceImageNote(image = {}) {
  const value = image.image_url || image.url || image.name || "uploaded image";
  if (/^data:/i.test(value)) {
    const mime = value.slice(5, value.indexOf(";") > 0 ? value.indexOf(";") : 32);
    return `uploaded ${mime || "image"} reference`;
  }
  return String(value).slice(0, 240);
}

async function deepseekImageInputs(images = []) {
  const publicImages = [];
  const skippedImages = [];
  for (const image of images.slice(0, 8)) {
    const candidate = image.public_url || image.image_url || image.url || "";
    if (!isPublicHttpUrl(candidate)) {
      skippedImages.push(`${referenceImageNote(image)}; not a public HTTP(S) URL`);
      continue;
    }
    const validation = await validatePublicImageUrl(candidate);
    if (validation.ok) {
      publicImages.push(candidate);
    } else {
      skippedImages.push(`${candidate}; ${validation.reason}`);
    }
  }
  return { publicImages, skippedImages };
}

function isPublicHttpUrl(value = "") {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return false;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".local") ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function validatePublicImageUrl(url) {
  const check = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, {
        method,
        headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") || "";
      if (response.ok && /^image\//i.test(contentType)) return { ok: true, contentType };
      return { ok: false, reason: `Content-Type is "${contentType || "missing"}"` };
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const head = await check("HEAD");
    if (head.ok) return head;
  } catch (error) {
    // Some image CDNs reject HEAD; try a tiny ranged GET below.
  }

  try {
    return await check("GET");
  } catch (error) {
    return { ok: false, reason: error.name === "AbortError" ? "validation timed out" : error.message };
  }
}

function buildWorkflowPayload(input) {
  return {
    product: input.product || "未填写",
    competitors: input.competitors || "无",
    platform: input.platform || "Google Ads",
    imported_platform_rules: input.platformRules || "",
    emotion_target: input.emotion || [],
    text_spec:
      input.textEnabled === "是"
        ? { enabled: true, text: input.badgeText || "", position: "右下角角标", max_chars: 5 }
        : { enabled: false, no_text: true },
    emphasis: input.emphasis || "",
    sensitive: input.sensitive || "",
    reference_notes: input.reference || "",
    uploaded_files: (input.referenceFiles || []).slice(0, 2).map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
    })),
    google_play_profile: input.googlePlayProfile || null,
    google_play_visual_reference_pack: input.googlePlayReferences || null,
    competitor_google_play_profiles: input.competitorGooglePlayProfiles || [],
    competitor_google_play_icons: (input.competitorGooglePlayReferences || []).map((item) => ({
      app_id: item.app_id || "",
      title: item.title || item.app_title || "",
      icon: item.icon || "",
    })),
    variant_count: Number(input.count || 2),
    directions: input.directions || ["点击强化"],
  };
}

async function analyzeWorkflow(input) {
  const workflow = buildWorkflowPayload(input);
  if (appConfig.prompt_templates?.s2_analysis) {
    const configuredPrompt = renderTemplate(appConfig.prompt_templates.s2_analysis, {
      WORKFLOW_JSON: workflow,
      PROTOCOL_SCHEMA_JSON: appConfig.protocol_schema || {},
      OUTPUT_SCHEMA_JSON: appConfig.output_schemas?.s2_analysis || {},
      PROMPT_FIELD_NAMES_JSON: appConfig.prompt_field_names || [],
    });
    const text = await runStructuredAnalysis({
      text: configuredPrompt,
      images: await visualReferenceInputItems(input),
    });
    return normalizeAnalysisResult(parseJsonLoose(text) || { raw_text: text });
  }
  const text = await runStructuredAnalysis({
    text: `你是广告投放 Icon 素材生成 Agent 的 S2 分析器。
你的任务：基于 S1 输入、Google Play 主产品资料、主产品 icon / feature graphic / screenshots、竞品 icon、用户上传参考图，输出产品/竞品/icon 的结构化分析。
注意：平台约束来自 imported_platform_rules，由前端可编辑规则导入维护。你不要分析、改写或生成平台政策约束。

只返回 JSON，不要 Markdown，不要解释。

必须输出以下 JSON 结构，字段缺失时也要给出合理推断，不要留空：
{
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
  "competitor_icon_analysis": [
    {
      "app_title": "",
      "app_id": "",
      "image_content": "",
      "main_subject": "",
      "visual_style": "",
      "color_features": "",
      "composition_features": "",
      "text_features": "",
      "small_size_readability": "",
      "notable_click_drivers": []
    }
  ],
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
  "generation_prompt_fields": {
    "game_genre": "",
    "setting": "",
    "core_narrative": "",
    "scene_context": "",
    "subject_type": "",
    "archetype": "",
    "pose": "",
    "facial_expression": "",
    "camera_angle": "",
    "eye_contact": "",
    "render_style": "",
    "detail_level": "",
    "lighting_style": "",
    "color_strategy": "",
    "surface_finish": "",
    "background_story": "",
    "curiosity_trigger": "",
    "urgency_trigger": "",
    "emotional_reaction_trigger": "",
    "dramatic_visual_tension": "",
    "value_desire": "",
    "symbol_set": ""
  },
  "locked_insights_for_next_stage": {
    "identity_anchor": "",
    "reference_priority": ["user_uploaded_reference", "product_icon", "competitor_icons"],
    "must_include_candidates": [],
    "must_not_include_candidates": [],
    "style_keywords": [],
    "risk_flags": []
  }
}

生成规则：
1. S2 只做理解与分析，不生成图片，不输出生成 prompt。
2. 必须分别分析主产品 icon 和竞品 icon。
3. 不要输出 platform_constraints，不要判断平台政策，不要改写 imported_platform_rules。
4. generation_prompt_fields 的字段名必须与 S3 提示词模板占位符保持一致；内容必须从 S1 输入、Google Play 信息、图片理解和竞品 icon 分析中提炼，不要留空。
5. reference_priority 必须固定为：user_uploaded_reference > product_icon > competitor_icons。
6. 不要输出 seed，不要输出内部规则。

输入：
${JSON.stringify(workflow, null, 2)}`,
    images: await visualReferenceInputItems(input),
  });

  return parseJsonLoose(text) || { raw_text: text };
}

async function optimizePrompts(input) {
  const workflow = buildWorkflowPayload(input);
  const count = Math.max(1, Math.min(2, Number(input.count || workflow.variant_count || 2)));
  const directions = (input.directions || workflow.directions || ["点击强化"]).slice(0, 2);
  const text = await runStructuredAnalysis({
    text: `你是移动游戏广告 Icon 的高级提示词创意总监。
任务：不要直接生成最终 prompt，而是基于 S1/S2 信息，为每个方案生成可填入固定模板的 generation_prompt_fields。

只返回 JSON，不要 Markdown，不要解释。输出结构：
{
  "prompt_plan": [
    {
      "variant_tag": "保守/点击强化/极致夸张",
      "creative_rationale": "",
      "generation_prompt_fields": {
        "game_genre": "",
        "setting": "",
        "core_narrative": "",
        "scene_context": "",
        "subject_type": "",
        "archetype": "",
        "pose": "",
        "facial_expression": "",
        "camera_angle": "",
        "eye_contact": "",
        "render_style": "",
        "detail_level": "",
        "lighting_style": "",
        "color_strategy": "",
        "surface_finish": "",
        "background_story": "",
        "curiosity_trigger": "",
        "urgency_trigger": "",
        "emotional_reaction_trigger": "",
        "dramatic_visual_tension": "",
        "value_desire": "",
        "symbol_set": ""
      }
    }
  ]
}

硬规则：
1. prompt_plan 数量必须等于 ${count}。
2. 每个 variant_tag 必须来自用户选择方向：${directions.join(" / ")}。
3. 各方案必须明显不同：主体、姿态、光影、色彩策略或点击机制至少 3 项不同。
4. 必须把 S1/S2 的产品信息、icon 分析、竞品共性、情绪目标转译成具体画面语言。
5. 不要输出平台政策，平台约束由模板 STRICT CONSTRAINTS 注入。
6. 不要输出 seed，不要输出最终整段 prompt。

输入：
${JSON.stringify(
  {
    workflow,
    model_analysis: input.modelAnalysis || null,
    reference_summary: {
      has_user_uploads: Boolean((input.referenceFiles || []).length),
      has_product_icon: Boolean(input.googlePlayReferences?.icon),
      competitor_icon_count: (input.competitorGooglePlayReferences || []).filter((item) => item.icon).length,
    },
  },
  null,
  2,
)}`,
  });
  const parsed = parseJsonLoose(text);
  if (parsed?.prompt_plan) return parsed.prompt_plan.slice(0, count);
  return [];
}

function normalizeAnalysisResult(result = {}) {
  const promptFields = appConfig.prompt_field_names || [];
  result.ICON_CREATIVE_PROTOCOL = result.ICON_CREATIVE_PROTOCOL || appConfig.protocol_schema?.ICON_CREATIVE_PROTOCOL || {};
  result.generation_prompt_fields = result.generation_prompt_fields || {};
  for (const field of promptFields) {
    if (result.generation_prompt_fields[field] === undefined) result.generation_prompt_fields[field] = "";
  }
  result.locked_insights_for_next_stage = result.locked_insights_for_next_stage || {};
  result.locked_insights_for_next_stage.reference_priority =
    result.locked_insights_for_next_stage.reference_priority || appConfig.reference_policy?.priority || ["user_uploaded_reference", "product_icon", "competitor_icons"];
  return result;
}

function normalizePromptPlan(plan = [], directions = [], count = 1) {
  const promptFields = appConfig.prompt_field_names || [];
  return Array.from({ length: count }).map((_, index) => {
    const item = plan[index] || {};
    const fields = item.generation_prompt_fields || {};
    for (const field of promptFields) {
      if (fields[field] === undefined) fields[field] = "";
    }
    return {
      variant_tag: item.variant_tag || directions[index % Math.max(1, directions.length)] || "点击强化",
      creative_rationale: item.creative_rationale || "",
      generation_mode: item.generation_mode || "",
      reference_image_policy: item.reference_image_policy || {
        use_user_uploaded_references: true,
        use_product_icon_reference: true,
        use_competitor_icon_references: true,
        reference_priority: appConfig.reference_policy?.priority || ["user_uploaded_reference", "product_icon", "competitor_icons"],
      },
      generation_prompt_fields: fields,
      final_prompt: item.final_prompt || item.prompt || item.generation_prompt || "",
      prompt: item.final_prompt || item.prompt || item.generation_prompt || "",
      negative_constraints: item.negative_constraints || [],
      quality_checkpoints: item.quality_checkpoints || [],
    };
  });
}

async function optimizePromptsConfigured(input) {
  if (!appConfig.prompt_templates?.s4_prompt_plan) return optimizePrompts(input);
  const workflow = buildWorkflowPayload(input);
  const count = Math.max(1, Math.min(2, Number(input.count || workflow.variant_count || 2)));
  const directions = (input.directions || workflow.directions || ["点击强化"]).slice(0, 2);
  const s4Input = {
    workflow,
    model_analysis: input.modelAnalysis || null,
    icon_creative_protocol: input.modelAnalysis?.ICON_CREATIVE_PROTOCOL || null,
    selected_directions: directions,
    variant_count: count,
    reference_summary: {
      has_user_uploads: Boolean((input.referenceFiles || []).length),
      uploaded_reference_public_urls: (input.referenceFiles || []).map((file) => file.publicUrl || file.url || "").filter(Boolean),
      has_product_icon: Boolean(input.googlePlayReferences?.icon),
      product_icon_url: input.googlePlayReferences?.icon || "",
      competitor_icon_count: (input.competitorGooglePlayReferences || []).filter((item) => item.icon).length,
      competitor_icon_urls: (input.competitorGooglePlayReferences || []).map((item) => item.icon).filter(Boolean),
    },
  };
  const configuredPrompt = renderTemplate(appConfig.prompt_templates.s4_prompt_plan, {
    S4_INPUT_JSON: s4Input,
    OUTPUT_SCHEMA_JSON: appConfig.output_schemas?.s4_prompt_plan || {},
    PROMPT_FIELD_NAMES_JSON: appConfig.prompt_field_names || [],
    COUNT: String(count),
    DIRECTIONS: directions.join(" / "),
  });
  const text = await runStructuredAnalysis({ text: configuredPrompt });
  const parsed = parseJsonLoose(text);
  if (parsed?.prompt_plan) return normalizePromptPlan(parsed.prompt_plan, directions, count);
  return [];
}

async function checkPrompts(input) {
  const promptJson = Array.isArray(input.promptJson) ? input.promptJson : [];
  if (!promptJson.length) throw new Error("No prompt_json found for S4 prompt check.");
  const checkInput = {
    platform: input.platform || "Google Ads",
    product: input.product || "",
    prompt_count: promptJson.length,
    prompt_items: promptJson.map((prompt, index) => ({
      prompt_id: prompt.prompt_id || `prompt_${index + 1}`,
      variant_tag: prompt.variant_tag || "",
      prompt_text: prompt.prompt_text || prompt.prompt || "",
      must_include: prompt.constraints?.must_include || [],
      must_not_include: prompt.constraints?.must_not_include || [],
      text_spec: prompt.text_spec || {},
    })),
  };
  const configuredPrompt = renderTemplate(appConfig.prompt_templates?.s4_prompt_check || "", {
    PROMPT_CHECK_INPUT_JSON: checkInput,
    OUTPUT_SCHEMA_JSON: appConfig.output_schemas?.s4_prompt_check || {},
  });
  const text = await runStructuredAnalysis({ text: configuredPrompt || JSON.stringify(checkInput, null, 2) });
  const parsed = parseJsonLoose(text) || { raw_text: text };
  return normalizePromptCheck(parsed, promptJson);
}

function normalizePromptCheck(result = {}, promptJson = []) {
  const checkedItems = Array.isArray(result.checked_items) ? result.checked_items : [];
  const normalizedItems = promptJson.map((prompt, index) => {
    const item = checkedItems[index] || checkedItems.find((entry) => entry.prompt_id === prompt.prompt_id) || {};
    return {
      prompt_id: item.prompt_id || prompt.prompt_id || `prompt_${index + 1}`,
      variant_tag: item.variant_tag || prompt.variant_tag || "",
      status: ["pass", "warning", "block"].includes(item.status) ? item.status : "warning",
      risk_level: item.risk_level || (item.status === "block" ? "high" : item.status === "warning" ? "medium" : "none"),
      risk_categories: Array.isArray(item.risk_categories) ? item.risk_categories : [],
      flagged_terms: Array.isArray(item.flagged_terms) ? item.flagged_terms : [],
      reason: item.reason || "",
      rewrite_suggestions: Array.isArray(item.rewrite_suggestions) ? item.rewrite_suggestions : [],
    };
  });
  const hasBlock = normalizedItems.some((item) => item.status === "block");
  const hasWarning = normalizedItems.some((item) => item.status === "warning");
  return {
    overall_status: hasBlock ? "block" : hasWarning ? "warning" : result.overall_status || "pass",
    summary: result.summary || (hasBlock ? "存在高风险提示词，建议修改后再生成。" : hasWarning ? "存在可能触发过滤的措辞，建议优化。" : "未发现明显高风险禁用词。"),
    checked_items: normalizedItems,
    global_rewrite_suggestions: Array.isArray(result.global_rewrite_suggestions) ? result.global_rewrite_suggestions : [],
  };
}

async function googlePlayLookup(input) {
  const product = String(input.product || "").trim();
  const competitors = String(input.competitors || "")
    .split(/[,\n，、]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (!product) throw new Error("请先填写待投产品名称。");

  const apps = [];
  apps.push(await googlePlayLookupOne(product, "product"));
  for (const competitor of competitors) {
    apps.push(await googlePlayLookupOne(competitor, "competitor"));
  }

  const primary = apps[0];
  return {
    product_profile: primary.profile,
    competitor_profiles: apps.slice(1).map((app) => app.profile),
    visual_reference_pack: primary.visual_reference_pack,
    competitor_visual_reference_pack: apps.slice(1).map((app) => ({
      app_id: app.profile.app_id,
      title: app.profile.app_title,
      icon: app.visual_reference_pack.icon,
      screenshots: app.visual_reference_pack.screenshots?.slice(0, 4) || [],
    })),
    source_apps: apps,
  };
}

async function googlePlayLookupOne(query, role) {
  const appId = query.includes(".") && !/\s/.test(query) ? query : await findGooglePlayAppId(query);
  const detailUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}&hl=en&gl=US`;
  const html = await fetchTextWithFallback(detailUrl);
  return parseGooglePlayDetail(html, appId, role, detailUrl);
}

async function findGooglePlayAppId(query) {
  const searchUrl = `https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps&hl=en&gl=US`;
  const html = await fetchTextWithFallback(searchUrl);
  const ids = unique(
    [...html.matchAll(/\/store\/apps\/details\?id\\?=([a-zA-Z0-9._]+)/g)].map((match) =>
      htmlDecode(match[1]).replace(/\\u0026.*$/, ""),
    ),
  );
  if (!ids.length) throw new Error(`Google Play 未找到应用：${query}`);
  return ids[0];
}

function parseGooglePlayDetail(html, appId, role, detailUrl) {
  const title =
    matchMeta(html, "og:title")?.replace(/\s*-\s*(Android\s+)?Apps on Google Play$/i, "") ||
    matchTag(html, "title")?.replace(/\s*-\s*(Android\s+)?Apps on Google Play$/i, "") ||
    appId;
  const shortDescription = matchMeta(html, "og:description") || "";
  const developer = extractNearAppIdDeveloper(html, appId) || "";
  const installs = firstMatch(html, /"([0-9,]+\+)"\s*,null,""\s*,null,null,null,null,\[null,2,\[500,1024\]/) || "";
  const category = firstMatch(html, /\],"([^"]+)",null,null,\[null,\[\[0,"USD"/) || "";
  const rating = firstMatch(html, /\["([0-9.]+)",[0-9.]+\],"[^"]+"/) || "";
  const media = extractGooglePlayMedia(html);
  const icon = matchMeta(html, "og:image") || media.find((item) => item.width === 512 && item.height === 512)?.url || media[0]?.url || "";
  const screenshots = media
    .filter((item) => item.url !== icon && item.width >= 700 && item.height >= 700)
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .map((item) => item.url)
    .slice(0, 8);
  const featureGraphic =
    media.find((item) => item.url !== icon && item.width >= 900 && item.height >= 450 && item.width > item.height)?.url ||
    screenshots.find((url) => url) ||
    "";
  const cleanScreenshots = screenshots.filter((url) => url !== featureGraphic).slice(0, 8);

  return {
    profile: {
      role,
      app_id: appId,
      app_title: htmlDecode(title),
      developer: htmlDecode(developer),
      category: htmlDecode(category),
      rating,
      installs,
      short_description: htmlDecode(shortDescription),
      detail_url: detailUrl,
    },
    visual_reference_pack: {
      icon,
      featureGraphic,
      screenshots: cleanScreenshots,
      visual_rules: summarizeVisualRules(media, icon, cleanScreenshots),
    },
  };
}

function extractGooglePlayMedia(html) {
  const media = [];
  const regex = /\[null,2,\[(\d+),(\d+)\],\[null,null,"(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"/g;
  let match;
  while ((match = regex.exec(html))) {
    media.push({
      width: Number(match[1]),
      height: Number(match[2]),
      url: htmlDecode(match[3]),
    });
  }
  const metaImage = matchMeta(html, "og:image");
  if (metaImage) media.unshift({ width: 512, height: 512, url: metaImage });
  const seen = new Set();
  return media.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function summarizeVisualRules(media, icon, screenshots) {
  const iconItem = media.find((item) => item.url === icon);
  const landscape = media.filter((item) => item.width > item.height).length;
  const portrait = media.filter((item) => item.height > item.width).length;
  return [
    iconItem ? `icon 素材尺寸约 ${iconItem.width}x${iconItem.height}` : "已抓取 icon 默认参考图",
    screenshots.length ? `抓取到 ${screenshots.length} 张截图/主图素材` : "截图素材较少，需依赖 icon 和用户素材",
    landscape >= portrait ? "视觉素材以横版展示为主" : "视觉素材以竖版展示为主",
    "图片来源为 Google Play 公开素材，仅作为风格与构图参考",
  ];
}

function matchMeta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return htmlDecode(
    firstMatch(html, new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i")) ||
      firstMatch(html, new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i")) ||
      "",
  );
}

function matchTag(html, tag) {
  return htmlDecode(firstMatch(html, new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")) || "");
}

function firstMatch(text, regex) {
  const match = text.match(regex);
  return match ? match[1] : "";
}

function extractNearAppIdDeveloper(html, appId) {
  const index = html.indexOf(`"${appId}"`);
  if (index === -1) return "";
  const slice = html.slice(index, index + 20000);
  return firstMatch(slice, /],"([^"]+)",\["[0-9.]+",[0-9.]+\],"[^"]+"/) || "";
}

async function makeSmokeReferenceDataUrl() {
  const buffer = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background: "#2563eb",
    },
  })
    .composite([
      {
        input: Buffer.from('<svg width="32" height="32"><circle cx="16" cy="16" r="9" fill="#facc15"/></svg>'),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function smokeBasePayload(uploaded, dataUrl = "") {
  return {
    product: "Test Kingdom Builder",
    competitors: "Township",
    platform: "Google Ads",
    platformRules: "- No misleading claims\n- No gore, nudity, or copyrighted competitor logos\n- Icon must be readable at 64px",
    emotion: ["好奇", "成就感"],
    textEnabled: "否",
    badgeText: "",
    reference: "Use uploaded reference as highest priority style cue.",
    referenceFiles: uploaded
      ? [
          {
            name: uploaded.name,
            type: uploaded.type,
            size: uploaded.size,
            url: uploaded.url,
            publicUrl: uploaded.public_url,
            dataUrl,
          },
        ]
      : [],
    googlePlayProfile: {
      app_title: "Test Kingdom Builder",
      app_id: "test.kingdom.builder",
      category: "Simulation",
      developer: "Test Studio",
      short_description: "Build a medieval town, collect resources, and unlock rewards.",
    },
    googlePlayReferences: {
      icon: uploaded?.public_url || "",
      featureGraphic: "",
      screenshots: [],
    },
    competitorGooglePlayProfiles: [
      {
        app_title: "Township",
        app_id: "com.playrix.township",
        category: "Simulation",
      },
    ],
    competitorGooglePlayReferences: [],
    count: 1,
    directions: ["点击强化"],
    promptJson: [],
    generatedImages: [],
  };
}

function summarizeForSmoke(value, maxChars = 7000) {
  const text = JSON.stringify(value, null, 2);
  return text.length > maxChars ? { truncated: true, json_preview: text.slice(0, maxChars) } : value;
}

async function runSmokeTest(mode, req) {
  const normalizedMode = ["quick", "ai", "full"].includes(mode) ? mode : "quick";
  const startedAt = new Date().toISOString();
  const steps = [];
  const io = {};
  const mark = (name, status, detail = {}) => steps.push({ name, status, ...detail });

  mark("静态页面", "passed", { message: "index.html 由当前服务托管" });
  mark("模型配置", providerHasKey(aiProvider) && providerHasKey(imageProvider) ? "passed" : "warning", {
    text_provider: aiProvider,
    text_model: aiProvider === "deepseek" ? deepseekTextModel : textModel,
    image_provider: imageProvider,
    image_model: imageProvider === "volcengine" ? volcengineImageModel : imageModel,
  });
  mark("配置文件", appConfig.protocol_schema?.ICON_CREATIVE_PROTOCOL && appConfig.prompt_templates?.s2_analysis ? "passed" : "failed", {
    has_protocol_schema: Boolean(appConfig.protocol_schema?.ICON_CREATIVE_PROTOCOL),
    has_s2_template: Boolean(appConfig.prompt_templates?.s2_analysis),
    has_s4_template: Boolean(appConfig.prompt_templates?.s4_prompt_plan),
  });

  const uploadInput = {
    name: "smoke-reference.png",
    type: "image/png",
    dataUrl: await makeSmokeReferenceDataUrl(),
  };
  const uploaded = await uploadReferenceImage(uploadInput, req);
  mark("参考图上传", "passed", {
    public_url: uploaded.public_url,
    type: uploaded.type,
    size: uploaded.size,
  });

  const payload = smokeBasePayload(uploaded, uploadInput.dataUrl);
  io.quick = {
    upload_input: { name: uploadInput.name, type: uploadInput.type, data_url_length: uploadInput.dataUrl.length },
    upload_output: uploaded,
  };

  let analysis = null;
  let promptPlan = null;
  if (normalizedMode === "ai" || normalizedMode === "full") {
    io.analyze = { input: payload };
    analysis = await analyzeWorkflow(payload);
    io.analyze.output = summarizeForSmoke(analysis);
    mark("S2 AI 分析", analysis?.generation_prompt_fields ? "passed" : "failed", {
      has_protocol: Boolean(analysis?.ICON_CREATIVE_PROTOCOL),
      has_generation_prompt_fields: Boolean(analysis?.generation_prompt_fields),
    });

    const optimizeInput = { ...payload, modelAnalysis: analysis };
    io.prompt_plan = { input: optimizeInput };
    promptPlan = await optimizePromptsConfigured(optimizeInput);
    io.prompt_plan.output = summarizeForSmoke(promptPlan);
    mark("S4 提示词计划", Array.isArray(promptPlan) && promptPlan.length ? "passed" : "failed", {
      prompt_count: Array.isArray(promptPlan) ? promptPlan.length : 0,
      has_final_prompt: Boolean(promptPlan?.[0]?.final_prompt || promptPlan?.[0]?.prompt),
    });
  }

  if (normalizedMode === "full") {
    const promptText =
      promptPlan?.[0]?.final_prompt ||
      promptPlan?.[0]?.prompt ||
      "Create a production-ready transparent-background mobile game app icon, single golden castle emblem, high contrast, readable at 64px.";
    const generateInput = {
      ...payload,
      promptJson: [
        {
          prompt_id: "smoke_prompt_1",
          variant_tag: "点击强化",
          prompt_text: promptText,
          generation: { source: "smoke-test-ui", mode: "image_to_image_with_prompt" },
        },
      ],
    };
    io.generate = { input: generateInput };
    const generatedImages = await generateIcons(generateInput);
    io.generate.output = generatedImages;
    mark("S5 Icon 生成", generatedImages.length ? "passed" : "failed", {
      image_count: generatedImages.length,
      first_image_url: generatedImages[0]?.url || "",
      first_scene_url: generatedImages[0]?.scene_url || "",
    });

    const exportInput = {
      ...payload,
      generatedImages,
      selectedImageIds: [generatedImages[0].image_id],
      sizes: [1024, 512, 256, 128, 64],
    };
    io.export = { input: exportInput };
    const exportResult = await exportIcons(exportInput);
    io.export.output = exportResult;
    mark("S8 多尺寸导出", exportResult?.zip_url ? "passed" : "failed", {
      zip_url: exportResult?.zip_url || "",
      file_count: exportResult?.files?.length || 0,
    });
  }

  return {
    ok: steps.every((step) => step.status !== "failed"),
    mode: normalizedMode,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    base_url: publicBaseUrl(req),
    steps,
    io,
  };
}

function buildIconPrompt(input, index) {
  const workflow = buildWorkflowPayload(input);
  const direction = workflow.directions[index % workflow.directions.length] || "点击强化";
  const textRule = workflow.text_spec.enabled
    ? `Include a tiny bottom-right badge with the exact text "${workflow.text_spec.text}", max 5 characters.`
    : "No text, no letters, no numbers, no watermark.";

  return [
    "Create a production-ready mobile app icon for paid app install ads.",
    `Product: ${workflow.product}. Competitors: ${workflow.competitors}.`,
    `Platform: ${workflow.platform}. Creative direction: ${direction}.`,
    `Emotion target: ${workflow.emotion_target.join(", ") || "curiosity and high click appeal"}.`,
    `Must emphasize: ${workflow.emphasis || "clear core product identity and strong small-size recognizability"}.`,
    `Must avoid: ${workflow.sensitive || "misleading claims, gore, nudity, copyrighted logos, clutter"}.`,
    `Reference notes: ${workflow.reference_notes || "use uploaded references only as style inspiration, do not copy exact protected icons"}.`,
    "Icon constraints: one clear central subject, square 1:1 composition, transparent background with alpha channel, high contrast silhouette, readable at 64px, polished app-store quality, no border frame.",
    "Style: premium 3D-rendered app icon, vivid lighting, tactile materials, clean shape language, memorable focal point.",
    textRule,
    "Output only the icon artwork, transparent-background PNG.",
  ].join("\n");
}

function getPromptJsonList(input) {
  const promptJson = Array.isArray(input.promptJson) ? input.promptJson : [];
  if (promptJson.length) return promptJson;

  const count = Math.max(1, Math.min(2, Number(input.count || 2)));
  return Array.from({ length: count }).map((_, index) => ({
    prompt_id: `server_fallback_prompt_${index + 1}`,
    variant_tag: (input.directions || [])[index % Math.max(1, (input.directions || []).length)] || "点击强化",
    prompt_text: buildIconPrompt(input, index),
    generation: { source: "server fallback prompt_json" },
  }));
}

function promptTextFromPromptJson(promptJson, input, index) {
  if (promptJson?.prompt_text) return promptJson.prompt_text;
  if (promptJson?.prompt) return promptJson.prompt;

  return [
    `Create a production-ready mobile app icon from S4 prompt_json ${promptJson?.prompt_id || index + 1}.`,
    `Variant: ${promptJson?.variant_tag || "点击强化"}.`,
    `Subject: ${promptJson?.subject || input.product || "未填写"}.`,
    `Style: ${JSON.stringify(promptJson?.style || "premium app icon")}.`,
    `Composition: ${JSON.stringify(promptJson?.composition || "centered single subject")}.`,
    `Emotion: ${JSON.stringify(promptJson?.emotion || input.emotion || [])}.`,
    `Constraints: ${JSON.stringify(promptJson?.constraints || {})}.`,
    promptJson?.text_spec?.enabled ? `Text badge: ${promptJson.text_spec.text}, bottom-right.` : "No text, no letters, no numbers, no watermark.",
    "Icon constraints: square 1:1, transparent background with alpha channel, high contrast, readable at 64px, output only icon artwork.",
  ].join("\n");
}

async function generateIcons(input) {
  const promptJsonList = getPromptJsonList(input);
  const count = Math.max(1, Math.min(2, Number(input.count || promptJsonList.length || 2)));
  const images = [];
  const referencePack = await generationReferenceInputItems(input);
  const referenceImages = referencePack.images;
  const generationMode = referenceImages.length ? "image_to_image_with_prompt" : "text_to_image";

  for (let index = 0; index < count; index += 1) {
    const promptJson = promptJsonList[index] || promptJsonList[promptJsonList.length - 1];
    const prompt = promptTextFromPromptJson(promptJson, input, index);
    const image = await generateImage(prompt, referenceImages);

    const id = `icon_${Date.now()}_${index + 1}_${crypto.randomBytes(3).toString("hex")}`;
    const filename = `${id}.png`;
    const iconBuffer = await makeIconTransparentPng(await resolveImageBuffer(image));
    fs.writeFileSync(path.join(outputDir, filename), iconBuffer);
    const sceneFilename = `${id}_scene.svg`;
    fs.writeFileSync(
      path.join(outputDir, sceneFilename),
      buildSceneTemplateSvg({
        iconBuffer,
        productName: input.googlePlayProfile?.app_title || input.product || "游戏名称",
        companyName: input.googlePlayProfile?.developer || "Your Company",
        platform: input.platform || "Google Ads",
        variant: promptJson?.variant_tag || (input.directions || [])[index % (input.directions || []).length] || "点击强化",
      }),
    );
    images.push({
      image_id: id,
      scene_image_id: `${id}_scene`,
      prompt_id: promptJson?.prompt_id || `server_fallback_prompt_${index + 1}`,
      variant_tag: promptJson?.variant_tag || (input.directions || [])[index % (input.directions || []).length] || "点击强化",
      url: `/generated/${filename}`,
      scene_url: `/generated/${sceneFilename}`,
      prompt_summary: prompt.split("\n").slice(0, 5).join(" "),
      prompt_source: promptJson?.generation?.source || "S4 prompt_json",
      reference_image_count: referenceImages.length,
      reference_image_sources: referencePack.sources,
      reference_image_errors: referencePack.errors,
      generation_mode: generationMode,
      scene_generation_mode: "scene_template_composite",
    });
  }

  return images;
}

async function regenerateIcon(input) {
  const image = input.image || {};
  const currentCount = Number(image.regenerate_count || 0);
  if (currentCount >= 2) {
    throw new Error("该 icon 已达到最多 2 次重生限制。请回到 S3 修改提示词模板或最终提示词后重新生成。");
  }

  const promptJson = input.promptJson || {};
  const prompt = String(input.promptText || promptJson.prompt_text || image.prompt_text || "").trim();
  if (!prompt) throw new Error("缺少用于重生的 prompt。");

  const referencePack = await generationReferenceInputItems(input);
  const referenceImages = referencePack.images;
  const generationMode = referenceImages.length ? "image_to_image_with_prompt" : "text_to_image";
  const result = await generateImage(prompt, referenceImages);
  const iconBuffer = await makeIconTransparentPng(await resolveImageBuffer(result));

  const id = `icon_${Date.now()}_regen_${crypto.randomBytes(3).toString("hex")}`;
  const filename = `${id}.png`;
  fs.writeFileSync(path.join(outputDir, filename), iconBuffer);

  const sceneFilename = `${id}_scene.svg`;
  fs.writeFileSync(
    path.join(outputDir, sceneFilename),
    buildSceneTemplateSvg({
      iconBuffer,
      productName: input.googlePlayProfile?.app_title || input.product || "游戏名称",
      companyName: input.googlePlayProfile?.developer || "Your Company",
      platform: input.platform || "Google Ads",
      variant: image.variant_tag || promptJson.variant_tag || "重生",
    }),
  );

  return {
    image_id: id,
    scene_image_id: `${id}_scene`,
    parent_image_id: image.image_id || "",
    version: Number(image.version || 1) + 1,
    regenerate_count: currentCount + 1,
    prompt_id: image.prompt_id || promptJson.prompt_id || "regenerate_prompt",
    prompt_text: prompt,
    variant_tag: image.variant_tag || promptJson.variant_tag || "重生",
    url: `/generated/${filename}`,
    scene_url: `/generated/${sceneFilename}`,
    prompt_summary: prompt.split("\n").slice(0, 5).join(" "),
    prompt_source: "S7 edited original prompt",
    reference_image_count: referenceImages.length,
    reference_image_sources: referencePack.sources,
    reference_image_errors: referencePack.errors,
    generation_mode: generationMode,
    scene_generation_mode: "scene_template_composite",
  };
}

async function exportIcons(input) {
  const selectedIds = Array.isArray(input.selectedImageIds) ? input.selectedImageIds : [];
  const images = (input.generatedImages || []).filter((image) => selectedIds.includes(image.image_id));
  if (!images.length) throw new Error("请先在 S6 选择至少 1 个 icon。");

  const sizes = (Array.isArray(input.sizes) && input.sizes.length ? input.sizes : [1024, 512, 256, 128, 64])
    .map((size) => Number(size))
    .filter((size) => [1024, 512, 256, 128, 64].includes(size));
  const productName = sanitizeFileName(input.product || input.googlePlayProfile?.app_title || "product");
  const packageId = `${productName}_icon_delivery_${Date.now()}`;
  const packageDir = path.join(exportDir, packageId);
  fs.mkdirSync(packageDir, { recursive: true });

  const files = [];
  for (const [imageIndex, image] of images.entries()) {
    const sourcePath = generatedPathFromUrl(image.url);
    if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error(`找不到已生成 icon 文件：${image.image_id}`);
    const version = image.version || 1;
    const suffix = images.length > 1 ? `_choice${imageIndex + 1}` : "";
    for (const size of sizes) {
      const filename = `${productName}_icon${suffix}_v${version}_${size}px.png`;
      const outputPath = path.join(packageDir, filename);
      await sharp(sourcePath)
        .resize(size, size, { fit: "cover" })
        .png()
        .toFile(outputPath);
      files.push({
        image_id: image.image_id,
        size,
        filename,
        url: `/exports/${packageId}/${filename}`,
      });
    }

  }

  const zipName = `${packageId}.zip`;
  const zipPath = path.join(exportDir, zipName);
  await zipDirectory(packageDir, zipPath);

  return {
    package_id: packageId,
    zip_url: `/exports/${zipName}`,
    files,
  };
}

function generatedPathFromUrl(value = "") {
  if (!value || !value.startsWith("/generated/")) return "";
  const filename = path.basename(value);
  return path.join(outputDir, filename);
}

function sanitizeFileName(value = "") {
  return String(value || "product")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "")
    .toLowerCase() || "product";
}

function zipDirectory(sourceDir, zipPath) {
  const zip = new AdmZip();
  zip.addLocalFolder(sourceDir);
  zip.writeZip(zipPath);
}

async function makeIconTransparentPng(buffer) {
  const image = sharp(buffer).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!width || !height) return image.png().toBuffer();

  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const cornerSize = Math.max(4, Math.min(32, Math.floor(Math.min(info.width, info.height) * 0.035)));
  const samples = [];
  const addSample = (x, y) => {
    const offset = (y * info.width + x) * 4;
    samples.push([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
  };

  for (let y = 0; y < cornerSize; y += 1) {
    for (let x = 0; x < cornerSize; x += 1) {
      addSample(x, y);
      addSample(info.width - 1 - x, y);
      addSample(x, info.height - 1 - y);
      addSample(info.width - 1 - x, info.height - 1 - y);
    }
  }

  const avg = samples.reduce(
    (acc, sample) => {
      acc[0] += sample[0];
      acc[1] += sample[1];
      acc[2] += sample[2];
      acc[3] += sample[3];
      return acc;
    },
    [0, 0, 0, 0],
  ).map((value) => value / samples.length);

  if (avg[3] < 245) {
    return sharp(data, { raw: info }).png().toBuffer();
  }

  const threshold = 58;
  const visited = new Uint8Array(info.width * info.height);
  const queue = [];
  const isBackgroundLike = (x, y) => {
    const offset = (y * info.width + x) * 4;
    const distance = Math.hypot(data[offset] - avg[0], data[offset + 1] - avg[1], data[offset + 2] - avg[2]);
    return data[offset + 3] > 0 && distance <= threshold;
  };
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return;
    const key = y * info.width + x;
    if (visited[key] || !isBackgroundLike(x, y)) return;
    visited[key] = 1;
    queue.push([x, y]);
  };

  for (let x = 0; x < info.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, info.height - 1);
  }
  for (let y = 0; y < info.height; y += 1) {
    enqueue(0, y);
    enqueue(info.width - 1, y);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const [x, y] = queue[index];
    data[(y * info.width + x) * 4 + 3] = 0;
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  return sharp(data, { raw: info }).png().toBuffer();
}

function providerHasKey(provider) {
  if (provider === "volcengine") return Boolean(arkApiKey);
  if (provider === "aliyun") return Boolean(dashscopeApiKey);
  if (provider === "kimi") return Boolean(kimiApiKey);
  if (provider === "deepseek") return Boolean(deepseekApiKey);
  return Boolean(apiKey);
}

async function generateImage(prompt, referenceImages = []) {
  if (imageProvider === "volcengine") {
    const payload = {
      model: volcengineImageModel,
      prompt,
      size: volcengineImageSize,
      response_format: "url",
    };
    if (referenceImages.length) {
      payload.image = referenceImages[0];
      payload.images = referenceImages;
      payload.reference_images = referenceImages;
      payload.image_urls = referenceImages;
    }
    const result = await arkFetch("images/generations", payload);
    return extractGeneratedImage(result);
  }

  if (imageProvider === "aliyun") {
    const task = await dashscopeFetch(
      "services/aigc/image-generation/generation",
      {
        model: aliyunImageModel,
        input: {
          messages: [
            {
              role: "user",
              content: [{ text: prompt }],
            },
          ],
        },
        parameters: {
          size: aliyunImageSize,
          n: 1,
        },
      },
      { async: true },
    );

    const taskId = task.output?.task_id;
    if (!taskId) {
      throw new Error(`DashScope image task did not return task_id: ${JSON.stringify(task)}`);
    }

    const result = await pollDashScopeTask(taskId);
    return extractGeneratedImage(result);
  }

  if (imageProvider === "kimi") {
    const result = await kimiFetchAbsolute(kimiImageEndpoint, {
      model: kimiImageModel,
      prompt,
      size: "1024x1024",
      quality: "medium",
      response_format: "b64_json",
      output_format: "png",
    });
    return extractGeneratedImage(result);
  }

  const result = await openaiFetch("images/generations", {
    model: imageModel,
    prompt,
    size: "1024x1024",
    quality: "medium",
    output_format: "png",
  });
  return extractGeneratedImage(result);
}

function buildSceneTemplateSvg({ iconBuffer, productName, companyName, platform, variant }) {
  const iconData = `data:image/png;base64,${iconBuffer.toString("base64")}`;
  const title = escapeXml(productName || "游戏名称");
  const company = escapeXml(companyName || "Your Company");
  const platformName = escapeXml(platform || "Google Ads");
  const variantName = escapeXml(variant || "点击强化");
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#071320"/>
      <stop offset="58%" stop-color="#101b28"/>
      <stop offset="100%" stop-color="#050910"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1d2a38"/>
      <stop offset="100%" stop-color="#0d141e"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="#000" flood-opacity=".38"/>
    </filter>
    <clipPath id="r40"><rect width="220" height="220" rx="44"/></clipPath>
    <clipPath id="r24"><rect width="96" height="96" rx="22"/></clipPath>
    <style>
      .title{font:800 38px Arial,"Microsoft YaHei",sans-serif;fill:#fff}
      .sub{font:400 20px Arial,"Microsoft YaHei",sans-serif;fill:#d7e3f2}
      .panelTitle{font:800 25px Arial,"Microsoft YaHei",sans-serif;fill:#fff}
      .small{font:600 15px Arial,"Microsoft YaHei",sans-serif;fill:#d8e1ec}
      .tiny{font:500 13px Arial,"Microsoft YaHei",sans-serif;fill:#aeb9c7}
      .darkCard{fill:url(#panel);stroke:#34465a;stroke-width:2}
      .whiteCard{fill:#fff}
      .muted{fill:#f5f7fb}
      .green{fill:#0aa36d}
    </style>
  </defs>
  <rect width="1600" height="1000" fill="url(#bg)"/>
  <text x="800" y="48" text-anchor="middle" class="title">ICON 使用场景展示图模板（通用版）</text>
  <text x="800" y="82" text-anchor="middle" class="sub">适用于 ${platformName} / Meta / TikTok 等主流投放平台 · ${variantName}</text>

  <rect x="20" y="110" width="450" height="850" rx="18" class="darkCard"/>
  <text x="245" y="145" text-anchor="middle" class="panelTitle">1. 手机桌面效果</text>
  <text x="245" y="172" text-anchor="middle" class="small">展示 Icon 在手机桌面上的实际显示效果</text>
  <rect x="48" y="200" width="250" height="620" rx="34" fill="#0a1220" stroke="#46566a" stroke-width="3" filter="url(#shadow)"/>
  <text x="78" y="235" class="small">9:41</text>
  ${phoneIconGrid(iconData)}
  <rect x="78" y="735" width="190" height="64" rx="24" fill="#223247" opacity=".86"/>
  ${dockIcon(96, 753, "#39d353")}
  ${dockIcon(142, 753, "#37a0ff")}
  ${dockIcon(188, 753, "#49d16d")}
  ${dockIcon(234, 753, "#ff4d55")}
  <text x="50" y="875" class="small">展示要点：</text>
  <text x="50" y="905" class="tiny">• 不同系统桌面下的清晰度与吸引力</text>
  <text x="50" y="930" class="tiny">• 小尺寸下的主体轮廓和识别度</text>

  <rect x="485" y="110" width="470" height="850" rx="18" class="darkCard"/>
  <text x="720" y="145" text-anchor="middle" class="panelTitle">2. Google Play 详情页效果</text>
  <text x="720" y="172" text-anchor="middle" class="small">展示 Icon 在商店详情页中的呈现效果</text>
  <rect x="510" y="200" width="420" height="620" rx="16" class="whiteCard" filter="url(#shadow)"/>
  <text x="555" y="242" font-family="Arial" font-size="24" fill="#303846">Google Play</text>
  <image href="${iconData}" x="548" y="290" width="112" height="112"/>
  <text x="690" y="320" font-family="Arial,'Microsoft YaHei'" font-size="30" font-weight="800" fill="#101828">${title}</text>
  <text x="690" y="354" font-family="Arial" font-size="18" font-weight="700" fill="#0a8f61">${company}</text>
  <text x="690" y="388" font-family="Arial,'Microsoft YaHei'" font-size="18" fill="#344054">解谜 · 冒险 · 探索</text>
  <text x="555" y="455" font-family="Arial" font-size="22" fill="#101828">4.6★</text>
  <text x="680" y="455" font-family="Arial" font-size="22" fill="#101828">1000万+</text>
  <text x="820" y="455" font-family="Arial" font-size="22" fill="#101828">12+</text>
  <rect x="548" y="505" width="340" height="52" rx="8" fill="#0aa36d"/>
  <text x="718" y="539" text-anchor="middle" font-family="Arial,'Microsoft YaHei'" font-size="20" font-weight="800" fill="#fff">安装</text>
  ${storeShotRow(iconData)}
  <text x="530" y="875" class="small">展示要点：</text>
  <text x="530" y="905" class="tiny">• 商店详情页中的清晰度与吸引力</text>
  <text x="530" y="930" class="tiny">• 与应用名称、分类、评分的搭配效果</text>

  <rect x="970" y="110" width="610" height="850" rx="18" class="darkCard"/>
  <text x="1275" y="145" text-anchor="middle" class="panelTitle">3. 广告平台主要广告展示效果</text>
  <text x="1275" y="172" text-anchor="middle" class="small">展示 Icon 在不同广告位中的实际呈现效果</text>
  ${adCards(iconData, title, company)}
  <text x="995" y="875" class="small">展示要点：</text>
  <text x="995" y="905" class="tiny">• 不同广告位和尺寸下的表现</text>
  <text x="995" y="930" class="tiny">• 与文案、素材的搭配协调性</text>
  <text x="1240" y="905" class="tiny">• 吸引用户点击的视觉表现</text>
  <text x="800" y="984" text-anchor="middle" class="tiny">注：场景展示图由生成 Icon 原样嵌入模板，仅用于投放预览。</text>
</svg>`);
}

function phoneIconGrid(iconData) {
  const colors = ["#ffffff", "#f2b84b", "#5aa7ff", "#d7dde7", "#46c970", "#3182ff", "#fff", "#a7b2c3"];
  const cells = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const x = 75 + col * 52;
      const y = 275 + row * 84;
      if (row === 2 && col === 0) {
        cells.push(`<image href="${iconData}" x="${x}" y="${y}" width="42" height="42"/><text x="${x + 21}" y="${y + 62}" text-anchor="middle" class="tiny">游戏</text>`);
      } else {
        cells.push(`<rect x="${x}" y="${y}" width="42" height="42" rx="10" fill="${colors[(row * 4 + col) % colors.length]}"/><text x="${x + 21}" y="${y + 62}" text-anchor="middle" class="tiny">App</text>`);
      }
    }
  }
  return cells.join("");
}

function dockIcon(x, y, color) {
  return `<rect x="${x}" y="${y}" width="34" height="34" rx="9" fill="${color}"/>`;
}

function storeShotRow(iconData) {
  return [0, 1, 2, 3]
    .map((i) => `<rect x="${548 + i * 86}" y="600" width="72" height="150" rx="10" fill="#111827"/><image href="${iconData}" x="${560 + i * 86}" y="635" width="48" height="48"/>`)
    .join("");
}

function adCards(iconData, title, company) {
  return `
  <rect x="995" y="210" width="300" height="160" rx="12" fill="#f8fafc"/>
  <image href="${iconData}" x="1020" y="245" width="64" height="64"/>
  <text x="1100" y="260" font-family="Arial,'Microsoft YaHei'" font-size="20" font-weight="800" fill="#111827">${title}</text>
  <text x="1100" y="286" font-family="Arial" font-size="14" fill="#475467">${company}</text>
  <text x="1100" y="318" font-family="Arial,'Microsoft YaHei'" font-size="16" fill="#111827">探索神秘旅程！</text>
  <rect x="1218" y="320" width="54" height="28" rx="7" fill="#2f6bff"/><text x="1245" y="339" text-anchor="middle" font-family="Arial,'Microsoft YaHei'" font-size="14" font-weight="800" fill="#fff">安装</text>

  <rect x="995" y="395" width="300" height="245" rx="12" fill="#f8fafc"/>
  <image href="${iconData}" x="1020" y="425" width="42" height="42"/>
  <text x="1075" y="442" font-family="Arial,'Microsoft YaHei'" font-size="18" font-weight="800" fill="#111827">${title}</text>
  <rect x="1020" y="480" width="250" height="110" rx="10" fill="#0d1724"/>
  <image href="${iconData}" x="1110" y="500" width="70" height="70"/>
  <text x="1020" y="622" font-family="Arial,'Microsoft YaHei'" font-size="14" fill="#111827">立即下载，开启冒险！</text>

  <rect x="1320" y="210" width="210" height="430" rx="18" fill="#080e17"/>
  <rect x="1345" y="240" width="160" height="260" rx="10" fill="#122033"/>
  <image href="${iconData}" x="1378" y="310" width="96" height="96"/>
  <text x="1360" y="535" font-family="Arial,'Microsoft YaHei'" font-size="18" font-weight="800" fill="#fff">${title}</text>
  <text x="1360" y="562" font-family="Arial,'Microsoft YaHei'" font-size="14" fill="#d7e3f2">探索隐藏奖励！</text>
  <rect x="1360" y="590" width="120" height="34" rx="7" fill="#ff2f55"/><text x="1420" y="613" text-anchor="middle" font-family="Arial,'Microsoft YaHei'" font-size="15" font-weight="800" fill="#fff">立即下载</text>`;
}

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function pollDashScopeTask(taskId) {
  const deadline = Date.now() + 1000 * 60 * 6;
  let lastResult = null;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    lastResult = await dashscopeGet(`tasks/${taskId}`);
    const status = lastResult.output?.task_status || lastResult.output?.status;
    if (status === "SUCCEEDED") return lastResult;
    if (status === "FAILED" || status === "UNKNOWN") {
      throw new Error(lastResult.output?.message || `DashScope image task ${status}`);
    }
  }

  throw new Error(`DashScope image task timed out: ${taskId}. Last result: ${JSON.stringify(lastResult)}`);
}

function extractGeneratedImage(result) {
  const image =
    result.data?.[0] ||
    result.images?.[0] ||
    result.output?.[0] ||
    result.output?.results?.[0] ||
    result.output?.task_results?.[0] ||
    result.output?.choices?.[0]?.message?.content?.find((part) => part.image || part.image_url || part.url);
  if (image?.b64_json || image?.url || image?.image || image?.image_url) return image;

  const content = result.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    const item = content.find((part) => part.image_url?.url || part.url || part.b64_json);
    if (item) return item.image_url || item;
  }

  const url = result.output?.url || result.output?.image_url || result.url || result.image_url || result.image;
  if (url) return { url: typeof url === "string" ? url : url.url };

  throw new Error("Image API did not return b64_json, url, or image field. Check image provider response format.");
}

async function resolveImageBuffer(image) {
  if (image.b64_json) {
    return Buffer.from(image.b64_json, "base64");
  }

  const url = image.url || image.image || image.image_url?.url || image.image_url;
  if (!url) {
    throw new Error("Image API result has no b64_json or url.");
  }

  if (url.startsWith("data:image/")) {
    return Buffer.from(url.split(",")[1] || "", "base64");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download generated image: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function qaImages(input) {
  const images = input.generatedImages || [];
  const reports = [];

  for (const image of images) {
    const filename = path.basename(image.url || "");
    const filePath = path.join(outputDir, filename);
    if (!fs.existsSync(filePath)) continue;

    const b64 = fs.readFileSync(filePath).toString("base64");
    const text = await runStructuredAnalysis({
      text: `请作为广告投放 icon 质检员，对这张 icon 做自动质检，只返回 JSON。
检查项：
- must_include 是否体现产品主体：${input.product || "未填写"}
- must_not_include 是否避开：${input.sensitive || "误导承诺、血腥、裸露、侵权元素"}
- 64px 小尺寸识别度
- 单主体、中心构图、高对比、简单背景
- 平台审核风险：${input.platform || "Google Ads"}
输出字段：image_id, passed, score_0_100, issues[], recommendation。`,
      images: [
        {
          type: "input_image",
          image_url: `data:image/png;base64,${b64}`,
          detail: "low",
        },
      ],
    });

    const parsed = parseJsonLoose(text);
    reports.push(parsed ? { image_id: image.image_id, ...parsed } : { image_id: image.image_id, passed: false, raw_text: text });
  }

  return reports;
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(rootDir, relativePath));

    if (!filePath.startsWith(rootDir)) {
    res.writeHead(403, corsHeaders());
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, corsHeaders());
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      ...corsHeaders(),
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    if (url.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        ai_provider: aiProvider,
        image_provider: imageProvider,
        has_api_key: providerHasKey(aiProvider) && providerHasKey(imageProvider),
        has_kimi_api_key: Boolean(kimiApiKey),
        has_deepseek_api_key: Boolean(deepseekApiKey),
        has_dashscope_api_key: Boolean(dashscopeApiKey),
        has_ark_api_key: Boolean(arkApiKey),
        text_model: textModel,
        kimi_text_model: kimiTextModel,
        deepseek_text_model: deepseekTextModel,
        aliyun_text_model: aliyunTextModel,
        volcengine_text_model: volcengineTextModel,
        image_model: imageModel,
        kimi_image_model: kimiImageModel,
        kimi_image_endpoint: kimiImageEndpoint,
        aliyun_image_model: aliyunImageModel,
        aliyun_image_size: aliyunImageSize,
        volcengine_image_model: volcengineImageModel,
        volcengine_image_size: volcengineImageSize,
        ark_base_url: arkBaseUrl,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/analyze") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, analysis: await analyzeWorkflow(body) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/optimize-prompts") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, prompt_plan: await optimizePromptsConfigured(body) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/check-prompts") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, report: await checkPrompts(body) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/google-play") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, google_play: await googlePlayLookup(body) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/upload-reference") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, file: await uploadReferenceImage(body, req) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/generate-icons") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, images: await generateIcons(body) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/regenerate-icon") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, image: await regenerateIcon(body) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/export-icons") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, export: await exportIcons(body) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/qa") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, reports: await qaImages(body) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/smoke-test") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, result: await runSmokeTest(String(body.mode || "quick"), req) });
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(port, () => {
  console.log(`应用icon创作大师已启动：http://localhost:${port}`);
  console.log(`模型状态：${apiKey ? "已读取 OPENAI_API_KEY" : "未设置 OPENAI_API_KEY"}`);
});
