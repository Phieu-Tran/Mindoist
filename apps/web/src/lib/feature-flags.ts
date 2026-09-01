export interface FeatureFlags {
  designTokensV2: boolean;
}

type FeatureFlagEnvironment = Partial<Record<
  'VITE_DESIGN_TOKENS_V2',
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

export function resolveFeatureFlags(
  environment: FeatureFlagEnvironment,
  fallback = false,
): FeatureFlags {
  return Object.freeze({
    designTokensV2: parseFeatureFlag(environment.VITE_DESIGN_TOKENS_V2, fallback),
  });
}

export const featureFlags = resolveFeatureFlags({
  VITE_DESIGN_TOKENS_V2: import.meta.env.VITE_DESIGN_TOKENS_V2,
}, true);
