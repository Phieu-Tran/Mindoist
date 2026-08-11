/**
 * DESIGN.md §12 Enforcement — 5 automated checks that guard the specific
 * regressions EPIC D (2026-07-25/26) found and fixed, so the rulebook
 * defends itself instead of relying on a future worker reading carefully.
 * Each check is written to FAIL when the exact violation it targets is
 * reintroduced, and to PASS on `main` as of D1–D7/D9.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
// @ts-expect-error — plain-JS sibling script, no .d.ts (kept dependency-free
// on purpose so `node apps/web/contrast-audit.mjs` still works standalone).
import { runAudit } from '../contrast-audit.mjs';

interface ContrastPair {
  theme: string;
  preset: string;
  fg: string;
  bg: string;
  ratio: number;
  pass: boolean;
}

const SRC_DIR = join(__dirname);

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.includes(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

const cssFiles = walk(SRC_DIR, ['.css']);
const tsxFiles = walk(SRC_DIR, ['.tsx']).filter(f => !f.endsWith('.test.tsx'));
const allSourceFiles = walk(SRC_DIR, ['.css', '.tsx']).filter(f => !f.endsWith('.test.tsx'));

describe('DESIGN.md §12 — Enforcement', () => {
  it('1. no color-mix(in srgb) anywhere (D6 migrated all of it to in oklch)', () => {
    const offenders: string[] = [];
    for (const file of allSourceFiles) {
      const text = readFileSync(file, 'utf8');
      if (text.includes('color-mix(in srgb')) offenders.push(file);
    }
    expect(offenders, `color-mix(in srgb ...) found in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('2. every border-radius declaration uses the 3-token scale (D5) or the pill/circle whitelist', () => {
    // Allowed: var(--radius-chip|control|panel), any combination of those
    // in a 2/4-value shorthand with "0", plus 999px/9999px/50%/inherit
    // (fully-round pills/avatars/checkboxes — not a size choice).
    const tokenPattern = /^(var\(--radius-(chip|control|panel)\)|0)$/;
    const wholeValuePattern = /^(999px|9999px|50%|inherit)$/;
    const declRe = /border-radius:\s*([^;]+);/g;
    const offenders: { file: string; value: string }[] = [];

    for (const file of cssFiles) {
      const text = readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = declRe.exec(text))) {
        const raw = m[1].trim().replace(/\s*!important$/, '');
        if (wholeValuePattern.test(raw)) continue;
        const parts = raw.split(/\s+/);
        const allTokens = parts.every(p => tokenPattern.test(p));
        if (!allTokens) offenders.push({ file, value: raw });
      }
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });

  it('3. every foreground/surface pair passes AA contrast', () => {
    // contrast-audit.mjs previously (a) applied the sRGB gamma-decode curve
    // to values the OKLab→linear-sRGB matrix had already linearized —
    // double-transforming every mid-tone ratio — and (b) hand-copied token
    // values instead of parsing index.css, which had silently drifted from
    // the real --accent value. Together they made ~21 dark-theme pairs
    // look like failures and hid 26 real light-theme ones. Fixed 2026-07-26
    // (see MASTERPLAN.md X3): the script now parses tokens straight out of
    // index.css, and every token that was actually failing AA was darkened
    // (light --muted-foreground/--sidebar-foreground/--color-p1-p4 and all
    // 5 accent presets) or lightened (dark --muted-foreground/
    // --sidebar-foreground) until it cleared 4.5:1 with headroom. All 114
    // pairs pass now — a future regression should fail loudly here rather
    // than accumulate behind a "known failures" allowlist again.
    const results = runAudit() as ContrastPair[];
    const failures = results.filter((r: ContrastPair) => !r.pass);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });

  it('4. no color-mix() mixes a hue-bearing token into an opaque neutral (the D3/D6 hue-drag bug)', () => {
    // The bug (D-design-overhaul-2026-07-25 §2.6): color-mix(in oklch, X%,
    // <opaque near-zero-chroma neutral>) drags the result's hue toward the
    // neutral's own hue no matter how small its chroma is. Mixing into
    // `transparent` is fine (no competing opaque hue) — this only flags a
    // hue source mixed into a *named*, opaque neutral surface token.
    const hueSource = /var\(--(primary|destructive|color-p[1-4]|calendar-event-accent|task-color-accent)\b/;
    const opaqueNeutralTarget = /var\(--(background|border|foreground|muted(?:-foreground)?|accent|card|sidebar)\b(?!.*,\s*transparent)/;
    const colorMixRe = /color-mix\(in oklch,\s*([^,]+),\s*([^)]+)\)/g;
    const offenders: { file: string; match: string }[] = [];

    for (const file of cssFiles) {
      const text = readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = colorMixRe.exec(text))) {
        const [full, first, second] = m;
        if (hueSource.test(first) && opaqueNeutralTarget.test(second) && !/transparent/.test(second)) {
          offenders.push({ file, match: full });
        }
      }
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });

  it('5. no raw hex/rgb() color literal inside a .tsx inline style prop (token-driven var() is fine)', () => {
    const styleBlockRe = /style=\{\{([^}]*)\}\}/g;
    const rawColorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\([\d\s.,%]+\)/;
    const offenders: { file: string; snippet: string }[] = [];

    for (const file of tsxFiles) {
      const text = readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = styleBlockRe.exec(text))) {
        if (rawColorRe.test(m[1])) offenders.push({ file, snippet: m[0] });
      }
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });
});
