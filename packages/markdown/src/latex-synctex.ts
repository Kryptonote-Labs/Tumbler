type Anchor = { line: number; x: number; y: number; width: number; height: number };

/** Read source anchors from pdfTeX's uncompressed SyncTeX sidecar in PDF points. */
export function readLatexSyncTex(data: string, mainFile = 'document.tex') {
  const headerEnd = data.indexOf('\nContent:');
  if (headerEnd < 0) return;
  const header = data.slice(0, headerEnd);
  const inputs = [...header.matchAll(/^Input:(\d+):(.+)$/gm)];
  const input =
    inputs.find((record) => record[2] === mainFile || record[2]?.endsWith('/' + mainFile)) ??
    inputs[0];
  if (!input) return;
  const tag = Number(input[1]);
  const field = (label: string, fallback: number) =>
    Number(new RegExp('^' + label + ':([+-]?\\d+)$', 'm').exec(header)?.[1] ?? fallback);
  const scale = (field('Unit', 1) * field('Magnification', 1000)) / (1000 * 65536 * (72.27 / 72));
  const dx = field('X Offset', 0);
  const dy = field('Y Offset', 0);
  const pages = new Map<number, Anchor[]>();
  let anchors: Anchor[] | undefined;
  for (const line of data.slice(headerEnd).split('\n')) {
    if (line[0] === '{') {
      const sheet = Number(line.slice(1));
      if (!Number.isSafeInteger(sheet) || sheet < 1) continue;
      pages.set(sheet - 1, (anchors = []));
    } else if (line[0] === '}') anchors = undefined;
    else if (anchors) {
      const record =
        /^([xhv])(\d+),(\d+)(?:,\d+)?:([+-]?\d+),([+-]?\d+)(?::([+-]?\d+),([+-]?\d+),[+-]?\d+)?/.exec(
          line,
        );
      if (!record || Number(record[2]) !== tag || Number(record[3]) < 1) continue;
      const x = (Number(record[4]) + dx) * scale;
      const y = (Number(record[5]) + dy) * scale;
      const width = Number(record[6] ?? 0) * scale;
      const height = Number(record[7] ?? 0) * scale;
      if (record[1] === 'x' || (width > 0 && height > 0))
        anchors.push({ line: Number(record[3]), x, y, width, height });
    }
  }
  return {
    lineAt(page: number, x: number, y: number) {
      let best: Anchor | undefined;
      let score = Infinity;
      for (const anchor of pages.get(page) ?? []) {
        const across = Math.max(anchor.x - x, x - anchor.x - anchor.width, 0);
        const above = anchor.y - Math.max(anchor.height, 8);
        const vertical = Math.max(above - y, y - anchor.y - 2, 0);
        const distance = Math.hypot(across, 2 * vertical);
        if (distance < score) {
          best = anchor;
          score = distance;
        }
      }
      return best?.line;
    },
  };
}
