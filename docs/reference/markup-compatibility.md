# Markup compatibility and extensions

Primary source: ECMA-376 Part 3 §§7–9. Microsoft overview:
[Introduction to markup compatibility](https://learn.microsoft.com/en-us/office/open-xml/general/introduction-to-markup-compatibility).

Namespace:

```text
http://schemas.openxmlformats.org/markup-compatibility/2006
```

The common prefix is `mc`, but prefixes are aliases. Compare namespace URIs and
local names, never literal prefixes.

## Why MCE exists

New producers need to write features that older consumers do not understand.
MCE lets producers mark unfamiliar namespaces as ignorable, require particular
namespaces, process known descendants through unknown wrappers, or provide
alternative representations.

For Tumbler, MCE has two separate jobs:

1. determine the semantic view exposed to a configured consumer;
2. preserve the original branches for loss-safe editing.

A destructive preprocessing pass may achieve the first while violating the
second. Never discard the source MCE structure merely because one branch was
selected for rendering.

## `mc:Ignorable`

The value is a whitespace-separated list of in-scope namespace prefixes. It
declares those namespace URIs ignorable within the relevant scope.

Important consequences:

- resolve prefixes at the attribute's element, not globally;
- inherited namespace bindings and inherited MCE state matter;
- an unknown namespace that is not declared ignorable is not equivalent to an
  ignorable feature;
- ignoring an element does not automatically mean processing its children;
- preserve ignored markup even when it contributes nothing to the active view.

## `mc:ProcessContent`

This attribute identifies elements in ignorable namespaces whose contents are to
be processed even when the wrapper itself is not understood. Its tokens combine
a namespace prefix with a local name or wildcard.

The implementation needs a scoped set of expanded names. Treating this as a
string search will fail under prefix rebinding.

## `mc:MustUnderstand`

The value lists namespace prefixes that the consumer must understand to process
the document under the MCE model. A mismatch is a compatibility failure, not
permission to silently drop the content.

Tumbler should return a typed diagnostic containing the required namespace,
part, and source element. A head may still offer raw download or preservation-
only behavior, but must not claim a faithful editable view.

## `mc:AlternateContent`

`AlternateContent` contains one or more `Choice` children and at most one
`Fallback`. A `Choice` uses a `Requires` list of namespace prefixes. The MCE
processor selects the first choice whose required namespaces are all understood;
otherwise it selects the fallback if present.

Model it as:

```text
AlternateContent source node
├── Choice [requires namespace set]
├── Choice [requires namespace set]
└── optional Fallback

active view → one selected branch
save source → original branches plus focused edits
```

Do not flatten selected branch content into the parent and then serialize a
brand-new tree. That loses forward-compatible alternatives.

## Application-defined extension elements

OOXML vocabularies frequently provide extension-list containers such as
`extLst`. Content inside is often identified by a URI and uses a versioned
application namespace.

Engineering policy:

- keep the extension container, child order, URI, namespace bindings, and raw
  content;
- attach it to the source owner;
- parse a known extension through a registered handler without changing the
  default preservation behavior;
- edit only the extension subtree when the command explicitly targets it;
- preserve duplicate or unfamiliar extensions rather than deduplicating them.

## Processing configuration

MCE processing depends on the set of namespaces a consumer claims to understand.
Tumbler should make that set explicit and versionable. It may differ between:

- the semantic/rendering view;
- validation against a named Office version;
- save preservation behavior.

Avoid one global `supportsOffice2019` boolean. Capability should be based on
specific namespace handlers and feature support.

## Suggested internal state

For each parsed element, retain:

- expanded name;
- original prefix and namespace declarations;
- scoped MCE state;
- whether it participates in the active semantic view;
- original token/source span or lossless subtree;
- active `AlternateContent` branch, if applicable;
- handler/capability responsible for understanding it;
- dirty state.

## Test matrix

At minimum test:

- nested and inherited `Ignorable` declarations;
- prefix rebinding;
- multiple ignorable namespaces;
- `ProcessContent` exact-name and wildcard matching;
- unknown non-ignorable markup;
- `MustUnderstand` match and mismatch;
- several choices where only a later one matches;
- fallback selection and missing fallback;
- nested `AlternateContent`;
- unknown extensions inside selected and unselected branches;
- parse/edit/save with all inactive branches preserved;
- opening the same source under different understood-namespace configurations.

Microsoft's SDK documentation warns that preprocessing can affect what is later
saved. Tumbler must use external SDK preprocessing only as a semantic oracle, not
as the preservation implementation.
