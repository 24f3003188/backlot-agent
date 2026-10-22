import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { ROUTES, type RoleName, type RouteConfig } from './routes.config.js';
import { budgetGuard } from './budgetGuard.js';
import { circuitBreaker } from './circuitBreaker.js';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface ParsedToolCall {
  id?: string;
  name: string;
  args: Record<string, any>;
  reason?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CallRoleOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'required' | { type: 'function'; function: { name: string } };
  /** Multi-turn messages for conversational context (used by scout agent) */
  messages?: ConversationMessage[];
  /** Models to skip (used to retry a different model after a bad response) */
  excludeModels?: string[];
}

export interface RoleResponse {
  text: string;
  provider: string;
  model: string;
  toolCall?: ParsedToolCall;
}

export class AllRoutesExhaustedError extends Error {
  constructor(public role: RoleName, public lastError?: Error) {
    super(`All candidate routes exhausted for role "${role}". Last error: ${lastError?.message || 'none'}`);
    this.name = 'AllRoutesExhaustedError';
  }
}

let bedrockClientInstance: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient | null {
  if (process.env.BEDROCK_DISABLED === 'true') return null;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!bedrockClientInstance) {
    // Explicit keys when provided (local dev); otherwise the SDK default chain,
    // which picks up an EC2 instance role so no keys live on the server.
    bedrockClientInstance = new BedrockRuntimeClient(
      accessKeyId && secretAccessKey
        ? { region, credentials: { accessKeyId, secretAccessKey, sessionToken: process.env.AWS_SESSION_TOKEN } }
        : { region }
    );
  }
  return bedrockClientInstance;
}

function getApiKey(provider: RouteConfig['provider']): string | undefined {
  if (provider === 'bedrock') {
    return getBedrockClient() ? 'bedrock-configured' : undefined;
  }
  if (provider === 'groq') {
    return process.env.GROQ_API_KEY || process.env.grok;
  }
  if (provider === 'openrouter') {
    return process.env.OPENROUTER_API_KEY || process.env.openrouter;
  }
  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (key && key.startsWith('AIzaSy')) {
      return key;
    }
    return undefined;
  }
  return undefined;
}

/** Returns the balanced {...} substring starting at `start`, respecting strings. */
function sliceBalancedJson(text: string, start: number): string | undefined {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return undefined;
}

/**
 * Parses tool calls from native payload or extracts from JSON text
 */
export function extractToolCall(choice: any, text: string): ParsedToolCall | undefined {
  // 1. Native OpenAI/Groq function calling
  const rawNative = choice?.tool_calls?.[0] || choice?.function_call;
  if (rawNative) {
    const fn = rawNative.function || rawNative;
    const name = fn.name;
    let args: Record<string, any> = {};
    try {
      args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : (fn.arguments || {});
    } catch {
      const match = fn.arguments?.match(/\{[\s\S]*\}/);
      if (match) {
        try { args = JSON.parse(match[0]); } catch {}
      }
    }
    const reason = args.reason || args.why || undefined;
    return { id: rawNative.id, name, args, reason };
  }

  // 2. Model wrote the call as prose, e.g. 'I called discover({"type": ...})' (mimicking its history)
  if (text) {
    const m = text.match(/\b(?:called|call|calling)\s+([a-z_]+)\s*\(/i);
    if (m) {
      const start = text.indexOf('{', (m.index || 0) + m[0].length - 1);
      const args = start >= 0 ? sliceBalancedJson(text, start) : undefined;
      if (args !== undefined) {
        try {
          const parsed = JSON.parse(args);
          return { name: m[1], args: parsed, reason: parsed.reason };
        } catch {}
      }
    }
  }

  // 3. Fallback JSON tool call parser from text
  if (text) {
    const bracketMatch = text.match(/\{[\s\S]*\}/);
    if (bracketMatch) {
      try {
        const parsed = JSON.parse(bracketMatch[0]);
        if (parsed.tool || parsed.name || parsed.action) {
          const name = parsed.tool || parsed.name || parsed.action;
          const args = parsed.args || parsed.arguments || parsed.parameters || parsed;
          const reason = parsed.reason || args.reason || undefined;
          return { name, args, reason };
        }
      } catch {}
    }
  }

  return undefined;
}

async function callOpenAICompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
  options: CallRoleOptions,
  extraHeaders: Record<string, string> = {}
): Promise<{ text: string; toolCall?: ParsedToolCall; usageTokens: number }> {
  const messages: Array<{ role: string; content: string }> = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const payload: Record<string, any> = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2048,
  };

  if (options.tools?.length) {
    payload.tools = options.tools;
    payload.tool_choice = options.toolChoice || 'auto';
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(18000),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    // If the model does not support native tools, retry cleanly with JSON-in-prompt format
    if (res.status === 400 && options.tools?.length && (errorBody.includes('tool') || errorBody.includes('function') || errorBody.includes('support'))) {
      const toolDescriptions = options.tools.map(t =>
        `Tool "${t.function.name}": ${t.function.description}. Parameters: ${JSON.stringify(t.function.parameters)}`
      ).join('\n');
      const fallbackPrompt = `${options.systemPrompt || ''}\n\nAvailable Tools:\n${toolDescriptions}\n\nTo invoke a tool, reply ONLY with a JSON object: {"tool": "tool_name", "args": {...}, "reason": "why"}\n\n${prompt}`;

      const retryRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: fallbackPrompt }],
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 2048,
        }),
      });

      if (retryRes.ok) {
        const retryData = await retryRes.json() as any;
        const retryChoice = retryData.choices?.[0]?.message;
        const retryText = retryChoice?.content || retryChoice?.text || '';
        const toolCall = extractToolCall(retryChoice, retryText);
        const usageTokens = retryData.usage?.total_tokens || budgetGuard.estimateTokens(fallbackPrompt + retryText);
        return { text: retryText, toolCall, usageTokens };
      }
    }

    const err = new Error(`HTTP ${res.status}: ${errorBody.slice(0, 200)}`);
    (err as any).status = res.status;
    throw err;
  }

  const data = await res.json() as any;
  const choice = data.choices?.[0]?.message;
  const text = choice?.content || choice?.text || (typeof choice === 'string' ? choice : '');
  const toolCall = extractToolCall(choice, text);
  const usageTokens = data.usage?.total_tokens || budgetGuard.estimateTokens(prompt + text);
  return { text, toolCall, usageTokens };
}

async function callGemini(
  model: string,
  apiKey: string,
  prompt: string,
  options: CallRoleOptions
): Promise<{ text: string; toolCall?: ParsedToolCall; usageTokens: number }> {
  let fullPrompt = prompt;
  if (options.tools?.length) {
    const toolDescriptions = options.tools.map(t =>
      `Tool "${t.function.name}": ${t.function.description}. Parameters: ${JSON.stringify(t.function.parameters)}`
    ).join('\n');
    fullPrompt = `${options.systemPrompt || ''}\n\nAvailable Tools:\n${toolDescriptions}\n\nIf you want to invoke a tool, respond ONLY with a JSON object: {"tool": "tool_name", "args": {...}, "reason": "why"}\n\nUser:\n${prompt}`;
  } else if (options.systemPrompt) {
    fullPrompt = `${options.systemPrompt}\n\n${prompt}`;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.85,
        maxOutputTokens: options.maxTokens ?? 2048,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 150)}`);
    (err as any).status = res.status;
    throw err;
  }

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { totalTokenCount?: number };
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const toolCall = extractToolCall(null, text);
  const usageTokens = data.usageMetadata?.totalTokenCount || budgetGuard.estimateTokens(fullPrompt + text);
  return { text, toolCall, usageTokens };
}

/**
 * Bedrock Converse requires the conversation to start with a user turn and to
 * alternate user/assistant. Merge consecutive same-role turns and drop any
 * leading assistant turns so multi-turn agent history is always valid.
 */
function normalizeTurns(messages: any[]): any[] {
  const out: any[] = [];
  for (const m of messages) {
    const text = (m.content || []).map((c: any) => c.text || '').join('\n').trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content[0].text += `\n\n${text}`;
    } else {
      out.push({ role: m.role, content: [{ text }] });
    }
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out.length ? out : [{ role: 'user', content: [{ text: 'Continue.' }] }];
}

async function callBedrock(
  modelId: string,
  prompt: string,
  options: CallRoleOptions
): Promise<{ text: string; toolCall?: ParsedToolCall; usageTokens: number }> {
  const client = getBedrockClient();
  if (!client) {
    throw new Error('AWS Bedrock client is not configured');
  }

  let toolConfig: any = undefined;
  if (options.tools?.length) {
    toolConfig = {
      tools: options.tools.map(t => ({
        toolSpec: {
          name: t.function.name,
          description: t.function.description,
          inputSchema: {
            json: t.function.parameters,
          },
        },
      })),
    };
  }

  const system = options.systemPrompt ? [{ text: options.systemPrompt }] : undefined;

  // Support multi-turn messages for conversational agent loops
  let messages: any[];
  if (options.messages?.length) {
    messages = options.messages.map(m => ({
      role: m.role,
      content: [{ text: m.content }],
    }));
    // Append current prompt as the latest user message
    if (prompt.trim()) {
      messages.push({ role: 'user', content: [{ text: prompt }] });
    }
    messages = normalizeTurns(messages);
  } else {
    messages = [{ role: 'user', content: [{ text: prompt }] }];
  }

  const command = new ConverseCommand({
    modelId,
    messages,
    system,
    toolConfig,
    inferenceConfig: {
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 2048,
    },
  });

  const res = await client.send(command);
  const outputMessage = res.output?.message;
  let text = '';
  let toolCall: ParsedToolCall | undefined = undefined;

  if (outputMessage?.content) {
    for (const part of outputMessage.content) {
      if (part.text) {
        text += part.text;
      }
      if (part.toolUse) {
        toolCall = {
          id: part.toolUse.toolUseId,
          name: part.toolUse.name || '',
          args: (part.toolUse.input as Record<string, any>) || {},
        };
      }
    }
  }

  if (!toolCall && text) {
    toolCall = extractToolCall(null, text);
  }

  const usageTokens = (res.usage?.inputTokens || 0) + (res.usage?.outputTokens || 0) || budgetGuard.estimateTokens(prompt + text);
  return { text, toolCall, usageTokens };
}

/**
 * Main routed LLM dispatcher
 */
export async function callRole(
  role: RoleName,
  prompt: string,
  options: CallRoleOptions = {}
): Promise<RoleResponse> {
  const candidateRoutes = ROUTES[role] || [];
  let lastError: Error | undefined;

  for (const route of candidateRoutes) {
    if (options.excludeModels?.includes(route.model)) continue;
    const apiKey = getApiKey(route.provider);
    if (!apiKey) {
      continue;
    }

    if (circuitBreaker.isOpen(route)) {
      continue;
    }

    const estimatedCost = budgetGuard.estimateTokens(prompt) + (options.maxTokens || route.maxTokens || 1000);
    if (!budgetGuard.canSpend(route, estimatedCost)) {
      continue;
    }

    try {
      // Output limits only cap generation (you pay for tokens produced), so keep them generous.
      // gpt-oss reasons before answering; a small cap leaves it with an empty or cut-off reply.
      const requested = options.maxTokens ?? route.maxTokens ?? 1024;
      const floor = route.model.includes('gpt-oss') ? 3000 : 800;
      const mergedOptions: CallRoleOptions = {
        ...options,
        temperature: options.temperature ?? route.temperature,
        maxTokens: Math.max(requested, floor),
      };

      console.log(`[Router] Role "${role}": calling ${route.provider}/${route.model}...`);
      const t0 = Date.now();
      let result: { text: string; toolCall?: ParsedToolCall; usageTokens: number };

      if (route.provider === 'bedrock') {
        result = await callBedrock(
          route.model,
          prompt,
          mergedOptions
        );
      } else if (route.provider === 'groq') {
        result = await callOpenAICompatible(
          'https://api.groq.com/openai/v1/chat/completions',
          apiKey,
          route.model,
          prompt,
          mergedOptions
        );
      } else if (route.provider === 'openrouter') {
        result = await callOpenAICompatible(
          'https://openrouter.ai/api/v1/chat/completions',
          apiKey,
          route.model,
          prompt,
          mergedOptions,
          {
            'HTTP-Referer': 'https://backlot.ai',
            'X-Title': 'Backlot World Engine',
          }
        );
      } else if (route.provider === 'gemini') {
        result = await callGemini(
          route.model,
          apiKey,
          prompt,
          mergedOptions
        );
      } else {
        continue;
      }

      if ((result.text && result.text.trim().length > 0) || result.toolCall) {
        budgetGuard.record(route, result.usageTokens);
        circuitBreaker.recordSuccess(route);
        console.log(`[Router] Role "${role}": received response from ${route.provider}/${route.model} in ${Date.now() - t0}ms`);
        return {
          text: result.text,
          provider: route.provider,
          model: route.model,
          toolCall: result.toolCall,
        };
      }
      console.warn(`[Router] ${route.provider}/${route.model} returned an empty reply. Cascading to next route...`);
    } catch (err: any) {
      lastError = err;
      const status = err.status || (err.message.includes('429') ? 429 : 500);
      circuitBreaker.recordFailure(route, status);
      console.warn(`[Router] Route ${route.provider}/${route.model} failed: ${err.message}. Cascading to next route...`);
    }
  }

  throw new AllRoutesExhaustedError(role, lastError);
}

/**
 * Helper to call role and parse JSON object/array
 */
export async function callRoleJson<T>(
  role: RoleName,
  prompt: string,
  options: CallRoleOptions = {}
): Promise<{ data: T; provider: string; model: string }> {
  const tried: string[] = [...(options.excludeModels || [])];
  let lastErr: Error | undefined;
  // One retry on a different model if the first answer isn't valid JSON
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callRole(role, prompt, { ...options, excludeModels: tried });
    const parsed = parseJsonLoose<T>(res.text);
    if (parsed !== undefined) return { data: parsed, provider: res.provider, model: res.model };
    tried.push(res.model);
    lastErr = new Error(`Failed to parse JSON response from ${res.provider}/${res.model}: ${res.text.slice(0, 150)}`);
    console.warn(`[Router] ${lastErr.message} — retrying on another model`);
  }
  throw lastErr!;
}

export function parseJsonLoose<T>(raw: string): T | undefined {
  // Strip reasoning tags some open-weight models emit inline
  const text = raw.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '').trim();
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  // An unclosed ```json fence (cut-off reply) still needs stripping
  const candidate = codeBlockMatch ? codeBlockMatch[1] : text.replace(/^```(?:json)?\s*/, '');
  try { return JSON.parse(candidate) as T; } catch {}

  const arrStart = candidate.indexOf('[');
  const objStart = candidate.indexOf('{');
  const arrayFirst = arrStart >= 0 && (objStart < 0 || arrStart < objStart);

  if (arrayFirst) {
    const arrEnd = candidate.lastIndexOf(']');
    if (arrEnd > arrStart) {
      try { return JSON.parse(candidate.slice(arrStart, arrEnd + 1)) as T; } catch {}
    }
    // Reply was cut off mid-array: keep every complete item
    let end = candidate.lastIndexOf('}');
    while (end > arrStart) {
      try {
        const salvaged = JSON.parse(candidate.slice(arrStart, end + 1) + ']');
        if (Array.isArray(salvaged) && salvaged.length) return salvaged as T;
      } catch {}
      end = candidate.lastIndexOf('}', end - 1);
    }
    return undefined;
  }

  if (objStart >= 0) {
    const objEnd = candidate.lastIndexOf('}');
    if (objEnd > objStart) {
      try { return JSON.parse(candidate.slice(objStart, objEnd + 1)) as T; } catch {}
    }
  }
  return undefined;
}
