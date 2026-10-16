/**
 * Compact form of the state in a save (3.14, D-195). The state is a tree of plain JSON data where
 * most objects repeat a few sets of keys: chronicle entries, links `{id, name}`, characters,
 * opinion reasons. The compact form writes each set of keys once, in a table of shapes, and every
 * object as an array: the index of its shape, then its values in the same order. Lossless: key
 * order is kept, and nothing but plain JSON data goes in or comes out.
 *
 * An encoded array whose first element is a number is an object. Any other array is an array, except
 * that an array whose first element would be a number or the marker `ARRAY` gets `ARRAY` in front.
 */

/** Marks an array that would otherwise read as an object. */
const ARRAY = '#';

export interface Compact {
  shapes: string[][];
  data: unknown;
}

export function encodeCompact(value: unknown): Compact {
  const shapes: string[][] = [];
  const index = new Map<string, number>();
  const shapeOf = (keys: string[]): number => {
    const id = keys.join('\u0000');
    let i = index.get(id);
    if (i === undefined) {
      i = shapes.length;
      shapes.push(keys);
      index.set(id, i);
    }
    return i;
  };
  const encode = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      const out = v.map(encode);
      const first = out[0];
      return typeof first === 'number' || first === ARRAY ? [ARRAY, ...out] : out;
    }
    if (typeof v === 'object' && v !== null) {
      const keys = Object.keys(v);
      const out: unknown[] = [shapeOf(keys)];
      for (const k of keys) out.push(encode((v as Record<string, unknown>)[k]));
      return out;
    }
    return v;
  };
  return { shapes, data: encode(value) };
}

/** Inverse of encodeCompact. Throws on anything encodeCompact could not have written. */
export function decodeCompact(shapes: unknown, data: unknown): unknown {
  if (!Array.isArray(shapes)) throw new Error('shapes is not a list');
  for (const keys of shapes) {
    if (!Array.isArray(keys) || keys.some((k) => typeof k !== 'string' || k === '__proto__')) throw new Error('bad shape');
  }
  const table = shapes as string[][];
  const decode = (v: unknown): unknown => {
    if (!Array.isArray(v)) {
      if (typeof v === 'object' && v !== null) throw new Error('object outside the shape table');
      return v;
    }
    const first: unknown = v[0];
    if (first === ARRAY) return v.slice(1).map(decode);
    if (typeof first !== 'number') return v.map(decode);
    const keys = table[first];
    if (keys === undefined || keys.length !== v.length - 1) throw new Error(`bad object of shape ${first}`);
    const out: Record<string, unknown> = {};
    keys.forEach((k, i) => {
      out[k] = decode(v[i + 1]);
    });
    return out;
  };
  return decode(data);
}
