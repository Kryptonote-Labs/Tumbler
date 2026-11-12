# Hosting a read-only Word viewer

`WordDocumentView` reports `onlayoutchange` and `onviewportchange` snapshots.
Use `bind:this` with the exported `WordViewHandle` type for `fit("width")`,
`fit("page")`, and asynchronous `scrollToPage(index)`. The viewer still supports
`bind:scale` and `focusEditor()`.

The complete [WordReader example](../packages/svelte/examples/WordReader.svelte)
accepts a parsed `wordDocument` prop, renders read-only content, and supplies fit,
previous/next, and page status controls. Give its parent a definite height.
It does not query the viewer's internal elements.

Layout snapshots contain the document identity, completion flag, page count through `pages.length`,
each page's top offset and width/height, and total surface dimensions. Dimensions are unscaled CSS
pixels, converted from the existing Word layout's points. Viewport snapshots contain
scaled scroller dimensions, scroll positions, scale, current page, and intersecting
page indexes. All indexes are zero-based. Intersecting pages exclude virtualization
overscan; they are undefined when no page intersects. Current page is the first
page whose bottom lies below the viewport top, or the last page after the document.
Snapshots and page summaries are frozen. They describe geometry, not layout progress.

Callbacks run after Svelte applies geometry changes, including scrolling, zoom,
reflow, and width or height resizing. A layout callback runs when pagination changes;
a viewport callback also runs when scroller geometry changes. Retain snapshots as
values. Use their `document` identity to ignore status from a replaced document.

Fit uses the widest page for width and the largest page dimensions for page fit,
including the viewer's 24-pixel unscaled outer gaps. Scale is clamped to the existing
0.25–3 gesture range. Fit persists across resizing, reflow, and document replacement.
A gesture or a different externally supplied scale exits fit mode. Explicit page
scrolling retains fit. Read-only document replacement resets both scroll axes to the start. Editable
revisions retain the current surface until pagination finishes and preserve both
scroll axes, subject to browser clamping. To reset navigation when opening a new
file in an editor, key the component by the file identity. Reflow of the same
document retains its scroll position.

Fit returns false before geometry is ready, for empty documents, or for a zero-sized
host. Call it from `onlayoutchange` or a toolbar after mounting. Page scrolling
waits for pending DOM updates and returns false for unavailable geometry or a
non-integer/out-of-range index. It works for pages outside the mounted virtual window.

The state types are exported from both `@tumblerjs/svelte/word` and
`@tumblerjs/svelte`.

## Pagination and fonts

Geometry callbacks carry the originating document and the progressive paginator's
completion flag. Page counts and total dimensions are provisional while
`complete` is false. The example displays a plus sign for provisional page counts.
Use `onlayoutprogress` for pagination work and `onlayouterror` for failures;
geometry callbacks remain separate from these signals.

The example accepts the font loader's optional `fontContext` and forwards it to
the viewer. Keep the context alive while its faces are in use. Font settlement
restarts pagination using the same resolver for measurement and painting, while
cancelling the previous job. Replaced documents and contexts ignore stale font
completion.
