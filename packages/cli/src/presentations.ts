import { presentationCommand, type PresentationCommand } from "@tumblerjs/slides";
import { z } from "zod";
export interface PresentationOperationHost {
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
  if (name && name !== "read" && !schema) throw new Error(`Unknown presentation command: ${name}`);
  return (
    [
      `Usage: ${commandName} <document> slides read [--slide <slide-id>]`,
      `${commandName} <document> slides <command> --input JSON [--page <read-handle>]`,
      "Read the slide before editing. Commands use slideId and objectKey from that read. One command is one undo step.",
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
  for (let i = 0; i < flags.length; i += 2) {
    const key = flags[i]!,
      value = flags[i + 1];
    if (
      !["--input", "--page", "--slide"].includes(key) ||
      value === undefined ||
      Object.hasOwn(values, key)
    )
      throw new Error("Use --input JSON, --page, or --slide once.");
    values[key] = value;
  }
  if (name === "read") {
    if (values["--input"] || values["--page"])
      throw new Error("Presentation reads accept only --slide.");
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
  const input: unknown = JSON.parse(values["--input"]);
  if (typeof input !== "object" || !input || Array.isArray(input))
    throw new Error("Command input must be an object.");
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
