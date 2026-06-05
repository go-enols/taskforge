#!/usr/bin/env node
/**
 * scripts/check-i18n.cjs
 *
 * Validates that every t() call in the renderer has a corresponding key in
 * zh-CN.json, and that every {{var}} interpolation in the key receives the
 * variable at the call site.
 *
 * Run: node scripts/check-i18n.cjs
 *   or: npm run i18n:check  (after adding to package.json)
 *
 * Exits 0 on success, 1 on any violation.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Resolve paths relative to this script's location (client/scripts/check-i18n.cjs)
const CLIENT_DIR = path.resolve(__dirname, '..');
const RENDERER_SRC = path.join(CLIENT_DIR, 'src/renderer/src');
const ZHCN_PATH = path.join(RENDERER_SRC, 'i18n/zh-CN.json');
const TEST_DIRS = ['tests', '__tests__']; // skip these

// ---------- 1. Load zh-CN.json and flatten to dot-path keys ----------

const rawJson = fs.readFileSync(ZHCN_PATH, 'utf8');
// Strip BOM if present
const cleanJson = rawJson.charCodeAt(0) === 0xFEFF ? rawJson.slice(1) : rawJson;
const zhCN = JSON.parse(cleanJson);

function flattenKeys(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenKeys(v, fullKey));
    } else {
      out.push({ key: fullKey, value: v });
    }
  }
  return out;
}

const allKeys = flattenKeys(zhCN);
const keySet = new Set(allKeys.map((k) => k.key));
const interpolationRegex = /\{\{(\w+)\}\}/g;

function getInterpolations(value) {
  const vars = [];
  if (typeof value !== 'string') return vars;
  let m;
  interpolationRegex.lastIndex = 0;
  while ((m = interpolationRegex.exec(value)) !== null) {
    vars.push(m[1]);
  }
  return vars;
}

const keyInterpolations = new Map();
for (const { key, value } of allKeys) {
  const vars = getInterpolations(value);
  if (vars.length > 0) keyInterpolations.set(key, vars);
}

// ---------- 2. Walk renderer source and extract t() calls ----------

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (TEST_DIRS.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      yield full;
    }
  }
}

const files = [...walk(RENDERER_SRC)];

// Match t('key', ...) or t("key", ...) — SKIP template literals (dynamic keys).
// The 2nd-arg capture is intentionally non-greedy on commas to handle the
// object literal case. We don't try to match nested parens perfectly — instead
// we look for the first top-level `,` after the key.
const tCallRegex = /\bt\(\s*(['"])([^'"]+)\1\s*(?:,\s*([\s\S]*?))?\)/g;

const errors = [];
let totalCalls = 0;

for (const file of files) {
  const rel = path.relative(CLIENT_DIR, file);
  const content = fs.readFileSync(file, 'utf8');
  // Strip line comments to avoid false positives
  const stripped = content.replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

  let m;
  tCallRegex.lastIndex = 0;
  while ((m = tCallRegex.exec(stripped)) !== null) {
    const [full, , key, secondArg] = m;
    const line = content.slice(0, m.index).split('\n').length;
    totalCalls++;

    // Check 1: key must exist in zh-CN.json
    if (!keySet.has(key)) {
      // Check if a similar key exists (close miss)
      const similar = [...keySet].find((k) => k.endsWith(`.${key.split('.').pop()}`) || key.endsWith(`.${k.split('.').pop()}`));
      const hint = similar ? ` (similar: ${similar})` : '';
      errors.push({
        file: rel,
        line,
        type: 'missing-key',
        key,
        message: `t('${key}') is called but '${key}' is not defined in zh-CN.json${hint}`,
        snippet: full.trim()
      });
      continue;
    }

    // Check 2: if key has {{var}} interpolation, second arg must be an object
    // containing all the variable names.
    const requiredVars = keyInterpolations.get(key);
    if (requiredVars && requiredVars.length > 0) {
      if (secondArg === undefined || !secondArg.trim()) {
        errors.push({
          file: rel,
          line,
          type: 'missing-vars',
          key,
          message: `t('${key}') requires vars [${requiredVars.join(', ')}] but no second argument is passed`,
          snippet: full.trim()
        });
        continue;
      }
      // Trim outer parens of object literal and check var names inside.
      // Accept: { count }, { count: 5 }, { count, total }, { count: 5, total: x }
      // All of these are valid shorthand/longhand for object with key `count`.
      const trimmed = secondArg.trim();
      // Find the outermost { ... } if the arg starts with one
      let objContent = trimmed;
      if (trimmed.startsWith('{')) {
        // Find matching closing brace, handling nested braces
        let depth = 0;
        let end = -1;
        for (let i = 0; i < trimmed.length; i++) {
          if (trimmed[i] === '{') depth++;
          else if (trimmed[i] === '}') {
            depth--;
            if (depth === 0) { end = i; break; }
          }
        }
        if (end >= 0) {
          objContent = trimmed.slice(1, end);
        }
      }
      const missingVars = requiredVars.filter((v) => {
        // Match `v` as a key in the object. The key is followed by either:
        //   - `:` (longhand: `{ count: 5 }`)
        //   - `,` (shorthand in middle: `{ count, total }`)
        //   - whitespace then `}` (shorthand at end: `{ count }`)
        // The `\s*` before `[:,}]` must consume the optional whitespace.
        // To prevent substring matches like `vv` matching `v`, require the
        // preceding character to be `{`, `,`, or whitespace (or start).
        const re = new RegExp(`(?:^|[{,\\s])${v}(?:\\s*[:,}]|\\s*$)`);
        return !re.test(objContent);
      });
      if (missingVars.length > 0) {
        errors.push({
          file: rel,
          line,
          type: 'missing-vars',
          key,
          message: `t('${key}') is missing required vars [${missingVars.join(', ')}] in second arg (key needs [${requiredVars.join(', ')}])`,
          snippet: full.trim()
        });
      }
    }
  }
}

// ---------- 3. Report ----------

console.log(`Scanned ${files.length} files, found ${totalCalls} t() calls`);
console.log(`zh-CN.json has ${allKeys.length} keys (${keyInterpolations.size} with interpolation)`);
console.log('');

if (errors.length === 0) {
  console.log('✓ All t() calls are valid');
  process.exit(0);
}

console.log(`✗ Found ${errors.length} i18n error(s):\n`);
for (const e of errors) {
  console.log(`  ${e.file}:${e.line}  [${e.type}]  ${e.message}`);
  console.log(`    ${e.snippet}\n`);
}

console.log(`\nFix the above errors before committing.`);
console.log(`Run \`node scripts/check-i18n.cjs\` to verify.`);
process.exit(1);
