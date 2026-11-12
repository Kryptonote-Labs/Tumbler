import type { Release } from './types';

export const novemberReleases: readonly Release[] = [
  {
    "version": "0.1.0-alpha.27",
    "date": "2026-11-12",
    "summary": "PDF, native authoring, charts and a public CLI",
    "changes": [
      "Publish the shared InkML engine, source-preserving PDF engine and Bun CLI as public packages. All 12 packages use one lockstep version.",
      "Word adds native ink, shared typed operations, section/page setup, embedded fonts, canvas rendering and progressive pagination. Improve preservation, concurrent edits and export performance.",
      "Spreadsheets add native authoring and structure commands, drawings, formula discovery and autocomplete, printable views, remote selections and headless worksheet canvas rendering.",
      "PowerPoint adds deck and slide authoring, table structure edits, notes and links, native ink, multi-object manipulation, collaboration, canvas previews and PDF export.",
      "Charts add cross-format source and property editing, related-part preservation, native pattern/picture/gradient fills, 3D geometry, manual layout, rich titles and corrected axes and labels.",
      "PDF adds rendering, selectable text, search, collaborative text formatting and annotations, page extraction/deletion/insertion/merging, images, links and bookmarks. Unsupported content still has explicit limits.",
      "CLI adds shared format operations, chart authoring, rendered inspection, registry-derived help and exact file/stdin replacement input.",
      "Migration: set Word shape layout explicitly to inline for the old default. Read effective inherited positioning through paragraphFormat rather than paragraphPositioning.",
      "Migration: CLI replacement flags decode escapes once; use --literal or --value-file for exact text. Ink decoding is owned by @tumblerjs/ink.",
      "Move the public documentation to oss.kryptonote.com. See the release guide for install commands, migration notes and validation requirements."
    ],
    "registryPackage": "opc",
    "commit": "6a626124",
    "previousCommit": "0916b3935bb6927856be7573841fb4d562213fb9"
  }
];
