# PresentationML implementation

Current reader, renderer, and editing coverage. For integration examples, use the [PowerPoint guide](https://tumbler.alexco.dev/docs/powerpoint).

```ts
import { openPresentationEditingSession } from "@tumblerjs/slides";
const session = openPresentationEditingSession(bytes);
const { slides, width, height } = session.artifact.document;
// Geometry uses CSS pixels at 96 DPI; commands write integer EMUs.
// session.updateObject({ slideId, objectKey, x, y, width, height });
// session.replaceText(slideId, objectKey, 'New text');
const output = session.artifact.bytes();
```

`PresentationSlideView` is available from `@tumblerjs/svelte/slides`. Its callbacks report committed edits; the host applies them and passes the resulting document back. The component keeps drag previews separate from document edits. The docs host handles file loading, slide navigation, undo, and download.

## Reading and rendering

The reader follows slide order and slide/layout/master/theme relationships, resolves basic placeholder inheritance, and retains lossless XML sources. Supported scenes include 186 preset geometries, custom paths, linear/circular gradients, outer shadows, dashed lines and arrow ends, rich text, embedded raster images, chart frames, group transforms, and tables with directly formatted cells, borders, merged cells, and all 74 built-in Office style definitions. Strict namespace handling is tested with a converted fixture, not an Office-produced Strict corpus.

## Editing and preservation

Supported slide-local objects can be moved, resized, and rotated, including children of scaled or rotated groups. Placeholders with inherited geometry receive a local transform override without changing the shared layout. Native ink and its picture fallback move together. Rotation is optional in updateObject and uses clockwise degrees. Resizing follows the local axes and preserves the opposite anchor, including on flipped shapes.

Edits reparse only the changed slide and share unchanged scenes, images, and decoded fonts. Package bytes are generated lazily by `artifact.bytes()` or access to `artifact.document.package`; call these for export rather than after every pointer or text edit. Undo history retains changed XML parts instead of a complete ZIP per edit.

The legacy replaceText command requires one ordinary text run. Range-based editText and formatText commands support ordinary rich-text paragraphs, preserving unaffected run properties. Hyperlinks, explicit line breaks, autofit settings, animation timing, and Office extension metadata are preserved during edits.

Fields, shared master/layout objects, signed packages, SmartArt cached drawings, and unknown alternate representations remain read-only. Table row/column insertion and deletion, SmartArt relayout, exact Office text layout, 3D effects, uncommon patterns, and advanced animation timing need further work.

Text rendering includes common numbered bullets, baseline offsets, character spacing, capitalization, fixed line spacing, and safe external/internal hyperlinks. Notes are exposed on each slide. Vertical and multi-column text use browser layout and require further Office comparison. Consult each slide's diagnostics and each object's capabilities instead of assuming an object is editable.

No-op exports return the original bytes. Edits replace only the owning slide XML. Other part payloads stay unchanged. ZIP directory records are omitted on edited saves, as required by the OPC producer rules.

## Fixtures and validation

Run `bun run compatibility:presentations` to regenerate the four original MIT-licensed PPTX examples under `apps/docs/static/samples`. The generator corrects PptxGenJS 4.0.1's duplicate table IDs, notes-master ordering, repeated paragraph properties, and an extra 2D chart axis reference before distributing fixtures. It also adds a group with a non-identity coordinate transform.

Validation:

- `bun test packages/slides packages/opc`
- `bun run docs:check`
- `bun run --cwd apps/docs test:e2e presentations.e2e.ts`
- `python3 scripts/validate-presentation-schemas.py` uses lxml and the local ECMA schema archive fetched by `bun run references:fetch`.
- `bun run compatibility:openxml -- apps/docs/static/samples/*.pptx` requires .NET and performs additional Open XML SDK validation.

Schema validation and browser tests do not establish PowerPoint or LibreOffice interoperability. Those application checks remain release gates. See [the original standards research](presentationml-first-milestone.md) for the baseline and initial plan.

## Svelte interaction

`PresentationSlideRail` from `@tumblerjs/svelte/slides` accepts a presentation and bindable `index`. It provides live thumbnails, keyboard navigation, and viewport-based thumbnail mounting. The docs playground places it beside the active slide.

In-place editing uses the same text renderer as preview. `PresentationSlideView` accepts `ontextedit`, `onformat`, `onshapechange`, and `onundo` callbacks. Connect them to the corresponding session methods. The reusable presentation toolbar uses `FormattingToolbar`, the same component as the Word editor. Formatting applies to the selected range, or the entire selected text box outside text-editing mode. With a collapsed caret, text formatting applies to the next inserted text. Enter inserts a paragraph; Ctrl+Enter or Escape leaves text editing. Paste inserts plain text.

`editText` and `formatText` use UTF-16 offsets over paragraph text joined with newline characters and reject ranges that split grapheme clusters. `styleShape` sets solid fill, outline colour, or outline width in points. Use `none` for transparent fill or no outline. Setting a solid fill replaces a gradient. Only the edited slide part is rewritten.

The viewer provides eight resize handles and a rotation handle. Hold Shift while rotating to snap to 15-degree increments. Focus the rotation handle and use arrow keys for one-degree steps, Shift for 15-degree steps, or Home to reset. Escape cancels a drag.

Table cells use `editText` and `formatText` with an optional zero-based `cell: { row, column }` address. Merged cells are edited through their anchor cell. Resizing a table updates its native column widths and row heights while retaining font sizes, styles, and merge flags. The Svelte viewer supports in-place cell editing, the shared formatting toolbar, Tab/Shift+Tab navigation, and whole-table movement and resizing. Recognized Office modification IDs are refreshed on edits; unsupported extensions that affect an edit still restrict that operation.

## Drawing and media coverage

New rendering coverage includes theme overrides, saved normal-autofit spacing and overflow, browser-measured fitting, custom tabs, distributed alignment, script-specific fonts, embedded EOT/OpenType fonts, SVG/BMP and supported EMF/WMF images, tiled picture fills, common hatch patterns, glow, inner shadows, blur, soft edges, and reflections. The shared chart renderer supports stacked, percentage-stacked, and column/line combination plots, including secondary value axes.

Embedded media uses browser controls. External media requires an explicit load action. Supported fade, appear, and wipe animations expose playback controls; fade/wipe and entering push/cover transitions are previewed. SmartArt can display its saved drawing but does not recompute layout or fully resolve semantic text styles. Compressed font decoding uses mtx-decompressor and metafile decoding uses rtf.js; see [third-party notices](../packages/slides/THIRD-PARTY-NOTICES.md).

Run `bun run compatibility:presentation-rendering` to regenerate `rendering-checks.pptx`. Full timing-tree execution, media synchronization, upright reflections on rotated shapes, 3D lighting/bevels, and complete WordArt/vertical typography are still outstanding. Preview tests are not an Office interoperability certification.

Validate generated decks with `bun run compatibility:openxml apps/docs/static/samples/rendering-checks.pptx` using .NET 8 and the Microsoft Open XML SDK. This checks semantic constraints, including the single animation timing root, that the XSD-only validator misses. Passing either validator does not replace opening the deck in PowerPoint.

The rendering deck uses a six-second H.264/MP4 motion clip with a matching poster. Regenerate it with `bash scripts/generate-presentation-video.sh` using FFmpeg and DejaVu Sans, then regenerate the deck. The tiny green WebM remains a separate browser playback test fixture.
