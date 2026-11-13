import type { ExampleId } from '$lib/examples/registry';

/** Text, note, list and table cells accept `backticks` for inline API identifiers. */
export type Block =
  | { kind: 'text' | 'note'; text: string }
  | { kind: 'code'; code: string; language?: string }
  /** `ordered` numbers the items, for steps that must happen in sequence. */
  | { kind: 'list'; items: string[]; ordered?: boolean }
  | { kind: 'link'; href: string; label: string }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  /** A live preview paired with its source; see $lib/examples/registry. */
  | { kind: 'example'; example: ExampleId };

export interface Doc {
  title: string;
  description: string;
  sections: { id: string; title: string; blocks: Block[] }[];
  source: string;
  next?: { href: string; label: string };
}
