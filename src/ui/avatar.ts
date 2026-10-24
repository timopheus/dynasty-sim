import { getPlayer } from '../core/helpers';
import { DEFAULT_MOOD } from '../core/events/content';
import { eventView } from '../core/events/view';
import { faceSpec } from '../core/looks';
import type { Ctx } from '../core/state';
import { ageYears } from '../core/time/calendar';
import { markPerson } from './context-menu';
import { el } from './dom';
import { withTip } from './tooltip';
import { portraitCanvas } from './portrait/canvas';
import './avatar.css';

/**
 * The hero at the bottom left, always on the screen (D-438): the portrait in the mood of the event on screen (4.12,
 * D-300), the name and the age; a click opens the hero's profile in the side panel.
 */
export function avatarPanel(ctx: Ctx, onOpen: () => void): HTMLElement {
  const hero = getPlayer(ctx.state);
  const spec = faceSpec(ctx, hero, eventView(ctx)?.mood ?? DEFAULT_MOOD);
  const caption = el('figcaption', { className: 'name' }, `${hero.givenName}, ${ageYears(hero.birthDay, ctx.state.day)}`);
  const figure = el('figure', { className: 'portrait' }, portraitCanvas(spec), caption);
  const button = el('button', { className: 'avatar-button', type: 'button', onclick: onOpen }, figure);
  button.setAttribute('aria-label', `Open the profile of ${hero.givenName} ${hero.surname}`);
  button.setAttribute('data-focus', 'avatar');
  markPerson(button, hero.id);
  withTip(button, { title: `${hero.givenName} ${hero.surname}`, text: 'You. Click for your page; right click for the menu.' });
  return el('div', { className: 'avatar' }, button);
}
