import type { Doc } from './types';

export const pdfDoc: Doc = {
  "title": "PDF documents",
  "description": "Render source PDF pages, select text, edit collaboratively and assemble pages.",
  "sections": [
    {
      "id": "open",
      "title": "Open and inspect",
      "blocks": [
        {
          "kind": "code",
          "language": "typescript",
          "code": "import { openPdfDocument, PdfInterpreter, pdfTextContent } from '@tumblerjs/pdf';\n\nconst document = openPdfDocument(bytes);\nconst scene = new PdfInterpreter(document).page(0);\nconst text = pdfTextContent(scene);\nconst unchanged = document.bytes();"
        },
        {
          "kind": "text",
          "text": "The engine reads source objects and original revisions. Unchanged export returns original bytes. Supply { password } when opening an encrypted source. Canvas rendering uses source glyph geometry rather than browser text layout."
        }
      ]
    },
    {
      "id": "view",
      "title": "Use the Svelte viewer",
      "blocks": [
        {
          "kind": "code",
          "language": "svelte",
          "code": "<script lang=\"ts\">\n  import { PdfDocumentView } from '@tumblerjs/svelte/pdf';\n  import { openPdfDocument } from '@tumblerjs/pdf';\n  let { bytes }: { bytes: Uint8Array } = $props();\n  const document = $derived(openPdfDocument(bytes));\n</script>\n\n<PdfDocumentView {document} />"
        },
        {
          "kind": "text",
          "text": "The viewer supports geometric text selection and copying, page rotation and zoom. Image-only scans need OCR before they contain selectable text. Text extraction uses geometric reading order and is not complete tagged-PDF or bidirectional reconstruction."
        }
      ]
    },
    {
      "id": "edit",
      "title": "Collaborative editing",
      "blocks": [
        {
          "kind": "text",
          "text": "PdfTextModel stores recovered text and placed regions in Yjs. Initialize once on the authoritative host with imported text, persist that state, and distribute it to peers. Do not independently import on each peer. iteratePdfText yields regions a page at a time for lower-memory initialization."
        },
        {
          "kind": "text",
          "text": "PdfEditableDocument connects text input, formatting, movement, width changes, annotations, images, undo and presence. Hosts supply PdfEditingFonts, persistence and authenticated update transport. exportEditedPdf uses the same layout engine and appends a source-preserving revision."
        },
        {
          "kind": "text",
          "text": "Encrypted sources can be authenticated for viewing and copied into an editable document. Direct encryption-aware edited export is not implemented. Editing text is not secure redaction."
        }
      ]
    },
    {
      "id": "pages",
      "title": "Page operations",
      "blocks": [
        {
          "kind": "text",
          "text": "The engine and CLI support ordered extraction, deletion and merging. Page models support collaborative insertion, duplication and deletion. Assembly retains PDF page objects and resources instead of rasterizing visible content."
        },
        {
          "kind": "link",
          "href": "/docs/pdf-merge",
          "label": "Merge pages with the API, CLI or graphical tool"
        },
        {
          "kind": "link",
          "href": "/docs/cli",
          "label": "CLI page operations"
        }
      ]
    },
    {
      "id": "limits",
      "title": "Compatibility limits",
      "blocks": [
        {
          "kind": "text",
          "text": "This is an initial ISO 32000-1 implementation. Unsupported rendering content raises PdfError rather than silently dropping marks. Current gaps include Type 1 programs, predefined CJK CMaps, tiling patterns, transparency groups and soft masks, text clipping, mesh shadings and JPX/JBIG2/CCITT codecs. ICC colour uses the alternate space."
        },
        {
          "kind": "text",
          "text": "Run parsing and interpretation in cancellable workers for untrusted files. An unchanged download preserves original unsupported content. Merged documents are unencrypted and original signatures cannot authenticate the newly assembled output."
        },
        {
          "kind": "link",
          "href": "https://github.com/Kryptonote-Labs/Tumbler/blob/main/packages/pdf/README.md",
          "label": "PDF API, execution policy and measured compatibility evidence"
        }
      ]
    }
  ],
  "source": "apps/docs/src/lib/docs/pdf.ts"
};
