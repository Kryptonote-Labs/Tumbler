import type { FormulaScalarValue } from "../evaluator.ts";
import {
  functionError, functionNumber, functionNumeric, functionScalar, functionText,
  type ExtendedFunction, type FunctionContext, type FunctionRegistry,
  type FunctionValue, type FormulaFunctionServices,
} from "../function-runtime.ts";

const signatures = {
  CUBEKPIMEMBER: [3, 4], CUBEMEMBER: [2, 3], CUBEMEMBERPROPERTY: [3, 3],
  CUBERANKEDMEMBER: [3, 4], CUBESET: [2, 5], CUBESETCOUNT: [1, 1], CUBEVALUE: [1, 255],
} as const;
type CubeName = keyof typeof signatures;

/** Services receive original evaluated values, including arrays and caption identity. */
function handler(name: CubeName): ExtendedFunction {
  return (args, context) => {
    const [min, max] = signatures[name];
    if (args.length < min || args.length > max) return functionError();
    const values: FunctionValue[] = [];
    let cells = 0;
    for (const arg of args) {
      context.operation();
      // Excel permits long MDX expressions through references, but not literals.
      if ((name === "CUBEMEMBER" || name === "CUBESET") && values.length === 1 &&
          arg.kind === "string" && arg.value.length > 255) return functionError();
      const value = context.evaluate(arg);
      if ("kind" in value) {
        if (value.kind === "lambda") return functionError();
        if (value.kind !== "array") { values.push(value); continue; }
        for (const row of value.rows) {
          cells += row.length;
          if (cells > context.maxArrayCells) return functionError("#NUM!");
          for (const cell of row) {
            context.operation();
            if (cell.type === "error") return cell;
          }
        }
      } else if (value.type === "error") return value;
      values.push(value);
    }
    context.operation();
    const result = context.services?.invoke(name, values, context.address);
    if (result === undefined) return context.unavailable(`${name} requires an explicit cube connection service`);
    // Cube functions return scalar captions/properties/aggregates, never a spill.
    const scalar = functionScalar(result);
    if (scalar.type === "number") return functionNumber(scalar.value);
    return name === "CUBEVALUE" && scalar.type === "blank" ? { type: "string", value: "" } : scalar;
  };
}

export const cubeFunctions: FunctionRegistry = new Map(
  (Object.keys(signatures) as CubeName[]).map(name => [name, handler(name)]),
);

export interface CubeSnapshotMember {
  readonly caption: string;
  readonly properties?: Readonly<Record<string, FormulaScalarValue>>;
  readonly sortValues?: Readonly<Record<string, number>>;
}
/** An explicit finite snapshot, not an MDX interpreter or connection discovery API. */
export interface CubeSnapshot {
  readonly members: Readonly<Record<string, CubeSnapshotMember>>;
  readonly sets: Readonly<Record<string, readonly string[]>>;
  /** KPI name -> six member identities (value, goal, status, trend, weight, time). */
  readonly kpis?: Readonly<Record<string, readonly string[]>>;
  /** JSON.stringify(sorted member identities) -> preaggregated cube cell. [] is default. */
  readonly aggregates: Readonly<Record<string, FormulaScalarValue>>;
}

/**
 * Offline service for explicitly supplied cube snapshots. Unknown MDX is #N/A.
 * Hosts must retain returned scalar object identity for nested/reference metadata.
 * Reopening a workbook requires the host to reconstruct that metadata from source.
 */
export function createCubeSnapshotServices(
  connections: Readonly<Record<string, CubeSnapshot>>,
  limits: Pick<FunctionContext, "operation" | "maxArrayCells">,
): FormulaFunctionServices {
  type Tuple = readonly string[];
  const identities = new WeakMap<FunctionValue, { connection: string; tuples: readonly Tuple[]; set: boolean }>();
  const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
    Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
  const omitted = (v: FunctionValue | undefined): boolean => v !== undefined && "kind" in v && String(v.kind) === "omitted";
  const text = (v: FunctionValue): string => omitted(v) ? "" : functionText(functionScalar(v));
  return {
    invoke(name, args) {
      if (!Object.prototype.hasOwnProperty.call(signatures, name)) return undefined;
      limits.operation();
      if (name === "CUBESETCOUNT") {
        const id = identities.get(args[0]!);
        return id?.set ? functionNumber(id.tuples.length) : functionError("#VALUE!");
      }
      const optional = (index: number) => omitted(args[index]) ? undefined : args[index];
      const connection = text(args[0]!);
      const cube = own(connections, connection);
      if (!cube) return functionError("#NAME?");
      const bounded = (ids: readonly Tuple[]): readonly Tuple[] => {
        let cells = 0;
        for (const tuple of ids) {
          limits.operation();
          cells += tuple.length;
          if (cells > limits.maxArrayCells) throw new RangeError("Cube snapshot exceeds maxArrayCells");
          limits.operation(tuple.length);
        }
        return ids;
      };
      const resolve = (v: FunctionValue, set: boolean): readonly Tuple[] | undefined => {
        const id = identities.get(v);
        if (id) return id.connection === connection && (set || !id.set) ? bounded(id.tuples) : undefined;
        if ("kind" in v) {
          if (v.kind !== "array") return undefined;
          const result: Tuple[] = [];
          let cells = 0;
          for (const row of v.rows) for (const cell of row) {
            limits.operation();
            const ids = resolve(cell, set);
            if (!ids) return undefined;
            for (const tuple of ids) {
              cells += tuple.length;
              if (cells > limits.maxArrayCells) return undefined;
              result.push(tuple);
            }
          }
          return set ? result : [result.flat()];
        }
        const key = text(v);
        const members = set ? own(cube.sets, key) : undefined;
        if (members) return bounded(members.map(member => [member]));
        return own(cube.members, key) ? [[key]] : undefined;
      };
      const display = (ids: readonly Tuple[], set: boolean, caption?: FunctionValue): FunctionValue => {
        bounded(ids);
        const value: FormulaScalarValue = { type: "string", value: caption === undefined ?
          (set ? "" : own(cube.members, ids[0]?.at(-1) ?? "")?.caption ?? "") : text(caption) };
        identities.set(value, { connection, tuples: ids, set });
        return value;
      };
      if (name === "CUBEKPIMEMBER") {
        const property = functionNumeric(functionScalar(args[2]!));
        if (property.type !== "number" || !Number.isInteger(property.value) || property.value < 1 || property.value > 6) return functionError("#N/A");
        const id = own(cube.kpis ?? {}, text(args[1]!))?.[property.value - 1];
        if (!id || !own(cube.members, id)) return functionError("#N/A");
        return display([[id]], false, optional(3) ?? (property.value === 1 ? { type: "string", value: text(args[1]!) } : undefined));
      }
      if (name === "CUBEVALUE") {
        const ids: string[] = [];
        for (const value of args.slice(1)) {
          const members = resolve(value, true);
          if (!members) return functionError("#N/A");
          for (const tuple of members) {
            if (ids.length + tuple.length > limits.maxArrayCells) throw new RangeError("Cube tuple exceeds maxArrayCells");
            for (const member of tuple) ids.push(member);
          }
        }
        bounded([ids]);
        // Sort only identity keys; sets' display order does not affect aggregation.
        limits.operation(ids.length * Math.ceil(Math.log2(ids.length + 1)));
        return own(cube.aggregates, JSON.stringify(ids.sort())) ?? functionError("#N/A");
      }
      const ids = resolve(args[1]!, name === "CUBESET" || name === "CUBERANKEDMEMBER");
      if (!ids || ids.some(tuple => tuple.some(id => !own(cube.members, id)))) return functionError("#N/A");
      if (name === "CUBEMEMBER") return display(ids, false, optional(2));
      if (name === "CUBEMEMBERPROPERTY") {
        if (ids.length !== 1 || ids[0]!.length !== 1) return functionError("#N/A");
        return own(own(cube.members, ids[0]![0]!)!.properties ?? {}, text(args[2]!)) ?? functionError("#N/A");
      }
      if (name === "CUBERANKEDMEMBER") {
        const rank = functionNumeric(functionScalar(args[2]!));
        if (rank.type !== "number" || !Number.isInteger(rank.value) || rank.value < 1 || rank.value > ids.length) return functionError("#N/A");
        return display([ids[rank.value - 1]!], false, optional(3));
      }
      const sortOrder = optional(3);
      const sortBy = optional(4);
      const order = sortOrder === undefined ? functionNumber(0) : functionNumeric(functionScalar(sortOrder));
      if (order.type !== "number" || !Number.isInteger(order.value) || order.value < 0 || order.value > 6) return functionError();
      if ((order.value === 1 || order.value === 2) && sortBy === undefined) return functionError();
      const sorted = [...ids];
      if (order.value === 6) sorted.reverse();
      if (order.value >= 1 && order.value <= 4) {
        limits.operation(ids.length * Math.ceil(Math.log2(ids.length + 1)));
        const measureIdentity = sortBy === undefined ? undefined : resolve(sortBy, false);
        const measure = measureIdentity?.length === 1 && measureIdentity[0]!.length === 1 ? measureIdentity[0]![0]! : "";
        // Snapshot sort keys describe individual members, not tuple intersections.
        if (order.value <= 2 && ids.some(tuple => tuple.length !== 1)) return functionError("#N/A");
        if (order.value <= 2 && (!measure || ids.some(tuple => !Number.isFinite(own(cube.members, tuple[0]!)!.sortValues?.[measure])))) return functionError("#N/A");
        sorted.sort((a, b) => {
          const left = own(cube.members, a.at(-1)!)!; const right = own(cube.members, b.at(-1)!)!;
          const result = order.value <= 2 ? left.sortValues![measure]! - right.sortValues![measure]! :
            (left.caption < right.caption ? -1 : left.caption > right.caption ? 1 : 0);
          return order.value % 2 === 0 ? -result : result;
        });
      }
      return display(sorted, true, optional(2));
    },
  };
}
