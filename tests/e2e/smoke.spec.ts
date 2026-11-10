import { expect, test, type Page } from '@playwright/test';

/** Seeds of the smoke run; fixed so a failure repeats. */
const SEEDS = [1, 7, 42];
const TURNS = 50;

const DATE = '.clock .date';
const HERO = '.avatar .name';
const LATELY = '.sidebar .chronicle';
// the game screen, or the screen of the early years before it (playtest 09.11): both carry the seed under ?dev=1
const GAME = '.game, .backstory-screen';

const shot = (page: Page, seed: number, name: string) => page.screenshot({ path: `out/e2e/seed${String(seed)}-${name}.png`, fullPage: true });

/**
 * The buttons a player can press now: the window over the centre if there is one, else the actions panel at the right.
 * The directions of the journey fold into a menu (S.9): a folded button cannot be pressed, the place spec opens it.
 */
async function choices(page: Page) {
  // the button of the work board opens a window and takes no turn (CK.4): the board has its own test
  return (await page.locator('.modal-layer').count()) > 0 ? page.locator('.modal-layer .option button.choice') : page.locator('.actions-panel button.action:not(.grey):not([data-action="board"]):visible');
}

/**
 * Pauses the clock (S.8) and waits until it stands: a pause saves (D-439), so a reload shows this very day. An event
 * or the end of an action may stop it first; that is a save too.
 */
async function standStill(page: Page): Promise<void> {
  for (let i = 0; i < 5; i++) {
    if (!((await page.locator('.clock').getAttribute('class')) ?? '').includes('running')) break;
    await page.locator('.clock .clock-toggle').click({ timeout: 2_000 }).catch(() => undefined);
    await expect.poll(async () => (await page.locator('.clock').getAttribute('class')) ?? '', { timeout: 5_000 }).not.toMatch(/\brunning\b/).catch(() => undefined);
  }
  await expect(page.locator('.clock')).not.toHaveClass(/\brunning\b/);
}

/**
 * Lets the clock run until the date leaves `from`: answers a window that stops it (first choice) and presses "Play"
 * when nothing is under way. Gives up quietly after a few rounds; the caller checks the date.
 */
async function letTimeRun(page: Page, from: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    if (((await page.locator(DATE).first().textContent()) ?? '') !== from) return;
    if ((await page.locator('.modal-layer').count()) > 0) {
      await page.locator('.modal-layer .option button.choice').first().click({ timeout: 2_000 }).catch(() => undefined);
    } else if (!((await page.locator('.clock').getAttribute('class')) ?? '').includes('running')) {
      await page.locator('.clock .clock-toggle').click({ timeout: 2_000 }).catch(() => undefined);
    }
    await expect.poll(async () => (await page.locator(DATE).first().textContent()) ?? '', { timeout: 3_000 }).not.toBe(from).catch(() => undefined);
  }
}

/**
 * What a player sees: the date, the hero's caption and the latest lines of the chronicle; during the early years, which
 * have a screen of their own (playtest 09.11), the scene instead.
 */
async function snapshot(page: Page): Promise<{ date: string; hero: string; chronicle: string; scene: string }> {
  const text = async (selector: string) => ((await page.locator(selector).count()) > 0 ? ((await page.locator(selector).first().textContent()) ?? '') : '');
  return { date: await text(DATE), hero: await text(HERO), chronicle: await text(LATELY), scene: await text('.backstory-screen .event-text') };
}

/** Console errors, page errors and browser dialogs of a test; the last are never wanted: the game asks inside the page. */
function watch(page: Page): string[] {
  const problems: string[] = [];
  // The page has no favicon yet: the browser's own request for it is not the game's error.
  page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) problems.push(`console.error: ${m.text()} ${m.location().url}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('dialog', (d) => { problems.push(`unexpected dialog: ${d.message()}`); void d.dismiss(); });
  return problems;
}

for (const seed of SEEDS) {
  test(`seed ${String(seed)}: plays ${String(TURNS)} turns and continues after a reload`, async ({ page }) => {
    const problems = watch(page);

    // ?dev=1 shows the seed: the player's page never does
    await page.goto(`/?seed=${String(seed)}&dev=1`);
    await expect(page.locator(GAME)).toHaveAttribute('data-seed', String(seed));
    // the early years are a screen of their own (playtest 09.11): the turns are counted in the game after them, the
    // chronicle from the very start
    const early = await snapshot(page);
    await growUp(page);
    await expect(page.locator(DATE).first()).toBeVisible();
    const start = await snapshot(page);
    await shot(page, seed, '1-start');

    for (let turn = 0; turn < TURNS; turn++) {
      const buttons = await choices(page);
      const count = await buttons.count();
      expect(count, `turn ${String(turn)}: stuck, no available button (${(await page.locator('#app').innerText()).slice(0, 300)})`).toBeGreaterThan(0);
      const before = await page.locator('#app').innerText();
      // round-robin, not random: a failure replays. Time runs (S.8): an event may cover the button just picked, so
      // the buttons are read again then.
      let clicked = false;
      for (let attempt = 0; attempt < 5 && !clicked; attempt++) {
        const now = await choices(page);
        const n = await now.count();
        if (n === 0) {
          await page.waitForTimeout(500);
          continue;
        }
        clicked = await now.nth(turn % n).click({ timeout: 3_000 }).then(() => true, () => false);
      }
      expect(clicked, `turn ${String(turn)}: no button could be pressed in five tries`).toBe(true);
      const moved = await expect.poll(async () => page.locator('#app').innerText(), { timeout: 10_000 }).not.toBe(before).then(() => true, () => false);
      // console errors first: they are the cause when the screen stays put
      expect(problems, `errors after turn ${String(turn)}`).toEqual([]);
      expect(moved, `turn ${String(turn)}: screen did not change after the click`).toBe(true);
      if (turn === Math.floor(TURNS / 2)) await shot(page, seed, '2-middle');
    }

    // the turns may come faster than a day of the clock (S.8: a day a second, and every window it stops for starts
    // the day anew), so let time run a little before the date is checked
    await letTimeRun(page, start.date);
    await standStill(page);
    const end = await snapshot(page);
    await shot(page, seed, '3-end');
    expect(end.date, 'game date did not move').not.toBe(start.date);
    expect(end.chronicle, 'chronicle did not grow').not.toBe(early.chronicle);

    // the bare address, without the seed: only a real continue of the autosave can show the same game
    await page.goto('/?dev=1');
    await expect(page.locator(DATE).first()).toBeVisible();
    const after = await snapshot(page);
    await shot(page, seed, '4-reload');
    expect(after.hero, 'another hero after reload').toBe(end.hero);
    expect(after.date, 'another date after reload').toBe(end.date);
    expect(problems).toEqual([]);
  });
}

/** Answers the scenes of the backstory and stands the clock still, so the panel is free and the screen does not change. */
async function growUp(page: Page): Promise<void> {
  // the first draw: the screen of the early years, or the game itself after a reload
  await expect(page.locator('.backstory-screen, .clock').first()).toBeVisible();
  for (let i = 0; i < 40; i++) {
    if ((await page.locator('.modal-layer').count()) > 0 || (await page.locator('.backstory-screen').count()) > 0) {
      await page.locator('.modal-layer .option button.choice').first().click({ timeout: 2_000 }).catch(() => undefined);
      continue;
    }
    await standStill(page);
    // an event may have stopped the clock first: answer it and stand still again
    if ((await page.locator('.modal-layer').count()) === 0) return;
  }
  throw new Error('the hero never became free to act');
}

/** A tip opens after this delay (D-465, `TIP_DELAY_MS` of `src/ui/tooltip.ts`); twice it is surely past. */
const TIP_WAIT = 1_000;

/**
 * Presses Tab until the focus rests on a thing whose tip (title and text) matches, then waits for the tip to open after
 * its delay (D-465).
 */
async function tabToTip(page: Page, match: RegExp = /./, max = 60): Promise<void> {
  for (let i = 0; i < max; i++) {
    // an event of the running clock may put a window over the screen: its choices have tips of their own (D-463), and
    // the tabs of the test are for the screen under it, so the window is answered first
    if ((await page.locator('.modal-layer').count()) > 0) {
      await page.locator('.modal-layer .option button.choice').first().click({ timeout: 2_000 }).catch(() => undefined);
      continue;
    }
    await page.keyboard.press('Tab');
    // a string: the tests are typed without the DOM
    const tip = await page.evaluate<string | null>(`(() => {
      const n = document.activeElement?.closest('[data-tip]');
      return n ? (n.getAttribute('data-tip-title') ?? '') + ' ' + (n.getAttribute('data-tip') ?? '') : null;
    })()`);
    if (tip !== null && match.test(tip)) {
      await expect(page.locator('#tooltip')).toBeVisible();
      return;
    }
  }
  throw new Error(`Tab found no tip that says ${String(match)}`);
}

for (const size of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  test(`the screen is in shelves, with no empty space in the centre at ${String(size.width)}×${String(size.height)}`, async ({ page }) => {
    const problems = watch(page);
    await page.setViewportSize(size);
    await page.goto('/?seed=7');
    // the early years first, on a screen of their own (playtest 09.11): none of the game's panels behind them
    await expect(page.locator('.backstory-screen')).toBeVisible();
    for (const selector of ['.topbar', '.sidebar', '.map-view', '.actions-panel', '.clock']) await expect(page.locator(selector), selector).toHaveCount(0);
    // a scene of the backstory is a window that holds the decision: Escape does not close it, and it names the age
    const modal = page.locator('.modal.event');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.modal-title')).toHaveText(/^Age \d+$/);
    await expect(modal.locator('.modal-close')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(modal).toBeVisible();
    // the chance and the reason are inside the button of the choice, the chance as a word and a percent together
    const notes = await modal.locator('button.choice .note').allTextContents();
    for (const n of notes) expect(n).toMatch(/^\(.+, \d+%\)$/);
    if (size.width === 1440) await page.screenshot({ path: 'out/e2e/layout-1440-window.png' });
    await growUp(page);
    for (const selector of ['.topbar', '.sidebar.open', '.center .where', '.map-view .map-canvas', '.avatar', '.clock .date', '.actions-panel']) {
      await expect(page.locator(selector).first(), selector).toBeVisible();
    }
    // the time player (S.8): the speeds are there
    await expect(page.locator('.clock .speed')).toHaveText(['×1', '×2', '×5']);
    // the profile of the hero is one sheet in the panel, numbers in brackets (D-434, D-448)
    await expect(page.locator('.sidebar h1')).toBeVisible();
    await expect(page.locator('.sidebar .sheet .facts').first()).toContainText(/\(\d+\)/);
    await expect(page.locator('.sidebar .tabs .tab.active')).toHaveText('Person');
    // the panels are cards on one grid (playtest 09.11): one margin from the window, the same edges side by side
    const edge = (selector: string) => page.locator(selector).first().evaluate((n) => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
    const left = await edge('.left-column');
    const top = await edge('.topbar');
    const right = await edge('.right-column');
    const bottom = await edge('.center .where');
    expect(Math.abs(left.left - 12), 'the left column keeps the margin').toBeLessThan(2);
    expect(Math.abs(size.width - right.right - 12), 'the right column keeps the margin').toBeLessThan(2);
    expect(Math.abs(top.top - left.top), 'the header and the page start on one line').toBeLessThan(2);
    expect(Math.abs(top.right - right.right), 'the header and the right column end on one line').toBeLessThan(2);
    expect(Math.abs(bottom.bottom - left.bottom), 'the block and the left column end on one line').toBeLessThan(2);
    expect(Math.abs(right.left - 12 - bottom.right), 'the block keeps the gap to the right column').toBeLessThan(2);
    expect(Math.abs(top.left - bottom.left), 'the header and the block start on one line').toBeLessThan(2);
    // the actions are on shelves, with their information inside the button and no digit before the name
    await expect(page.locator('.actions-panel .shelf h2').first()).toHaveText('Livelihood');
    const first = page.locator('.actions-panel button.action:not([data-action="board"])').first();
    await expect(first).toContainText(/\d+(–\d+)? days/);
    for (const name of await page.locator('.actions-panel .action-name').allTextContents()) expect(name).not.toMatch(/^\d/);
    // the map fills the whole window under the panels, as in CK3 (M.1, D-469); the block "where I am" ends at the bottom
    const box = (selector: string) => page.locator(selector).first().evaluate((n) => {
      const r = n.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    });
    const centre = await box('.center');
    const map = await box('.map-view');
    const where = await box('.where');
    expect(map.left, 'the map starts at the left edge').toBeLessThan(2);
    expect(map.top, 'the map starts at the top edge').toBeLessThan(2);
    expect(size.width - map.right, 'the map ends at the right edge').toBeLessThan(2);
    expect(size.height - map.bottom, 'the map ends at the bottom edge').toBeLessThan(2);
    expect(centre.bottom - where.bottom, 'the block ends at the bottom of the centre').toBeLessThan(24);
    // the table of the place has no row with a dash (D-447)
    await expect(page.locator('.place-table')).not.toContainText(/—|–\s*$/);
    await page.screenshot({ path: `out/e2e/layout-${String(size.width)}.png` });
    expect(problems).toEqual([]);
  });
}

test('the menu of a person opens by right click, by the button and by the keyboard; Escape closes it', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=7');
  await growUp(page);
  // a name in the page of the hero: right click opens the menu of that person
  const name = page.locator('.sidebar a.person[data-person]').first();
  await expect(name).toBeVisible();
  const who = await name.textContent();
  await name.click({ button: 'right' });
  const menu = page.locator('.person-menu');
  await expect(menu).toBeVisible();
  await expect(menu).toContainText(who ?? '');
  await expect(menu.locator('.menu-item').first()).toHaveText(/Open the page/);
  await page.screenshot({ path: 'out/e2e/menu-1440.png' });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  // the page of that person has the button "Interact", the same menu
  await name.click();
  await expect(page.locator('.sidebar h1')).toHaveText(who ?? '');
  await page.locator('.sidebar .interact').click();
  await expect(menu).toBeVisible();
  // the tip of the button does not lie over the menu it opened
  await expect(page.locator('#tooltip')).toBeHidden();
  await expect(menu).toContainText(who ?? '');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  // by the keyboard: focus a name, press Shift+F10
  await page.goto('/?seed=7');
  await page.locator('.sidebar a.person[data-person]').first().focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('the hero knows the family; every part of the screen explains itself on hover and on focus', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=7');
  await growUp(page);
  // the family of the hero is acquainted: the page of a parent says so, not "a stranger"
  await page.locator('.sidebar a.person[data-person]').first().click();
  await expect(page.locator('.sidebar .meta').first()).not.toHaveText('A stranger to you');
  await page.locator('.avatar-button').click();
  const tip = page.locator('#tooltip');
  // by hover: a figure of the header, a stat, a name
  await page.locator('.topbar .figure').first().hover();
  await expect(tip).toBeVisible();
  await page.locator('.sidebar .facts dt[data-tip]').nth(2).hover();
  await expect(tip).toBeVisible();
  await page.locator('.sidebar a.person[data-person]').first().hover();
  await expect(tip).toContainText(/Your|acquaintance|stranger/);
  await page.screenshot({ path: 'out/e2e/tooltip-1440.png' });
  // by the keyboard alone: Tab walks over things that explain themselves, the tip follows the focus
  await page.mouse.move(700, 300);
  await page.locator('.avatar-button').focus();
  await tabToTip(page, /./, 40);
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  expect(problems).toEqual([]);
});

test('"Show numbers" and "Journal" are gone; the seed and the journal are for ?dev=1 only', async ({ page }) => {
  await page.goto('/?seed=1');
  await expect(page.getByText('Show numbers')).toHaveCount(0);
  await page.getByRole('button', { name: /Menu/ }).click();
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
  await expect(page.locator('.menu-list')).not.toContainText(/seed/i);
  await expect(page.locator('.menu-list')).not.toContainText(/journal/i);
  await expect(page.locator(GAME)).not.toHaveAttribute('data-seed', /.*/);
  await page.goto('/?seed=1&dev=1');
  await page.getByRole('button', { name: /Menu/ }).click();
  await expect(page.locator('.menu-list')).toContainText('Seed 1');
  await expect(page.getByRole('button', { name: 'Download the command journal' })).toBeVisible();
});

test('"New game" asks inside the page and starts another game', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/?seed=1&dev=1');
  await expect(page.locator(GAME)).toHaveAttribute('data-seed', '1');
  // play a turn, so the old game has a past; the screen redraws after the save, so wait for it as the turns test does
  const shown = await page.locator('#app').innerText();
  await (await choices(page)).first().click();
  const moved = await expect.poll(async () => page.locator('#app').innerText(), { timeout: 10_000 }).not.toBe(shown).then(() => true, () => false);
  // console errors first: they are the cause when the screen stays put
  expect(problems, 'errors after the first choice').toEqual([]);
  expect(moved, 'screen did not change after the first choice').toBe(true);
  const before = await snapshot(page);

  await page.getByRole('button', { name: /Menu/ }).click();
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.locator('.modal.confirm')).toBeVisible();
  // "Cancel" keeps the game as it was
  await page.locator('#confirm-no').click();
  await expect(page.locator('.modal.confirm')).toHaveCount(0);
  await expect(page.locator(GAME)).toHaveAttribute('data-seed', '1');
  expect(await snapshot(page)).toEqual(before);

  await page.getByRole('button', { name: /Menu/ }).click();
  await page.getByRole('button', { name: 'New game' }).click();
  await page.locator('#confirm-yes').click();
  await expect(page.locator('.modal.confirm')).toHaveCount(0);
  // a new game: another seed (a random one), the first scene of the backstory waiting
  await expect(page.locator(GAME)).not.toHaveAttribute('data-seed', '1');
  await expect(page.locator('.modal.event')).toBeVisible();
  const fresh = await page.locator(GAME).getAttribute('data-seed');

  // and it is the game that continues after a reload
  await page.goto('/?dev=1');
  await expect(page.locator(GAME)).toHaveAttribute('data-seed', fresh ?? '');
  expect(problems).toEqual([]);
});

test('a choice that says it all has no tip; a window that opens under a still pointer shows none', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=7');
  const tip = page.locator('#tooltip');
  const first = page.locator('.modal-layer .option button.choice').first();
  // a choice that is words only has nothing to explain (D-465); one with a chance or a price does (D-463): look for a plain one
  const plain = page.locator('.modal-layer .option button.choice:not([data-tip])').first();
  for (let i = 0; i < 12 && (await plain.count()) === 0; i++) await first.click({ timeout: 2_000 }).catch(() => undefined);
  await plain.hover();
  await page.waitForTimeout(TIP_WAIT);
  await expect(tip).toBeHidden();
  await expect(page.locator('.tip-ring')).toHaveCount(0);
  // a scene with a name in its words: the name explains itself after the delay
  const named = page.locator('.modal-layer .event-text [data-tip]');
  for (let i = 0; i < 8 && (await named.count()) === 0; i++) await first.click({ timeout: 2_000 }).catch(() => undefined);
  await named.first().hover();
  await expect(tip).toBeVisible();
  const title = await page.locator('.modal-title').textContent();
  await first.click();
  // the next scene is there, the pointer has not moved: nothing is explained over its choices
  await expect(page.locator('.modal-title')).not.toHaveText(title ?? '');
  await page.waitForTimeout(TIP_WAIT);
  await expect(tip).toBeHidden();
  expect(problems).toEqual([]);
});

test('a tip waits a moment, with no ring at the pointer; a pointer that passes over opens none (D-477)', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=7');
  await growUp(page);
  const tip = page.locator('#tooltip');
  const figure = page.locator('.topbar .figure').first();
  const box = await figure.boundingBox();
  if (!box) throw new Error('no figure in the header');
  await page.mouse.move(700, 300);
  // at rest on the figure: nothing at the pointer while it waits, then the tip with its ring in its own corner
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const early = await page.evaluate<{ ring: number; open: boolean }>(`({ ring: document.querySelectorAll('.tip-timer, .tip-ring').length, open: !!document.getElementById('tooltip') })`);
  expect(early, 'the tip waits, with no ring at the pointer').toEqual({ ring: 0, open: false });
  await expect(tip).toBeVisible();
  await expect(tip.locator('.tip-ring')).toHaveCount(1);
  await page.screenshot({ path: 'out/e2e/tip-ring-1440.png', clip: { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 20), width: 420, height: 260 } });
  // passing over: the pointer leaves before the delay, and nothing opens
  await page.mouse.move(700, 300);
  await expect(tip).toBeHidden();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(700, 300);
  await page.waitForTimeout(TIP_WAIT);
  await expect(tip).toBeHidden();
  await expect(page.locator('.tip-ring')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('money: the breakdown, frozen by the ring, a blue concept opens a nested tip, Esc closes both (D-477)', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=7');
  await growUp(page);
  await page.mouse.move(700, 300);
  const tip = page.locator('#tooltip');
  const nested = page.locator('#tooltip-2');
  const money = page.locator('.topbar .figure').first();
  const at = await money.boundingBox();
  if (!at) throw new Error('no money in the header');
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await expect(tip).toBeVisible();
  // the breakdown: the title says the money now, the total is the number on the screen
  await expect(tip.locator('.tip-title')).toContainText(/\d/);
  await expect(tip.locator('.tip-row.total .tip-value')).toHaveText(/^[+−]?\d+$/);
  const shown = await page.locator('.topbar .figure-note').first().textContent();
  const total = await tip.locator('.tip-row.total .tip-value').textContent();
  expect(shown ?? '').toContain(total ?? '?');
  // not frozen yet: the pointer cannot enter, the ring runs in the corner
  await expect(tip.locator('.tip-ring')).toHaveCount(1);
  await expect(tip).not.toHaveClass(/locked/);
  // after about two seconds it freezes by itself
  await expect(tip).toHaveClass(/locked/, { timeout: 5_000 });
  await expect(tip.locator('.tip-ring')).toHaveCount(0);
  // the pointer goes into the tip, to the blue word: a tip inside, darker
  const word = tip.locator('.tip-concept[data-concept]').first();
  await expect(word).toBeVisible();
  const w = await word.boundingBox();
  if (!w) throw new Error('no concept in the tip');
  await page.mouse.move(at.x + at.width / 2, at.y + at.height + 4, { steps: 4 });
  await page.mouse.move(w.x + w.width / 2, w.y + w.height / 2, { steps: 8 });
  await expect(nested).toBeVisible();
  await expect(tip).toBeVisible();
  await expect(nested.locator('.tip-crumb')).toBeVisible();
  const bgs = await page.evaluate<string[]>(`['tooltip', 'tooltip-2'].map((id) => getComputedStyle(document.getElementById(id)).backgroundColor)`);
  expect(bgs[0]).not.toBe(bgs[1]);
  await page.screenshot({ path: 'out/e2e/tip-nested-1440.png' });
  // Esc closes the whole stack
  await page.keyboard.press('Escape');
  await expect(nested).toBeHidden();
  await expect(tip).toBeHidden();
  expect(problems).toEqual([]);
});

test('a middle click freezes a tip at once; leaving it closes the stack after a moment (D-477)', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=7');
  await growUp(page);
  await page.mouse.move(700, 300);
  const tip = page.locator('#tooltip');
  const at = await page.locator('.topbar .figure').first().boundingBox();
  if (!at) throw new Error('no money in the header');
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await expect(tip).toBeVisible();
  await page.mouse.down({ button: 'middle' });
  await page.mouse.up({ button: 'middle' });
  await expect(tip).toHaveClass(/locked/);
  await page.mouse.move(700, 600, { steps: 3 });
  await expect(tip).toBeHidden();
  expect(problems).toEqual([]);
});

test('a tip under a still pointer stays while the clock runs', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=7');
  await growUp(page);
  const date = () => page.locator('.clock .date').textContent();
  const before = await date();
  await page.locator('.clock .speed', { hasText: '×5' }).click();
  await page.locator('.clock-toggle').click();
  await page.locator('.topbar .figure').first().hover();
  await expect(page.locator('#tooltip')).toBeVisible();
  // two or more days of the world pass with the pointer still: the tip is still there
  await expect.poll(date, { timeout: 10_000 }).not.toBe(before);
  const moved = await date();
  await expect.poll(date, { timeout: 10_000 }).not.toBe(moved);
  await expect(page.locator('#tooltip')).toBeVisible();
  await expect(page.locator('#tooltip')).toContainText('Crowns in your purse');
  expect(problems).toEqual([]);
});

test('the clock run by the mouse does not swap the tip under a still pointer for the tip of its button', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=7');
  await growUp(page);
  const date = () => page.locator('.clock .date').textContent();
  await page.locator('.clock-toggle').click();
  await page.locator('.clock-toggle').click();
  await page.locator('.clock-toggle').click();
  await page.locator('.sidebar .facts dt[data-tip]').first().hover();
  await expect(page.locator('#tooltip')).toBeVisible();
  const label = await page.locator('#tooltip').textContent();
  const before = await date();
  await expect.poll(date, { timeout: 10_000 }).not.toBe(before);
  const moved = await date();
  await expect.poll(date, { timeout: 10_000 }).not.toBe(moved);
  await expect(page.locator('#tooltip')).toHaveText(label ?? '');
  expect(problems).toEqual([]);
});

test('Escape closes the tip of the focus and it stays closed while the clock runs', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=7');
  await growUp(page);
  const date = () => page.locator('.clock .date').textContent();
  await page.mouse.move(700, 300);
  await page.keyboard.press('Space');
  const tip = page.locator('#tooltip');
  await tabToTip(page);
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  const before = await date();
  await expect.poll(date, { timeout: 10_000 }).not.toBe(before);
  const moved = await date();
  await expect.poll(date, { timeout: 10_000 }).not.toBe(moved);
  await expect(tip, 'the redraw of a day opened the tip again').toBeHidden();
  expect(problems).toEqual([]);
});

test('a tip opened by Tab stays while the clock runs, until Escape', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=7');
  await growUp(page);
  const date = () => page.locator('.clock .date').textContent();
  await page.mouse.move(700, 300);
  await page.keyboard.press('Space');
  // the command that starts living has its own redraw, which moves the focus: wait until the days run
  const first = await date();
  await expect.poll(date, { timeout: 10_000 }).not.toBe(first);
  const tip = page.locator('#tooltip');
  await tabToTip(page);
  const said = await tip.textContent();
  const before = await date();
  await expect.poll(date, { timeout: 10_000 }).not.toBe(before);
  const moved = await date();
  await expect.poll(date, { timeout: 10_000 }).not.toBe(moved);
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText(said ?? '');
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  expect(problems).toEqual([]);
});

test('the focus and its tip stay on a figure whose number changes while the clock runs', async ({ page }) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=7');
  await growUp(page);
  const date = () => page.locator('.clock .date').textContent();
  const money = () => page.locator('.topbar .figure-value').first().textContent();
  await page.mouse.move(700, 300);
  await page.keyboard.press('Space');
  await page.keyboard.press('3');
  const first = await date();
  await expect.poll(date, { timeout: 10_000 }).not.toBe(first);
  const tip = page.locator('#tooltip');
  await tabToTip(page, /Crowns in your purse/);
  await expect(tip).toContainText('Crowns in your purse');
  const sum = await money();
  // the sum changes on the first of a month; the focus and the tip are still on the figure then
  await expect.poll(money, { timeout: 60_000 }).not.toBe(sum);
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Crowns in your purse');
  await expect(page.locator('.figure:focus-within')).toHaveCount(1);
  expect(problems).toEqual([]);
});
