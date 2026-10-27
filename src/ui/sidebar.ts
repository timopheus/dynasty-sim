import type { ChronicleEntry } from '../core/chronicle/log';
import type { Ctx } from '../core/state';
import { markPerson } from './context-menu';
import { el } from './dom';
import { entryView } from './entry';
import { hrefOf } from './address';
import { partNodes, entryNode } from './page';
import { sidebarPage, type Block, type SidebarPage } from './sidebar-model';
import { withTip } from './tooltip';
import './sidebar.css';

/** What the panel remembers between renders: open or folded, the trail of visited pages, the page whose whole chronicle shows. */
export interface SidebarState {
  open: boolean;
  trail: string[];
  /** Id of the page whose whole chronicle is shown instead of its sheet; null for the sheet. */
  whole: string | null;
}

export function newSidebarState(open: boolean): SidebarState {
  return { open, trail: [], whole: null };
}

export interface SidebarProps {
  ctx: Ctx;
  view: SidebarState;
  /** Id of the page to show: from the address, else the hero. */
  pageId: string;
  heads: ReadonlySet<string>;
  onToggle: () => void;
  /** The link "Whole chronicle" (id) and the way back (null). */
  onWhole: (id: string | null) => void;
  /** The button "Interact ▾" of a person's page: the menu opens under it. */
  onInteract: (id: string, button: HTMLElement) => void;
}

function entryList(entries: ChronicleEntry[], own: string | null, heads: ReadonlySet<string>): HTMLElement {
  return el('ul', { className: 'chronicle' }, ...entries.map((e) => entryNode(entryView(e, own, heads), e.day)));
}

function blockNodes(block: Block, props: SidebarProps, page: SidebarPage): (Node | string)[] {
  switch (block.type) {
    case 'heading':
      return [el('h3', {}, block.text)];
    case 'text':
      return [el('p', {}, block.text)];
    case 'facts':
      return [el('dl', { className: 'facts' }, ...block.rows.flatMap((r) => [
        withTip(el('dt', {}, r.label), r.tip),
        el('dd', {}, ...partNodes(el, r.parts)),
      ]))];
    case 'traits':
      return [el('ul', { className: 'traits' }, ...block.items.map((t) => el('li', {}, withTip(el('span', { className: 'trait' }, t.name), t.tip))))];
    case 'chronicle':
      return [entryList(block.entries, block.own, props.heads)];
    case 'whole':
      return [el('p', {}, withTip(el('button', { className: 'link', type: 'button', onclick: () => props.onWhole(page.id) }, 'Whole chronicle →'), { text: 'Every line written about this page, the small events too.' }))];
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
  withTip(toggle, { text: props.view.open ? 'Fold the panel of pages.' : 'Open the panel of pages: a person or a house.' });
  const aside = el('aside', { className: props.view.open ? 'sidebar open' : 'sidebar', id: 'sidebar' });
  if (!props.view.open) return [aside, toggle];

  const lastPerson = [...props.view.trail].reverse().find((id) => /^c\d+$/.test(id)) ?? props.ctx.state.playerId;
  const page = sidebarPage(props.ctx, props.pageId, lastPerson);
  const showWhole = props.view.whole === page.id && page.whole.length > 0;
  const title = el('h1', {}, page.title);
  if (page.kind === 'Person') markPerson(title, page.id);
  const scroll = el('div', { className: 'sidebar-scroll' });
  aside.append(scroll);
  scroll.append(breadcrumbs(props, page), title);
  if (page.subtitle) scroll.append(el('p', { className: 'meta' }, page.subtitle));
  const kinds = page.tabs.filter((t) => t.id !== null);
  if (kinds.length > 1 || page.interact) {
    const bar = el('div', { className: 'tabs', role: 'group' }, ...kinds.map((t) => {
      const link = el('a', { className: t.active ? 'tab active' : 'tab', href: hrefOf(t.id ?? page.id) }, t.label);
      if (t.active) link.setAttribute('aria-current', 'page');
      return link;
    }));
    bar.setAttribute('aria-label', 'Kinds of page');
    if (page.interact) {
      const interact = el('button', { className: 'interact', type: 'button' }, 'Interact ▾');
      interact.setAttribute('aria-haspopup', 'menu');
      interact.setAttribute('data-focus', 'interact');
      interact.onclick = () => props.onInteract(page.id, interact);
      bar.append(interact);
    }
    scroll.append(bar);
  }
  if (showWhole) {
    scroll.append(el('p', {}, el('button', { className: 'link', type: 'button', onclick: () => props.onWhole(null) }, '← Back to the page')));
  }
  scroll.append(el('div', { className: 'sheet' }, ...(showWhole ? page.whole : page.blocks).flatMap((b) => blockNodes(b, props, page))));
  return [aside, toggle];
}
