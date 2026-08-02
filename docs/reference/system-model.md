# OOXML system model

## The document is a graph, not one XML tree

A DOCX, XLSX, or PPTX file is a ZIP-based OPC package. The package contains named
parts. Relationships connect the package to a main Office document part and
connect source parts to related parts such as styles, worksheets, slides, themes,
images, comments, or external resources.

```text
Package
├── [Content_Types].xml
├── _rels/.rels
├── application-specific main part
│   └── adjacent relationship part
├── supporting XML parts
├── binary resources
└── optional custom, embedded, signature, and extension parts
```

Never infer the main document solely from a conventional path such as
`/word/document.xml`. Follow the package relationship whose type identifies the
office document. Conventional paths are common producer choices, not the graph
API.

## Parts have identity and media type

Every part has:

- a package-relative name;
- a media type selected through `[Content_Types].xml`;
- bytes;
- zero or more outgoing relationships;
- potentially one or more incoming relationships;
- a clean or dirty state inside Tumbler.

Some parts are XML; others are images, embedded packages, fonts, VBA projects,
OLE objects, or application-specific binary data. A parser must not feed every
part to an XML parser merely because the outer file is OOXML.

## Relationship identity is local

Relationship IDs such as `rId1` are scoped to a relationship part/source. The
same string can legitimately identify different targets from different source
parts. Model relationships as `(source part, relationship ID)`, not as a global
ID map.

Source markup often references a related part through an `r:id`, `r:embed`, or
`r:link` attribute. Resolving that reference requires the source part's
relationship set.

## Package category is discovered

The package-level office-document relationship points to the main part. Its
content type and root element distinguish WordprocessingML, SpreadsheetML, and
PresentationML.

Typical main roots are:

| Format | Main logical root | Typical path |
| --- | --- | --- |
| DOCX | `w:document` | `/word/document.xml` |
| XLSX | `workbook` | `/xl/workbook.xml` |
| PPTX | `p:presentation` | `/ppt/presentation.xml` |

The path column is diagnostic guidance only. Reading should remain relationship-
driven.

## Consumers and producers

An editor is both consumer and producer. This matters because read support alone
can normalize aggressively, while an editor must retain enough source identity
to produce a safe revision.

Tumbler therefore maintains three connected views:

1. raw package graph for byte and relationship preservation;
2. loss-aware format tree for source-aware editing;
3. ergonomic editing model for UI behavior.

## Common shared parts

Across formats, packages may contain:

- core, extended, and custom properties;
- themes;
- images and other media;
- charts and chart drawings;
- diagrams;
- embedded packages and OLE objects;
- custom XML and associated properties;
- comments or annotation-related parts;
- digital signatures;
- VBA projects in macro-enabled variants.

Presence does not imply that every format relates to the part in the same way.

## Strict, Transitional, and extensions

Strict and Transitional use related but distinct vocabularies and relationship
namespaces. Real Office output frequently includes Transitional markup and
Microsoft versioned extension namespaces. Markup Compatibility and Extensibility
attributes tell consumers what may be ignored, processed through, or selected as
an alternative.

Tumbler should record the source profile and write back in that profile by
default. It must not silently "upgrade" or "clean" the package during an
unrelated edit.

## Capability model

Support is multi-dimensional:

- recognized;
- preserved;
- rendered;
- editable;
- interoperable with named consumers.

For example, a chart can be recognized and preserved before it is rendered, and
rendered before its data or styling becomes editable. This distinction belongs
in APIs, diagnostics, fixtures, and release reports.

## Failure model

Opening should return structured diagnostics rather than a binary success flag:

- fatal package corruption;
- recoverable malformed part;
- unsupported encrypted package;
- unsupported but preserved feature;
- missing resource with degraded rendering;
- external relationship blocked by policy;
- active content present but inert;
- profile or application-extension information.

A format head should be able to render supported regions even when another part
degrades, provided doing so is structurally safe.
