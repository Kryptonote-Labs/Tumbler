<script module lang="ts">
  export { mount } from "svelte";
</script>

<script lang="ts">
  import { createPresentation, applyPresentationCommand, PresentationEditingSession } from '@tumblerjs/slides';
  import type { PresentationObjectChange } from '@tumblerjs/slides';
  import { PresentationSlideView } from '@tumblerjs/svelte/slides';
  let initial = createPresentation({ width: 800, height: 500 });
  const slideId = initial.document.slides[0]!.id;
  for (const x of [100, 250]) initial = applyPresentationCommand(initial, {
    name: 'insert-object', slideId, bounds: { x, y: 100, width: 100, height: 60 },
    object: { kind: 'shape', fill: '#dddddd' },
  });
  initial = applyPresentationCommand(initial, {
    name: 'insert-object', slideId, bounds: { x: 450, y: 100, width: 150, height: 80 },
    object: { kind: 'table', rows: 2, columns: 2 },
  });
  const session = new PresentationEditingSession(initial);
  let artifact = $state(session.artifact);
  let selectedKeys = $state<string[]>([]);
  export function selection() { return [...selectedKeys]; }
  export function selectKeys(keys: string[]) { selectedKeys = keys; }
  export function objectKeys() { return initial.document.slides[0]!.objects.map(object => object.key); }
  export function undo() { artifact = session.undo(); }
  function commit(changes: PresentationObjectChange[]) {
    artifact = session.execute({ name: 'batch', commands: changes.map(({slideId, objectKey, x, y, width, height, rotation}) => ({
      name: 'update-object', slideId, objectKey, x, y, width, height,
      ...(rotation === undefined ? {} : {rotation}),
    })) });
  }
</script>

<PresentationSlideView presentation={artifact.document} slide={artifact.document.slides[0]!}
  editable toolbar={false} bind:selectedKeys onobjectschange={commit}/>
