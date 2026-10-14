export type Block =
  | { kind: 'text' | 'note'; text: string }
  | { kind: 'code'; code: string; language?: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'link'; href: string; label: string }
  | { kind: 'table'; headers: string[]; rows: string[][] };

export interface Doc {
  title: string;
  description: string;
  sections: { id: string; title: string; blocks: Block[] }[];
  source: string;
  next?: { href: string; label: string };
}
