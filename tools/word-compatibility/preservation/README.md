# Boolean formatting preservation

This suite qualifies the **preserve** dimension of 29 ECMA-376 Part 1 topics:
20 run properties and nine paragraph properties. `properties.ts` lists the exact
section IDs. It does not qualify their read, write, edit, render or interoperability
dimensions. For example, retaining `keepNext` does not prove correct pagination.

## Source review

The source is the pinned ECMA-376-1:2016 PDF in `catalog/sources.json`.
Every selected section uses the common boolean property type in §17.17.4,
whose value is ST_OnOff in §22.9.2.7. The corresponding Transitional type in
Part 4 additionally permits `on` and `off`.

For preservation, the relevant obligations are to retain the element's presence,
its value and its location. Absence must remain absence, because the topic's
inheritance/default behaviour differs from explicit false. An element without
`val` must remain distinguishable from absence. Style definitions and `basedOn`
links must remain intact, particularly for toggle properties in §17.7.3.

The reviewed topics include mutually exclusive effects: caps/smallCaps,
strike/dstrike, and emboss/imprint/outline/shadow. Fixtures test each property
individually and never introduce its conflicting partner. Run text uses neutral
digits and spaces to avoid the unspecified strong-direction combinations in
§17.3.2.30 (`rtl`). Run properties also appear on paragraph marks, covering the
storage location specifically required by `specVanish` and discussed by `oMath`.

## Executed checks

Each property has separate Strict and Transitional scenarios. Each scenario
contains every boolean value, omitted elements, omitted values, and both empty
and paired tag syntax. Every form appears in a body paragraph and a table cell.
Document defaults and a two-level paragraph style chain contain the property too.

The scenarios assert:

- No-op save returns the exact original ZIP bytes.
- Text replacement, undo and redo retain the property; undo restores exact bytes.
- Substring colour formatting splits runs while retaining the property on each
  resulting run. Paragraph alignment formatting retains unrelated `pPr` children
  and paragraph-mark `rPr` children.
- Reopening every output preserves the expected text, property presence, exact
  property XML and its location. Assertions inspect XML, including properties
  absent from Tumbler's computed formatting model.
- Every package entry outside the main document retains its exact payload,
  including styles, defaults, inheritance links and relationships.
- Open XML SDK accepts the before/after packages.

All three oracles in both profiles are mandatory for each preservation target.
Removing or failing one check prevents qualification. Existing linked checks,
including the earlier bold preservation scenario, remain mandatory too.

## Boundary of this qualification

This is an operation-specific preservation contract for no-op save, text
replacement, direct colour formatting, paragraph alignment, undo and redo in
body/table paragraphs. It is not a proof over every possible document or edit.
It does not qualify copying between documents, structural paragraph/table
operations, story editing, accepting revisions, property interpretation,
layout or consumer round trips. Those need their own requirements and evidence.

A finite suite cannot exhaust arbitrary OOXML combinations. Coverage means the
reviewed obligations in the stated dimension and operation contract have passing
evidence. The report retains the precise criteria so the percentage cannot be
read as universal Word compatibility.
