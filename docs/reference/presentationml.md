# PresentationML reference

Primary source: ECMA-376 Part 1 §§13 and 19. The informative primer is Annex
L.3. PowerPoint-specific extensions are documented in
[[MS-PPTX]](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-pptx/baa5ff29-d315-43ed-ac03-cf6c10baea59).

## Package shape

The package office-document relationship targets the Presentation part, commonly
`/ppt/presentation.xml`. The presentation contains ordered relationship-backed
lists for slides and masters plus presentation-wide sizes and properties.

Typical graph:

```text
Presentation
├── slide masters
│   ├── slide layouts
│   └── themes
├── slides
│   ├── slide layout
│   ├── notes slide
│   ├── comments
│   ├── images/media
│   └── charts/diagrams/embedded objects
├── notes master
├── handout master
├── presentation properties
└── view/table-style/comment-author related parts
```

Each slide is its own part. Slide ordering comes from the presentation's slide
ID list, not lexical file paths. Relationship IDs and persistent numeric IDs are
different identities.

## Master, layout, and slide inheritance

The main visual chain is:

```text
theme ← slide master ← slide layout ← slide
```

A slide normally relates to a layout; a layout relates to a master; a master
relates to a theme. Placeholders and formatting can inherit through this chain.
Slide-level shapes may override or replace inherited placeholders.

Rendering a slide in isolation without resolving this chain will omit background,
theme, master graphics, placeholders, and default text behavior.

Keep source layers separate even after computing the final scene. Editing a
slide placeholder should not flatten the whole master/layout result into the
slide part.

## Common slide data and shape tree

A slide's common slide data contains a shape tree. Common children include:

- non-visual group properties;
- group transform properties;
- ordinary shapes;
- grouped shapes;
- graphic frames containing tables, charts, or diagrams;
- connectors;
- pictures;
- content/connection controls and extension-defined objects.

Non-visual properties carry IDs and names. IDs must be unique in the required
scope. Copying a shape or slide requires deliberate rebinding of IDs and
relationships.

## Shapes and transforms

A shape combines:

- non-visual metadata;
- transform and geometry;
- fill, line, effects, and style references;
- optional text body.

Transforms include position, extent, rotation, flips, and group coordinate
mapping. Group shapes have both an outer transform and a child coordinate space.
Nested transform composition needs matrix-based tests; adding offsets manually
will fail under rotation, flips, and non-uniform group scaling.

Geometry can be preset or custom. Preset geometry uses named shapes and optional
adjustment values. Custom geometry can define guides, paths, connection sites,
and text rectangles.

## Text

Presentation text lives inside a DrawingML text body and is arranged into
paragraphs and runs. Formatting can derive from:

- explicit run and paragraph properties;
- shape text-body/list-style properties;
- placeholder and layout properties;
- master text styles;
- theme fonts and colors;
- presentation defaults.

Text behavior includes margins, vertical anchoring, wrapping, columns, rotation,
autofit, bullet/numbering, line spacing, paragraph spacing, tabs, and language.

Autofit is especially important: PowerPoint can shrink text, resize a shape, or
leave overflow depending on settings. Browser text metrics and font substitution
make this a visual compatibility hotspot.

## Placeholders

Placeholders associate content with layout/master roles such as title, body,
date, footer, slide number, or picture. Matching can involve placeholder type and
index.

Deleting visible placeholder content is not always equivalent to deleting the
shape. The layout may continue to provide a placeholder. Editing and inheritance
logic should preserve the distinction between inherited placeholder geometry,
inherited formatting, and slide-local content.

## Backgrounds, themes, and color maps

A slide background can be explicit or inherited. Theme scheme colors pass
through color mappings that can differ at master/layout/slide levels. A shape
style can reference theme fill, line, effect, and font schemes.

Keep source color expressions separate from computed sRGB output. Writing the
computed color back would sever theme behavior.

## Pictures and media

Pictures reference image parts through relationships and add crop, stretch,
transform, transparency, and effects. Linked images use external relationships
and require policy-controlled loading.

Audio, video, OLE objects, and embedded packages should initially be inert,
recognized, and preserved. Preview affordances must not cause execution or
automatic external fetching.

## Tables, charts, and diagrams

A graphic frame can host DrawingML tables, charts, or diagrams. Each has distinct
related parts and source semantics.

- Tables are directly represented through DrawingML table structures.
- Charts use chart parts and can include cached series/category data.
- Diagrams combine data, layout, color, and style parts and can also carry a
  fallback drawing representation.

These can progress from placeholder rendering to native rendering without being
discarded during unrelated shape edits.

## Notes, comments, transitions, and timing

Slides can relate to notes slides. Presentations can have notes and handout
masters. Comments use author-related metadata and may have newer extension forms.

Transitions and animations/timing are separate semantic systems. Initial support
should recognize and preserve them. Reordering or deleting shapes can still
affect timing references, so structural commands must either update understood
references or block unsafe operations.

## SVG-oriented rendering

Slides are naturally represented as a scene graph. A likely rendering stack is:

```text
SVG scene
├── master/layout layers
├── slide shapes and pictures
├── clipping and effects
└── hit-testable object identities

HTML overlays
├── active text editor
├── selection handles and guides
└── contextual host UI
```

SVG provides structured geometry, vector output, DOM event targeting, and
accessibility hooks. Canvas can be introduced for measured hot paths but should
not become the semantic source of truth.

## First safe editing slice

- Resolve presentation, slide, layout, master, and theme chains.
- Render basic preset shapes, pictures, fills, lines, and text.
- Preserve inherited versus local source layers.
- Select, move, resize, and reorder simple slide-local shapes.
- Edit simple text without flattening its inheritance.
- Allocate safe shape IDs and relationships when duplicating.
- Preserve notes, timing, unsupported objects, and extension markup.
- Validate and reopen in PowerPoint and LibreOffice without repair.

## High-risk fixtures

- nested grouped transforms with rotation/flips;
- custom geometry and adjustment handles;
- placeholder inheritance with local overrides;
- theme colors with transform chains and color-map overrides;
- text autofit under missing fonts;
- cropped/linked images;
- connectors attached to moved shapes;
- charts and diagrams with cached/fallback content;
- animations referring to edited shapes;
- PowerPoint versioned extension lists;
- embedded media, macros, and digital signatures.
