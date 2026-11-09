# Cross-format formatting

Tumbler exposes one semantic formatting contract from `@tumblerjs/core` rather
than making application heads speak SpreadsheetML, WordprocessingML, or
PresentationML directly.

## Contract

`FormattingPatch` separates inline text properties from their containing block:

- `text` covers font family and size, bold, italic, underline, strikethrough
  and foreground colour;
- `block` covers horizontal and vertical alignment;
- `cell` covers properties that only spreadsheet-style cells have: fill
  (`none` or `solid`), wrap text, text rotation (-90 to 90 degrees or
  `vertical`) and indent (whole levels, 0–250).

For a spreadsheet the block is a cell. For a word-processing document it is a
paragraph. For presentation text it is a paragraph or text frame. Format
adapters may support different subsets and expose them through
`FormattingCapabilities`. Optional groups and fields (`text.strike`,
`text.themeColor`, `cell`) are advertised only by adapters that implement them;
adapters reject a `cell` group they cannot apply.

`OfficeColor` is `automatic`, `rgb`, or `theme`. A theme colour keeps its
DrawingML slot (`lt1`, `dk1`, `lt2`, `dk2`, `accent1`–`accent6`, `hlink`,
`folHlink`) and a SpreadsheetML-style tint from -1 (darker) to 1 (lighter), so
it follows later theme changes. Its optional `value` is the resolved `#RRGGBB`
colour. SpreadsheetML stores the slot as its theme index; Word writes
`w:themeColor` with `w:themeTint` or `w:themeShade`; Slides writes `a:schemeClr`
with `a:lumMod` and `a:lumOff`.

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
- changes only requested properties and retains the rest of each cell format,
  including protection and diagonal borders;
- creates styled blank cells when necessary;
- appends and reuses `numFmt`, `font`, `fill`, `border` and `xf` records rather
  than mutating shared styles, reserving Excel's `none` and `gray125` fills;
- creates a Styles part and relationship when the workbook has none;
- preserves unrelated XML and package parts through an atomic OPC transaction;
- accepts Strict and Transitional SpreadsheetML.

Every style operation shares one internal engine: a style transform applied to a rectangle. Whole columns and rows use column and row
defaults plus sparse cell overrides, so selecting a column, a row or the whole
sheet does not materialize the grid. The worksheet grid is the only size limit.

Setting an indent on general, centered or justified text switches it to left
alignment, as Excel does. Shrink-to-fit is preserved but not yet authored.

### Spreadsheet commands

`spreadsheetCommand` (used by browser, service and command-line hosts) adds
these formatting commands next to `format-cells`:

| Command | Input | Effect |
| --- | --- | --- |
| `set-number-format` | `range`, `format`: a preset or `{ code }` | Presets: `general`, `number`, `integer`, `currency`, `accounting`, `percent`, `short-date` (alias `date`), `long-date`, `time`, `fraction`, `scientific`, `text`. Built-in codes use their reserved ids; other codes append a `numFmt` record from id 164. |
| `adjust-number-decimals` | `range`, `direction`: `increase` or `decrease` | Adds or removes one decimal place from each cell's current code, in every section, keeping currency, percent, colours, conditions and quoted literals. General becomes `0.0` or `0`. Text, date, time and fraction formats are unchanged; a code without a numeric section is rejected. |
| `set-borders` | `range`, `preset`, optional `style` (`ST_BorderStyle`, default `thin`) and `color` (default automatic) | Presets: `none`, `all`, `outside`, `inside`, `top`, `bottom`, `left`, `right`, `horizontal`, `vertical`. Only the named edges change. The range extends to whole merged cells; merged cells receive their outer edges as one logical cell. |
| `clear-formatting` | `range` | Resets font, fill, borders, alignment and number format to the Normal style. Values and formulas remain. |

`spreadsheetNumberFormatState` (also `SpreadsheetArtifact.numberFormatState`)
reports the current code with its matching `preset`, a broad `category` and its
`decimals`, or `mixed`. `describeSpreadsheetNumberFormat` classifies any code
the same way.

New workbooks declare an Aptos 11 pt Normal style. Effective font reads and grid
rendering resolve omitted family and size through Normal, the workbook theme,
and these defaults. Reading an older workbook does not rewrite its source styles.

Spreadsheet CLI and headless reads return `formatting` and `numberFormat` for
the requested range. These use the same uniform, mixed and unavailable states as
the editor. Request a single-cell range to inspect one cell's formatting.

## Word and Slides adapters

Word maps text properties to run properties and block alignment to paragraph
properties. Slides maps them to DrawingML character and paragraph
properties. Both implement the same state, capability, and patch contract,
but remain responsible for their own inheritance and package-preservation rules.

Word supports strikethrough and theme colours. Slides writes theme colours but
does not yet author strikethrough. Further format-specific features such as
paragraph spacing and shape fills extend typed adapter capabilities without
weakening the shared text and block vocabulary.

Font ranges belong to the format adapter, not the shared patch normalizer. The
normalizer accepts finite positive sizes. Word accepts half-point steps through
1638 pt; spreadsheet cells retain Excel's 1–409 pt range; presentations use
DrawingML `ST_TextFontSize`, 100–400000 hundredths of a point. The shared Svelte
controls use the active adapter's capabilities instead of applying the spreadsheet
range to every document. DrawingML outlines use `ST_LineWidth`, 0–20116800 EMUs,
equivalent to 0–1584 pt.
