import { z } from 'zod';
import { isChartResources } from './resources.ts';

const relationship = z.object({
  id: z.string().min(1), type: z.string().min(1), target: z.string().min(1),
  targetMode: z.enum(['Internal', 'External']).optional(), fragment: z.string().optional(),
}).strict();

/** Shared native-command schema; its complete structure remains discoverable in CLI JSON help. */
export const chartResourcesSchema = z.object({
  parts: z.array(z.object({ key: z.string().min(1), contentType: z.string().min(1), data: z.string(), relationships: z.array(relationship).readonly().optional() }).strict()).readonly(),
  relationships: z.array(relationship).readonly(),
}).strict().refine(isChartResources, 'Invalid chart resource graph.');
