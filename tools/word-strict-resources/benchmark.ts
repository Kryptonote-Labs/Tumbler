import { cpus } from 'node:os';
import { generate } from './generate.ts';
const warmups = 10, samples = 9, iterations = 10;
for (let i = 0; i < warmups; i++) generate('strict').bytes();
const timings: number[] = [], cpuMicros: number[] = [], heapDeltas: number[] = [];
let bytes = 0;
for (let s = 0; s < samples; s++) {
  Bun.gc(true);
  const heap = process.memoryUsage().heapUsed, cpu = process.cpuUsage(), start = performance.now();
  for (let i = 0; i < iterations; i++) bytes = generate('strict').bytes().length;
  timings.push((performance.now() - start) / iterations);
  const used = process.cpuUsage(cpu);
  cpuMicros.push((used.user + used.system) / iterations);
  heapDeltas.push(process.memoryUsage().heapUsed - heap);
}
console.log(JSON.stringify({ bun: Bun.version, cpu: cpus()[0]?.model, warmups, samples, iterations, operations: samples * iterations, timings, cpuMicros, heapDeltas, maxRssKiB: process.resourceUsage().maxRSS, bytes }, null, 2));
