/** Tiny DOM helper shared by the panels: a tag, its properties, then children. */
export type Make = <K extends keyof HTMLElementTagNameMap>(tag: K, props?: Partial<HTMLElementTagNameMap[K]>, ...children: (Node | string)[]) => HTMLElementTagNameMap[K];

export const el: Make = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

export function applyAttrs(node: HTMLElement, attrs: Record<string, string>): void {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
}
