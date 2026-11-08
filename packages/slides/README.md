# @tumblerjs/slides

Read and edit PowerPoint `.pptx` files without a UI framework.

```sh
bun add @tumblerjs/slides
```

## Open a presentation

```ts
import { openPresentationArtifact } from "@tumblerjs/slides";

const bytes = new Uint8Array(await file.arrayBuffer());
const artifact = openPresentationArtifact(bytes);
const { slides, width, height } = artifact.document;
```

Slides are in presentation order. Each slide exposes its objects, notes, and
diagnostics. Check object capabilities before enabling an editing control.
Geometry uses CSS pixels at 96 DPI; saved transforms use native OOXML units.

## Native authoring and incremental opening

Compile a presentation once when importing it to keep ordinary edits independent
of XML parsing and ZIP export:

```ts
import {
  importNativePresentation,
  createPresentationNativeArchive,
  openPresentationNativeArchive,
  PresentationEditingSession,
} from "@tumblerjs/slides";

const native = importNativePresentation(artifact);
const session = new PresentationEditingSession(native);
const archive = createPresentationNativeArchive(session.artifact);
const restored = openPresentationNativeArchive(archive);
```

The archive separates its manifest, compiled slide blocks, content-addressed
binary resources and lossless OPC preservation. Hosts can persist these blocks
in their own database. Supported commands update immutable native models; calling
`.bytes()` exports a PPTX through the lossless writers. Untouched export returns
the original bytes. Unknown markup, transitions, animations and unrelated package
members stay preserved without implying additional playback support.

`createPresentationNativeView` omits export history and preservation. Open its
manifest with only the selected entry in `slides` and `allowPendingResources: true`
to render and edit that slide before media arrives. Other slide descriptors remain
available for navigation, but their models must load before editing or searching
their content. Load resources by `presentationSlideResources(model)` hashes and
attach them with `native.hydrateResources(resources, slideIds)` and use the returned
artifact. This resolves pending handles
without replacing current text or geometry. Export requires the complete preserved
source; a partial view alone cannot generate a PPTX.

`encodePresentationNativeState` supports local branch recovery without forcing
preservation to load; `{ includeResources: false }` retains resource references
instead of repeating media in every baseline. Hosts remain responsible for
authorization, block integrity, durable operation receipts and synchronization.

## Apply edits with undo and redo

```ts
import { openPresentationEditingSession } from "@tumblerjs/slides";

const session = openPresentationEditingSession(bytes);
const slide = session.artifact.document.slides[0];
const object = slide?.objects.find(object => object.movable);
if (slide && object) {
  session.updateObject({
    slideId: slide.id,
    objectKey: object.key,
    x: object.transform.x + 16,
    y: object.transform.y,
    width: object.transform.width,
    height: object.transform.height,
  });
  session.undo();
  session.redo();
}
const output = session.artifact.bytes();
```

`updateObject` changes position, dimensions, or rotation in clockwise degrees.
Use `editText` for text ranges, `formatText` for text formatting, and `styleShape`
for solid fill and outline changes. Table text commands accept a zero-based
`cell: { row, column }` address. Edit merged cells through their anchor cell.

A session records each command as an undoable revision. Read `session.artifact`
after a command and pass its document back to your renderer. `canUndo`, `canRedo`,
and `dirty` expose history state.

## Use the Svelte editor

Import `PresentationSlideView`, `PresentationSlideRail`, and
`PresentationFormattingToolbar` from `@tumblerjs/svelte/slides`.
The view emits edit callbacks; your application applies them to the session.
The rail provides thumbnail navigation through a bindable `index`.
Corner resizing preserves picture proportions; Shift preserves proportions for
other objects. Side handles resize freely. `resizeSlideTransform` exposes the
same corner constraint through `{ preserveAspectRatio: true }` as its fifth argument.

See the [PowerPoint guide](https://tumbler.alexco.dev/docs/powerpoint) for complete
viewer, navigation, editing, and download examples.

## Save

Call `session.artifact.bytes()` when exporting a PPTX. For native persistence,
store the native archive instead. Accessing `artifact.document.package` also
materializes the package, so avoid doing either after every keystroke or drag.
Native edits update compiled models. Editing an original OOXML artifact reparses
the changed slide and reuses unchanged scenes, images, and decoded fonts.
Undo history shares unchanged document data.

No-op export returns the original bytes. Changed slides retain unrelated XML
and package parts, including supported Office extension metadata.

## Compatibility

Slide-local objects can remain editable with inherited geometry or inside
transformed groups. Shared master/layout objects, fields, signed packages,
SmartArt cached drawings, and unknown alternate representations remain restricted.
Full Office layout and animation fidelity remain incomplete.

Use [the compatibility guide](https://tumbler.alexco.dev/docs/compatibility#powerpoint)
for feature coverage, and [the implementation notes](../../docs/presentationml-implementation.md)
for preservation rules and validation commands.

See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for font and image decoder notices.

## Author a deck

```ts
import { createPresentation, PresentationEditingSession } from '@tumblerjs/slides';
const session = new PresentationEditingSession(createPresentation());
const slideId = session.artifact.document.slides[0]!.id;
session.execute({ name: 'layout', slideId, layout: 'title-content' });
session.execute({ name: 'insert-slide', index: 1, layoutSourceId: slideId });
const output = session.artifact.bytes();
```

`presentationCommand` validates the serializable command union used by
`applyPresentationCommand` and `session.execute`. Commands include slide insertion,
duplication, movement, deletion and visibility; non-destructive text-frame layouts; text boxes,
preset shapes, PNG/JPEG images and tables; object duplication, deletion, alignment
and stacking order; paragraph bullets, numbering, level, spacing and vertical
alignment; background colour and literal find/replace across editable text boxes and table cells.
Existing text, formatting, object transforms and fills use the same commands.
`set-slide-hidden` accepts `slideId` and `hidden: boolean`. Hidden slides remain
editable and retain their content, but slideshow navigation skips them. The state
is saved in the PPTX slide's native `show` attribute.
A complete command is one undo step. Images carry original bytes as base64.

Coordinates are CSS pixels at 96 DPI. Text font sizes and paragraph before/after
spacing are points; line spacing is a multiplier. Table insertion creates an
editable rectangular grid. Layouts
position existing editable text frames and add missing ones without deleting
other content or rewriting shared masters. Duplicated slides share immutable
resources and start without notes. Group children can be edited or deleted;
object duplication and arrange commands currently require top-level objects.

New decks include a master, blank layout and shared Office theme. Imported Strict
and Transitional decks retain their existing conformance. Structural commands
retain unrelated package part payloads. Detached parts are retained when deleting
slides so existing package relationships never become dangling.

`paste-object` accepts a base64 source PPTX or encoded native archive plus `sourceSlideId`, `objectKey`, and
the destination `slideId`. It preserves the selected top-level object's markup,
formatting, resource bytes and relationships. Source and destination must use the
same Strict/Transitional conformance. Keep the source snapshot before deleting
an object to implement cut/paste safely. `inspectPresentation` returns compact
slide/object addresses, text, table cells and geometry for agents.

Hosts can set `toolbar={false}` on `PresentationSlideView` to supply a ribbon.
Bind the component instance and call `applyFormatting(patch)` to retain caret
formatting and selected text ranges. `currentSelection()` returns the active
object, cell and range for paragraph commands. `onselectionchange` reports the
active text target and resolved formatting state, including pending caret styles.

`edit-table` inserts/deletes rows or columns and merges/splits rectangular cell
ranges. `row` and `column` are zero-based; merge also accepts `endRow` and
`endColumn`. Inserting through a merged region expands it. Deleting an anchor
row/column keeps its text when the merge still has surviving cells. Merging
retains visible cell paragraphs in reading order; splitting keeps that content
in the anchor and creates empty cells. Partial selections of merged cells are
rejected. Tables retain at least one row and column. New tables include visible
cell borders; existing table styles and unrelated package parts are retained.

### Canvas previews

`paintPresentationSlide(context, document, slide, { path, image, prepareFont, scale })`
paints static slide content on browser or server Canvas 2D. Hosts provide their Path2D
constructor, decode the pictures returned by `presentationSlideImages(slide)`, and encode
the resulting canvas. Backgrounds, object transforms, shape geometry, styled text,
tables and supported chart scenes share the headless document model. Empty placeholders
paint no editor prompts. The painter does not change the document.

This preview path has basic paragraph wrapping and anchoring. It does not yet reproduce
all browser text layout, decorative effects, picture tiling or pattern fills. Interactive
editing and playback remain in the Svelte view.

`findVisibleSlideIndex(slides, start, direction)` finds a non-hidden slide at or beyond `start` in either direction (`1` or `-1`). It returns `undefined` at the deck boundary, including empty or all-hidden decks. Use it for slideshow entry and navigation; editing still includes hidden slides.

### Rebasing hosted edits

`rebasePresentationCommands(base, current, commands, intervening)` reapplies a pending local branch
on a newer artifact. The host must supply all accepted intervening commands from the
base revision through the current revision, including commands inside batches. This
provenance prevents edits from targeting deleted objects whose numeric OOXML keys were reused.
If history includes snapshot-restoring undo, retain a conflict rather than guess its lineage.
It returns canonical commands and the resulting artifact. It
keeps generated slide/object identities consistent through the branch, follows slide
order anchors, preserves independent geometry properties, and translates text ranges
through unchanged text spans. Same-property writes follow acceptance order.
Overlapping text replacements, missing targets and destructive structural overlaps
throw `PresentationRebaseConflict`; the host must keep the original branch for recovery.
This is conservative three-way rebasing, not character-identity collaboration. Equivalent insertion positions in repeated text use the earliest matching boundary.
Replace-all retains the original branch's match set, excluding matches added remotely.

Only rebase after the host knows a write was rejected. An interrupted response may
have been accepted and must first replay its original operation ID and intent.
## Finding text

`findPresentationMatches(document, query, { matchCase, wholeWord, locale })` returns individual occurrences with slide ID, object key, optional table cell, UTF-16 start/end offsets and editability. It uses the same Unicode normalization, grapheme boundaries and word segmentation as Word. Master content can be found without making it editable.

The `replace-all` command accepts `wholeWord` alongside `caseSensitive`. Replacements address each editable text box or cell and apply in reverse offset order, preserving unaffected formatting.

`PresentationSlideView` accepts `searchMatches` and `currentSearchMatch` from that API. It paints occurrences through the CSS Highlight API without changing slide markup, selection or formatting. The current match is distinguished from the other occurrences.

`presentationThemeColours(document, slideId)` exposes the selected slide's effective palette, including layout/slide theme overrides and colour-map remapping. Use it for colour pickers so previews and applied palette colours agree with slide rendering. It returns the default Office palette for presentations without a theme and rejects unknown slide IDs.

New slides use the referenced slide's layout and master, with empty editable placeholders and
inherited formatting. Without `layoutSourceId`, insertion uses the preceding slide, or the first
slide when inserting at the beginning. A title layout advances to the master's second layout;
when no different layout is available, it uses Title and Content. Blank layouts stay blank.
Use `sourceId` instead to duplicate the slide and its content. The two source options are mutually
exclusive. Applying a built-in authoring layout also saves its reusable layout relationship.

### Native ink

`insert-ink` accepts `slideId`, `points` as `[x, y, pressure]` samples in slide CSS
pixels, a `#RRGGBB` `color`, positive pen `size` in points, and optional `highlighter`.
Pressure ranges from zero to one. A command creates one independently selectable
ink object, including stationary taps and horizontal or vertical strokes.

The shared `@tumblerjs/ink` engine supplies the same calibrated Office InkML and
pressure interpretation as Word. Slides store an InkML content part and an
`mc:AlternateContent` picture fallback. Supported ink paired with a picture fallback
renders as vectors. Unsupported ink retains its original cached picture and source.
Moving, resizing, rotating, arranging, duplicating and copying operate on the whole
alternate-content object. Resizing refreshes its cached PNG without modifying a
sibling's shared resource. `presentationInkPoints(object)` returns sample centres
in slide coordinates for hit testing, and `inspectPresentation` exposes traces to agents.

Rounded rectangles accept `cornerRadius` in CSS pixels on `insert-object` shapes and `style-shape` commands. Radii are stored as native DrawingML `adj` values, clamped to half the shorter side. Omission on insertion uses the preset default of 16.667%. `SlideObject.cornerRadius` reflects the evaluated adjustment, and resizing scales the stored proportion. Other shape geometries reject radius edits.

The rounded-rectangle default and radius bounds follow `roundRect` in `presetShapeDefinitions.xml`, distributed with [ECMA-376 Part 1](https://ecma-international.org/wp-content/uploads/ECMA-376-1_5th_edition_december_2016.zip).

Normal text autofit uses the font scale and line spacing saved in the PPTX.
Renderers do not shrink overflowing text again to fit its box. Oversized text
retains its authored size and vertical alignment, matching PowerPoint's saved
layout even when that places text outside the slide. Explicit horizontal and
vertical clipping still constrain their respective axes to the text box.

### Slide backgrounds

`set-background` writes native slide fills. Use `fill.kind` of `solid`, `gradient`,
`picture`, `pattern`, or `inherit`. Gradient stops have offsets in [0, 1], RGB
colours and optional opacity. Linear gradients accept an angle in degrees and
`scaled`; radial and rectangular gradients accept a normalized `center`, the point
where the first stop sits. Pictures accept base64
PNG/JPEG bytes, opacity, normalized crop edges and optional tile scale/offset/flip.
`backgroundPatterns` lists authorable presets. `inherit` removes the slide override
and restores the layout/master background. The existing `background` colour command
remains supported. Group commands in a `batch` to apply to all slides in one undo.

These fills use ECMA-376-1 §19.3.1.2 and §§20.1.8.14, 20.1.8.33, 20.1.8.47.
Unrelated slide XML and package parts are preserved. Shape-path gradients are read and drawn as rectangular;
advanced picture effects and uncommon pattern presets remain outside authoring coverage.

Shape fills accept a hex colour, `"none"`, or a native gradient through
`style-shape` and `artifact.styleShape`:

```ts
session.execute({
  name: "style-shape",
  slideId,
  objectKey,
  fill: {
    kind: "gradient",
    type: "linear",
    angle: 45,
    stops: [
      { offset: 0, color: "#172554" },
      { offset: 1, color: "#fbcfe8", opacity: 0.5 },
    ],
  },
});
```

Use `type: "radial"` or `"rectangular"` with an optional `center: [x, y]` in the range 0–1.
Stops are sorted by offset on write. Changing the fill replaces the previous
fill while retaining geometry, text, and outline.

## Place shapes from pointer gestures

`shapePlacement(start, end, shape, constrain, frame)` resolves a drag in slide
coordinates into `{ bounds, rotation }`. Points should be clamped to the slide.
It supports every authored `ShapeGeometry`, reverse drags, equal proportions for
shapes, and 45-degree angle snapping for lines. Constrained drags stay within the
supplied slide frame.

`placedShapeCommand(artifact, slideId, shape, placement)` returns a validated
`{ command, objectKey }` without changing the artifact. Execute `command` once and
select `objectKey` after success. Rotated lines use a batch so insertion is one
undoable edit and no intermediate unrotated line is published. Command preparation
can throw for invalid targets, invalid dimensions, or signed presentations; hosts
should display these errors through the same path as other editing failures.

The optional Svelte `PresentationShapePlacement` component handles pointer input
and previews through the slide view's overlay hook.

Speaker notes, links and picture metadata use the same semantic commands as the editor and CLI. Use `set-notes` with `slideId` and `notes`; `set-link` with `slideId`, `objectKey` and `href` links a shape, or add `start` and `end` for a text range. An empty `href` removes the link. `set-alt-text` updates `alt`, and `replace-picture` accepts base64 `data` and PNG/JPEG `contentType` while retaining the picture frame and crop.

## Format painter and table formatting

`presentationFormatPainterSample(object, offset, cell)` captures resolved text and shape
formatting. `presentationFormatPainterCommands(sample, slideId, object, range, cell)`
returns semantic commands that keep destination text and geometry.

The `format-table` command accepts a cell coordinate and `cell`, `row`, `column` or
`table` scope. It updates fill, individual borders, vertical alignment and padding
without replacing text or merged geometry. Padding and border widths use CSS pixels.
