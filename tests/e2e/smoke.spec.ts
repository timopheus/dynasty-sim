import { expect, test, type Page } from '@playwright/test';

/** Seeds of the smoke run; fixed so a failure repeats. */
const SEEDS = [1, 7, 42];
const TURNS = 50;

const OPTIONS = '#app .option button.choice';
const DATE = '#app .meta.bar span';
const HERO = '#app section.hero h2';
const CHRONICLE = '#app ul.chronicle';

const shot = (page: Page, seed: number, name: string) => page.screenshot({ path: `out/e2e/seed${String(seed)}-${name}.png`, fullPage: true });

/** What a player sees: date line, hero name and the text of the chronicle. */
async function snapshot(page: Page): Promise<{ date: string; hero: string; chronicle: string }> {
  return {
    date: (await page.locator(DATE).first().textContent()) ?? '',
    hero: (await page.locator(HERO).first().textContent()) ?? '',
    chronicle: (await page.locator(CHRONICLE).textContent()) ?? '',
  };
}

for (const seed of SEEDS) {
  test(`seed ${String(seed)}: plays ${String(TURNS)} turns and continues after a reload`, async ({ page }) => {
    const problems: string[] = [];
    // The page has no favicon yet: the browser's own request for it is not the game's error.
    page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) problems.push(`console.error: ${m.text()} ${m.location().url}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    // A confirm() on a fresh profile means the game asks something it must not; refuse it and fail below.
    page.on('dialog', (d) => { problems.push(`unexpected dialog: ${d.message()}`); void d.dismiss(); });

    await page.goto(`/?seed=${String(seed)}`);
    await expect(page.locator(DATE).first()).toContainText(`seed ${String(seed)}`);
    const start = await snapshot(page);
    await shot(page, seed, '1-start');

    for (let turn = 0; turn < TURNS; turn++) {
      const buttons = page.locator(OPTIONS);
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

    await page.reload();
    await expect(page.locator(DATE).first()).toBeVisible();
    const after = await snapshot(page);
    await shot(page, seed, '4-reload');
    expect(after.hero, 'another hero after reload').toBe(end.hero);
    expect(after.date, 'another date after reload').toBe(end.date);
    expect(problems).toEqual([]);
  });
}
