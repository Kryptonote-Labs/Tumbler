export class ChartParseError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ChartParseError";
  }
}

/** A product preview limit is unsupported content, not malformed host XML. */
export class ChartPreviewLimitError extends Error {}
