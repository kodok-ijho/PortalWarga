import { readFileSync } from 'node:fs';

export const UAT_BROWSER_ENV_ALLOWLIST = Object.freeze([
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
]);

const UAT_BROWSER_ENV_SOURCES = Object.freeze({
  VITE_SUPABASE_URL: ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
  VITE_SUPABASE_PUBLISHABLE_KEY: [
    'SUPABASE_UAT_PUBLISHABLE_KEY_VERSIONED',
    'SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
  ],
  VITE_SUPABASE_ANON_KEY: ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'],
});

export function selectLatestVersionedValue(parsed, baseName) {
  const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const versionPattern = new RegExp(`^${escaped}_V([1-9][0-9]*)$`, 'u');
  const candidates = [];

  if (parsed[baseName]) candidates.push({ version: 1, value: parsed[baseName] });
  for (const [name, value] of Object.entries(parsed)) {
    const match = name.match(versionPattern);
    if (match && value) candidates.push({ version: Number(match[1]), value });
  }

  candidates.sort((left, right) => right.version - left.version);
  return candidates[0]?.value;
}

export function parseProtectedUatEnv(text) {
  const parsed = {};

  String(text || '').split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) {
      throw new Error(`[uat-env] Baris ${index + 1} bukan assignment env yang valid.`);
    }

    const [, name, rawValue] = match;
    if (Object.hasOwn(parsed, name)) {
      throw new Error(`[uat-env] Variable duplikat: ${name}`);
    }

    let value = rawValue.trim();
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    parsed[name] = value;
  });

  return parsed;
}

export function selectUatBrowserEnv(parsed) {
  const selected = {
    VITE_APP_ENV: 'uat',
    VITE_USE_N8N_PROXY: 'true',
  };

  for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']) {
    const versioned = name === 'VITE_SUPABASE_PUBLISHABLE_KEY'
      ? selectLatestVersionedValue(parsed, 'SUPABASE_UAT_PUBLISHABLE_KEY')
      : undefined;
    const source = UAT_BROWSER_ENV_SOURCES[name]
      .filter((candidate) => candidate !== 'SUPABASE_UAT_PUBLISHABLE_KEY_VERSIONED')
      .find((candidate) => parsed[candidate]);
    if (versioned || source) selected[name] = versioned || parsed[source];
  }

  if (!selected.VITE_SUPABASE_PUBLISHABLE_KEY) {
    const anonSource = UAT_BROWSER_ENV_SOURCES.VITE_SUPABASE_ANON_KEY
      .find((candidate) => parsed[candidate]);
    if (anonSource) selected.VITE_SUPABASE_ANON_KEY = parsed[anonSource];
  }

  return Object.freeze(selected);
}

export function loadUatBrowserEnv(filePath) {
  return selectUatBrowserEnv(parseProtectedUatEnv(readFileSync(filePath, 'utf8')));
}
