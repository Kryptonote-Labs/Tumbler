# SpreadsheetML reference

Primary source: ECMA-376 Part 1 §§12 and 18. The informative primer is Annex
L.2. Excel-specific extensions are documented in
[[MS-XLSX]](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/f780b2d6-8252-4074-9fe3-5d7bc4830968).

## Package shape

The package office-document relationship targets the Workbook part, commonly
`/xl/workbook.xml`. The workbook identifies sheets through relationship IDs;
each worksheet is a separate part.

Common graph:

```text
Workbook
├── worksheets / chart sheets / dialog sheets / macro sheets
├── shared strings
├── styles
├── theme
├── calculation chain
├── external links and connections
├── metadata
├── pivot caches and pivot tables
├── VBA project in macro-enabled workbooks
└── workbook properties and names

Worksheet
├── comments or threaded comments
├── table definitions
├── drawings, images, and charts
├── hyperlinks
└── printer-related parts
```

Do not assume every sheet entry targets an ordinary worksheet.

## Workbook identity

A sheet has at least three identities that must not be conflated:

- display name;
- numeric `sheetId` scoped to the workbook;
- relationship ID resolving to its part.

The order in the workbook's sheet list is the displayed tab order. Renaming,
copying, reordering, hiding, and deleting sheets affect formulas, names, views,
relationships, and sometimes extension data.

Workbook state also includes active/selected views, calculation properties,
date-system choice, protection, external references, defined names, and other
metadata.

## Worksheet storage is sparse

`sheetData` contains rows, which contain cells. Missing rows and cells are normal
and usually mean default/blank state. A cell carries a reference such as `C7`;
physical child position is not a safe coordinate system.

Never materialize the entire rectangular address space. The model should use
sparse storage plus row, column, and range metadata.

Relevant independent dimensions include:

- cell value/formula/type/style;
- row height, style, hidden state, outline level;
- column width, style, hidden state, outline level;
- merged ranges;
- sheet dimensions, views, panes, selections, and print settings;
- tables, validation, filters, conditional formatting, hyperlinks, comments, and
  drawings.

## Cell values and types

A cell can contain a formula (`f`), a stored value (`v`), inline rich/string
content, and attributes such as cell type and style index.

Common cell type meanings include:

- number/default numeric;
- shared-string index;
- inline string;
- boolean;
- error;
- formula string result;
- ISO-style date in profiles/producers that use the date type.

Dates are often stored as numbers and displayed through a number format. Workbook
date-system settings matter. Excel's historical 1900 date system includes a
compatibility quirk around the fictitious 1900 leap day. Preserve raw values and
date-system identity; do not convert every date-looking cell irreversibly into a
JavaScript `Date`.

Store separately:

```text
raw scalar + formula + cached result + type + style reference
```

Display value is a derived view influenced by formatting and locale.

## Shared strings and rich text

Text may be stored inline or in a workbook-level shared string table. Shared
string entries can be plain text or rich runs with formatting and phonetic data.
Cell indexes refer into this table.

Editing policies to decide explicitly:

- retain existing shared-string representation when possible;
- append versus deduplicate new entries;
- maintain counts if written;
- avoid reindexing the entire table for a one-cell edit;
- preserve rich and phonetic content even when the current UI shows plain text.

## Styles and number formats

Cells usually reference a cell format record by index. That record composes font,
fill, border, number format, alignment, protection, and inheritance-related
references. Named styles and differential formats serve other features.

The UI needs computed styles, but save operations should reuse or add records
rather than expand every cell to copied formatting. Duplicate style growth is a
major real-world performance problem.

Number formatting is its own language. It affects display of numbers, dates,
times, percentages, fractions, text, colors, and conditions. Locale-dependent
built-ins and custom codes require dedicated parsing and rendering tests.

## Formulas

Formula text is stored without the UI's leading `=`. A cell can also hold a
cached result. Formula forms include ordinary, shared, array, data-table, dynamic
array, and extension-defined behavior depending on producer/version.

Formula work divides into separate capabilities:

1. preserve expression and cached result;
2. tokenize and understand references;
3. transform references during structural edits;
4. build dependencies;
5. calculate supported functions;
6. match Excel edge behavior.

Do not make full calculation a prerequisite for safe value editing. Initial
support can preserve formulas, display cached results, update only well-
understood references, and mark calculation metadata so a mature consumer knows
recalculation may be needed.

The calculation chain is optional and can become stale after edits. Its update or
removal must follow a deliberate policy with consumer tests.

Formula reference transformations must cover absolute/relative axes, ranges,
sheet-qualified references, names, structured references, and external books.
Unknown formula syntax should block transformations that cannot be proven safe.

## Merges, panes, and views

Merged cells are ranges whose visible content normally comes from the top-left
cell. They affect rendering, selection, navigation, copy/paste, insertion, and
deletion.

Frozen and split panes involve worksheet view state and selection panes. UI
virtualization must treat fixed and scrolling regions coherently.

Sheet views are user/application state. A basic cell edit should not rewrite
active cell, zoom, selections, or window settings unless the host explicitly
chooses to persist view changes.

## Tables, filters, validation, and conditional formatting

These are semantic objects attached to ranges, not visual decoration only.
Structural edits can require updating their references and related parts.

- Tables have names, columns, styles, totals behavior, and optional filters.
- AutoFilter defines a range and filter criteria.
- Data validation defines allowed input and prompts/errors.
- Conditional formatting uses rules, priorities, ranges, and differential styles.
- Defined names can be workbook- or sheet-scoped and can refer to ranges,
  formulas, constants, or special built-in concepts.

Until structurally editable, preserve them and reject range mutations that would
silently detach or corrupt them.

## Drawings and charts

Worksheet drawings use anchors tied to cell coordinates plus offsets. Row height
and column width changes can move or resize objects depending on anchor behavior.
The worksheet relates to a drawing part, which relates to images and charts.

Charts often contain cached data in addition to workbook references. Editing
source cells may leave chart caches stale; this needs an explicit invalidation or
update strategy.

## Grid rendering

The visible grid is a two-dimensional window over sparse state. Requirements:

- variable row heights and column widths;
- frozen panes;
- merged cells crossing viewport boundaries;
- row/column headers and hit testing;
- range selections extending outside mounted cells;
- keyboard navigation without DOM dependence;
- overscan and stable scroll anchoring;
- overlays for editors, selection, fill handles, comments, and drawings;
- high-density rendering without one permanent component per possible cell.

TanStack Table is a candidate headless state utility, and TanStack Virtual is a
candidate virtualization primitive. Prototype them against spreadsheet-specific
cases before adoption. The workbook model and selection semantics stay in
Tumbler.

## First safe editing slice

- Discover workbook and ordinary worksheet parts through relationships.
- Render a bounded sparse viewport with basic widths, heights, merges, and styles.
- Navigate and select by coordinates.
- Edit basic scalar values and formula text.
- Preserve cached values/formulas according to explicit policy.
- Update or append shared strings without global churn.
- Retain unrelated sheets, names, drawings, extensions, and styles.
- Validate and reopen in Excel and LibreOffice without repair.

## High-risk fixtures

- both date systems and dates around 1900;
- very large sparse dimensions;
- shared/array/dynamic formulas;
- merged ranges across frozen pane boundaries;
- custom number formats and locale-sensitive built-ins;
- hidden and very-hidden sheets;
- external links and data connections;
- conditional formats with overlapping priorities;
- drawings anchored to resized rows/columns;
- pivot and slicer extensions;
- macro-enabled workbooks and signed packages.
