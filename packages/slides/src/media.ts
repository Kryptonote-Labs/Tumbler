import type { OpcPackage } from "@tumblerjs/opc";
import type { LosslessXmlElement } from "@tumblerjs/ooxml";
export interface PresentationMedia {
  readonly kind: "audio" | "video";
  readonly bytes?: Uint8Array;
  readonly url?: string;
  readonly contentType: string;
  readonly start: number;
  readonly end?: number;
}
const attr = (e: LosslessXmlElement | undefined, n: string) =>
  e?.attributes.find((a) => a.localName === n)?.value;
/** Media references may be internal even when DrawingML calls the attribute r:link. */
export function readPresentationMedia(
  pkg: OpcPackage,
  part: string,
  elements: readonly LosslessXmlElement[],
): PresentationMedia | undefined {
  const source = elements.find((e) =>
    ["audioFile", "videoFile", "wavAudioFile"].includes(e.localName),
  );
  const extension = elements.find(
    (e) =>
      e.localName === "media" &&
      e.namespaceUri ===
        "http://schemas.microsoft.com/office/powerpoint/2010/main",
  );
  if (!source && !extension) return;
  const id =
    attr(extension, "embed") ??
    attr(extension, "link") ??
    attr(source, "embed") ??
    attr(source, "link");
  if (!id) return;
  const relation = pkg.relationships(pkg.getPart(part)!.name).get(id);
  if (!relation || !/\/(audio|video|media)$/.test(relation.type)) return;
  const target =
    relation.targetMode === "Internal"
      ? pkg.getPart(relation.targetPartName)
      : undefined;
  const contentType =
    target?.contentType ??
    (source?.localName === "audioFile" ? "audio/mpeg" : "video/mp4");
  const kind =
    contentType.startsWith("audio/") ||
    source?.localName === "audioFile" ||
    source?.localName === "wavAudioFile"
      ? "audio"
      : "video";
  const trim = extension?.children.find(
    (e): e is LosslessXmlElement =>
      e.kind === "element" && e.localName === "trim",
  );
  const start = Number(attr(trim, "st") ?? 0) / 1000,
    end = attr(trim, "end");
  const timing = {
    start: Number.isFinite(start) ? Math.max(0, start) : 0,
    ...(end && Number.isFinite(Number(end)) ? { end: Number(end) / 1000 } : {}),
  };
  if (target)
    return { kind, contentType, bytes: pkg.readPart(target), ...timing };
  if (relation.targetMode === "External")
    try {
      const url = new URL(relation.target);
      if (["https:", "http:"].includes(url.protocol))
        return { kind, contentType, url: url.href, ...timing };
    } catch {}
}
