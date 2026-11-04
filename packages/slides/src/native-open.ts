import type { PresentationArtifact } from './artifact.ts';
import type { OpenPresentationOptions } from './model.ts';
let reader:
  | ((bytes: Uint8Array, options: OpenPresentationOptions) => PresentationArtifact)
  | undefined;
/** Register the native decoder without coupling the OOXML artifact class to its native subclass. */
export function registerPresentationNativeReader(value: NonNullable<typeof reader>) {
  reader = value;
}
export function readNativePresentation(bytes: Uint8Array, options: OpenPresentationOptions) {
  if (!reader)
    throw new Error('Import the native presentation engine before opening native archives.');
  return reader(bytes, options);
}
