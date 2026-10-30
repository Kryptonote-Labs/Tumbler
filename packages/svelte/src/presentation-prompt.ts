import { slideTextValue, type SlideObject, type SlideText } from "@tumblerjs/slides";

/**
 * PowerPoint's prompt for an empty placeholder, laid out with the formatting typed text will take,
 * so the prompt sits exactly where the first character will appear.
 */
export function placeholderPrompt(object: SlideObject): SlideText | undefined {
  const paragraph = object.text?.paragraphs[0];
  if (!object.placeholder || !paragraph?.endRun || slideTextValue(object)) return;
  const text =
    object.placeholder === "title" || object.placeholder === "ctrTitle"
      ? "Click to add title"
      : object.placeholder === "subTitle"
        ? "Click to add subtitle"
        : "Click to add text";
  return {
    ...object.text!,
    paragraphs: [
      { ...paragraph, runs: [{ ...paragraph.endRun, text, color: "#7f7f7f" }], bulletColor: "#7f7f7f" },
    ],
  };
}
