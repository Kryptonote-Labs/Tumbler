import {
  createWordStory,
  wordStoryArtifact,
  wordSections,
  type WordArtifact,
} from "@tumblerjs/word";
/** New stories are staged in memory. A read never writes the file; the first accepted edit commits them. */
export function fileRegion(source: WordArtifact, region: string) {
  if (region === "body") return source;
  const match = /^(header|footer):(\d+):(default|first|even)$/.exec(region);
  if (!match) return wordStoryArtifact(source, region);
  const kind = match[1] === "header" ? "header" : "footer";
  const type = match[3] === "first" ? "first" : match[3] === "even" ? "even" : "default";
  const created = createWordStory(source, { kind, type, section: Number(match[2]) });
  return wordStoryArtifact(created.artifact, created.partName);
}
export function fileRegions(source: WordArtifact) {
  return {
    regions: [
      { name: "body" },
      ...source.document.headerFooters.map((story) => ({
        name: story.part.name.value,
        kind: story.kind,
        type: story.type,
      })),
      ...wordSections(source.document).flatMap((_, section) =>
        ["header", "footer"].flatMap((kind) =>
          ["default", "first", "even"].map((type) => ({
            name: `${kind}:${section}:${type}`,
            kind,
            type,
            section,
          })),
        ),
      ),
    ],
  };
}
