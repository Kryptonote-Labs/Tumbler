import { presentationCommand, type PresentationCommand } from "@tumblerjs/slides";
import { z } from "zod";
import { replacementValue } from "./replacement-value.ts";

const textCommands = ["insert-object", "edit-text", "set-notes"];
const textHelp = String.raw`Text input for insert-object (shape), edit-text and set-notes: omit the text field from --input and supply --value <text> to decode \n, \r, \t and \\ once. Add --literal to preserve backslashes, or use --value-file <path|-> for exact UTF-8 text from a file or stdin. Supply only one text source. Structured --input JSON uses JSON escaping only; batch text stays in JSON.`;
export interface PresentationOperationHost {
  renderPresentation?(document: string, slideId?: string): Promise<unknown>;
  readPresentation?(document: string, slideId?: string): Promise<unknown>;
  operatePresentation?(
    document: string,
    input: { page?: string; command: PresentationCommand },
  ): Promise<unknown>;
}
export function presentationHelp(commandName = "tumbler", name?: string) {
  const schema = name
    ? presentationCommand.options.find((option) => option.shape.name.value === name)
    : undefined;
  if (name && name !== "read" && name !== "render" && !schema) throw new Error(`Unknown presentation command: ${name}`);
  return (
    [
      `Usage: ${commandName} <document> slides read [--slide <slide-id>]`,
      `${commandName} <document> slides render [--slide <slide-id>]`,
      `${commandName} <document> slides <command> --input JSON [--page <read-handle>]`,
      ...(!name || textCommands.includes(name) ? [textHelp] : []),
      "Read the slide before editing. Commands use slideId and objectKey from that read. One command is one undo step.",
      "Without --slide, read returns the first slide. To read another slide, use its id from slides, not its number or title. An empty slide has empty:true, objectCount:0 and objects:[]; notes and background are reported separately.",
      "Commands: " +
        presentationCommand.options.map((option) => option.shape.name.value).join(", "),
      ...(schema
        ? [JSON.stringify(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }), null, 2)]
        : [`Use ${commandName} <document> slides <command> --help for fields.`]),
    ].join("\n") + "\n"
  );
}
/** Hosts own permission and stale-page policy; the CLI validates the shared engine command. */
export async function runPresentation(
  argv: readonly string[],
  options: {
    host: PresentationOperationHost;
    commandName?: string;
    readValue?: (path: string) => Promise<string>;
    stdout: (text: string) => void;
  },
) {
  const [document, , name, ...flags] = argv;
  if (!document) throw new Error("Supply a presentation document.");
  if (!name || flags.includes("--help") || name === "--help") {
    options.stdout(presentationHelp(options.commandName, name === "--help" ? undefined : name));
    return;
  }
  const values: Record<string, string> = {};
  for (let i = 0; i < flags.length; i++) {
    const key = flags[i]!,
      value = key === "--literal" ? "true" : flags[++i];
    if (
      !["--input", "--page", "--slide", "--value", "--value-file", "--literal"].includes(key) ||
      value === undefined ||
      Object.hasOwn(values, key)
    )
      throw new Error("Use --input JSON, --page, --slide, --value, --value-file, or --literal once.");
    values[key] = value;
  }
  if (name === "read" || name === "render") {
    if (Object.keys(values).some((key) => key !== "--slide"))
      throw new Error("Presentation reads accept only --slide.");
    if (name === "render") {
      if (!options.host.renderPresentation) throw new Error("Slide rendering is unavailable on this host.");
      options.stdout(JSON.stringify(await options.host.renderPresentation(document, values["--slide"])) + "\n");
      return;
    }
    if (!options.host.readPresentation)
      throw new Error("Presentation reading is unavailable on this host.");
    options.stdout(
      JSON.stringify(await options.host.readPresentation(document, values["--slide"])) + "\n",
    );
    return;
  }
  if (values["--slide"] || !values["--input"])
    throw new Error("Presentation edits require --input JSON and optional --page.");
  if (!options.host.operatePresentation)
    throw new Error("Presentation editing is unavailable on this host.");
  let input = z.record(z.string(), z.unknown()).parse(JSON.parse(values["--input"]));
  const textFlags = ["--value", "--value-file", "--literal"].some((key) => Object.hasOwn(values, key));
  if (textFlags) {
    if (!textCommands.includes(name))
      throw new Error("Text flags are supported only for insert-object shapes, edit-text and set-notes.");
    const object = name === "insert-object"
      ? z.object({ kind: z.literal("shape") }).passthrough().parse(input.object)
      : undefined;
    const field = name === "edit-text" ? "value" : name === "set-notes" ? "notes" : "text";
    if (Object.hasOwn(object ?? input, field))
      throw new Error(`Supply text in --input or a text flag, not both. Omit ${field} from --input.`);
    const value = await replacementValue({
      value: values["--value"],
      valueFile: values["--value-file"],
      literal: values["--literal"] === undefined ? undefined : true,
    }, options.readValue);
    input = object ? { ...input, object: { ...object, text: value } } : { ...input, [field]: value };
  }
  const command = presentationCommand.parse({ ...input, name });
  options.stdout(
    JSON.stringify(
      await options.host.operatePresentation(document, {
        ...(values["--page"] ? { page: values["--page"] } : {}),
        command,
      }),
    ) + "\n",
  );
}
