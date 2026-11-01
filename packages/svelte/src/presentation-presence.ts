/** Coordinates address document text, including paragraph separators and excluding bullets. */
export interface PresentationRemoteSelection {
  id: string;
  name: string;
  color: string;
  objectKeys: readonly string[];
  text?: {
    objectKey: string;
    start: number;
    end: number;
    head?: number;
    cell?: { row: number; column: number };
  };
}
