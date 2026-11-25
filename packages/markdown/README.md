# Markdown notes

The `@tumblerjs/markdown` package provides a continuous Markdown document model, a WYSIWYG editor,
and a canvas preview painter.

The headless entry point owns the document schema, Markdown parsing and serialization. The `editor`
entry point adds ProseMirror input rules, editing commands, history and collaborative step handling.
The host application owns permissions, persistence, transport and file navigation.

Supported Markdown includes headings, emphasis, strikethrough, code, lists, tasks, quotes, tables,
links, images, Obsidian-style callouts and wikilinks. This is a subset of Obsidian syntax, without
plugin execution. Markdown export normalizes formatting, including list markers and whitespace.

Text colours use `=🟢text=` and highlights use `==🟢text==`. Red, orange, yellow, green, blue and purple
are supported. Code spans and escaped syntax stay literal. `==text==` uses yellow.

Markdown is the import and export format. The editor exposes ProseMirror collaborative steps so
host applications can persist structured documents, rebase pending edits and share the same model
between human and programmatic editing. The package does not provide a server or transport.

Code blocks disable browser spellcheck and use Lowlight tokens as ProseMirror decorations. Token
colours never become document marks or saved HTML. Common fence languages and aliases are supported;
unknown fences remain plain text. Immutable unchanged blocks reuse their cached tokens. Code commands
provide language selection, block selection, indentation, and leaving the block without losing code.

Code-block node views provide a non-editable language/copy header around the editable code. Headers
never enter Markdown or document content. `noteState` accepts an optional `codeLogo` resolver for
product-owned local assets. `NoteCopyFeedback` shares in-flight writes, extends one success timer,
and ignores late completions after the content changes or the view is destroyed.

## LaTeX documents

`@tumblerjs/markdown/latex` parses article-style LaTeX into the shared note schema and serializes it
back to source. Headings, paragraphs, emphasis, lists, quotes and inline and display equations are
structured. Original command spellings, separators, the preamble, comments and opaque source are
part of the document tree. `replaceLatexSource(document, source)` produces ProseMirror steps for
source editing, undo and collaboration. The browser host can supply equation and raw source views
through `NoteEditorOptions.latexNodeViews`. Parsing never executes TeX.

`parseLatexProject(entry, files)` expands literal `\input` and `\include` references.
The LaTeX editor mirrors changes across editable references to the same path in one
undoable edit. `serializeLatexProject(document)` writes the entry and each included
file once. Use `createLatexInclude(document, name, position)` to create a reference
in a project, or `detachLatexInclude(transform, position)` to turn an instance
into independent editable blocks.

`latexFlow(document)` resolves standard class and command behavior into
layout constraints at editor positions. `readLatexTableBlock(source)` exposes
the first, repeated, body, and final row groups and retains their source offsets.
Use `setLatexTableCell` to change a cell in the original source.

The browser supplies measured blocks and internal fragment anchors to
`paginateLatex`. A continuation can reserve room for a footer on one sheet
and repeat a header on the next. The paginator returns placements without
adding page breaks or repeated rows to the document. This keeps layout and
source edits on the same model for both native objects and source-backed
environments. The same constraints can accept measurements from a different
layout host.

`latexPageLayout(prefix)` resolves standard type sizes, leading, interword glue, and title
spacing. `latexParagraphText(node)` projects supported text and inline formulas with editor
offsets. Pass font and inline box measurements to `composeLatexParagraph` to get justified line
breaks and discretionary hyphens at those offsets. The host can use `measureLatexRoman` for
standard Computer Modern Roman text and `hyphenateLatexEnglish` for US English. The browser
can paint the returned breaks without changing the editable document or running TeX.

`latexMarginSettings(prefix)` reads the effective margins and binding offset. Left and right
are the odd-page margins in a two-sided document. Use `setLatexGeometry(prefix, { margins,
twoSided, bindingOffset })` to edit those settings. `latexPageLayout` includes the gutter and
the space reserved for headers and footers in its text-block geometry. Pass the page number
minus one to `latexSheetLayout` to resolve the horizontal margins for that page.

`paginateLatexRegions` applies the regular page planner to sections with different physical
sheet dimensions. Landscape environments keep their source delimiters and contain normal
editable blocks. `readLatexBeamerFrame` projects numeric overlays from one authored frame, and
`readLatexTikzStateDiagram` exposes the states and edges of a supported TikZ automaton.

Formatting aliases declared with `\newcommand` can keep their argument as editable text.
`readLatexTextMacros` and `interpretLatexText` also project common inline expansions into text
and formatting for hosts that display source-backed commands. Import `@tumblerjs/markdown/latex-fonts.css`
for the editable Computer Modern webfonts. Their outlines come from AMS Fonts under the
included SIL Open Font License.

`latexListOptions` reads local `enumitem` counter labels, starting values, and compact spacing
for supported lists. The list items remain normal editable document nodes.
