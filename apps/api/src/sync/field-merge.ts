export interface FieldVersion {
  value: unknown;
  at: string;
}

export type FieldVersions = Record<string, string>;

export interface FieldMergeResult {
  accepted: Record<string, unknown>;
  fieldVersions: FieldVersions;
  conflicts: Array<{ field: string; rejected: string; kept: string }>;
}

/** Apply a v3 per-field LWW patch while keeping v2 row-level sync intact. */
export function mergeFieldPatch(
  patch: Record<string, FieldVersion>,
  currentVersions: FieldVersions = {},
  fallbackAt: string,
  allowedFields: readonly string[],
): FieldMergeResult {
  const accepted: Record<string, unknown> = {};
  const fieldVersions = { ...currentVersions };
  const conflicts: FieldMergeResult['conflicts'] = [];
  const allowed = new Set(allowedFields);

  for (const [field, change] of Object.entries(patch)) {
    if (!allowed.has(field) || !change || typeof change.at !== 'string') continue;
    const currentAt = fieldVersions[field] ?? fallbackAt;
    if (new Date(change.at).getTime() > new Date(currentAt).getTime()) {
      accepted[field] = change.value;
      fieldVersions[field] = change.at;
    } else {
      conflicts.push({ field, rejected: change.at, kept: currentAt });
    }
  }

  return { accepted, fieldVersions, conflicts };
}
