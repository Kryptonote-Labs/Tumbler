import "./statistics/legacy-distributions.ts";
import "./statistics/legacy-tests.ts";
import "./statistics/distributions.ts";
import "./statistics/descriptive.ts";
import "./statistics/conditional.ts";
import "./statistics/regression.ts";
import "./statistics/forecast.ts";
import { registry } from "./statistics/runtime.ts";
import type { FunctionRegistry } from "../function-runtime.ts";

/** ECMA-376 §18.17.7 statistical functions and their MS-XLSX successors. */
export const statisticalFunctions: FunctionRegistry = registry;
