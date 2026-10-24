import { expect, test, type Page } from '@playwright/test';

/** Seeds of the smoke run; fixed so a failure repeats. */
const SEEDS = [1, 7, 42];
const TURNS = 50;

const DATE = '.clock .date';
const HERO = '.avatar .name';
const LATELY = '.sidebar .chronicle';
const GAME = '.game';

const shot = (page: Page, seed: number, name: string) => page.screenshot({ path: `out/e2e/seed${String(seed)}-${name}.png`, fullPage: true });

/** The buttons a player can press now: the window over the centre if there is one, else the actions panel at the right. */
async function choices(page: Page) {
  return (await page.locator('.modal-layer').count()) > 0 ? page.locator('.modal-layer .option button.choice') : page.locator('.actions-panel button.action:not(.grey)');
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

/** What a player sees: the date, the hero's caption and the latest lines of the chronicle. */
async function snapshot(page: Page): Promise<{ date: string; hero: string; chronicle: string }> {
  return {
    date: (await page.locator(DATE).first().textContent()) ?? '',
    hero: (await page.locator(HERO).first().textContent()) ?? '',
    chronicle: (await page.locator(LATELY).textContent()) ?? '',
  };
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

    await standStill(page);
    const end = await snapshot(page);
    await shot(page, seed, '3-end');
    expect(end.date, 'game date did not move').not.toBe(start.date);
    expect(end.chronicle, 'chronicle did not grow').not.toBe(start.chronicle);

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

/** Answers the scenes of the backstory, so the panel and the centre are free. */
async function growUp(page: Page): Promise<void> {
  for (let i = 0; i < 30 && (await page.locator('.modal-layer').count()) > 0; i++) await page.locator('.modal-layer .option button.choice').first().click();
  await expect(page.locator('.modal-layer')).toHaveCount(0);
  // the answer sets the clock going (S.8): stand still, so the screen does not change under the test
  await standStill(page);
}

for (const size of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  test(`the screen is in shelves, with no empty space in the centre at ${String(size.width)}×${String(size.height)}`, async ({ page }) => {
    const problems = watch(page);
    await page.setViewportSize(size);
    await page.goto('/?seed=7');
    for (const selector of ['.topbar', '.sidebar.open', '.center .where', '.center .map-slot', '.avatar', '.clock .date', '.actions-panel']) {
      await expect(page.locator(selector).first(), selector).toBeVisible();
    }
    // the time player (S.8): during the backstory the clock stands, the speeds are there
    await expect(page.locator('.clock')).toHaveClass(/\bdecision\b/);
    await expect(page.locator('.clock .speed')).toHaveText(['×1', '×2', '×5']);
    // the profile of the hero is one sheet in the panel, numbers in brackets (D-434, D-448)
    await expect(page.locator('.sidebar h1')).toBeVisible();
    await expect(page.locator('.sidebar .sheet .facts').first()).toContainText(/\(\d+\)/);
    await expect(page.locator('.sidebar .tabs .tab.active')).toHaveText('Person');
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
    // the actions are on shelves, with their information inside the button and no digit before the name
    await expect(page.locator('.actions-panel .shelf h2').first()).toHaveText('Livelihood');
    const first = page.locator('.actions-panel button.action').first();
    await expect(first).toContainText(/\d+(–\d+)? days/);
    for (const name of await page.locator('.actions-panel .action-name').allTextContents()) expect(name).not.toMatch(/^\d/);
    // no empty space in the centre: the map fills what the block "where I am" leaves, the block ends at the bottom
    const box = (selector: string) => page.locator(selector).first().evaluate((n) => {
      const r = n.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    });
    const centre = await box('.center');
    const map = await box('.map-slot');
    const where = await box('.where');
    expect(map.top - centre.top, 'map starts at the top of the centre').toBeLessThan(40);
    expect(where.top - map.bottom, 'no gap between the map and the block').toBeLessThan(24);
    expect(centre.bottom - where.bottom, 'the block ends at the bottom of the centre').toBeLessThan(24);
    expect(map.bottom - map.top, 'the map is the largest thing of the centre').toBeGreaterThan(where.bottom - where.top);
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
  // by hover: a figure of the header, an action, a name
  await page.locator('.topbar .figure').first().hover();
  await expect(tip).toBeVisible();
  await page.locator('.actions-panel button.action').first().hover();
  await expect(tip).toBeVisible();
  await page.locator('.sidebar a.person[data-person]').first().hover();
  await expect(tip).toContainText(/Your|acquaintance|stranger/);
  await page.screenshot({ path: 'out/e2e/tooltip-1440.png' });
  // by focus alone: a stat of the sheet, a trait, an action button
  await page.locator('.sidebar .facts dt[data-tip]').first().focus();
  await expect(tip).toBeVisible();
  await page.locator('.actions-panel button.action').first().focus();
  await expect(tip).toBeVisible();
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
