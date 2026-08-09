# Cross-format formatting

Tumbler exposes one semantic formatting contract from `@tumblerjs/core` rather
than making application heads speak SpreadsheetML, WordprocessingML, or
PresentationML directly.

## Contract

`FormattingPatch` separates inline text properties from their containing block:

- `text` covers font family and size, bold, italic, underline, and foreground
  colour;
- `block` covers horizontal and vertical alignment.

For a spreadsheet the block is a cell. For a word-processing document it is a
paragraph. For presentation text it is a paragraph or text frame. Format
adapters may support different subsets and expose them through
`FormattingCapabilities`.

Each property change is explicit:

- omission preserves the current property;
- `{ set: value }` writes a value, including explicit `false`;
- `{ inherit: true }` returns the property to the adapter's inherited/default
  value.

Selection state distinguishes uniform, inherited, mixed, and unavailable
values. Replaceable UI heads can therefore display indeterminate controls
without learning any format-specific style representation.

The shared Svelte toolbar exposes font family and size, bold, italic,
underline, foreground colour, and horizontal alignment when the active adapter
advertises those capabilities. Font-family values remain ordinary Office style
names; Tumbler does not require the viewing device to have the font installed in
order to preserve or write that name.

## SpreadsheetML adapter

The first adapter implements the contract for rectangular cell ranges. It:

- resolves the effective cell, row, column, or default style;
- changes only requested font and alignment properties;
- retains number formats, fills, borders, wrapping, rotation, and reading order;
- creates styled blank cells when necessary;
- appends and reuses `font` and `xf` records rather than mutating shared styles;
- creates a Styles part and relationship when the workbook has none;
- preserves unrelated XML and package parts through an atomic OPC transaction;
- accepts Strict and Transitional SpreadsheetML.

Client-side work is bounded to 100,000 cells per formatting command. Structural
whole-row and whole-column style operations should eventually use their native
SpreadsheetML representations rather than materializing every cell.

## Future adapters

Word will map text properties to run properties and block alignment to paragraph
properties. Slides will map them to DrawingML character and paragraph
properties. They must implement the same state, capability, and patch contract,
but remain responsible for their own inheritance and package-preservation rules.

Format-specific features such as cell fills, paragraph spacing, and shape fills
will extend typed adapter capabilities without weakening the shared text and
block vocabulary.
