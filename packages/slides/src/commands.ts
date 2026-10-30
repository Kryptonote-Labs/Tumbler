import { editPresentationTable } from "./table-edit.ts";
import { pastePresentationObject } from "./clipboard.ts";
import { openPresentationArtifact } from "./artifact.ts";
import { z } from "zod";
import { normalizeFormattingPatch, type FormattingPatch } from "@tumblerjs/core";
import { type PresentationArtifact } from "./artifact.ts";
import {
  deleteSlide,
  insertSlide,
  moveSlide,
  slideBackground,
  slideById,
} from "./authoring-slides.ts";
import { arrangeObject, deleteObject, duplicateObject, insertObject } from "./authoring-objects.ts";
import { applyPresentationLayout } from "./authoring-layout.ts";
import { slideTextValue } from "./editing.ts";
import { paragraphFormat } from "./paragraph-format.ts";

const number = z.number().finite();
const id = z.string().min(1);
const target = { slideId: id, objectKey: id };
const range = { start: z.number().int().nonnegative(), end: z.number().int().nonnegative() };
const cell = z
  .object({ row: z.number().int().nonnegative(), column: z.number().int().nonnegative() })
  .strict()
  .optional();
const bounds = z
  .object({ x: number, y: number, width: number.nonnegative(), height: number.nonnegative() })
  .strict();
const color = z.string().regex(/^(#[a-f\d]{6}|none)$/i);
const change = <T extends z.ZodType>(value: T) =>
  z.union([z.object({ set: value }).strict(), z.object({ inherit: z.literal(true) }).strict()]);
const patch = z
  .object({
    text: z
      .object({
        fontSize: change(z.number().min(1).max(4000)).optional(),
        fontFamily: change(z.string().trim().min(1).max(255)).optional(),
        bold: change(z.boolean()).optional(),
        italic: change(z.boolean()).optional(),
        underline: change(z.enum(["none", "single", "double"])).optional(),
        color: change(
          z.discriminatedUnion("type", [
            z.object({ type: z.literal("automatic") }).strict(),
            z
              .object({ type: z.literal("rgb"), value: z.string().regex(/^#[a-f\d]{6}$/i) })
              .strict(),
          ]),
        ).optional(),
      })
      .strict()
      .optional(),
    block: z
      .object({
        horizontalAlignment: change(z.enum(["start", "center", "end", "justify"])).optional(),
        verticalAlignment: change(z.enum(["top", "center", "bottom"])).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .transform((value) => normalizeFormattingPatch(value as FormattingPatch));
const singlePresentationCommand = z.discriminatedUnion("name", [
  z
    .object({
      name: z.literal("edit-table"),
      ...target,
      action: z.enum([
        "insert-row",
        "delete-row",
        "insert-column",
        "delete-column",
        "merge",
        "split",
      ]),
      row: z.number().int().nonnegative(),
      column: z.number().int().nonnegative(),
      endRow: z.number().int().nonnegative().optional(),
      endColumn: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      name: z.literal("paste-object"),
      slideId: id,
      source: z.string(),
      sourceSlideId: id,
      objectKey: id,
    })
    .strict(),
  z
    .object({
      name: z.literal("layout"),
      slideId: id,
      layout: z.enum(["blank", "title", "title-content", "two-content"]),
    })
    .strict(),
  z
    .object({
      name: z.literal("insert-slide"),
      index: z.number().int().nonnegative(),
      sourceId: id.optional(),
    })
    .strict(),
  z.object({ name: z.literal("delete-slide"), slideId: id }).strict(),
  z
    .object({ name: z.literal("move-slide"), slideId: id, index: z.number().int().nonnegative() })
    .strict(),
  z
    .object({
      name: z.literal("background"),
      slideId: id,
      color: z.string().regex(/^#[a-f\d]{6}$/i),
    })
    .strict(),
  z
    .object({
      name: z.literal("insert-object"),
      slideId: id,
      bounds,
      object: z.discriminatedUnion("kind", [
        z
          .object({
            kind: z.literal("shape"),
            geometry: z
              .enum([
                "rect",
                "roundRect",
                "ellipse",
                "triangle",
                "diamond",
                "line",
                "rightArrow",
                "chevron",
                "star5",
              ])
              .optional(),
            text: z.string().optional(),
            fill: color.optional(),
            stroke: color.optional(),
            fontSize: number.min(1).max(4000).optional(),
          })
          .strict(),
        z
          .object({
            kind: z.literal("image"),
            data: z.string(),
            contentType: z.enum(["image/png", "image/jpeg"]),
          })
          .strict(),
        z
          .object({
            kind: z.literal("table"),
            rows: z.number().int().positive(),
            columns: z.number().int().positive(),
          })
          .strict(),
      ]),
    })
    .strict(),
  z.object({ name: z.literal("delete-object"), ...target }).strict(),
  z.object({ name: z.literal("duplicate-object"), ...target }).strict(),
  z
    .object({
      name: z.literal("arrange"),
      ...target,
      action: z.enum([
        "front",
        "back",
        "forward",
        "backward",
        "left",
        "center",
        "right",
        "top",
        "middle",
        "bottom",
      ]),
    })
    .strict(),
  z
    .object({
      name: z.literal("update-object"),
      ...target,
      ...bounds.shape,
      rotation: number.optional(),
    })
    .strict(),
  z
    .object({
      name: z.literal("edit-text"),
      ...target,
      ...range,
      cell,
      value: z.string(),
      formatting: patch.optional(),
    })
    .strict(),
  z.object({ name: z.literal("format-text"), ...target, ...range, cell, patch }).strict(),
  z
    .object({
      name: z.literal("style-shape"),
      ...target,
      fill: color.optional(),
      stroke: color.optional(),
      strokeWidth: number.nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      name: z.literal("paragraph"),
      ...target,
      ...range,
      cell,
      bullet: z.enum(["none", "bullet", "number"]).optional(),
      level: z.number().int().min(0).max(8).optional(),
      lineSpacing: number.positive().optional(),
      before: number.nonnegative().optional(),
      after: number.nonnegative().optional(),
      verticalAlignment: z.enum(["top", "center", "bottom"]).optional(),
    })
    .strict(),
  z
    .object({
      name: z.literal("replace-all"),
      find: z.string().min(1),
      value: z.string(),
      caseSensitive: z.boolean().default(false),
    })
    .strict(),
]);
/** A group is applied and persisted as one undoable edit. Nested groups are unnecessary. */
export const presentationCommand = z.discriminatedUnion("name", [
  ...singlePresentationCommand.options,
  z.object({ name: z.literal("batch"), commands: z.array(singlePresentationCommand).min(1) }).strict(),
]);
export type PresentationCommand = z.infer<typeof presentationCommand>;

/** The same validated semantic commands serve a local editor, hosted service, and CLI. */
export function applyPresentationCommand(
  artifact: PresentationArtifact,
  input: PresentationCommand,
): PresentationArtifact {
  const command = presentationCommand.parse(input);
  switch (command.name) {
    case "batch":
      return command.commands.reduce(applyPresentationCommand, artifact);
    case "edit-table":
      return editPresentationTable(artifact, command);
    case "paste-object":
      return pastePresentationObject(
        artifact,
        command.slideId,
        openPresentationArtifact(
          Uint8Array.from(atob(command.source), (c) => c.charCodeAt(0)),
          artifact.options,
        ),
        command.sourceSlideId,
        command.objectKey,
      );
    case "layout":
      return applyPresentationLayout(artifact, command.slideId, command.layout);
    case "insert-slide":
      return insertSlide(artifact, command.index, command.sourceId);
    case "delete-slide":
      return deleteSlide(artifact, command.slideId);
    case "move-slide":
      return moveSlide(artifact, command.slideId, command.index);
    case "background":
      return slideBackground(artifact, command.slideId, command.color);
    case "insert-object":
      return insertObject(artifact, command.slideId, command.bounds, command.object);
    case "delete-object":
      return deleteObject(artifact, command.slideId, command.objectKey);
    case "duplicate-object":
      return duplicateObject(artifact, command.slideId, command.objectKey);
    case "arrange":
      return arrangeObject(artifact, command.slideId, command.objectKey, command.action);
    case "update-object":
      return artifact.updateObject(command);
    case "edit-text":
      return artifact.editText(command);
    case "format-text":
      return artifact.formatText(command);
    case "style-shape":
      return artifact.styleShape(command);
    case "paragraph":
      return paragraphFormat(artifact, command);
    case "replace-all": {
      let result = artifact;
      const literal = command.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const expression = new RegExp(literal, command.caseSensitive ? "gu" : "giu");
      for (const slide of artifact.document.slides)
        for (const object of slide.objects) {
          if (!object.textEditable) continue;
          const value = slideTextValue(object);
          const positions = [...value.matchAll(expression)].map((match) => match.index);
          for (const start of positions.reverse())
            result = result.editText({
              slideId: slide.id,
              objectKey: object.key,
              start,
              end: start + command.find.length,
              value: command.value,
            });
        }
      return result;
    }
  }
}
