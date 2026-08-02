# DrawingML, themes, and shared visuals

Primary source: ECMA-376 Part 1 §§14, 20, and 21. The informative primer is
Annex L.4. Host-format placement rules remain in the Word, spreadsheet, and
presentation vocabularies.

## Scope

DrawingML supplies common visual concepts used across the Office family:

- shapes and custom geometry;
- pictures;
- text inside shapes;
- fills, lines, and effects;
- themes and style references;
- charts;
- diagrams;
- tables;
- Word drawing placement;
- spreadsheet drawing anchors.

Shared vocabulary does not mean shared placement. The same picture may be inline
or anchored in Word, cell-anchored in a worksheet, and directly positioned in a
slide coordinate system.

## Units

Common measurements use English Metric Units (EMUs):

```text
914,400 EMU = 1 inch
12,700 EMU  = 1 point
36,000 EMU  = 1 millimetre
```

Angles commonly use 60,000 units per degree.

Keep integer source units in the model. Convert to floating-point CSS/SVG units
at the layout boundary. Repeated round trips through pixels will accumulate
error and create noisy XML changes.

## Transform model

Visual transforms can include:

- offset;
- extent;
- rotation;
- horizontal and vertical flip;
- group child offset and child extent.

Use matrices for computed geometry and retain original scalar values for save.
Tests should cover transform composition, inverse hit testing, negative/zero
extents in malformed files, and nested group spaces.

## Geometry

Preset geometry references a named shape plus optional adjustment values. The
official Part 1 archive includes machine-readable preset geometry resources.
Custom geometry can define:

- adjustment and calculated guides;
- handles;
- connection sites;
- a text rectangle;
- one or more drawing paths;
- arc, line, move, quadratic, cubic, and close operations.

A practical sequence is:

1. implement rectangles, ellipses, lines, and a small preset set;
2. build a guide-expression evaluator;
3. generate paths from the official preset resource;
4. support custom geometry;
5. add adjustment-handle editing.

Unknown or unsupported geometry should retain source markup and render a bounded
placeholder rather than disappear.

## Fills and lines

Fill forms include no fill, solid, gradient, pattern, picture/blip, and group-
inherited behavior. Lines add width, compound/dash styles, caps, joins, and head
or tail decorations.

Gradients can use stop lists and linear or path behavior. Picture fills include
crop/source rectangles, tile/stretch behavior, alignment, scale, and offsets.

Computed CSS/SVG paint is not the save representation. Preserve the original
fill form and edit only properties addressed by the command.

## Colors

Colors can originate from:

- explicit sRGB;
- scRGB;
- HSL;
- preset color;
- system color with fallback;
- theme scheme color.

Color transforms can adjust tint, shade, alpha, hue, saturation, luminance, and
channel values. Transform order matters. The renderer should evaluate a pipeline
and preserve the source expression.

A scheme color requires a theme and sometimes a host color map. The same source
scheme name can resolve differently under a slide/master color-map override.

## Themes

A theme provides color, font, and format schemes. The format scheme contains
style lists for fills, lines, effects, and backgrounds. Host content can refer to
these lists through style indexes.

Theme calculation belongs in shared OOXML/DrawingML. Host packages supply the
context and inheritance chain. Cache computed values by theme, color-map, style,
and local transform inputs without replacing source references.

Font schemes distinguish major and minor fonts and can provide script-specific
faces. Font fallback must be observable in visual tests.

## Pictures

A picture connects non-visual metadata, a blip/image relationship, picture fill
behavior, and shape geometry/transform. Image bytes live in another package
part.

Security and fidelity rules:

- sniff and bound image decoding instead of trusting extensions;
- external linked images require host permission;
- preserve original bytes on unrelated edits;
- retain crop and transform separately from source pixels;
- deduplicate only when graph identity and producer expectations allow it.

## Text in DrawingML

DrawingML text bodies contain body properties, list styles, paragraphs, runs,
fields, breaks, and end-paragraph properties. They are used heavily in slides and
shape content but are not identical to WordprocessingML text.

Text layout includes shape insets, vertical anchor, wrapping, columns, rotation,
autofit, paragraph levels, bullets, tabs, spacing, and theme-derived fonts.

Do not force DrawingML text through the WordprocessingML paragraph model merely
because both contain paragraphs and runs. Shared low-level text utilities are
fine; semantic models remain distinct.

## Charts

Chart parts describe chart type, axes, series, labels, legends, formatting, and
references to source data. Cached category and value data may permit rendering
without recalculating or opening the source workbook.

Initial behavior can:

- recognize chart type and bounds;
- preserve all chart-related parts;
- render a placeholder or a narrow native subset;
- expose cached preview data safely;
- avoid rewriting caches during unrelated document edits.

Charts have substantial extension vocabularies and version-dependent behavior;
they should be a dedicated capability track.

## Diagrams

Diagram/SmartArt content typically spans data, layout, color, and style parts.
The relationship between semantic diagram data and rendered shapes is complex,
and Office files can carry fallback drawing content.

Preserve all related parts and MCE branches together. A fallback is not evidence
that the semantic diagram parts may be deleted.

## Renderer tests

- exact EMU conversions without save drift;
- matrix composition and inverse hit testing;
- preset geometry snapshots from official geometry resources;
- guide-expression edge cases;
- theme/color-map/color-transform combinations;
- missing fonts and script-specific theme fonts;
- gradients, patterns, picture crop/tile/stretch;
- line joins, dashes, caps, and arrows;
- group inheritance;
- known and unknown effects;
- shared image part referenced by several objects.
