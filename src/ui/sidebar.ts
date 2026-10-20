import type { ChronicleEntry } from '../core/chronicle/log';
import type { Command } from '../core/game';
import type { Ctx } from '../core/state';
import { el } from './dom';
import { entryView } from './entry';
import { hrefOf } from './address';
import { partNodes, entryNode } from './page';
import { sidebarPage, type Block, type SidebarPage } from './sidebar-model';
import './sidebar.css';

/** What the panel remembers between renders: open or folded, the trail of visited pages, the tab of the page shown. */
export interface SidebarState {
  open: boolean;
  trail: string[];
  /** The tab chosen on the page `tabFor`; a new page starts on its first tab. */
  tab: string | null;
  tabFor: string | null;
}

export function newSidebarState(open: boolean): SidebarState {
  return { open, trail: [], tab: null, tabFor: null };
}

export interface SidebarProps {
  ctx: Ctx;
  view: SidebarState;
  /** Id of the page to show: from the address, else the hero. */
  pageId: string;
  heads: ReadonlySet<string>;
  onToggle: () => void;
  onTab: (tab: string) => void;
  onCommand: (cmd: Command) => void;
}

function entryList(entries: ChronicleEntry[], own: string | null, heads: ReadonlySet<string>): HTMLElement {
  return el('ul', { className: 'chronicle' }, ...entries.map((e) => entryNode(entryView(e, own, heads), e.day)));
}

function blockNodes(block: Block, props: SidebarProps): (Node | string)[] {
  switch (block.type) {
    case 'heading':
      return [el('h3', {}, block.text)];
    case 'text':
      return [el('p', {}, block.text)];
    case 'facts':
      return [el('dl', { className: 'facts' }, ...block.rows.flatMap((r) => [el('dt', {}, r.label), el('dd', {}, ...partNodes(el, r.parts))]))];
    case 'chronicle':
      return [entryList(block.entries, block.own, props.heads)];
    case 'propose': {
      const button = el('button', { type: 'button', className: 'propose' }, block.text);
      button.addEventListener('click', () => props.onCommand({ type: 'propose', ...block.order }));
      return [el('p', {}, button)];
    }
  }
}

function breadcrumbs(props: SidebarProps, page: SidebarPage): HTMLElement {
  const crumbs = el('nav', { className: 'crumbs', ariaLabel: 'Pages you have opened' });
  const trail = props.view.trail;
  const before = trail.slice(0, -1);
  if (before.length === 0) {
    crumbs.append(el('span', { className: 'kind' }, page.kind));
    return crumbs;
  }
  const back = before[before.length - 1] as string;
  crumbs.append(el('a', { href: hrefOf(back), className: 'back' }, '← Back'));
  for (const id of before) crumbs.append(' ', el('a', { href: hrefOf(id), className: 'crumb' }, sidebarPage(props.ctx, id).title), ' ›');
  crumbs.append(' ', el('span', { className: 'kind' }, page.title));
  return crumbs;
}

/**
 * The side panel at the left (D-438): a viewer of one page at a time with the tabs of its kind and the trail of pages
 * opened, foldable. The page comes from the address `#/<kind>/<id>`; with none, the hero's own.
 */
export function sidebarPanel(props: SidebarProps): HTMLElement[] {
  const toggle = el('button', { className: 'sidebar-toggle', type: 'button', onclick: props.onToggle }, props.view.open ? '‹' : '›');
  toggle.setAttribute('aria-expanded', String(props.view.open));
  toggle.setAttribute('aria-controls', 'sidebar');
  toggle.setAttribute('aria-label', props.view.open ? 'Fold the side panel' : 'Open the side panel');
  toggle.setAttribute('data-focus', 'sidebar-toggle');
  const aside = el('aside', { className: props.view.open ? 'sidebar open' : 'sidebar', id: 'sidebar' });
  if (!props.view.open) return [aside, toggle];

  const page = sidebarPage(props.ctx, props.pageId);
  const tab = page.tabs.find((t) => t.id === props.view.tab && props.view.tabFor === page.id) ?? page.tabs[0];
  aside.append(breadcrumbs(props, page), el('h1', {}, page.title));
  if (page.subtitle) aside.append(el('p', { className: 'meta' }, page.subtitle));
  if (page.tabs.length > 1) {
    const bar = el('div', { className: 'tabs', role: 'group' }, ...page.tabs.map((t) => {
      const b = el('button', { className: t.id === tab?.id ? 'tab active' : 'tab', type: 'button', onclick: () => props.onTab(t.id) }, t.label);
      b.setAttribute('aria-pressed', String(t.id === tab?.id));
      b.setAttribute('data-focus', `tab-${t.id}`);
      return b;
    }));
    bar.setAttribute('aria-label', 'Tabs of the page');
    aside.append(bar);
  }
  aside.append(el('div', { className: 'tab-body' }, ...(tab?.blocks ?? []).flatMap((b) => blockNodes(b, props))));
  return [aside, toggle];
}
