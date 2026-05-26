const stages = [
  { id: 1, title: "S1 产品检索 & 需求输入", mode: "用户参与" },
  { id: 2, title: "S2 产品 / 竞品 / Icon 分析", mode: "系统自动" },
  { id: 3, title: "S3 Prompt 组装 & 用户确认", mode: "用户参与" },
  { id: 4, title: "S4 Prompt 自检状态", mode: "系统自动" },
  { id: 5, title: "S5 Icon 生成", mode: "系统自动" },
  { id: 6, title: "S6 自动质检 + 用户决策", mode: "用户参与" },
  { id: 7, title: "S7 微调 / 重生执行", mode: "系统自动" },
  { id: 8, title: "S8 多尺寸导出 & 交付", mode: "系统自动" },
];

const state = {
  stage: 1,
  product: "",
  competitors: "",
  platform: "Google Ads",
  platformRules: defaultPlatformRules("Google Ads"),
  platformRulesEdited: false,
  emphasis: "",
  sensitive: "",
  emotion: [],
  textEnabled: "否",
  badgeText: "",
  reference: "",
  referenceFiles: [],
  count: 2,
  directions: ["点击强化"],
  decision: "SELECT",
  api: {
    checked: false,
    available: false,
    hasKey: false,
    textModel: "",
    imageModel: "",
    loading: "",
    error: "",
  },
  googlePlay: null,
  modelAnalysis: null,
  promptJson: [],
  promptOptimizations: [],
  promptTemplate: defaultPromptTemplate(),
  promptTemplateEditing: false,
  promptConfirmed: false,
  generatedImages: [],
  previewImage: null,
  previewImageUrl: "",
  previewImageKind: "",
  qaReports: [],
  selectedImageIds: [],
  regenerateTargetId: "",
  regeneratePrompt: "",
  exportResult: null,
};

const $ = (selector) => document.querySelector(selector);
const apiBase = window.location.protocol === "file:" ? "http://localhost:8787" : "";

function renderShell() {
  $("#stageNav").innerHTML = stages
    .map(
      (stage) => `
        <button class="stage-link ${stage.id === state.stage ? "active" : ""} ${stage.id < state.stage ? "done" : ""}" data-stage="${stage.id}" type="button">
          <span class="stage-num">S${stage.id}</span>
          <span class="stage-name">${stage.title.replace(/^S\d+\s/, "")}</span>
          <span class="stage-tag ${stage.mode === "用户参与" ? "user" : ""}">${stage.mode}</span>
        </button>
      `,
    )
    .join("");

  $("#flowLine").innerHTML = stages
    .map(
      (stage) => `
        <div class="flow-node ${stage.id === state.stage ? "active" : ""} ${stage.id < state.stage ? "done" : ""}">
          <span class="flow-index">S${stage.id}</span>
          <p>${stage.title.replace(/^S\d+\s/, "")}</p>
        </div>
      `,
    )
    .join("");

  document.querySelectorAll(".stage-link").forEach((button) => {
    button.addEventListener("click", () => {
      state.stage = Number(button.dataset.stage);
      render();
    });
  });
}

function renderLockedSummary() {
  $("#lockedSummary").innerHTML = `
    <div><dt>产品</dt><dd>${state.product || "待输入"}</dd></div>
    <div><dt>平台</dt><dd>${state.platform}</dd></div>
    <div><dt>情绪</dt><dd>${state.emotion.length ? state.emotion.join(" / ") : "待选择"}</dd></div>
    <div><dt>文字角标</dt><dd>${state.textEnabled === "是" ? state.badgeText || "待输入" : "默认不加"}</dd></div>
  `;
}

function syncInputs() {
  document.querySelectorAll("[data-bind]").forEach((el) => {
    const key = el.dataset.bind;
    if (el.type === "checkbox") {
      el.checked = Boolean(state[key]);
    } else {
      el.value = state[key] ?? "";
    }
    el.addEventListener("input", () => {
      state[key] = el.value;
      if (key === "platform" && !state.platformRulesEdited) {
        state.platformRules = defaultPlatformRules(el.value);
      }
      if (key === "platformRules") {
        state.platformRulesEdited = true;
      }
      if (["product", "competitors", "platform", "platformRules", "textEnabled", "badgeText", "count", "promptTemplate"].includes(key)) {
        invalidatePrompts();
      }
      if (key === "regeneratePrompt") {
        state.regeneratePrompt = el.value;
      }
      renderLockedSummary();
      renderOutput();
    });
  });

  document.querySelectorAll("[data-chip]").forEach((button) => {
    const key = button.dataset.group;
    const value = button.dataset.chip;
    button.classList.toggle("active", state[key].includes(value));
    button.addEventListener("click", () => {
      const set = new Set(state[key]);
      if (set.has(value)) {
        set.delete(value);
      } else if (key === "emotion" && set.size >= 3) {
        state.api.error = "情绪目标最多选择 3 项。";
        render();
        return;
      } else {
        set.add(value);
      }
      state[key] = [...set];
      if (key === "emotion" || key === "directions") {
        invalidatePrompts();
      }
      state.api.error = "";
      render();
    });
  });

  document.querySelectorAll("[data-single]").forEach((button) => {
    const key = button.dataset.group;
    const value = button.dataset.single;
    button.classList.toggle("active", String(state[key]) === value);
    button.addEventListener("click", () => {
      state[key] = value;
      render();
    });
  });

  const fileInput = $("#referenceFiles");
  if (fileInput) {
    fileInput.addEventListener("change", (event) => {
      handleReferenceFiles(event.target.files);
    });
  }

  const clearFiles = $("#clearReferenceFiles");
  if (clearFiles) {
    clearFiles.addEventListener("click", () => {
      clearReferenceFiles();
      render();
    });
  }

  document.querySelectorAll("[data-preview-image]").forEach((button) => {
    button.addEventListener("click", () => {
      const image = state.generatedImages.find((item) => item.image_id === button.dataset.previewImage);
      if (image) {
        state.previewImage = image;
        state.previewImageUrl = image.url;
        state.previewImageKind = "icon";
        render();
      }
    });
  });

  document.querySelectorAll("[data-preview-scene]").forEach((button) => {
    button.addEventListener("click", () => {
      const image = state.generatedImages.find((item) => item.image_id === button.dataset.previewScene);
      if (image) {
        state.previewImage = image;
        state.previewImageUrl = image.scene_url || image.url;
        state.previewImageKind = "scene";
        render();
      }
    });
  });

  document.querySelectorAll("[data-close-preview]").forEach((button) => {
    button.addEventListener("click", () => {
      state.previewImage = null;
      state.previewImageUrl = "";
      state.previewImageKind = "";
      render();
    });
  });

  document.querySelectorAll("[data-model-action]").forEach((action) => {
    action.addEventListener("click", async () => {
      const actionName = action.dataset.modelAction;
      if (actionName === "google-play") await runGooglePlayLookup();
      if (actionName === "analyze") await runModelAnalysis();
      if (actionName === "generate") await runIconGeneration();
      if (actionName === "qa") await runQa();
      if (actionName === "regenerate") await runRegenerate();
      if (actionName === "export") await runExport();
      if (actionName === "optimize-prompts") await runPromptOptimization();
    });
  });

  document.querySelectorAll("[data-select-image]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const id = checkbox.dataset.selectImage;
      const selected = new Set(state.selectedImageIds);
      if (checkbox.checked && selected.size >= 2 && !selected.has(id)) {
        state.api.error = "一次最多选择 2 个 icon 进入交付。";
        render();
        return;
      }
      checkbox.checked ? selected.add(id) : selected.delete(id);
      state.selectedImageIds = [...selected];
      state.api.error = "";
      render();
    });
  });

  document.querySelectorAll("[data-regenerate-image]").forEach((button) => {
    button.addEventListener("click", () => {
      const image = state.generatedImages.find((item) => item.image_id === button.dataset.regenerateImage);
      if (!image) return;
      if (Number(image.regenerate_count || 0) >= 2) {
        state.api.error = "该 icon 已达到最多 2 次重生限制。请回到 S3 修改提示词模板或最终提示词。";
        render();
        return;
      }
      state.regenerateTargetId = image.image_id;
      state.regeneratePrompt = image.prompt_text || findPromptForImage(image)?.prompt_text || "";
      state.stage = 7;
      render();
    });
  });

  document.querySelectorAll("[data-ui-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const actionName = button.dataset.uiAction;
      if (actionName === "toggle-template") {
        state.promptTemplateEditing = !state.promptTemplateEditing;
      }
      if (actionName === "reset-template") {
        state.promptTemplate = defaultPromptTemplate();
        invalidatePrompts();
      }
      if (actionName === "rebuild-prompts") {
        state.promptJson = buildPromptJsonFromState();
        state.promptConfirmed = false;
      }
      if (actionName === "confirm-prompts") {
        getPromptJson();
        state.promptConfirmed = true;
      }
      render();
    });
  });

  document.querySelectorAll("[data-prompt-edit]").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const index = Number(textarea.dataset.promptEdit);
      getPromptJson();
      if (state.promptJson[index]) {
        state.promptJson[index].prompt_text = textarea.value;
        state.promptJson[index].user_edited = true;
        state.promptConfirmed = false;
        renderOutput();
      }
    });
  });

  document.querySelectorAll("[data-open-url]").forEach((button) => {
    button.addEventListener("click", () => {
      const url = button.dataset.openUrl;
      if (!url) return;
      const href = assetUrl(url);
      const link = document.createElement("a");
      link.href = href;
      if (button.dataset.download === "true") {
        link.download = url.split("/").pop() || "icon-package.zip";
      } else {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  });
}

async function runGooglePlayLookup() {
  state.competitors = parseCompetitorNames(state.competitors).join(", ");
  await runModelTask("正在检索", async () => {
    const data = await apiPost("/api/google-play", getApiPayload());
    state.googlePlay = data.google_play;
    state.modelAnalysis = null;
    state.promptJson = [];
  }, { requireKey: false });
}

function getApiPayload() {
  return {
    product: state.product,
    competitors: parseCompetitorNames(state.competitors).join(", "),
    platform: state.platform,
    platform_constraints_import: platformRulesToConstraints(),
    platformRules: state.platformRules || defaultPlatformRules(state.platform),
    emphasis: state.emphasis,
    sensitive: state.sensitive,
    emotion: state.emotion,
    textEnabled: state.textEnabled,
    badgeText: state.badgeText,
    reference: state.reference,
    referenceFiles: state.referenceFiles.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
      dataUrl: file.dataUrl || "",
      url: file.url || "",
      publicUrl: file.publicUrl || "",
      uploadStatus: file.uploadStatus || "",
    })),
    googlePlayProfile: state.googlePlay?.product_profile || null,
    googlePlayReferences: state.googlePlay?.visual_reference_pack || null,
    competitorGooglePlayProfiles: state.googlePlay?.competitor_profiles || [],
    competitorGooglePlayReferences: state.googlePlay?.competitor_visual_reference_pack || [],
    count: state.count,
    directions: state.directions,
    modelAnalysis: state.modelAnalysis,
    promptJson: getPromptJson(),
    promptTemplate: state.promptTemplate,
    promptOptimizations: state.promptOptimizations,
    generatedImages: state.generatedImages,
    selectedImageIds: state.selectedImageIds,
  };
}

function getPromptJson() {
  if (state.promptJson.length) return state.promptJson;
  state.promptJson = buildPromptJsonFromState();
  return state.promptJson;
}

function invalidatePrompts() {
  state.promptJson = [];
  state.promptConfirmed = false;
  state.promptOptimizations = [];
}

function buildPromptJsonFromState() {
  const count = Math.max(1, Math.min(2, Number(state.count) || 2));
  const plan = state.promptOptimizations.length
    ? state.promptOptimizations
    : Array.isArray(state.modelAnalysis?.prompt_plan)
      ? state.modelAnalysis.prompt_plan
      : [];
  const profile = state.googlePlay?.product_profile || {};
  const competitors = state.googlePlay?.competitor_profiles || [];
  const analysis = state.modelAnalysis || {};
  return Array.from({ length: count }).map((_, index) => {
    const direction = state.directions[index % Math.max(1, state.directions.length)] || "点击强化";
    const planItem = plan[index] || {};
    const textSpec =
      state.textEnabled === "是"
        ? { enabled: true, text: state.badgeText || "", position: "bottom-right badge", max_chars: 5 }
        : { enabled: false, no_text: true };
    const promptText = buildGenerationPromptText({
      direction: planItem.variant_tag || direction,
      planItem,
      textSpec,
      profile,
      competitors,
      analysis,
      index,
    });

    return {
      task_id: `app-icon-master-${new Date().getFullYear()}-demo`,
      prompt_id: `s4_prompt_${index + 1}`,
      variant_tag: planItem.variant_tag || direction,
      platform: state.platform,
      asset_type: "icon",
      render_spec: { ratio: "1:1", size: 1024, no_text: !textSpec.enabled },
      subject: {
        product: profile.app_title || state.product || "待产品确认",
        app_id: profile.app_id || "",
        category: profile.category || "",
        recommended_subject:
          analysis.locked_insights_for_next_stage?.identity_anchor ||
          analysis.product_icon_analysis?.main_subject ||
          analysis.style_params?.recommended_subject ||
          analysis.style_params?.subject ||
          "",
      },
      style: {
        common_signature:
          analysis.common_icon_signature ||
          analysis.common_style_signature ||
          "single subject, high contrast, simple background",
        style_params: analysis.style_params || {},
        differentiation: analysis.differentiation_opportunities || analysis.differentiation_strategy || "",
        platform_constraints: platformRulesToConstraints(),
      },
      composition: {
        layout: "centered single dominant subject",
        subject_scale: "70-82% of canvas",
        background: "simple clean high-contrast background",
        small_size_rule: "must remain readable at 64px",
      },
      emotion: state.emotion,
      constraints: {
        must_include:
          analysis.locked_insights_for_next_stage?.must_include_candidates?.length
            ? analysis.locked_insights_for_next_stage.must_include_candidates
            : ["核心主体", "产品身份", "高识别度轮廓"],
        must_not_include:
          analysis.locked_insights_for_next_stage?.must_not_include_candidates?.length
            ? analysis.locked_insights_for_next_stage.must_not_include_candidates
            : ["误导承诺", "血腥", "裸露", "侵权元素"],
        brand_colors: [],
      },
      text_spec: textSpec,
      generation: {
        n: 1,
        source: "S3 confirmed prompt_json",
        mode: hasGenerationReferences() ? "image_to_image_with_prompt" : "text_to_image",
      },
      prompt_text: promptText,
    };
  });
}

function buildGenerationPromptText({ direction, planItem, textSpec, profile, competitors, analysis, index }) {
  const productName = profile.app_title || state.product || "未填写产品";
  const competitorNames =
    competitors.map((item) => item.app_title).filter(Boolean).join(", ") || state.competitors || "无";
  const genre = [profile.category, profile.short_description].filter(Boolean).join(" - ") || "unknown app category";
  const directionRules = {
    保守: [
      "Stay close to the original product icon identity and market norms.",
      "Prioritize familiarity, brand continuity, and app-store polish.",
      "Avoid surprising subject changes or overly aggressive effects.",
    ],
    点击强化: [
      "Increase first-glance click appeal with stronger scale, contrast, shine, and a clearer focal silhouette.",
      "Use a more memorable subject pose or emblem treatment while preserving product identity.",
      "Make the icon stand out in a crowded ad feed without becoming cluttered.",
    ],
    极致夸张: [
      "Use bold exaggeration, oversized focal subject, and dramatic lighting for maximum stopping power.",
      "Keep the subject count to one and preserve 64px readability despite the exaggerated treatment.",
      "Do not drift into unrelated fantasy or competitor imitation.",
    ],
  };
  const selectedDirectionRules = directionRules[direction] || directionRules["点击强化"];
  const modelPrompt =
    planItem.prompt ||
    planItem.generation_prompt ||
    analysis.prompt_plan?.[index]?.prompt ||
    analysis.prompt_plan?.[index]?.generation_prompt ||
    "";
  const productBrief = synthesizeProductBrief({ productName, profile, analysis });
  const visualConcept = synthesizeVisualConcept({ direction, planItem, analysis, productName });
  const styleBrief = synthesizeStyleBrief({ analysis });
  const referenceBrief = synthesizeReferenceBrief({ competitorNames });
  const fields = buildIconPromptFields({
    direction,
    planItem,
    textSpec,
    profile,
    competitors,
    analysis,
    productName,
    productBrief,
    visualConcept,
    styleBrief,
    referenceBrief,
  });
  fields.creative_direction = direction;
  fields.direction_guidance = selectedDirectionRules.map((rule) => `- ${rule}`).join("\n");

  return applyPromptTemplate(state.promptTemplate || defaultPromptTemplate(), fields);
}

function synthesizeProductBrief({ productName, profile, analysis }) {
  const productAnalysis = analysis.product_analysis || {};
  const profileText = stringifyPromptValue(productAnalysis);
  const category = profile.category || "";
  const desc = profile.short_description || "";
  const base = [productName, category, desc].filter(Boolean).join(", ");
  return [base, profileText].filter(Boolean).join(". ");
}

function synthesizeVisualConcept({ direction, planItem, analysis, productName }) {
  const candidate =
    planItem.visual_concept ||
    planItem.concept ||
    planItem.generation_prompt ||
    planItem.prompt ||
    planItem.subject_type ||
    planItem.archetype ||
    analysis.locked_insights_for_next_stage?.identity_anchor ||
    analysis.product_icon_analysis?.main_subject ||
    analysis.common_icon_signature?.subject_pattern ||
    analysis.style_params?.recommended_subject ||
    analysis.style_params?.subject_spec ||
    analysis.differentiation_opportunities?.possible_breakthrough_points?.join("; ") ||
    analysis.differentiation_strategy ||
    "";
  if (candidate) return stringifyPromptValue(candidate);
  return `a distinct single-subject icon that instantly communicates ${productName}'s core category and emotional reward`;
}

function synthesizeStyleBrief({ analysis }) {
  return [
    stringifyPromptValue(analysis.product_analysis || ""),
    stringifyPromptValue(analysis.product_icon_analysis || ""),
    stringifyPromptValue(analysis.common_icon_signature || ""),
    stringifyPromptValue(analysis.differentiation_opportunities || ""),
    stringifyPromptValue(analysis.common_style_signature || ""),
    stringifyPromptValue(analysis.style_params || ""),
  ]
    .filter(Boolean)
    .join("; ") || "premium polished mobile game icon style, high contrast, simple background, crisp 64px readability";
}

function synthesizeReferenceBrief({ competitorNames }) {
  const parts = [
    "the actual reference images are provided to the model",
    "the product icon defines the identity anchor",
  ];
  if (competitorNames && competitorNames !== "无") {
    parts.push(`competitor icons (${competitorNames}) define only category norms and visual polish`);
  }
  parts.push("feature graphics and screenshots are not used for generation references");
  if (state.modelAnalysis?.reference_usage) {
    parts.push(stringifyPromptValue(state.modelAnalysis.reference_usage));
  }
  return parts.join("; ");
}

function stringifyPromptValue(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function defaultPromptTemplate() {
  return `Create a high-converting mobile game app icon for {platform}.

ASSET SPEC:
- mobile game app icon
- {size}x{size}
- square composition
- premium polished finish
- app store quality

PLATFORM OPTIMIZATION:
- optimized for {platform}
- high click-through-rate creative
- optimized for small-size readability
- recognizable at 64px
- single dominant subject
- clean uncluttered composition
- high contrast
- instant visual comprehension

GAME / PRODUCT THEME:
- {game_genre}
- {setting}
- {core_narrative}
- {scene_context}

MAIN SUBJECT:
- {subject_type}
- {archetype}
- {pose}
- {facial_expression}
- {camera_angle}
- {eye_contact}

CREATIVE DIRECTION:
- {creative_direction}
{direction_guidance}

VISUAL STYLE:
- {render_style}
- {detail_level}
- {lighting_style}
- {color_strategy}
- {surface_finish}
- stylized for mobile game advertising

BACKGROUND:
- {background_story}
- simplified for icon readability
- minimal clutter
- atmospheric depth only

EMOTION TARGET:
- {emotion_1}
- {emotion_2}
- {emotion_3}

CLICK MECHANISM:
- {curiosity_trigger}
- {urgency_trigger}
- {emotional_reaction_trigger}
- {dramatic_visual_tension}

VALUE / DESIRE EXPRESSION:
- {value_desire}
- expressed via {symbol_set}

REFERENCE IMAGE USAGE:
- {reference_mode}
- {reference_usage}
- product icon reference is the identity anchor
- competitor icon references are market-style references only
- uploaded user references have highest priority
- do not copy any reference icon exactly

TEXT ELEMENT:
{optional_text_rule}

STRICT CONSTRAINTS:
{must_not_include_lines}
- NO multiple focal subjects
- NO tiny unreadable details
- NO clutter
- NO UI screenshots
- NO irrelevant objects

OUTPUT QUALITY:
- premium mobile game ad creative
- hyper-polished icon rendering
- production-ready advertising asset
- transparent-background PNG with alpha channel
- output only the square app icon artwork, no mockup, no phone frame, no store page, no ad layout`;
}

function applyPromptTemplate(template, fields) {
  const values = {
    ...fields,
    must_not_include_lines:
      fields.must_not_include_lines || fields.must_not_include.map((item) => `- NO ${item}`).join("\n"),
  };
  return String(template || defaultPromptTemplate()).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = values[key];
    if (Array.isArray(value)) return value.join(", ");
    if (value === undefined || value === null || value === "") return `[${key}]`;
    return String(value);
  });
}

function buildIconPromptFields({
  direction,
  planItem,
  textSpec,
  profile,
  analysis,
  productName,
  productBrief,
  visualConcept,
  styleBrief,
  referenceBrief,
}) {
  const styleParams = typeof analysis.style_params === "object" && analysis.style_params ? analysis.style_params : {};
  const productAnalysis =
    typeof analysis.product_analysis === "object" && analysis.product_analysis ? analysis.product_analysis : {};
  const productIcon =
    typeof analysis.product_icon_analysis === "object" && analysis.product_icon_analysis ? analysis.product_icon_analysis : {};
  const commonIcon =
    typeof analysis.common_icon_signature === "object" && analysis.common_icon_signature ? analysis.common_icon_signature : {};
  const diff =
    typeof analysis.differentiation_opportunities === "object" && analysis.differentiation_opportunities
      ? analysis.differentiation_opportunities
      : {};
  const promptFields =
    typeof analysis.generation_prompt_fields === "object" && analysis.generation_prompt_fields
      ? analysis.generation_prompt_fields
      : {};
  const planFields =
    typeof planItem.generation_prompt_fields === "object" && planItem.generation_prompt_fields
      ? planItem.generation_prompt_fields
      : {};
  const mergedPromptFields = { ...promptFields, ...planFields };
  const locked =
    typeof analysis.locked_insights_for_next_stage === "object" && analysis.locked_insights_for_next_stage
      ? analysis.locked_insights_for_next_stage
      : {};
  const emotionSpec = typeof analysis.emotion_spec === "object" && analysis.emotion_spec ? analysis.emotion_spec : {};
  const clickSpec = typeof analysis.click_mechanism === "object" && analysis.click_mechanism ? analysis.click_mechanism : {};
  const emotions = normalizeList(
    [emotionSpec.emotion_1, emotionSpec.emotion_2, emotionSpec.emotion_3].filter(Boolean).length
      ? [emotionSpec.emotion_1, emotionSpec.emotion_2, emotionSpec.emotion_3]
      : state.emotion,
    ["curiosity", "reward satisfaction", "confidence"],
  );
  const mustAvoid = normalizeList(
    locked.must_not_include_candidates || [],
    ["misleading claims", "copied competitor logo", "gore or nudity"],
  ).slice(0, 6);
  const subjectSpec =
    mergedPromptFields.subject_type ||
    locked.identity_anchor ||
    productIcon.main_subject ||
    commonIcon.subject_pattern ||
    styleParams.subject_spec ||
    styleParams.subject ||
    styleParams.recommended_subject ||
    planItem.subject ||
    visualConcept;
  const renderSpec =
    mergedPromptFields.render_style ||
    productAnalysis.visual_style ||
    productIcon.visual_style ||
    commonIcon.rendering_pattern ||
    styleParams.render_spec ||
    styleParams.render ||
    styleParams.visual_style ||
    styleBrief;
  const paletteSpec =
    mergedPromptFields.color_strategy ||
    productIcon.color_features ||
    commonIcon.color_pattern ||
    styleParams.palette_spec ||
    styleParams.palette ||
    styleParams.color_strategy ||
    "high-contrast colors derived from the product icon reference";
  const compositionSpec =
    mergedPromptFields.background_story ||
    productIcon.composition_features ||
    commonIcon.composition_pattern ||
    styleParams.composition_spec ||
    styleParams.composition ||
    "single centered subject occupying 70-82% of the canvas";
  const importedPlatformConstraints = platformRulesToConstraints();

  return {
    platform: state.platform || "Google Ads",
    size: 2048,
    game_genre: mergedPromptFields.game_genre || productAnalysis.core_gameplay || profile.category || inferGenre(productBrief) || "mobile game",
    setting:
      mergedPromptFields.setting ||
      productAnalysis.theme ||
      styleParams.setting ||
      inferSetting(productBrief) ||
      "the product's core game world and category fantasy",
    core_narrative:
      mergedPromptFields.core_narrative ||
      productAnalysis.core_selling_points?.join("; ") ||
      styleParams.core_narrative ||
      productBrief ||
      `${productName}'s core gameplay fantasy`,
    scene_context:
      mergedPromptFields.scene_context ||
      productAnalysis.ad_expressible_points?.join("; ") ||
      diff.possible_breakthrough_points?.join("; ") ||
      "a distilled symbolic moment that communicates the game's main reward in one glance",
    subject_type: subjectSpec || "one iconic main product-related subject",
    archetype:
      mergedPromptFields.archetype ||
      styleParams.archetype ||
      inferArchetype(productBrief, profile.category) ||
      "category-defining hero object or character emblem",
    pose: mergedPromptFields.pose || styleParams.pose || directionPose(direction),
    facial_expression: mergedPromptFields.facial_expression || styleParams.facial_expression || inferExpression(emotions),
    camera_angle: mergedPromptFields.camera_angle || styleParams.camera_angle || "front-facing three-quarter close-up, icon-friendly",
    eye_contact:
      mergedPromptFields.eye_contact ||
      styleParams.eye_contact ||
      "direct visual engagement if the subject has eyes; otherwise strong frontal silhouette",
    render_style: renderSpec || "premium stylized 3D mobile game icon rendering",
    detail_level: mergedPromptFields.detail_level || styleParams.detail_level || "medium detail, large readable shapes, no tiny decorative noise",
    lighting_style:
      mergedPromptFields.lighting_style ||
      styleParams.lighting_style ||
      "bright key light, glossy highlights, soft rim light for separation",
    color_strategy: paletteSpec,
    surface_finish: mergedPromptFields.surface_finish || styleParams.surface_finish || "polished, tactile, rounded, app-store quality",
    background_story: compositionSpec || styleParams.background_story || "simple atmospheric background that supports the main subject",
    emotion_1: emotions[0],
    emotion_2: emotions[1],
    emotion_3: emotions[2],
    curiosity_trigger: mergedPromptFields.curiosity_trigger || clickSpec.curiosity_trigger || clickTrigger(direction, "curiosity"),
    urgency_trigger: mergedPromptFields.urgency_trigger || clickSpec.urgency_trigger || clickTrigger(direction, "urgency"),
    emotional_reaction_trigger:
      mergedPromptFields.emotional_reaction_trigger || clickSpec.emotional_reaction_trigger || clickTrigger(direction, "emotion"),
    dramatic_visual_tension:
      mergedPromptFields.dramatic_visual_tension || clickSpec.dramatic_visual_tension || clickTrigger(direction, "tension"),
    value_desire:
      mergedPromptFields.value_desire ||
      productAnalysis.core_selling_points?.slice(0, 2).join(", ") ||
      styleParams.value_desire ||
      inferValueDesire(productBrief, profile.category),
    symbol_set:
      mergedPromptFields.symbol_set ||
      productIcon.identity_cues?.join(", ") ||
      locked.style_keywords?.join(", ") ||
      styleParams.symbol_set ||
      inferSymbolSet(productBrief, profile.category),
    reference_mode: hasGenerationReferences()
      ? "Use image-to-image generation with the provided reference images plus this prompt."
      : "Use text-to-image generation because no reference images are available.",
    reference_usage: referenceBrief,
    optional_text_rule: textSpec.enabled
      ? `Add only a tiny bottom-right badge with exact text "${textSpec.text}", max ${textSpec.max_chars} characters.`
      : "No text, no letters, no numbers, no watermark, no UI labels.",
    must_not_include: mustAvoid,
    must_not_include_lines: buildStrictConstraintLines(mustAvoid, importedPlatformConstraints),
  };
}

function buildStrictConstraintLines(mustAvoid, importedPlatformConstraints) {
  const noLines = normalizeList(mustAvoid, []).map((item) => `- NO ${item}`);
  const importedRules = normalizeList(importedPlatformConstraints.imported_rules || [], []).map((item) => `- ${item}`);
  return [...noLines, ...importedRules].join("\n");
}

function normalizeList(value, fallback) {
  if (Array.isArray(value)) {
    const cleaned = value.map((item) => String(item).trim()).filter(Boolean);
    return cleaned.length ? [...cleaned, ...fallback].slice(0, 3) : fallback;
  }
  if (typeof value === "string" && value.trim()) return [value.trim(), ...fallback].slice(0, 3);
  return fallback;
}

function inferGenre(text) {
  const lower = String(text).toLowerCase();
  if (/match|puzzle|三消|益智/.test(lower)) return "casual puzzle / match-3 game";
  if (/kingdom|town|city|builder|strategy|simulation|建造|经营|策略/.test(lower)) return "strategy simulation / city-building game";
  if (/rpg|hero|battle|combat|adventure|角色|冒险/.test(lower)) return "RPG adventure game";
  return "";
}

function inferSetting(text) {
  const lower = String(text).toLowerCase();
  if (/kingdom|castle|royal|medieval|town|village/.test(lower)) return "medieval kingdom / town-building world";
  if (/candy|sweet|soda|match/.test(lower)) return "bright candy-like puzzle world";
  if (/farm|crop|harvest/.test(lower)) return "colorful farm adventure world";
  return "";
}

function inferArchetype(text, category) {
  const merged = `${text} ${category}`.toLowerCase();
  if (/kingdom|castle|royal|medieval|town|builder/.test(merged)) return "a bold medieval emblem such as a crowned town hall, royal builder, shield, or castle crest";
  if (/match|puzzle|candy|soda/.test(merged)) return "a glossy puzzle gem, crown, booster, or expressive game mascot emblem";
  if (/farm|crop/.test(merged)) return "a cheerful crop or farm mascot emblem";
  return "";
}

function inferExpression(emotions) {
  const text = emotions.join(" ");
  if (/搞笑|funny|humor/.test(text)) return "playful and humorous";
  if (/紧张|恐惧|urgency|survival/.test(text)) return "intense, alert, dramatic";
  if (/治愈|温暖|warm|healing/.test(text)) return "warm and inviting";
  return "confident, appealing, emotionally clear";
}

function directionPose(direction) {
  if (direction === "保守") return "stable centered pose, close to existing product identity";
  if (direction === "极致夸张") return "oversized dramatic pose with exaggerated scale and strong silhouette";
  return "dynamic close-up pose with stronger scale and click-focused emphasis";
}

function clickTrigger(direction, type) {
  const map = {
    curiosity: {
      保守: "familiar product identity with one polished intriguing focal detail",
      点击强化: "a bold focal object that makes users wonder what reward or action is inside",
      极致夸张: "an unexpected oversized focal element that creates instant visual surprise",
    },
    urgency: {
      保守: "subtle sense of progress or unlockable reward",
      点击强化: "strong shine, scale, and contrast suggesting immediate reward",
      极致夸张: "dramatic lighting and tension implying a high-stakes moment",
    },
    emotion: {
      保守: "trustworthy, polished, satisfying",
      点击强化: "rewarding, energetic, immediately clickable",
      极致夸张: "high emotion, dramatic reaction, memorable impact",
    },
    tension: {
      保守: "clean contrast between subject and background",
      点击强化: "visual contrast between large subject, bright highlight, and simple background",
      极致夸张: "strong cinematic contrast, oversized subject, and punchy silhouette",
    },
  };
  return map[type]?.[direction] || map[type]?.["点击强化"];
}

function inferValueDesire(text, category) {
  const merged = `${text} ${category}`.toLowerCase();
  if (/kingdom|town|builder|strategy|simulation/.test(merged)) return "power, growth, rebuilding, mastery";
  if (/match|puzzle|candy|reward/.test(merged)) return "reward, satisfaction, progression, collection";
  if (/survival|battle|combat/.test(merged)) return "survival, victory, power";
  return "reward, transformation, progress, achievement";
}

function inferSymbolSet(text, category) {
  const merged = `${text} ${category}`.toLowerCase();
  if (/kingdom|town|builder|medieval/.test(merged)) return "crown, castle crest, town hall, hammer, shield, coins, warm building glow";
  if (/match|puzzle|candy/.test(merged)) return "crown, glossy gems, puzzle pieces, boosters, sparkles, reward shine";
  if (/farm|crop/.test(merged)) return "crops, basket, farm badge, sunlit reward glow";
  return "one iconic product-related emblem supported by reward shine and simple symbolic props";
}

async function apiPost(path, payload) {
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error("无法连接本地模型服务。请访问 http://localhost:8787，或重启 node server.js。");
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `模型服务请求失败：HTTP ${response.status}`);
  }
  return data;
}

async function checkApiHealth() {
  try {
    const response = await fetch(`${apiBase}/api/health`);
    const data = await response.json();
    state.api = {
      checked: true,
      available: true,
      hasKey: Boolean(data.has_api_key),
      textModel:
        data.ai_provider === "volcengine"
          ? data.volcengine_text_model || ""
          : data.ai_provider === "aliyun"
            ? data.aliyun_text_model || ""
            : data.ai_provider === "kimi"
              ? data.kimi_text_model || ""
              : data.ai_provider === "deepseek"
                ? data.deepseek_text_model || ""
                : data.text_model || "",
      imageModel:
        data.image_provider === "volcengine"
          ? data.volcengine_image_model || ""
          : data.image_provider === "aliyun"
            ? data.aliyun_image_model || ""
            : data.image_provider === "kimi"
              ? data.kimi_image_model || ""
              : data.image_model || "",
      loading: "",
      error:
        (data.ai_provider === "volcengine" || data.image_provider === "volcengine") && !data.has_ark_api_key
          ? "未设置 ARK_API_KEY"
          :
        (data.ai_provider === "aliyun" || data.image_provider === "aliyun") && !data.has_dashscope_api_key
          ? "未设置 DASHSCOPE_API_KEY"
          :
        (data.ai_provider === "kimi" || data.image_provider === "kimi") && !data.has_kimi_api_key
          ? "未设置 KIMI_API_KEY"
          : data.has_api_key
            ? ""
            : "未设置 OPENAI_API_KEY",
    };
  } catch (error) {
    state.api = {
      checked: true,
      available: false,
      hasKey: false,
      textModel: "",
      imageModel: "",
      loading: "",
      error: "请先启动本地模型服务",
    };
  }
  renderApiStatus();
}

function renderApiStatus() {
  const el = $("#modelStatus");
  if (!el) return;
  const label = state.api.loading || (state.api.available && state.api.hasKey ? "已连接" : state.api.available ? "缺少 Key" : "未连接");
  el.classList.toggle("ready", state.api.available && state.api.hasKey);
  el.classList.toggle("busy", Boolean(state.api.loading));
  el.innerHTML = `<strong>${label}</strong><span>${state.api.imageModel || "模型连接"}</span>`;
}

async function runModelAnalysis() {
  await runModelTask("正在分析", async () => {
    const data = await apiPost("/api/analyze", getApiPayload());
    state.modelAnalysis = data.analysis;
    state.promptJson = buildPromptJsonFromState();
    state.promptConfirmed = false;
  });
}

async function runIconGeneration() {
  if (!state.promptConfirmed) {
    state.stage = 3;
    state.api.error = "请先在 S3 确认提示词，再进入 Icon 生成。";
    render();
    return;
  }
  await runModelTask("正在生成", async () => {
    getPromptJson();
    const data = await apiPost("/api/generate-icons", getApiPayload());
    state.generatedImages = (data.images || []).map((image) => ({
      ...image,
      prompt_text: findPromptById(image.prompt_id)?.prompt_text || "",
      version: image.version || 1,
      regenerate_count: image.regenerate_count || 0,
    }));
    state.selectedImageIds = [];
    state.exportResult = null;
    state.stage = 5;
  });
}

async function runQa() {
  await runModelTask("正在质检", async () => {
    const data = await apiPost("/api/qa", getApiPayload());
    state.qaReports = data.reports || [];
    state.stage = 6;
  });
}

async function runPromptOptimization() {
  await runModelTask("正在优化提示词", async () => {
    const data = await apiPost("/api/optimize-prompts", {
      ...getApiPayload(),
      promptJson: [],
    });
    state.promptOptimizations = data.prompt_plan || [];
    state.promptJson = buildPromptJsonFromState();
    state.promptConfirmed = false;
    state.stage = 3;
  });
}

async function runRegenerate() {
  const image = state.generatedImages.find((item) => item.image_id === state.regenerateTargetId);
  if (!image) {
    state.api.error = "请先选择要重生的 icon。";
    render();
    return;
  }
  if (Number(image.regenerate_count || 0) >= 2) {
    state.api.error = "该 icon 已达到最多 2 次重生限制。请回到 S3 修改提示词模板或最终提示词。";
    render();
    return;
  }
  await runModelTask("正在重生", async () => {
    const data = await apiPost("/api/regenerate-icon", {
      ...getApiPayload(),
      image,
      promptJson: findPromptForImage(image),
      promptText: state.regeneratePrompt,
    });
    const nextImage = data.image;
    state.generatedImages = state.generatedImages.map((item) =>
      item.image_id === image.image_id ? nextImage : item,
    );
    state.selectedImageIds = state.selectedImageIds.map((id) => (id === image.image_id ? nextImage.image_id : id));
    state.regenerateTargetId = "";
    state.regeneratePrompt = "";
    state.exportResult = null;
    state.stage = 6;
  });
}

async function runExport() {
  await runModelTask("正在导出", async () => {
    const data = await apiPost("/api/export-icons", {
      ...getApiPayload(),
      sizes: [1024, 512, 256, 128, 64],
      selectedImageIds: state.selectedImageIds,
    });
    state.exportResult = data.export;
    state.stage = 8;
  }, { requireKey: false });
}

function findPromptById(promptId) {
  return getPromptJson().find((prompt) => prompt.prompt_id === promptId) || null;
}

function findPromptForImage(image) {
  return findPromptById(image.prompt_id) || {
    prompt_id: image.prompt_id || "regenerate_prompt",
    variant_tag: image.variant_tag || "重生",
    prompt_text: image.prompt_text || "",
  };
}

async function runModelTask(label, task, options = {}) {
  if (options.requireKey !== false && !state.api.hasKey) {
    state.api.error = "缺少 OPENAI_API_KEY。请在 .env.local 中填写真实 Key，重启 node server.js 或运行 .\\start.ps1。";
    render();
    return;
  }
  state.api.loading = label;
  state.api.error = "";
  render();
  try {
    await task();
  } catch (error) {
    state.api.error = error.message;
  } finally {
    state.api.loading = "";
    render();
  }
}

function renderProcessingNotice(activeLabel, message = "正在处理中，请稍候...") {
  if (state.api.loading !== activeLabel) return "";
  const modelName = modelNameForLoading(activeLabel);
  const modelText = modelName ? ` 当前调用模型：${escapeHtml(modelName)}。` : "";
  return `<div class="progress-notice"><span></span>${message}${modelText}</div>`;
}

function modelNameForLoading(activeLabel) {
  if (["正在分析", "正在质检", "正在优化提示词"].includes(activeLabel)) return state.api.textModel || "";
  if (["正在生成", "正在重生"].includes(activeLabel)) return state.api.imageModel || "";
  if (activeLabel === "正在导出") return "本地图像处理 sharp + ZIP 打包";
  return "";
}

function handleReferenceFiles(fileList) {
  const remaining = Math.max(0, 2 - state.referenceFiles.length);
  const imageFiles = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
  const files = imageFiles.slice(0, remaining);
  if (!files.length) {
    state.api.error =
      state.referenceFiles.length >= 2
        ? "参考图最多上传 2 张。"
        : "请上传图片格式的参考图。";
    render();
    return;
  }
  state.api.error =
    imageFiles.length > remaining
      ? "参考图最多上传 2 张，已自动保留前 2 张可用图片。"
      : "";
  files.forEach((file) => {
    const isImage = file.type.startsWith("image/");
    const item = {
      name: file.name,
      size: file.size,
      type: file.type || "unknown",
      previewUrl: isImage ? URL.createObjectURL(file) : "",
      dataUrl: "",
      url: "",
      publicUrl: "",
      uploadStatus: isImage ? "uploading" : "",
      uploadError: "",
    };
    state.referenceFiles.push(item);
    if (isImage) {
      const reader = new FileReader();
      reader.onload = async () => {
        item.dataUrl = String(reader.result || "");
        try {
          const data = await apiPost("/api/upload-reference", {
            name: item.name,
            type: item.type,
            dataUrl: item.dataUrl,
          });
          item.url = data.file?.url || "";
          item.publicUrl = data.file?.public_url || "";
          item.uploadStatus = "ready";
        } catch (error) {
          item.uploadStatus = "failed";
          item.uploadError = error.message;
        }
        renderOutput();
        render();
      };
      reader.readAsDataURL(file);
    }
  });
  render();
}

function clearReferenceFiles() {
  state.referenceFiles.forEach((file) => {
    if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
  });
  state.referenceFiles = [];
}

function formatFileSize(size) {
  if (!size) return "0 KB";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function parseCompetitorNames(value) {
  return String(value || "")
    .split(/[,\n，、]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function defaultPlatformRules(platform) {
  const adRules = {
    "Google Ads": [
      "Google Ads 安装广告：不得使用误导性收益、虚假进度、虚假按钮或冒充系统通知。",
      "避免血腥、裸露、仇恨、侵权角色、未授权品牌元素和过度惊吓内容。",
      "Icon 必须主体清晰、背景简洁、64px 可识别，不使用应用截图式 UI 拼贴。",
    ],
    Meta: [
      "Meta Feed/Reels：不得制造虚假功能、虚假奖励、夸大效果承诺或误导下载动机。",
      "避免血腥、裸露、低俗暗示、仇恨、侵权角色和容易被判定为欺骗点击的元素。",
      "Icon 需在信息流缩略图中保持单主体、高对比、无拥挤小字。",
    ],
    TikTok: [
      "TikTok 信息流：不得使用虚假按钮、虚假倒计时、夸张承诺或诱导式系统 UI。",
      "避免血腥、裸露、惊悚过度、侵权角色和强烈不适画面。",
      "Icon 需适合快速滑动场景，主体一眼可懂，轮廓强，色彩反差明显。",
    ],
  };
  return [
    "Google Play Icon：默认不加文字；如必须加文字，只允许右下角短角标，字符数不超过 5。",
    "Google Play Icon：避免透明边缘、复杂小细节、低清晰度、误导性截图和平台审核敏感内容。",
    ...(adRules[platform] || adRules["Google Ads"]),
  ].join("\n");
}

function getPlatformRulesText() {
  return state.platformRules || defaultPlatformRules(state.platform);
}

function platformRulesToConstraints() {
  const rules = getPlatformRulesText()
    .split(/\n+/)
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  return {
    selected_platform: state.platform,
    imported_rules: rules,
    google_play_icon_constraints: rules.filter((rule) => /Google Play|Icon|icon|角标|64px|文字/.test(rule)),
    ad_platform_constraints: rules.filter((rule) => new RegExp(state.platform.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(rule)),
    text_rule:
      state.textEnabled === "是"
        ? `允许右下角短角标，文本为 "${state.badgeText || "待输入"}"，不超过 5 字符。`
        : "no text/no letters/no numbers/no watermark",
    small_size_requirements: rules.filter((rule) => /64px|缩略图|一眼|清晰|轮廓|高对比/.test(rule)),
  };
}

function hasGenerationReferences() {
  return Boolean(
    state.referenceFiles.some((file) => file.dataUrl) ||
      state.googlePlay?.visual_reference_pack?.icon ||
      state.googlePlay?.competitor_visual_reference_pack?.some((item) => item.icon),
  );
}

function generationReferenceSummary() {
  const sources = [];
  if (state.referenceFiles.some((file) => file.dataUrl)) sources.push(`用户上传参考图 ${state.referenceFiles.length} 张`);
  if (state.googlePlay?.visual_reference_pack?.icon) sources.push("主产品 Google Play icon");
  const competitorCount = state.googlePlay?.competitor_visual_reference_pack?.filter((item) => item.icon).length || 0;
  if (competitorCount) sources.push(`竞品 Google Play icon ${competitorCount} 张`);
  return sources.length ? sources.join(" / ") : "暂无参考图，将使用纯文生图";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderReferenceFiles() {
  if (!state.referenceFiles.length) {
    return `<div class="upload-empty">尚未上传素材。建议上传竞品 icon、历史投放 icon、产品截图或风格参考图。</div>`;
  }

  return `
    <div class="upload-list">
      ${state.referenceFiles
        .map(
          (file) => `
          <div class="upload-item">
            <div class="upload-thumb">
              ${
                file.previewUrl
                  ? `<img src="${file.previewUrl}" alt="${escapeHtml(file.name)}" />`
                  : `<span>${escapeHtml(file.name.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE")}</span>`
              }
            </div>
            <div>
              <strong>${escapeHtml(file.name)}</strong>
              <span>${escapeHtml(uploadStatusText(file))}</span>
              <span>${escapeHtml(file.type)} · ${formatFileSize(file.size)}</span>
            </div>
          </div>
        `,
        )
        .join("")}
    </div>
  `;
}

function uploadStatusText(file) {
  if (file.uploadStatus === "ready") return file.publicUrl ? "已上传，可作为公网参考图" : "已上传";
  if (file.uploadStatus === "failed") return `上传失败：${file.uploadError || "未知错误"}`;
  if (file.uploadStatus === "uploading") return "正在上传为公网参考图...";
  return file.publicUrl ? "已生成公网参考图 URL" : "本地预览";
}

function assetUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//.test(url) || url.startsWith("data:")) return url;
  return `${apiBase}${url}`;
}

function renderGooglePlayPack() {
  if (!state.googlePlay) {
    return `<div class="upload-empty">尚未检索 Google Play。填写产品名后点击自动检索，会抓取 icon、主图和截图作为默认参考。</div>`;
  }

  const profile = state.googlePlay.product_profile || {};
  const pack = state.googlePlay.visual_reference_pack || {};
  const images = [pack.icon, pack.featureGraphic, ...(pack.screenshots || []).slice(0, 6)].filter(Boolean);
  const competitors = state.googlePlay.competitor_profiles || [];
  const competitorPacks = state.googlePlay.competitor_visual_reference_pack || [];
  return `
    <div class="google-play-result">
      <div class="google-play-profile">
        <strong>${escapeHtml(profile.app_title || "未识别标题")}</strong>
        <span>${escapeHtml(profile.short_description || "未抓取到简介")}</span>
      </div>
      <div class="google-play-meta-grid">
        ${renderMetaItem("App ID", profile.app_id)}
        ${renderMetaItem("开发者", profile.developer || "未识别")}
        ${renderMetaItem("分类", profile.category || "未知")}
        ${renderMetaItem("评分", profile.rating || "无评分")}
        ${renderMetaItem("安装量", profile.installs || "未知")}
        ${renderMetaItem("详情页", profile.detail_url ? "已抓取" : "无")}
      </div>
      ${
        profile.detail_url
          ? `<a class="detail-link" href="${profile.detail_url}" target="_blank" rel="noreferrer">打开 Google Play 详情页</a>`
          : ""
      }
      <div class="google-play-section-title">默认视觉参考素材</div>
      <div class="reference-grid">
        ${images
          .map(
            (url, index) => `
            <div class="reference-thumb">
              <img src="${assetUrl(url)}" alt="Google Play 素材 ${index + 1}" />
              <span>${index === 0 ? "Icon" : index === 1 ? "主图" : `截图 ${index - 1}`}</span>
            </div>
          `,
          )
          .join("")}
      </div>
      ${
        pack.visual_rules?.length
          ? `<ul class="visual-rules">${pack.visual_rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul>`
          : ""
      }
      ${
        competitors.length
          ? `
          <div class="google-play-section-title">竞品解析结果</div>
          <div class="competitor-grid">
            ${competitors
              .map((item, index) => {
                const competitorPack = competitorPacks[index] || {};
                return `
                  <div class="competitor-card">
                    ${competitorPack.icon ? `<img src="${assetUrl(competitorPack.icon)}" alt="${escapeHtml(item.app_title || "竞品 icon")}" />` : ""}
                    <div>
                      <strong>${escapeHtml(item.app_title || "未识别标题")}</strong>
                      <span>${escapeHtml(item.app_id || "")}</span>
                      <p>${escapeHtml(item.category || "未知分类")} · ${escapeHtml(item.rating || "无评分")} · ${escapeHtml(item.installs || "未知安装量")}</p>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        `
          : ""
      }
    </div>
  `;
}

function renderMetaItem(label, value) {
  return `
    <div class="google-play-meta-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "未知")}</strong>
    </div>
  `;
}

function stageOne() {
  return `
    <h3>S1 基础输入 + Google Play 自动检索</h3>
    <p class="stage-copy">先收集投放所需的最小输入，再通过 Google Play 自动抓取主产品资料、产品 icon、主图、截图，以及最多 3 个竞品 icon。</p>
    <div class="form-grid">
      <div class="field">
        <label>待投产品名称</label>
        <input data-bind="product" placeholder="例如：Royal Match" />
      </div>
      <div class="field">
        <label>竞品名称，可多个，最多 3 个</label>
        <input data-bind="competitors" placeholder="例如：Candy Crush, Match Factory" />
      </div>
      <div class="field">
        <label>投放平台</label>
        <select data-bind="platform">
          <option>Google Ads</option>
          <option>Meta</option>
          <option>TikTok</option>
        </select>
      </div>
      <div class="field">
        <label>是否加入文字角标</label>
        <select data-bind="textEnabled">
          <option>否</option>
          <option>是</option>
        </select>
      </div>
      <div class="field">
        <label>角标文字，≤5 字符</label>
        <input data-bind="badgeText" maxlength="5" placeholder="NEW / HOT / GO" />
      </div>
      <div class="field full">
        <label>用户上传参考图，最多 2 张</label>
        <div class="upload-zone">
          <input id="referenceFiles" type="file" multiple accept="image/*" />
          <label for="referenceFiles" class="upload-trigger">
            <span class="upload-icon">+</span>
            <span>
              <strong>上传参考图</strong>
              <em>最多 2 张。用户上传图优先级最高，推荐历史投放 icon、竞品 icon 或明确风格参考。</em>
            </span>
          </label>
          ${renderReferenceFiles()}
          ${
            state.referenceFiles.length
              ? `<button class="ghost-button upload-clear" id="clearReferenceFiles" type="button">清空素材</button>`
              : ""
          }
        </div>
      </div>
    </div>
    <h3>情绪目标</h3>
    <div class="chips">
      ${["好奇", "爽感", "紧张", "治愈", "成就感", "搞笑", "沉浸", "恐惧", "温暖", "震撼"]
        .map((item) => `<button class="chip" data-group="emotion" data-chip="${item}" type="button">${item}</button>`)
        .join("")}
    </div>
    <div class="stage-footer-action">
      <div>
        <h3>Google Play 自动检索</h3>
        <p>完成上方输入后再触发检索，将抓取主产品资料、产品 icon、主图、截图，以及最多 3 个竞品 icon。</p>
      </div>
      <button class="primary-button" data-model-action="google-play" type="button" ${state.api.loading === "正在检索" ? "disabled" : ""}>
        ${state.api.loading === "正在检索" ? "请稍候，检索中..." : "自动检索 Google Play"}
      </button>
    </div>
    ${renderProcessingNotice("正在检索", "正在处理中，请稍候，正在检索 Google Play 并解析产品素材...")}
    ${state.api.error ? `<div class="notice">${state.api.error}</div>` : ""}
    ${renderGooglePlayPack()}
  `;
}

function renderAnalysisSummary() {
  if (!state.modelAnalysis) return "";
  const analysis = state.modelAnalysis;
  const product = analysis.product_analysis || {};
  const productIcon = analysis.product_icon_analysis || {};
  const competitors = Array.isArray(analysis.competitor_icon_analysis) ? analysis.competitor_icon_analysis : [];
  const platform = platformRulesToConstraints();
  const promptFields = analysis.generation_prompt_fields || {};

  return `
    <div class="option-grid">
      ${renderSummaryCard("核心玩法/题材", [product.core_gameplay, product.theme])}
      ${renderSummaryCard("美术画风/视觉风格", [product.art_style, product.visual_style])}
      ${renderSummaryCard("受众与核心卖点", [product.target_audience, product.core_selling_points])}
      ${renderSummaryCard("主产品 Icon 分析", [
        productIcon.image_content,
        productIcon.main_subject,
        productIcon.color_features,
        productIcon.composition_features,
      ])}
      ${renderSummaryCard(
        "竞品 Icon 分析",
        competitors.length
          ? competitors.map((item) => `${item.app_title || item.app_id || "竞品"}：${item.main_subject || item.image_content || "已分析"}`)
          : ["暂无竞品 icon 分析"],
      )}
      ${renderSummaryCard("平台与 Google Play 约束", [
        platform.text_rule,
        platform.google_play_icon_constraints,
        platform.ad_platform_constraints,
        platform.small_size_requirements,
      ])}
      ${renderSummaryCard("S3 Prompt 字段映射", [
        `game_genre：${promptFields.game_genre || product.core_gameplay || "待分析"}`,
        `subject_type：${promptFields.subject_type || productIcon.main_subject || "待分析"}`,
        `render_style：${promptFields.render_style || product.visual_style || productIcon.visual_style || "待分析"}`,
        `color_strategy：${promptFields.color_strategy || productIcon.color_features || "待分析"}`,
        `value_desire：${promptFields.value_desire || product.core_selling_points?.join(" / ") || "待分析"}`,
      ])}
    </div>
    <details class="analysis-details">
      <summary>查看 S2 原始结构化 JSON</summary>
      <pre class="analysis-preview">${escapeHtml(JSON.stringify(analysis, null, 2))}</pre>
    </details>
  `;
}

function renderSummaryCard(title, values) {
  const items = values.flatMap((value) => normalizeSummaryItems(value)).filter(Boolean).slice(0, 5);
  return `
    <article class="option-card active">
      <h3>${escapeHtml(title)}</h3>
      <ul class="mini-list compact">
        ${(items.length ? items : ["待模型分析"]).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function normalizeSummaryItems(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => normalizeSummaryItems(item));
  if (typeof value === "object") return [stringifyPromptValue(value)];
  return [String(value)];
}

function stageTwo() {
  return `
    <h3>S2 AI 产品 / 竞品 / Icon 分析 + 平台规则导入</h3>
    <p class="stage-copy">模型只分析 S1 输入、Google Play 主产品资料、主产品 icon / 主图 / 截图、竞品 icon 和用户上传参考图；平台约束改为下方可编辑规则导入，不再交给 AI 判断。</p>
    <div class="field full">
      <label>平台约束规则导入（可编辑）</label>
      <textarea data-bind="platformRules" rows="8" placeholder="每行一条规则">${escapeHtml(getPlatformRulesText())}</textarea>
      <p class="field-hint">这些规则会直接进入后续 S4/S5 的约束层。切换平台后，如果你还没手动改过规则，会自动填入该平台默认规则。</p>
    </div>
    <div class="model-action-bar">
      <button class="primary-button" data-model-action="analyze" type="button" ${state.api.loading === "正在分析" ? "disabled" : ""}>${state.api.loading === "正在分析" ? "分析中..." : "开始 AI 分析"}</button>
      <span>${state.modelAnalysis ? "已生成 S2 结构化分析结果" : "将输出玩法/题材、画风、受众卖点、产品/竞品 icon 分析和共性差异"}</span>
    </div>
    ${renderProcessingNotice("正在分析", "正在处理中，请稍候，正在分析产品、竞品与 icon 视觉特征...")}
    ${state.api.error ? `<div class="notice">${state.api.error}</div>` : ""}
    ${state.modelAnalysis ? renderAnalysisSummary() : `
      <div class="option-grid">
      <article class="option-card active">
        <h3>产品分析</h3>
        <p>核心玩法 / 题材、美术画风、视觉风格、主要受众、核心卖点。</p>
      </article>
      <article class="option-card active">
        <h3>Icon 分析</h3>
        <p>产品与竞品 icon 的画面内容、主体、色彩、构图、文案和识别度。</p>
      </article>
      <article class="option-card active">
        <h3>平台规则导入</h3>
        <p>平台与 Google Play 约束由上方规则框维护，模型不参与政策判断。</p>
      </article>
    </div>`}
    <ul class="mini-list">
      <li>参考优先级：用户上传参考图 > 主产品 Google Play icon > 竞品 Google Play icon。</li>
      <li>S2 不生成图片；模型只做产品和 icon 理解，平台约束来自可编辑规则导入。</li>
      <li>S2 输出将作为后续方向选择和 S4 prompt_json 构建的基础。</li>
    </ul>
  `;
}

function stageThree() {
  const prompts = getPromptJson();
  return `
    <h3>Prompt 组装生成与用户确认</h3>
    <p class="stage-copy">这里合并原 S3/S4：先选择方案数量和方向，一次最多生成 2 个方案，再把 S1/S2 信息套入提示词框架模板，生成后续 S5 真正用于 icon 生成的 prompt_json。你可以编辑模板，也可以直接修改每个方案的最终提示词。</p>
    <div class="form-grid">
      <div class="field">
        <label>方案数量</label>
        <select data-bind="count">
          <option value="1">1</option>
          <option value="2">2</option>
        </select>
      </div>
    </div>
    <div class="qa-list">
      <div class="qa-item"><span>生成方式</span><span>${hasGenerationReferences() ? "参考图 + 提示词" : "纯文生图"}</span></div>
      <div class="qa-item"><span>参考图来源</span><span>${escapeHtml(generationReferenceSummary())}</span></div>
      <div class="qa-item"><span>确认状态</span><span>${state.promptConfirmed ? "已确认" : "待确认"}</span></div>
    </div>
    <div class="option-grid">
      ${[
        ["保守", "最大程度贴近产品既有 icon 与行业范式。"],
        ["点击强化", "强化冲击、反差和广告位点击吸引力。"],
        ["极致夸张", "保留硬约束，使用更强情绪和反常识构图。"],
      ]
        .map(
          ([name, desc]) => `
          <button class="option-card" data-group="directions" data-chip="${name}" type="button">
            <h3>${name}</h3>
            <p>${desc}</p>
          </button>
        `,
        )
        .join("")}
    </div>
    <div class="stage-footer-action">
      <div>
        <h3>提示词框架模板</h3>
        <p>模板使用花括号占位符，会自动引入产品、竞品、S2 分析、平台规则、情绪目标和参考图策略。</p>
      </div>
      <div class="action-row">
        <button class="ghost-button" data-ui-action="toggle-template" type="button">${state.promptTemplateEditing ? "收起模板" : "编辑模板"}</button>
        <button class="ghost-button" data-ui-action="reset-template" type="button">恢复默认模板</button>
      </div>
    </div>
    ${
      state.promptTemplateEditing
        ? `<div class="field full prompt-template-editor">
            <label>提示词框架模板</label>
            <textarea data-bind="promptTemplate" rows="22">${escapeHtml(state.promptTemplate)}</textarea>
            <p class="field-hint">可用占位符示例：{platform}、{game_genre}、{main_subject}、{creative_direction}、{direction_guidance}、{render_style}、{reference_mode}、{optional_text_rule}、{must_not_include_lines}。</p>
          </div>`
        : ""
    }
    <div class="stage-footer-action">
      <div>
        <h3>最终生成提示词</h3>
        <p>建议先用 AI 把 S1/S2 信息转译成创意字段，再由模板组装最终 prompt。手动修改后请点击确认，S5 将使用这里的 prompt_json。</p>
      </div>
      <div class="action-row">
        <button class="primary-button" data-model-action="optimize-prompts" type="button" ${state.api.loading === "正在优化提示词" ? "disabled" : ""}>${state.api.loading === "正在优化提示词" ? "优化中..." : "AI 优化生成提示词"}</button>
        <button class="primary-button" data-ui-action="rebuild-prompts" type="button">重新组装提示词</button>
        <button class="primary-button" data-ui-action="confirm-prompts" type="button">${state.promptConfirmed ? "已确认，可进入 S5" : "确认提示词"}</button>
      </div>
    </div>
    ${renderProcessingNotice("正在优化提示词", "正在处理中，请稍候，正在把前序信息转译成更适合图像生成的创意字段...")}
    ${state.promptOptimizations.length ? `<div class="notice">已使用 AI 创意字段优化 ${state.promptOptimizations.length} 个方案。你仍可以继续手动修改下方最终 prompt。</div>` : ""}
    <div class="prompt-list">
      ${prompts
        .map(
          (prompt, index) => `
          <article class="prompt-card">
            <div class="prompt-card-head">
              <strong>${escapeHtml(prompt.prompt_id)} · ${escapeHtml(prompt.variant_tag)}</strong>
              <span>${prompt.generation.mode === "image_to_image_with_prompt" ? "参考图+提示词" : "纯文生图"}${prompt.user_edited ? " · 已手动修改" : ""}</span>
            </div>
            <textarea data-prompt-edit="${index}" rows="18">${escapeHtml(prompt.prompt_text)}</textarea>
          </article>
        `,
        )
        .join("")}
    </div>
  `;
}

function stageFour() {
  const prompts = getPromptJson();
  return `
    <h3>Prompt 自检状态</h3>
    <p class="stage-copy">S3 已完成提示词组装、模板编辑和用户确认。这里仅展示进入 S5 前的状态检查，真正生成时会使用 S3 确认后的 prompt_json。</p>
    <div class="model-action-bar">
      <button class="primary-button" type="button" disabled>${state.promptConfirmed ? "Prompt 已确认" : "Prompt 待确认"}</button>
      <span>${prompts.length} 个 prompt_json 将作为 S5 唯一生成依据</span>
    </div>
    <div class="qa-list">
      <div class="qa-item"><span>S1/S2 信息引入</span><span>通过</span></div>
      <div class="qa-item"><span>提示词模板套用</span><span>通过</span></div>
      <div class="qa-item"><span>生成方式</span><span>${hasGenerationReferences() ? "参考图 + 提示词" : "纯文生图"}</span></div>
      <div class="qa-item"><span>用户确认</span><span>${state.promptConfirmed ? "通过" : "待确认"}</span></div>
    </div>
  `;
}

function stageFive() {
  const count = Math.max(1, Math.min(2, Number(state.count) || 2));
  const hasRealImages = state.generatedImages.length > 0;
  return `
    <h3>Icon 生成</h3>
    <p class="stage-copy">每个方案会输出两张图：1 张 icon 原图，1 张按通用场景展示模板合成的展示图。场景图会把生成的 icon 原样放入手机桌面、Google Play 和广告位示意位置。</p>
    <div class="model-action-bar">
      <button class="primary-button" data-model-action="generate" type="button" ${state.api.loading === "正在生成" ? "disabled" : ""}>${state.api.loading === "正在生成" ? "生成中..." : "真正调用模型生成 Icon"}</button>
      <span>${hasRealImages ? `已生成 ${state.generatedImages.length} 个方案，每个方案含 icon 与场景展示图` : `将按 S3 确认的 ${getPromptJson().length} 个 prompt_json 逐张调用图像模型`}</span>
    </div>
    ${renderProcessingNotice("正在生成", "正在处理中，请稍候，正在调用图像模型生成 Icon...")}
    ${state.api.error ? `<div class="notice">${state.api.error}</div>` : ""}
    <div class="mock-board">
      ${(hasRealImages ? state.generatedImages : Array.from({ length: count }).map((_, index) => ({ index })))
        .map(
          (item, index) => `
          <article class="mock-card">
            <div class="mock-visual dual-visual">
              <div class="generated-pair">
                <div>
                  <span class="asset-label">Icon 原图</span>
                  ${
                    item.url
                      ? `<button class="generated-preview-button icon-preview" data-preview-image="${item.image_id}" type="button" title="点击放大 Icon 原图"><img class="generated-icon" src="${assetUrl(item.url)}" alt="方案 ${index + 1} icon" /></button>`
                      : `<div class="app-icon">${index + 1}</div>`
                  }
                </div>
                <div>
                  <span class="asset-label">场景展示图</span>
                  ${
                    item.scene_url
                      ? `<button class="generated-preview-button scene-preview" data-preview-scene="${item.image_id}" type="button" title="点击放大场景展示图"><img class="generated-scene" src="${assetUrl(item.scene_url)}" alt="方案 ${index + 1} 场景展示图" /></button>`
                      : `<div class="scene-placeholder">模板待生成</div>`
                  }
                </div>
              </div>
            </div>
            <div class="mock-meta">
              <strong>方案 ${index + 1} · ${item.variant_tag || state.directions[index % state.directions.length] || "点击强化"}</strong>
              <span>${item.image_id || "待生成"} · ${item.generation_mode || "待生成"} · 场景图 ${item.scene_url ? "已生成" : "待生成"} · 参考图 ${item.reference_image_count ?? 0} 张</span>
              ${item.reference_image_sources?.length ? `<span>参考来源：${escapeHtml(item.reference_image_sources.join(" / "))}</span>` : ""}
              ${item.reference_image_errors?.length ? `<span class="warn-text">参考图下载失败 ${item.reference_image_errors.length} 张</span>` : ""}
            </div>
          </article>
        `,
        )
        .join("")}
    </div>
    ${renderImagePreviewModal()}
  `;
}

function renderImagePreviewModal() {
  if (!state.previewImage) return "";
  return `
    <div class="preview-modal" role="dialog" aria-modal="true">
      <div class="preview-backdrop" data-close-preview></div>
      <div class="preview-dialog ${state.previewImageKind === "scene" ? "scene-dialog" : ""}">
        <button class="preview-close" data-close-preview type="button">关闭</button>
        <img src="${assetUrl(state.previewImageUrl || state.previewImage.url)}" alt="${state.previewImage.image_id}" />
        <div class="preview-meta">
          <strong>${state.previewImageKind === "scene" ? "场景展示图" : "Icon 原图"} · ${state.previewImage.image_id}</strong>
          <span>${state.previewImage.generation_mode || ""} · 参考图 ${state.previewImage.reference_image_count ?? 0} 张 · ${state.previewImage.prompt_id || ""}</span>
        </div>
      </div>
    </div>
  `;
}

function qaReportForImage(imageId) {
  return state.qaReports.find((report) => report.image_id === imageId || report.image_id === undefined) || null;
}

function stageSix() {
  return `
    <h3>自动质检 + 用户决策</h3>
    <p class="stage-copy">先运行真实视觉质检，再选择 1-2 个方案进入交付。每个方案也可以进入 S7 编辑原 prompt 后重生；每个 icon 最多重生 2 次。</p>
    <div class="model-action-bar">
      <button class="primary-button" data-model-action="qa" type="button" ${state.api.loading === "正在质检" ? "disabled" : ""}>${state.api.loading === "正在质检" ? "质检中..." : "调用 Vision 自动质检"}</button>
      <span>${state.qaReports.length ? `已完成 ${state.qaReports.length} 个方案质检` : "生成 icon 后可运行真实视觉质检"}</span>
    </div>
    ${renderProcessingNotice("正在质检", "正在处理中，请稍候，正在进行视觉反解与可用性质检...")}
    ${state.api.error ? `<div class="notice">${state.api.error}</div>` : ""}
    <div class="decision-grid">
      ${state.generatedImages.length
        ? state.generatedImages
            .map((image, index) => {
              const report = qaReportForImage(image.image_id);
              const canRegen = Number(image.regenerate_count || 0) < 2;
              return `
                <article class="decision-card">
                  <div class="decision-card-media">
                    <button class="generated-preview-button icon-preview" data-preview-image="${image.image_id}" type="button">
                      <img class="generated-icon" src="${assetUrl(image.url)}" alt="方案 ${index + 1}" />
                    </button>
                  </div>
                  <div class="decision-card-body">
                    <label class="select-row">
                      <input type="checkbox" data-select-image="${image.image_id}" ${state.selectedImageIds.includes(image.image_id) ? "checked" : ""} />
                      <strong>选择方案 ${index + 1}</strong>
                    </label>
                    <p>${escapeHtml(image.variant_tag || "方案")} · v${image.version || 1} · 已重生 ${image.regenerate_count || 0}/2 次</p>
                    <div class="qa-pill ${report?.passed === false ? "warn" : "ok"}">${report ? `质检：${report.passed === false ? "需复核" : "通过"} · ${report.score_0_100 || "--"}分` : "质检：待执行"}</div>
                    ${report?.issues?.length ? `<ul class="mini-list compact">${report.issues.slice(0, 3).map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>` : ""}
                    <button class="ghost-button" data-regenerate-image="${image.image_id}" type="button" ${canRegen ? "" : "disabled"}>${canRegen ? "编辑原 prompt 后重生" : "已达重生上限"}</button>
                  </div>
                </article>
              `;
            })
            .join("")
        : `<div class="notice">请先在 S5 生成 icon。</div>`}
    </div>
    <div class="stage-footer-action">
      <div>
        <h3>进入交付</h3>
        <p>已选择 ${state.selectedImageIds.length} 个方案。S8 会对选中 icon 生成 1024/512/256/128/64 多尺寸 PNG 并打包 ZIP。</p>
      </div>
      <button class="primary-button" data-model-action="export" type="button" ${state.selectedImageIds.length ? "" : "disabled"}>导出选中 Icon</button>
    </div>
    ${renderImagePreviewModal()}
  `;
}

function stageSeven() {
  const image = state.generatedImages.find((item) => item.image_id === state.regenerateTargetId);
  return `
    <h3>重生执行</h3>
    <p class="stage-copy">基于当前 icon 的原 prompt 进行编辑后再次生成。每个 icon 最多执行 2 次重生；如果仍不满意，请回到 S3 修改提示词模板框架。</p>
    ${image ? `
      <div class="decision-card">
        <div class="decision-card-media">
          <img class="generated-icon" src="${assetUrl(image.url)}" alt="${image.image_id}" />
        </div>
        <div class="decision-card-body">
          <strong>${escapeHtml(image.image_id)}</strong>
          <p>当前版本 v${image.version || 1} · 已重生 ${image.regenerate_count || 0}/2 次</p>
        </div>
      </div>
      <div class="field full prompt-template-editor">
        <label>基于原 prompt 编辑后重生</label>
        <textarea data-bind="regeneratePrompt" rows="22">${escapeHtml(state.regeneratePrompt || image.prompt_text || "")}</textarea>
        <p class="field-hint">建议只改 1-2 个关键点。超过 2 次重生仍不满意时，系统会提示回到 S3 修改模板框架。</p>
      </div>
      <div class="model-action-bar">
        <button class="primary-button" data-model-action="regenerate" type="button" ${state.api.loading === "正在重生" ? "disabled" : ""}>${state.api.loading === "正在重生" ? "重生中..." : "重新生成此 Icon"}</button>
        <span>重生后会替换当前方案，并自动回到 S6 等待重新质检。</span>
      </div>
      ${renderProcessingNotice("正在重生", "正在处理中，请稍候，正在基于编辑后的 prompt 重新生成 icon...")}
    ` : `
      <div class="notice">请先在 S6 选择某个方案点击“编辑原 prompt 后重生”。</div>
    `}
    ${state.api.error ? `<div class="notice">${state.api.error}</div>` : ""}
  `;
}

function renderExportResult() {
  if (!state.exportResult) return "";
  return `
    <div class="delivery-result">
      <button class="primary-button download-link" data-open-url="${state.exportResult.zip_url}" data-download="true" type="button">下载 ZIP 交付包</button>
      <button class="ghost-button download-link" data-open-url="${state.exportResult.manifest_url}" type="button">查看 manifest</button>
    </div>
    <div class="delivery-file-list">
      ${state.exportResult.files.map((file) => `<div><span>${escapeHtml(file.filename)}</span><button class="link-button" data-open-url="${file.url}" type="button">打开</button></div>`).join("")}
    </div>
  `;
}

function stageEight() {
  return `
    <h3>多尺寸导出与交付</h3>
    <p class="stage-copy">最终选中的 icon 会保持内容完全一致，仅变更尺寸，并生成 ZIP 与 manifest 清单。</p>
    <div class="delivery-grid">
      ${[1024, 512, 256, 128, 64].map((size) => `<div class="delivery-size">${size}px</div>`).join("")}
    </div>
    <div class="model-action-bar">
      <button class="primary-button" data-model-action="export" type="button" ${state.selectedImageIds.length ? "" : "disabled"}>${state.api.loading === "正在导出" ? "导出中..." : "生成交付包"}</button>
      <span>已选择 ${state.selectedImageIds.length} 个 icon</span>
    </div>
    ${renderProcessingNotice("正在导出", "正在处理中，请稍候，正在生成多尺寸 PNG 和 ZIP 交付包...")}
    ${state.api.error ? `<div class="notice">${state.api.error}</div>` : ""}
    ${renderExportResult()}
    <ul class="mini-list">
      <li>命名规则：${sanitizeName(state.product || "product")}_icon_v1_{size}px.png</li>
      <li>交付内容：PNG 多尺寸、ZIP 包、manifest 清单。</li>
      <li>manifest：image_id、尺寸、平台建议、版本信息。</li>
    </ul>
  `;
}

function sanitizeName(value) {
  return value.trim().replace(/\s+/g, "_").replace(/[^\w\u4e00-\u9fa5-]/g, "").toLowerCase();
}

function getStageOutput() {
  const base = {
    task_id: `app-icon-master-${new Date().getFullYear()}-demo`,
    stage: `S${state.stage}`,
    product: state.product || "待输入",
    competitors: state.competitors || "无",
    platform: state.platform,
    emotion_target: state.emotion,
    text_spec:
      state.textEnabled === "是"
        ? { enabled: true, text: state.badgeText || "待输入", position: "右下角角标" }
        : { enabled: false, no_text: true },
    locked_constraints: {
      must_include:
        state.modelAnalysis?.locked_insights_for_next_stage?.must_include_candidates || ["核心主体", "产品身份", "高识别度轮廓"],
      must_not_include:
        state.modelAnalysis?.locked_insights_for_next_stage?.must_not_include_candidates || ["误导承诺", "血腥", "裸露", "侵权元素"],
      identity_lock: state.product || "待产品确认",
    },
    uploaded_reference_files: state.referenceFiles.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      ready_for_vision: Boolean(file.publicUrl || file.dataUrl),
      public_url: file.publicUrl || "",
    })),
    google_play_profile: state.googlePlay?.product_profile || null,
    google_play_visual_reference_pack: state.googlePlay?.visual_reference_pack
      ? {
          icon: state.googlePlay.visual_reference_pack.icon,
          featureGraphic: state.googlePlay.visual_reference_pack.featureGraphic,
          screenshots: state.googlePlay.visual_reference_pack.screenshots?.slice(0, 8) || [],
          visual_rules: state.googlePlay.visual_reference_pack.visual_rules || [],
        }
      : null,
    model_analysis: state.modelAnalysis,
    prompt_json: getPromptJson().map((prompt) => ({
      prompt_id: prompt.prompt_id,
      variant_tag: prompt.variant_tag,
      platform: prompt.platform,
      asset_type: prompt.asset_type,
      render_spec: prompt.render_spec,
      text_spec: prompt.text_spec,
      generation_mode: prompt.generation?.mode || "",
      user_edited: Boolean(prompt.user_edited),
      confirmed: state.promptConfirmed,
      prompt_text_preview: prompt.prompt_text.slice(0, 160),
    })),
    generated_images: state.generatedImages,
    qa_reports: state.qaReports,
    selected_image_ids: state.selectedImageIds,
    export_result: state.exportResult,
  };

  const stageOutputs = {
    1: {
      ...base,
      s1_input: {
        product_name: state.product || "待输入",
        competitors: parseCompetitorNames(state.competitors),
        platform: state.platform,
        emotion_target: state.emotion,
        text_spec:
          state.textEnabled === "是"
            ? { enabled: true, text: state.badgeText || "待输入", position: "右下角角标", max_chars: 5 }
            : { enabled: false, no_text: true },
        user_reference_limit: "最多 2 张",
        emotion_limit: "最多 3 项",
      },
      google_play_lookup_result: {
        product_profile: state.googlePlay?.product_profile || null,
        google_play_icon: state.googlePlay?.visual_reference_pack?.icon || "",
        google_play_feature_graphic: state.googlePlay?.visual_reference_pack?.featureGraphic || "",
        google_play_screenshots: state.googlePlay?.visual_reference_pack?.screenshots?.slice(0, 8) || [],
        competitor_profiles: state.googlePlay?.competitor_profiles || [],
        competitor_icons: state.googlePlay?.competitor_visual_reference_pack?.map((item) => item.icon).filter(Boolean) || [],
        user_uploaded_files: state.referenceFiles.map((file) => file.name),
      },
    },
    2: {
      ...base,
      s2_expected_output: [
        "核心玩法/题材",
        "美术画风/视觉风格",
        "产品主要受众和核心卖点",
        "产品和竞品 icon 图片分析",
        "共性风格和差异化机会",
        "generation_prompt_fields：字段名与 S3 Prompt 模板占位符保持一致",
      ],
      platform_constraints_source: "editable_rule_import",
      platform_constraints_import: platformRulesToConstraints(),
      model_analysis: state.modelAnalysis,
    },
    3: {
      ...base,
      variant_count: Number(state.count),
      selected_directions: state.directions,
    },
    4: {
      ...base,
      prompt_validation_report: ["字段完整", "硬约束覆盖", "文字规则通过", "icon 构图通过"],
    },
    5: {
      ...base,
      generated_images_raw: Array.from({ length: Math.max(1, Math.min(2, Number(state.count) || 2)) }).map((_, i) => ({
        image_id: `demo_icon_${i + 1}`,
        scene_image_id: `demo_icon_${i + 1}_scene`,
        variant_tag: state.directions[i % state.directions.length] || "点击强化",
        assets: ["icon 原图", "场景展示图"],
      })),
    },
    6: {
      ...base,
      qa_report: ["Correctness 通过", "64px 可识别", "高对比", "背景简洁"],
      decision: state.decision,
    },
    7: {
      ...base,
      execution: state.decision === "REGENERATE" ? "保留硬约束重新生成" : "局部微调并回流质检",
    },
    8: {
      ...base,
      export_sizes: [1024, 512, 256, 128, 64],
      package: `${sanitizeName(state.product || "product")}_icon_delivery.zip`,
      manifest: "manifest.json",
    },
  };

  return stageOutputs[state.stage];
}

function renderOutput() {
  $("#outputBadge").textContent = `S${state.stage}`;
  $("#stageOutput").textContent = JSON.stringify(getStageOutput(), null, 2);
}

function renderContent() {
  const views = {
    1: stageOne,
    2: stageTwo,
    3: stageThree,
    4: stageFour,
    5: stageFive,
    6: stageSix,
    7: stageSeven,
    8: stageEight,
  };
  $("#stageContent").innerHTML = views[state.stage]();
  $("#stageTitle").textContent = stages[state.stage - 1].title;
  $("#nextBtn").textContent = state.stage === 8 ? "完成" : "下一步";
  syncInputs();
}

function render() {
  renderShell();
  renderLockedSummary();
  renderContent();
  renderOutput();
  renderApiStatus();
}

$("#nextBtn").addEventListener("click", () => {
  if (state.stage < 8) {
    state.stage += 1;
    render();
  }
});

$("#resetBtn").addEventListener("click", () => {
  clearReferenceFiles();
  Object.assign(state, {
    stage: 1,
    product: "",
    competitors: "",
    platform: "Google Ads",
    platformRules: defaultPlatformRules("Google Ads"),
    platformRulesEdited: false,
    emphasis: "",
    sensitive: "",
    emotion: [],
    textEnabled: "否",
    badgeText: "",
    reference: "",
    referenceFiles: [],
    count: 2,
    directions: ["点击强化"],
    decision: "SELECT",
    googlePlay: null,
    modelAnalysis: null,
    promptJson: [],
    promptOptimizations: [],
    promptTemplate: defaultPromptTemplate(),
    promptTemplateEditing: false,
    promptConfirmed: false,
    generatedImages: [],
    previewImage: null,
    previewImageUrl: "",
    previewImageKind: "",
    qaReports: [],
    selectedImageIds: [],
    regenerateTargetId: "",
    regeneratePrompt: "",
    exportResult: null,
  });
  render();
});

render();
checkApiHealth();
