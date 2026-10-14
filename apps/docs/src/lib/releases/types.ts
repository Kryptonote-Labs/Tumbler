export interface Release {
  version: `0.1.0-alpha.${number}`;
  date: string;
  summary: string;
  changes: readonly string[];
  registryPackage: string;
  partial?: boolean;
  commit?: string;
  previousCommit?: string;
}
