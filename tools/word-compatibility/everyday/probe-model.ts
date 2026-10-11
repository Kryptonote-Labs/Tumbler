import type { Status } from '../model.ts';
export interface TaskProbe {
  readonly id: string;
  readonly status: Exclude<Status, 'untested'>;
  readonly detail: string;
  readonly definitionHash: string;
  readonly artifacts: readonly { readonly path: string; readonly sha256: string }[];
}
