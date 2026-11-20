import { describe, expect, test } from 'bun:test';
import {
  deleteLatexTableColumn,
  deleteLatexTableRow,
  insertLatexTableColumn,
  insertLatexTableRow,
  latexFigureSource,
  readLatexFigure,
  readLatexTabular,
  setLatexCaption,
  setLatexFigureWidth,
  setLatexTableCell,
} from '../src/latex';

describe('figures', () => {
  test('width, caption and file edits keep the rest of the figure', () => {
    const source =
      '\\begin{figure}[t]\n\\centering\n\\includegraphics[angle=90]{plot}\n\\label{fig:a}\n\\end{figure}';
    const wide = setLatexFigureWidth(source, 0.5);
    expect(wide).toContain('\\includegraphics[width=.5\\linewidth,angle=90]{plot}');
    expect(readLatexFigure(wide)?.width).toBe(0.5);
    const captioned = setLatexCaption(wide, 'Growth & decay', false, readLatexFigure(wide)!.graphic!.end);
    expect(captioned).toContain('{plot}\n\\caption{Growth \\& decay}\n\\label{fig:a}');
    expect(readLatexFigure(captioned)?.caption?.text).toBe('Growth & decay');
    expect(setLatexCaption(captioned, '', false, 0)).not.toContain('\\caption');
    expect(readLatexFigure(latexFigureSource('a.png'))?.path).toBe('a.png');
  });

  test('reads the PDF page selected by includegraphics', () => {
    const source = '\\begin{figure}\\includegraphics[page=3,width=.5\\linewidth]{plot.pdf}\\end{figure}';
    expect(readLatexFigure(source)).toMatchObject({ path: 'plot.pdf', width: 0.5, page: 3 });
    expect(readLatexFigure(latexFigureSource('plot.pdf'))?.page).toBe(1);
  });
});

describe('tables', () => {
  const source = [
    '\\begin{table}\\centering',
    '\\begin{tabular}{|l|r|}',
    '\\toprule',
    'Name & \\textbf{Value} \\\\ \\midrule',
    'A & 1 \\\\',
    'B & 2 % note',
    '\\\\ \\bottomrule',
    '\\end{tabular}',
    '\\end{table}',
  ].join('\n');

  test('reads rows and cells and writes untouched source back exactly', () => {
    const table = readLatexTabular(source)!;
    expect(table.grid).toBe(true);
    expect(table.rows.map((row) => row.cells.map((cell) => cell.body))).toEqual([
      ['Name', '\\textbf{Value}'],
      ['A', '1'],
      ['B', '2 % note'],
    ]);
    expect(setLatexTableCell(source, 1, 1, '1', false)).toBe(source);
    expect(setLatexTableCell(source, 1, 0, 'R&D', false)).toContain('R\\&D & 1');
  });

  test('row and column edits keep rules and the column layout', () => {
    const rows = insertLatexTableRow(source, 1, true);
    expect(readLatexTabular(rows)!.rows.length).toBe(4);
    expect(rows).toContain('\\bottomrule');
    expect(readLatexTabular(deleteLatexTableRow(rows, 2))!.rows.length).toBe(3);
    const columns = insertLatexTableColumn(source, 0, true);
    expect(readLatexTabular(columns)!.spec.columns.length).toBe(3);
    expect(columns).toContain('Name &  & \\textbf{Value}');
    expect(deleteLatexTableColumn(columns, 1)).toContain('\\begin{tabular}{|l|r|}');
  });

  test('multicolumn tables stay editable by cell but not by grid', () => {
    const merged = '\\begin{tabular}{ll}\\multicolumn{2}{c}{Head}\\\\ a & b\\end{tabular}';
    expect(readLatexTabular(merged)!.grid).toBe(false);
    expect(insertLatexTableRow(merged, 0, true)).toBe(merged);
  });

  test('inserting after the header places the new row below the header rule', () => {
    const inserted = insertLatexTableRow(source, 0, true);
    const [head, newRow, formerFirstRow] = readLatexTabular(inserted)!.rows;
    expect(head?.rules.trim()).toBe('\\toprule');
    expect(newRow?.rules.trim()).toBe('\\midrule');
    expect(newRow?.cells.map((cell) => cell.body)).toEqual(['', '']);
    expect(formerFirstRow?.rules.trim()).toBe('');
    expect(formerFirstRow?.cells[0]?.body).toBe('A');
  });
});
