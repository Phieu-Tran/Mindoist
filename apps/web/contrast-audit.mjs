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
 * copy of light --hover-surface (and per-preset dark --primary-foreground values
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

// ── color-mix() and translucent layers ──
// The HeroUI adapter derives tones with color-mix() (CSS Color 5), some of
// them translucent (mixed with `transparent`) and painted over another
// surface. This evaluates the subset those tokens use: hex, oklch() with an
// optional alpha, `transparent`, and color-mix() in oklab or oklch with
// optional percentages, premultiplied like the browser. An explicit hue is
// interpolated as written (that is the D3/D6 hue drag the browser really
// does); only a missing hue (achromatic result, `transparent`) defers to the
// other colour. Translucent colours are composited over their backdrop in
// gamma-encoded sRGB, like the browser paints them.

const decodeSrgb = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const encodeSrgb = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function linearSrgbToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab(L, a, b, alpha) {
  const C = Math.hypot(a, b);
  const H = C < 1e-6 ? NaN : (((Math.atan2(b, a) * 180) / Math.PI) + 360) % 360;
  return { L, C, H, alpha };
}

function toOklab({ L, C, H }) {
  const h = ((Number.isNaN(H) ? 0 : H) * Math.PI) / 180;
  return [L, C * Math.cos(h), C * Math.sin(h)];
}

function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '(') depth++;
    else if (body[i] === ')') depth--;
    else if (body[i] === ',' && depth === 0) {
      parts.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(body.slice(start).trim());
  return parts;
}

function parseMixArg(arg) {
  const trailing = arg.match(/^([\s\S]*\S)\s+([\d.]+)%$/);
  if (trailing) return [parseColor(trailing[1]), parseFloat(trailing[2])];
  const leading = arg.match(/^([\d.]+)%\s+([\s\S]+)$/);
  if (leading) return [parseColor(leading[2]), parseFloat(leading[1])];
  return [parseColor(arg), undefined];
}

function mixColors(space, [c1, p1], [c2, p2]) {
  if (p1 === undefined && p2 === undefined) p1 = p2 = 50;
  else if (p1 === undefined) p1 = 100 - p2;
  else if (p2 === undefined) p2 = 100 - p1;
  const sum = p1 + p2;
  if (sum <= 0) throw new Error('color-mix() percentages sum to zero');
  const w1 = p1 / sum;
  const w2 = p2 / sum;
  const alpha = c1.alpha * w1 + c2.alpha * w2;
  const alphaScale = sum < 100 ? sum / 100 : 1;
  const premix = (v1, v2) => (alpha === 0 ? 0 : (v1 * c1.alpha * w1 + v2 * c2.alpha * w2) / alpha);
  if (space === 'oklab') {
    const [L1, a1, b1] = toOklab(c1);
    const [L2, a2, b2] = toOklab(c2);
    return fromOklab(premix(L1, L2), premix(a1, a2), premix(b1, b2), alpha * alphaScale);
  }
  let h1 = c1.H;
  let h2 = c2.H;
  if (Number.isNaN(h1)) h1 = h2;
  if (Number.isNaN(h2)) h2 = h1;
  let H = NaN;
  if (!Number.isNaN(h1)) {
    if (h2 - h1 > 180) h2 -= 360;
    else if (h1 - h2 > 180) h2 += 360;
    H = ((h1 * w1 + h2 * w2) % 360 + 360) % 360;
  }
  return { L: premix(c1.L, c2.L), C: premix(c1.C, c2.C), H, alpha: alpha * alphaScale };
}

function parseColor(input) {
  const value = input.trim();
  if (value === 'transparent') return { L: 0, C: 0, H: NaN, alpha: 0 };
  if (/^#[\da-f]{6}$/i.test(value)) {
    const rgb = value.slice(1).match(/.{2}/g).map(v => decodeSrgb(Number.parseInt(v, 16) / 255));
    return fromOklab(...linearSrgbToOklab(rgb), 1);
  }
  const oklch = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+|none)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/);
  if (oklch) {
    const alpha = oklch[4] === undefined ? 1 : parseFloat(oklch[4]) / (oklch[5] ? 100 : 1);
    return { L: parseFloat(oklch[1]), C: parseFloat(oklch[2]), H: oklch[3] === 'none' ? NaN : parseFloat(oklch[3]), alpha };
  }
  const mix = value.match(/^color-mix\(\s*in\s+(oklab|oklch)\s*,([\s\S]*)\)$/);
  if (mix) {
    const args = splitTopLevel(mix[2]);
    if (args.length !== 2) throw new Error(`color-mix() needs two colours: ${value}`);
    return mixColors(mix[1], parseMixArg(args[0]), parseMixArg(args[1]));
  }
  throw new Error(`Cannot parse colour: ${value}`);
}

function colorToLinearSrgb(color) {
  return oklchToLinearSrgb(color.L, color.C, Number.isNaN(color.H) ? 0 : color.H);
}

// Luminance of a (possibly translucent) colour painted over an opaque one.
function luminanceOver(top, backdrop) {
  const base = parseColor(backdrop);
  if (base.alpha < 0.999) throw new Error(`Backdrop must be opaque: ${backdrop}`);
  const layer = parseColor(top);
  const fg = colorToLinearSrgb(layer).map(v => encodeSrgb(Math.min(1, v)));
  const bg = colorToLinearSrgb(base).map(v => encodeSrgb(Math.min(1, v)));
  return relativeLuminance(fg.map((v, i) => decodeSrgb(v * layer.alpha + bg[i] * (1 - layer.alpha))));
}

function luminance(token) {
  if (!/^#[\da-f]{6}$/i.test(token) && !/^oklch\(\s*[\d.]+\s+[\d.]+\s+[\d.]+\s*\)$/.test(token)) {
    const color = parseColor(token);
    if (color.alpha < 0.999) throw new Error(`Translucent colour needs a backdrop: ${token}`);
    return relativeLuminance(colorToLinearSrgb(color));
  }
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
  '--hover-surface-foreground',
  '--color-p1', '--color-p2', '--color-p3', '--color-p4',
];

// Surfaces: backgrounds these foregrounds appear on
const SURFACES = ['--background', '--card', '--sidebar', '--hover-surface'];

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

function auditLayeredPair(fgName, fgVal, layerName, layerVal, backdropName, backdropVal, theme, preset) {
  const ratio = contrastRatio(luminance(fgVal), luminanceOver(layerVal, backdropVal));
  return {
    theme,
    preset: preset || '(base)',
    fg: fgName,
    bg: `${layerName} on ${backdropName}`,
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
    // Destructive buttons: --destructive-foreground on --destructive.
    results.push(
      auditPair(
        '--destructive-foreground',
        themedTokens['--destructive-foreground'],
        '--destructive',
        themedTokens['--destructive'],
        name,
        preset,
      ),
    );
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

// ── HeroUI kit adapter (src/styles/heroui.css) ──
// The HeroUI kit maps its semantic variables onto Mindoist tokens. Most are
// plain references, but the adapter also defines its own literals (status
// fills), so every text/fill pair HeroUI renders is audited here, per theme
// and accent preset, against the adapter merged over the app tokens.

const HEROUI_CSS_PATH = join(__dirname, 'src', 'styles', 'heroui.css');

const HEROUI_PAIRS = [
  ['--accent-foreground', '--accent'],
  ['--danger-foreground', '--danger'],
  ['--success-foreground', '--success'],
  ['--warning-foreground', '--warning'],
  ['--default-foreground', '--default'],
  ['--surface-foreground', '--surface'],
  ['--overlay-foreground', '--overlay'],
  ['--field-foreground', '--field-background'],
  ['--field-placeholder', '--field-background'],
  ['--muted-foreground', '--overlay'],
  ['--link', '--overlay'],
  // H10 look: [text, translucent fill, surface the fill is painted on]
  ['--accent-soft-foreground', '--accent-soft', '--sidebar'], // sidebar current view
  ['--accent-soft-foreground', '--accent-soft', '--card'], // Quick Capture date shortcut
  ['--foreground', '--hui-field'], // calendar toolbar pills
  ['--muted-foreground', '--hui-field'], // idle segmented options
];

function resolveOne(tokens, name, stack = []) {
  if (stack.includes(name)) throw new Error(`Circular token reference: ${[...stack, name].join(' -> ')}`);
  const value = tokens[name];
  if (value == null) throw new Error(`Missing token reference: ${name}`);
  return value.replace(
    /var\((--[\w-]+)(?:,\s*([^)]+))?\)/g,
    (_match, reference, fallback) =>
      tokens[reference] != null ? resolveOne(tokens, reference, [...stack, name]) : fallback?.trim(),
  );
}

function auditHeroUiTheme(name, baseTokens, presets, adapter) {
  const results = [];
  const variants = [[undefined, {}], ...Object.entries(presets)];
  for (const [preset, overrides] of variants) {
    const tokens = { ...baseTokens, ...overrides, ...adapter };
    for (const [fg, bg, backdrop] of HEROUI_PAIRS) {
      results.push(backdrop
        ? auditLayeredPair(fg, resolveOne(tokens, fg), bg, resolveOne(tokens, bg), backdrop, resolveOne(tokens, backdrop), `heroui-${name}`, preset)
        : auditPair(fg, resolveOne(tokens, fg), bg, resolveOne(tokens, bg), `heroui-${name}`, preset));
    }
  }
  return results;
}

export function runHeroUiAudit(cssPath = HEROUI_CSS_PATH) {
  const css = readFileSync(cssPath, 'utf8');
  const lightAdapter = mergeBlocks(css, /(?:^|\n)\s*:root\s*\{([^}]*)\}/g);
  const darkAdapter = { ...lightAdapter, ...mergeBlocks(css, /(?:^|\n)\s*:root\.dark\s*\{([^}]*)\}/g) };
  return [
    ...auditHeroUiTheme('light', LIGHT, ACCENT_PRESETS_LIGHT, lightAdapter),
    ...auditHeroUiTheme('dark', DARK, ACCENT_PRESETS_DARK, darkAdapter),
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
