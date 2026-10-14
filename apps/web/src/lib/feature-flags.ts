export type UiKitName = 'legacy' | 'heroui';

export interface FeatureFlags {
  designTokensV2: boolean;
  /** Environment default component kit; users can override it in Settings. */
  uiKitDefault: UiKitName;
  /** Whether Settings shows the UI kit switcher on this environment. */
  uiKitSwitcher: boolean;
}

type FeatureFlagEnvironment = Partial<Record<
  'VITE_DESIGN_TOKENS_V2' | 'VITE_UI_KIT' | 'VITE_UI_KIT_SWITCHER',
  string | boolean | undefined
>>;

export function parseFeatureFlag(value: string | boolean | undefined, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value == null || value.trim() === '') return fallback;

  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      return fallback;
  }
}

export function parseUiKitName(value: string | boolean | undefined, fallback: UiKitName = 'legacy'): UiKitName {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === 'legacy' || normalized === 'heroui' ? normalized : fallback;
}

export function resolveFeatureFlags(
  environment: FeatureFlagEnvironment,
  fallback = false,
): FeatureFlags {
  return Object.freeze({
    designTokensV2: parseFeatureFlag(environment.VITE_DESIGN_TOKENS_V2, fallback),
    uiKitDefault: parseUiKitName(environment.VITE_UI_KIT),
    uiKitSwitcher: parseFeatureFlag(environment.VITE_UI_KIT_SWITCHER, true),
  });
}

export const featureFlags = resolveFeatureFlags({
  VITE_DESIGN_TOKENS_V2: import.meta.env.VITE_DESIGN_TOKENS_V2,
  VITE_UI_KIT: import.meta.env.VITE_UI_KIT,
  VITE_UI_KIT_SWITCHER: import.meta.env.VITE_UI_KIT_SWITCHER,
}, true);
