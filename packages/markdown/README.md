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
