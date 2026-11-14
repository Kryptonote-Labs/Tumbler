interface ImageUrl {
  url: string;
  references: number;
  expiry?: ReturnType<typeof setTimeout>;
  dispose: () => void;
}
const images = new WeakMap<Uint8Array, ImageUrl>();
const urls = new Map<string, ImageUrl>();
function acquire(image: ImageUrl) {
  clearTimeout(image.expiry);
  image.references++;
  let released = false;
  return {
    url: image.url,
    release() {
      if (released) return;
      released = true;
      if (--image.references === 0) image.expiry = setTimeout(image.dispose, 1000);
    },
  };
}
/** Keep one blob per embedded image while views or outgoing slide snapshots use it. */
export function presentationImageUrl(bytes: Uint8Array, contentType: string) {
  let image = images.get(bytes);
  if (!image) {
    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: contentType }));
    image = { url, references: 0, dispose() { URL.revokeObjectURL(url); urls.delete(url); images.delete(bytes); } };
    images.set(bytes, image);
    urls.set(url, image);
  }
  return acquire(image);
}
/** A transition holds the exact rendered URL until its old slide and fragments are removed. */
export function retainPresentationImageUrl(url: string) {
  const image = urls.get(url);
  return image ? acquire(image) : undefined;
}
