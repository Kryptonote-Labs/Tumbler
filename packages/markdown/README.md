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
