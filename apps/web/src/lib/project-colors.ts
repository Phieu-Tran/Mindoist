const PROJECT_COLORS = ['indigo', 'ocean', 'jade', 'rose', 'amber'] as const;

type ProjectColor = (typeof PROJECT_COLORS)[number];

function isProjectColor(value: unknown): value is ProjectColor {
  return typeof value === 'string' && (PROJECT_COLORS as readonly string[]).includes(value);
}

export function projectColorClass(color?: string | null): string {
  return isProjectColor(color) ? `project-color-${color}` : 'project-color-default';
}
