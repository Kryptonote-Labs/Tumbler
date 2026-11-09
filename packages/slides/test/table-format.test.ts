import { expect, test } from 'bun:test';
import { createPresentation, applyPresentationCommand, openPresentationArtifact, createPresentationNativeArchive, openPresentationNativeArchive } from '../src/index.ts';
test.each([false, true])('table formatting survives round trips, native=%s', (native) => {
  let source = createPresentation();
  const slideId = source.document.slides[0]!.id;
  source = applyPresentationCommand(source, { name: 'insert-object', slideId, bounds: { x: 20, y: 20, width: 300, height: 100 }, object: { kind: 'table', rows: 2, columns: 2 } });
  const key = source.document.slides[0]!.objects[0]!.key;
  const artifact = native ? openPresentationNativeArchive(createPresentationNativeArchive(source)) : source;
  {
    const changed = applyPresentationCommand(artifact, { name: 'format-table', slideId, objectKey: key, row: 0, column: 0, scope: 'row', fill: '#123456', verticalAlignment: 'bottom', padding: 8, borders: { top: { color: '#FF0000', width: 2, dash: 'dash' } } });
    const reopened = native ? openPresentationNativeArchive(createPresentationNativeArchive(changed)) : openPresentationArtifact(changed.bytes());
    const cells = reopened.document.slides[0]!.objects[0]!.table!.cells;
    expect(cells[0]!.fill).toBe(native ? '#123456' : 'rgba(18,52,86,1)');
    expect(cells[1]!.fill).toBe(cells[0]!.fill);
    expect(cells[2]!.fill).not.toBe(cells[0]!.fill);
    expect(cells[0]!.text!.anchor).toBe('bottom');
    expect(cells[0]!.text!.inset).toEqual([8,8,8,8]);
    expect(cells[0]!.borders[0]).toMatchObject({ color: native ? '#FF0000' : 'rgba(255,0,0,1)', width: 2 });
  }
});

test('stale table coordinates conflict after another author inserts a row', async () => {
  const { rebasePresentationCommands } = await import('../src/index.ts');
  let base = createPresentation(); const slideId = base.document.slides[0]!.id;
  base = applyPresentationCommand(base, { name: 'insert-object', slideId, bounds: {x:0,y:0,width:300,height:100}, object: {kind:'table',rows:2,columns:2} });
  const objectKey = base.document.slides[0]!.objects[0]!.key;
  const inserted = { name: 'edit-table' as const, slideId, objectKey, row:0,column:0,action:'insert-row' as const };
  const current = applyPresentationCommand(base, inserted);
  expect(() => rebasePresentationCommands(base, current, [{ name:'format-table', slideId, objectKey, row:0,column:0,scope:'cell',fill:'#FF0000' }], [inserted])).toThrow();
});
