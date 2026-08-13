#!/usr/bin/env node
/**
 * WCAG AA contrast audit — OKLCH → linear-sRGB → relative-luminance → ratio
 * Same method as docs/design/DESIGN.md §3 (accent preset verification).
 * No external libraries.
 *
 * Scope: every foreground TOKEN used as TEXT on every surface TOKEN in both
 * themes, including all 5 accent presets. Priority colors are intentionally
 * stable across presets; only action/focus tokens may change.
 *
 * Token values are parsed directly out of src/index.css (not hand-copied)
 * so this audit can't silently drift from what actually ships — a stale
 * copy of light --accent (and per-preset dark --primary-foreground values
 * that differ per preset but were checked against only one) both slipped
 * through undetected before this file read CSS as its source of truth.
 *
 * Usage: node apps/web/contrast-audit.mjs
 */

import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ── OKLCH → linear sRGB ──

function oklchToLinearSrgb(L, C, Hdeg) {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  // OKLAB → LMS (approximate inverse)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS → linear sRGB (this matrix already outputs LINEAR sRGB — do not
  // apply the sRGB gamma-decode curve to it again, that was double-transforming
  // and silently distorting every mid-tone contrast ratio in this file)
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return [Math.max(0, r), Math.max(0, g), Math.max(0, bl)];
}

function relativeLuminance(linearRgb) {
  const [r, g, b] = linearRgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function parseOklch(s) {
  const m = s.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!m) throw new Error(`Cannot parse oklch: ${s}`);
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}

function contrastRatio(fgL, bgL) {
  const l1 = Math.max(fgL, bgL);
  const l2 = Math.min(fgL, bgL);
  return (l1 + 0.05) / (l2 + 0.05);
}

function luminance(token) {
  if (/^#[\da-f]{6}$/i.test(token)) {
    const channels = token
      .slice(1)
      .match(/.{2}/g)
      .map(value => Number.parseInt(value, 16) / 255)
      .map(value => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return relativeLuminance(channels);
  }
  const [L, C, H] = parseOklch(token);
  return relativeLuminance(oklchToLinearSrgb(L, C, H));
}

// ── Token definitions — parsed from src/index.css ──

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = join(__dirname, 'src', 'index.css');
const DESIGN_TOKENS_PATH = join(__dirname, '..', '..', 'packages', 'design-tokens', 'web.css');

// Pull every `--token: value;` declaration out of a raw CSS block body.
function parseDeclBlock(blockBody) {
  const tokens = {};
  const declRe = /--([\w-]+):\s*([^;]+);/g;
  let m;
  while ((m = declRe.exec(blockBody))) {
    tokens[`--${m[1]}`] = m[2].trim();
  }
  return tokens;
}

function resolveTokens(tokens) {
  const resolved = {};
  const resolve = (name, stack = []) => {
    if (resolved[name]) return resolved[name];
    if (stack.includes(name)) throw new Error(`Circular token reference: ${[...stack, name].join(' -> ')}`);
    const value = tokens[name];
    if (value == null) throw new Error(`Missing token reference: ${name}`);
    resolved[name] = value.replace(
      /var\((--[\w-]+)(?:,\s*([^)]+))?\)/g,
      (_match, reference, fallback) =>
        tokens[reference] != null ? resolve(reference, [...stack, name]) : fallback?.trim(),
    );
    return resolved[name];
  };

  for (const name of Object.keys(tokens)) resolve(name);
  return resolved;
}

// Merge every declaration found across all matches of a selector regex
// (index.css has more than one bare `:root { ... }` block — layout
// constants live in a second one further down the file).
function mergeBlocks(css, selectorRe) {
  const merged = {};
  for (const match of css.matchAll(selectorRe)) {
    Object.assign(merged, parseDeclBlock(match[1]));
  }
  return merged;
}

// Collect every `<selectorPrefix>[data-accent="X"] { ... }` block into
// { X: { tokens... } }.
function collectPresets(css, selectorPrefix) {
  const re = new RegExp(`${selectorPrefix}\\[data-accent="(\\w+)"\\]\\s*\\{([^}]*)\\}`, 'g');
  const presets = {};
  for (const match of css.matchAll(re)) {
    presets[match[1]] = parseDeclBlock(match[2]);
  }
  return presets;
}

function loadTokens(cssPath = CSS_PATH) {
  const css = `${readFileSync(DESIGN_TOKENS_PATH, 'utf8')}\n${readFileSync(cssPath, 'utf8')}`;

  // `\.dark\s*\{` alone would also match `:root\.dark\[data-accent=...\] {`
  // if we weren't anchored on `(?:^|\n)` — anchoring to line start keeps it
  // scoped to the bare top-level `.dark { ... }` block only.
  const lightTokens = mergeBlocks(css, /(?:^|\n)\s*:root\s*\{([^}]*)\}/g);
  const LIGHT = resolveTokens(lightTokens);
  const DARK = resolveTokens({
    ...lightTokens,
    ...mergeBlocks(css, /(?:^|\n)\s*(?::root)?\.dark\s*\{([^}]*)\}/g),
  });
  const ACCENT_PRESETS_LIGHT = collectPresets(css, ':root(?!\\.dark)');
  const ACCENT_PRESETS_DARK = collectPresets(css, ':root\\.dark');

  return { LIGHT, DARK, ACCENT_PRESETS_LIGHT, ACCENT_PRESETS_DARK };
}

const { LIGHT, DARK, ACCENT_PRESETS_LIGHT, ACCENT_PRESETS_DARK } = loadTokens();

// ── Audit scope ──

// Foregrounds: tokens that RENDER AS TEXT on surfaces
const TEXT_FOREGROUNDS = [
  '--foreground',
  '--muted-foreground',
  '--sidebar-foreground',
  '--accent-foreground',
  '--color-p1', '--color-p2', '--color-p3', '--color-p4',
];

// Surfaces: backgrounds these foregrounds appear on
const SURFACES = ['--background', '--card', '--sidebar', '--accent'];

// ── Audit ──

function auditPair(fgName, fgVal, bgName, bgVal, theme, preset) {
  const fgL = luminance(fgVal);
  const bgL = luminance(bgVal);
  const ratio = contrastRatio(fgL, bgL);
  return {
    theme,
    preset: preset || '(base)',
    fg: fgName,
    bg: bgName,
    ratio: Math.round(ratio * 100) / 100,
    pass: ratio >= 4.5,
  };
}

function auditTheme(name, tokens, accentPresets) {
  const results = [];

  // Base (no accent preset) — use default tokens
  for (const fg of TEXT_FOREGROUNDS) {
    for (const bg of SURFACES) {
      results.push(auditPair(fg, tokens[fg], bg, tokens[bg], name));
    }
  }

  // Accent presets — priority stays fixed while action tokens change.
  for (const [preset, overrides] of Object.entries(accentPresets)) {
    const themedTokens = resolveTokens({ ...tokens, ...overrides });
    for (const bg of SURFACES) {
      results.push(auditPair('--color-p3', themedTokens['--color-p3'], bg, themedTokens[bg], name, preset));
    }
    // primary-foreground text on primary button background — dark presets
    // each define their own --primary-foreground (light presets don't,
    // since light always pairs primary with plain white); fall back to the
    // base theme's value only when the preset doesn't override it.
    results.push(
      auditPair(
        '--primary-foreground',
        themedTokens['--primary-foreground'],
        '--primary',
        themedTokens['--primary'],
        name,
        preset,
      ),
    );
  }

  return results;
}

// ── Reusable entry point (imported by DESIGN.md §12 enforcement test —
// design-enforcement.test.ts — so the CLI and the automated regression
// check share one implementation instead of drifting apart) ──

export function runAudit() {
  return [
    ...auditTheme('light', LIGHT, ACCENT_PRESETS_LIGHT),
    ...auditTheme('dark', DARK, ACCENT_PRESETS_DARK),
  ];
}

export { LIGHT, DARK, ACCENT_PRESETS_LIGHT, ACCENT_PRESETS_DARK, auditTheme };

// ── CLI ── (only runs when this file is executed directly, e.g.
// `node apps/web/contrast-audit.mjs` — not when imported by the test above)

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  console.log('=== WCAG AA Contrast Audit ===');
  console.log('Method: OKLCH → linear-sRGB → relative-luminance → WCAG 2.0 ratio');
  console.log('Threshold: AA ≥ 4.5:1 for normal text\n');

  const allResults = runAudit();

  const printTable = (results) => {
    console.log(`${'Theme'.padEnd(6)} ${'Preset'.padEnd(10)} ${'Foreground'.padEnd(24)} ${'Surface'.padEnd(16)} ${'Ratio'.padEnd(8)} Status`);
    console.log('-'.repeat(78));
    for (const r of results) {
      const status = r.pass ? '✓' : '✗ FAIL';
      console.log(`${r.theme.padEnd(6)} ${r.preset.padEnd(10)} ${r.fg.padEnd(24)} ${r.bg.padEnd(16)} ${String(r.ratio + ':1').padEnd(8)} ${status}`);
    }
  };

  printTable(allResults);

  const failures = allResults.filter(r => !r.pass);
  console.log(`\nTotal: ${allResults.length} pairs checked, ${failures.length} failures`);

  if (failures.length > 0) {
    console.log('\n=== FAILED PAIRS ===');
    printTable(failures);
    process.exit(1);
  } else {
    console.log('\n=== ALL PAIRS PASS AA (≥ 4.5:1) ===');
    process.exit(0);
  }
}
