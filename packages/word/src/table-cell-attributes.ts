import type { WordCellFormat, WordRowFormat } from './table-format.ts';

export type TableCell = {
  schema?: 2;
  format?: WordCellFormat;
  rowFormat?: WordRowFormat;
  id: string;
  row: string;
  cell: string;
  column: number;
  columns: number;
  widths?: number[];
  before?: number;
  after?: number;
  span?: number;
  merge?: 'restart' | 'continue';
  source?: {
    table: number;
    row?: number;
    cell?: number;
  };
  parents?: TableCell[];
};
