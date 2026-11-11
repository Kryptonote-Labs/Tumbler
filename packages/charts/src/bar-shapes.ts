/** ECMA-376 ST_Shape, shared by typed creation, conversion and source parsing. */
export const CHART_BAR_SHAPES = ['box', 'cylinder', 'cone', 'coneToMax', 'pyramid', 'pyramidToMax'] as const;
export type ChartBarShape = typeof CHART_BAR_SHAPES[number];
