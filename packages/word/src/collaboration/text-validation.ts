export function validateText(text: string) {
  if (!text.isWellFormed()) throw new Error('This document contains an incomplete character.');
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(text))
    throw new Error('This document contains unsupported control characters.');
}
