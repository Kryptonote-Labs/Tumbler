import type { NativeChange } from './native-document.ts';

/** Compact export work without changing the semantic operation log or revision identity. */
export function compactNativeChanges(changes: readonly NativeChange[]): NativeChange[] {
  const output: NativeChange[] = [];
  for (const change of changes) {
    const previous = output.at(-1),
      a = previous?.command,
      b = change.command;
    if (
      previous &&
      a &&
      'slideId' in a &&
      'slideId' in b &&
      a.slideId === b.slideId &&
      'objectKey' in a &&
      'objectKey' in b &&
      a.objectKey === b.objectKey
    ) {
      if (
        a.name === 'edit-text' &&
        b.name === 'edit-text' &&
        a.start === a.end &&
        b.start === b.end &&
        a.cell?.row === b.cell?.row &&
        a.cell?.column === b.cell?.column &&
        !/[\r\n]/.test(a.value + b.value) &&
        (b.start === a.start || b.start === a.start + a.value.length)
      ) {
        output[output.length - 1] = {
          ...previous,
          command: {
            ...a,
            value: b.start === a.start ? b.value + a.value : a.value + b.value,
          },
        };
        continue;
      }
      if (a.name === 'update-object' && b.name === 'update-object') {
        output[output.length - 1] = {
          ...previous,
          command: { ...a, ...b, rotation: b.rotation ?? a.rotation },
        };
        continue;
      }
      if (a.name === 'style-shape' && b.name === 'style-shape') {
        output[output.length - 1] = {
          ...previous,
          command: {
            ...a,
            fill: b.fill ?? a.fill,
            stroke: b.stroke ?? a.stroke,
            strokeWidth: b.strokeWidth ?? a.strokeWidth,
            cornerRadius: b.cornerRadius ?? a.cornerRadius,
          },
        };
        continue;
      }
    }
    output.push(change);
  }
  return output;
}
