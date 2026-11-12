import type { Doc } from './types';

export const releasesDoc: Doc = {
  "title": "Release 0.1.0-alpha.27",
  "description": "All 12 packages, changes since alpha.26, and migration notes.",
  "sections": [
    {
      "id": "install",
      "title": "Install this release",
      "blocks": [
        {
          "kind": "text",
          "text": "All 12 public @tumblerjs packages share version 0.1.0-alpha.27 and publish under latest. Upgrade all installed Tumbler packages together."
        },
        {
          "kind": "code",
          "language": "sh",
          "code": "bun add \\\n  @tumblerjs/word@0.1.0-alpha.27 \\\n  @tumblerjs/sheets@0.1.0-alpha.27 \\\n  @tumblerjs/slides@0.1.0-alpha.27 \\\n  @tumblerjs/svelte@0.1.0-alpha.27 \\\n  @tumblerjs/core@0.1.0-alpha.27"
        },
        {
          "kind": "code",
          "language": "sh",
          "code": "bun add @tumblerjs/pdf@0.1.0-alpha.27\nbun add --global @tumblerjs/cli@0.1.0-alpha.27"
        }
      ]
    },
    {
      "id": "changes",
      "title": "Changes since alpha.26",
      "blocks": [
        {
          "kind": "list",
          "items": [
            "Publish the shared InkML engine, source-preserving PDF engine and Bun CLI as public packages. All 12 packages use one lockstep version.",
            "Word adds native ink, shared typed operations, section/page setup, embedded fonts, canvas rendering and progressive pagination. Improve preservation, concurrent edits and export performance.",
            "Spreadsheets add native authoring and structure commands, drawings, formula discovery and autocomplete, printable views, remote selections and headless worksheet canvas rendering.",
            "PowerPoint adds deck and slide authoring, table structure edits, notes and links, native ink, multi-object manipulation, collaboration, canvas previews and PDF export.",
            "Charts add cross-format source and property editing, related-part preservation, native pattern/picture/gradient fills, 3D geometry, manual layout, rich titles and corrected axes and labels.",
            "PDF adds rendering, selectable text, search, collaborative text formatting and annotations, page extraction/deletion/insertion/merging, images, links and bookmarks. Unsupported content still has explicit limits.",
            "CLI adds shared format operations, chart authoring, rendered inspection, registry-derived help and exact file/stdin replacement input."
          ]
        },
        {
          "kind": "link",
          "href": "/changelog/0.1.0-alpha.27",
          "label": "Full changelog"
        },
        {
          "kind": "link",
          "href": "/docs/pdf",
          "label": "PDF rendering and editing"
        },
        {
          "kind": "link",
          "href": "/docs/charts",
          "label": "Shared chart authoring"
        },
        {
          "kind": "link",
          "href": "/docs/cli",
          "label": "CLI usage"
        }
      ]
    },
    {
      "id": "migration",
      "title": "Migration notes",
      "blocks": [
        {
          "kind": "text",
          "text": "Word shapes now default to page-fixed placement in front of text. Set layout: 'inline' to retain the old default. paragraphPositioning retains direct source declarations; paragraphFormat supplies effective inherited values. Explicit resets no longer reintroduce removed formatting on export."
        },
        {
          "kind": "text",
          "text": "The shared ink decoder is now in @tumblerjs/ink. Code using internal Word ink modules should use its public exports. CLI --value interprets \\n, \\r, \\t and \\\\ once; --literal preserves backslashes and --value-file reads exact UTF-8 content."
        }
      ]
    },
    {
      "id": "qualification",
      "title": "Release qualification",
      "blocks": [
        {
          "kind": "text",
          "text": "Releases must pass package metadata validation, TypeScript, package tests, docs checks and production docs build. Pack all 12 packages and qualify the archives against the consumer. Publish only the exact qualified commit after it reaches origin/main."
        },
        {
          "kind": "text",
          "text": "The publisher sends one package at a time under latest in dependency order and skips existing versions. Verify all 12 versions and latest tags afterwards."
        },
        {
          "kind": "link",
          "href": "https://github.com/Kryptonote-Labs/Tumbler/blob/main/CONTRIBUTING.md",
          "label": "Release procedure"
        },
        {
          "kind": "link",
          "href": "/docs/compatibility",
          "label": "Format limitations"
        }
      ]
    }
  ],
  "source": "apps/docs/src/lib/docs/releases.ts"
};
