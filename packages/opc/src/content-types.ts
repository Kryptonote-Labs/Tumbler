import { PartName, PartNameError } from "./part-name.ts";
import {
  parsePackageXml,
  requireExactAttributes,
  unqualifiedAttributes,
} from "./xml/parser.ts";
import type { ZipArchive } from "./zip/archive.ts";

const CONTENT_TYPES_ITEM_NAME = "[Content_Types].xml";
const CONTENT_TYPES_NAMESPACE =
  "http://schemas.openxmlformats.org/package/2006/content-types";
const EXTENSION_PATTERN = /^(?:[!$&'()*+,:=@A-Za-z0-9_~-]|%[0-9A-Fa-f]{2})+$/;
const MEDIA_TYPE_TOKEN = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
const MEDIA_TYPE_QUOTED =
  '"(?:[\\x20-\\x21\\x23-\\x5b\\x5d-\\x7e\\x80-\\xff]|\\\\[\\x20-\\x7e])*"';
const MEDIA_TYPE_PATTERN = new RegExp(
  `^${MEDIA_TYPE_TOKEN}/${MEDIA_TYPE_TOKEN}` +
    `(?:[ \\t]*;[ \\t]*${MEDIA_TYPE_TOKEN}[ \\t]*=[ \\t]*(?:${MEDIA_TYPE_TOKEN}|${MEDIA_TYPE_QUOTED}))*$`,
);

export type ContentTypesErrorCode =
  | "duplicate_default"
  | "duplicate_override"
  | "invalid_content_type"
  | "invalid_extension"
  | "invalid_part_name"
  | "invalid_xml"
  | "missing_content_type"
  | "missing_item";

export class ContentTypesError extends Error {
  readonly code: ContentTypesErrorCode;

  constructor(
    code: ContentTypesErrorCode,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ContentTypesError";
    this.code = code;
  }
}

export interface ContentTypeDefault {
  readonly extension: string;
  readonly contentType: string;
}

export interface ContentTypeOverride {
  readonly partName: PartName;
  readonly contentType: string;
}

export class ContentTypes {
  readonly defaults: readonly ContentTypeDefault[];
  readonly overrides: readonly ContentTypeOverride[];
  readonly #defaultsByExtension: ReadonlyMap<string, string>;
  readonly #overridesByPartName: ReadonlyMap<string, string>;

  constructor(
    defaults: readonly ContentTypeDefault[],
    overrides: readonly ContentTypeOverride[],
  ) {
    this.defaults = Object.freeze([...defaults]);
    this.overrides = Object.freeze([...overrides]);
    this.#defaultsByExtension = new Map(
      defaults.map(({ extension, contentType }) => [asciiLowercase(extension), contentType]),
    );
    this.#overridesByPartName = new Map(
      overrides.map(({ partName, contentType }) => [partName.equivalenceKey, contentType]),
    );
  }

  resolve(partName: PartName): string | undefined {
    const override = this.#overridesByPartName.get(partName.equivalenceKey);
    if (override !== undefined) {
      return override;
    }
    const extension = partName.extension();
    return extension === undefined
      ? undefined
      : this.#defaultsByExtension.get(asciiLowercase(extension));
  }

  require(partName: PartName): string {
    const contentType = this.resolve(partName);
    if (contentType === undefined) {
      throw new ContentTypesError(
        "missing_content_type",
        `Part ${JSON.stringify(partName.value)} has no content type mapping.`,
      );
    }
    return contentType;
  }
}

export interface ContentTypeChanges {
  readonly additions?: ReadonlyMap<PartName, string>;
  readonly removals?: ReadonlySet<string>;
}

export function updateContentTypes(
  contentTypes: ContentTypes,
  changes: ContentTypeChanges,
): ContentTypes {
  const removals = changes.removals ?? new Set();
  const overrides = contentTypes.overrides.filter(
    ({ partName }) => !removals.has(partName.equivalenceKey),
  );
  const overrideIndex = new Map(
    overrides.map((override, index) => [override.partName.equivalenceKey, index]),
  );

  for (const [partName, contentType] of changes.additions ?? []) {
    validateMediaType(contentType);
    const existingIndex = overrideIndex.get(partName.equivalenceKey);
    if (existingIndex !== undefined) {
      overrides[existingIndex] = Object.freeze({ partName, contentType });
      continue;
    }
    const extension = partName.extension();
    const matchingDefault = extension === undefined
      ? undefined
      : contentTypes.defaults.find(
          (item) => asciiLowercase(item.extension) === asciiLowercase(extension),
        );
    if (matchingDefault?.contentType !== contentType) {
      overrideIndex.set(partName.equivalenceKey, overrides.length);
      overrides.push(Object.freeze({ partName, contentType }));
    }
  }

  return new ContentTypes(contentTypes.defaults, overrides);
}

export function serializeContentTypes(contentTypes: ContentTypes): Uint8Array {
  const children = [
    ...contentTypes.defaults.map(
      ({ extension, contentType }) =>
        `<Default Extension="${escapeXmlAttribute(extension)}" ContentType="${escapeXmlAttribute(contentType)}"/>`,
    ),
    ...contentTypes.overrides.map(
      ({ partName, contentType }) =>
        `<Override PartName="${escapeXmlAttribute(partName.value)}" ContentType="${escapeXmlAttribute(contentType)}"/>`,
    ),
  ].join("");
  return new TextEncoder().encode(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${CONTENT_TYPES_NAMESPACE}">${children}</Types>`,
  );
}

export function parseContentTypes(archive: ZipArchive): ContentTypes {
  const item = archive.get(CONTENT_TYPES_ITEM_NAME);
  if (item === undefined) {
    throw new ContentTypesError(
      "missing_item",
      `The package does not contain ${CONTENT_TYPES_ITEM_NAME}.`,
    );
  }

  const defaults: ContentTypeDefault[] = [];
  const overrides: ContentTypeOverride[] = [];
  const defaultKeys = new Set<string>();
  const overrideKeys = new Set<string>();
  let rootSeen = false;

  try {
    parsePackageXml(archive.read(item), {
      openElement(tag, depth) {
        if (depth === 0) {
          if (tag.uri !== CONTENT_TYPES_NAMESPACE || tag.local !== "Types") {
            throw new Error("The media-types stream must have a Types root element.");
          }
          if (unqualifiedAttributes(tag).size !== 0) {
            throw new Error("The Types root element must not have attributes.");
          }
          rootSeen = true;
          return;
        }
        if (depth !== 1 || tag.uri !== CONTENT_TYPES_NAMESPACE) {
          throw new Error("The media-types stream contains an unexpected element.");
        }

        if (tag.local === "Default") {
          const attributes = requireExactAttributes(tag, ["Extension", "ContentType"]);
          const extension = attributes.Extension;
          const contentType = attributes.ContentType;
          if (extension === undefined || !EXTENSION_PATTERN.test(extension)) {
            throw new ContentTypesError(
              "invalid_extension",
              `Invalid default extension ${JSON.stringify(extension)}.`,
            );
          }
          validateMediaType(contentType);
          const key = asciiLowercase(extension);
          if (defaultKeys.has(key)) {
            throw new ContentTypesError(
              "duplicate_default",
              `Default content type for extension ${JSON.stringify(extension)} appears more than once.`,
            );
          }
          defaultKeys.add(key);
          defaults.push(Object.freeze({ extension, contentType }));
          return;
        }

        if (tag.local === "Override") {
          const attributes = requireExactAttributes(tag, ["PartName", "ContentType"]);
          const rawPartName = attributes.PartName;
          const contentType = attributes.ContentType;
          validateMediaType(contentType);
          let partName: PartName;
          try {
            partName = PartName.parse(rawPartName ?? "");
          } catch (cause) {
            if (cause instanceof PartNameError) {
              throw new ContentTypesError(
                "invalid_part_name",
                `Invalid override part name ${JSON.stringify(rawPartName)}.`,
                { cause },
              );
            }
            throw cause;
          }
          if (overrideKeys.has(partName.equivalenceKey)) {
            throw new ContentTypesError(
              "duplicate_override",
              `Override for part ${JSON.stringify(partName.value)} appears more than once.`,
            );
          }
          overrideKeys.add(partName.equivalenceKey);
          overrides.push(Object.freeze({ partName, contentType }));
          return;
        }

        throw new Error(`Unexpected content-types element ${tag.name}.`);
      },
      text(text) {
        if (text.trim() !== "") {
          throw new Error("The media-types stream must not contain text content.");
        }
      },
    });
  } catch (cause) {
    if (cause instanceof ContentTypesError) {
      throw cause;
    }
    throw new ContentTypesError(
      "invalid_xml",
      "The package media-types stream is invalid.",
      { cause },
    );
  }

  if (!rootSeen) {
    throw new ContentTypesError("invalid_xml", "The media-types stream is empty.");
  }
  return new ContentTypes(defaults, overrides);
}

function validateMediaType(contentType: string | undefined): asserts contentType is string {
  if (
    contentType === undefined ||
    contentType.trim() !== contentType ||
    !MEDIA_TYPE_PATTERN.test(contentType)
  ) {
    throw new ContentTypesError(
      "invalid_content_type",
      `Invalid media type ${JSON.stringify(contentType)}.`,
    );
  }
}

function asciiLowercase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll("\t", "&#x9;")
    .replaceAll("\n", "&#xA;")
    .replaceAll("\r", "&#xD;");
}
