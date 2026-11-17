/** Checked arithmetic for OOXML animation values. No JS evaluation or document access. */
export type AnimationVariables = Readonly<
  Record<'ppt_x' | 'ppt_y' | 'ppt_w' | 'ppt_h' | 'time', number>
>;
export function animationNumber(source: string, variables: AnimationVariables): number | undefined {
  const tokens =
    source
      .replaceAll('#', '')
      .match(/(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?|[a-zA-Z_][\w]*|[$()+\-*/,]/g) ?? [];
  if (tokens.join('') !== source.replaceAll('#', '').replace(/\s/g, '')) return;
  let index = 0;
  const functions: Readonly<Record<string, (n: number) => number>> = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    abs: Math.abs,
    sqrt: Math.sqrt,
  };
  function primary(): number {
    const token = tokens[index++];
    if (token === '-') return -primary();
    if (token === '+') return primary();
    if (token === '(') {
      const value = expression();
      if (tokens[index++] !== ')') throw new Error('Unclosed expression');
      return value;
    }
    if (token === '$') return variables.time;
    if (token === 'pi') return Math.PI;
    if (token && Object.hasOwn(variables, token)) {
      switch (token) {
        case 'ppt_x':
          return variables.ppt_x;
        case 'ppt_y':
          return variables.ppt_y;
        case 'ppt_w':
          return variables.ppt_w;
        case 'ppt_h':
          return variables.ppt_h;
        case 'time':
          return variables.time;
      }
    }
    if (token && functions[token]) {
      if (tokens[index++] !== '(') throw new Error('Expected argument');
      const value = expression();
      if (tokens[index++] !== ')') throw new Error('Unclosed argument');
      return functions[token]!(value);
    }
    if (!token || !/^\d|^\./.test(token)) throw new Error('Unknown value');
    return Number(token);
  }
  function product(): number {
    let value = primary();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const op = tokens[index++];
      const right = primary();
      value = op === '*' ? value * right : value / right;
    }
    return value;
  }
  function expression(): number {
    let value = product();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const op = tokens[index++];
      const right = product();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }
  try {
    const value = expression();
    return index === tokens.length && Number.isFinite(value) ? value : undefined;
  } catch {
    return;
  }
}
