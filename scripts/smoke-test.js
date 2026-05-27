const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const baseUrl = (process.env.TEST_BASE_URL || "http://localhost:8787").replace(/\/+$/, "");
const mode = (process.argv[2] || "quick").replace(/^--/, "").toLowerCase();
const modes = new Set(["quick", "ai", "full"]);

if (!modes.has(mode)) {
  console.error("Usage: npm run smoke [quick|ai|full]");
  process.exit(1);
}

const state = {
  uploaded: null,
  analysis: null,
  promptPlan: null,
  generatedImages: null,
  exportResult: null,
};

function logStep(name) {
  console.log(`\n== ${name}`);
}

function pass(message) {
  console.log(`OK  ${message}`);
}

function fail(message) {
  throw new Error(message);
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = data?.error || data?.message || text || response.statusText;
    fail(`${pathname} failed: HTTP ${response.status} ${message}`);
  }
  return data;
}

async function post(pathname, payload) {
  return request(pathname, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function head(url) {
  const response = await fetch(url, { method: "HEAD" });
  if (!response.ok) fail(`HEAD ${url} failed: HTTP ${response.status}`);
  return response;
}

function assert(value, message) {
  if (!value) fail(message);
}

async function makeTinyPngDataUrl() {
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
        input: Buffer.from(
          '<svg width="32" height="32"><circle cx="16" cy="16" r="9" fill="#facc15"/></svg>',
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function basePayload() {
  return {
    product: "Test Kingdom Builder",
    competitors: "Township",
    platform: "Google Ads",
    platformRules: "- No misleading claims\n- No gore, nudity, or copyrighted competitor logos\n- Icon must be readable at 64px",
    emotion: ["好奇", "成就感"],
    textEnabled: "否",
    badgeText: "",
    reference: "Use uploaded reference as highest priority style cue.",
    referenceFiles: state.uploaded
      ? [
          {
            name: state.uploaded.name,
            type: state.uploaded.type,
            size: state.uploaded.size,
            url: state.uploaded.url,
            publicUrl: state.uploaded.public_url,
            dataUrl: "",
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
      icon: state.uploaded?.public_url || "",
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

async function testHealth() {
  logStep("Health");
  const health = await request("/api/health");
  assert(health.ok, "health.ok is false");
  assert(health.ai_provider, "missing ai_provider");
  assert(health.image_provider, "missing image_provider");
  pass(`providers: text=${health.ai_provider}, image=${health.image_provider}`);
  if (!health.has_api_key) {
    console.warn("WARN model key check is false. quick tests can continue, ai/full will fail.");
  }
}

async function testStaticPage() {
  logStep("Static page");
  const response = await fetch(`${baseUrl}/`);
  assert(response.ok, `page failed: HTTP ${response.status}`);
  const html = await response.text();
  assert(html.includes("app.js"), "index.html does not reference app.js");
  pass("index.html loads");
}

async function testConfig() {
  logStep("Local config");
  const configPath = path.join(process.cwd(), "icon-agent.config.json");
  assert(fs.existsSync(configPath), "icon-agent.config.json is missing");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert(config.protocol_schema?.ICON_CREATIVE_PROTOCOL, "missing ICON_CREATIVE_PROTOCOL schema");
  assert(config.prompt_templates?.s2_analysis, "missing s2_analysis template");
  assert(config.prompt_templates?.s4_prompt_plan, "missing s4_prompt_plan template");
  pass("config file is parseable and contains protocol/templates");
}

async function testUpload() {
  logStep("Reference upload");
  const dataUrl = await makeTinyPngDataUrl();
  const result = await post("/api/upload-reference", {
    name: "smoke-reference.png",
    type: "image/png",
    dataUrl,
  });
  assert(result.ok, "upload result ok=false");
  assert(result.file?.public_url, "upload missing public_url");
  state.uploaded = result.file;
  pass(`uploaded: ${result.file.public_url}`);

  const response = await head(result.file.public_url);
  const contentType = response.headers.get("content-type") || "";
  assert(contentType.startsWith("image/"), `uploaded file content-type is not image/*: ${contentType}`);
  pass(`uploaded URL is directly accessible: ${contentType}`);
}

async function testAnalyze() {
  logStep("S2 analyze");
  const result = await post("/api/analyze", basePayload());
  assert(result.ok, "analyze result ok=false");
  assert(result.analysis, "missing analysis");
  assert(result.analysis.ICON_CREATIVE_PROTOCOL, "missing ICON_CREATIVE_PROTOCOL");
  assert(result.analysis.generation_prompt_fields, "missing generation_prompt_fields");
  assert(result.analysis.locked_insights_for_next_stage, "missing locked_insights_for_next_stage");
  state.analysis = result.analysis;
  pass("S2 analysis returned protocol and compatible fields");
}

async function testOptimizePrompts() {
  logStep("S4 prompt plan");
  const payload = {
    ...basePayload(),
    modelAnalysis: state.analysis,
    count: 1,
    directions: ["点击强化"],
  };
  const result = await post("/api/optimize-prompts", payload);
  assert(result.ok, "optimize result ok=false");
  assert(Array.isArray(result.prompt_plan), "prompt_plan is not an array");
  assert(result.prompt_plan.length >= 1, "prompt_plan is empty");
  assert(
    result.prompt_plan[0].final_prompt || result.prompt_plan[0].prompt || result.prompt_plan[0].generation_prompt_fields,
    "prompt_plan item missing prompt data",
  );
  state.promptPlan = result.prompt_plan;
  pass("S4 prompt plan returned");
}

async function testGenerateAndExport() {
  logStep("S5 generate icon");
  const plan = state.promptPlan?.[0] || {};
  const promptText =
    plan.final_prompt ||
    plan.prompt ||
    "Create a production-ready transparent-background mobile game app icon, single golden castle emblem, high contrast, readable at 64px.";
  const payload = {
    ...basePayload(),
    count: 1,
    promptJson: [
      {
        prompt_id: "smoke_prompt_1",
        variant_tag: "点击强化",
        prompt_text: promptText,
        generation: { source: "smoke-test", mode: "image_to_image_with_prompt" },
      },
    ],
  };
  const generated = await post("/api/generate-icons", payload);
  assert(generated.ok, "generate result ok=false");
  assert(Array.isArray(generated.images) && generated.images.length >= 1, "no generated images");
  assert(generated.images[0].url, "generated image missing url");
  assert(generated.images[0].scene_url, "generated image missing scene_url");
  state.generatedImages = generated.images;
  pass(`generated icon: ${generated.images[0].url}`);

  logStep("S8 export");
  const exported = await post("/api/export-icons", {
    ...basePayload(),
    generatedImages: state.generatedImages,
    selectedImageIds: [state.generatedImages[0].image_id],
    sizes: [1024, 512, 256, 128, 64],
  });
  assert(exported.ok, "export result ok=false");
  assert(exported.export?.zip_url, "missing zip_url");
  assert(exported.export?.files?.some((file) => file.size === 64), "missing 64px output");
  state.exportResult = exported.export;
  pass(`export zip: ${baseUrl}${exported.export.zip_url}`);
}

async function main() {
  console.log(`Smoke test mode: ${mode}`);
  console.log(`Base URL: ${baseUrl}`);
  await testStaticPage();
  await testHealth();
  await testConfig();
  await testUpload();
  if (mode === "ai" || mode === "full") {
    await testAnalyze();
    await testOptimizePrompts();
  }
  if (mode === "full") {
    await testGenerateAndExport();
  }
  console.log("\nAll requested smoke tests passed.");
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}`);
  process.exit(1);
});
