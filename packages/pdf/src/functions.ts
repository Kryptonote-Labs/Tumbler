import {
  array,
  dictionary,
  integer,
  invalid,
  number,
  PdfStream,
  type PdfDictionary,
  type PdfValue,
  unsupported,
} from "./objects.ts";
import type { PdfSource } from "./source.ts";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** PDF functions used by colour spaces and shadings, ISO 32000-1 7.10. */
export function evaluateFunction(
  source: PdfSource,
  value: PdfValue | undefined,
  input: readonly number[],
  depth = 0,
): number[] {
  if (depth > 32) return invalid("Cyclic or excessively nested PDF function.");
  const resolved = source.resolve(value);
  if (Array.isArray(resolved))
    return resolved.flatMap((item) => evaluateFunction(source, item, input, depth + 1));
  const info = dictionary(resolved),
    domain = array(source.resolve(info.get("Domain"))).map((value) => number(value));
  if (domain.length !== input.length * 2)
    return invalid("PDF function input count does not match Domain.");
  const x = input.map((value, i) => clamp(value, domain[i * 2]!, domain[i * 2 + 1]!));
  let output: number[];
  switch (integer(info.get("FunctionType"))) {
    case 2: {
      if (x.length !== 1) return invalid("Exponential PDF function requires one input.");
      const c0 = info.has("C0")
        ? array(source.resolve(info.get("C0"))).map((value) => number(value))
        : [0];
      const c1 = info.has("C1")
        ? array(source.resolve(info.get("C1"))).map((value) => number(value))
        : [1];
      if (c0.length !== c1.length) return invalid("Exponential PDF function output counts differ.");
      const power = x[0]! ** number(info.get("N"));
      output = c0.map((value, i) => value + power * (c1[i]! - value));
      break;
    }
    case 3: {
      if (x.length !== 1) return invalid("Stitching PDF function requires one input.");
      const functions = array(source.resolve(info.get("Functions"))),
        bounds = [
          domain[0]!,
          ...array(source.resolve(info.get("Bounds"))).map((value) => number(value)),
          domain[1]!,
        ];
      const encode = array(source.resolve(info.get("Encode"))).map((value) => number(value));
      if (bounds.length !== functions.length + 1 || encode.length !== functions.length * 2)
        return invalid("Invalid stitching function intervals.");
      let index = 0;
      while (index < functions.length - 1 && x[0]! >= bounds[index + 1]!) index++;
      const span = bounds[index + 1]! - bounds[index]!;
      if (span <= 0) return invalid("Non-increasing stitching function bounds.");
      const mapped =
        encode[index * 2]! +
        ((x[0]! - bounds[index]!) / span) * (encode[index * 2 + 1]! - encode[index * 2]!);
      output = evaluateFunction(source, functions[index], [mapped], depth + 1);
      break;
    }
    case 0: {
      if (!(resolved instanceof PdfStream))
        return invalid("Sampled PDF function must be a stream.");
      const sizes = array(source.resolve(info.get("Size"))).map((value) => integer(value));
      const range = array(source.resolve(info.get("Range"))).map((value) => number(value));
      const count = range.length / 2,
        bits = integer(info.get("BitsPerSample"));
      if (
        sizes.length !== input.length ||
        sizes.some((value) => value < 1) ||
        ![1, 2, 4, 8, 12, 16, 24, 32].includes(bits) ||
        !Number.isInteger(count)
      )
        return invalid("Invalid sampled PDF function.");
      if (integer(info.get("Order"), 1) !== 1)
        return unsupported("Cubic sampled PDF function interpolation needs a cubic evaluator.");
      if (sizes.length > 8)
        return unsupported("This sampled function needs higher-dimensional interpolation.");
      const encode = info.has("Encode")
        ? array(source.resolve(info.get("Encode"))).map((value) => number(value))
        : sizes.flatMap((size) => [0, size - 1]);
      const decode = info.has("Decode")
        ? array(source.resolve(info.get("Decode"))).map((value) => number(value))
        : range;
      const positions = x.map((value, i) =>
        clamp(
          encode[i * 2]! +
            ((value - domain[i * 2]!) / (domain[i * 2 + 1]! - domain[i * 2]!)) *
              (encode[i * 2 + 1]! - encode[i * 2]!),
          0,
          sizes[i]! - 1,
        ),
      );
      const bytes = source.stream(resolved),
        max = 2 ** bits - 1;
      output = Array.from({ length: count }, () => 0);
      for (let corner = 0; corner < 2 ** sizes.length; corner++) {
        let weight = 1,
          offset = 0,
          stride = 1;
        for (let i = 0; i < sizes.length; i++) {
          const lower = Math.floor(positions[i]!),
            fraction = positions[i]! - lower,
            upper = (corner >> i) & 1;
          weight *= upper ? fraction : 1 - fraction;
          offset += Math.min(sizes[i]! - 1, lower + upper) * stride;
          stride *= sizes[i]!;
        }
        if (!weight) continue;
        for (let channel = 0; channel < count; channel++) {
          let sample = 0,
            start = (offset * count + channel) * bits;
          for (let i = 0; i < bits; i++, start++) {
            if (start >> 3 >= bytes.length) return invalid("Truncated sampled function data.");
            sample = sample * 2 + ((bytes[start >> 3]! >> (7 - (start & 7))) & 1);
          }
          output[channel] =
            output[channel]! +
            weight *
              (decode[channel * 2]! +
                (sample / max) * (decode[channel * 2 + 1]! - decode[channel * 2]!));
        }
      }
      break;
    }
    default:
      return unsupported(
        `PDF function type ${integer(info.get("FunctionType"))} needs its evaluator.`,
      );
  }
  if (info.has("Range")) {
    const range = array(source.resolve(info.get("Range"))).map((value) => number(value));
    if (range.length !== output.length * 2)
      return invalid("PDF function Range does not match outputs.");
    output = output.map((value, i) => clamp(value, range[i * 2]!, range[i * 2 + 1]!));
  }
  return output;
}
