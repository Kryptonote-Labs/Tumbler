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
Table row/column operations and full Office layout and animation fidelity are
not supported.

Use [the compatibility guide](https://tumbler.alexco.dev/docs/compatibility#powerpoint)
for feature coverage, and [the implementation notes](../../docs/presentationml-implementation.md)
for preservation rules and validation commands.

See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for font and image decoder notices.
