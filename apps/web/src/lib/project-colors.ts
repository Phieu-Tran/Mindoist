import { hues, legacyProjectColorAliases, type Hue } from '@mindoist/design-tokens';

type ProjectColor = Hue | 'ocean';

function isProjectColor(value: unknown): value is ProjectColor {
  return value === 'ocean' || (typeof value === 'string' && (hues as readonly string[]).includes(value));
}

export function canonicalProjectColor(color?: string | null): Hue | null {
  if (!isProjectColor(color)) return null;
  return (legacyProjectColorAliases[color as keyof typeof legacyProjectColorAliases] ?? color) as Hue;
}

export function projectColorClass(color?: string | null): string {
  return isProjectColor(color) ? `project-color-${color}` : 'project-color-default';
}
