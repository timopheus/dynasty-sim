import { expect, test, type Page } from '@playwright/test';

/** A tip opens after a short rest of the cursor (D-477, `TIP_DELAY_MS` of `src/ui/tooltip.ts`). */
const TIP_WAIT_MS = 1000;

const head = (page: Page) => page.locator('.backstory-screen .backstory-date');
const choice = (page: Page) => page.locator('.modal-layer .option button.choice');

/** Waits for the next scene, the years running by between (D-479), or for the end of the early years. */
async function nextScene(page: Page): Promise<boolean> {
  const screen = page.locator('.backstory-screen');
  await expect.poll(async () => (await screen.count()) === 0 || (await choice(page).count()) > 0, { timeout: 30_000 }).toBe(true);
  return (await screen.count()) > 0;
}

/**
 * The early years on one clock (D-479, T.4, T.5): a screen of their own with the real date and age in the head; the
 * friend of a seven-year-old is a child; the years run between the scenes; the founder goes out at 16 or older.
 * Seed 6 with the first answers meets a friend at seven (checked on the core).
 */
test('the early years run on the clock: a child friend at seven, the years running, out into the world at 16+', async ({ page }) => {
  test.setTimeout(120_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=6');
  const screen = page.locator('.backstory-screen');
  await expect(screen).toBeVisible();
  // nothing of the game: no side panel with the grown hero, no map, no actions, no clock
  for (const part of ['.sidebar', '.map-view', '.actions-panel', '.clock:not(.backstory-screen)', '.topbar', '.avatar']) await expect(page.locator(part)).toHaveCount(0);
  expect(await nextScene(page)).toBe(true);
  await expect(head(page)).toHaveText('1700 · you are 0');
  await page.screenshot({ path: 'out/e2e/backstory-1-1440.png' });
  // the menu still offers a new game
  await screen.locator('.menu-button').click();
  await expect(screen.locator('.menu-list')).toContainText('New game');
  await screen.locator('.menu-button').click();

  const heads: string[] = [];
  let ranBetween = false;
  let friendAge: number | null = null;
  for (let i = 0; i < 12 && (await nextScene(page)); i++) {
    const at = (await head(page).innerText()).trim();
    heads.push(at);
    if (at === '1707 · you are 7') {
      // the friend of the next yard: the tip of the name gives a child's age
      const friend = page.locator('.modal-layer .event-text a.person[data-person]').first();
      if ((await friend.count()) > 0) {
        await friend.hover();
        await page.waitForTimeout(TIP_WAIT_MS);
        const tip = page.locator('#tooltip');
        await expect(tip).toBeVisible();
        friendAge = Number(/aged (\d+)/.exec(await tip.innerText())?.[1] ?? NaN);
        await page.screenshot({ path: 'out/e2e/backstory-2-friend-1440.png' });
        await page.mouse.move(10, 10);
      }
    }
    await choice(page).first().click();
    // the years run with no scene up, or the early years are over
    const running = page.locator('.backstory-screen.running');
    await expect.poll(async () => (await running.count()) > 0 || (await screen.count()) === 0, { timeout: 10_000 }).toBe(true);
    if ((await running.count()) > 0) ranBetween = true;
  }
  expect(heads[0]).toBe('1700 · you are 0');
  expect(heads[1]).toBe('1707 · you are 7');
  expect(heads).toContain('1712 · you are 12');
  expect(friendAge).not.toBeNull();
  expect(friendAge!).toBeGreaterThanOrEqual(4);
  expect(friendAge!).toBeLessThanOrEqual(10);
  expect(ranBetween).toBe(true);
  // the dates of the scenes never fall
  const years = heads.map((h) => Number(h.slice(0, 4)));
  expect(years).toEqual([...years].sort((a, b) => a - b));

  // out into the world: the game opens, the chronicle tells the real date of going out
  await expect(screen).toHaveCount(0);
  await expect(page.locator('.sidebar')).toHaveCount(1);
  await expect(page.locator('.map-view')).toHaveCount(1);
  await expect(page.locator('.modal-layer')).toHaveCount(0);
  await expect(page.locator('body')).toContainText(/went out into the world/);
  await expect(page.locator('body')).toContainText(/17(1[6-9]|2[01])/);
  await page.screenshot({ path: 'out/e2e/backstory-3-out-1440.png' });
  expect(problems).toEqual([]);
});
