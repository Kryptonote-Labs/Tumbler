const colors: Readonly<Record<string, string>> = {
  black: '#000000', blue: '#0000FF', cyan: '#00FFFF', green: '#00FF00',
  magenta: '#FF00FF', red: '#FF0000', yellow: '#FFFF00', white: '#FFFFFF',
  darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000',
  darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000',
  darkGray: '#808080', lightGray: '#C0C0C0',
};
/** OOXML highlight palette names are not all CSS named colours. */
export function wordHighlightColor(value: string | undefined): string {
  return value && Object.hasOwn(colors, value) ? colors[value]! : 'transparent';
}
