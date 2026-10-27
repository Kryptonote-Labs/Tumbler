import { expect, test } from "bun:test";
import * as Y from "yjs";
import { WordSharedText } from "../src/collaboration/structured/view.ts";
import { groupTableParagraphs, tableParagraphs } from "../src/collaboration/tables.ts";
import { apply, cell, clone, derived, fixture, sync } from "./structured-table-fixtures.ts";
import {
  prepareWordUpdate,
  commitWordUpdate,
} from "../src/collaboration/structured/transactions.ts";
import { activeAxes } from "../src/collaboration/structured/state.ts";
import { createWordCommands } from "../src/collaboration/commands.ts";
import { openWordOperationDocument } from "../src/operations/document.ts";
import { createWordArtifact } from "../src/index.ts";
import { wordParagraphIdentity } from "../src/collaboration/paragraph-identity.ts";

test("linear editor views retain concurrent columns and map both peers to the same cell", () => {
  const seed = fixture([
    [cell("A"), cell("B")],
    [cell("C"), cell("D")],
  ]);
  const docs = [clone(seed.doc), clone(seed.doc)];
  const views = docs.map((doc) => new WordSharedText(doc, "body"));
  for (const view of views) {
    const first = tableParagraphs(view.text)[0]!;
    view.commit(
      view.prepareOperation(
        { start: first.start, end: first.start },
        {
          name: "edit-table",
          input: { action: "column-after", cellId: first.table!.cell },
        },
      ),
    );
  }
  sync(docs[0]!, docs[1]!);
  for (const view of views) {
    expect(view.conflict).toBeUndefined();
    const cells = tableParagraphs(view.text).filter((p) => p.table);
    expect(cells).toHaveLength(8);
    expect(cells.every((p) => p.table!.columns === 4)).toBe(true);
    expect(groupTableParagraphs(cells)).toMatchObject([{ kind: "table" }]);
    const empty = cells[1]!;
    view.commit(
      view.prepareOperation(
        { start: empty.start, end: empty.start },
        {
          name: "replace",
          input: { value: view === views[0] ? "Alice" : "Bob" },
        },
      ),
    );
  }
  sync(docs[0]!, docs[1]!);
  expect(views[0]!.text.toDelta()).toEqual(views[1]!.text.toDelta());
  expect(views[0]!.text.toString()).toContain("Alice");
  expect(views[0]!.text.toString()).toContain("Bob");
  views.forEach((view) => view.destroy());
  docs.forEach((doc) => doc.destroy());
  seed.session.destroy();
});

test("paragraph identities come from shared terminators and survive preceding text edits", () => {
  const source = new Y.Doc();
  source.getText("body").insert(0, "First\nSecond\n");
  const docs = [clone(source), clone(source)];
  const views = docs.map((doc) => new WordSharedText(doc, "body"));
  const identities = views.map((view) => wordParagraphIdentity(view.text, 12));
  expect(identities[0]).toBe(identities[1]);
  docs[0]!.getText("body").insert(0, "Before ");
  sync(docs[0]!, docs[1]!);
  for (const view of views) expect(wordParagraphIdentity(view.text, 19)).toBe(identities[0]!);
  views.forEach((view) => view.destroy());
  docs.forEach((doc) => doc.destroy());
  source.destroy();
});

test("a conflicting remote deletion blocks projected reads until retained cell content is restored", () => {
  const seed = derived();
  const left = clone(seed.doc),
    right = clone(seed.doc);
  const view = new WordSharedText(left, "body");
  apply(left, {
    kind: "delete-axis",
    table: seed.table,
    dimension: "column",
    id: seed.target.column,
  });
  commitWordUpdate(
    right,
    prepareWordUpdate(right, [
      {
        kind: "replace",
        selection: { cell: seed.target, range: { start: 0, end: 0 } },
        value: "Retained edit",
      },
    ]),
  );
  Y.applyUpdate(left, Y.encodeStateAsUpdate(right));
  expect(view.conflict).toBeDefined();
  expect(() => view.text).toThrow();
  apply(left, {
    kind: "restore-axis",
    table: seed.table,
    dimension: "column",
    id: seed.target.column,
  });
  expect(view.conflict).toBeUndefined();
  expect(view.text.toString()).toContain("Retained edit");
  expect(activeAxes(left, seed.table, "column")).toContain(seed.target.column);
  view.destroy();
  left.destroy();
  right.destroy();
  seed.session.destroy();
});

test("browser deltas edit implicit cells, paragraphs and their virtual formatting boundary", () => {
  const seed = fixture([[cell("A"), cell("B")]]);
  const view = new WordSharedText(seed.doc, "body");
  const commands = createWordCommands();
  const first = tableParagraphs(view.text)[0]!;
  view.commit(
    view.prepareOperation(
      { start: 0, end: 0 },
      {
        name: "edit-table",
        input: { action: "column-after", cellId: first.table!.cell },
      },
    ),
  );
  const empty = tableParagraphs(view.text)[1]!;
  view.commit(
    view.prepareDelta(
      commands.replaceWordDelta(
        view.text,
        { start: empty.start, end: empty.start },
        "First\nSecond",
        { bold: true },
      ),
    ),
  );
  expect(view.conflict).toBeUndefined();
  expect(view.text.toString()).toBe("A\nFirst\nSecond\nB\n\n");
  const second = view.text.toString().indexOf("Second");
  view.commit(
    view.prepareDelta(
      commands.formatWordDelta(
        view.text,
        { start: second, end: second + 6 },
        { paragraph: { keepNext: true } },
      ),
    ),
  );
  expect(view.conflict).toBeUndefined();
  expect(
    commands.wordFormats(view.text, { start: second, end: second + 6 }).paragraph?.keepNext,
  ).toBe(true);
  view.commit(
    view.prepareDelta(
      commands.replaceWordDelta(
        view.text,
        { start: empty.start, end: empty.start + 12 },
        "Replacement",
      ),
    ),
  );
  expect(view.text.toString()).toContain("Replacement");
  view.destroy();
  seed.session.destroy();
});

test("an existing legacy table migrates in the same prepared operation without changing its text", () => {
  const session = openWordOperationDocument(
    createWordArtifact({ blocks: [{ kind: "table", rows: [[cell("Original"), cell("Second")]] }] }),
  );
  const view = new WordSharedText(session.text.doc!, "body");
  const first = tableParagraphs(view.text)[0]!;
  view.commit(
    view.prepareOperation(
      { start: first.start, end: first.start },
      {
        name: "edit-table",
        input: { action: "column-after", cellId: first.table!.cell },
      },
    ),
  );
  expect(view.conflict).toBeUndefined();
  expect(tableParagraphs(view.text).filter((p) => p.table)).toHaveLength(3);
  expect(view.text.toString()).toContain("Original\n\nSecond");
  view.destroy();
  session.destroy();
});

test('legacy drawing and formatting helpers can anchor changes in a local linear view', () => {
  const seed = fixture([[cell('First'), cell('Second')]]);
  const view = new WordSharedText(seed.doc, 'body');
  const commands = createWordCommands();
  const target = commands.anchorWordRange(view.text, { start: 0, end: 5 });
  view.commit(view.prepareChanges([{ kind: 'format', target, attributes: { bold: true } }]));
  expect(commands.wordFormats(view.text, { start: 0, end: 5 }).bold).toBe(true);
  view.destroy(); seed.session.destroy();
});

test("an implicit-cell anchor stays in its cell after another column is inserted", () => {
  const seed = fixture([[cell("A"), cell("B")]]);
  const view = new WordSharedText(seed.doc, "body");
  const first = tableParagraphs(view.text)[0]!;
  const insert = () =>
    view.commit(
      view.prepareOperation(
        { start: 0, end: 0 },
        {
          name: "edit-table",
          input: { action: "column-after", cellId: first.table!.cell },
        },
      ),
    );
  insert();
  const empty = tableParagraphs(view.text)[1]!;
  const anchor = view.anchor({ start: empty.start, end: empty.start });
  const state = Y.encodeStateAsUpdate(seed.doc);
  expect(view.resolve(anchor)).toEqual({ start: empty.start, end: empty.start });
  expect(Y.encodeStateAsUpdate(seed.doc)).toEqual(state);
  insert();
  const at = view.resolve(anchor);
  expect(at.start).toBeGreaterThan(empty.start);
  view.commit(view.prepareOperation(at, { name: "replace", input: { value: "Anchored" } }));
  expect(tableParagraphs(view.text).find((p) => p.start === at.start + 0)?.table?.column).toBe(2);
  expect(view.text.toString()).toContain("Anchored");
  view.destroy();
  seed.session.destroy();
});

test('a view resolves new positions before preexisting document observers run', () => {
  const doc = new Y.Doc();
  doc.getText('body').insert(0, 'Short\n');
  let view: WordSharedText;
  doc.on('afterTransaction', transaction => {
    if (!transaction.changed.size) return;
    const end = view.text.length - 1;
    expect(view.resolve(view.anchor({ start: end, end }))).toEqual({ start: end, end });
  });
  view = new WordSharedText(doc, 'body');
  doc.getText('body').insert(0, 'A much longer prefix ');
  view.destroy(); doc.destroy();
});

test('an earlier document observer can synchronize its table projection before reading', () => {
  const seed = fixture([[cell('A'), cell('B')]]);
  let view: WordSharedText;
  seed.doc.on('afterTransaction', transaction => {
    if (transaction.changed.size) {
      view.sync();
      expect(tableParagraphs(view.text).filter(p => p.table)).toHaveLength(3);
    }
  });
  view = new WordSharedText(seed.doc, 'body');
  const first = tableParagraphs(view.text)[0]!;
  view.commit(view.prepareOperation({ start: 0, end: 0 }, {
    name: 'edit-table', input: { action: 'column-after', cellId: first.table!.cell },
  }));
  view.destroy(); seed.session.destroy();
});

test('paragraph projections refresh shared identities when equal text retains a mirror terminator', async () => {
  const { WordParagraphProjection } = await import('../src/collaboration/paragraph-projection.ts');
  const doc = new Y.Doc();
  const source = doc.getText('body');
  source.insert(0, 'Before\nAfter\n');
  const view = new WordSharedText(doc, 'body');
  const projection = new WordParagraphProjection(view.text, slice => ({ id: slice.id }));
  const before = projection.paragraphs.map(p => p.id);
  doc.transact(() => { source.delete(6, 1); source.insert(6, '\n'); });
  expect(view.text.toString()).toBe('Before\nAfter\n');
  expect(projection.paragraphs[0]!.id).not.toBe(before[0]!);
  expect(projection.paragraphs[1]!.id).toBe(before[1]!);
  projection.destroy(); view.destroy(); doc.destroy();
});

test('plain formatting resets keep inserted paragraphs inside retained source cells', () => {
  const seed = fixture([[cell('First'), cell('Other')]]);
  const view = new WordSharedText(seed.doc, 'body');
  const commands = createWordCommands();
  view.commit(view.prepareDelta(commands.replaceWordDelta(view.text, { start: 0, end: 0 }, 'One\nTwo', {})));
  const paragraphs = tableParagraphs(view.text);
  expect(paragraphs[0]!.table?.cell).toBe(paragraphs[1]!.table?.cell);
  expect(paragraphs[0]!.table?.id).toBeDefined();
  expect(view.text.toString()).toContain('One\nTwoFirst');
  view.destroy(); seed.session.destroy();
});

test('synchronizing a view does not mutate deltas received by later source observers', () => {
  const doc = new Y.Doc();
  const source = doc.getText('body');
  source.insert(0, 'Imported\n', { bold: true, strike: false });
  const view = new WordSharedText(doc, 'body');
  let inserted: Record<string, unknown> | undefined;
  source.observe(event => { inserted = event.delta.find(part => part.insert)?.attributes; });
  source.insert(1, 'new', { bold: true });
  expect(inserted).toEqual({ bold: true });
  view.destroy(); doc.destroy();
});

test('plain views resynchronize independent projection edits and retain source attributes', () => {
  const doc = new Y.Doc();
  const source = doc.getText('body');
  source.insert(0, 'Source\n', { bold: true, wordSource: 12 });
  const view = new WordSharedText(doc, 'body');
  try {
    source.insert(2, 'new', { italic: true });
    view.sync();
    expect(view.text.toDelta()).toEqual(source.toDelta());
    view.text.insert(0, 'independent');
    view.text.format(0, view.text.length, { bold: null });
    view.sync();
    expect(view.text.toDelta()).toEqual(source.toDelta());
    view.sync();
    expect(view.text.toDelta()).toEqual(source.toDelta());
  } finally { view.destroy(); doc.destroy(); }
});

test('synchronizing inside a source transaction does not apply its delta twice', () => {
  const doc = new Y.Doc();
  const source = doc.getText('body');
  source.insert(0, 'Original\n');
  const view = new WordSharedText(doc, 'body');
  try {
    doc.transact(() => {
      source.insert(0, 'First ');
      view.sync();
      expect(view.text.toString()).toBe(source.toString());
      source.insert(0, 'Second ');
    });
    expect(view.text.toDelta()).toEqual(source.toDelta());
  } finally { view.destroy(); doc.destroy(); }
});
