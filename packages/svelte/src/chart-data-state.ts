import { readChartData } from '@tumblerjs/charts';

/** A source draft can contain data the grid cannot materialize. Keep its source editor usable. */
export function chartDataState(bytes: Uint8Array) {
  try { return { plots: readChartData(bytes), error: undefined }; }
  catch (cause) {
    return { plots: [], error: cause instanceof Error ? cause.message : 'The chart data could not be read.' };
  }
}
