/** Resolve shared PDF history shortcuts without consuming composition or handled events. */
export function pdfHistoryShortcut(event: KeyboardEvent): 'undo' | 'redo' | undefined {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    !(event.ctrlKey || event.metaKey)
  )
    return;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y') return 'redo';
}
