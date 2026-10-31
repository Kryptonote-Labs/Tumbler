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

Call `session.artifact.bytes()` when downloading or saving. Accessing
`artifact.document.package` also materializes the ZIP, so avoid doing either
after every keystroke or drag. Edits reparse the changed slide and reuse unchanged
scenes, images, and decoded fonts. Undo history shares unchanged package data.

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
session.execute({ name: 'insert-slide', index: 1 });
const output = session.artifact.bytes();
```

`presentationCommand` validates the serializable command union used by
`applyPresentationCommand` and `session.execute`. Commands include slide insertion,
duplication, movement and deletion; non-destructive text-frame layouts; text boxes,
preset shapes, PNG/JPEG images and tables; object duplication, deletion, alignment
and stacking order; paragraph bullets, numbering, level, spacing and vertical
alignment; background colour and literal find/replace across editable text boxes and table cells.
Existing text, formatting, object transforms and fills use the same commands.
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

`paste-object` accepts a base64 source PPTX plus `sourceSlideId`, `objectKey`, and
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
