/** Calls `visit` for the value of every property named in `keys`, anywhere inside `node` (arrays and nested objects included). */
export function walkKeys(node: unknown, path: string, keys: readonly string[], visit: (value: unknown, path: string) => void): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkKeys(item, `${path}[${i}]`, keys, visit));
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      const at = `${path}.${key}`;
      if (keys.includes(key)) visit(value, at);
      walkKeys(value, at, keys, visit);
    }
  }
}
