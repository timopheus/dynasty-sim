import type { SourceFile } from '../content/load';

/**
 * Version of the content (D-202): a hash of the content files, paths and texts in the order given (callers sort them by
 * path, as for loadContent). Two 32-bit FNV-1a hashes with different starts, in integers only, as 16 hex digits.
 * Not a security hash: it tells a changed content from the same one in a save and a journal.
 */
export function contentVersion(files: readonly SourceFile[]): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  const add = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      a = Math.imul(a ^ code, 0x01000193);
      b = Math.imul(b ^ code, 0x01000193) ^ (b >>> 15);
    }
    // A separator no text holds, so "ab"+"c" differs from "a"+"bc".
    a = Math.imul(a ^ 0xffff, 0x01000193);
    b = Math.imul(b ^ 0xffff, 0x01000193) ^ (b >>> 15);
  };
  for (const f of files) {
    add(f.path);
    add(f.text);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return hex(a) + hex(b);
}
