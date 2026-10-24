import { expect, test, type Page } from '@playwright/test';

/** Seeds of the smoke run; fixed so a failure repeats. */
const SEEDS = [1, 7, 42];
const TURNS = 50;

const DATE = '.clock .date';
const HERO = '.avatar .name';
const LATELY = '.lately';
const GAME = '.game';

const shot = (page: Page, seed: number, name: string) => page.screenshot({ path: `out/e2e/seed${String(seed)}-${name}.png`, fullPage: true });

/** The buttons a player can press now: the window over the centre if there is one, else the actions of "where I am". */
async function choices(page: Page) {
  return (await page.locator('.modal-layer').count()) > 0 ? page.locator('.modal-layer .option button.choice') : page.locator('.where .option button.choice');
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
      // round-robin, not random: a failure replays
      await buttons.nth(turn % count).click();
      const moved = await expect.poll(async () => page.locator('#app').innerText(), { timeout: 10_000 }).not.toBe(before).then(() => true, () => false);
      // console errors first: they are the cause when the screen stays put
      expect(problems, `errors after turn ${String(turn)}`).toEqual([]);
      expect(moved, `turn ${String(turn)}: screen did not change after the click`).toBe(true);
      if (turn === Math.floor(TURNS / 2)) await shot(page, seed, '2-middle');
    }

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

test('the screen is in shelves: header, side panel, centre, avatar and date are all there', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=7');
  for (const selector of ['.topbar', '.sidebar.open', '.center .where', '.center .map-slot', '.avatar', '.clock .date', '.clock-button']) {
    await expect(page.locator(selector).first(), selector).toBeVisible();
  }
  // the time player is not there yet: its buttons are off
  await expect(page.locator('.clock-button').first()).toBeDisabled();
  // the profile of the hero is in the panel, numbers in brackets (D-434)
  await expect(page.locator('.sidebar h1')).toBeVisible();
  await expect(page.locator('.sidebar .tab.active')).toHaveText('Profile');
  await expect(page.locator('.sidebar .facts').first()).toContainText(/\(\d+\)/);
  // a scene of the backstory is a window that holds the decision: Escape does not close it, and it names the age
  const modal = page.locator('.modal.event');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.modal-title')).toHaveText(/^Age \d+$/);
  await expect(modal.locator('.modal-close')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();
  // the chance comes as a word and a percent together
  const notes = await modal.locator('.note').allTextContents();
  for (const n of notes) expect(n).toMatch(/^\(.+, \d+%\)$/);
  await page.screenshot({ path: 'out/e2e/layout-1440.png' });
  // tabs of the page, and a page of another kind in the same panel
  // the panel is behind a pinned window until the scenes are answered
  for (let i = 0; i < 30 && (await page.locator('.modal-layer').count()) > 0; i++) await page.locator('.modal-layer .option button.choice').first().click();
  for (const tab of ['Family', 'People', 'Chronicle', 'Profile']) {
    await page.locator('.sidebar .tab', { hasText: tab }).first().click();
    await expect(page.locator('.sidebar .tab.active')).toHaveText(tab);
  }
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
  await expect.poll(async () => page.locator('#app').innerText(), { timeout: 10_000 }).not.toBe(shown);
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

test('a phone: one column, no sideways scroll, the panel slides out of the avatar', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=7');
  await expect(page.locator('.modal.event')).toBeVisible();
  const overflow = () => page.evaluate('document.documentElement.scrollWidth - window.innerWidth') as Promise<number>;
  expect(await overflow(), 'sideways scroll with the window').toBeLessThanOrEqual(0);
  // the header does not lie over the window: the title is below it, and the menu is still reachable
  const top = (selector: string) => page.locator(selector).evaluate((n) => n.getBoundingClientRect().top);
  const bottom = (selector: string) => page.locator(selector).evaluate((n) => n.getBoundingClientRect().bottom);
  expect(await top('.modal-title')).toBeGreaterThanOrEqual(await bottom('.topbar'));
  await expect(page.locator('.modal-title')).toBeInViewport();
  // a link in the text of the window does not slide the panel over it
  const link = page.locator('.modal a').first();
  if ((await link.count()) > 0) {
    await link.click();
    await expect(page.locator('.sidebar.open')).toHaveCount(0);
    await expect(page.locator('.modal-title')).toBeInViewport();
  }
  await page.screenshot({ path: 'out/e2e/layout-390-window.png' });
  // answer the scenes of the backstory, then look at the centre
  for (let i = 0; i < 30 && (await page.locator('.modal-layer').count()) > 0; i++) await page.locator('.modal-layer .option button.choice').first().click();
  await expect(page.locator('.where')).toBeVisible();
  await expect(page.locator('.sidebar.open')).toHaveCount(0);
  expect(await overflow(), 'sideways scroll in the centre').toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'out/e2e/layout-390.png' });
  await page.locator('.avatar-button').click();
  await expect(page.locator('.sidebar.open')).toBeVisible();
  await expect(page.locator('.sidebar .tab.active')).toHaveText('Profile');
  expect(await overflow(), 'sideways scroll with the panel').toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'out/e2e/layout-390-panel.png' });
  // and it can be folded again
  await page.locator('.sidebar-toggle').click();
  await expect(page.locator('.sidebar.open')).toHaveCount(0);
  expect(problems).toEqual([]);
});
