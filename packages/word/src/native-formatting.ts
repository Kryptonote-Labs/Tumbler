import type { WordTextFormat, WordTextRun } from './create.ts';

/** Omit a key to preserve it, set a value to override it, or use null to restore style inheritance. */
export type WordNativeFormatPatch = { readonly [Key in keyof WordTextFormat]?: WordTextFormat[Key] | null };

/** Patch a complete authored run format, such as importWordContent returns. Null restores inheritance on export too. */
export function patchWordRunFormat(run: WordTextRun, patch: WordNativeFormatPatch): WordTextRun {
  const format = { ...run.format };
  for (const key of Object.keys(patch) as (keyof WordTextFormat)[]) {
    const value = patch[key];
    if (value === null) delete format[key];
    else if (value !== undefined) Object.assign(format, { [key]: value });
  }
  return { ...run, format, ...(Object.values(patch).includes(null) ? { resetFormat: true } : {}) };
}
