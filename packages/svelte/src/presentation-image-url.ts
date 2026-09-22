interface ImageUrl {
  url: string;
  references: number;
  expiry?: ReturnType<typeof setTimeout>;
}
const images = new WeakMap<Uint8Array, ImageUrl>();
/** Keep one blob per embedded image while views use it, including brief thumbnail remounts. */
export function presentationImageUrl(bytes: Uint8Array, contentType: string) {
  let image = images.get(bytes);
  if (!image) {
    image = {
      url: URL.createObjectURL(
        new Blob([Uint8Array.from(bytes).buffer], { type: contentType }),
      ),
      references: 0,
    };
    images.set(bytes, image);
  }
  clearTimeout(image.expiry);
  image.references++;
  const shared = image;
  return {
    url: shared.url,
    release() {
      if (--shared.references === 0)
        shared.expiry = setTimeout(() => {
          URL.revokeObjectURL(shared.url);
          images.delete(bytes);
        }, 1000);
    },
  };
}
