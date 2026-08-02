# Contributing to Tumbler

Tumbler is being developed in public at an extremely early stage. Contributions
are welcome, but maintainers may substantially change or remove any API while
the document model and preservation contract are still being established.

Before proposing a large implementation, open an issue describing the problem,
the relevant OOXML requirements, and the intended compatibility behavior. Small
bug fixes, focused tests, and documentation corrections can go directly to a
pull request.

## Development

Tumbler requires Bun 1.3 or newer.

```sh
bun install
bun run check
bun test
```

Keep changes narrow and typesafe. Tests should exercise observable behavior,
preservation, standards requirements, or consumer compatibility rather than
implementation details. Format-specific behavior belongs in its format package;
shared layers must not acquire shortcuts for one document type.

## Documents and fixtures

Do not submit confidential, customer, or personally identifying documents.
Only contribute fixtures that you created or have clear permission to
redistribute. State their origin and license in the pull request. Prefer small,
purpose-built fixtures that isolate one behavior.

Standards documents and other restricted reference material must not be added to
the repository. The project keeps its local reference archive ignored for this
reason.

## Compatibility claims

Do not describe a format or feature as supported solely because one generated
fixture passes. Compatibility claims need focused tests, preservation evidence,
and—where applicable—validation or round trips through independent Office
consumers.

By contributing, you agree that your contribution is licensed under the MIT
License in this repository.
