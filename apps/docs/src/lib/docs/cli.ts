import type { Doc } from './types';

export const cliDoc: Doc = {
  "title": "Command-line editing",
  "description": "Install the Bun CLI and use shared document operations against local files or injected hosts.",
  "sections": [
    {
      "id": "install",
      "title": "Install and discover",
      "blocks": [
        {
          "kind": "code",
          "language": "sh",
          "code": "bun add --global @tumblerjs/cli\ntumbler --help\ntumbler draft.docx --help"
        },
        {
          "kind": "text",
          "text": "Requires Bun 1.3 or later. The CLI uses the same engines as human editors for Word, spreadsheets, presentations, PDF page operations and charts. Help is generated from the supported operation registry."
        },
        {
          "kind": "code",
          "language": "sh",
          "code": "tumbler create draft.docx\ntumbler draft.docx read\ntumbler draft.docx inspect --input '{\"what\":\"styles\"}'"
        }
      ]
    },
    {
      "id": "edit",
      "title": "Read before editing",
      "blocks": [
        {
          "kind": "text",
          "text": "Use the page handle from a fresh read in edits. Unknown inputs, ambiguous matches and stale file revisions fail before writing. File hosts lock and atomically replace the target. Injected hosts enforce their own permissions, revisions, asset resolution and persistence."
        },
        {
          "kind": "code",
          "language": "sh",
          "code": "tumbler draft.docx replace --page '<handle from read>' --find 'draft' --value 'final'\ntumbler draft.docx format --help\ntumbler draft.docx edit-object --help"
        },
        {
          "kind": "text",
          "text": "Word supports stories, formatting, styles, lists, tables, drawings and ink through structured operations. Run operation-specific help for input fields, units and examples. Sheets and slides expose their native command schemas."
        }
      ]
    },
    {
      "id": "replacement",
      "title": "Exact replacement text",
      "blocks": [
        {
          "kind": "text",
          "text": "The --value flag decodes \\n, \\r, \\t and \\\\ once. Use --literal to preserve backslashes. --value-file path reads exact UTF-8 text and --value-file - reads stdin, including trailing newlines. Structured --input JSON is parsed once without additional escape decoding."
        },
        {
          "kind": "code",
          "language": "sh",
          "code": "tumbler draft.docx replace --page '<handle>' --find old --value-file replacement.txt"
        }
      ]
    },
    {
      "id": "pdf",
      "title": "PDF pages",
      "blocks": [
        {
          "kind": "code",
          "language": "sh",
          "code": "tumbler source.pdf export --pages 3,1-2 --output selected.pdf\ntumbler report.pdf pdf delete-pages --help\ntumbler first.pdf pdf merge --source second.pdf --output merged.pdf"
        },
        {
          "kind": "text",
          "text": "CLI page numbers start at 1 and ranges include both endpoints. Export writes a new file in requested order. Deletion edits in place and cannot remove every page. Merging permits repeated pages and source blocks. These operations are not redaction."
        },
        {
          "kind": "link",
          "href": "/docs/pdf-merge",
          "label": "PDF assembly and preservation"
        }
      ]
    },
    {
      "id": "charts",
      "title": "Chart inspection and editing",
      "blocks": [
        {
          "kind": "text",
          "text": "Use charts read to inspect chart parts and native source, then charts edit for revision-checked source/property changes. The CLI shares chart authoring across DOCX, XLSX and PPTX. Use command help before constructing structured edits."
        },
        {
          "kind": "link",
          "href": "/docs/charts",
          "label": "Shared chart APIs"
        },
        {
          "kind": "link",
          "href": "https://github.com/Kryptonote-Labs/Tumbler/blob/main/packages/cli/README.md",
          "label": "Complete command reference and injected-host contract"
        }
      ]
    }
  ],
  "source": "apps/docs/src/lib/docs/cli.ts"
};
