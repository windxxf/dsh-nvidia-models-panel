/** Host half of the Nvidia Models Panel bundle. */

export const inject = ['commands', 'configEditor'];

/** NVIDIA NIM public endpoints (model list is anonymous-readable; completions need a key). */
const NIM_MODELS_URL = 'https://integrate.api.nvidia.com/v1/models';
const NIM_COMPLETIONS_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

/** Chinese blurbs per publisher prefix, used to build per-model descriptions. */
const PUBLISHER_BLURBS = {
  nvidia: 'NVIDIA 官方',
  'nv-mistralai': 'NVIDIA 与 Mistral 联合优化',
  meta: 'Meta Llama 系列',
  'deepseek-ai': 'DeepSeek 系列',
  'z-ai': '智谱 GLM 系列',
  moonshotai: '月之暗面 Kimi 系列',
  qwen: '阿里通义千问系列',
  google: 'Google 开源模型',
  microsoft: '微软 Phi 系列',
  mistralai: 'Mistral AI 系列',
  openai: 'OpenAI 开源模型',
  '01-ai': '零一万物 Yi 系列',
  ai21labs: 'AI21 Jamba 系列',
  ibm: 'IBM Granite 系列',
  bigcode: 'BigCode 代码模型',
  databricks: 'Databricks 模型',
  snowflake: 'Snowflake Arctic 系列',
  writer: 'Writer Palmyra 系列',
  poolside: 'Poolside 代码模型',
  minimaxai: 'MiniMax 系列',
  'stepfun-ai': '阶跃星辰系列',
  zyphra: 'Zyphra 系列',
  adept: 'Adept 模型',
  aisingapore: 'AI Singapore SEA-LION 系列',
};

/** Built-in fallback shown when the upstream API is unreachable. */
const BUILTIN_MODELS = [
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Llama 3.1 Nemotron 70B', description: 'NVIDIA 旗舰推理模型，擅长复杂推理、编码与数学' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b', name: 'Nemotron 3 Ultra 550B', description: 'NVIDIA 官方超大参数模型，推理与编码能力极强' },
  { id: 'nvidia/nemotron-3-super-120b-a12b', name: 'Nemotron 3 Super 120B', description: 'NVIDIA 官方高性能均衡型，适合企业级任务' },
  { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', name: 'Nemotron 3.5 Lightning 30B', description: 'NVIDIA 官方轻量高速 MoE，响应快成本低' },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', name: 'Nemotron 3 Nano Omni 30B', description: 'NVIDIA 官方全模态模型，支持文本与图像' },
  { id: 'deepseek-ai/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', description: 'DeepSeek 系列，长上下文，支持文本与图像' },
  { id: 'moonshotai/kimi-k3', name: 'Kimi K3', description: '月之暗面 Kimi 系列，百万级上下文窗口' },
  { id: 'z-ai/glm-5.3', name: 'GLM-5.3', description: '智谱 GLM 系列，强推理与长上下文' },
  { id: 'meta/llama-3.2-90b-vision-instruct', name: 'Llama 3.2 90B Vision', description: 'Meta Llama 系列，多语言视觉理解' },
  { id: 'mistralai/mistral-7b-instruct-v0.3', name: 'Mistral 7B Instruct v0.3', description: 'Mistral AI 系列，轻量高效通用模型' },
];

/** Build a short Chinese blurb for one model id. */
function describeModel(id) {
  const slash = id.indexOf('/');
  const publisher = slash > 0 ? id.slice(0, slash) : '';
  const bare = slash > 0 ? id.slice(slash + 1) : id;
  const who = PUBLISHER_BLURBS[publisher] || (publisher ? publisher + ' 发布' : 'NVIDIA NIM 托管');
  let kind = '通用大语言模型';
  const lower = bare.toLowerCase();
  if (/vision|vl|omni|diffusion|image/.test(lower)) kind = '支持视觉/多模态输入';
  else if (/coder|code/.test(lower)) kind = '专攻代码生成与补全';
  else if (/embed|rerank|reward/.test(lower)) kind = '检索/评测类模型';
  else if (/reason|thinking|r1/.test(lower)) kind = '强化推理能力';
  return who + '，' + kind + '。';
}

/** True for model families the chat-completions probe cannot meaningfully call. */
function isNonChatModel(id) {
  return /embed|rerank|reward|diffusion/i.test(id);
}

/** Context-bound key resolver installed during apply(); prefers env, then the credential store. */
let resolveKeyFromContext = async () => '';

/** Run one operation against the credentials service; resolves null when unavailable. */
function withCredentials(ctx, operation) {
  return new Promise((done) => {
    try {
      ctx.inject(['credentials'], (scoped) => {
        try {
          done(Promise.resolve(operation(scoped.credentials)).catch(() => null));
        } catch {
          done(null);
        }
      });
    } catch {
      done(null);
    }
  });
}

/** Run one operation against the configEditor service; resolves null when unavailable. */
function withConfigEditor(ctx, operation) {
  return new Promise((done) => {
    try {
      ctx.inject(['configEditor'], (scoped) => {
        try {
          done(Promise.resolve(operation(scoped.configEditor)).catch(() => null));
        } catch {
          done(null);
        }
      });
    } catch {
      done(null);
    }
  });
}

const LLM_PLUGIN_NAME = '@deepseek-ai/dsh-llm-pi-ai';

/**
 * configEditor.entries() yields Loader Entry objects, so the plugin identity
 * lives at entry.options.id / entry.options.name (see dsh-config-editor
 * lib/index.js entries() and edit()). Tolerant of the other plausible shapes.
 */
function entryIdentifiers(entry) {
  const values = [];
  const push = (value) => { if (typeof value === 'string' && value) values.push(value); };
  try {
    push(entry.id);
    push(entry.name);
    const options = entry.options;
    if (options && typeof options === 'object') {
      push(options.id);
      push(options.name);
      push(options.group);
    }
  } catch {
    // An unreadable entry simply cannot be matched by identifier.
  }
  return values;
}

/** Does this entry address the llm-pi-ai plugin (any id/patchId/name form)? */
function isLlmPiAiEntry(entry) {
  return entryIdentifiers(entry).some((value) =>
    value === LLM_PLUGIN_NAME || value === 'llm-pi-ai' || value.endsWith(':llm-pi-ai'));
}

/** Compact, secret-free dump of entries, used only to diagnose a failed lookup. */
function describeEntries(entries) {
  return entries.slice(0, 20).map((entry) => {
    const out = {};
    try {
      const options = entry.options || {};
      if (typeof options.id === 'string') out.id = options.id;
      if (typeof options.name === 'string') out.name = options.name;
      if (options.config !== undefined) out.hasConfig = true;
      if (entry.fiber) out.active = entry.fiber.state === 2;
    } catch {
      out.unreadable = true;
    }
    return out;
  });
}

/**
 * Detect models live and write the AVAILABLE ones into the llm-pi-ai nvidia
 * provider, so the chat model picker offers exactly what can be called.
 * Shared by the panel button (POST action=configure) and the slash command.
 * `probeResults` (id → 'ok' | 'unavailable') from the panel's per-model probe
 * filters the list; without it, non-chat families are the only ones dropped.
 */
async function configureNvidiaModels(ctx, probeResults) {
  const configEditor = await withConfigEditor(ctx, (editor) => editor);
  if (!configEditor) {
    return { ok: false, error: 'configEditor 服务不可用，无法写入配置' };
  }
  const detection = await detectNvidiaModels();
  const allModels = detection.models;
  const source = detection.source === 'live' ? 'NVIDIA API 实时检测' : '内置目录';
  let available;
  let droppedUnavailable = 0;
  let droppedNonChat = 0;
  if (probeResults && typeof probeResults === 'object' && Object.keys(probeResults).length > 0) {
    available = allModels.filter((m) => probeResults[m.id] === 'ok');
    droppedUnavailable = allModels.length - available.length;
  } else {
    available = allModels.filter((m) => !isNonChatModel(m.id));
    droppedNonChat = allModels.length - available.length;
  }
  if (available.length === 0) {
    return { ok: false, error: '没有试调用通过的可用模型，未写入。请先确认 API Key 有效后重新试调用。' };
  }
  // Locate the llm-pi-ai row by identity across every plausible field and
  // fall back to the configuration() projection before giving up.
  let entries;
  try {
    entries = configEditor.entries();
  } catch (error) {
    return { ok: false, error: '读取配置条目失败：' + String((error && error.message) || error) };
  }
  if (!Array.isArray(entries)) {
    return { ok: false, error: '配置条目返回异常：' + JSON.stringify(entries).slice(0, 200) };
  }
  let configs = [];
  try {
    configs = configEditor.configuration();
  } catch {
    configs = [];
  }
  let llmEntry = entries.find(isLlmPiAiEntry);
  let llmHit = null;
  if (llmEntry) {
    llmHit = (Array.isArray(configs) ? configs : []).find((c) => c && c.entry === llmEntry) || null;
  } else {
    llmHit = (Array.isArray(configs) ? configs : []).find((c) => c && isLlmPiAiEntry(c.entry)) || null;
    if (llmHit) llmEntry = llmHit.entry;
  }
  if (!llmEntry) {
    return {
      ok: false,
      error: '未找到 llm-pi-ai 配置项（entries 共 ' + entries.length + ' 条）。诊断信息：' + JSON.stringify(describeEntries(entries)).slice(0, 900),
    };
  }
  let existingCount = 0;
  if (llmHit && llmHit.override && llmHit.override.providers && llmHit.override.providers.nvidia) {
    const models = llmHit.override.providers.nvidia.models;
    existingCount = Array.isArray(models) ? models.length : 0;
  }
  const nextModels = available.map((m) => ({
    id: m.id,
    name: m.name + ' - ' + m.description,
    contextWindow: 131072,
    maxTokens: 8192,
    input: /vision|vl|omni|diffusion|image/i.test(m.id) ? ['text', 'image'] : ['text'],
  }));
  try {
    await configEditor.edit(llmEntry, (current, inherited) => {
      // Start from inherited ∪ override so unrelated providers and fields survive.
      const base = { ...(inherited || {}), ...(current || {}) };
      const baseProviders = base.providers || {};
      const baseNvidia = baseProviders.nvidia || {};
      return {
        ...base,
        providers: {
          ...baseProviders,
          nvidia: {
            ...baseNvidia,
            apiKeyEnv: baseNvidia.apiKeyEnv || 'NVIDIA_API_KEY',
            models: nextModels,
          },
        },
      };
    });
  } catch (error) {
    return { ok: false, error: '写入配置失败：' + String((error && error.message) || error) };
  }
  const droppedNote = droppedUnavailable > 0
    ? '，剔除 ' + droppedUnavailable + ' 个试调用未通过的模型'
    : (droppedNonChat > 0 ? '，跳过 ' + droppedNonChat + ' 个非对话模型' : '');
  return {
    ok: true,
    message: '已' + (existingCount ? '更新（原 ' + existingCount + ' 个模型）' : '写入') + ' nvidia 供应商：' + nextModels.length + ' 个【试调用可用】模型' + droppedNote + '（来源：' + source + '）。模型名称后附简介，现在对话框的模型选择器即可选用；凭据与正式路由共用，下一次请求即生效。',
  };
}

/** Query NVIDIA NIM for the live model list; falls back to the built-in catalog. */
async function detectNvidiaModels() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const apiKey = await resolveKeyFromContext();
    const headers = { accept: 'application/json' };
    if (apiKey) headers.authorization = 'Bearer ' + apiKey;
    const upstream = await fetch(NIM_MODELS_URL, { headers, signal: controller.signal });
    if (!upstream.ok) {
      return { ok: false, reason: 'NVIDIA API 返回 HTTP ' + upstream.status, source: 'builtin', models: BUILTIN_MODELS };
    }
    const data = await upstream.json();
    const raw = Array.isArray(data && data.data) ? data.data : [];
    if (raw.length === 0) {
      return { ok: false, reason: 'NVIDIA API 返回了空列表', source: 'builtin', models: BUILTIN_MODELS };
    }
    const models = raw.map((m) => ({
      id: String(m.id || ''),
      name: String(m.id || '').split('/').pop() || String(m.id || ''),
      description: describeModel(String(m.id || '')),
    })).filter((m) => m.id);
    models.sort((a, b) => a.id.localeCompare(b.id));
    return { ok: true, source: 'live', count: models.length, models, keyFound: Boolean(apiKey) };
  } catch (error) {
    const reason = error && error.name === 'AbortError' ? '连接超时（15 秒）' : String((error && error.message) || error);
    return { ok: false, reason: '无法访问 NVIDIA API：' + reason, source: 'builtin', models: BUILTIN_MODELS };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe one model with a streaming completion call. Availability is decided by
 * the FIRST response byte, not the full completion — thinking models can take
 * a long time to finish, but their first chunk arrives in seconds. The stream
 * is aborted as soon as the first byte lands.
 */
async function probeStreaming(id, apiKey, maxTokens, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { 'content-type': 'application/json', accept: 'text/event-stream' };
    if (apiKey) headers.authorization = 'Bearer ' + apiKey;
    const response = await fetch(NIM_COMPLETIONS_URL, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: id,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: maxTokens,
        stream: true,
      }),
    });
    if (!response.ok) {
      return { kind: 'http-error', response };
    }
    if (!response.body || typeof response.body.getReader !== 'function') {
      // No streaming body support: a 200 still means the endpoint accepted the model.
      return { kind: 'ok-no-stream' };
    }
    const reader = response.body.getReader();
    try {
      const first = await reader.read();
      if (first && first.done) {
        return { kind: 'ok-no-stream' };
      }
      return { kind: 'ok-stream' };
    } finally {
      try { reader.releaseLock(); } catch { /* the abort below already tore the stream down */ }
      controller.abort();
    }
  } catch (error) {
    return { kind: 'network-error', error };
  } finally {
    clearTimeout(timer);
  }
}

/** Extract NVIDIA's error message from a failed response, best-effort. */
async function extractErrorHint(response) {
  try {
    const errBody = await response.json();
    const msg = errBody && errBody.detail ? String(errBody.detail) : (errBody && errBody.message ? String(errBody.message) : '');
    return msg ? '：' + msg.slice(0, 160) : '';
  } catch {
    return '';
  }
}

/**
 * Probe one model with a real completion call. Thinking/reasoning models
 * reject tiny output budgets, so the first attempt uses max_tokens=1024 and
 * a 400/422 response retries once with a larger budget before declaring fail.
 * Availability is confirmed by the first streamed byte, so slow thinkers are
 * not misjudged as timeouts.
 */
async function testNvidiaModel(id) {
  if (isNonChatModel(id)) {
    return { id, status: 'skip', detail: '非对话模型（embed/rerank 等），未试调用' };
  }
  try {
    const apiKey = await resolveKeyFromContext();
    let probe = await probeStreaming(id, apiKey, 1024, 30000);
    if (probe.kind === 'http-error' && (probe.response.status === 400 || probe.response.status === 422)) {
      const firstHint = await extractErrorHint(probe.response);
      probe = await probeStreaming(id, apiKey, 8192, 45000);
      if (probe.kind === 'ok-stream' || probe.kind === 'ok-no-stream') {
        return { id, status: 'ok', detail: '试调用成功（需较大输出预算）' };
      }
      if (probe.kind === 'http-error') {
        const hint = (await extractErrorHint(probe.response)) || firstHint;
        const map = { 401: '鉴权失败（401）——需要有效的 NVIDIA API Key', 403: '无权限（403）——当前密钥无权调用该模型', 404: '模型不可用（404）——端点不接受该模型', 429: '限流（429）——请求过于频繁或配额耗尽' };
        const known = map[probe.response.status];
        return { id, status: 'fail', detail: (known || '调用失败（HTTP ' + probe.response.status + '）') + hint };
      }
      const abortRetry = probe.error && probe.error.name === 'AbortError';
      return { id, status: 'fail', detail: abortRetry ? '首包超时（45 秒无响应）' : '网络错误：' + String((probe.error && probe.error.message) || probe.error) };
    }
    if (probe.kind === 'ok-stream') {
      return { id, status: 'ok', detail: '试调用成功（流式首包确认）' };
    }
    if (probe.kind === 'ok-no-stream') {
      return { id, status: 'ok', detail: '端点返回 200（无流式数据）' };
    }
    if (probe.kind === 'http-error') {
      const hint = await extractErrorHint(probe.response);
      const map = {
        401: '鉴权失败（401）——需要有效的 NVIDIA API Key',
        403: '无权限（403）——当前密钥无权调用该模型',
        404: '模型不可用（404）——端点不接受该模型',
        429: '限流（429）——请求过于频繁或配额耗尽',
      };
      const known = map[probe.response.status];
      return { id, status: 'fail', detail: (known || '调用失败（HTTP ' + probe.response.status + '）') + hint };
    }
    const abortFirst = probe.error && probe.error.name === 'AbortError';
    return { id, status: 'fail', detail: abortFirst ? '首包超时（30 秒无响应）' : '网络错误：' + String((probe.error && probe.error.message) || probe.error) };
  } catch (error) {
    return { id, status: 'fail', detail: '网络错误：' + String((error && error.message) || error) };
  }
}

/** Read and parse a bounded JSON body; empty or malformed bodies yield {}. */
async function readJsonBody(request) {
  const reader = request && request.body && request.body.getReader ? request.body.getReader() : undefined;
  if (!reader) return {};
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) { await reader.cancel(); return {}; }
      chunks.push(value);
    }
  } catch {
    return {};
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** The credential reference this panel manages (matches the llm-pi-ai nvidia route). */
const NVIDIA_KEY_REF = 'NVIDIA_API_KEY';

/** POST /api/nvidia-models — actions: detect | test | keyStatus | setKey | clearKey. */
function createNvidiaModelsRoute(ctx) {
  return {
    path: '/api/nvidia-models',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const body = await readJsonBody(request);
      const action = body && typeof body.action === 'string' ? body.action : 'detect';
      let result;
      if (action === 'test' && typeof body.model === 'string' && body.model) {
        result = await testNvidiaModel(body.model);
      } else if (action === 'keyStatus') {
        const info = await withCredentials(ctx, (credentials) => credentials.describe(NVIDIA_KEY_REF));
        result = info && typeof info === 'object'
          ? { configured: Boolean(info.configured), source: info.source || null, writable: info.writable !== false }
          : { configured: false, source: null, writable: false, unavailable: true };
      } else if (action === 'setKey' && typeof body.key === 'string' && body.key.trim()) {
        const key = body.key.trim();
        const saved = await withCredentials(ctx, async (credentials) => {
          await credentials.set(NVIDIA_KEY_REF, key);
          return credentials.describe(NVIDIA_KEY_REF);
        });
        if (!saved || typeof saved !== 'object') {
          result = { saved: false, error: '凭据服务不可用，无法保存' };
        } else if (!saved.configured) {
          result = { saved: false, error: '保存后校验未通过（凭据存储未确认写入）' };
        } else {
          result = { saved: true, source: saved.source || 'stored' };
        }
      } else if (action === 'clearKey') {
        const cleared = await withCredentials(ctx, async (credentials) => {
          await credentials.unset(NVIDIA_KEY_REF);
          return credentials.describe(NVIDIA_KEY_REF);
        });
        result = cleared && typeof cleared === 'object' && !cleared.configured
          ? { cleared: true }
          : { cleared: false, error: '清除失败或凭据服务不可用' };
      } else if (action === 'configure') {
        result = await configureNvidiaModels(ctx, body.results);
      } else {
        result = await detectNvidiaModels();
      }
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  };
}

/** Command: write the NVIDIA model list into the llm-pi-ai nvidia provider. */
export function apply(ctx) {
  const disposers = [];

  // Slash-command handlers run against an agent invocation ({ agent, rawInput }),
  // NOT the plugin context — so both handlers close over the plugin ctx instead.
  disposers.push(ctx.commands.register({
    name: 'nvidia-models-detect',
    title: '检测 NVIDIA 可用模型',
    description: '实时查询 NVIDIA NIM API，列出当前可用模型及简介',
    handler: async () => {
      const result = await detectNvidiaModels();
      const head = result.source === 'live'
        ? '实时检测到 ' + result.count + ' 个可用模型（来自 NVIDIA API）：'
        : 'NVIDIA API 不可达（' + result.reason + '），以下为内置目录：';
      const list = result.models.map((m) => '- ' + m.name + ' (' + m.id + ')：' + m.description).join('\n');
      return { kind: 'success', text: head + '\n\n' + list + '\n\n运行 /nvidia-models-configure 可将模型写入 llm-pi-ai 的 nvidia 供应商。' };
    },
  }));

  disposers.push(ctx.commands.register({
    name: 'nvidia-models-configure',
    title: '配置 NVIDIA 模型到设置',
    description: '把检测到的模型批量写入 llm-pi-ai 的 nvidia 供应商模型列表',
    handler: async () => {
      const result = await configureNvidiaModels(ctx);
      return result.ok
        ? { kind: 'success', text: result.message }
        : { kind: 'error', text: result.error };
    },
  }));

  // Install the credential-resolver closure: stored key first (it outranks the
  // environment by design), then the plain environment variable.
  resolveKeyFromContext = async () => {
    try {
      const resolved = await new Promise((done) => {
        ctx.inject(['credentials'], (scoped) => {
          try {
            done((async () => {
              const credentials = scoped.credentials;
              try {
                const hit = await credentials.resolve('NVIDIA_API_KEY');
                if (hit && typeof hit.value === 'string' && hit.value.trim()) return hit.value.trim();
              } catch {
                // The reference form may be rejected; fall through to env.
              }
              return '';
            })());
          } catch {
            done();
          }
        });
      });
      if (resolved) return resolved;
    } catch {
      // Credential seam unavailable; env fallback below.
    }
    const fromEnv = process.env.NVIDIA_API_KEY;
    return fromEnv && fromEnv.trim() ? fromEnv.trim() : '';
  };

  ctx.inject(['connection'], (scoped) => {
    const connection = scoped.connection;
    const unregisterRoute = connection.fetch.register(createNvidiaModelsRoute(ctx), 'nvidia-models: /api/nvidia-models route');
    scoped.effect(() => unregisterRoute, 'nvidia-models: /api route');
  });

  return () => {
    resolveKeyFromContext = async () => '';
    for (const dispose of disposers) {
      if (typeof dispose === 'function') dispose();
    }
  };
}
