import {
  OpcPackage,
  openOpcPackage,
  saveOpcPackage,
  type OpcPart,
} from "@tumblerjs/opc";

/** Internal reader view over immutable part replacements. The borrowed archive is
 * never exposed through PresentationDocument; callers get materialize() instead. */
export class PresentationPackageState extends OpcPackage {
  #materialized: OpcPackage | undefined;
  constructor(
    private readonly base: OpcPackage,
    private readonly replacements: ReadonlyMap<string, Uint8Array> = new Map(),
  ) {
    super(base.archive, base.contentTypes, base.parts);
  }
  override readPart(part: OpcPart): Uint8Array {
    if (this.getPart(part.name)?.entry !== part.entry)
      throw new TypeError("The part does not belong to this package.");
    return this.replacements.get(part.name.value) ?? this.base.readPart(part);
  }
  replace(part: string, bytes: Uint8Array): PresentationPackageState {
    const owner = this.getPart(part);
    if (!owner)
      throw new TypeError("Cannot replace a missing presentation part.");
    const replacements = new Map(this.replacements);
    replacements.set(owner.name.value, bytes);
    return new PresentationPackageState(this.base, replacements);
  }
  materialize(): OpcPackage {
    if (!this.replacements.size) return this.base;
    return (this.#materialized ??= openOpcPackage(
      saveOpcPackage(this.base, this.replacements),
    ));
  }
}
