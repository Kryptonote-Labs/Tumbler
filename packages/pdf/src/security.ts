import { cbc, ecb } from "@noble/ciphers/aes.js";
import { md5 } from "@noble/hashes/legacy.js";
import { sha256, sha384, sha512 } from "@noble/hashes/sha2.js";
import { saslprep } from "@mongodb-js/saslprep";
import {
  array,
  dictionary,
  integer,
  invalid,
  name,
  PdfError,
  PdfReference,
  PdfString,
  type PdfDictionary,
  type PdfValue,
  unsupported,
} from "./objects.ts";
import type { PdfSource } from "./source.ts";

const padding = Uint8Array.of(
  0x28,
  0xbf,
  0x4e,
  0x5e,
  0x4e,
  0x75,
  0x8a,
  0x41,
  0x64,
  0,
  0x4e,
  0x56,
  0xff,
  0xfa,
  1,
  8,
  0x2e,
  0x2e,
  0,
  0xb6,
  0xd0,
  0x68,
  0x3e,
  0x80,
  0x2f,
  0xc,
  0xa9,
  0xfe,
  0x64,
  0x53,
  0x69,
  0x7a,
);
function concat(...chunks: Uint8Array[]) {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.length;
  }
  return result;
}
function equal(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!;
  return difference === 0;
}
function padded(bytes: Uint8Array) {
  return concat(bytes, padding).subarray(0, 32);
}
function rc4(key: Uint8Array, input: Uint8Array) {
  const state = Uint8Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + state[i]! + key[i % key.length]!) & 255;
    const old = state[i]!;
    state[i] = state[j]!;
    state[j] = old;
  }
  const output = new Uint8Array(input.length);
  j = 0;
  let i = 0;
  for (let at = 0; at < input.length; at++) {
    i = (i + 1) & 255;
    j = (j + state[i]!) & 255;
    const old = state[i]!;
    state[i] = state[j]!;
    state[j] = old;
    output[at] = input[at]! ^ state[(state[i]! + state[j]!) & 255]!;
  }
  return output;
}
function xorKey(key: Uint8Array, value: number) {
  return key.map((byte) => byte ^ value);
}
function requiredBytes(value: PdfValue | undefined, length?: number) {
  if (!(value instanceof PdfString) || (length !== undefined && value.bytes.length !== length))
    return invalid("Invalid encryption-handler byte string.");
  return value.bytes;
}
function legacyKey(
  password: Uint8Array,
  info: PdfDictionary,
  identifier: Uint8Array,
  revision: number,
  length: number,
) {
  const permissions = new Uint8Array(4);
  new DataView(permissions.buffer).setInt32(0, integer(info.get("P")), true);
  let hash = md5(
    concat(
      padded(password),
      requiredBytes(info.get("O"), 32),
      permissions,
      identifier,
      revision >= 4 && info.get("EncryptMetadata") === false
        ? new Uint8Array(4).fill(255)
        : new Uint8Array(),
    ),
  );
  if (revision >= 3) for (let i = 0; i < 50; i++) hash = md5(hash.subarray(0, length));
  return hash.subarray(0, length);
}
function legacyValid(
  key: Uint8Array,
  info: PdfDictionary,
  identifier: Uint8Array,
  revision: number,
) {
  let value = revision === 2 ? rc4(key, padding) : rc4(key, md5(concat(padding, identifier)));
  if (revision >= 3) for (let i = 1; i <= 19; i++) value = rc4(xorKey(key, i), value);
  return equal(value, requiredBytes(info.get("U")).subarray(0, revision === 2 ? 32 : 16));
}
/** Algorithm 2.B, standard security revision 6. AES and hashes are host-independent primitives. */
function passwordHash(password: Uint8Array, salt: Uint8Array, user: Uint8Array, revision: number) {
  let key: Uint8Array = sha256(concat(password, salt, user));
  if (revision === 5) return key;
  let round = 0,
    last = 0;
  do {
    const block = concat(password, key, user),
      repeated = new Uint8Array(block.length * 64);
    for (let i = 0; i < 64; i++) repeated.set(block, block.length * i);
    const encrypted = cbc(key.subarray(0, 16), key.subarray(16, 32), {
      disablePadding: true,
    }).encrypt(repeated);
    const algorithm = encrypted.subarray(0, 16).reduce((sum, byte) => sum + byte, 0) % 3;
    key = (algorithm === 0 ? sha256 : algorithm === 1 ? sha384 : sha512)(encrypted);
    last = encrypted[encrypted.length - 1]!;
    round++;
  } while (round < 64 || last > round - 32);
  return key.subarray(0, 32);
}

export class PdfSecurity {
  private constructor(
    private key: Uint8Array,
    readonly dictionary: PdfDictionary,
    private revision: number,
  ) {}
  static open(source: PdfSource, password = "") {
    const info = dictionary(source.resolve(source.trailer.get("Encrypt")));
    if (name(info.get("Filter")) !== "Standard")
      return unsupported("This PDF uses a non-standard security handler.");
    const revision = integer(info.get("R")),
      version = integer(info.get("V"));
    if (![2, 3, 4, 5, 6].includes(revision))
      return unsupported(`PDF standard security revision ${revision} is not supported.`);
    let key: Uint8Array | undefined;
    if (revision >= 5) {
      if (version !== 5) return invalid("Invalid modern standard security handler version.");
      const input = new TextEncoder()
        .encode(revision === 6 ? saslprep(password) : password)
        .subarray(0, 127);
      const user = requiredBytes(info.get("U"), 48),
        owner = requiredBytes(info.get("O"), 48);
      if (
        equal(
          passwordHash(input, user.subarray(32, 40), new Uint8Array(), revision),
          user.subarray(0, 32),
        )
      ) {
        key = cbc(
          passwordHash(input, user.subarray(40), new Uint8Array(), revision),
          new Uint8Array(16),
          { disablePadding: true },
        ).decrypt(requiredBytes(info.get("UE"), 32));
      } else if (
        equal(passwordHash(input, owner.subarray(32, 40), user, revision), owner.subarray(0, 32))
      ) {
        key = cbc(passwordHash(input, owner.subarray(40), user, revision), new Uint8Array(16), {
          disablePadding: true,
        }).decrypt(requiredBytes(info.get("OE"), 32));
      }
      if (key) {
        const permissions = ecb(key, { disablePadding: true }).decrypt(
          requiredBytes(info.get("Perms"), 16),
        );
        if (
          permissions[9] !== 97 ||
          permissions[10] !== 100 ||
          permissions[11] !== 98 ||
          new DataView(permissions.buffer, permissions.byteOffset).getInt32(0, true) !==
            integer(info.get("P")) ||
          (permissions[8] === 84) !== (info.get("EncryptMetadata") !== false)
        )
          return invalid("PDF encrypted permissions do not match the security dictionary.");
      }
    } else {
      if (version > 4) return invalid("Invalid legacy standard security handler version.");
      const length = revision === 2 ? 5 : integer(info.get("Length"), 40) / 8;
      if (!Number.isInteger(length) || length < 5 || length > 16)
        return invalid("Invalid encryption key length.");
      const input = Uint8Array.from(
        [...password].map((character) => {
          const code = character.codePointAt(0)!;
          if (code > 255)
            return unsupported("Legacy encrypted PDF passwords require PDFDocEncoding characters.");
          return code;
        }),
      );
      const identifier = requiredBytes(array(source.resolve(source.trailer.get("ID")))[0]);
      const candidate = legacyKey(input, info, identifier, revision, length);
      if (legacyValid(candidate, info, identifier, revision)) key = candidate;
      else {
        let digest = md5(padded(input));
        if (revision >= 3) for (let i = 0; i < 50; i++) digest = md5(digest);
        const ownerKey = digest.subarray(0, length);
        let recovered = requiredBytes(info.get("O"), 32);
        if (revision === 2) recovered = rc4(ownerKey, recovered);
        else for (let i = 19; i >= 0; i--) recovered = rc4(xorKey(ownerKey, i), recovered);
        const candidate = legacyKey(recovered, info, identifier, revision, length);
        if (legacyValid(candidate, info, identifier, revision)) key = candidate;
      }
    }
    if (!key)
      throw new PdfError(
        password ? "invalid_password" : "password_required",
        password ? "The PDF password is incorrect." : "This PDF requires a password.",
      );
    return new PdfSecurity(key, info, revision);
  }
  decrypt(bytes: Uint8Array, object: PdfReference, stream: boolean, explicitFilter?: string) {
    let method = this.revision >= 5 ? "AESV3" : "V2";
    if (integer(this.dictionary.get("V")) >= 4) {
      const selector =
        explicitFilter ?? name(this.dictionary.get(stream ? "StmF" : "StrF"), "Identity");
      if (selector === "Identity") return bytes;
      const filters = dictionary(this.dictionary.get("CF"));
      method = name(dictionary(filters.get(selector)).get("CFM"), "None");
    }
    if (method === "None") return bytes;
    let key = this.key;
    if (method !== "AESV3") {
      const identity = Uint8Array.of(
        object.object & 255,
        (object.object >> 8) & 255,
        (object.object >> 16) & 255,
        object.generation & 255,
        (object.generation >> 8) & 255,
      );
      key = md5(
        concat(
          key,
          identity,
          method === "AESV2" ? Uint8Array.of(115, 65, 108, 84) : new Uint8Array(),
        ),
      ).subarray(0, Math.min(key.length + 5, 16));
    }
    if (method === "V2") return rc4(key, bytes);
    if (method !== "AESV2" && method !== "AESV3")
      return unsupported(`PDF crypt filter /${method} is not supported.`);
    if (bytes.length < 32 || bytes.length % 16)
      return invalid("Truncated AES-encrypted PDF object.");
    try {
      return cbc(key, bytes.subarray(0, 16)).decrypt(bytes.subarray(16));
    } catch {
      return invalid("Invalid AES padding in PDF object.");
    }
  }
}
