import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const keyFile = resolve(root, 'API KEY.txt');
const envFile = resolve(root, '.env.local');
const start = '# <roadgov-llm-keys>';
const end = '# </roadgov-llm-keys>';

const providerMeta = {
  qwen: {
    aliases: ['qwen', '通义', '千问', '通义千问'],
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  deepseek: {
    aliases: ['deepseek', 'deep seek', '深度求索'],
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
  },
  kimi: {
    aliases: ['kimi', 'moonshot', '月之暗面'],
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
  },
};

function normalizeName(raw) {
  const text = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [provider, meta] of Object.entries(providerMeta)) {
    if (meta.aliases.some((alias) => text.includes(alias))) return provider;
  }
  return undefined;
}

function parseKeys(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:：#]+)\s*[:：]\s*(\S+)\s*$/);
    if (!match) continue;
    const provider = normalizeName(match[1]);
    if (provider) result[provider] = match[2].trim();
  }
  return result;
}

function mergeEnv(existing, managed) {
  const block = `${start}
# Generated from API KEY.txt by scripts/sync-llm-keys.mjs.
# API keys are exposed to the browser in this front-end prototype.
${managed.join('\n')}
${end}`;
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (pattern.test(existing)) return existing.replace(pattern, block);
  const trimmed = existing.trimEnd();
  return `${trimmed}${trimmed ? '\n\n' : ''}${block}\n`;
}

function describeFsError(error) {
  const code = error && typeof error === 'object' && 'code' in error ? ` (${error.code})` : '';
  const message = error instanceof Error ? error.message : String(error);
  return `${message}${code}`;
}

function warnSyncFailure(action, file, error) {
  console.warn(`[WARN] Unable to ${action} ${file}; keeping the existing LLM configuration and continuing startup. ${describeFsError(error)}`);
}

if (!existsSync(keyFile)) {
  process.exit(0);
}

let keyText;
try {
  keyText = readFileSync(keyFile, 'utf8');
} catch (error) {
  warnSyncFailure('read', keyFile, error);
  process.exit(0);
}

const keys = parseKeys(keyText);
const selected = keys.qwen ? 'qwen' : keys.deepseek ? 'deepseek' : keys.kimi ? 'kimi' : 'qwen';
const selectedMeta = providerMeta[selected];
const managed = [
  `VITE_LLM_PROVIDER=${selected}`,
  `VITE_LLM_BASE_URL=${selectedMeta.baseUrl}`,
  `VITE_LLM_MODEL=${selectedMeta.model}`,
  'VITE_LLM_TIMEOUT_MS=30000',
  ...(keys.qwen ? [`VITE_LLM_QWEN_API_KEY=${keys.qwen}`] : []),
  ...(keys.deepseek ? [`VITE_LLM_DEEPSEEK_API_KEY=${keys.deepseek}`] : []),
  ...(keys.kimi ? [`VITE_LLM_KIMI_API_KEY=${keys.kimi}`] : []),
  ...(keys[selected] ? [`VITE_LLM_API_KEY=${keys[selected]}`] : []),
];

let existing = '';
try {
  existing = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
} catch (error) {
  warnSyncFailure('read', envFile, error);
  process.exit(0);
}

const next = mergeEnv(existing, managed);
if (next === existing) {
  process.exit(0);
}

try {
  writeFileSync(envFile, next, 'utf8');
} catch (error) {
  warnSyncFailure('write', envFile, error);
  process.exit(0);
}
