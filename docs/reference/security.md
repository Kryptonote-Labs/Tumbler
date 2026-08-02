# Security and resource limits

OOXML files are untrusted ZIP containers containing XML, binary media,
relationships, and potentially active or externally linked content. Preview-only
paths are security-sensitive even when nothing is intentionally executed.

## Threat classes

- ZIP bombs and extreme compression ratios;
- huge entry counts or inflated sizes;
- duplicate/confusable entry names;
- path traversal and unsafe URI resolution;
- XML entity expansion and external entity access;
- deeply nested or pathologically wide XML;
- expensive shape, formula, style, or relationship graphs;
- corrupt images and decompression bombs;
- external hyperlinks and linked media;
- macros, OLE objects, embedded packages, and forms;
- browser HTML/SVG injection through document text or metadata;
- formula injection when exporting/copying data;
- stale worker results crossing document revisions;
- customer data leaking into fixtures or diagnostics.

## Archive policy

Before inflation, inspect the central directory and enforce configurable limits:

- total entries;
- compressed bytes;
- declared uncompressed bytes;
- per-entry and total expansion ratio;
- per-entry size;
- duplicate logical names;
- compression method;
- encrypted-entry behavior;
- name length and validity.

Do not extract packages to a filesystem. Resolve logical OPC names independently
of OS paths. Budgets must also apply while streaming because archive metadata can
lie.

## XML policy

- Disable DTD and external entity processing.
- Do not fetch schemas or external resources during parse.
- Bound element depth, attributes per element, token count, and text size.
- Bound namespace and MCE state growth.
- Make parsing cancellable.
- Treat malformed UTF and illegal XML characters as typed failures.
- Never insert document-provided strings using unsanitized `innerHTML`.

An XML parser dependency is acceptable only if these controls are confirmed by
tests, not merely configuration documentation.

## Relationships and network access

External relationships can point to websites, files, images, templates, data
connections, or other resources. Parsing never dereferences them.

Rendering policy:

- block external loads by default;
- expose target, type, and source to the host;
- require explicit host approval for fetching;
- use normal browser origin and content-security controls;
- prevent file-scheme and local-network surprises;
- keep fetched bytes outside the package unless an explicit embed command runs.

Hyperlink activation is a separate user action from document opening.

## Macros and active content

Macro-enabled formats can contain VBA project parts. Tumbler may preserve their
bytes and relationships but does not parse for execution or run them.

The same inert-by-default policy applies to:

- OLE objects;
- embedded executable/package content;
- ActiveX and Office Forms;
- scripts or HTML in embedded/linked content;
- media autoplay;
- data connections and refresh operations.

Presence should produce structured capability/security metadata without noisy UI
unless the host needs a warning for an action.

## HTML, SVG, and CSS injection

OOXML text, names, alternative descriptions, field results, comments, formulas,
and metadata are untrusted strings. Bind them as text. Style values should flow
through typed parsers and allowlisted render properties.

Never place document-provided XML fragments directly into the browser DOM. SVG
elements are generated from Tumbler's typed geometry model; embedded SVG images
receive an image-decoding/sanitization policy rather than becoming inline markup
automatically.

## Formula safety

Formula evaluation is code-like computation even when it is not JavaScript.

- Implement functions explicitly; never use `eval` or generated JS.
- Bound dependency graph size, recursion, iteration, and string/array results.
- Detect cycles.
- Treat volatile/external/data functions deliberately.
- Never perform network, filesystem, shell, or environment access from formulas.
- Sanitize spreadsheet text exported to contexts where leading formula markers
  could become executable formulas.

## Image and media decoding

- Bound encoded and decoded dimensions/bytes.
- Reject impossible dimensions before allocating surfaces.
- Prefer browser decoders in isolated blob URLs where safe.
- Revoke object URLs on document close/revision change.
- Treat SVG and vector metafile formats separately from ordinary raster images.
- Fuzz image metadata and drawing crop/transform combinations.

## Resource accounting

Track budgets per document and per operation:

- archive bytes;
- inflated bytes;
- XML nodes/tokens;
- model objects;
- relationships traversed;
- formula operations;
- geometry segments;
- layout iterations;
- image pixels;
- worker time;
- main-thread time slices.

A typed `LimitExceeded` diagnostic should name the resource and configured limit.
Avoid generic out-of-memory failures.

## Privacy and fixtures

- `fixtures/private/` remains ignored.
- Customer documents are never committed unchanged.
- Minimize and sanitize before creating a regression fixture.
- Scrub author names, comments, revisions, custom properties, embedded content,
  links, and hidden sheets/slides where unrelated.
- Logs should use part paths and hashes rather than document text by default.
- Consumer runners handle only generated, curated, or sanitized fixtures.

## Security test minimum

- duplicate and traversal ZIP entries;
- falsified sizes and high compression ratios;
- DTD/entity fixtures;
- extreme XML depth/width;
- relationship cycles and external targets;
- malformed images and huge pixel dimensions;
- formula cycles and resource exhaustion;
- malicious text rendered in DOM/SVG contexts;
- cancellation during every expensive stage;
- repeated open/close with object URL and worker leak checks.
