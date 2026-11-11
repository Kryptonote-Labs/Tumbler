export function chartBytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}

export function chartBase64ToBytes(value: string): Uint8Array {
  const padding = value.indexOf('='), end = padding < 0 ? value.length : padding;
  if (value.length % 4 || value.length - end > 2 || /[^A-Za-z0-9+/]/.test(value.slice(0, end)) || /[^=]/.test(value.slice(end))) throw new TypeError('Invalid base64 encoding.');
  const binary = atob(value), bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
